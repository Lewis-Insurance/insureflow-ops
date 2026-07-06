// ============================================================================
// COMMERCIAL PIPELINE CALCS (Commercial Lines SOW v3, closing rigor)
// ============================================================================
// Pure, unit-tested aggregation over the submission spine and its quotes:
// the funnel, per-carrier hit ratio, created-to-bound cycle time, and the
// 90/60/30 renewal runway over the commercial book. The page does the
// fetching; today is always passed in so every calc is deterministic.
// ============================================================================

// The submission spine's full status vocabulary (verified against the live
// CHECK constraint) - dropping a stage here silently undercounts the funnel.
export const FUNNEL_STAGES = [
  'draft', 'intake', 'packet_ready', 'signing', 'submitted', 'quoted', 'proposed', 'bound', 'lost', 'abandoned',
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface PipelineSubmission {
  id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
}

export interface PipelineQuote {
  id: string;
  status: string;
  premium: number | null;
  options: Record<string, unknown> | null;
  competitor_carrier: string | null;
}

export function funnelCounts(submissions: PipelineSubmission[]): { stage: FunnelStage; count: number }[] {
  const by = new Map<string, number>();
  for (const s of submissions) by.set(s.status, (by.get(s.status) ?? 0) + 1);
  return FUNNEL_STAGES.map((stage) => ({ stage, count: by.get(stage) ?? 0 }));
}

export interface CarrierHitRow {
  carrier: string;
  quoted: number;
  won: number;
  /** won / quoted, 0..1; null until the carrier has at least one closed quote. */
  ratio: number | null;
}

const carrierOf = (q: PipelineQuote): string => {
  const fromOptions = q.options && typeof q.options === 'object' ? q.options['carrier_name'] : null;
  return (typeof fromOptions === 'string' && fromOptions.trim()) || q.competitor_carrier || 'Unknown carrier';
};

/** Hit ratio by carrier, most-quoted first. Open quotes count as quoted
 *  only; the full closed vocabulary is won | lost | expired (the enum's
 *  fourth label) - an expired quote is a resolved non-win, not pending. */
export function carrierHitRatio(quotes: PipelineQuote[]): CarrierHitRow[] {
  const rows = new Map<string, { quoted: number; won: number; closed: number }>();
  for (const q of quotes) {
    const c = carrierOf(q);
    const r = rows.get(c) ?? { quoted: 0, won: 0, closed: 0 };
    r.quoted += 1;
    if (q.status === 'won') { r.won += 1; r.closed += 1; }
    else if (q.status === 'lost' || q.status === 'expired') r.closed += 1;
    rows.set(c, r);
  }
  return [...rows.entries()]
    .map(([carrier, r]) => ({
      carrier,
      quoted: r.quoted,
      won: r.won,
      ratio: r.closed > 0 ? r.won / r.closed : null,
    }))
    .sort((a, b) => b.quoted - a.quoted || a.carrier.localeCompare(b.carrier));
}

/**
 * Median whole days from created to BOUND on bound submissions. The bound
 * moment is the 'bound' submission event's timestamp (passed in as a map by
 * submission id) - updated_at is only the fallback, because any later touch
 * to a bound row moves it and would silently inflate the metric.
 */
export function medianDaysToBind(
  submissions: PipelineSubmission[],
  boundAtBySubmission: Record<string, string> = {},
): number | null {
  const days = submissions
    .filter((s) => s.status === 'bound')
    .map((s) => {
      const boundAt = boundAtBySubmission[s.id] ?? s.updated_at;
      if (!boundAt) return NaN;
      return (new Date(boundAt).getTime() - new Date(s.created_at).getTime()) / 86_400_000;
    })
    .filter((d) => Number.isFinite(d) && d >= 0)
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
  return Math.round(median);
}

// ---------------------------------------------------------------------------
// Renewal runway (90/60/30)
// ---------------------------------------------------------------------------

export type RunwayBucket = 'overdue' | '30' | '60' | '90' | 'later';

export interface RunwayPolicy {
  id: string;
  expiration_date: string | null;
}

export interface RunwayRow<T extends RunwayPolicy> {
  policy: T;
  daysOut: number;
  bucket: RunwayBucket;
}

/** The LOCAL calendar date as YYYY-MM-DD. toISOString() is UTC and rolls to
 *  tomorrow during the local evening, shifting every runway bucket a day. */
export function localDateIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Whole days from today (local midnight semantics: date-only math). */
export function daysUntil(dateIso: string, todayIso: string): number {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getTime();
  const t = new Date(`${todayIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((d - t) / 86_400_000);
}

export function runwayBucket(daysOut: number): RunwayBucket {
  if (daysOut < 0) return 'overdue';
  if (daysOut <= 30) return '30';
  if (daysOut <= 60) return '60';
  if (daysOut <= 90) return '90';
  return 'later';
}

/**
 * The 90/60/30 runway: dated policies sorted soonest-first, bucketed. The
 * caller filters to the commercial book; horizon trims the long tail (a
 * negative floor keeps recently-lapsed renewals visible for follow-up).
 */
export function renewalRunway<T extends RunwayPolicy>(
  policies: T[],
  todayIso: string,
  horizonDays = 120,
  overdueFloorDays = -30,
): RunwayRow<T>[] {
  return policies
    .filter((p) => !!p.expiration_date)
    .map((p) => {
      const daysOut = daysUntil(p.expiration_date as string, todayIso);
      return { policy: p, daysOut, bucket: runwayBucket(daysOut) };
    })
    .filter((r) => r.daysOut >= overdueFloorDays && r.daysOut <= horizonDays)
    .sort((a, b) => a.daysOut - b.daysOut);
}
