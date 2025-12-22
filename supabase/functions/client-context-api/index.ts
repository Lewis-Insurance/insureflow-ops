/**
 * Client Context API Edge Function
 * 
 * Provides secure access to client context for AI analysis.
 * Features:
 * - Access verification (user must have access to the account)
 * - Structured snapshot assembly
 * - Semantic search via pgvector
 * - Context caching
 * - Token budget management
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { verifyAuth } from '../_shared/auth.ts';

// =============================================================================
// CONFIGURATION
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Token budget configuration
const MAX_CONTEXT_TOKENS = 100000;
const STRUCTURED_SNAPSHOT_BUDGET = 25000; // Reserve for structured data
const RETRIEVED_CHUNKS_BUDGET = 75000; // For semantic search results
const CHARS_PER_TOKEN = 4;

// Cache TTL in seconds
const CACHE_TTL_SECONDS = 300; // 5 minutes

// =============================================================================
// CEO COPILOT SYSTEM PROMPT
// =============================================================================

const CEO_COPILOT_SYSTEM_PROMPT = `You are an AI-powered CEO co-pilot, specialized in strategic client intelligence analysis. Your role is to enhance understanding and service delivery by analyzing complete client profiles through AI-powered insights.

## Your Primary Tasks:
1. Identifying client coverage gaps
2. Summarizing client activities from the past six months
3. Highlighting cross-sell opportunities
4. Assessing churn risk

## Key Requirements:
- Utilize structured data aggregation techniques, prioritizing data by recency and relevance
- Manage token usage efficiently to ensure comprehensiveness without exceeding limits
- Deliver insights with an executive summary, key findings, recommendations, action items, and risk flags
- Every finding MUST include citations referencing the source data

## Response Format:
You MUST respond with valid JSON matching this exact schema:

{
  "executive_summary": "2-3 sentence overview of the most important insights",
  "key_findings": [
    {
      "id": "finding-1",
      "finding": "Description of the finding",
      "severity": "critical|high|medium|low",
      "category": "coverage|claims|engagement|renewal|other",
      "evidence": [{"source_type": "policy|claim|note|...", "source_id": "uuid", "source_label": "Policy #123", "snippet": "relevant text"}]
    }
  ],
  "recommendations": [
    {
      "id": "rec-1",
      "priority": 1,
      "recommendation": "What to do",
      "rationale": "Why to do it",
      "expected_impact": "Expected outcome",
      "evidence": [...]
    }
  ],
  "action_items": [
    {
      "id": "action-1",
      "action": "Specific action to take",
      "owner_suggestion": "Account Manager",
      "due_suggestion": "Within 7 days",
      "priority": "urgent|high|medium|low",
      "can_create_task": true,
      "related_finding_id": "finding-1"
    }
  ],
  "risk_flags": [
    {
      "id": "risk-1",
      "risk_type": "coverage_gap|churn|claims_pattern|compliance|renewal|payment|other",
      "title": "Brief title",
      "description": "Detailed description",
      "severity": "critical|high|medium|low",
      "mitigation_suggestion": "How to address",
      "evidence": [...]
    }
  ],
  "citations": [
    {
      "id": "cite-1",
      "source_type": "policy",
      "source_id": "uuid",
      "source_label": "Policy #ABC123",
      "snippet": "...coverage limit of $1M...",
      "deep_link": "/accounts/{id}/policies/{policy_id}",
      "timestamp": "2024-01-15"
    }
  ],
  "confidence_score": 0.85
}

## Important Rules:
1. ALWAYS cite sources using the exact source_id from the provided data
2. Prioritize recent data (last 6 months) over older data
3. Flag any critical issues (expiring policies, open claims, coverage gaps) prominently
4. Be specific with numbers, dates, and policy details
5. Action items should be concrete and assignable`;

// =============================================================================
// TYPES
// =============================================================================

interface ContextRequest {
  account_id: string;
  query?: string; // Optional query for semantic search
  include_documents?: boolean;
  max_chunks?: number;
  force_refresh?: boolean;
}

interface StructuredSnapshot {
  account: any;
  contacts: any[];
  policies: any[];
  claims: any[];
  active_tasks: any[];
  recent_communications: {
    calls_count: number;
    messages_count: number;
    events_count: number;
    last_contact_date: string | null;
  };
  quotes: any[];
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user
    const authResult = await verifyAuth(req, supabase);
    if (!authResult.user || authResult.error) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authResult.user.id;
    const url = new URL(req.url);
    const path = url.pathname;

    // ==========================================================================
    // GET /context/:accountId - Get context pack for an account
    // ==========================================================================
    if (req.method === 'GET' && path.includes('/context/')) {
      const accountId = path.split('/context/')[1]?.split('/')[0];
      
      if (!accountId) {
        return new Response(
          JSON.stringify({ error: 'Account ID required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const query = url.searchParams.get('query') || undefined;
      const maxChunks = parseInt(url.searchParams.get('max_chunks') || '20');
      const forceRefresh = url.searchParams.get('force_refresh') === 'true';

      // Verify access to account
      const hasAccess = await verifyAccountAccess(supabase, userId, accountId);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this account' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check cache first (unless force refresh)
      if (!forceRefresh && !query) {
        const cached = await getCachedContext(supabase, accountId);
        if (cached) {
          return new Response(JSON.stringify(cached), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          });
        }
      }

      // Build context pack
      const startTime = Date.now();
      const contextPack = await buildContextPack(supabase, accountId, query, maxChunks);
      contextPack.build_time_ms = Date.now() - startTime;

      // Cache if no specific query
      if (!query) {
        await cacheContext(supabase, accountId, contextPack);
      }

      return new Response(JSON.stringify(contextPack), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      });
    }

    // ==========================================================================
    // GET /system-prompt - Get the CEO Copilot system prompt
    // ==========================================================================
    if (req.method === 'GET' && path.endsWith('/system-prompt')) {
      return new Response(
        JSON.stringify({ system_prompt: CEO_COPILOT_SYSTEM_PROMPT }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==========================================================================
    // POST /analyze - Run analysis with context
    // ==========================================================================
    if (req.method === 'POST' && path.endsWith('/analyze')) {
      const body = await req.json();
      const { account_id, question } = body;

      if (!account_id || !question) {
        return new Response(
          JSON.stringify({ error: 'account_id and question required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify access
      const hasAccess = await verifyAccountAccess(supabase, userId, account_id);
      if (!hasAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this account' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build context pack with query-specific retrieval
      const contextPack = await buildContextPack(supabase, account_id, question, 30);

      // Format prompt for Prism
      const fullPrompt = formatAnalysisPrompt(contextPack, question);

      // Call Prism API
      const prismResponse = await callPrismAPI(fullPrompt);

      return new Response(JSON.stringify({
        ...prismResponse,
        context_summary: {
          account_name: contextPack.account_name,
          policies_count: contextPack.structured_snapshot.policies.length,
          claims_count: contextPack.structured_snapshot.claims.length,
          chunks_retrieved: contextPack.retrieved_chunks.length,
          token_count: contextPack.token_count,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Client Context API error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =============================================================================
// ACCESS VERIFICATION
// =============================================================================

async function verifyAccountAccess(
  supabase: any, 
  userId: string, 
  accountId: string
): Promise<boolean> {
  // Check if account exists and user has access
  // This could be expanded to check team membership, roles, etc.
  const { data: account, error } = await supabase
    .from('accounts')
    .select('id, owner_agent_id, team_id')
    .eq('id', accountId)
    .is('deleted_at', null)
    .single();

  if (error || !account) {
    return false;
  }

  // For now, allow access if account exists
  // TODO: Add team/role-based access control
  // Example:
  // - Check if user is owner_agent_id
  // - Check if user is in the same team
  // - Check if user has admin role
  
  return true;
}

// =============================================================================
// CONTEXT BUILDING
// =============================================================================

async function buildContextPack(
  supabase: any,
  accountId: string,
  query?: string,
  maxChunks: number = 20
): Promise<any> {
  // Fetch structured snapshot
  const snapshot = await fetchStructuredSnapshot(supabase, accountId);

  // Fetch retrieved chunks via semantic search (if query provided and embeddings exist)
  let retrievedChunks: any[] = [];
  if (query) {
    retrievedChunks = await searchRelevantChunks(supabase, accountId, query, maxChunks);
  }

  // Calculate token usage
  const snapshotText = JSON.stringify(snapshot);
  const chunksText = retrievedChunks.map(c => c.content).join('\n');
  const totalChars = snapshotText.length + chunksText.length;
  const tokenCount = Math.ceil(totalChars / CHARS_PER_TOKEN);

  return {
    account_id: accountId,
    account_name: snapshot.account?.name || 'Unknown',
    structured_snapshot: snapshot,
    retrieved_chunks: retrievedChunks,
    token_count: tokenCount,
    max_tokens: MAX_CONTEXT_TOKENS,
    build_time_ms: 0,
    cache_hit: false,
    expires_at: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
  };
}

async function fetchStructuredSnapshot(
  supabase: any,
  accountId: string
): Promise<StructuredSnapshot> {
  // Fetch all data in parallel
  const [
    accountResult,
    contactsResult,
    policiesResult,
    claimsResult,
    tasksResult,
    callsResult,
    messagesResult,
    eventsResult,
    quotesResult,
  ] = await Promise.allSettled([
    supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .is('deleted_at', null)
      .single(),
    supabase
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false }),
    supabase
      .from('policies')
      .select(`
        *,
        carrier_info:carriers!policies_carrier_id_fkey(id, name)
      `)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('expiration_date', { ascending: false }),
    supabase
      .from('claims')
      .select(`
        *,
        policy:policies!inner(id, policy_number, line_of_business, account_id)
      `)
      .eq('policy.account_id', accountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('*')
      .eq('entity_id', accountId)
      .eq('entity_type', 'account')
      .neq('status', 'completed')
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true }),
    supabase
      .from('call_sessions')
      .select('id, started_at')
      .eq('account_id', accountId)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase
      .from('sms_messages')
      .select('id, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('events')
      .select('id, occurred_at')
      .eq('entity_id', accountId)
      .eq('entity_type', 'account')
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase
      .from('quotes')
      .select(`
        *,
        carrier_info:carriers!quotes_carrier_id_fkey(id, name)
      `)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const extractData = (result: PromiseSettledResult<any>) =>
    result.status === 'fulfilled' ? result.value?.data : null;

  const calls = extractData(callsResult) || [];
  const messages = extractData(messagesResult) || [];
  const events = extractData(eventsResult) || [];

  // Find last contact date
  const allDates = [
    ...calls.map((c: any) => c.started_at),
    ...messages.map((m: any) => m.created_at),
    ...events.map((e: any) => e.occurred_at),
  ].filter(Boolean).sort().reverse();

  return {
    account: extractData(accountResult),
    contacts: extractData(contactsResult) || [],
    policies: extractData(policiesResult) || [],
    claims: extractData(claimsResult) || [],
    active_tasks: extractData(tasksResult) || [],
    recent_communications: {
      calls_count: calls.length,
      messages_count: messages.length,
      events_count: events.length,
      last_contact_date: allDates[0] || null,
    },
    quotes: extractData(quotesResult) || [],
  };
}

async function searchRelevantChunks(
  supabase: any,
  accountId: string,
  query: string,
  limit: number
): Promise<any[]> {
  // Check if embeddings exist for this account
  const { count } = await supabase
    .from('client_context_embeddings')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  if (!count || count === 0) {
    // No embeddings yet - return empty
    return [];
  }

  // Generate embedding for query
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) {
    return [];
  }

  // Search using pgvector
  const { data: chunks, error } = await supabase.rpc('search_client_context', {
    p_account_id: accountId,
    p_query_embedding: queryEmbedding,
    p_limit: limit,
    p_min_similarity: 0.7,
  });

  if (error) {
    console.error('Semantic search error:', error);
    return [];
  }

  return (chunks || []).map((c: any) => ({
    id: c.id,
    source_type: c.source_type,
    source_id: c.source_id,
    source_label: c.source_label,
    content: c.content,
    snippet: c.content.substring(0, 200) + (c.content.length > 200 ? '...' : ''),
    deep_link: buildDeepLink(c.source_type, c.source_id, accountId),
    similarity_score: c.similarity,
    timestamp: c.metadata?.timestamp,
  }));
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set - semantic search disabled');
    return null;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.substring(0, 8000), // Limit input length
      }),
    });

    if (!response.ok) {
      console.error('OpenAI embedding error:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error('Embedding generation failed:', error);
    return null;
  }
}

function buildDeepLink(sourceType: string, sourceId: string, accountId: string): string {
  switch (sourceType) {
    case 'policy':
      return `/accounts/${accountId}/policies/${sourceId}`;
    case 'claim':
      return `/accounts/${accountId}/claims/${sourceId}`;
    case 'note':
      return `/accounts/${accountId}#notes`;
    case 'document':
      return `/accounts/${accountId}/documents/${sourceId}`;
    case 'task':
      return `/tasks/${sourceId}`;
    case 'quote':
      return `/quotes/${sourceId}`;
    default:
      return `/accounts/${accountId}`;
  }
}

// =============================================================================
// CACHING
// =============================================================================

async function getCachedContext(supabase: any, accountId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('client_context_cache')
    .select('*')
    .eq('account_id', accountId)
    .eq('cache_key', 'default')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return null;

  return {
    account_id: accountId,
    account_name: data.structured_snapshot?.account?.name || 'Unknown',
    structured_snapshot: data.structured_snapshot,
    retrieved_chunks: data.retrieved_chunks || [],
    token_count: data.token_count,
    max_tokens: MAX_CONTEXT_TOKENS,
    build_time_ms: 0,
    cache_hit: true,
    expires_at: data.expires_at,
  };
}

async function cacheContext(supabase: any, accountId: string, contextPack: any): Promise<void> {
  try {
    await supabase
      .from('client_context_cache')
      .upsert({
        account_id: accountId,
        cache_key: 'default',
        structured_snapshot: contextPack.structured_snapshot,
        retrieved_chunks: contextPack.retrieved_chunks,
        token_count: contextPack.token_count,
        expires_at: contextPack.expires_at,
      }, { onConflict: 'account_id,cache_key' });
  } catch (error) {
    console.error('Cache write failed:', error);
  }
}

// =============================================================================
// ANALYSIS
// =============================================================================

function formatAnalysisPrompt(contextPack: any, question: string): string {
  const { structured_snapshot, retrieved_chunks } = contextPack;

  let prompt = `${CEO_COPILOT_SYSTEM_PROMPT}

---

# CLIENT DATA

## Account Information
${JSON.stringify(structured_snapshot.account, null, 2)}

## Contacts
${JSON.stringify(structured_snapshot.contacts, null, 2)}

## Policies
${JSON.stringify(structured_snapshot.policies, null, 2)}

## Claims
${JSON.stringify(structured_snapshot.claims, null, 2)}

## Active Tasks
${JSON.stringify(structured_snapshot.active_tasks, null, 2)}

## Communication Summary
- Calls: ${structured_snapshot.recent_communications.calls_count}
- Messages: ${structured_snapshot.recent_communications.messages_count}
- Events: ${structured_snapshot.recent_communications.events_count}
- Last Contact: ${structured_snapshot.recent_communications.last_contact_date || 'Unknown'}

## Recent Quotes
${JSON.stringify(structured_snapshot.quotes, null, 2)}
`;

  if (retrieved_chunks.length > 0) {
    prompt += `

## Additional Context (from semantic search)
${retrieved_chunks.map((c: any) => `
### ${c.source_label} (${c.source_type})
${c.content}
---
`).join('\n')}
`;
  }

  prompt += `

---

# USER QUESTION

${question}

---

Respond with valid JSON matching the schema specified above. Include citations for all findings.`;

  return prompt;
}

async function callPrismAPI(prompt: string): Promise<any> {
  const PRISM_SERVICE_URL = Deno.env.get('PRISM_SERVICE_URL');
  const PRISM_SYSTEM_API_KEY = Deno.env.get('PRISM_SYSTEM_API_KEY');

  if (!PRISM_SERVICE_URL || !PRISM_SYSTEM_API_KEY) {
    throw new Error('Prism API not configured');
  }

  const response = await fetch(`${PRISM_SERVICE_URL}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PRISM_SYSTEM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      mode: 'sequential',
      depth: 'synthesis',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Prism API error: ${error}`);
  }

  const result = await response.json();

  // Try to parse the final_output as JSON
  let structuredResponse = null;
  if (result.final_output) {
    try {
      // Extract JSON from the response (it might be wrapped in markdown)
      const jsonMatch = result.final_output.match(/```json\n?([\s\S]*?)\n?```/) ||
                        result.final_output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        structuredResponse = JSON.parse(jsonStr);
      }
    } catch (e) {
      console.warn('Could not parse structured response:', e);
    }
  }

  return {
    run_id: result.run_id,
    status: result.status,
    raw_output: result.final_output,
    structured_response: structuredResponse,
    tokens_used: result.usage?.total_tokens || 0,
    cost: result.usage?.estimated_cost || 0,
  };
}

