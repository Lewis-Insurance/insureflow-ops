/**
 * Explore Q&A Edge Function
 * 
 * ALIGNED WITH EXISTING SCHEMA:
 * - Uses knowledge_base for chunk retrieval (not explore_chunks)
 * - Uses ai_conversations/ai_messages for chat history (not explore_messages)
 * - Uses document_extractions for document context
 * - Uses document_evidence_items for citations
 * 
 * Key principles:
 * - NO GUESSING: If information is not in evidence, say "not found"
 * - EVIDENCE REQUIRED: Every factual claim cites evidence_ids
 * - CONFLICTS: Present multiple values with their evidence
 * - Insurance-domain constrained
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface QARequest {
  extraction_id?: string; // Filter by specific document extraction
  document_id?: string; // Filter by documents table ID
  conversation_id?: string; // Existing ai_conversations ID
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
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  const startTime = Date.now();

  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    // Azure OpenAI
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    // Parse request - aligned with existing tables
    const { 
      extraction_id, 
      document_id, 
      conversation_id,
      question, 
      max_chunks = 10, 
      include_conversation = true 
    }: QARequest = await req.json();
    
    if (!question) {
      return new Response(
        JSON.stringify({ error: 'question is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[explore-qa] User ${user.id} asking: "${question.slice(0, 50)}..."`);

    // Get or create ai_conversation (using existing table)
    let currentConversationId = conversation_id;
    
    if (!currentConversationId) {
      const { data: newConvo, error: convoError } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          title: `Document Q&A: ${question.slice(0, 50)}...`,
          context: { extraction_id, document_id },
        })
        .select()
        .single();

      if (convoError) {
        console.error('[explore-qa] Failed to create conversation:', convoError);
      } else {
        currentConversationId = newConvo.id;
      }
    }

    // Save user message in ai_messages (using existing table)
    if (currentConversationId) {
      await supabase.from('ai_messages').insert({
        conversation_id: currentConversationId,
        role: 'user',
        content: question,
        metadata: { extraction_id, document_id },
      });
    }

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
    // STEP 2: Retrieve relevant chunks from knowledge_base (aligned)
    // =======================================================================
    
    let relevantChunks: any[] = [];

    if (questionEmbedding) {
      // Vector search using aligned function
      const { data: vectorChunks } = await supabase.rpc('search_document_chunks', {
        p_query_embedding: `[${questionEmbedding.join(',')}]`,
        p_document_id: document_id || null,
        p_extraction_id: extraction_id || null,
        p_match_threshold: 0.5,
        p_match_count: max_chunks,
      });

      relevantChunks = vectorChunks || [];
    }

    // Fallback: keyword search from knowledge_base if vector search returned few results
    if (relevantChunks.length < 3) {
      const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      
      let query = supabase
        .from('knowledge_base')
        .select('id, content, page_index, evidence_ids, document_extraction_id, document_id')
        .eq('category', 'document_chunk');
      
      if (extraction_id) {
        query = query.eq('document_extraction_id', extraction_id);
      } else if (document_id) {
        query = query.eq('document_id', document_id);
      }
      
      const { data: keywordChunks } = await query.limit(max_chunks);

      // Simple keyword scoring
      const scoredChunks = (keywordChunks || []).map(chunk => {
        const text = chunk.content.toLowerCase();
        const matchCount = keywords.filter(kw => text.includes(kw)).length;
        return { 
          ...chunk, 
          chunk_text: chunk.content,
          page_start: chunk.page_index,
          similarity: matchCount / Math.max(keywords.length, 1) 
        };
      }).sort((a, b) => b.similarity - a.similarity);

      // Merge with vector results
      const existingIds = new Set(relevantChunks.map(c => c.chunk_id));
      for (const chunk of scoredChunks) {
        if (!existingIds.has(chunk.id) && relevantChunks.length < max_chunks) {
          relevantChunks.push({
            chunk_id: chunk.id,
            document_extraction_id: chunk.document_extraction_id,
            document_id: chunk.document_id,
            chunk_text: chunk.content,
            page_start: chunk.page_index,
            evidence_ids: chunk.evidence_ids,
            similarity: chunk.similarity,
          });
        }
      }
    }

    console.log(`[explore-qa] Retrieved ${relevantChunks.length} chunks from knowledge_base`);

    // =======================================================================
    // STEP 3: Get evidence details from document_evidence_items (aligned)
    // =======================================================================
    
    const allEvidenceIds = relevantChunks.flatMap(c => c.evidence_ids || []);
    const uniqueEvidenceIds = [...new Set(allEvidenceIds)];

    const { data: evidenceItems } = await supabase
      .from('document_evidence_items')
      .select('evidence_id, extraction_id, document_id, page_index, snippet_text, confidence, label')
      .in('evidence_id', uniqueEvidenceIds.slice(0, 100));

    const evidenceMap = new Map((evidenceItems || []).map(e => [e.evidence_id, e]));

    // =======================================================================
    // STEP 4: Get document_extractions metadata (aligned)
    // =======================================================================
    
    const extractionIds = [...new Set(relevantChunks.map(c => c.document_extraction_id).filter(Boolean))];
    const { data: extractions } = await supabase
      .from('document_extractions')
      .select('id, document_name, document_type, extracted_fields')
      .in('id', extractionIds);

    const extractionMap = new Map((extractions || []).map(d => [d.id, d]));

    // =======================================================================
    // STEP 5: Get conversation history from ai_messages (aligned)
    // =======================================================================
    
    let conversationContext = '';

    if (include_conversation && currentConversationId) {
      const { data: history } = await supabase
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', currentConversationId)
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
    
    const contextPack = buildContextPack(relevantChunks, evidenceMap, extractionMap);

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
    // STEP 9: Save assistant message in ai_messages (aligned)
    // =======================================================================
    
    const latencyMs = Date.now() - startTime;

    if (currentConversationId) {
      await supabase.from('ai_messages').insert({
        conversation_id: currentConversationId,
        role: 'assistant',
        content: parsedResponse.answer || assistantContent,
        citations: citations,
        metadata: {
          model_used: AZURE_OPENAI_DEPLOYMENT,
          tokens_used: chatData.usage?.total_tokens,
          latency_ms: latencyMs,
          chunks_retrieved: relevantChunks.length,
          retrieval_scores: Object.fromEntries(
            relevantChunks.map(c => [c.chunk_id, c.similarity])
          ),
          confidence: parsedResponse.confidence,
        },
      });
    }

    console.log(`[explore-qa] Response generated in ${latencyMs}ms with ${citations.length} citations`);

    // =======================================================================
    // STEP 10: Return response with conversation_id for continuity
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
      JSON.stringify({
        ...response,
        conversation_id: currentConversationId, // For continuing the conversation
      }),
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
  extractionMap: Map<string, any>
): string {
  const sections: string[] = [];

  // Group chunks by extraction
  const chunksByExtraction = new Map<string, any[]>();
  for (const chunk of chunks) {
    const extId = chunk.document_extraction_id;
    if (!chunksByExtraction.has(extId)) {
      chunksByExtraction.set(extId, []);
    }
    chunksByExtraction.get(extId)!.push(chunk);
  }

  for (const [extId, extChunks] of chunksByExtraction) {
    const extraction = extractionMap.get(extId);
    const classification = extraction?.extracted_fields?._classification;
    const docLabel = extraction 
      ? `${extraction.document_name} (${classification?.doc_type || extraction.document_type || 'unknown'}, ${classification?.lobs?.join('/') || 'N/A'})`
      : 'Document';

    sections.push(`\n=== DOCUMENT: ${docLabel} ===`);

    for (const chunk of extChunks) {
      sections.push(`\n[Page ${(chunk.page_start || 0) + 1}]`);
      sections.push(chunk.chunk_text || chunk.content);

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

