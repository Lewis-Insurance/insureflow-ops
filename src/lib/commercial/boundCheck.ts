// ============================================================================
// BOUND TERMS CHECK (Commercial Lines SOW v3, closing rigor)
// ============================================================================
// Policy checking, extraction-independent: the 'bound' submission event is
// the contract (bind_submission_quote logs every COI path it wrote, keyed by
// the dotted registry path), and the policy's live *_details blob is what
// the file says NOW. Diffing the two flags issued-policy drift: a carrier
// issuing different limits than were bound, a later manual edit, or an
// extraction overwriting bound values. Pure and unit-tested; the card that
// renders it does the fetching.
// ============================================================================

/** Envelope keys the bind event carries alongside the written terms. */
const ENVELOPE_KEYS = new Set(['quote_id', 'policy_id', 'line']);

export interface BoundTerm {
  /** Dotted COI registry path, e.g. cgl_details.limits.each_occurrence */
  path: string;
  value: unknown;
}

export type BoundTermState = 'match' | 'drifted' | 'missing';

export interface BoundTermComparison extends BoundTerm {
  label: string;
  current: unknown;
  state: BoundTermState;
}

/** The terms a bound event wrote: every dotted-path key, envelope excluded. */
export function extractBoundTerms(metadata: Record<string, unknown> | null | undefined): BoundTerm[] {
  if (!metadata || typeof metadata !== 'object') return [];
  return Object.entries(metadata)
    .filter(([k]) => !ENVELOPE_KEYS.has(k) && k.includes('.'))
    .map(([path, value]) => ({ path, value }));
}

/** Walk a dotted path through the policy row (blob column first segment). */
export function readPolicyPath(policy: Record<string, unknown> | null | undefined, path: string): unknown {
  if (!policy) return null;
  let node: unknown = policy;
  for (const seg of path.split('.')) {
    if (node == null || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[seg];
  }
  return node ?? null;
}

const BLOB_PREFIX_LABELS: Record<string, string> = {
  cgl_details: 'GL',
  property_details: 'Property',
  wc_details: 'WC',
  umbrella_details: 'Umbrella',
  bap_details: 'Auto',
};

/** Humanize a registry path: blob prefix + the last segment in words. */
export function boundTermLabel(path: string): string {
  const segs = path.split('.');
  const prefix = BLOB_PREFIX_LABELS[segs[0]] ?? segs[0];
  const leaf = (segs[segs.length - 1] ?? path).replace(/_/g, ' ');
  return `${prefix} ${leaf}`;
}

/**
 * Value-equal across the jsonb/number/string boundary: bound 1000000 must
 * match a stored "1000000" (save_master_coi_fields keeps jsonb scalars, but
 * extraction and manual edits write strings for some fields).
 */
export function boundValueEquals(bound: unknown, current: unknown): boolean {
  if (bound == null || current == null) return bound == null && current == null;
  if (bound === current) return true;
  const bn = Number(String(bound).replace(/[$,\s]/g, ''));
  const cn = Number(String(current).replace(/[$,\s]/g, ''));
  if (Number.isFinite(bn) && Number.isFinite(cn)) return bn === cn;
  return String(bound).trim().toLowerCase() === String(current).trim().toLowerCase();
}

/** Compare every bound term against the policy's live value. */
export function compareBoundTerms(
  metadata: Record<string, unknown> | null | undefined,
  policy: Record<string, unknown> | null | undefined,
): BoundTermComparison[] {
  return extractBoundTerms(metadata).map((t) => {
    const current = readPolicyPath(policy, t.path);
    const state: BoundTermState =
      current == null || current === '' ? 'missing'
        : boundValueEquals(t.value, current) ? 'match'
        : 'drifted';
    return { ...t, label: boundTermLabel(t.path), current, state };
  });
}
