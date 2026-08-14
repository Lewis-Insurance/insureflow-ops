import type { RenewalIntelligenceSummary } from '@/hooks/useRenewalIntelligence';

export const EMPTY_RENEWAL_INTELLIGENCE_SUMMARY: RenewalIntelligenceSummary = {
  total_renewals: 0,
  renewals_next_30_days: 0,
  critical_risk: 0,
  high_risk: 0,
  medium_risk: 0,
  low_risk: 0,
  avg_risk_score: 0,
  active_campaigns: 0,
};

export type RenewalIntelligenceSummaryRow = {
  total_renewals: number | null;
  renewals_next_30_days: number | null;
  critical_risk: number | null;
  high_risk: number | null;
  medium_risk: number | null;
  low_risk: number | null;
  avg_risk_score: number | null;
  active_campaigns: number | null;
};

/** Map get_renewal_intelligence_summary RPC row to dashboard summary. */
export function mapRenewalIntelligenceSummaryRow(
  row: RenewalIntelligenceSummaryRow | null | undefined
): RenewalIntelligenceSummary {
  if (!row) {
    return { ...EMPTY_RENEWAL_INTELLIGENCE_SUMMARY };
  }

  return {
    total_renewals: row.total_renewals ?? 0,
    renewals_next_30_days: row.renewals_next_30_days ?? 0,
    critical_risk: row.critical_risk ?? 0,
    high_risk: row.high_risk ?? 0,
    medium_risk: row.medium_risk ?? 0,
    low_risk: row.low_risk ?? 0,
    avg_risk_score: row.avg_risk_score ?? 0,
    active_campaigns: row.active_campaigns ?? 0,
  };
}

/** PostgREST page size matches supabase/config.toml max_rows. */
export const SUPABASE_MAX_ROWS = 1000;

/**
 * Paginate a Supabase query until all rows are fetched (for lists that must be
 * complete, not for count-only dashboards).
 */
export async function fetchAllSupabaseRows<T>(
  buildQuery: (range: { from: number; to: number }) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize: number = SUPABASE_MAX_ROWS
): Promise<T[]> {
  const allRows: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery({ from, to });

    if (error) {
      throw new Error(error.message);
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      hasMore = data.length === pageSize;
      page += 1;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}
