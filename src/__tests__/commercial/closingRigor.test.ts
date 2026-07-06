// ============================================================================
// CLOSING RIGOR TESTS (Commercial Lines SOW v3)
// ============================================================================
// Pure-function coverage for the bound-terms diff (policy checking) and the
// pipeline calcs (funnel, hit ratio, cycle time, 90/60/30 runway).
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  boundTermLabel,
  boundValueEquals,
  compareBoundTerms,
  extractBoundTerms,
  readPolicyPath,
} from '@/lib/commercial/boundCheck';
import {
  FUNNEL_STAGES,
  carrierHitRatio,
  daysUntil,
  funnelCounts,
  localDateIso,
  medianDaysToBind,
  renewalRunway,
  runwayBucket,
} from '@/lib/commercial/pipeline';

// ---------------------------------------------------------------------------
// boundCheck
// ---------------------------------------------------------------------------

const BOUND_META = {
  quote_id: 'q1',
  policy_id: 'p1',
  line: 'gl',
  'cgl_details.limits.each_occurrence': 1000000,
  'cgl_details.limits.general_aggregate': 2000000,
};

describe('extractBoundTerms', () => {
  it('keeps dotted term paths and drops the envelope', () => {
    const terms = extractBoundTerms(BOUND_META);
    expect(terms.map((t) => t.path).sort()).toEqual([
      'cgl_details.limits.each_occurrence',
      'cgl_details.limits.general_aggregate',
    ]);
  });

  it('is empty for null or non-object metadata', () => {
    expect(extractBoundTerms(null)).toEqual([]);
    expect(extractBoundTerms(undefined)).toEqual([]);
  });
});

describe('readPolicyPath', () => {
  const policy = { cgl_details: { limits: { each_occurrence: '1000000' } } };
  it('walks the blob', () => {
    expect(readPolicyPath(policy, 'cgl_details.limits.each_occurrence')).toBe('1000000');
  });
  it('nulls on missing segments', () => {
    expect(readPolicyPath(policy, 'cgl_details.limits.missing')).toBeNull();
    expect(readPolicyPath(policy, 'wc_details.coverage.x')).toBeNull();
    expect(readPolicyPath(null, 'a.b')).toBeNull();
  });
});

describe('boundValueEquals', () => {
  it('matches across number/string and formatting', () => {
    expect(boundValueEquals(1000000, '1000000')).toBe(true);
    expect(boundValueEquals(1000000, '$1,000,000')).toBe(true);
    expect(boundValueEquals('Commercial Property', 'commercial property')).toBe(true);
  });
  it('detects real differences', () => {
    expect(boundValueEquals(1000000, 2000000)).toBe(false);
    expect(boundValueEquals('a', 'b')).toBe(false);
  });
});

describe('compareBoundTerms', () => {
  it('classifies match, drifted, and missing', () => {
    const policy = {
      cgl_details: { limits: { each_occurrence: '1000000', general_aggregate: 4000000 } },
    };
    const rows = compareBoundTerms(BOUND_META, policy);
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r.state]));
    expect(byPath['cgl_details.limits.each_occurrence']).toBe('match');
    expect(byPath['cgl_details.limits.general_aggregate']).toBe('drifted');

    const empty = compareBoundTerms(BOUND_META, { cgl_details: {} });
    expect(empty.every((r) => r.state === 'missing')).toBe(true);
  });

  it('labels terms with the blob prefix', () => {
    expect(boundTermLabel('cgl_details.limits.each_occurrence')).toBe('GL each occurrence');
    expect(boundTermLabel('bap_details.coverage.liability.csl_limit')).toBe('Auto csl limit');
  });
});

// ---------------------------------------------------------------------------
// pipeline
// ---------------------------------------------------------------------------

const sub = (status: string, created: string, updated?: string) => ({
  id: `${status}-${created}`,
  status,
  created_at: created,
  updated_at: updated ?? null,
});

describe('funnelCounts', () => {
  it('counts every stage, zero-filled, in order', () => {
    const rows = funnelCounts([sub('draft', '2026-01-01'), sub('bound', '2026-01-01'), sub('bound', '2026-01-02')]);
    expect(rows[0]).toEqual({ stage: 'draft', count: 1 });
    expect(rows.find((r) => r.stage === 'bound')?.count).toBe(2);
    expect(rows.find((r) => r.stage === 'quoted')?.count).toBe(0);
  });

  it('covers the FULL live status vocabulary (a dropped stage undercounts silently)', () => {
    // Mirrors the commercial_submissions CHECK constraint, verified live.
    expect([...FUNNEL_STAGES].sort()).toEqual(
      ['abandoned', 'bound', 'draft', 'intake', 'lost', 'packet_ready', 'proposed', 'quoted', 'signing', 'submitted'].sort(),
    );
    expect(funnelCounts([sub('proposed', '2026-01-01')]).find((r) => r.stage === 'proposed')?.count).toBe(1);
  });
});

describe('localDateIso', () => {
  it('formats the LOCAL calendar date, zero-padded', () => {
    // Local-time constructor: 9 Feb 2026 23:30 local stays 2026-02-09
    // regardless of what UTC says at that moment.
    expect(localDateIso(new Date(2026, 1, 9, 23, 30))).toBe('2026-02-09');
    expect(localDateIso(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});

describe('carrierHitRatio', () => {
  const q = (carrier: string | null, status: string, viaOptions = true) => ({
    id: `${carrier}-${status}-${Math.random().toString(36).slice(2, 6)}`,
    status,
    premium: null,
    options: viaOptions && carrier ? { carrier_name: carrier } : null,
    competitor_carrier: viaOptions ? null : carrier,
  });

  it('computes won over CLOSED quotes only, open quotes pending', () => {
    const rows = carrierHitRatio([
      q('Burlington', 'won'), q('Burlington', 'lost'), q('Burlington', 'open'),
      q('USLI', 'open'),
    ]);
    const burl = rows.find((r) => r.carrier === 'Burlington');
    expect(burl).toMatchObject({ quoted: 3, won: 1, ratio: 0.5 });
    expect(rows.find((r) => r.carrier === 'USLI')?.ratio).toBeNull();
  });

  it('falls back to competitor_carrier and sorts by volume', () => {
    const rows = carrierHitRatio([
      q('Bass', 'won', false), q('Bass', 'won', false), q('USLI', 'lost'),
    ]);
    expect(rows[0].carrier).toBe('Bass');
    expect(rows[0].ratio).toBe(1);
  });
});

describe('medianDaysToBind', () => {
  it('is null with no bound submissions', () => {
    expect(medianDaysToBind([sub('draft', '2026-01-01')])).toBeNull();
  });
  it('takes the median over bound submissions', () => {
    expect(medianDaysToBind([
      sub('bound', '2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z'),   // 4d
      sub('bound', '2026-01-01T00:00:00Z', '2026-01-11T00:00:00Z'),   // 10d
      sub('bound', '2026-01-01T00:00:00Z', '2026-01-07T00:00:00Z'),   // 6d
      sub('draft', '2026-01-01T00:00:00Z'),
    ])).toBe(6);
  });
});

describe('renewal runway', () => {
  const TODAY = '2026-07-06';
  const p = (id: string, x: string | null) => ({ id, expiration_date: x });

  it('buckets 90/60/30/overdue on day math', () => {
    expect(daysUntil('2026-07-16', TODAY)).toBe(10);
    expect(runwayBucket(10)).toBe('30');
    expect(runwayBucket(31)).toBe('60');
    expect(runwayBucket(61)).toBe('90');
    expect(runwayBucket(90)).toBe('90');
    expect(runwayBucket(-1)).toBe('overdue');
    expect(runwayBucket(91)).toBe('later');
  });

  it('sorts soonest-first, keeps a recent-overdue tail, trims the horizon', () => {
    const rows = renewalRunway(
      [p('far', '2026-12-25'), p('soon', '2026-07-20'), p('past', '2026-06-20'), p('ancient', '2026-01-01'), p('undated', null)],
      TODAY,
    );
    expect(rows.map((r) => r.policy.id)).toEqual(['past', 'soon']);
    expect(rows[0].bucket).toBe('overdue');
    expect(rows[1].bucket).toBe('30');
  });
});
