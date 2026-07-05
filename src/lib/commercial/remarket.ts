// ============================================================================
// REMARKET HELPERS (Commercial Lines SOW v3, feeder #5 - Phase 2)
// ============================================================================
// Pure functions for the one-click remarket clone: which commercial lines a
// policy contributes (client-side mirror of master_coi_lines' label
// crosswalk - the blob branch is irrelevant here because remarket targets the
// LINE, not the stored detail), and the prefilled submission fields.
// ============================================================================

import type { CommercialLineKey } from '@/types/commercial';

const hasBlob = (v: unknown): boolean =>
  v != null && typeof v === 'object' && Object.keys(v as object).length > 0;

/**
 * Map a policy's lines to commercial submission lines. Mirrors ALL of
 * public.master_coi_lines: non-empty detail blobs are authoritative first,
 * then the line_canonical crosswalk, then raw line_of_business patterns.
 * Returns [] when nothing matches.
 */
export function commercialLinesForPolicy(policy: {
  line_canonical?: string | null;
  line_of_business?: string | null;
  cgl_details?: unknown;
  bap_details?: unknown;
  umbrella_details?: unknown;
  wc_details?: unknown;
  property_details?: unknown;
}): CommercialLineKey[] {
  // Detail blobs prove the line regardless of how weak the labels are.
  const blobLines: CommercialLineKey[] = [
    hasBlob(policy.cgl_details) ? ('gl' as const) : null,
    hasBlob(policy.bap_details) ? ('auto' as const) : null,
    hasBlob(policy.umbrella_details) ? ('umbrella' as const) : null,
    hasBlob(policy.wc_details) ? ('wc' as const) : null,
    hasBlob(policy.property_details) ? ('property' as const) : null,
  ].filter((l): l is CommercialLineKey => l !== null);
  if (blobLines.length > 0) return blobLines;

  const canonical = (policy.line_canonical ?? '').trim();
  switch (canonical) {
    case 'General Liability': return ['gl'];
    case 'Commercial Auto': return ['auto'];
    case 'Workers Compensation': return ['wc'];
    case 'Commercial Property': return ['property'];
    case 'Business Owners Policy (BOP)': return ['gl', 'property'];
    case 'Personal Umbrella': return ['umbrella'];
    default: break;
  }
  const lob = (policy.line_of_business ?? '').toLowerCase();
  if (/work.*comp/.test(lob)) return ['wc'];
  if (lob.includes('umbrella') || lob.includes('excess')) return ['umbrella'];
  if (lob.includes('general liab') || lob === 'gl' || lob.includes('commercial general')) return ['gl'];
  if (lob.includes('commercial auto') || lob.includes('business auto') || lob === 'commercial_auto') return ['auto'];
  if (lob.includes('bop') || lob.includes('business owner')) return ['gl', 'property'];
  if (lob.includes('commercial prop') || lob === 'commercial_property') return ['property'];
  return [];
}

/** The prefilled note for a remarket submission (no em or en dashes). */
export function remarketNote(policy: {
  policy_number?: string | null;
  carrier?: string | null;
  expiration_date?: string | null;
}): string {
  const parts = [
    `Remarket of policy ${policy.policy_number?.trim() || '(no number)'}`,
    policy.carrier?.trim() ? `currently with ${policy.carrier.trim()}` : null,
    policy.expiration_date ? `expiring ${policy.expiration_date}` : null,
  ].filter(Boolean);
  return parts.join(', ') + '.';
}
