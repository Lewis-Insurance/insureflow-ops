/**
 * Coverage Comparison Type System
 *
 * Strict schemas for:
 * - PolicySnapshot (ACORD-adjacent, comparison-focused)
 * - ComparisonResult (stable for UI/report/Q&A)
 * - Field normalization
 * - Extraction profiles
 * - Severity rubric
 * - Evidence stability
 */

import type { FieldStatus, FieldValidation } from '@/services/extraction/FieldResult';

// =============================================================================
// VERSION TRACKING
// =============================================================================

export interface VersionInfo {
  promptVersion: string;
  modelVersion: string;
  extractionProfileVersion: string;
  normalizationVersion: string;
  comparisonEngineVersion: string;
}

export const CURRENT_VERSIONS: VersionInfo = {
  promptVersion: '1.0.0',
  modelVersion: 'gpt-4o-2024-08-06',
  extractionProfileVersion: '1.0.0',
  normalizationVersion: '1.0.0',
  comparisonEngineVersion: '1.0.0',
};

// =============================================================================
// FIELD TYPES AND NORMALIZATION
// =============================================================================

export type FieldType =
  | 'currency'
  | 'date'
  | 'boolean'
  | 'limit'          // Currency with qualifiers (per occ, per claim, agg)
  | 'deductible'     // Currency with qualifiers
  | 'percentage'
  | 'text'
  | 'identifier'     // Policy number, NAIC, FEIN
  | 'count'          // Number of vehicles, locations, employees
  | 'list';          // Forms schedule, endorsements

export type LimitQualifier =
  | 'per_occurrence'
  | 'per_claim'
  | 'aggregate'
  | 'per_person'
  | 'per_accident'
  | 'combined_single'
  | 'statutory'
  | 'unknown';

export type BooleanValue = 'yes' | 'no' | 'included' | 'excluded' | 'unknown';

/** Normalized currency value */
export interface NormalizedCurrency {
  amount: number;
  currency: 'USD';
  rawValue: string;
  formatted: string; // "$1,000,000"
}

/** Normalized date value */
export interface NormalizedDate {
  isoDate: string;   // "2025-01-15"
  rawValue: string;  // "01/15/25"
  formatted: string; // "January 15, 2025"
}

/** Normalized limit value */
export interface NormalizedLimit {
  amount: number;
  qualifier: LimitQualifier;
  rawValue: string;
  formatted: string; // "$1,000,000 per occurrence"
}

/** Normalized value wrapper - type-safe normalization */
export type NormalizedValue =
  | { type: 'currency'; value: NormalizedCurrency }
  | { type: 'date'; value: NormalizedDate }
  | { type: 'boolean'; value: BooleanValue; rawValue: string }
  | { type: 'limit'; value: NormalizedLimit }
  | { type: 'percentage'; value: number; rawValue: string }
  | { type: 'text'; value: string; rawValue: string }
  | { type: 'identifier'; value: string; rawValue: string }
  | { type: 'count'; value: number; rawValue: string }
  | { type: 'list'; value: string[]; rawValue: string }
  | { type: 'not_found' }
  | { type: 'conflict'; candidates: string[] };

// =============================================================================
// EVIDENCE STABILITY
// =============================================================================

/**
 * Evidence entry with stable ID generation
 * ID = hash(doc_id + page + bbox_region + snippet_hash)
 */
export interface StableEvidence {
  evidenceId: string;  // Deterministic hash-based ID

  // Source document
  documentId: string;
  documentRole: 'A' | 'B';
  pageNumber: number;

  // Location (for bbox-based region stability)
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  regionId: string;  // Stable region ID even if snippet varies

  // Content
  snippet: string;
  snippetHash: string;
  confidence: number;

  // Source type
  sourceType: 'key_value' | 'table_cell' | 'text_span' | 'layout_element';

  // Deduplication
  isDuplicate: boolean;
  primaryEvidenceId?: string;  // If duplicate, points to primary
}

// =============================================================================
// POLICY SNAPSHOT CONTRACT
// ACORD-adjacent but comparison-focused stable structure
// =============================================================================

export type ComparisonCategory =
  | 'identifiers'
  | 'limits'
  | 'deductibles'
  | 'dates'
  | 'premium'
  | 'forms'
  | 'vehicles'
  | 'locations'
  | 'other';

export type DocumentType =
  | 'dec_page'
  | 'quote'
  | 'policy'
  | 'endorsement'
  | 'loss_run'
  | 'certificate'
  | 'application'
  | 'binder'
  | 'invoice'
  | 'unknown';

export type LineOfBusiness =
  | 'GL'           // General Liability
  | 'AUTO'         // Commercial Auto
  | 'WC'           // Workers Compensation
  | 'PROP'         // Property
  | 'UMBRELLA'     // Umbrella/Excess
  | 'BOP'          // Business Owners Policy
  | 'EPLI'         // Employment Practices
  | 'CYBER'        // Cyber Liability
  | 'PROF'         // Professional Liability
  | 'UNKNOWN';

/** Single field in a PolicySnapshot */
export interface SnapshotField {
  fieldName: string;
  fieldType: FieldType;
  category: ComparisonCategory;

  // Values
  rawValue: string | null;
  normalizedValue: NormalizedValue;
  displayValue: string;  // Human-readable formatted value

  // Extraction quality
  status: FieldStatus;
  confidenceRaw: number;
  confidenceCalibrated: number;
  validations: FieldValidation[];

  // Evidence trail
  evidenceIds: string[];
  primaryEvidenceId: string | null;

  // Conflict handling
  isConflict: boolean;
  conflictCandidates?: {
    value: string;
    evidenceIds: string[];
    confidence: number;
  }[];

  // Endorsement tracking
  isEndorsementOverride: boolean;
  overriddenValue?: string;
  endorsementEffectiveDate?: string;
}

/**
 * PolicySnapshot Contract
 * Stable cross-form structure for comparisons
 */
export interface PolicySnapshot {
  id: string;
  workspaceId: string;
  workspaceDocumentId: string;
  docRole: 'A' | 'B';

  // Document classification
  documentType: DocumentType;
  lineOfBusiness: LineOfBusiness;
  carrier: string | null;
  carrierNAIC: string | null;

  // Core identifiers
  namedInsured: SnapshotField;
  policyNumber: SnapshotField;
  effectiveDate: SnapshotField;
  expirationDate: SnapshotField;

  // All extracted fields (canonical keys)
  fields: Record<string, SnapshotField>;

  // Structured sections for quick access
  limits: Record<string, SnapshotField>;
  deductibles: Record<string, SnapshotField>;
  premiums: Record<string, SnapshotField>;
  forms: string[];  // Forms schedule as normalized list

  // Counts (for auto/property)
  vehicleCount: number | null;
  locationCount: number | null;
  employeeCount: number | null;

  // Extraction quality summary
  extractionConfidence: number;
  totalFields: number;
  autoAppliedCount: number;
  needsReviewCount: number;
  notFoundCount: number;
  conflictCount: number;

  // Status
  status: 'pending' | 'extracting' | 'extracted' | 'reviewed' | 'failed';
  errorMessage?: string;

  // Versioning
  versions: VersionInfo;
  extractedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// =============================================================================
// EXTRACTION PROFILES
// Different document types need different extraction strategies
// =============================================================================

export interface ExtractionProfile {
  profileId: string;
  profileVersion: string;
  documentTypes: DocumentType[];

  // Fields to extract (ordered by priority)
  targetFields: {
    fieldName: string;
    fieldType: FieldType;
    category: ComparisonCategory;
    required: boolean;  // Must-not-miss
    priority: number;   // 1 = highest
  }[];

  // Validators to apply
  validators: string[];

  // Sections to prioritize during OCR
  prioritySections: string[];

  // Anchor patterns for reliable extraction
  anchorPatterns: {
    pattern: string;
    fieldName: string;
    confidence: number;
  }[];
}

export const EXTRACTION_PROFILES: Record<string, ExtractionProfile> = {
  DEC_PAGE: {
    profileId: 'dec_page',
    profileVersion: '1.0.0',
    documentTypes: ['dec_page', 'policy'],
    targetFields: [
      { fieldName: 'NamedInsured', fieldType: 'text', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'PolicyNumber', fieldType: 'identifier', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'EffectiveDate', fieldType: 'date', category: 'dates', required: true, priority: 1 },
      { fieldName: 'ExpirationDate', fieldType: 'date', category: 'dates', required: true, priority: 1 },
      { fieldName: 'CarrierName', fieldType: 'text', category: 'identifiers', required: true, priority: 2 },
      { fieldName: 'CarrierNAIC', fieldType: 'identifier', category: 'identifiers', required: false, priority: 3 },
      { fieldName: 'GeneralAggregate', fieldType: 'limit', category: 'limits', required: false, priority: 2 },
      { fieldName: 'EachOccurrence', fieldType: 'limit', category: 'limits', required: false, priority: 2 },
      { fieldName: 'ProductsCompletedOps', fieldType: 'limit', category: 'limits', required: false, priority: 3 },
      { fieldName: 'PersonalAdvInjury', fieldType: 'limit', category: 'limits', required: false, priority: 3 },
      { fieldName: 'DamageToRentedPremises', fieldType: 'limit', category: 'limits', required: false, priority: 4 },
      { fieldName: 'MedicalExpense', fieldType: 'limit', category: 'limits', required: false, priority: 4 },
      { fieldName: 'TotalPremium', fieldType: 'currency', category: 'premium', required: false, priority: 2 },
      { fieldName: 'GLDeductible', fieldType: 'deductible', category: 'deductibles', required: false, priority: 3 },
    ],
    validators: ['date_order', 'limit_consistency', 'naic_format', 'policy_number_format'],
    prioritySections: ['declarations', 'coverage_summary', 'limits_schedule'],
    anchorPatterns: [
      { pattern: 'Named Insured', fieldName: 'NamedInsured', confidence: 0.95 },
      { pattern: 'Policy Number', fieldName: 'PolicyNumber', confidence: 0.95 },
      { pattern: 'Effective Date', fieldName: 'EffectiveDate', confidence: 0.95 },
    ],
  },

  QUOTE: {
    profileId: 'quote',
    profileVersion: '1.0.0',
    documentTypes: ['quote', 'binder'],
    targetFields: [
      { fieldName: 'NamedInsured', fieldType: 'text', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'EffectiveDate', fieldType: 'date', category: 'dates', required: true, priority: 1 },
      { fieldName: 'ExpirationDate', fieldType: 'date', category: 'dates', required: true, priority: 1 },
      { fieldName: 'CarrierName', fieldType: 'text', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'QuotedPremium', fieldType: 'currency', category: 'premium', required: true, priority: 1 },
      { fieldName: 'GeneralAggregate', fieldType: 'limit', category: 'limits', required: false, priority: 2 },
      { fieldName: 'EachOccurrence', fieldType: 'limit', category: 'limits', required: false, priority: 2 },
      // ... additional quote-specific fields
    ],
    validators: ['date_order', 'limit_consistency', 'premium_positive'],
    prioritySections: ['quote_summary', 'coverage_options', 'premium_breakdown'],
    anchorPatterns: [
      { pattern: 'Quote', fieldName: '_document_type', confidence: 0.90 },
      { pattern: 'Proposed Premium', fieldName: 'QuotedPremium', confidence: 0.95 },
    ],
  },

  LOSS_RUN: {
    profileId: 'loss_run',
    profileVersion: '1.0.0',
    documentTypes: ['loss_run'],
    targetFields: [
      { fieldName: 'NamedInsured', fieldType: 'text', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'PolicyNumber', fieldType: 'identifier', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'CarrierName', fieldType: 'text', category: 'identifiers', required: true, priority: 1 },
      { fieldName: 'ValuationDate', fieldType: 'date', category: 'dates', required: true, priority: 1 },
      { fieldName: 'TotalIncurred', fieldType: 'currency', category: 'other', required: false, priority: 2 },
      { fieldName: 'TotalPaid', fieldType: 'currency', category: 'other', required: false, priority: 2 },
      { fieldName: 'TotalReserves', fieldType: 'currency', category: 'other', required: false, priority: 2 },
      { fieldName: 'ClaimCount', fieldType: 'count', category: 'other', required: false, priority: 2 },
    ],
    validators: ['date_order', 'loss_totals_consistency'],
    prioritySections: ['loss_summary', 'claim_detail'],
    anchorPatterns: [
      { pattern: 'Loss Run', fieldName: '_document_type', confidence: 0.95 },
      { pattern: 'Valuation Date', fieldName: 'ValuationDate', confidence: 0.95 },
    ],
  },
};

// =============================================================================
// COMPARISON DIFFERENCE
// Strict schema for field-level differences
// =============================================================================

export type ChangeType =
  | 'unchanged'
  | 'increased'
  | 'decreased'
  | 'added'      // Present in B, not in A
  | 'removed'    // Present in A, not in B
  | 'modified';  // Different but not comparable numerically

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type DiffStatus =
  | 'auto_detected'
  | 'needs_review'
  | 'confirmed'
  | 'disputed'
  | 'ignored';

/**
 * ComparisonDifference - Single field difference
 * Stable schema for UI/report/Q&A
 */
export interface ComparisonDifference {
  // Field identification
  fieldPath: string;      // Canonical field name
  label: string;          // Human-readable label
  category: ComparisonCategory;
  fieldType: FieldType;

  // Raw values (as extracted)
  leftValueRaw: string | null;
  rightValueRaw: string | null;

  // Normalized values (for comparison)
  leftValueNormalized: NormalizedValue;
  rightValueNormalized: NormalizedValue;

  // Display values (formatted for UI)
  leftValueDisplay: string;
  rightValueDisplay: string;

  // Evidence trail (for click-to-highlight)
  leftEvidenceIds: string[];
  rightEvidenceIds: string[];

  // Diff classification
  changeType: ChangeType;
  severity: Severity;
  status: DiffStatus;

  // Confidence (from extraction)
  leftConfidence: number;
  rightConfidence: number;
  comparisonConfidence: number;  // Min of left/right

  // LLM-generated rationale (only for summary, NOT for diff calculation)
  rationale?: string;

  // Flags
  isEndorsementOverride: boolean;
  requiresVerification: boolean;  // Low confidence or conflict
}

// =============================================================================
// SEVERITY RUBRIC
// Consistent scoring to prevent noise
// =============================================================================

export interface SeverityRule {
  category: ComparisonCategory;
  fieldNames?: string[];  // Specific fields, or all in category
  baseWeight: number;     // 0-100
  criticalThreshold?: number;  // % change for critical
  highThreshold?: number;      // % change for high
}

export const SEVERITY_RUBRIC: SeverityRule[] = [
  // Critical identifiers (must match)
  { category: 'identifiers', fieldNames: ['NamedInsured'], baseWeight: 100 },
  { category: 'identifiers', fieldNames: ['PolicyNumber'], baseWeight: 95 },
  { category: 'identifiers', fieldNames: ['CarrierName', 'CarrierNAIC'], baseWeight: 90 },

  // Critical dates
  { category: 'dates', fieldNames: ['EffectiveDate', 'ExpirationDate'], baseWeight: 95 },

  // Limits (percentage-based severity)
  { category: 'limits', fieldNames: ['GeneralAggregate', 'EachOccurrence'], baseWeight: 85, criticalThreshold: 50, highThreshold: 20 },
  { category: 'limits', fieldNames: ['CombinedSingleLimit'], baseWeight: 85, criticalThreshold: 50, highThreshold: 20 },
  { category: 'limits', baseWeight: 70, criticalThreshold: 50, highThreshold: 25 },

  // Deductibles (inverse - increases are bad)
  { category: 'deductibles', baseWeight: 75, criticalThreshold: 100, highThreshold: 50 },

  // Premium (cost-sensitive)
  { category: 'premium', fieldNames: ['TotalPremium'], baseWeight: 80, criticalThreshold: 30, highThreshold: 15 },
  { category: 'premium', baseWeight: 60, criticalThreshold: 40, highThreshold: 20 },

  // Forms (added/removed)
  { category: 'forms', baseWeight: 65 },

  // Other
  { category: 'other', baseWeight: 40 },
];

/**
 * Calculate severity for a difference
 */
export function calculateSeverity(diff: ComparisonDifference): Severity {
  // Find applicable rule
  const rule = SEVERITY_RUBRIC.find(r =>
    r.category === diff.category &&
    (!r.fieldNames || r.fieldNames.includes(diff.fieldPath))
  ) || SEVERITY_RUBRIC.find(r => r.category === diff.category);

  if (!rule) return 'low';

  // Added/removed always high for critical categories
  if (diff.changeType === 'added' || diff.changeType === 'removed') {
    if (rule.baseWeight >= 85) return 'critical';
    if (rule.baseWeight >= 70) return 'high';
    return 'medium';
  }

  // Unchanged is always low
  if (diff.changeType === 'unchanged') return 'low';

  // Percentage-based for increased/decreased
  if ((diff.changeType === 'increased' || diff.changeType === 'decreased') && rule.criticalThreshold) {
    const percentChange = calculatePercentChange(diff);

    if (percentChange >= rule.criticalThreshold) return 'critical';
    if (rule.highThreshold && percentChange >= rule.highThreshold) return 'high';
    if (percentChange >= 10) return 'medium';
    return 'low';
  }

  // Modified uses base weight
  if (rule.baseWeight >= 85) return 'high';
  if (rule.baseWeight >= 60) return 'medium';
  return 'low';
}

function calculatePercentChange(diff: ComparisonDifference): number {
  // Extract numeric values for comparison
  const leftNum = extractNumericValue(diff.leftValueNormalized);
  const rightNum = extractNumericValue(diff.rightValueNormalized);

  if (leftNum === null || rightNum === null || leftNum === 0) return 0;

  return Math.abs((rightNum - leftNum) / leftNum) * 100;
}

function extractNumericValue(value: NormalizedValue): number | null {
  if (value.type === 'currency') return value.value.amount;
  if (value.type === 'limit') return value.value.amount;
  if (value.type === 'percentage') return value.value;
  if (value.type === 'count') return value.value;
  return null;
}

// =============================================================================
// DOCUMENT MISMATCH FLAGS
// Early detection of incompatible documents
// =============================================================================

export type MismatchType =
  | 'insured_mismatch'      // Named insured differs significantly
  | 'lob_mismatch'          // Line of business differs
  | 'carrier_mismatch'      // Different carriers (may be intentional for comparison)
  | 'term_mismatch'         // Effective periods don't overlap
  | 'doc_type_mismatch';    // Comparing incompatible doc types (loss run vs quote)

export interface DocMismatch {
  type: MismatchType;
  description: string;
  severity: 'blocker' | 'warning' | 'info';
  leftValue: string;
  rightValue: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

// =============================================================================
// COVERAGE GAP ANALYSIS
// =============================================================================

export interface CoverageGap {
  coverageType: string;
  missingIn: 'A' | 'B';
  severity: Severity;
  description: string;
  recommendation: string;
  evidenceIds: string[];
}

// =============================================================================
// UNCERTAINTY TRACKING
// Fields that need verification
// =============================================================================

export interface Uncertainty {
  fieldPath: string;
  reason: 'low_confidence' | 'conflict' | 'not_found' | 'endorsement_override' | 'validation_failed';
  description: string;
  affectedSide: 'A' | 'B' | 'both';
  confidence: number;
  suggestedAction: string;
}

// =============================================================================
// COMPARISON RESULT
// Stable schema for UI/report/Q&A
// =============================================================================

export interface ComparisonResult {
  id: string;
  workspaceId: string;

  // Source snapshots
  snapshotA: PolicySnapshot;
  snapshotB: PolicySnapshot;

  // Summary (computed deterministically, NOT by LLM)
  summary: {
    totalFieldsCompared: number;
    unchangedCount: number;
    increasedCount: number;
    decreasedCount: number;
    addedCount: number;
    removedCount: number;
    modifiedCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };

  // Field-level differences (deterministic)
  differences: ComparisonDifference[];

  // Grouped by category (for UI tabs)
  differencesByCategory: Record<ComparisonCategory, ComparisonDifference[]>;

  // Uncertainties (low confidence, conflicts, missing)
  uncertainties: Uncertainty[];

  // Document mismatch flags (for early detection)
  docMismatches: DocMismatch[];
  hasBlockingMismatch: boolean;

  // Coverage gaps
  coverageGaps: CoverageGap[];
  criticalGapsCount: number;

  // LLM-generated narrative (ONLY for description, NOT for diff calculation)
  executiveSummary?: string;
  recommendations?: string[];
  keyFindings?: string[];

  // Status
  status: 'pending' | 'comparing' | 'completed' | 'blocked' | 'failed';
  errorMessage?: string;

  // Versioning
  versions: VersionInfo;

  // Timestamps
  comparedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

// =============================================================================
// Q&A CONTEXT PACK
// Compact structure for grounded Q&A
// =============================================================================

export interface QAContextPack {
  // Compact snapshot summaries
  snapshotASummary: {
    docType: DocumentType;
    carrier: string | null;
    lob: LineOfBusiness;
    insured: string;
    term: { effective: string; expiration: string };
    keyLimits: Record<string, string>;
    premium: string | null;
  };

  snapshotBSummary: {
    docType: DocumentType;
    carrier: string | null;
    lob: LineOfBusiness;
    insured: string;
    term: { effective: string; expiration: string };
    keyLimits: Record<string, string>;
    premium: string | null;
  };

  // Diff summary (not full differences)
  diffSummary: {
    topChanges: { field: string; change: string; severity: Severity }[];
    criticalCount: number;
    highCount: number;
    gapsCount: number;
    uncertaintiesCount: number;
  };

  // Evidence index for citation
  evidenceIndex: Record<string, {
    snippet: string;
    docRole: 'A' | 'B';
    page: number;
  }>;
}

/**
 * Q&A Response with citations
 */
export interface QAResponse {
  answer: string;
  citations: {
    evidenceId: string;
    docRole: 'A' | 'B';
    snippet: string;
    relevance: string;
  }[];
  confidence: number;
}

// =============================================================================
// COMPARISON REPORT
// =============================================================================

export interface ComparisonReport {
  id: string;
  comparisonResultId: string;
  workspaceId: string;

  // Report files
  htmlUrl: string | null;
  pdfUrl: string | null;

  // Report type
  reportType: 'standard' | 'executive' | 'detailed' | 'client_facing';
  reportTitle: string;

  // Customization
  includeEvidence: boolean;
  includeRecommendations: boolean;
  includeGapAnalysis: boolean;
  brandingConfig: {
    logoUrl?: string;
    primaryColor?: string;
    agencyName?: string;
  };

  // Generation
  generatedAt: string;
  generatedBy: string;
  generationTimeMs: number;

  // Downloads
  downloadCount: number;
  lastDownloadedAt: string | null;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/** Comparison workspace with all related data */
export interface ComparisonWorkspace {
  id: string;
  name: string;
  status: 'idle' | 'processing' | 'completed' | 'failed';

  // Documents
  documentA: {
    id: string;
    fileName: string;
    fileUrl: string;
    documentType: DocumentType;
    qualityScore: number;
    qualityTier: string;
  } | null;

  documentB: {
    id: string;
    fileName: string;
    fileUrl: string;
    documentType: DocumentType;
    qualityScore: number;
    qualityTier: string;
  } | null;

  // Related records
  snapshotA: PolicySnapshot | null;
  snapshotB: PolicySnapshot | null;
  comparisonResult: ComparisonResult | null;
  reports: ComparisonReport[];

  // Timestamps
  createdAt: string;
  updatedAt: string;
}
