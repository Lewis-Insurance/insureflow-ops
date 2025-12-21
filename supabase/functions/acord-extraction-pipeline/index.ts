/**
 * ACORD Extraction Pipeline - Complete Implementation
 *
 * Evidence-backed, multi-candidate extraction with:
 * - Document quality assessment
 * - Multi-model OCR ensemble
 * - Candidate generation with scoring
 * - LLM-based field mapping (NOT guessing)
 * - Validation engine
 * - Review queue generation
 */

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// TYPE DEFINITIONS
// ============================================

interface ExtractionRequest {
  document_url: string;
  document_name: string;
  account_id?: string;
  acord_form_id?: string;
  target_forms?: string[]; // e.g., ["125", "126"]
  user_hints?: {
    doc_type?: string;
    carrier_name?: string;
    line_of_business?: string;
    source_type?: 'scanner' | 'photo' | 'native_pdf';
  };
  account_context?: {
    insured_names?: string[];
    addresses?: string[];
    policy_numbers?: string[];
    producer_info?: Record<string, string>;
  };
}

interface Evidence {
  id: string;
  page_index: number;
  bbox: { x: number; y: number; width: number; height: number };
  snippet_text: string;
  context_before?: string;
  context_after?: string;
  extraction_method: string;
  ocr_confidence: number;
}

interface Candidate {
  id: string;
  raw_value: string;
  normalized_value: string;
  evidence_ids: string[];
  score_overall: number;
  score_components: {
    ocr_confidence: number;
    label_proximity: number;
    format_match: number;
    location_prior: number;
    template_match: number;
    context_anchor: number;
  };
  rank: number;
}

interface FieldOutput {
  field_name: string;
  raw_value: string | null;
  normalized_value: string | null;
  status: 'AUTO_APPLIED' | 'NEEDS_REVIEW' | 'NEEDS_VERIFICATION' | 'NOT_FOUND' | 'CONFLICT';
  confidence_raw: number;
  confidence_calibrated: number;
  evidence_ids: string[];
  candidates: Candidate[];
  validations: { rule: string; passed: boolean; message: string; severity: string }[];
  conflict_reason?: string;
}

// ============================================
// QUALITY ASSESSMENT
// ============================================

function assessDocumentQuality(
  metadata: any,
  source_type: string
): { score: number; tier: string; issues: any[]; guidance: string[] } {
  const issues: any[] = [];
  const guidance: string[] = [];
  let score = 100;

  // Resolution check
  if (metadata.dpi && metadata.dpi < 300) {
    const penalty = Math.min(30, (300 - metadata.dpi) / 10);
    score -= penalty;
    issues.push({
      code: 'LOW_RESOLUTION',
      severity: metadata.dpi < 150 ? 'error' : 'warning',
      message: `Resolution is ${metadata.dpi} DPI (recommend 300+)`,
    });
    guidance.push('Use a scanner set to 300 DPI or higher');
  }

  // Source type penalties
  if (source_type === 'photo') {
    score -= 10;
    issues.push({
      code: 'PHONE_PHOTO',
      severity: 'warning',
      message: 'Document appears to be a phone photo',
    });
    guidance.push('Use scanner mode in your camera app or a flatbed scanner');
  }

  // Calculate tier
  let tier = 'excellent';
  if (score < 90) tier = 'good';
  if (score < 75) tier = 'acceptable';
  if (score < 50) tier = 'poor';
  if (score < 25) tier = 'unusable';

  return { score, tier, issues, guidance };
}

// ============================================
// OCR RUNNER (Azure Document Intelligence)
// ============================================

async function runOCR(
  endpoint: string,
  apiKey: string,
  documentUrl: string,
  models: string[]
): Promise<Map<string, any>> {
  const results = new Map<string, any>();

  for (const model of models) {
    try {
      const analyzeUrl = `${endpoint}/formrecognizer/documentModels/${model}:analyze?api-version=2023-07-31`;

      const response = await fetch(analyzeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': apiKey,
        },
        body: JSON.stringify({ urlSource: documentUrl }),
      });

      if (!response.ok) continue;

      const operationLocation = response.headers.get('Operation-Location');
      if (!operationLocation) continue;

      // Poll for results
      let result = null;
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const pollResponse = await fetch(operationLocation, {
          headers: { 'Ocp-Apim-Subscription-Key': apiKey },
        });

        const pollData = await pollResponse.json();

        if (pollData.status === 'succeeded') {
          result = pollData;
          break;
        } else if (pollData.status === 'failed') {
          break;
        }
      }

      if (result) {
        results.set(model, result.analyzeResult);
      }
    } catch (error) {
      console.error(`OCR model ${model} failed:`, error);
    }
  }

  return results;
}

// ============================================
// LAYOUT GRAPH BUILDER
// ============================================

function buildLayoutGraph(ocrResults: Map<string, any>): {
  words: any[];
  keyValues: any[];
  tables: any[];
  fullText: string;
} {
  const words: any[] = [];
  const keyValues: any[] = [];
  const tables: any[] = [];
  let fullText = '';

  // Use prebuilt-document as primary source
  const docResult = ocrResults.get('prebuilt-document');

  if (docResult) {
    // Extract words with bboxes
    if (docResult.pages) {
      for (const page of docResult.pages) {
        const pageIndex = page.pageNumber - 1;
        const pageWidth = page.width || 1;
        const pageHeight = page.height || 1;

        if (page.words) {
          for (const word of page.words) {
            words.push({
              content: word.content,
              page_index: pageIndex,
              bbox: word.polygon ? polygonToBbox(word.polygon, pageWidth, pageHeight) : null,
              confidence: word.confidence,
            });
          }
        }
      }
    }

    // Extract key-value pairs
    if (docResult.keyValuePairs) {
      for (const kv of docResult.keyValuePairs) {
        keyValues.push({
          key: kv.key?.content?.trim(),
          value: kv.value?.content?.trim(),
          key_bbox: kv.key?.boundingRegions?.[0],
          value_bbox: kv.value?.boundingRegions?.[0],
          confidence: kv.confidence,
        });
      }
    }

    // Extract tables
    if (docResult.tables) {
      for (const table of docResult.tables) {
        const rows: any[][] = [];
        for (const cell of table.cells || []) {
          if (!rows[cell.rowIndex]) rows[cell.rowIndex] = [];
          rows[cell.rowIndex][cell.columnIndex] = {
            content: cell.content,
            is_header: cell.kind === 'columnHeader',
            row_span: cell.rowSpan || 1,
            col_span: cell.columnSpan || 1,
          };
        }
        tables.push({
          rows,
          row_count: table.rowCount,
          col_count: table.columnCount,
          page_index: table.boundingRegions?.[0]?.pageNumber - 1 || 0,
        });
      }
    }

    // Full text
    fullText = docResult.content || '';
  }

  return { words, keyValues, tables, fullText };
}

function polygonToBbox(
  polygon: number[],
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  // Polygon is [x1,y1,x2,y2,x3,y3,x4,y4]
  const xs = [polygon[0], polygon[2], polygon[4], polygon[6]];
  const ys = [polygon[1], polygon[3], polygon[5], polygon[7]];

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: (minX / pageWidth) * 100,
    y: (minY / pageHeight) * 100,
    width: ((maxX - minX) / pageWidth) * 100,
    height: ((maxY - minY) / pageHeight) * 100,
  };
}

// ============================================
// CANDIDATE GENERATOR
// ============================================

const FIELD_PATTERNS: Record<string, { labels: string[]; regex?: RegExp; format?: string }> = {
  NamedInsured: {
    labels: ['named insured', 'insured', 'insured name', 'policyholder', 'applicant'],
  },
  PolicyNumber: {
    labels: ['policy number', 'policy no', 'policy #', 'pol no'],
    regex: /^[A-Z0-9\-]{5,30}$/i,
  },
  EffectiveDate: {
    labels: ['effective date', 'eff date', 'policy effective', 'inception'],
    regex: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
    format: 'MM/DD/YYYY',
  },
  ExpirationDate: {
    labels: ['expiration date', 'exp date', 'policy expiration', 'expiry'],
    regex: /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
    format: 'MM/DD/YYYY',
  },
  TotalPremium: {
    labels: ['total premium', 'premium', 'annual premium', 'total'],
    regex: /^\$?[\d,]+\.?\d{0,2}$/,
    format: 'currency',
  },
  GeneralAggregate: {
    labels: ['general aggregate', 'aggregate'],
    regex: /^\$?[\d,]+$/,
    format: 'currency',
  },
  EachOccurrence: {
    labels: ['each occurrence', 'per occurrence', 'occurrence'],
    regex: /^\$?[\d,]+$/,
    format: 'currency',
  },
  CarrierNAIC: {
    labels: ['naic', 'naic code', 'naic #'],
    regex: /^\d{5}$/,
  },
  FEIN: {
    labels: ['fein', 'federal id', 'tax id', 'ein'],
    regex: /^\d{2}-\d{7}$/,
  },
};

function generateCandidates(
  fieldName: string,
  layoutGraph: { words: any[]; keyValues: any[]; tables: any[]; fullText: string },
  templateMatch: any | null,
  accountContext: any | null
): Candidate[] {
  const candidates: Candidate[] = [];
  const fieldPattern = FIELD_PATTERNS[fieldName];

  if (!fieldPattern) return candidates;

  // 1. Check key-value pairs for label proximity
  for (const kv of layoutGraph.keyValues) {
    if (!kv.key || !kv.value) continue;

    const keyLower = kv.key.toLowerCase();
    const labelMatch = fieldPattern.labels.some(label => keyLower.includes(label));

    if (labelMatch) {
      let score_format = 1.0;
      if (fieldPattern.regex && !fieldPattern.regex.test(kv.value)) {
        score_format = 0.5;
      }

      candidates.push({
        id: crypto.randomUUID(),
        raw_value: kv.value,
        normalized_value: normalizeValue(kv.value, fieldPattern.format),
        evidence_ids: [],
        score_overall: 0, // Calculated below
        score_components: {
          ocr_confidence: kv.confidence || 0.8,
          label_proximity: 0.95,
          format_match: score_format,
          location_prior: 0.8,
          template_match: 0,
          context_anchor: 0,
        },
        rank: 0,
      });
    }
  }

  // 2. Regex search in full text (for fields without clear labels)
  if (fieldPattern.regex && candidates.length < 3) {
    const matches = layoutGraph.fullText.match(new RegExp(fieldPattern.regex, 'g'));
    if (matches) {
      for (const match of matches.slice(0, 5)) {
        if (!candidates.some(c => c.raw_value === match)) {
          candidates.push({
            id: crypto.randomUUID(),
            raw_value: match,
            normalized_value: normalizeValue(match, fieldPattern.format),
            evidence_ids: [],
            score_overall: 0,
            score_components: {
              ocr_confidence: 0.7,
              label_proximity: 0.3,
              format_match: 1.0,
              location_prior: 0.5,
              template_match: 0,
              context_anchor: 0,
            },
            rank: 0,
          });
        }
      }
    }
  }

  // 3. Account context anchoring
  if (accountContext) {
    for (const candidate of candidates) {
      if (fieldName === 'NamedInsured' && accountContext.insured_names) {
        for (const knownName of accountContext.insured_names) {
          const similarity = calculateSimilarity(candidate.raw_value, knownName);
          if (similarity > 0.7) {
            candidate.score_components.context_anchor = similarity;
          }
        }
      }
      if (fieldName === 'PolicyNumber' && accountContext.policy_numbers) {
        if (accountContext.policy_numbers.includes(candidate.raw_value)) {
          candidate.score_components.context_anchor = 1.0;
        }
      }
    }
  }

  // Calculate overall scores and rank
  for (const candidate of candidates) {
    const weights = {
      ocr_confidence: 0.2,
      label_proximity: 0.3,
      format_match: 0.2,
      location_prior: 0.1,
      template_match: 0.1,
      context_anchor: 0.1,
    };

    candidate.score_overall =
      candidate.score_components.ocr_confidence * weights.ocr_confidence +
      candidate.score_components.label_proximity * weights.label_proximity +
      candidate.score_components.format_match * weights.format_match +
      candidate.score_components.location_prior * weights.location_prior +
      candidate.score_components.template_match * weights.template_match +
      candidate.score_components.context_anchor * weights.context_anchor;
  }

  // Sort and rank
  candidates.sort((a, b) => b.score_overall - a.score_overall);
  candidates.forEach((c, i) => (c.rank = i + 1));

  return candidates;
}

function normalizeValue(value: string, format?: string): string {
  if (!value) return value;

  let normalized = value.trim();

  switch (format) {
    case 'currency':
      normalized = normalized.replace(/[$,]/g, '');
      break;
    case 'MM/DD/YYYY':
      // Parse and reformat date
      const dateMatch = normalized.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
      if (dateMatch) {
        let [, month, day, year] = dateMatch;
        if (year.length === 2) {
          year = parseInt(year) > 50 ? '19' + year : '20' + year;
        }
        normalized = `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
      }
      break;
  }

  return normalized;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  // Simple Jaccard similarity on words
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// ============================================
// LLM FIELD MAPPER (Claude)
// ============================================

const LLM_MAPPING_PROMPT = `You are an expert insurance document analyzer. Your task is to SELECT the best candidate for each ACORD field from the provided candidates list. You must NOT guess or invent values.

## RULES (STRICTLY ENFORCED):
1. Only select from the provided candidates for each field
2. If no suitable candidate exists, return status: "NOT_FOUND"
3. If multiple candidates are equally valid, return status: "CONFLICT" with the conflicting candidate IDs
4. Every selection must include the candidate_id you chose
5. Do NOT invent values. If evidence is insufficient, use NOT_FOUND.

## INPUT FORMAT:
For each field, you receive:
- field_name: The ACORD field
- candidates: Array of {id, raw_value, normalized_value, score_overall, evidence_snippet}
- validation_rules: What format/constraints apply

## OUTPUT FORMAT (JSON):
{
  "fields": [
    {
      "field_name": "NamedInsured",
      "selected_candidate_id": "uuid-here",
      "status": "AUTO_APPLIED",
      "confidence": 0.95,
      "reasoning": "Label 'Named Insured' directly precedes this value"
    },
    {
      "field_name": "PolicyNumber",
      "selected_candidate_id": null,
      "status": "NOT_FOUND",
      "confidence": 0,
      "reasoning": "No candidates match policy number format"
    },
    {
      "field_name": "EffectiveDate",
      "selected_candidate_id": null,
      "status": "CONFLICT",
      "conflict_candidates": ["uuid1", "uuid2"],
      "confidence": 0.6,
      "reasoning": "Two dates found, unclear which is effective vs expiration"
    }
  ]
}

## VALIDATION:
- For dates: Effective must be before Expiration
- For limits: Aggregate >= Occurrence
- For currency: Must be positive numbers
- For policy numbers: Must match carrier patterns if known`;

async function callLLMMapper(
  anthropicKey: string,
  fieldCandidates: Record<string, Candidate[]>,
  documentContext: string
): Promise<any> {
  const fieldPacks = Object.entries(fieldCandidates).map(([fieldName, candidates]) => ({
    field_name: fieldName,
    candidates: candidates.slice(0, 5).map(c => ({
      id: c.id,
      raw_value: c.raw_value,
      normalized_value: c.normalized_value,
      score_overall: c.score_overall,
    })),
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${LLM_MAPPING_PROMPT}\n\n## FIELD CANDIDATES:\n${JSON.stringify(fieldPacks, null, 2)}\n\n## DOCUMENT CONTEXT (first 10000 chars):\n${documentContext.substring(0, 10000)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';

  // Parse JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  return { fields: [] };
}

// ============================================
// VALIDATION ENGINE
// ============================================

interface ValidationResult {
  rule: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

function validateField(
  fieldName: string,
  value: string | null,
  allFields: Record<string, string | null>
): ValidationResult[] {
  const results: ValidationResult[] = [];

  if (!value) {
    return results;
  }

  // Date format
  if (['EffectiveDate', 'ExpirationDate', 'RetroDate'].includes(fieldName)) {
    const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(19|20)\d{2}$/;
    if (!dateRegex.test(value)) {
      results.push({
        rule: 'DATE_FORMAT',
        passed: false,
        message: `Invalid date format. Expected MM/DD/YYYY, got "${value}"`,
        severity: 'error',
      });
    }
  }

  // Date order
  if (fieldName === 'ExpirationDate' && allFields['EffectiveDate']) {
    const effDate = parseDate(allFields['EffectiveDate']);
    const expDate = parseDate(value);
    if (effDate && expDate && effDate >= expDate) {
      results.push({
        rule: 'DATE_ORDER',
        passed: false,
        message: 'Expiration date must be after effective date',
        severity: 'error',
      });
    }
  }

  // NAIC format
  if (fieldName === 'CarrierNAIC') {
    if (!/^\d{5}$/.test(value)) {
      results.push({
        rule: 'NAIC_FORMAT',
        passed: false,
        message: 'NAIC code must be exactly 5 digits',
        severity: 'error',
      });
    }
  }

  // FEIN format
  if (fieldName === 'FEIN') {
    if (!/^\d{2}-\d{7}$/.test(value)) {
      results.push({
        rule: 'FEIN_FORMAT',
        passed: false,
        message: 'FEIN must be in XX-XXXXXXX format',
        severity: 'warning',
      });
    }
  }

  // Currency positive
  if (['TotalPremium', 'GeneralAggregate', 'EachOccurrence'].includes(fieldName)) {
    const numValue = parseFloat(value.replace(/[,$]/g, ''));
    if (isNaN(numValue) || numValue < 0) {
      results.push({
        rule: 'CURRENCY_POSITIVE',
        passed: false,
        message: 'Value must be a positive number',
        severity: 'error',
      });
    }
  }

  // Aggregate >= Occurrence
  if (fieldName === 'GeneralAggregate' && allFields['EachOccurrence']) {
    const agg = parseFloat(value.replace(/[,$]/g, ''));
    const occ = parseFloat(allFields['EachOccurrence']!.replace(/[,$]/g, ''));
    if (!isNaN(agg) && !isNaN(occ) && agg < occ) {
      results.push({
        rule: 'AGGREGATE_GTE_OCCURRENCE',
        passed: false,
        message: 'General Aggregate should be >= Each Occurrence',
        severity: 'warning',
      });
    }
  }

  return results;
}

function parseDate(dateStr: string): Date | null {
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
}

// ============================================
// MAIN PIPELINE
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let extractionId: string | null = null;

  try {
    const request: ExtractionRequest = await req.json();

    console.log('========================================');
    console.log('ACORD EXTRACTION PIPELINE - START');
    console.log('========================================');
    console.log('Document:', request.document_name);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user
    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    // Create extraction record
    const { data: extraction, error: insertError } = await supabase
      .from('document_extractions')
      .insert({
        document_url: request.document_url,
        document_name: request.document_name,
        account_id: request.account_id || null,
        acord_form_id: request.acord_form_id || null,
        document_type: request.user_hints?.doc_type || 'unknown',
        status: 'processing',
        extraction_started_at: new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    extractionId = extraction.id;

    // Get signed URL
    let documentAccessUrl = request.document_url;
    if (request.document_url.includes('supabase') && request.document_url.includes('/storage/')) {
      const urlParts = request.document_url.split('/documents/');
      if (urlParts.length === 2) {
        const { data } = await supabase.storage.from('documents').createSignedUrl(urlParts[1], 3600);
        if (data) documentAccessUrl = data.signedUrl;
      }
    }

    // ========================================
    // STEP 1: Quality Assessment
    // ========================================
    console.log('STEP 1: Quality Assessment');
    const qualityAssessment = assessDocumentQuality(
      {}, // Would come from actual image analysis
      request.user_hints?.source_type || 'unknown'
    );
    console.log(`Quality Score: ${qualityAssessment.score} (${qualityAssessment.tier})`);

    // ========================================
    // STEP 2: Multi-Model OCR
    // ========================================
    console.log('STEP 2: Running OCR Models');

    const azureEndpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')!;
    const azureKey = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY')!;

    const ocrResults = await runOCR(
      azureEndpoint.replace(/\/$/, ''),
      azureKey,
      documentAccessUrl,
      ['prebuilt-document', 'prebuilt-layout']
    );

    console.log(`Completed ${ocrResults.size} OCR models`);

    // ========================================
    // STEP 3: Build Layout Graph
    // ========================================
    console.log('STEP 3: Building Layout Graph');
    const layoutGraph = buildLayoutGraph(ocrResults);
    console.log(`Words: ${layoutGraph.words.length}, KV Pairs: ${layoutGraph.keyValues.length}, Tables: ${layoutGraph.tables.length}`);

    // Store raw OCR
    await supabase
      .from('document_extractions')
      .update({
        azure_key_value_pairs: layoutGraph.keyValues,
        azure_tables: layoutGraph.tables,
        azure_text_content: layoutGraph.fullText.substring(0, 100000),
      })
      .eq('id', extractionId);

    // ========================================
    // STEP 4: Generate Candidates
    // ========================================
    console.log('STEP 4: Generating Candidates');

    const targetFields = [
      'NamedInsured', 'PolicyNumber', 'EffectiveDate', 'ExpirationDate',
      'CarrierName', 'CarrierNAIC', 'FEIN', 'TotalPremium',
      'GeneralAggregate', 'EachOccurrence', 'ProductsCompletedOps',
      'PersonalAdvInjury', 'DamageToRentedPremises', 'MedicalExpense',
      'CombinedSingleLimit', 'BodilyInjuryPerPerson', 'BodilyInjuryPerAccident',
    ];

    const fieldCandidates: Record<string, Candidate[]> = {};
    for (const field of targetFields) {
      fieldCandidates[field] = generateCandidates(
        field,
        layoutGraph,
        null, // Template match (todo)
        request.account_context
      );
    }

    const totalCandidates = Object.values(fieldCandidates).reduce((sum, c) => sum + c.length, 0);
    console.log(`Generated ${totalCandidates} candidates across ${targetFields.length} fields`);

    // ========================================
    // STEP 5: LLM Field Mapping
    // ========================================
    console.log('STEP 5: LLM Field Mapping');

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    let llmResult: any = { fields: [] };

    if (anthropicKey) {
      llmResult = await callLLMMapper(
        anthropicKey,
        fieldCandidates,
        layoutGraph.fullText
      );
      console.log(`LLM mapped ${llmResult.fields?.length || 0} fields`);
    }

    // ========================================
    // STEP 6: Build Field Outputs with Validation
    // ========================================
    console.log('STEP 6: Building Field Outputs');

    const fieldOutputs: FieldOutput[] = [];
    const allFieldValues: Record<string, string | null> = {};

    for (const field of targetFields) {
      const llmField = llmResult.fields?.find((f: any) => f.field_name === field);
      const candidates = fieldCandidates[field] || [];

      let output: FieldOutput;

      if (llmField?.selected_candidate_id) {
        const selectedCandidate = candidates.find(c => c.id === llmField.selected_candidate_id);

        if (selectedCandidate) {
          allFieldValues[field] = selectedCandidate.normalized_value;
          const validations = validateField(field, selectedCandidate.normalized_value, allFieldValues);
          const hasErrors = validations.some(v => !v.passed && v.severity === 'error');

          let status: FieldOutput['status'];
          if (hasErrors) {
            status = 'NEEDS_VERIFICATION';
          } else if (llmField.confidence >= 0.9) {
            status = 'AUTO_APPLIED';
          } else if (llmField.confidence >= 0.7) {
            status = 'NEEDS_REVIEW';
          } else {
            status = 'NEEDS_VERIFICATION';
          }

          output = {
            field_name: field,
            raw_value: selectedCandidate.raw_value,
            normalized_value: selectedCandidate.normalized_value,
            status,
            confidence_raw: llmField.confidence,
            confidence_calibrated: llmField.confidence, // Would use calibration table
            evidence_ids: selectedCandidate.evidence_ids,
            candidates,
            validations,
          };
        } else {
          output = {
            field_name: field,
            raw_value: null,
            normalized_value: null,
            status: 'NOT_FOUND',
            confidence_raw: 0,
            confidence_calibrated: 0,
            evidence_ids: [],
            candidates,
            validations: [],
          };
        }
      } else if (llmField?.status === 'CONFLICT') {
        output = {
          field_name: field,
          raw_value: null,
          normalized_value: null,
          status: 'CONFLICT',
          confidence_raw: llmField.confidence || 0.5,
          confidence_calibrated: llmField.confidence || 0.5,
          evidence_ids: [],
          candidates,
          validations: [],
          conflict_reason: llmField.reasoning,
        };
      } else if (candidates.length > 0) {
        // No LLM selection, use top candidate
        const topCandidate = candidates[0];
        allFieldValues[field] = topCandidate.normalized_value;
        const validations = validateField(field, topCandidate.normalized_value, allFieldValues);

        output = {
          field_name: field,
          raw_value: topCandidate.raw_value,
          normalized_value: topCandidate.normalized_value,
          status: topCandidate.score_overall >= 0.9 ? 'AUTO_APPLIED' :
                  topCandidate.score_overall >= 0.7 ? 'NEEDS_REVIEW' : 'NEEDS_VERIFICATION',
          confidence_raw: topCandidate.score_overall,
          confidence_calibrated: topCandidate.score_overall,
          evidence_ids: topCandidate.evidence_ids,
          candidates,
          validations,
        };
      } else {
        output = {
          field_name: field,
          raw_value: null,
          normalized_value: null,
          status: 'NOT_FOUND',
          confidence_raw: 0,
          confidence_calibrated: 0,
          evidence_ids: [],
          candidates: [],
          validations: [],
        };
      }

      fieldOutputs.push(output);
    }

    // ========================================
    // STEP 7: Calculate Summary Metrics
    // ========================================
    const metrics = {
      total_fields: fieldOutputs.length,
      auto_applied: fieldOutputs.filter(f => f.status === 'AUTO_APPLIED').length,
      needs_review: fieldOutputs.filter(f => f.status === 'NEEDS_REVIEW').length,
      needs_verification: fieldOutputs.filter(f => f.status === 'NEEDS_VERIFICATION').length,
      not_found: fieldOutputs.filter(f => f.status === 'NOT_FOUND').length,
      conflicts: fieldOutputs.filter(f => f.status === 'CONFLICT').length,
      avg_confidence: fieldOutputs.reduce((sum, f) => sum + f.confidence_calibrated, 0) / fieldOutputs.length,
    };

    // Determine overall confidence tier
    let confidenceTier = 'low';
    if (metrics.avg_confidence >= 0.9) confidenceTier = 'high';
    else if (metrics.avg_confidence >= 0.7) confidenceTier = 'medium';

    // ========================================
    // STEP 8: Update Extraction Record
    // ========================================
    const processingTime = Date.now() - startTime;

    const extractedFields: Record<string, any> = {};
    const confidenceScores: Record<string, number> = {};

    for (const output of fieldOutputs) {
      if (output.normalized_value) {
        extractedFields[output.field_name] = output.normalized_value;
        confidenceScores[output.field_name] = output.confidence_calibrated;
      }
    }

    await supabase
      .from('document_extractions')
      .update({
        extracted_fields: extractedFields,
        claude_confidence_scores: confidenceScores,
        confidence_tier: confidenceTier,
        review_status: confidenceTier === 'high' ? 'approved' : 'pending',
        auto_applied_fields: fieldOutputs.filter(f => f.status === 'AUTO_APPLIED').map(f => f.field_name),
        needs_review_fields: fieldOutputs.filter(f => f.status === 'NEEDS_REVIEW').map(f => f.field_name),
        flagged_fields: fieldOutputs.filter(f => f.status === 'NEEDS_VERIFICATION' || f.status === 'CONFLICT').map(f => f.field_name),
        status: 'mapped',
        extraction_completed_at: new Date().toISOString(),
      })
      .eq('id', extractionId);

    console.log('========================================');
    console.log('EXTRACTION COMPLETE');
    console.log(`Processing time: ${processingTime}ms`);
    console.log(`Confidence tier: ${confidenceTier}`);
    console.log(`Auto: ${metrics.auto_applied}, Review: ${metrics.needs_review}, Verify: ${metrics.needs_verification}, NotFound: ${metrics.not_found}, Conflict: ${metrics.conflicts}`);
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extractionId,
        quality_assessment: qualityAssessment,
        field_outputs: fieldOutputs,
        metrics,
        confidence_tier: confidenceTier,
        processing_time_ms: processingTime,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('EXTRACTION FAILED:', error.message);

    if (extractionId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      await supabase
        .from('document_extractions')
        .update({
          status: 'failed',
          error_message: error.message,
          extraction_completed_at: new Date().toISOString(),
        })
        .eq('id', extractionId);
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
