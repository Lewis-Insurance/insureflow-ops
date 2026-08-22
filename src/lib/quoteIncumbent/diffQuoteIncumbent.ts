import type {
  ComparisonDifference,
  ComparisonResult,
  PolicySnapshot,
} from '@/types/coverage-comparison';
import { PolicyComparisonEngine } from '@/services/comparison/PolicyComparisonEngine';
import { coverageDisplayLabel } from '@/lib/quoteIncumbent/buildStructuredSnapshot';

export interface QuoteIncumbentDiffResult {
  incumbentSnapshot: PolicySnapshot;
  quoteSnapshot: PolicySnapshot;
  comparison: Omit<
    ComparisonResult,
    'id' | 'workspaceId' | 'executiveSummary' | 'recommendations' | 'keyFindings'
  >;
  /** Material differences only (excludes unchanged). */
  materialDifferences: ComparisonDifference[];
}

const engine = new PolicyComparisonEngine();

/**
 * Deterministic diff between structured incumbent (policy) and quote snapshots.
 * Designed for reuse by future bind-vs-quote flows.
 */
export function diffQuoteIncumbentSnapshots(
  incumbentSnapshot: PolicySnapshot,
  quoteSnapshot: PolicySnapshot,
): QuoteIncumbentDiffResult {
  const comparison = engine.compareSnapshots(incumbentSnapshot, quoteSnapshot);
  const materialDifferences = comparison.differences.filter((diff) => diff.changeType !== 'unchanged');

  return {
    incumbentSnapshot,
    quoteSnapshot,
    comparison,
    materialDifferences: materialDifferences.map(enrichDifferenceLabel),
  };
}

function enrichDifferenceLabel(diff: ComparisonDifference): ComparisonDifference {
  if (diff.fieldPath.startsWith('coverage_') || diff.fieldPath.startsWith('fee_')) {
    return {
      ...diff,
      label: coverageDisplayLabel(diff.fieldPath),
    };
  }
  return diff;
}

export function buildQuoteIncumbentDiff(
  incumbentSnapshot: PolicySnapshot,
  quoteSnapshot: PolicySnapshot,
): QuoteIncumbentDiffResult {
  return diffQuoteIncumbentSnapshots(incumbentSnapshot, quoteSnapshot);
}
