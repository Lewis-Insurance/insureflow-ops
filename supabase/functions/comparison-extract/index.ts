// @ts-nocheck
/**
 * Comparison Extract Edge Function
 *
 * Extracts PolicySnapshots from workspace documents using:
 * 1. Azure Document Intelligence for OCR
 * 2. Evidence catalog building with stable IDs
 * 3. LLM extraction with prompts
 *
 * Requires exactly 2 documents (A and B) in workspace.
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuration
const AZURE_DI_ENDPOINT = Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT") || Deno.env.get("AZURE_DI_ENDPOINT");
const AZURE_DI_KEY = Deno.env.get("AZURE_DOCUMENT_INTELLIGENCE_KEY") || Deno.env.get("AZURE_DI_KEY");
const AZURE_OPENAI_ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT");
const AZURE_OPENAI_KEY = Deno.env.get("AZURE_OPENAI_KEY");
const AZURE_DEPLOYMENT = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "gpt-4o";

// Quality thresholds
const MIN_QUALITY_THRESHOLD = 0.35;
const WARN_QUALITY_THRESHOLD = 0.60;

// =============================================================================
// TYPES
// =============================================================================

interface WorkspaceDocument {
  id: string;
  file_name: string;
  file_url: string;
  doc_role: 'A' | 'B' | null;
  document_type: string | null;
  quality_score: number | null;
}

interface ExtractionResult {
  documentId: string;
  docRole: 'A' | 'B';
  snapshotId: string;
  confidence: number;
  status: 'success' | 'error';
  errorMessage?: string;
  processingTimeMs: number;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let workspaceId: string | null = null;

  try {
    const body = await req.json();
    workspaceId = body.workspace_id;

    if (!workspaceId) {
      throw new Error("Missing required field: workspace_id");
    }

    // Authenticate
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }

    console.log(`[comparison-extract] Starting extraction for workspace ${workspaceId}`);

    // Validate Azure credentials
    if (!AZURE_DI_ENDPOINT || !AZURE_DI_KEY) {
      throw new Error("Azure Document Intelligence credentials not configured");
    }
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) {
      throw new Error("Azure OpenAI credentials not configured");
    }

    // Fetch workspace with documents
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select(`
        id,
        name,
        status,
        task_type,
        workspace_documents (
          id,
          file_name,
          file_url,
          doc_role,
          document_type,
          quality_score
        )
      `)
      .eq("id", workspaceId)
      .single();

    if (wsError || !workspace) {
      throw new Error(`Workspace not found: ${wsError?.message || 'Unknown error'}`);
    }

    // Validate exactly 2 documents
    const documents = workspace.workspace_documents || [];
    if (documents.length !== 2) {
      throw new Error(`Comparison requires exactly 2 documents. Found: ${documents.length}`);
    }

    // Validate doc roles
    const docA = documents.find((d: WorkspaceDocument) => d.doc_role === 'A');
    const docB = documents.find((d: WorkspaceDocument) => d.doc_role === 'B');

    if (!docA || !docB) {
      throw new Error("Documents must have doc_role 'A' and 'B' assigned");
    }

    // Update workspace status
    await supabase
      .from("workspaces")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", workspaceId);

    // Process both documents in parallel
    const [resultA, resultB] = await Promise.all([
      processDocument(supabase, workspaceId, docA, 'A'),
      processDocument(supabase, workspaceId, docB, 'B'),
    ]);

    // Check for failures
    const failed = [resultA, resultB].filter(r => r.status === 'error');
    if (failed.length > 0) {
      const errors = failed.map(f => f.errorMessage).join('; ');
      throw new Error(`Extraction failed: ${errors}`);
    }

    // Update workspace status to extracted
    await supabase
      .from("workspaces")
      .update({
        status: "extracted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId);

    console.log(`[comparison-extract] Extraction complete for workspace ${workspaceId}`);

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id: workspaceId,
        results: {
          documentA: resultA,
          documentB: resultB,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    console.error("[comparison-extract] Error:", err);

    // Update workspace status to failed
    if (workspaceId) {
      try {
        await supabase
          .from("workspaces")
          .update({
            status: "failed",
            error_message: err.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);
      } catch (updateErr) {
        console.error("[comparison-extract] Failed to update status:", updateErr);
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// =============================================================================
// DOCUMENT PROCESSING
// =============================================================================

async function processDocument(
  supabase: any,
  workspaceId: string,
  document: WorkspaceDocument,
  docRole: 'A' | 'B'
): Promise<ExtractionResult> {
  const startTime = Date.now();

  try {
    console.log(`[comparison-extract] Processing document ${document.id} (${docRole}): ${document.file_name}`);

    // 1. Get document from storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from("workspace-documents")
      .download(document.file_url.replace(/^.*workspace-documents\//, ''));

    if (fileError || !fileData) {
      throw new Error(`Failed to download document: ${fileError?.message || 'Unknown error'}`);
    }

    // 2. Call Azure Document Intelligence
    console.log(`[comparison-extract] Calling Azure DI for ${document.file_name}`);
    const azureResult = await callAzureDocumentIntelligence(fileData);

    // 3. Assess quality
    const qualityScore = assessDocumentQuality(azureResult);
    console.log(`[comparison-extract] Quality score: ${(qualityScore * 100).toFixed(1)}%`);

    if (qualityScore < MIN_QUALITY_THRESHOLD) {
      throw new Error(`Document quality too low (${(qualityScore * 100).toFixed(1)}%). Minimum required: ${(MIN_QUALITY_THRESHOLD * 100).toFixed(0)}%`);
    }

    // Update document with quality score
    await supabase
      .from("workspace_documents")
      .update({
        quality_score: qualityScore,
        quality_tier: qualityScore >= 0.85 ? 'high' : qualityScore >= 0.70 ? 'medium' : 'low',
      })
      .eq("id", document.id);

    // 4. Build evidence catalog
    const evidenceCatalog = buildEvidenceCatalog(document.id, docRole, azureResult);
    console.log(`[comparison-extract] Built catalog with ${Object.keys(evidenceCatalog.entries).length} evidence entries`);

    // 5. Save evidence catalog
    await supabase
      .from("comparison_evidence_catalog")
      .upsert({
        workspace_id: workspaceId,
        workspace_document_id: document.id,
        doc_role: docRole,
        evidence_entries: evidenceCatalog.entries,
        evidence_by_potential_field: evidenceCatalog.byPotentialField,
        azure_raw_response: azureResult,
        azure_confidence_score: evidenceCatalog.avgConfidence,
        original_count: Object.keys(evidenceCatalog.entries).length,
        deduplicated_count: Object.keys(evidenceCatalog.entries).length,
        processing_time_ms: Date.now() - startTime,
      }, { onConflict: 'workspace_document_id' });

    // 6. Extract PolicySnapshot via LLM
    console.log(`[comparison-extract] Extracting PolicySnapshot for ${document.file_name}`);
    const snapshot = await extractPolicySnapshot(
      workspaceId,
      document,
      docRole,
      evidenceCatalog
    );

    // 7. Save snapshot
    const snapshotId = crypto.randomUUID();
    await supabase
      .from("policy_snapshots")
      .upsert({
        id: snapshotId,
        workspace_id: workspaceId,
        workspace_document_id: document.id,
        doc_role: docRole,
        document_type: snapshot.documentType,
        line_of_business: snapshot.lineOfBusiness,
        carrier: snapshot.carrier,
        carrier_naic: snapshot.carrierNaic,
        field_results: snapshot.fields,
        extraction_confidence: snapshot.extractionConfidence,
        total_fields: Object.keys(snapshot.fields).length,
        auto_applied_count: snapshot.autoAppliedCount,
        needs_review_count: snapshot.needsReviewCount,
        not_found_count: snapshot.notFoundCount,
        conflict_count: snapshot.conflictCount,
        status: 'extracted',
        versions: {
          promptVersion: '1.0.0',
          modelVersion: AZURE_DEPLOYMENT,
          extractionProfileVersion: '1.0.0',
          normalizationVersion: '1.0.0',
          comparisonEngineVersion: '1.0.0',
        },
        extracted_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    return {
      documentId: document.id,
      docRole,
      snapshotId,
      confidence: snapshot.extractionConfidence,
      status: 'success',
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err: unknown) {
    console.error(`[comparison-extract] Error processing ${document.id}:`, err);
    return {
      documentId: document.id,
      docRole,
      snapshotId: '',
      confidence: 0,
      status: 'error',
      errorMessage: err.message,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// AZURE DOCUMENT INTELLIGENCE
// =============================================================================

async function callAzureDocumentIntelligence(fileData: Blob): Promise<any> {
  const endpoint = AZURE_DI_ENDPOINT!.replace(/\/$/, '');
  const apiKey = AZURE_DI_KEY!;

  // Start analysis
  const analyzeUrl = `${endpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`;

  const startResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'Ocp-Apim-Subscription-Key': apiKey,
    },
    body: fileData,
  });

  if (!startResponse.ok) {
    const error = await startResponse.text();
    throw new Error(`Azure DI analysis failed: ${startResponse.status} - ${error}`);
  }

  // Get operation location
  const operationLocation = startResponse.headers.get('Operation-Location');
  if (!operationLocation) {
    throw new Error('Azure DI did not return Operation-Location header');
  }

  // Poll for result
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;

    const resultResponse = await fetch(operationLocation, {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    });

    if (!resultResponse.ok) {
      const error = await resultResponse.text();
      throw new Error(`Azure DI poll failed: ${resultResponse.status} - ${error}`);
    }

    const result = await resultResponse.json();

    if (result.status === 'succeeded') {
      return result.analyzeResult;
    } else if (result.status === 'failed') {
      throw new Error(`Azure DI analysis failed: ${result.error?.message || 'Unknown error'}`);
    }

    console.log(`[Azure DI] Status: ${result.status}, attempt ${attempts}/${maxAttempts}`);
  }

  throw new Error('Azure DI analysis timed out');
}

// =============================================================================
// QUALITY ASSESSMENT
// =============================================================================

function assessDocumentQuality(azureResult: any): number {
  const kvPairs = azureResult.keyValuePairs || [];
  const pages = azureResult.pages || [];

  if (kvPairs.length === 0 && pages.length === 0) {
    return 0;
  }

  // Calculate average confidence from key-value pairs
  let totalConfidence = 0;
  let count = 0;

  for (const kv of kvPairs) {
    if (kv.confidence) {
      totalConfidence += kv.confidence;
      count++;
    }
  }

  // Also consider page-level text confidence
  for (const page of pages) {
    for (const line of page.lines || []) {
      // Lines don't have confidence in DI v3, but words do
      for (const word of line.words || []) {
        if (word.confidence) {
          totalConfidence += word.confidence;
          count++;
        }
      }
    }
  }

  return count > 0 ? totalConfidence / count : 0.5;
}

// =============================================================================
// EVIDENCE CATALOG BUILDING
// =============================================================================

interface EvidenceEntry {
  evidenceId: string;
  sourceType: 'key_value' | 'table_cell' | 'text_span';
  label: string | null;
  value: string;
  confidence: number;
  pageNumber: number;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  tags: string[];
}

interface EvidenceCatalog {
  entries: Record<string, EvidenceEntry>;
  byPotentialField: Record<string, string[]>;
  avgConfidence: number;
}

// Field pattern matching
const FIELD_PATTERNS: Record<string, RegExp[]> = {
  NamedInsured: [/named\s*insured/i, /insured\s*name/i, /policyholder/i],
  PolicyNumber: [/policy\s*(number|no\.?|#)/i],
  EffectiveDate: [/effective\s*date/i, /eff\s*date/i, /inception/i],
  ExpirationDate: [/expiration\s*date/i, /exp\s*date/i],
  CarrierName: [/carrier/i, /insurance\s*company/i, /insurer/i],
  TotalPremium: [/total\s*premium/i, /annual\s*premium/i],
  GeneralAggregate: [/general\s*aggregate/i],
  EachOccurrence: [/each\s*occurrence/i, /per\s*occurrence/i],
};

function buildEvidenceCatalog(
  documentId: string,
  docRole: 'A' | 'B',
  azureResult: any
): EvidenceCatalog {
  const entries: Record<string, EvidenceEntry> = {};
  const byPotentialField: Record<string, string[]> = {};
  let totalConfidence = 0;
  let count = 0;
  let evidenceCounter = 0;

  // Process key-value pairs
  for (const kv of azureResult.keyValuePairs || []) {
    const keyContent = kv.key?.content?.trim();
    const valueContent = kv.value?.content?.trim();

    if (!valueContent) continue;

    evidenceCounter++;
    const evidenceId = generateStableId(documentId, evidenceCounter, kv.value?.boundingRegions?.[0], valueContent);

    const tags = inferFieldTags(keyContent || '', valueContent);
    const pageNumber = kv.value?.boundingRegions?.[0]?.pageNumber || 1;
    const boundingBox = extractBoundingBox(kv.value?.boundingRegions?.[0]?.polygon);

    const entry: EvidenceEntry = {
      evidenceId,
      sourceType: 'key_value',
      label: keyContent || null,
      value: valueContent,
      confidence: kv.confidence || 0.8,
      pageNumber,
      boundingBox,
      tags,
    };

    entries[evidenceId] = entry;
    totalConfidence += entry.confidence;
    count++;

    // Index by potential field
    for (const tag of tags) {
      if (!byPotentialField[tag]) byPotentialField[tag] = [];
      byPotentialField[tag].push(evidenceId);
    }
  }

  // Process tables
  for (const table of azureResult.tables || []) {
    const columnHeaders: Record<number, string> = {};

    for (const cell of table.cells || []) {
      if (cell.kind === 'columnHeader') {
        columnHeaders[cell.columnIndex] = cell.content;
      }
    }

    for (const cell of table.cells || []) {
      if (cell.kind !== 'content' || !cell.content?.trim()) continue;

      evidenceCounter++;
      const evidenceId = generateStableId(documentId, evidenceCounter, cell.boundingRegions?.[0], cell.content);

      const label = columnHeaders[cell.columnIndex] || null;
      const tags = inferFieldTags(label || '', cell.content);
      const pageNumber = cell.boundingRegions?.[0]?.pageNumber || 1;
      const boundingBox = extractBoundingBox(cell.boundingRegions?.[0]?.polygon);

      const entry: EvidenceEntry = {
        evidenceId,
        sourceType: 'table_cell',
        label,
        value: cell.content.trim(),
        confidence: cell.confidence || 0.85,
        pageNumber,
        boundingBox,
        tags,
      };

      entries[evidenceId] = entry;
      totalConfidence += entry.confidence;
      count++;

      for (const tag of tags) {
        if (!byPotentialField[tag]) byPotentialField[tag] = [];
        byPotentialField[tag].push(evidenceId);
      }
    }
  }

  return {
    entries,
    byPotentialField,
    avgConfidence: count > 0 ? totalConfidence / count : 0,
  };
}

function generateStableId(
  documentId: string,
  counter: number,
  boundingRegion: any,
  value: string
): string {
  // Simple hash function
  const composite = `${documentId}|${counter}|${boundingRegion?.pageNumber || 0}|${value.substring(0, 50)}`;
  let hash = 0;
  for (let i = 0; i < composite.length; i++) {
    hash = ((hash << 5) - hash) + composite.charCodeAt(i);
    hash = hash & hash;
  }
  return `E${Math.abs(hash).toString(16).toUpperCase().padStart(12, '0').substring(0, 12)}`;
}

function extractBoundingBox(polygon: number[] | undefined): { x: number; y: number; width: number; height: number } | null {
  if (!polygon || polygon.length < 8) return null;

  const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
  const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function inferFieldTags(label: string, value: string): string[] {
  const tags: string[] = [];

  for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(label)) {
        tags.push(fieldName);
        break;
      }
    }
  }

  // Value-based inference
  if (/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(value)) {
    if (!tags.includes('EffectiveDate') && !tags.includes('ExpirationDate')) {
      tags.push('Date');
    }
  }

  if (/^\$[\d,]+\.?\d*$/.test(value)) {
    if (!tags.some(t => ['TotalPremium', 'GeneralAggregate', 'EachOccurrence'].includes(t))) {
      tags.push('Currency');
    }
  }

  return [...new Set(tags)];
}

// =============================================================================
// POLICY SNAPSHOT EXTRACTION (LLM)
// =============================================================================

async function extractPolicySnapshot(
  workspaceId: string,
  document: WorkspaceDocument,
  docRole: 'A' | 'B',
  evidenceCatalog: EvidenceCatalog
): Promise<any> {
  const endpoint = AZURE_OPENAI_ENDPOINT!.replace(/\/$/, '');
  const apiKey = AZURE_OPENAI_KEY!;
  const url = `${endpoint}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;

  // Build system prompt
  const systemPrompt = `You are a Policy Extraction Engine for an insurance agency coverage comparison system.

## NON-NEGOTIABLE RULES

### Rule 1: NO GUESSING
You must NEVER guess, infer, or invent field values. You may ONLY:
- Extract values that appear in the evidence catalog
- Return NOT_FOUND if no suitable evidence exists
- Return CONFLICT if multiple contradictory values exist

### Rule 2: EVIDENCE REQUIRED
Every field value you extract MUST be traceable to an evidence_id from the provided catalog.

### Rule 3: STRICT JSON OUTPUT
Your response must be valid JSON. No markdown formatting.

### Rule 4: STATUS DETERMINATION
Assign status based on confidence:
- AUTO_APPLIED: Confidence >= 0.95
- NEEDS_REVIEW: Confidence 0.80-0.94
- NEEDS_VERIFICATION: Confidence 0.70-0.79
- LOW_CONFIDENCE: Confidence < 0.70
- NOT_FOUND: No suitable evidence
- CONFLICT: Multiple contradictory values

## OUTPUT STRUCTURE
{
  "documentType": "<dec_page|quote|policy|endorsement|loss_run|certificate|application|binder|unknown>",
  "lineOfBusiness": "<GL|AUTO|WC|PROP|UMBRELLA|BOP|EPLI|CYBER|PROF|UNKNOWN>",
  "carrier": "<carrier name or null>",
  "carrierNaic": "<5-digit NAIC or null>",
  "extractionConfidence": <0.0-1.0>,
  "fields": {
    "<field_name>": {
      "rawValue": "<extracted text>",
      "status": "AUTO_APPLIED|NEEDS_REVIEW|NEEDS_VERIFICATION|LOW_CONFIDENCE|NOT_FOUND|CONFLICT",
      "confidence": <0.0-1.0>,
      "evidenceIds": ["<evidence_id>", ...]
    }
  },
  "autoAppliedCount": <number>,
  "needsReviewCount": <number>,
  "notFoundCount": <number>,
  "conflictCount": <number>
}`;

  // Build user prompt with evidence catalog
  const evidenceList = Object.entries(evidenceCatalog.entries)
    .slice(0, 100)
    .map(([id, e]) => `- ${id}: [${e.label || 'no label'}] "${e.value.substring(0, 100)}" (${(e.confidence * 100).toFixed(0)}%, page ${e.pageNumber})${e.tags.length > 0 ? ` {${e.tags.join(', ')}}` : ''}`);

  const userPrompt = `Extract a PolicySnapshot from this document.

## DOCUMENT
- File: ${document.file_name}
- Role: Document ${docRole}
- Document Type Hint: ${document.document_type || 'unknown'}

## TARGET FIELDS
Extract these fields:
- NamedInsured (text, identifiers) [REQUIRED]
- PolicyNumber (identifier, identifiers) [REQUIRED]
- EffectiveDate (date, dates) [REQUIRED]
- ExpirationDate (date, dates) [REQUIRED]
- CarrierName (text, identifiers)
- CarrierNAIC (identifier, identifiers)
- GeneralAggregate (limit, limits)
- EachOccurrence (limit, limits)
- ProductsCompletedOps (limit, limits)
- PersonalAdvInjury (limit, limits)
- DamageToRentedPremises (limit, limits)
- MedicalExpense (limit, limits)
- TotalPremium (currency, premium)
- GLDeductible (deductible, deductibles)

## EVIDENCE CATALOG (${Object.keys(evidenceCatalog.entries).length} entries)
${evidenceList.join('\n')}

## TASK
Return a JSON PolicySnapshot. Reference evidence_ids for each extracted field.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM extraction failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('LLM returned empty response');
  }

  try {
    return JSON.parse(content);
  } catch (e) {
    // Try to extract JSON from markdown
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    throw new Error(`Failed to parse LLM response as JSON: ${e}`);
  }
}
