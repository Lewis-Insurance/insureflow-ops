export interface CoverageGapOpportunityRow {
  id: string;
  account_id: string;
  severity: 'low' | 'medium' | 'high';
  recommended_next_step: string | null;
  rationale: { rule_key?: string; trigger_reason?: string };
}

export interface CoverageGapRoundoutPlayResult {
  play_id: 'coverage.gap.roundout';
  play_version: '1.0.0';
  tier: 1;
  opportunity_count: number;
  high_severity_count: number;
}

/** Play 4 scaffold: summarize new coverage gap opportunities for internal roundout. */
export function runCoverageGapRoundoutPlay(
  opportunities: CoverageGapOpportunityRow[],
): CoverageGapRoundoutPlayResult {
  const highSeverity = opportunities.filter((row) => row.severity === 'high');
  return {
    play_id: 'coverage.gap.roundout',
    play_version: '1.0.0',
    tier: 1,
    opportunity_count: opportunities.length,
    high_severity_count: highSeverity.length,
  };
}
