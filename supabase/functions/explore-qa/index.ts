/**
 * Explore Q&A Edge Function
 * 
 * Provides evidence-backed Q&A for the Explore Insurance Document module.
 * 
 * Key principles:
 * - NO GUESSING: If information is not in evidence, say "not found"
 * - EVIDENCE REQUIRED: Every factual claim cites evidence_ids
 * - CONFLICTS: Present multiple values with their evidence
 * - Insurance-domain constrained
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QARequest {
  session_id: string;
  question: string;
  max_chunks?: number;
  include_conversation?: boolean;
}

interface Citation {
  evidence_id: string;
  document_id: string;
  page: number;
  snippet: string;
  confidence: number;
}

interface QAResponse {
  answer: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low' | 'not_found';
  follow_up_suggestions: string[];
  chunks_used: number;
  latency_ms: number;
}

// Q&A System Prompt
const QA_SYSTEM_PROMPT = `You are an insurance document Q&A assistant for Lewis Insurance agency. You answer questions about uploaded insurance documents using ONLY the evidence provided.

CRITICAL RULES:
1. NEVER guess or infer information not explicitly in the evidence
2. Every factual claim MUST cite [evidence_id] from the provided evidence
3. If information is not found, clearly state "This information was not found in the documents" and suggest what to look for
4. If multiple conflicting values exist, present ALL candidates with their evidence sources
5. Stay within insurance domain - redirect off-topic questions

CITATION FORMAT:
- Use [ev_xxxxx] inline for every factual claim
- Example: "The policy effective date is January 1, 2024 [ev_abc123]"

CONFIDENCE LEVELS:
- HIGH: Multiple evidence sources agree, high OCR confidence
- MEDIUM: Single source with moderate confidence
- LOW: Inferred from context, partial match
- NOT_FOUND: Information not in documents

OUTPUT FORMAT (JSON):
{
  "answer": "Your detailed answer with [evidence_id] citations",
  "confidence": "high|medium|low|not_found",
  "key_citations": ["ev_xxx", "ev_yyy"],
  "conflicts": [{"field": "...", "values": [...], "evidence": [...]}] or null,
  "follow_up_suggestions": ["Question 1?", "Question 2?"]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Azure OpenAI
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { session_id, question, max_chunks = 10, include_conversation = true }: QARequest = await req.json();
    
    if (!session_id || !question) {
      return new Response(
        JSON.stringify({ error: 'session_id and question are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[explore-qa] User ${user.id} asking: "${question.slice(0, 50)}..."`);

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from('explore_sessions')
      .select('id, created_by, account_id, policy_id')
      .eq('id', session_id)
      .eq('created_by', user.id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Session not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save user message
    await supabase.from('explore_messages').insert({
      session_id,
      role: 'user',
      content: question,
    });

    // =======================================================================
    // STEP 1: Generate question embedding for vector search
    // =======================================================================
    
    const EMBEDDING_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_EMBEDDING_DEPLOYMENT') || 'text-embedding-ada-002';
    const embeddingUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${EMBEDDING_DEPLOYMENT}/embeddings?api-version=2024-02-15-preview`;

    let questionEmbedding: number[] | null = null;

    try {
      const embResponse = await fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({ input: question }),
      });

      if (embResponse.ok) {
        const embData = await embResponse.json();
        questionEmbedding = embData.data?.[0]?.embedding;
      }
    } catch (e) {
      console.warn('[explore-qa] Embedding generation failed, using keyword search only');
    }

    // =======================================================================
    // STEP 2: Retrieve relevant chunks
    // =======================================================================
    
    let relevantChunks: any[] = [];

    if (questionEmbedding) {
      // Vector search
      const { data: vectorChunks } = await supabase.rpc('search_explore_chunks', {
        p_session_id: session_id,
        p_embedding: `[${questionEmbedding.join(',')}]`,
        p_limit: max_chunks,
        p_threshold: 0.5,
      });

      relevantChunks = vectorChunks || [];
    }

    // Fallback: keyword search if vector search returned few results
    if (relevantChunks.length < 3) {
      const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      
      const { data: keywordChunks } = await supabase
        .from('explore_chunks')
        .select('id, document_id, chunk_text, page_start, evidence_ids')
        .in('document_id', 
          supabase.from('explore_documents').select('id').eq('session_id', session_id)
        )
        .limit(max_chunks);

      // Simple keyword scoring
      const scoredChunks = (keywordChunks || []).map(chunk => {
        const text = chunk.chunk_text.toLowerCase();
        const matchCount = keywords.filter(kw => text.includes(kw)).length;
        return { ...chunk, similarity: matchCount / Math.max(keywords.length, 1) };
      }).sort((a, b) => b.similarity - a.similarity);

      // Merge with vector results
      const existingIds = new Set(relevantChunks.map(c => c.chunk_id));
      for (const chunk of scoredChunks) {
        if (!existingIds.has(chunk.id) && relevantChunks.length < max_chunks) {
          relevantChunks.push({
            chunk_id: chunk.id,
            document_id: chunk.document_id,
            chunk_text: chunk.chunk_text,
            page_start: chunk.page_start,
            evidence_ids: chunk.evidence_ids,
            similarity: chunk.similarity,
          });
        }
      }
    }

    console.log(`[explore-qa] Retrieved ${relevantChunks.length} chunks`);

    // =======================================================================
    // STEP 3: Get evidence details for citations
    // =======================================================================
    
    const allEvidenceIds = relevantChunks.flatMap(c => c.evidence_ids || []);
    const uniqueEvidenceIds = [...new Set(allEvidenceIds)];

    const { data: evidenceItems } = await supabase
      .from('explore_evidence_items')
      .select('evidence_id, document_id, page_index, snippet_text, confidence, label')
      .in('evidence_id', uniqueEvidenceIds.slice(0, 100));

    const evidenceMap = new Map((evidenceItems || []).map(e => [e.evidence_id, e]));

    // =======================================================================
    // STEP 4: Get document metadata
    // =======================================================================
    
    const docIds = [...new Set(relevantChunks.map(c => c.document_id))];
    const { data: documents } = await supabase
      .from('explore_documents')
      .select('id, filename, predicted_doc_type, lob_detected, carrier_detected')
      .in('id', docIds);

    const docMap = new Map((documents || []).map(d => [d.id, d]));

    // =======================================================================
    // STEP 5: Get conversation history (if enabled)
    // =======================================================================
    
    let conversationContext = '';

    if (include_conversation) {
      const { data: history } = await supabase
        .from('explore_messages')
        .select('role, content')
        .eq('session_id', session_id)
        .order('created_at', { ascending: false })
        .limit(6); // Last 3 exchanges

      if (history && history.length > 0) {
        conversationContext = '\n\nPREVIOUS CONVERSATION:\n' + 
          history.reverse().map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 200)}`).join('\n');
      }
    }

    // =======================================================================
    // STEP 6: Build context pack for LLM
    // =======================================================================
    
    const contextPack = buildContextPack(relevantChunks, evidenceMap, docMap);

    // =======================================================================
    // STEP 7: Call LLM
    // =======================================================================
    
    const chatUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`;

    const userPrompt = `QUESTION: ${question}

DOCUMENT CONTEXT:
${contextPack}
${conversationContext}

Provide your answer in the required JSON format. Remember to cite evidence IDs for every factual claim.`;

    const chatResponse = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_OPENAI_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: QA_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      throw new Error(`Azure OpenAI API error: ${chatResponse.status} ${errorText}`);
    }

    const chatData = await chatResponse.json();
    const assistantContent = chatData.choices?.[0]?.message?.content || '';

    // Parse LLM response
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(assistantContent);
    } catch (e) {
      parsedResponse = {
        answer: assistantContent,
        confidence: 'medium',
        key_citations: [],
        follow_up_suggestions: [],
      };
    }

    // =======================================================================
    // STEP 8: Build citations from referenced evidence
    // =======================================================================
    
    const citations: Citation[] = [];
    const citedIds = extractCitedEvidenceIds(parsedResponse.answer || assistantContent);

    for (const evId of citedIds) {
      const evidence = evidenceMap.get(evId);
      if (evidence) {
        citations.push({
          evidence_id: evId,
          document_id: evidence.document_id,
          page: evidence.page_index + 1, // 1-indexed for UI
          snippet: evidence.snippet_text,
          confidence: evidence.confidence,
        });
      }
    }

    // =======================================================================
    // STEP 9: Save assistant message
    // =======================================================================
    
    const latencyMs = Date.now() - startTime;

    await supabase.from('explore_messages').insert({
      session_id,
      role: 'assistant',
      content: parsedResponse.answer || assistantContent,
      citations: citations,
      model_used: AZURE_OPENAI_DEPLOYMENT,
      tokens_used: chatData.usage?.total_tokens,
      latency_ms: latencyMs,
      chunks_retrieved: relevantChunks.length,
      retrieval_scores: Object.fromEntries(
        relevantChunks.map(c => [c.chunk_id, c.similarity])
      ),
    });

    console.log(`[explore-qa] Response generated in ${latencyMs}ms with ${citations.length} citations`);

    // =======================================================================
    // STEP 10: Return response
    // =======================================================================
    
    const response: QAResponse = {
      answer: parsedResponse.answer || assistantContent,
      citations,
      confidence: parsedResponse.confidence || 'medium',
      follow_up_suggestions: parsedResponse.follow_up_suggestions || [],
      chunks_used: relevantChunks.length,
      latency_ms: latencyMs,
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[explore-qa] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildContextPack(
  chunks: any[],
  evidenceMap: Map<string, any>,
  docMap: Map<string, any>
): string {
  const sections: string[] = [];

  // Group chunks by document
  const chunksByDoc = new Map<string, any[]>();
  for (const chunk of chunks) {
    const docId = chunk.document_id;
    if (!chunksByDoc.has(docId)) {
      chunksByDoc.set(docId, []);
    }
    chunksByDoc.get(docId)!.push(chunk);
  }

  for (const [docId, docChunks] of chunksByDoc) {
    const doc = docMap.get(docId);
    const docLabel = doc 
      ? `${doc.filename} (${doc.predicted_doc_type || 'unknown'}, ${doc.lob_detected?.join('/') || 'N/A'})`
      : 'Document';

    sections.push(`\n=== DOCUMENT: ${docLabel} ===`);

    for (const chunk of docChunks) {
      sections.push(`\n[Page ${(chunk.page_start || 0) + 1}]`);
      sections.push(chunk.chunk_text);

      // Add evidence snippets with IDs
      const evidenceIds = chunk.evidence_ids || [];
      if (evidenceIds.length > 0) {
        sections.push('\nEVIDENCE:');
        for (const evId of evidenceIds.slice(0, 5)) { // Limit to 5 per chunk
          const ev = evidenceMap.get(evId);
          if (ev) {
            const label = ev.label ? `${ev.label}: ` : '';
            sections.push(`  [${evId}] ${label}${ev.snippet_text.slice(0, 200)}`);
          }
        }
      }
    }
  }

  return sections.join('\n');
}

function extractCitedEvidenceIds(text: string): string[] {
  const regex = /\[ev_[a-z0-9]+\]/gi;
  const matches = text.match(regex) || [];
  return [...new Set(matches.map(m => m.slice(1, -1)))]; // Remove brackets, dedupe
}

