/**
 * Comparison Analyze Edge Function
 *
 * Performs DETERMINISTIC comparison of PolicySnapshots.
 * LLM is used ONLY to generate narrative summary - NOT to compute diffs.
 *
 * Flow:
 * 1. Fetch both PolicySnapshots
 * 2. Run deterministic comparison engine
 * 3. Generate executive summary via LLM
 * 4. Store in comparison_results
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
const AZURE_OPENAI_ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT");
const AZURE_OPENAI_KEY = Deno.env.get("AZURE_OPENAI_KEY");
const AZURE_DEPLOYMENT = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "gpt-4o";

// =============================================================================
// TYPES
// =============================================================================

type ComparisonCategory = 'identifiers' | 'limits' | 'deductibles' | 'dates' | 'premium' | 'forms' | 'vehicles' | 'locations' | 'other';
type ChangeType = 'unchanged' | 'increased' | 'decreased' | 'added' | 'removed' | 'modified';
type Severity = 'critical' | 'high' | 'medium' | 'low';

interface SnapshotField {
  fieldName: string;
  rawValue: string | null;
  status: string;
  confidence: number;
  evidenceIds: string[];
}

interface PolicySnapshot {
  id: string;
  doc_role: 'A' | 'B';
  document_type: string;
  line_of_business: string;
  carrier: string | null;
  carrier_naic: string | null;
  field_results: Record<string, SnapshotField>;
  extraction_confidence: number;
}

interface ComparisonDifference {
  fieldPath: string;
  label: string;
  category: ComparisonCategory;
  leftValueRaw: string | null;
  rightValueRaw: string | null;
  leftEvidenceIds: string[];
  rightEvidenceIds: string[];
  changeType: ChangeType;
  severity: Severity;
  leftConfidence: number;
  rightConfidence: number;
}

interface DocMismatch {
  type: string;
  description: string;
  severity: 'blocker' | 'warning' | 'info';
  leftValue: string;
  rightValue: string;
}

interface CoverageGap {
  coverageType: string;
  missingIn: 'A' | 'B';
  severity: Severity;
  description: string;
}

// =============================================================================
// SEVERITY RUBRIC
// =============================================================================

const SEVERITY_WEIGHTS: Record<ComparisonCategory, number> = {
  identifiers: 95,
  dates: 90,
  limits: 85,
  deductibles: 75,
  premium: 80,
  forms: 65,
  vehicles: 50,
  locations: 50,
  other: 40,
};

const CRITICAL_THRESHOLDS: Record<ComparisonCategory, number> = {
  identifiers: 0, // Any change is high
  dates: 0,
  limits: 50,
  deductibles: 100,
  premium: 30,
  forms: 0,
  vehicles: 0,
  locations: 0,
  other: 0,
};

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

    console.log(`[comparison-analyze] Starting analysis for workspace ${workspaceId}`);

    // Fetch PolicySnapshots
    const { data: snapshots, error: snapError } = await supabase
      .from("policy_snapshots")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (snapError || !snapshots) {
      throw new Error(`Failed to fetch snapshots: ${snapError?.message || 'Unknown'}`);
    }

    const snapshotA = snapshots.find((s: PolicySnapshot) => s.doc_role === 'A');
    const snapshotB = snapshots.find((s: PolicySnapshot) => s.doc_role === 'B');

    if (!snapshotA || !snapshotB) {
      throw new Error("Both snapshots A and B are required for comparison");
    }

    // Update workspace status
    await supabase
      .from("workspaces")
      .update({ status: "comparing", updated_at: new Date().toISOString() })
      .eq("id", workspaceId);

    // =========================================================================
    // DETERMINISTIC COMPARISON (NO LLM)
    // =========================================================================

    console.log("[comparison-analyze] Running deterministic comparison...");

    // Detect document mismatches
    const docMismatches = detectDocMismatches(snapshotA, snapshotB);

    // Compare all fields
    const differences = compareSnapshots(snapshotA, snapshotB);

    // Group by category
    const differencesByCategory = groupByCategory(differences);

    // Identify coverage gaps
    const coverageGaps = identifyCoverageGaps(snapshotA, snapshotB);

    // Calculate summary stats
    const summary = calculateSummary(differences);

    console.log(`[comparison-analyze] Found ${differences.length} differences`);
    console.log(`[comparison-analyze] Critical: ${summary.criticalCount}, High: ${summary.highCount}`);

    // =========================================================================
    // LLM NARRATIVE GENERATION (describes diffs, doesn't compute them)
    // =========================================================================

    let executiveSummary = "";
    let recommendations: string[] = [];
    let keyFindings: string[] = [];

    if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
      console.log("[comparison-analyze] Generating LLM narrative...");
      const narrative = await generateNarrative(
        snapshotA,
        snapshotB,
        differences,
        docMismatches,
        coverageGaps,
        summary
      );
      executiveSummary = narrative.executiveSummary;
      recommendations = narrative.recommendations;
      keyFindings = narrative.keyFindings;
    } else {
      console.log("[comparison-analyze] Skipping LLM narrative (no credentials)");
      executiveSummary = `Comparison of ${snapshotA.document_type} vs ${snapshotB.document_type} completed. Found ${summary.criticalCount} critical and ${summary.highCount} high-severity differences.`;
    }

    // =========================================================================
    // SAVE RESULTS
    // =========================================================================

    const resultId = crypto.randomUUID();
    const now = new Date().toISOString();

    await supabase
      .from("comparison_results")
      .upsert({
        id: resultId,
        workspace_id: workspaceId,
        snapshot_a_id: snapshotA.id,
        snapshot_b_id: snapshotB.id,
        field_differences: differences,
        differences_by_category: differencesByCategory,
        coverage_gaps: coverageGaps,
        global_mismatches: docMismatches,
        has_blocking_mismatch: docMismatches.some((m: DocMismatch) => m.severity === 'blocker'),
        summary_stats: summary,
        executive_summary: executiveSummary,
        recommendations,
        key_findings: keyFindings,
        status: 'completed',
        versions: {
          promptVersion: '1.0.0',
          modelVersion: AZURE_DEPLOYMENT,
          comparisonEngineVersion: '1.0.0',
        },
        compared_at: now,
      }, { onConflict: 'id' });

    // Update workspace status
    await supabase
      .from("workspaces")
      .update({
        status: "completed",
        updated_at: now,
      })
      .eq("id", workspaceId);

    console.log(`[comparison-analyze] Analysis complete for workspace ${workspaceId}`);

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id: workspaceId,
        result_id: resultId,
        summary,
        executive_summary: executiveSummary,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err: unknown) {
    console.error("[comparison-analyze] Error:", err);

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
        console.error("[comparison-analyze] Failed to update status:", updateErr);
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
// DETERMINISTIC COMPARISON ENGINE
// =============================================================================

function detectDocMismatches(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot
): DocMismatch[] {
  const mismatches: DocMismatch[] = [];

  // Named insured mismatch
  const insuredA = snapshotA.field_results?.NamedInsured?.rawValue || '';
  const insuredB = snapshotB.field_results?.NamedInsured?.rawValue || '';
  if (insuredA && insuredB && !areInsuredsSimilar(insuredA, insuredB)) {
    mismatches.push({
      type: 'insured_mismatch',
      description: 'Named insured differs significantly between documents',
      severity: 'warning',
      leftValue: insuredA,
      rightValue: insuredB,
    });
  }

  // LOB mismatch
  if (snapshotA.line_of_business !== snapshotB.line_of_business) {
    mismatches.push({
      type: 'lob_mismatch',
      description: 'Line of business differs between documents',
      severity: 'blocker',
      leftValue: snapshotA.line_of_business,
      rightValue: snapshotB.line_of_business,
    });
  }

  // Carrier mismatch (info - may be intentional)
  if (snapshotA.carrier && snapshotB.carrier && snapshotA.carrier !== snapshotB.carrier) {
    mismatches.push({
      type: 'carrier_mismatch',
      description: 'Carriers differ (may be intentional for quote comparison)',
      severity: 'info',
      leftValue: snapshotA.carrier,
      rightValue: snapshotB.carrier,
    });
  }

  return mismatches;
}

function areInsuredsSimilar(a: string, b: string): boolean {
  const normalizeInsured = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normA = normalizeInsured(a);
  const normB = normalizeInsured(b);

  // Simple similarity check
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Levenshtein distance check (rough)
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return true;

  let distance = 0;
  for (let i = 0; i < maxLen; i++) {
    if (normA[i] !== normB[i]) distance++;
  }

  return distance / maxLen < 0.3; // Allow 30% difference
}

function compareSnapshots(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot
): ComparisonDifference[] {
  const differences: ComparisonDifference[] = [];
  const fieldsA = snapshotA.field_results || {};
  const fieldsB = snapshotB.field_results || {};

  // Collect all field names
  const allFields = new Set([...Object.keys(fieldsA), ...Object.keys(fieldsB)]);

  for (const fieldName of allFields) {
    const fieldA = fieldsA[fieldName];
    const fieldB = fieldsB[fieldName];

    const diff = compareField(fieldName, fieldA, fieldB);
    if (diff) {
      differences.push(diff);
    }
  }

  // Sort by severity
  const severityOrder: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  differences.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return differences;
}

function compareField(
  fieldName: string,
  fieldA: SnapshotField | undefined,
  fieldB: SnapshotField | undefined
): ComparisonDifference | null {
  const category = inferCategory(fieldName);
  const label = formatFieldLabel(fieldName);

  const leftValue = fieldA?.rawValue || null;
  const rightValue = fieldB?.rawValue || null;

  // Determine change type
  let changeType: ChangeType;

  if (!leftValue && !rightValue) {
    return null; // Both missing - no diff
  } else if (!leftValue && rightValue) {
    changeType = 'added';
  } else if (leftValue && !rightValue) {
    changeType = 'removed';
  } else if (leftValue === rightValue) {
    changeType = 'unchanged';
  } else if (areValuesEquivalent(leftValue!, rightValue!, category)) {
    changeType = 'unchanged';
  } else {
    // Determine if increased/decreased for numeric fields
    changeType = determineChangeDirection(leftValue!, rightValue!, category);
  }

  // Skip unchanged
  if (changeType === 'unchanged') {
    return null;
  }

  // Calculate severity
  const severity = calculateSeverity(fieldName, category, changeType, leftValue, rightValue);

  return {
    fieldPath: fieldName,
    label,
    category,
    leftValueRaw: leftValue,
    rightValueRaw: rightValue,
    leftEvidenceIds: fieldA?.evidenceIds || [],
    rightEvidenceIds: fieldB?.evidenceIds || [],
    changeType,
    severity,
    leftConfidence: fieldA?.confidence || 0,
    rightConfidence: fieldB?.confidence || 0,
  };
}

function inferCategory(fieldName: string): ComparisonCategory {
  const name = fieldName.toLowerCase();

  if (['namedinsured', 'policynumber', 'carriername', 'carriernaic', 'fein'].some(k => name.includes(k.toLowerCase()))) {
    return 'identifiers';
  }
  if (['effectivedate', 'expirationdate', 'valuationdate'].some(k => name.includes(k.toLowerCase()))) {
    return 'dates';
  }
  if (['aggregate', 'occurrence', 'limit', 'injury', 'damage', 'expense'].some(k => name.includes(k.toLowerCase()))) {
    return 'limits';
  }
  if (name.includes('deductible') || name.includes('ded')) {
    return 'deductibles';
  }
  if (name.includes('premium')) {
    return 'premium';
  }
  if (name.includes('form') || name.includes('endorsement')) {
    return 'forms';
  }
  if (name.includes('vehicle')) {
    return 'vehicles';
  }
  if (name.includes('location')) {
    return 'locations';
  }

  return 'other';
}

function formatFieldLabel(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function areValuesEquivalent(a: string, b: string, category: ComparisonCategory): boolean {
  // Normalize for comparison
  const normA = normalizeForComparison(a, category);
  const normB = normalizeForComparison(b, category);
  return normA === normB;
}

function normalizeForComparison(value: string, category: ComparisonCategory): string {
  let normalized = value.trim().toLowerCase();

  // Currency normalization
  if (category === 'limits' || category === 'deductibles' || category === 'premium') {
    normalized = normalized.replace(/[$,]/g, '');
    // Handle M/K abbreviations
    normalized = normalized.replace(/(\d+)m$/i, (_, n) => String(parseInt(n) * 1000000));
    normalized = normalized.replace(/(\d+)k$/i, (_, n) => String(parseInt(n) * 1000));
  }

  // Date normalization
  if (category === 'dates') {
    // Try to parse and format
    const dateMatch = normalized.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dateMatch) {
      const month = dateMatch[1].padStart(2, '0');
      const day = dateMatch[2].padStart(2, '0');
      let year = dateMatch[3];
      if (year.length === 2) {
        year = (parseInt(year) > 50 ? '19' : '20') + year;
      }
      normalized = `${year}-${month}-${day}`;
    }
  }

  return normalized;
}

function determineChangeDirection(
  leftValue: string,
  rightValue: string,
  category: ComparisonCategory
): ChangeType {
  if (category !== 'limits' && category !== 'deductibles' && category !== 'premium') {
    return 'modified';
  }

  const leftNum = extractNumber(leftValue);
  const rightNum = extractNumber(rightValue);

  if (leftNum === null || rightNum === null) {
    return 'modified';
  }

  if (rightNum > leftNum) {
    return 'increased';
  } else if (rightNum < leftNum) {
    return 'decreased';
  }

  return 'modified';
}

function extractNumber(value: string): number | null {
  let cleaned = value.replace(/[$,]/g, '');

  // Handle M/K
  if (/(\d+)m$/i.test(cleaned)) {
    return parseInt(cleaned) * 1000000;
  }
  if (/(\d+)k$/i.test(cleaned)) {
    return parseInt(cleaned) * 1000;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function calculateSeverity(
  fieldName: string,
  category: ComparisonCategory,
  changeType: ChangeType,
  leftValue: string | null,
  rightValue: string | null
): Severity {
  const baseWeight = SEVERITY_WEIGHTS[category] || 40;

  // Added/removed high for important categories
  if (changeType === 'added' || changeType === 'removed') {
    if (baseWeight >= 85) return 'critical';
    if (baseWeight >= 70) return 'high';
    return 'medium';
  }

  // Percentage-based for numeric changes
  if ((changeType === 'increased' || changeType === 'decreased') && leftValue && rightValue) {
    const leftNum = extractNumber(leftValue);
    const rightNum = extractNumber(rightValue);

    if (leftNum !== null && rightNum !== null && leftNum > 0) {
      const percentChange = Math.abs((rightNum - leftNum) / leftNum) * 100;
      const threshold = CRITICAL_THRESHOLDS[category] || 0;

      if (threshold > 0 && percentChange >= threshold) return 'critical';
      if (percentChange >= 50) return 'high';
      if (percentChange >= 20) return 'medium';
      return 'low';
    }
  }

  // Default based on weight
  if (baseWeight >= 85) return 'high';
  if (baseWeight >= 60) return 'medium';
  return 'low';
}

function groupByCategory(
  differences: ComparisonDifference[]
): Record<ComparisonCategory, ComparisonDifference[]> {
  const grouped: Record<ComparisonCategory, ComparisonDifference[]> = {
    identifiers: [],
    limits: [],
    deductibles: [],
    dates: [],
    premium: [],
    forms: [],
    vehicles: [],
    locations: [],
    other: [],
  };

  for (const diff of differences) {
    grouped[diff.category].push(diff);
  }

  return grouped;
}

function identifyCoverageGaps(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const criticalCoverages = ['GeneralAggregate', 'EachOccurrence', 'BodilyInjury', 'PropertyDamage'];
  const importantCoverages = ['ProductsCompletedOps', 'PersonalAdvInjury', 'MedicalExpense', 'UMB'];

  const fieldsA = snapshotA.field_results || {};
  const fieldsB = snapshotB.field_results || {};

  for (const coverage of criticalCoverages) {
    const hasA = fieldsA[coverage]?.rawValue && fieldsA[coverage].status !== 'NOT_FOUND';
    const hasB = fieldsB[coverage]?.rawValue && fieldsB[coverage].status !== 'NOT_FOUND';

    if (hasA && !hasB) {
      gaps.push({
        coverageType: coverage,
        missingIn: 'B',
        severity: 'critical',
        description: `${formatFieldLabel(coverage)} present in Document A but missing in Document B`,
      });
    } else if (!hasA && hasB) {
      gaps.push({
        coverageType: coverage,
        missingIn: 'A',
        severity: 'critical',
        description: `${formatFieldLabel(coverage)} present in Document B but missing in Document A`,
      });
    }
  }

  for (const coverage of importantCoverages) {
    const hasA = fieldsA[coverage]?.rawValue && fieldsA[coverage].status !== 'NOT_FOUND';
    const hasB = fieldsB[coverage]?.rawValue && fieldsB[coverage].status !== 'NOT_FOUND';

    if (hasA && !hasB) {
      gaps.push({
        coverageType: coverage,
        missingIn: 'B',
        severity: 'high',
        description: `${formatFieldLabel(coverage)} present in Document A but missing in Document B`,
      });
    } else if (!hasA && hasB) {
      gaps.push({
        coverageType: coverage,
        missingIn: 'A',
        severity: 'high',
        description: `${formatFieldLabel(coverage)} present in Document B but missing in Document A`,
      });
    }
  }

  return gaps;
}

function calculateSummary(differences: ComparisonDifference[]): any {
  const summary = {
    totalFieldsCompared: differences.length,
    unchangedCount: 0,
    increasedCount: 0,
    decreasedCount: 0,
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
  };

  for (const diff of differences) {
    // Change type counts
    switch (diff.changeType) {
      case 'unchanged': summary.unchangedCount++; break;
      case 'increased': summary.increasedCount++; break;
      case 'decreased': summary.decreasedCount++; break;
      case 'added': summary.addedCount++; break;
      case 'removed': summary.removedCount++; break;
      case 'modified': summary.modifiedCount++; break;
    }

    // Severity counts
    switch (diff.severity) {
      case 'critical': summary.criticalCount++; break;
      case 'high': summary.highCount++; break;
      case 'medium': summary.mediumCount++; break;
      case 'low': summary.lowCount++; break;
    }
  }

  return summary;
}

// =============================================================================
// LLM NARRATIVE GENERATION
// =============================================================================

async function generateNarrative(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot,
  differences: ComparisonDifference[],
  docMismatches: DocMismatch[],
  coverageGaps: CoverageGap[],
  summary: any
): Promise<{ executiveSummary: string; recommendations: string[]; keyFindings: string[] }> {
  const endpoint = AZURE_OPENAI_ENDPOINT!.replace(/\/$/, '');
  const apiKey = AZURE_OPENAI_KEY!;
  const url = `${endpoint}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;

  const systemPrompt = `You are a Coverage Comparison Analyst for an insurance agency.

## SCOPE
- You generate executive summaries and recommendations from coverage comparison results
- You are given DETERMINISTIC diff results computed by a comparison engine
- Your job is to DESCRIBE the diffs in professional insurance language
- You do NOT compute or modify the diffs - they are already computed

## NON-NEGOTIABLE RULES

### Rule 1: USE ONLY PROVIDED DATA
You must ONLY describe differences that appear in the provided comparison result.
Do NOT invent or infer additional differences.

### Rule 2: PROFESSIONAL INSURANCE LANGUAGE
Write in clear, professional insurance terminology.

### Rule 3: PRIORITIZE BY SEVERITY
Lead with critical and high-severity differences.

### Rule 4: ACTIONABLE RECOMMENDATIONS
Provide specific recommendations like:
- "Increase GL aggregate to $2M to match competitor quote"
- NOT vague advice like "review the coverage differences"

## OUTPUT STRUCTURE
Return JSON:
{
  "executiveSummary": "<2-3 sentences>",
  "keyFindings": ["<finding 1>", "<finding 2>", ...],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", ...]
}`;

  // Build top differences for prompt
  const topDiffs = differences.slice(0, 15).map(d => ({
    field: d.label,
    leftValue: d.leftValueRaw || 'N/A',
    rightValue: d.rightValueRaw || 'N/A',
    changeType: d.changeType,
    severity: d.severity,
  }));

  const userPrompt = `Generate a narrative summary for this coverage comparison.

## DOCUMENTS
Document A: ${snapshotA.document_type} from ${snapshotA.carrier || 'Unknown Carrier'}
Document B: ${snapshotB.document_type} from ${snapshotB.carrier || 'Unknown Carrier'}

## SUMMARY STATISTICS
- Total Differences: ${differences.length}
- Critical: ${summary.criticalCount}
- High: ${summary.highCount}
- Medium: ${summary.mediumCount}
- Low: ${summary.lowCount}

## DOCUMENT MISMATCHES
${docMismatches.length > 0 ? docMismatches.map(m => `- [${m.severity.toUpperCase()}] ${m.type}: ${m.description}`).join('\n') : 'None'}

## TOP DIFFERENCES
${topDiffs.map(d => `- [${d.severity.toUpperCase()}] ${d.field}: ${d.leftValue} → ${d.rightValue} (${d.changeType})`).join('\n')}

## COVERAGE GAPS
${coverageGaps.length > 0 ? coverageGaps.map(g => `- [${g.severity.toUpperCase()}] ${g.coverageType} missing in ${g.missingIn}`).join('\n') : 'None'}

Generate an executive summary, key findings, and actionable recommendations.`;

  try {
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
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[comparison-analyze] LLM error: ${response.status} - ${error}`);
      throw new Error('LLM narrative generation failed');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned empty response');
    }

    return JSON.parse(content);
  } catch (err) {
    console.error("[comparison-analyze] Narrative generation error:", err);

    // Fallback narrative
    return {
      executiveSummary: `Comparison completed with ${summary.criticalCount} critical and ${summary.highCount} high-severity differences found between the two documents.`,
      keyFindings: [
        `Total of ${differences.length} field differences identified`,
        ...(summary.criticalCount > 0 ? [`${summary.criticalCount} critical differences require immediate attention`] : []),
        ...(coverageGaps.length > 0 ? [`${coverageGaps.length} coverage gaps identified`] : []),
      ],
      recommendations: [
        'Review all critical and high-severity differences before proceeding',
        ...(coverageGaps.length > 0 ? ['Address identified coverage gaps'] : []),
      ],
    };
  }
}
