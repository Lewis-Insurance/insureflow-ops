/**
 * AI Document Analysis Simple - Edge Function
 * Uses Azure Document Intelligence for OCR + Azure OpenAI for analysis
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';
import { normalizeExtractSnapshot, mergeExtractSnapshots } from '../_shared/extractSnapshot.ts';
import {
  buildOcrChunks,
  pageTextsFromAzurePages,
  PAGE_BREAK_MARKER,
} from '../_shared/ocrChunks.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Leave room for prompt overhead under legacy 100k cap. */
const SINGLE_CHUNK_CHAR_THRESHOLD = 90_000;
const LLM_MAX_TOKENS = 4000;

const EXTRACT_SNAPSHOT_V1_SCHEMA = `{
  "schema_version": 1,
  "policy_number": "",
  "insured_name": "",
  "carriers": ["Carrier A", "Carrier B"],
  "document_type": "auto_policy|home_policy|commercial_policy|life_policy|umbrella_policy|commercial_quote",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "claims_made": true or false or null,
  "defense_inside_limits": true or false or null,
  "premium": {"total": 0, "frequency": "annual|monthly|quarterly or null"},
  "fees": [{"type": "tax|broker|surplus_lines|nima|other", "amount": 0, "label": "optional label"}],
  "commission": {"percent": 0, "amount": 0},
  "coverages": [
    {
      "name": "",
      "limit": "",
      "deductible": "",
      "premium": 0,
      "parent_coverage": "parent coverage name when included in another line, else null"
    }
  ],
  "locations": [{"address": "", "occupancy": "building type or use"}],
  "vehicles": [{"year": "", "make": "", "model": "", "vin": ""}],
  "drivers": [{"name": "", "date_of_birth": "YYYY-MM-DD", "license_number": "", "license_state": ""}],
  "key_details": ["overflow detail strings only"]
}`;

function buildFullTextFromPageTexts(
  pageTexts: Array<{ page: number; text: string }>,
): string {
  return pageTexts
    .map((p) => p.text)
    .join(PAGE_BREAK_MARKER);
}

function buildFullExtractionPrompt(totalPages: number, documentText: string): string {
  return `Analyze this ${totalPages}-page insurance document and extract ALL relevant information as ExtractSnapshotV1 JSON.

DOCUMENT TEXT (ALL ${totalPages} PAGES):
${documentText}

Return ONLY valid JSON matching ExtractSnapshotV1 (schema_version: 1):
${EXTRACT_SNAPSHOT_V1_SCHEMA}

Rules:
- Use carriers array (not a single carrier string).
- Use locations array (not a single property object).
- Set parent_coverage when a sublimit is included in another coverage (e.g. "Products-Completed Ops included in GL").
- Include fees and commission when present on the document.
- Use null for unknown scalar fields; use empty arrays when none found.`;
}

function buildPartialExtractionPrompt(
  startPage: number,
  endPage: number,
  totalPages: number,
  chunkText: string,
): string {
  const pageLabel = startPage === endPage
    ? `page ${startPage}`
    : `pages ${startPage}-${endPage}`;

  return `Extract fields present in THIS SECTION ONLY (${pageLabel} of ${totalPages} total pages) as ExtractSnapshotV1 JSON. Leave scalar fields null and arrays empty if not in this section.

DOCUMENT SECTION (${pageLabel}):
${chunkText}

Return ONLY valid JSON matching ExtractSnapshotV1 (schema_version: 1):
${EXTRACT_SNAPSHOT_V1_SCHEMA}

Rules:
- Extract ONLY what appears in this section.
- Use carriers array (not a single carrier string).
- Use locations array (not a single property object).
- Set parent_coverage when a sublimit is included in another coverage.
- Use null for unknown scalar fields; use empty arrays when none found.`;
}

async function callAzureOpenAIExtraction(
  endpoint: string,
  apiKey: string,
  deployment: string,
  prompt: string,
): Promise<unknown> {
  const aiResponse = await modelBoundaryFetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Extract insurance data as JSON. Be thorough and accurate.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: LLM_MAX_TOKENS,
      }),
    },
  );

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    throw new Error(`Azure OpenAI failed: ${aiResponse.status} - ${errText}`);
  }

  const aiData = await aiResponse.json();
  const aiContent = aiData.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiContent);
  } catch {
    return { raw_response: aiContent };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | null = null;

  try {
    const { document_id, file_name, account_id, user_id } = await req.json();
    documentId = document_id;

    console.log('========================================');
    console.log('DOCUMENT ANALYSIS (AZURE) - START');
    console.log('========================================');
    console.log('File:', file_name);
    console.log('Document ID:', document_id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    // Azure credentials
    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4o';

    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Update status to processing
    const { data: analysisRow, error: analysisUpsertError } = await supabase
      .from('document_analysis')
      .upsert({
        document_id,
        file_name,
        account_id: account_id || null,
        processing_status: 'processing',
        created_by: user_id
      }, { onConflict: 'document_id' })
      .select('id')
      .single();

    if (analysisUpsertError || !analysisRow?.id) {
      throw new Error(`Failed to create analysis record: ${analysisUpsertError?.message ?? 'missing id'}`);
    }

    const analysisId = analysisRow.id;

    // STEP 1: Get document URL
    console.log('----------------------------------------');
    console.log('STEP 1: Getting document from storage');
    console.log('----------------------------------------');

    const { data: docData, error: docError } = await supabase
      .from('documents')
      .select('storage_path, storage_bucket')
      .eq('id', document_id)
      .maybeSingle();

    if (docError || !docData) {
      throw new Error(`Could not find document: ${docError?.message || 'Not found'}`);
    }

    const bucketName = docData.storage_bucket || 'documents';

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(docData.storage_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message}`);
    }

    console.log('✅ Signed URL created');

    // STEP 2: Azure Document Intelligence OCR
    console.log('----------------------------------------');
    console.log('STEP 2: Azure Document Intelligence OCR');
    console.log('----------------------------------------');

    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT.slice(0, -1) : AZURE_ENDPOINT;

    // Try multiple API configurations
    const apiConfigs = [
      { path: 'formrecognizer', model: 'prebuilt-layout', versions: ['2023-07-31', '2022-08-31'] },
      { path: 'documentintelligence', model: 'prebuilt-read', versions: ['2024-02-29-preview', '2023-10-31-preview'] }
    ];

    let ocrResult = null;
    let workingConfig = null;

    for (const config of apiConfigs) {
      if (ocrResult) break;
      for (const version of config.versions) {
        const analyzeUrl = `${cleanEndpoint}/${config.path}/documentModels/${config.model}:analyze?api-version=${version}`;

        console.log(`Trying ${config.path}/${config.model} v${version}...`);

        try {
          const analyzeResponse = await modelBoundaryFetch(analyzeUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
            },
            body: JSON.stringify({
              urlSource: signedUrlData.signedUrl,
              pages: ["1-"]
            })
          });

          if (!analyzeResponse.ok) continue;

          const operationLocation = analyzeResponse.headers.get('Operation-Location');
          if (!operationLocation) continue;

          console.log(`✅ Success, polling for results...`);

          // Poll for results
          let attempts = 0;
          const maxAttempts = 60;

          while (attempts < maxAttempts) {
            await sleep(2000);
            attempts++;

            const resultResponse = await modelBoundaryFetch(operationLocation, {
              headers: { 'Ocp-Apim-Subscription-Key': AZURE_API_KEY }
            });

            const result = await resultResponse.json();

            if (result.status === 'succeeded') {
              ocrResult = result;
              workingConfig = { ...config, version };
              console.log('✅ OCR Complete!');
              break;
            } else if (result.status === 'failed') {
              console.error('OCR failed:', result.error);
              break;
            }
          }

          if (ocrResult) break;
        } catch (error: any) {
          console.log(`Error: ${error.message}`);
        }
      }
    }

    if (!ocrResult) {
      throw new Error('Azure OCR failed - could not extract text from document');
    }

    // Extract text from all pages (preserve per-page data for chunking)
    const allPages = ocrResult.analyzeResult?.pages || [];
    const totalPages = allPages.length;
    console.log(`Document has ${totalPages} pages`);

    const pageTexts = pageTextsFromAzurePages(allPages);
    const fullText = buildFullTextFromPageTexts(pageTexts);
    const charCount = fullText.length;
    console.log(`✅ Extracted ${charCount} characters from ${totalPages} pages`);

    if (charCount === 0) {
      throw new Error('No text could be extracted from document');
    }

    // Update with OCR results
    await supabase
      .from('document_analysis')
      .update({
        ocr_text: fullText,
        ocr_char_count: charCount,
        total_pages: totalPages,
        pages_analyzed: `1-${totalPages}`,
        processing_status: 'ocr_complete'
      })
      .eq('document_id', document_id);

    // STEP 3: AI Analysis with Azure OpenAI
    let analysisResult = normalizeExtractSnapshot({});
    let chunkCount = 1;
    let chunksAnalyzed = 0;
    let chunksFailed = 0;
    const failedChunkDetails: string[] = [];

    if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
      console.log('----------------------------------------');
      console.log('STEP 3: AI Analysis with Azure OpenAI');
      console.log('----------------------------------------');

      if (charCount <= SINGLE_CHUNK_CHAR_THRESHOLD) {
        console.log(`Single-chunk extraction (${charCount} chars <= ${SINGLE_CHUNK_CHAR_THRESHOLD})`);

        const analysisPrompt = buildFullExtractionPrompt(totalPages, fullText);

        try {
          const parsed = await callAzureOpenAIExtraction(
            AZURE_OPENAI_ENDPOINT,
            AZURE_OPENAI_KEY,
            AZURE_OPENAI_DEPLOYMENT,
            analysisPrompt,
          );
          analysisResult = normalizeExtractSnapshot(parsed);
          chunksAnalyzed = 1;
          console.log('✅ AI Analysis complete (ExtractSnapshotV1 normalized, single chunk)');
        } catch (parseError) {
          console.error('Failed to parse AI response:', parseError);
          analysisResult = normalizeExtractSnapshot({});
        }
      } else {
        const { chunks, totalChars } = buildOcrChunks(pageTexts);
        chunkCount = chunks.length;
        console.log(`Chunked extraction: ${totalChars} chars across ${chunkCount} chunks`);

        const partialSnapshots = [];
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          console.log(
            `Analyzing chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage})`,
          );

          const partialPrompt = buildPartialExtractionPrompt(
            chunk.startPage,
            chunk.endPage,
            totalPages,
            chunk.text,
          );

          try {
            const parsed = await callAzureOpenAIExtraction(
              AZURE_OPENAI_ENDPOINT,
              AZURE_OPENAI_KEY,
              AZURE_OPENAI_DEPLOYMENT,
              partialPrompt,
            );
            partialSnapshots.push(normalizeExtractSnapshot(parsed));
            chunksAnalyzed++;
          } catch (chunkError) {
            chunksFailed++;
            const detail = `Chunk ${i + 1}/${chunks.length} (pages ${chunk.startPage}-${chunk.endPage})`;
            failedChunkDetails.push(detail);
            console.error(`${detail} extraction failed:`, chunkError);
          }
        }

        if (partialSnapshots.length > 0) {
          analysisResult = mergeExtractSnapshots(partialSnapshots);
          if (chunksFailed > 0) {
            const warning = `Partial extraction: ${chunksFailed} of ${chunkCount} chunks failed (${failedChunkDetails.join('; ')}). Review fees, endorsements, and tail pages.`;
            analysisResult = {
              ...analysisResult,
              key_details: [warning, ...analysisResult.key_details],
            };
          }
          console.log(
            `✅ AI Analysis complete (merged ${partialSnapshots.length}/${chunkCount} chunk snapshots${chunksFailed > 0 ? `, ${chunksFailed} failed` : ''})`,
          );
        } else {
          throw new Error(
            `All ${chunkCount} chunk extractions failed (${failedChunkDetails.join('; ')})`,
          );
        }
      }
    }

    const partialExtraction = chunksFailed > 0;

    // TODO(Phase 0c): reload-by-id for re-analysis without re-OCR

    // STEP 4: Save final results
    console.log('----------------------------------------');
    console.log('STEP 4: Saving results');
    console.log('----------------------------------------');

    await supabase
      .from('document_analysis')
      .update({
        processing_status: 'completed',
        analysis_result: analysisResult,
        processed_at: new Date().toISOString()
      })
      .eq('id', analysisId);

    console.log('========================================');
    console.log('SUCCESS - Analysis Complete');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysisId,
        document_id,
        page_count: totalPages,
        text_length: charCount,
        total_chars: charCount,
        chunk_count: chunkCount,
        chunks_analyzed: chunksAnalyzed,
        chunks_failed: chunksFailed,
        partial_extraction: partialExtraction,
        ocr_text: fullText,
        analysis: analysisResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('========================================');
    console.error('ERROR:', (error instanceof Error ? error.message : String(error)));
    console.error('========================================');

    // Update status to failed
    if (documentId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase
        .from('document_analysis')
        .update({
          processing_status: 'failed',
          error_message: (error instanceof Error ? error.message : String(error))
        })
        .eq('document_id', documentId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: (error instanceof Error ? error.message : String(error))
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
