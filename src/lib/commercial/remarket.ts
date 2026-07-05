// ============================================================================
// REMARKET HELPERS (Commercial Lines SOW v3, feeder #5 - Phase 2)
// ============================================================================
// Pure functions for the one-click remarket clone: which commercial lines a
// policy contributes (client-side mirror of master_coi_lines' label
// crosswalk - the blob branch is irrelevant here because remarket targets the
// LINE, not the stored detail), and the prefilled submission fields.
// ============================================================================

import type { CommercialLineKey } from '@/types/commercial';

/**
 * Map a policy's line labels to commercial submission lines. Mirrors the
 * label branches of public.master_coi_lines (line_canonical crosswalk first,
 * then raw line_of_business patterns). Returns [] when nothing matches.
 */
export function commercialLinesForPolicy(policy: {
  line_canonical?: string | null;
  line_of_business?: string | null;
}): CommercialLineKey[] {
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
