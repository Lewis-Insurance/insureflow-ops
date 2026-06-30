/**
 * Context Indexer Edge Function
 * 
 * Background service for indexing client content into pgvector embeddings.
 * Supports:
 * - Processing pending index jobs
 * - Incremental updates via content hashing
 * - Chunking large documents
 * - Source-specific content extraction
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { verifyAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

// Chunking configuration
const MAX_CHUNK_CHARS = 2000;
const CHUNK_OVERLAP = 200;

// Batch processing limits
const BATCH_SIZE = 10;
const MAX_PROCESSING_TIME_MS = 25000; // Leave buffer for edge function timeout

// =============================================================================
// TYPES
// =============================================================================

interface IndexJob {
  id: string;
  account_id: string;
  source_type: string;
  source_id: string;
  priority: number;
  attempts: number;
  max_attempts: number;
}

interface ContentChunk {
  content: string;
  chunk_index: number;
  chunk_total: number;
  source_label: string;
  metadata: {
    timestamp?: string;
    snippet?: string;
    deep_link?: string;
  };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Require cron secret for scheduled/worker execution
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (!expectedSecret) {
      console.error('CRON_SECRET not configured - rejecting request');
      return new Response(
        JSON.stringify({ error: 'Cron authentication not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!cronSecret || cronSecret !== expectedSecret) {
      console.error('Unauthorized: Invalid or missing CRON_SECRET');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    const path = url.pathname;

    // ==========================================================================
    // POST /process-jobs - Process pending index jobs
    // ==========================================================================
    if (req.method === 'POST' && path.endsWith('/process-jobs')) {
      const startTime = Date.now();
      const results = {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        errors: [] as string[],
      };

      // Fetch pending jobs
      const { data: jobs, error: fetchError } = await supabase
        .from('client_context_index_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchError) {
        throw new Error(`Failed to fetch jobs: ${fetchError.message}`);
      }

      for (const job of jobs || []) {
        // Check time limit
        if (Date.now() - startTime > MAX_PROCESSING_TIME_MS) {
          break;
        }

        try {
          await processJob(supabase, job, OPENAI_API_KEY);
          results.succeeded++;
        } catch (error) {
          results.failed++;
          results.errors.push(`${job.id}: ${error instanceof Error ? error.message : String(error)}`);
          
          // Update job with error
          await supabase
            .from('client_context_index_jobs')
            .update({
              status: job.attempts + 1 >= job.max_attempts ? 'failed' : 'pending',
              attempts: job.attempts + 1,
              error_message: error instanceof Error ? error.message : String(error),
            })
            .eq('id', job.id);
        }
        results.processed++;
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================================================
    // POST /index-account/:accountId - Index all content for an account
    // ==========================================================================
    if (req.method === 'POST' && path.includes('/index-account/')) {
      const accountId = path.split('/index-account/')[1]?.split('/')[0];
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ error: 'Account ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Queue indexing jobs for all source types
      const sourceTypes = ['note', 'document', 'task', 'call', 'sms', 'event'];
      const queued = await queueAccountIndexing(supabase, accountId, sourceTypes);

      return new Response(JSON.stringify({ 
        message: 'Indexing jobs queued',
        jobs_queued: queued,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================================================
    // POST /index-source - Index a specific source
    // ==========================================================================
    if (req.method === 'POST' && path.endsWith('/index-source')) {
      const { account_id, source_type, source_id } = await req.json();

      if (!account_id || !source_type || !source_id) {
        return new Response(
          JSON.stringify({ error: 'account_id, source_type, and source_id required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const job: IndexJob = {
        id: crypto.randomUUID(),
        account_id,
        source_type,
        source_id,
        priority: 10, // High priority for direct requests
        attempts: 0,
        max_attempts: 1,
      };

      await processJob(supabase, job, OPENAI_API_KEY);

      return new Response(JSON.stringify({ 
        message: 'Source indexed successfully',
        source_type,
        source_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================================================
    // DELETE /embeddings/:accountId - Clear embeddings for an account
    // ==========================================================================
    if (req.method === 'DELETE' && path.includes('/embeddings/')) {
      const accountId = path.split('/embeddings/')[1]?.split('/')[0];
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ error: 'Account ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { count } = await supabase
        .from('client_context_embeddings')
        .delete()
        .eq('account_id', accountId);

      return new Response(JSON.stringify({ 
        message: 'Embeddings cleared',
        deleted_count: count,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Context Indexer error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =============================================================================
// JOB PROCESSING
// =============================================================================

async function processJob(
  supabase: any,
  job: IndexJob,
  openaiKey: string
): Promise<void> {
  // Mark job as processing
  await supabase
    .from('client_context_index_jobs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', job.id);

  try {
    // Extract content chunks from source
    const chunks = await extractContent(supabase, job);

    if (chunks.length === 0) {
      // Nothing to index - mark as skipped
      await supabase
        .from('client_context_index_jobs')
        .update({ status: 'skipped', completed_at: new Date().toISOString() })
        .eq('id', job.id);
      return;
    }

    // Generate embeddings and store
    for (const chunk of chunks) {
      const contentHash = await hashContent(chunk.content);

      // Check if unchanged
      const { data: existing } = await supabase
        .from('client_context_embeddings')
        .select('id, content_hash')
        .eq('account_id', job.account_id)
        .eq('source_type', job.source_type)
        .eq('source_id', job.source_id)
        .eq('chunk_index', chunk.chunk_index)
        .single();

      if (existing?.content_hash === contentHash) {
        // Content unchanged - skip embedding generation
        continue;
      }

      // Generate embedding
      const embedding = await generateEmbedding(chunk.content, openaiKey);

      // Upsert embedding
      await supabase
        .from('client_context_embeddings')
        .upsert({
          account_id: job.account_id,
          source_type: job.source_type,
          source_id: job.source_id,
          source_label: chunk.source_label,
          content: chunk.content,
          content_hash: contentHash,
          chunk_index: chunk.chunk_index,
          chunk_total: chunk.chunk_total,
          embedding,
          metadata: chunk.metadata,
          updated_at: new Date().toISOString(),
          indexed_at: new Date().toISOString(),
        }, { onConflict: 'account_id,source_type,source_id,chunk_index' });
    }

    // Mark job as completed
    await supabase
      .from('client_context_index_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', job.id);

  } catch (error) {
    // Re-throw to be handled by caller
    throw error;
  }
}

// =============================================================================
// CONTENT EXTRACTION
// =============================================================================

async function extractContent(
  supabase: any,
  job: IndexJob
): Promise<ContentChunk[]> {
  switch (job.source_type) {
    case 'note':
      return await extractNoteContent(supabase, job);
    case 'document':
      return await extractDocumentContent(supabase, job);
    case 'task':
      return await extractTaskContent(supabase, job);
    case 'call':
      return await extractCallContent(supabase, job);
    case 'sms':
      return await extractSmsContent(supabase, job);
    case 'event':
      return await extractEventContent(supabase, job);
    default:
      console.warn(`Unknown source type: ${job.source_type}`);
      return [];
  }
}

async function extractNoteContent(supabase: any, job: IndexJob): Promise<ContentChunk[]> {
  // Note: Adjust table/column names based on your schema
  const { data: note } = await supabase
    .from('notes')
    .select('*')
    .eq('id', job.source_id)
    .single();

  if (!note || !note.content) return [];

  return chunkText(
    note.content,
    `Note: ${note.title || 'Untitled'}`,
    {
      timestamp: note.created_at,
      snippet: note.content.substring(0, 100),
      deep_link: `/accounts/${job.account_id}#notes`,
    }
  );
}

async function extractDocumentContent(supabase: any, job: IndexJob): Promise<ContentChunk[]> {
  const { data: doc } = await supabase
    .from('documents')
    .select('*')
    .eq('id', job.source_id)
    .single();

  if (!doc || !doc.extracted_text) return [];

  return chunkText(
    doc.extracted_text,
    `Document: ${doc.file_name || 'Unnamed'}`,
    {
      timestamp: doc.created_at,
      snippet: doc.extracted_text.substring(0, 100),
      deep_link: `/accounts/${job.account_id}/documents/${job.source_id}`,
    }
  );
}

async function extractTaskContent(supabase: any, job: IndexJob): Promise<ContentChunk[]> {
  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', job.source_id)
    .single();

  if (!task) return [];

  const content = [
    `Task: ${task.title}`,
    task.description || '',
    `Status: ${task.status}`,
    task.due_date ? `Due: ${task.due_date}` : '',
  ].filter(Boolean).join('\n');

  return [{
    content,
    chunk_index: 0,
    chunk_total: 1,
    source_label: `Task: ${task.title}`,
    metadata: {
      timestamp: task.created_at,
      snippet: task.title,
      deep_link: `/tasks/${job.source_id}`,
    },
  }];
}

async function extractCallContent(supabase: any, job: IndexJob): Promise<ContentChunk[]> {
  const { data: call } = await supabase
    .from('call_sessions')
    .select('*')
    .eq('id', job.source_id)
    .single();

  if (!call || !call.notes) return [];

  const content = [
    `Call on ${call.started_at}`,
    `Duration: ${call.duration ? `${call.duration} seconds` : 'Unknown'}`,
    `Direction: ${call.direction || 'Unknown'}`,
    call.notes,
  ].join('\n');

  return [{
    content,
    chunk_index: 0,
    chunk_total: 1,
    source_label: `Call: ${new Date(call.started_at).toLocaleDateString()}`,
    metadata: {
      timestamp: call.started_at,
      snippet: call.notes?.substring(0, 100),
      deep_link: `/accounts/${job.account_id}#calls`,
    },
  }];
}

async function extractSmsContent(supabase: any, job: IndexJob): Promise<ContentChunk[]> {
  const { data: sms } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('id', job.source_id)
    .single();

  if (!sms || !sms.body) return [];

  return [{
    content: `SMS (${sms.direction}): ${sms.body}`,
    chunk_index: 0,
    chunk_total: 1,
    source_label: `SMS: ${new Date(sms.created_at).toLocaleDateString()}`,
    metadata: {
      timestamp: sms.created_at,
      snippet: sms.body?.substring(0, 100),
      deep_link: `/accounts/${job.account_id}#messages`,
    },
  }];
}

async function extractEventContent(supabase: any, job: IndexJob): Promise<ContentChunk[]> {
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', job.source_id)
    .single();

  if (!event) return [];

  const content = [
    `Event: ${event.title || event.event_type}`,
    event.description || '',
    `Date: ${event.occurred_at}`,
  ].filter(Boolean).join('\n');

  if (!content.trim()) return [];

  return [{
    content,
    chunk_index: 0,
    chunk_total: 1,
    source_label: `Event: ${event.title || event.event_type}`,
    metadata: {
      timestamp: event.occurred_at,
      snippet: event.description?.substring(0, 100),
      deep_link: `/accounts/${job.account_id}#events`,
    },
  }];
}

// =============================================================================
// UTILITIES
// =============================================================================

function chunkText(
  text: string,
  sourceLabel: string,
  metadata: ContentChunk['metadata']
): ContentChunk[] {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [{
      content: text,
      chunk_index: 0,
      chunk_total: 1,
      source_label: sourceLabel,
      metadata,
    }];
  }

  const chunks: ContentChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + MAX_CHUNK_CHARS, text.length);
    chunks.push({
      content: text.substring(start, end),
      chunk_index: chunkIndex,
      chunk_total: 0, // Will be updated after
      source_label: `${sourceLabel} (part ${chunkIndex + 1})`,
      metadata: {
        ...metadata,
        snippet: text.substring(start, start + 100),
      },
    });
    start = end - CHUNK_OVERLAP;
    chunkIndex++;
  }

  // Update chunk_total
  for (const chunk of chunks) {
    chunk.chunk_total = chunks.length;
  }

  return chunks;
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await modelBoundaryFetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function queueAccountIndexing(
  supabase: any,
  accountId: string,
  sourceTypes: string[]
): Promise<number> {
  let totalQueued = 0;

  for (const sourceType of sourceTypes) {
    let tableName: string;
    let accountField = 'account_id';

    switch (sourceType) {
      case 'note':
        tableName = 'notes';
        break;
      case 'document':
        tableName = 'documents';
        break;
      case 'task':
        tableName = 'tasks';
        accountField = 'entity_id';
        break;
      case 'call':
        tableName = 'call_sessions';
        break;
      case 'sms':
        tableName = 'sms_messages';
        break;
      case 'event':
        tableName = 'events';
        accountField = 'entity_id';
        break;
      default:
        continue;
    }

    try {
      // Fetch source IDs
      let query = supabase.from(tableName).select('id');
      
      if (sourceType === 'task' || sourceType === 'event') {
        query = query.eq('entity_type', 'account').eq(accountField, accountId);
      } else {
        query = query.eq(accountField, accountId);
      }

      const { data: sources } = await query;

      // Queue jobs
      for (const source of sources || []) {
        await supabase.rpc('queue_context_index_job', {
          p_account_id: accountId,
          p_source_type: sourceType,
          p_source_id: source.id,
          p_priority: 1,
        });
        totalQueued++;
      }
    } catch (error) {
      console.warn(`Failed to queue ${sourceType} indexing:`, error);
    }
  }

  return totalQueued;
}

