/**
 * Policy Comparison Engine
 *
 * CRITICAL: This engine computes diffs DETERMINISTICALLY.
 * It does NOT use LLM for diff calculation.
 * LLM is only used later for narrative generation.
 *
 * Features:
 * - Deterministic field-by-field comparison
 * - Severity scoring using rubric
 * - Early document mismatch detection
 * - Coverage gap analysis
 * - Category-based grouping
 * - Uncertainty tracking
 */

import type {
  PolicySnapshot,
  SnapshotField,
  ComparisonResult,
  ComparisonDifference,
  ComparisonCategory,
  ChangeType,
  Severity,
  DiffStatus,
  DocMismatch,
  MismatchType,
  CoverageGap,
  Uncertainty,
  VersionInfo,
  CURRENT_VERSIONS,
  calculateSeverity,
} from '@/types/coverage-comparison';

import {
  areNormalizedValuesEqual,
  getDisplayValue,
  getNumericDifference,
  NORMALIZATION_VERSION,
} from './normalization';

export const COMPARISON_ENGINE_VERSION = '1.0.0';

// =============================================================================
// FIELD LABEL MAPPING
// =============================================================================

const FIELD_LABELS: Record<string, string> = {
  // Identifiers
  NamedInsured: 'Named Insured',
  PolicyNumber: 'Policy Number',
  CarrierName: 'Carrier',
  CarrierNAIC: 'Carrier NAIC',
  FEIN: 'Federal EIN',

  // Dates
  EffectiveDate: 'Effective Date',
  ExpirationDate: 'Expiration Date',

  // GL Limits
  GeneralAggregate: 'General Aggregate',
  EachOccurrence: 'Each Occurrence',
  ProductsCompletedOps: 'Products/Completed Ops',
  PersonalAdvInjury: 'Personal & Adv Injury',
  DamageToRentedPremises: 'Damage to Rented Premises',
  MedicalExpense: 'Medical Expense',

  // Auto Limits
  CombinedSingleLimit: 'Combined Single Limit',
  BodilyInjuryPerPerson: 'Bodily Injury (Per Person)',
  BodilyInjuryPerAccident: 'Bodily Injury (Per Accident)',
  PropertyDamage: 'Property Damage',

  // WC Limits
  WCStatutoryLimits: 'WC Statutory Limits',
  EmployersLiability: 'Employers Liability',

  // Umbrella
  UmbrellaOccurrence: 'Umbrella Occurrence',
  UmbrellaAggregate: 'Umbrella Aggregate',

  // Deductibles
  GLDeductible: 'GL Deductible',
  AutoDeductible: 'Auto Deductible',
  PropertyDeductible: 'Property Deductible',
  ComprehensiveDeductible: 'Comprehensive Deductible',
  CollisionDeductible: 'Collision Deductible',

  // Premium
  TotalPremium: 'Total Premium',
  GLPremium: 'GL Premium',
  AutoPremium: 'Auto Premium',
  WCPremium: 'WC Premium',
  PropertyPremium: 'Property Premium',
  QuotedPremium: 'Quoted Premium',

  // Counts
  VehicleCount: 'Number of Vehicles',
  LocationCount: 'Number of Locations',
  EmployeeCount: 'Number of Employees',
};

function getFieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] || fieldName.replace(/([A-Z])/g, ' $1').trim();
}

// =============================================================================
// DOCUMENT MISMATCH DETECTION
// =============================================================================

/**
 * Detect document-level mismatches early
 * These should block final report until acknowledged
 */
export function detectDocMismatches(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot
): DocMismatch[] {
  const mismatches: DocMismatch[] = [];

  // 1. Named Insured Mismatch
  const insuredA = snapshotA.namedInsured.normalizedValue;
  const insuredB = snapshotB.namedInsured.normalizedValue;

  if (insuredA.type !== 'not_found' && insuredB.type !== 'not_found') {
    if (!areInsuredsSimilar(getDisplayValue(insuredA), getDisplayValue(insuredB))) {
      mismatches.push({
        type: 'insured_mismatch',
        description: 'Named insured appears different between documents. Verify these are for the same account.',
        severity: 'blocker',
        leftValue: getDisplayValue(insuredA),
        rightValue: getDisplayValue(insuredB),
        acknowledged: false,
      });
    }
  }

  // 2. Line of Business Mismatch
  if (snapshotA.lineOfBusiness !== snapshotB.lineOfBusiness &&
      snapshotA.lineOfBusiness !== 'UNKNOWN' &&
      snapshotB.lineOfBusiness !== 'UNKNOWN') {
    mismatches.push({
      type: 'lob_mismatch',
      description: `Documents appear to be for different lines of business (${snapshotA.lineOfBusiness} vs ${snapshotB.lineOfBusiness}).`,
      severity: 'blocker',
      leftValue: snapshotA.lineOfBusiness,
      rightValue: snapshotB.lineOfBusiness,
      acknowledged: false,
    });
  }

  // 3. Document Type Mismatch (incompatible comparison)
  const incompatiblePairs: [string, string][] = [
    ['loss_run', 'quote'],
    ['loss_run', 'endorsement'],
    ['certificate', 'application'],
  ];

  for (const [typeA, typeB] of incompatiblePairs) {
    if ((snapshotA.documentType === typeA && snapshotB.documentType === typeB) ||
        (snapshotA.documentType === typeB && snapshotB.documentType === typeA)) {
      mismatches.push({
        type: 'doc_type_mismatch',
        description: `Comparing ${snapshotA.documentType} to ${snapshotB.documentType} may not be meaningful.`,
        severity: 'warning',
        leftValue: snapshotA.documentType,
        rightValue: snapshotB.documentType,
        acknowledged: false,
      });
    }
  }

  // 4. Term Mismatch (non-overlapping periods)
  const effA = snapshotA.effectiveDate.normalizedValue;
  const expA = snapshotA.expirationDate.normalizedValue;
  const effB = snapshotB.effectiveDate.normalizedValue;
  const expB = snapshotB.expirationDate.normalizedValue;

  if (effA.type === 'date' && expA.type === 'date' &&
      effB.type === 'date' && expB.type === 'date') {
    const aStart = new Date(effA.value.isoDate);
    const aEnd = new Date(expA.value.isoDate);
    const bStart = new Date(effB.value.isoDate);
    const bEnd = new Date(expB.value.isoDate);

    // Check if periods don't overlap at all
    if (aEnd < bStart || bEnd < aStart) {
      mismatches.push({
        type: 'term_mismatch',
        description: 'Policy terms do not overlap. These may be for different policy periods.',
        severity: 'warning',
        leftValue: `${effA.value.formatted} - ${expA.value.formatted}`,
        rightValue: `${effB.value.formatted} - ${expB.value.formatted}`,
        acknowledged: false,
      });
    }
  }

  // 5. Carrier Mismatch (informational, may be intentional for comparison)
  if (snapshotA.carrier && snapshotB.carrier &&
      snapshotA.carrier.toLowerCase() !== snapshotB.carrier.toLowerCase()) {
    mismatches.push({
      type: 'carrier_mismatch',
      description: 'Documents are from different carriers. This is expected when comparing quotes.',
      severity: 'info',
      leftValue: snapshotA.carrier,
      rightValue: snapshotB.carrier,
      acknowledged: false,
    });
  }

  return mismatches;
}

/**
 * Check if two insured names are similar enough to be the same entity
 */
function areInsuredsSimilar(a: string, b: string): boolean {
  const normalizeInsured = (name: string) =>
    name.toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/gi, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

  const normA = normalizeInsured(a);
  const normB = normalizeInsured(b);

  // Exact match after normalization
  if (normA === normB) return true;

  // One contains the other
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Check Levenshtein distance for typos
  const distance = levenshteinDistance(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  const similarity = 1 - (distance / maxLen);

  return similarity >= 0.85;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// =============================================================================
// FIELD COMPARISON
// =============================================================================

/**
 * Compare a single field between two snapshots
 */
function compareField(
  fieldName: string,
  fieldA: SnapshotField | null,
  fieldB: SnapshotField | null
): ComparisonDifference | null {
  // Skip if both are missing
  if (!fieldA && !fieldB) return null;

  const category = fieldA?.category || fieldB?.category || 'other';
  const fieldType = fieldA?.fieldType || fieldB?.fieldType || 'text';

  // Determine values
  const leftValueNormalized = fieldA?.normalizedValue || { type: 'not_found' as const };
  const rightValueNormalized = fieldB?.normalizedValue || { type: 'not_found' as const };

  // Determine change type
  let changeType: ChangeType;

  if (leftValueNormalized.type === 'not_found' && rightValueNormalized.type !== 'not_found') {
    changeType = 'added';
  } else if (leftValueNormalized.type !== 'not_found' && rightValueNormalized.type === 'not_found') {
    changeType = 'removed';
  } else if (areNormalizedValuesEqual(leftValueNormalized, rightValueNormalized)) {
    changeType = 'unchanged';
  } else {
    // Check for numeric difference
    const numDiff = getNumericDifference(leftValueNormalized, rightValueNormalized);
    if (numDiff) {
      changeType = numDiff.absolute > 0 ? 'increased' : 'decreased';
    } else {
      changeType = 'modified';
    }
  }

  // Build the difference object
  const diff: ComparisonDifference = {
    fieldPath: fieldName,
    label: getFieldLabel(fieldName),
    category,
    fieldType,

    leftValueRaw: fieldA?.rawValue || null,
    rightValueRaw: fieldB?.rawValue || null,
    leftValueNormalized,
    rightValueNormalized,
    leftValueDisplay: fieldA ? getDisplayValue(leftValueNormalized) : 'Not Found',
    rightValueDisplay: fieldB ? getDisplayValue(rightValueNormalized) : 'Not Found',

    leftEvidenceIds: fieldA?.evidenceIds || [],
    rightEvidenceIds: fieldB?.evidenceIds || [],

    changeType,
    severity: 'low', // Will be calculated below
    status: 'auto_detected',

    leftConfidence: fieldA?.confidenceCalibrated || 0,
    rightConfidence: fieldB?.confidenceCalibrated || 0,
    comparisonConfidence: Math.min(
      fieldA?.confidenceCalibrated || 0,
      fieldB?.confidenceCalibrated || 0
    ),

    isEndorsementOverride: fieldA?.isEndorsementOverride || fieldB?.isEndorsementOverride || false,
    requiresVerification: false,
  };

  // Calculate severity using rubric
  diff.severity = calculateSeverityForDiff(diff);

  // Mark as requiring verification if low confidence
  if (diff.comparisonConfidence < 0.70 ||
      fieldA?.status === 'CONFLICT' ||
      fieldB?.status === 'CONFLICT') {
    diff.requiresVerification = true;
    diff.status = 'needs_review';
  }

  return diff;
}

/**
 * Calculate severity for a difference using the rubric
 */
function calculateSeverityForDiff(diff: ComparisonDifference): Severity {
  // Import and use the calculateSeverity function from types
  // For now, implement inline

  const SEVERITY_WEIGHTS: Record<string, { base: number; criticalPct?: number; highPct?: number }> = {
    // Critical identifiers
    NamedInsured: { base: 100 },
    PolicyNumber: { base: 95 },
    CarrierName: { base: 90 },
    CarrierNAIC: { base: 90 },

    // Critical dates
    EffectiveDate: { base: 95 },
    ExpirationDate: { base: 95 },

    // Limits
    GeneralAggregate: { base: 85, criticalPct: 50, highPct: 20 },
    EachOccurrence: { base: 85, criticalPct: 50, highPct: 20 },
    CombinedSingleLimit: { base: 85, criticalPct: 50, highPct: 20 },
    ProductsCompletedOps: { base: 75, criticalPct: 50, highPct: 25 },
    PersonalAdvInjury: { base: 75, criticalPct: 50, highPct: 25 },

    // Deductibles
    GLDeductible: { base: 75, criticalPct: 100, highPct: 50 },
    AutoDeductible: { base: 75, criticalPct: 100, highPct: 50 },
    PropertyDeductible: { base: 75, criticalPct: 100, highPct: 50 },

    // Premium
    TotalPremium: { base: 80, criticalPct: 30, highPct: 15 },
    QuotedPremium: { base: 80, criticalPct: 30, highPct: 15 },
  };

  const fieldWeight = SEVERITY_WEIGHTS[diff.fieldPath] || { base: 50 };

  // Unchanged is always low
  if (diff.changeType === 'unchanged') return 'low';

  // Added/removed
  if (diff.changeType === 'added' || diff.changeType === 'removed') {
    if (fieldWeight.base >= 85) return 'critical';
    if (fieldWeight.base >= 70) return 'high';
    return 'medium';
  }

  // Increased/decreased with percentage thresholds
  if ((diff.changeType === 'increased' || diff.changeType === 'decreased') && fieldWeight.criticalPct) {
    const numDiff = getNumericDifference(diff.leftValueNormalized, diff.rightValueNormalized);
    if (numDiff) {
      const pctChange = Math.abs(numDiff.percentage);
      if (pctChange >= fieldWeight.criticalPct) return 'critical';
      if (fieldWeight.highPct && pctChange >= fieldWeight.highPct) return 'high';
      if (pctChange >= 10) return 'medium';
      return 'low';
    }
  }

  // Modified uses base weight
  if (fieldWeight.base >= 85) return 'high';
  if (fieldWeight.base >= 60) return 'medium';
  return 'low';
}

// =============================================================================
// COVERAGE GAP ANALYSIS
// =============================================================================

/**
 * Identify coverage gaps between documents
 */
function identifyCoverageGaps(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  // Critical coverages that should exist
  const criticalFields = [
    'GeneralAggregate',
    'EachOccurrence',
    'CombinedSingleLimit',
    'WCStatutoryLimits',
  ];

  // Important coverages
  const importantFields = [
    'ProductsCompletedOps',
    'PersonalAdvInjury',
    'EmployersLiability',
    'UmbrellaOccurrence',
  ];

  for (const fieldName of criticalFields) {
    const inA = snapshotA.fields[fieldName]?.normalizedValue.type !== 'not_found';
    const inB = snapshotB.fields[fieldName]?.normalizedValue.type !== 'not_found';

    if (inA && !inB) {
      gaps.push({
        coverageType: getFieldLabel(fieldName),
        missingIn: 'B',
        severity: 'critical',
        description: `${getFieldLabel(fieldName)} coverage is missing in Document B`,
        recommendation: `Add ${getFieldLabel(fieldName)} coverage to match Document A`,
        evidenceIds: snapshotA.fields[fieldName]?.evidenceIds || [],
      });
    } else if (!inA && inB) {
      gaps.push({
        coverageType: getFieldLabel(fieldName),
        missingIn: 'A',
        severity: 'critical',
        description: `${getFieldLabel(fieldName)} coverage is missing in Document A`,
        recommendation: `Document B has ${getFieldLabel(fieldName)} coverage that A lacks`,
        evidenceIds: snapshotB.fields[fieldName]?.evidenceIds || [],
      });
    }
  }

  for (const fieldName of importantFields) {
    const inA = snapshotA.fields[fieldName]?.normalizedValue.type !== 'not_found';
    const inB = snapshotB.fields[fieldName]?.normalizedValue.type !== 'not_found';

    if (inA && !inB) {
      gaps.push({
        coverageType: getFieldLabel(fieldName),
        missingIn: 'B',
        severity: 'high',
        description: `${getFieldLabel(fieldName)} coverage is missing in Document B`,
        recommendation: `Consider adding ${getFieldLabel(fieldName)} coverage`,
        evidenceIds: snapshotA.fields[fieldName]?.evidenceIds || [],
      });
    } else if (!inA && inB) {
      gaps.push({
        coverageType: getFieldLabel(fieldName),
        missingIn: 'A',
        severity: 'high',
        description: `${getFieldLabel(fieldName)} coverage is missing in Document A`,
        recommendation: `Document B includes ${getFieldLabel(fieldName)} coverage`,
        evidenceIds: snapshotB.fields[fieldName]?.evidenceIds || [],
      });
    }
  }

  // Check for inadequate limits
  const limitFields = ['GeneralAggregate', 'EachOccurrence', 'CombinedSingleLimit'];
  for (const fieldName of limitFields) {
    const fieldA = snapshotA.fields[fieldName];
    const fieldB = snapshotB.fields[fieldName];

    for (const [field, docRole] of [[fieldA, 'A'], [fieldB, 'B']] as const) {
      if (field?.normalizedValue.type === 'limit') {
        const amount = field.normalizedValue.value.amount;
        if (amount < 100000) {
          gaps.push({
            coverageType: getFieldLabel(fieldName),
            missingIn: docRole,
            severity: 'medium',
            description: `${getFieldLabel(fieldName)} limit is below $100,000 in Document ${docRole}`,
            recommendation: `Consider increasing ${getFieldLabel(fieldName)} to at least $100,000`,
            evidenceIds: field.evidenceIds,
          });
        }
      }
    }
  }

  return gaps.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// =============================================================================
// UNCERTAINTY TRACKING
// =============================================================================

/**
 * Identify fields that need verification
 */
function identifyUncertainties(
  snapshotA: PolicySnapshot,
  snapshotB: PolicySnapshot,
  differences: ComparisonDifference[]
): Uncertainty[] {
  const uncertainties: Uncertainty[] = [];

  // Check all fields for low confidence or conflicts
  const checkField = (field: SnapshotField | undefined, side: 'A' | 'B') => {
    if (!field) return;

    if (field.status === 'CONFLICT') {
      uncertainties.push({
        fieldPath: field.fieldName,
        reason: 'conflict',
        description: `${getFieldLabel(field.fieldName)} has conflicting values in Document ${side}`,
        affectedSide: side,
        confidence: field.confidenceCalibrated,
        suggestedAction: 'Review source document and select correct value',
      });
    } else if (field.confidenceCalibrated < 0.70) {
      uncertainties.push({
        fieldPath: field.fieldName,
        reason: 'low_confidence',
        description: `${getFieldLabel(field.fieldName)} extraction confidence is low in Document ${side}`,
        affectedSide: side,
        confidence: field.confidenceCalibrated,
        suggestedAction: 'Verify value against source document',
      });
    } else if (field.status === 'NOT_FOUND') {
      uncertainties.push({
        fieldPath: field.fieldName,
        reason: 'not_found',
        description: `${getFieldLabel(field.fieldName)} was not found in Document ${side}`,
        affectedSide: side,
        confidence: 0,
        suggestedAction: 'Check if field exists in source document',
      });
    } else if (field.isEndorsementOverride) {
      uncertainties.push({
        fieldPath: field.fieldName,
        reason: 'endorsement_override',
        description: `${getFieldLabel(field.fieldName)} was changed by an endorsement in Document ${side}`,
        affectedSide: side,
        confidence: field.confidenceCalibrated,
        suggestedAction: 'Verify endorsement effective date and change',
      });
    }
  };

  // Check key fields
  const keyFields = [
    'NamedInsured', 'PolicyNumber', 'EffectiveDate', 'ExpirationDate',
    'GeneralAggregate', 'EachOccurrence', 'TotalPremium',
  ];

  for (const fieldName of keyFields) {
    checkField(snapshotA.fields[fieldName], 'A');
    checkField(snapshotB.fields[fieldName], 'B');
  }

  // Add uncertainties from differences with verification required
  for (const diff of differences) {
    if (diff.requiresVerification && !uncertainties.some(u => u.fieldPath === diff.fieldPath)) {
      uncertainties.push({
        fieldPath: diff.fieldPath,
        reason: 'low_confidence',
        description: `${diff.label} comparison has low confidence`,
        affectedSide: 'both',
        confidence: diff.comparisonConfidence,
        suggestedAction: 'Verify both values before finalizing comparison',
      });
    }
  }

  return uncertainties;
}

// =============================================================================
// MAIN COMPARISON ENGINE
// =============================================================================

export class PolicyComparisonEngine {
  private versions: VersionInfo;

  constructor() {
    this.versions = {
      promptVersion: '1.0.0',
      modelVersion: 'n/a', // No model for deterministic diff
      extractionProfileVersion: '1.0.0',
      normalizationVersion: NORMALIZATION_VERSION,
      comparisonEngineVersion: COMPARISON_ENGINE_VERSION,
    };
  }

  /**
   * Main comparison method
   * DETERMINISTIC - no LLM calls
   */
  compareSnapshots(
    snapshotA: PolicySnapshot,
    snapshotB: PolicySnapshot
  ): Omit<ComparisonResult, 'id' | 'workspaceId' | 'executiveSummary' | 'recommendations' | 'keyFindings'> {
    // 1. Detect document mismatches early
    const docMismatches = detectDocMismatches(snapshotA, snapshotB);
    const hasBlockingMismatch = docMismatches.some(m => m.severity === 'blocker');

    // 2. Collect all field names from both snapshots
    const allFieldNames = new Set<string>([
      ...Object.keys(snapshotA.fields),
      ...Object.keys(snapshotB.fields),
    ]);

    // 3. Compare each field
    const differences: ComparisonDifference[] = [];
    for (const fieldName of allFieldNames) {
      const diff = compareField(
        fieldName,
        snapshotA.fields[fieldName] || null,
        snapshotB.fields[fieldName] || null
      );
      if (diff) {
        differences.push(diff);
      }
    }

    // 4. Sort differences by severity, then by field name
    differences.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.fieldPath.localeCompare(b.fieldPath);
    });

    // 5. Group by category
    const differencesByCategory: Record<ComparisonCategory, ComparisonDifference[]> = {
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
      differencesByCategory[diff.category].push(diff);
    }

    // 6. Calculate summary
    const summary = {
      totalFieldsCompared: differences.length,
      unchangedCount: differences.filter(d => d.changeType === 'unchanged').length,
      increasedCount: differences.filter(d => d.changeType === 'increased').length,
      decreasedCount: differences.filter(d => d.changeType === 'decreased').length,
      addedCount: differences.filter(d => d.changeType === 'added').length,
      removedCount: differences.filter(d => d.changeType === 'removed').length,
      modifiedCount: differences.filter(d => d.changeType === 'modified').length,
      criticalCount: differences.filter(d => d.severity === 'critical').length,
      highCount: differences.filter(d => d.severity === 'high').length,
      mediumCount: differences.filter(d => d.severity === 'medium').length,
      lowCount: differences.filter(d => d.severity === 'low').length,
    };

    // 7. Identify coverage gaps
    const coverageGaps = identifyCoverageGaps(snapshotA, snapshotB);
    const criticalGapsCount = coverageGaps.filter(g => g.severity === 'critical').length;

    // 8. Identify uncertainties
    const uncertainties = identifyUncertainties(snapshotA, snapshotB, differences);

    return {
      snapshotA,
      snapshotB,
      summary,
      differences,
      differencesByCategory,
      uncertainties,
      docMismatches,
      hasBlockingMismatch,
      coverageGaps,
      criticalGapsCount,
      status: hasBlockingMismatch ? 'blocked' : 'completed',
      versions: this.versions,
      comparedAt: new Date().toISOString(),
    };
  }

  /**
   * Get a compact summary for Q&A context
   */
  getCompactSummary(result: ComparisonResult): {
    topChanges: { field: string; change: string; severity: Severity }[];
    criticalCount: number;
    highCount: number;
    gapsCount: number;
    uncertaintiesCount: number;
  } {
    // Get top 5 most significant changes
    const significantChanges = result.differences
      .filter(d => d.changeType !== 'unchanged')
      .slice(0, 5);

    const topChanges = significantChanges.map(d => ({
      field: d.label,
      change: this.describeChange(d),
      severity: d.severity,
    }));

    return {
      topChanges,
      criticalCount: result.summary.criticalCount,
      highCount: result.summary.highCount,
      gapsCount: result.coverageGaps.length,
      uncertaintiesCount: result.uncertainties.length,
    };
  }

  /**
   * Describe a change in human-readable form
   */
  private describeChange(diff: ComparisonDifference): string {
    switch (diff.changeType) {
      case 'unchanged':
        return `No change (${diff.leftValueDisplay})`;
      case 'added':
        return `Added in B: ${diff.rightValueDisplay}`;
      case 'removed':
        return `Removed (was: ${diff.leftValueDisplay})`;
      case 'increased': {
        const numDiff = getNumericDifference(diff.leftValueNormalized, diff.rightValueNormalized);
        if (numDiff) {
          return `Increased ${numDiff.percentage.toFixed(1)}% (${diff.leftValueDisplay} → ${diff.rightValueDisplay})`;
        }
        return `Increased (${diff.leftValueDisplay} → ${diff.rightValueDisplay})`;
      }
      case 'decreased': {
        const numDiff = getNumericDifference(diff.leftValueNormalized, diff.rightValueNormalized);
        if (numDiff) {
          return `Decreased ${Math.abs(numDiff.percentage).toFixed(1)}% (${diff.leftValueDisplay} → ${diff.rightValueDisplay})`;
        }
        return `Decreased (${diff.leftValueDisplay} → ${diff.rightValueDisplay})`;
      }
      case 'modified':
        return `Changed: ${diff.leftValueDisplay} → ${diff.rightValueDisplay}`;
      default:
        return `${diff.leftValueDisplay} → ${diff.rightValueDisplay}`;
    }
  }
}

// Export singleton instance
export const policyComparisonEngine = new PolicyComparisonEngine();
