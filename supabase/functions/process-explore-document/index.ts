/**
 * Process Explore Document Edge Function
 * 
 * ALIGNED WITH EXISTING SCHEMA:
 * - Uses document_extractions table (not explore_documents)
 * - Uses knowledge_base table for chunks (not explore_chunks)
 * - Uses document_evidence_items for bbox evidence
 * 
 * Pipeline:
 * 1. Azure Document Intelligence OCR/Layout
 * 2. Build evidence catalog (page+bbox+snippet) -> document_evidence_items
 * 3. Chunk text and store -> knowledge_base with document_extraction_id
 * 4. Generate embeddings (768 dim to match existing knowledge_base)
 * 5. Update document_extractions with status
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration - 768 dim to match existing knowledge_base.embedding
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 200;
const MAX_SNIPPET_LENGTH = 500;
const EMBEDDING_DIM = 768;

interface ProcessRequest {
  extraction_id: string; // document_extractions.id
  document_id?: string; // documents.id (optional)
}

interface EvidenceItem {
  evidence_id: string;
  page_index: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  snippet_text: string;
  label: string | null;
  source_type: 'azure_di' | 'table' | 'kv' | 'text_span' | 'layout';
  confidence: number;
  tags: string[];
  potential_field: string | null;
}

interface DocumentChunk {
  chunk_text: string;
  chunk_index: number;
  page_start: number;
  page_end: number;
  evidence_ids: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Azure credentials
    const AZURE_DOC_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_DOC_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');

    if (!AZURE_DOC_ENDPOINT || !AZURE_DOC_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Parse request - aligned with existing tables
    const { extraction_id, document_id }: ProcessRequest = await req.json();
    console.log(`[process-explore-document] Processing extraction ${extraction_id}`);

    // Update status to processing in document_extractions
    await supabase
      .from('document_extractions')
      .update({
        status: 'processing',
        extraction_started_at: new Date().toISOString(),
        embedding_status: 'processing',
        retry_count: supabase.rpc ? undefined : 0, // Increment handled separately
      })
      .eq('id', extraction_id);

    // Get extraction record
    const { data: extraction, error: extractionError } = await supabase
      .from('document_extractions')
      .select('*')
      .eq('id', extraction_id)
      .single();

    if (extractionError || !extraction) {
      throw new Error(`Extraction not found: ${extractionError?.message}`);
    }

    // Get document file - extraction has document_url
    let documentBytes: Uint8Array;
    const documentUrl = extraction.document_url;
    
    // Try to download from URL or storage
    if (documentUrl.startsWith('http')) {
      const response = await fetch(documentUrl);
      if (!response.ok) throw new Error(`Failed to fetch document: ${response.status}`);
      documentBytes = new Uint8Array(await response.arrayBuffer());
    } else {
      // Assume it's a storage path
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(documentUrl);

      if (downloadError) {
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      documentBytes = new Uint8Array(await fileData.arrayBuffer());
    }

    console.log(`[process-explore-document] Downloaded ${documentBytes.length} bytes`);

    // =======================================================================
    // STEP 1: Azure Document Intelligence OCR
    // =======================================================================
    
    const base64Content = btoa(String.fromCharCode(...documentBytes));
    
    // Start Azure analysis
    const analyzeUrl = `${AZURE_DOC_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2023-07-31&pages=1-`;
    
    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY,
      },
      body: JSON.stringify({ base64Source: base64Content }),
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure DI analyze request failed: ${analyzeResponse.status} ${errorText}`);
    }

    // Get operation location for polling
    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('Azure DI did not return operation location');
    }

    console.log(`[process-explore-document] Azure DI operation started, polling...`);

    // Poll for results
    let azureResult: any = null;
    const pollTimeout = 120000; // 2 minutes
    const pollInterval = 2000;
    const pollStart = Date.now();

    while (Date.now() - pollStart < pollTimeout) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(operationLocation, {
        headers: { 'Ocp-Apim-Subscription-Key': AZURE_DOC_KEY },
      });

      const statusData = await statusResponse.json();

      if (statusData.status === 'succeeded') {
        azureResult = statusData.analyzeResult;
        break;
      } else if (statusData.status === 'failed') {
        throw new Error(`Azure DI analysis failed: ${JSON.stringify(statusData.error)}`);
      }
    }

    if (!azureResult) {
      throw new Error('Azure DI analysis timed out');
    }

    console.log(`[process-explore-document] Azure DI completed. Pages: ${azureResult.pages?.length}`);

    // =======================================================================
    // STEP 2: Build Evidence Catalog
    // =======================================================================
    
    const evidenceItems: EvidenceItem[] = [];
    const pageCount = azureResult.pages?.length || 0;

    // Process key-value pairs
    if (azureResult.keyValuePairs) {
      for (const kvPair of azureResult.keyValuePairs) {
        if (!kvPair.value?.content) continue;

        const pageIndex = kvPair.key?.boundingRegions?.[0]?.pageNumber - 1 || 0;
        const keyBbox = kvPair.key?.boundingRegions?.[0]?.polygon;
        const valueBbox = kvPair.value?.boundingRegions?.[0]?.polygon;

        const evidenceId = generateEvidenceId(document_id, pageIndex, kvPair.key?.content, kvPair.value.content);
        
        evidenceItems.push({
          evidence_id: evidenceId,
          page_index: pageIndex,
          bbox: polygonToBbox(valueBbox || keyBbox),
          snippet_text: `${kvPair.key?.content || ''}: ${kvPair.value.content}`.slice(0, MAX_SNIPPET_LENGTH),
          label: kvPair.key?.content || null,
          source_type: 'kv',
          confidence: kvPair.confidence || 0.5,
          tags: inferTags(kvPair.key?.content || '', kvPair.value.content),
          potential_field: inferPotentialField(kvPair.key?.content || ''),
        });
      }
    }

    // Process tables
    if (azureResult.tables) {
      for (const table of azureResult.tables) {
        const pageIndex = table.boundingRegions?.[0]?.pageNumber - 1 || 0;

        for (const cell of table.cells || []) {
          if (!cell.content?.trim()) continue;

          const evidenceId = generateEvidenceId(
            document_id,
            pageIndex,
            `table_${table.rowCount}_${table.columnCount}`,
            cell.content
          );

          evidenceItems.push({
            evidence_id: evidenceId,
            page_index: pageIndex,
            bbox: polygonToBbox(cell.boundingRegions?.[0]?.polygon),
            snippet_text: cell.content.slice(0, MAX_SNIPPET_LENGTH),
            label: cell.columnIndex === 0 ? cell.content : null,
            source_type: 'table',
            confidence: 0.85,
            tags: ['table', `row_${cell.rowIndex}`, `col_${cell.columnIndex}`],
            potential_field: null,
          });
        }
      }
    }

    // Process paragraphs/lines
    if (azureResult.paragraphs) {
      for (const para of azureResult.paragraphs) {
        if (!para.content?.trim() || para.content.length < 20) continue;

        const pageIndex = para.boundingRegions?.[0]?.pageNumber - 1 || 0;
        const evidenceId = generateEvidenceId(document_id, pageIndex, 'para', para.content.slice(0, 100));

        evidenceItems.push({
          evidence_id: evidenceId,
          page_index: pageIndex,
          bbox: polygonToBbox(para.boundingRegions?.[0]?.polygon),
          snippet_text: para.content.slice(0, MAX_SNIPPET_LENGTH),
          label: null,
          source_type: 'text_span',
          confidence: 0.9,
          tags: inferTags('', para.content),
          potential_field: null,
        });
      }
    }

    console.log(`[process-explore-document] Built ${evidenceItems.length} evidence items`);

    // Store evidence items in document_evidence_items table (aligned)
    if (evidenceItems.length > 0) {
      const { error: evidenceError } = await supabase
        .from('document_evidence_items')
        .upsert(
          evidenceItems.map(e => ({
            evidence_id: e.evidence_id,
            extraction_id: extraction_id,
            document_id: document_id || null,
            page_index: e.page_index,
            bbox: e.bbox,
            snippet_text: e.snippet_text,
            label: e.label,
            source_type: e.source_type,
            confidence: e.confidence,
            tags: e.tags,
          })),
          { onConflict: 'extraction_id,evidence_id' }
        );

      if (evidenceError) {
        console.error('[process-explore-document] Failed to store evidence:', evidenceError);
      }

      // Also store in evidence_catalog JSONB for quick access
      await supabase
        .from('document_extractions')
        .update({
          evidence_catalog: evidenceItems.map(e => ({
            evidence_id: e.evidence_id,
            page_index: e.page_index,
            bbox: e.bbox,
            snippet_text: e.snippet_text.slice(0, 200),
            label: e.label,
            confidence: e.confidence,
            tags: e.tags,
          })),
        })
        .eq('id', extraction_id);
    }

    // =======================================================================
    // STEP 3: Chunk Document for Retrieval
    // =======================================================================
    
    const fullText = azureResult.content || '';
    const chunks = chunkDocument(fullText, evidenceItems, CHUNK_SIZE, CHUNK_OVERLAP);
    
    console.log(`[process-explore-document] Created ${chunks.length} chunks`);

    // =======================================================================
    // STEP 4: Generate Embeddings
    // =======================================================================
    
    let embeddingsGenerated = 0;

    // Store chunks in knowledge_base table (aligned with existing schema)
    // Use 768-dim embeddings to match existing knowledge_base.embedding column
    if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY && chunks.length > 0) {
      const EMBEDDING_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_EMBEDDING_DEPLOYMENT') || 'text-embedding-ada-002';
      const embeddingUrl = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${EMBEDDING_DEPLOYMENT}/embeddings?api-version=2024-02-15-preview`;

      const batchSize = 16;
      const chunksWithEmbeddings: Array<DocumentChunk & { embedding?: number[] }> = [...chunks];

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map(c => c.chunk_text.slice(0, 8000));

        try {
          const embResponse = await fetch(embeddingUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': AZURE_OPENAI_KEY,
            },
            body: JSON.stringify({ input: texts }),
          });

          if (embResponse.ok) {
            const embData = await embResponse.json();
            for (let j = 0; j < batch.length; j++) {
              if (embData.data?.[j]?.embedding) {
                chunksWithEmbeddings[i + j].embedding = embData.data[j].embedding;
                embeddingsGenerated++;
              }
            }
          }
        } catch (embError) {
          console.error('[process-explore-document] Embedding batch failed:', embError);
        }
      }

      // Store chunks in knowledge_base table (reusing existing table!)
      for (const chunk of chunksWithEmbeddings) {
        const { error: chunkError } = await supabase
          .from('knowledge_base')
          .insert({
            title: `Chunk ${chunk.chunk_index + 1} - ${extraction.document_name}`,
            content: chunk.chunk_text,
            category: 'document_chunk',
            tags: ['explore', classification.docType || 'unknown', ...(classification.lobs || [])],
            source: extraction.document_name,
            account_id: extraction.account_id || null,
            document_extraction_id: extraction_id,
            document_id: document_id || null,
            page_index: chunk.page_start,
            evidence_ids: chunk.evidence_ids,
            chunk_index: chunk.chunk_index,
            embedding: chunk.embedding ? `[${chunk.embedding.join(',')}]` : null,
            metadata: {
              page_start: chunk.page_start,
              page_end: chunk.page_end,
              token_count: Math.ceil(chunk.chunk_text.length / 4),
            },
          });

        if (chunkError) {
          console.error('[process-explore-document] Failed to store chunk:', chunkError);
        }
      }
    } else {
      // Store chunks without embeddings
      for (const chunk of chunks) {
        await supabase.from('knowledge_base').insert({
          title: `Chunk ${chunk.chunk_index + 1} - ${extraction.document_name}`,
          content: chunk.chunk_text,
          category: 'document_chunk',
          tags: ['explore', classification.docType || 'unknown'],
          source: extraction.document_name,
          account_id: extraction.account_id || null,
          document_extraction_id: extraction_id,
          document_id: document_id || null,
          page_index: chunk.page_start,
          evidence_ids: chunk.evidence_ids,
          chunk_index: chunk.chunk_index,
        });
      }
    }

    console.log(`[process-explore-document] Stored ${chunks.length} chunks in knowledge_base, ${embeddingsGenerated} with embeddings`);

    // =======================================================================
    // STEP 5: Classify Document Type + LOB
    // =======================================================================
    
    const classification = classifyDocument(fullText, evidenceItems);
    
    console.log(`[process-explore-document] Classification: ${classification.docType} (${classification.docTypeConfidence})`);

    // =======================================================================
    // STEP 6: Calculate Quality Score
    // =======================================================================
    
    const azureConfidence = calculateAverageConfidence(evidenceItems);
    const qualityScore = Math.min(1, azureConfidence * (evidenceItems.length > 10 ? 1 : 0.8));
    const qualityIssues: Record<string, boolean> = {
      low_evidence_count: evidenceItems.length < 5,
      low_confidence: azureConfidence < 0.7,
      short_document: fullText.length < 500,
    };

    // =======================================================================
    // STEP 7: Update document_extractions Record (aligned with existing table)
    // =======================================================================
    
    const processingDuration = Date.now() - startTime;

    const { error: updateError } = await supabase
      .from('document_extractions')
      .update({
        status: 'extracted',
        document_type: classification.docType,
        page_count: pageCount,
        azure_confidence_score: azureConfidence,
        azure_text_content: fullText.slice(0, 50000), // Bounded
        chunk_count: chunks.length,
        embedding_status: embeddingsGenerated > 0 ? 'ready' : 'skipped',
        extraction_completed_at: new Date().toISOString(),
        // Store classification in extracted_fields
        extracted_fields: {
          ...extraction.extracted_fields,
          _classification: {
            doc_type: classification.docType,
            doc_type_confidence: classification.docTypeConfidence,
            lobs: classification.lobs,
            lob_confidence: classification.lobConfidence,
            carrier: classification.carrier,
          },
          _quality: {
            score: qualityScore,
            issues: qualityIssues,
            evidence_count: evidenceItems.length,
            chunk_count: chunks.length,
          },
        },
      })
      .eq('id', extraction_id);

    if (updateError) {
      throw new Error(`Failed to update extraction: ${updateError.message}`);
    }

    console.log(`[process-explore-document] Extraction ${extraction_id} processed in ${processingDuration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extraction_id,
        document_id: document_id,
        evidence_count: evidenceItems.length,
        chunk_count: chunks.length,
        page_count: pageCount,
        doc_type: classification.docType,
        processing_time_ms: processingDuration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[process-explore-document] Error:', error);

    // Update document_extractions status to failed (aligned)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const body = await req.clone().json().catch(() => ({}));
      if (body.extraction_id) {
        await supabase
          .from('document_extractions')
          .update({
            status: 'failed',
            error_message: error.message,
            embedding_status: 'error',
            extraction_completed_at: new Date().toISOString(),
          })
          .eq('id', body.extraction_id);
      }
    } catch (e) {
      console.error('[process-explore-document] Failed to update error status:', e);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateEvidenceId(docId: string, pageIndex: number, label: string, value: string): string {
  const input = `${docId}:${pageIndex}:${label}:${value.slice(0, 50)}`;
  // Simple hash - in production use proper crypto
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `ev_${Math.abs(hash).toString(36).slice(0, 12)}`;
}

function polygonToBbox(polygon?: number[]): { x: number; y: number; w: number; h: number } | null {
  if (!polygon || polygon.length < 8) return null;
  
  const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
  const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];
  
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

function inferTags(label: string, value: string): string[] {
  const tags: string[] = [];
  const combined = `${label} ${value}`.toLowerCase();

  if (/policy\s*(number|#|no)/i.test(combined)) tags.push('policy_number');
  if (/effective|inception/i.test(combined)) tags.push('effective_date');
  if (/expir|expiration/i.test(combined)) tags.push('expiration_date');
  if (/premium|total\s*due/i.test(combined)) tags.push('premium');
  if (/limit|coverage/i.test(combined)) tags.push('limit');
  if (/deductible/i.test(combined)) tags.push('deductible');
  if (/insured|named/i.test(combined)) tags.push('insured');
  if (/carrier|company|insurer/i.test(combined)) tags.push('carrier');
  if (/address/i.test(combined)) tags.push('address');
  if (/vehicle|vin|auto/i.test(combined)) tags.push('vehicle');
  if (/property|location/i.test(combined)) tags.push('property');

  return tags;
}

function inferPotentialField(label: string): string | null {
  const normalized = label.toLowerCase().trim();

  const mappings: Record<string, string> = {
    'policy number': 'policy_number',
    'policy no': 'policy_number',
    'policy #': 'policy_number',
    'effective date': 'effective_date',
    'inception date': 'effective_date',
    'expiration date': 'expiration_date',
    'exp date': 'expiration_date',
    'total premium': 'total_premium',
    'premium': 'total_premium',
    'named insured': 'named_insured',
    'insured': 'named_insured',
    'carrier': 'carrier',
    'company': 'carrier',
  };

  for (const [pattern, field] of Object.entries(mappings)) {
    if (normalized.includes(pattern)) return field;
  }

  return null;
}

function chunkDocument(
  fullText: string,
  evidenceItems: EvidenceItem[],
  chunkSize: number,
  overlap: number
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  
  if (!fullText || fullText.length === 0) {
    return chunks;
  }

  // Split by paragraphs/sentences for natural boundaries
  const paragraphs = fullText.split(/\n\n+/);
  let currentChunk = '';
  let currentEvidenceIds: string[] = [];
  let chunkIndex = 0;
  let currentPageStart = 0;
  let currentPageEnd = 0;

  for (const para of paragraphs) {
    const paraLength = para.length;

    // Find evidence items that match this paragraph
    const matchingEvidence = evidenceItems.filter(e => 
      para.toLowerCase().includes(e.snippet_text.toLowerCase().slice(0, 50))
    );

    if (currentChunk.length + paraLength > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        chunk_text: currentChunk.trim(),
        chunk_index: chunkIndex,
        page_start: currentPageStart,
        page_end: currentPageEnd,
        evidence_ids: currentEvidenceIds.length > 0 ? currentEvidenceIds : ['no_evidence'],
      });
      chunkIndex++;

      // Start new chunk with overlap
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5));
      currentChunk = overlapWords.join(' ') + '\n\n' + para;
      currentEvidenceIds = matchingEvidence.map(e => e.evidence_id);
      currentPageStart = matchingEvidence[0]?.page_index || currentPageEnd;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
      currentEvidenceIds.push(...matchingEvidence.map(e => e.evidence_id));
      if (matchingEvidence.length > 0) {
        currentPageEnd = Math.max(currentPageEnd, ...matchingEvidence.map(e => e.page_index));
      }
    }
  }

  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      chunk_text: currentChunk.trim(),
      chunk_index: chunkIndex,
      page_start: currentPageStart,
      page_end: currentPageEnd,
      evidence_ids: currentEvidenceIds.length > 0 ? currentEvidenceIds : ['no_evidence'],
    });
  }

  return chunks;
}

function classifyDocument(fullText: string, evidenceItems: EvidenceItem[]): {
  docType: string;
  docTypeConfidence: number;
  lobs: string[];
  lobConfidence: Record<string, number>;
  carrier: string | null;
} {
  const text = fullText.toLowerCase();
  
  // Document type detection
  const docTypePatterns: Record<string, RegExp[]> = {
    'dec_page': [/declarations?\s*page/i, /policy\s*declarations/i],
    'policy': [/insurance\s*policy/i, /policy\s*contract/i, /terms\s*and\s*conditions/i],
    'quote': [/quote|proposal|estimate/i, /quoted\s*premium/i],
    'endorsement': [/endorsement|amendment|rider/i],
    'certificate': [/certificate\s*of\s*(insurance|liability)/i, /acord\s*25/i],
    'loss_run': [/loss\s*run|claims?\s*history|loss\s*experience/i],
    'binder': [/binder|temporary\s*coverage/i],
    'application': [/application\s*for\s*insurance/i, /acord\s*(125|126|130)/i],
  };

  let docType = 'unknown';
  let docTypeConfidence = 0.3;

  for (const [type, patterns] of Object.entries(docTypePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        docType = type;
        docTypeConfidence = 0.85;
        break;
      }
    }
    if (docType !== 'unknown') break;
  }

  // LOB detection
  const lobPatterns: Record<string, RegExp[]> = {
    'GL': [/general\s*liability|commercial\s*general\s*liability|cgl/i],
    'AUTO': [/commercial\s*auto|business\s*auto|auto\s*liability/i],
    'WC': [/workers?\s*comp|workers?\s*compensation/i],
    'PROP': [/commercial\s*property|building\s*coverage|property\s*insurance/i],
    'UMBRELLA': [/umbrella|excess\s*liability/i],
    'BOP': [/business\s*owner|bop/i],
    'EPLI': [/employment\s*practices|epli/i],
    'CYBER': [/cyber\s*liability|data\s*breach/i],
    'PROF': [/professional\s*liability|e&o|errors\s*and\s*omissions/i],
  };

  const lobs: string[] = [];
  const lobConfidence: Record<string, number> = {};

  for (const [lob, patterns] of Object.entries(lobPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        lobs.push(lob);
        lobConfidence[lob] = 0.8;
        break;
      }
    }
  }

  // Carrier detection from evidence
  const carrierEvidence = evidenceItems.find(e => e.tags.includes('carrier'));
  const carrier = carrierEvidence?.snippet_text.split(':').pop()?.trim() || null;

  return {
    docType,
    docTypeConfidence,
    lobs,
    lobConfidence,
    carrier,
  };
}

function calculateAverageConfidence(evidenceItems: EvidenceItem[]): number {
  if (evidenceItems.length === 0) return 0;
  const sum = evidenceItems.reduce((acc, e) => acc + (e.confidence || 0), 0);
  return sum / evidenceItems.length;
}

