export interface PolicyRenewalRiskScoreRow {
  id: string;
  account_id: string;
  policy_id: string;
  policy_number: string | null;
  renewal_date: string;
  score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  top_factors: Array<{
    factor_key?: string;
    explanation?: string;
  }>;
}

export interface RetentionSaveListPlayResult {
  play_id: 'retention.save.list';
  play_version: '1.0.0';
  tier: 2;
  candidate_count: number;
  critical_count: number;
}

const SAVE_LIST_RISK_LEVELS = new Set(['high', 'critical']);

/** Play 7: ranked save-list cards from policy renewal risk scores. */
export function runRetentionSaveListPlay(
  scores: PolicyRenewalRiskScoreRow[],
): RetentionSaveListPlayResult {
  const eligible = scores.filter((row) => SAVE_LIST_RISK_LEVELS.has(row.risk_level));
  return {
    play_id: 'retention.save.list',
    play_version: '1.0.0',
    tier: 2,
    candidate_count: eligible.length,
    critical_count: eligible.filter((row) => row.risk_level === 'critical').length,
  };
}

export function rankRetentionSaveListScores(
  scores: PolicyRenewalRiskScoreRow[],
  limit = 10,
): PolicyRenewalRiskScoreRow[] {
  const severityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return scores
    .filter((row) => SAVE_LIST_RISK_LEVELS.has(row.risk_level))
    .sort((a, b) => {
      const levelDelta = (severityRank[b.risk_level] ?? 0) - (severityRank[a.risk_level] ?? 0);
      if (levelDelta !== 0) return levelDelta;
      return b.score - a.score;
    })
    .slice(0, limit);
}

export function retentionSaveListReason(row: PolicyRenewalRiskScoreRow): string {
  const top = row.top_factors?.[0]?.explanation;
  if (top) return top;
  return `Renewal ${row.renewal_date} — ${row.risk_level} risk (score ${Math.round(row.score * 100)}%)`;
}
