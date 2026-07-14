// ============================================================================
// HOLDER-SCOPED ENDORSEMENT STATUS HOOK (blueprint D Section 5.1, R2)
// ============================================================================
// Thin React-Query wrapper over the deployed SECURITY DEFINER RPC
// resolve_holder_endorsements(p_account_id uuid, p_holder_id uuid,
// p_policy_ids uuid[]) -> TABLE(line_key, addl_insd_resolved, subr_wvd_resolved,
// basis) (fully specified in 02-master-coi-data-layer.md Section 4.7).
//
// The generator's per-line ADDL INSD / SUBR WVD toggle gate reads from this hook;
// the generate-certificate edge function calls the SAME RPC server-side, so the
// gate and the printed Y/N can never disagree (R2). Only 'endorsed' can print Y.
//
// The RPC is not in the generated Supabase types, so the SETOF rows are bound via
// the `as unknown as` cast exactly like Phase 4's useAdditionalInsureds.ts and
// useCertificates.ts do. Types are NOT regenerated here.
//
// Query key: ['endorsement-status', accountId, holderId, ...policyIds sorted].
// Enabled only when accountId, holderId, AND policyIds.length are all truthy.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  COIHolderEndorsementResolved,
  COILineKey,
} from '@/types/master-coi';

/** The per-line resolved state, keyed by canonical line key. */
export interface HolderEndorsementLineStatus {
  addl_insd_resolved: COIHolderEndorsementResolved;
  subr_wvd_resolved: COIHolderEndorsementResolved;
  /** Human basis for the ADDL INSD box, e.g. 'blanket CG 20 33'. Empty when none. */
  addl_insd_basis: string;
  /** Human basis for the SUBR WVD box, e.g. 'scheduled CG 20 10'. Empty when none. */
  subr_wvd_basis: string;
  /** Combined human basis (both boxes), used for holder endorsement-form matching. */
  basis: string;
}

/** The keyed-by-line map the generator consumes. */
export type HolderEndorsementStatusMap = Partial<
  Record<COILineKey, HolderEndorsementLineStatus>
>;

/** One raw SETOF row from resolve_holder_endorsements (02 Section 4.7.1). */
interface ResolveHolderEndorsementsRow {
  line_key: COILineKey;
  addl_insd_resolved: COIHolderEndorsementResolved;
  subr_wvd_resolved: COIHolderEndorsementResolved;
  basis: unknown;
}

/**
 * Turn ONE basis entry (the `addl_insd` or `subr_wvd` sub-object the RPC returns)
 * into a short human phrase for the inline toggle copy, e.g. 'blanket CG 20 33' or
 * 'scheduled CG 20 10'. The endorsement form number is preserved so the holder
 * requirements form-match in requirements.ts still works. Returns '' for kinds
 * that carry no printable basis ('none', unresolved, follow_underlying_no_underlying).
 */
function humanizeBasisEntry(entry: unknown): string {
  if (!entry || typeof entry !== 'object') return '';
  const o = entry as Record<string, unknown>;
  const kind = typeof o.kind === 'string' ? o.kind : '';
  const form = typeof o.endorsement_form === 'string' ? o.endorsement_form.trim() : '';
  switch (kind) {
    case 'blanket':
      return form ? `blanket ${form}` : 'blanket endorsement';
    case 'holder_match':
      return form ? `scheduled ${form}` : 'scheduled endorsement';
    case 'follow_underlying':
      return 'follows underlying GL';
    default:
      return '';
  }
}

/**
 * The RPC's `basis` jsonb is `{ addl_insd: {...}, subr_wvd: {...} }` (02 Section
 * 4.7.3). Split it into the two per-box human phrases the toggles show. Older
 * string-shaped bases (defensive) apply to both boxes.
 */
function splitBasis(basis: unknown): { addl: string; subr: string } {
  if (typeof basis === 'string') return { addl: basis, subr: basis };
  if (!basis || typeof basis !== 'object') return { addl: '', subr: '' };
  const o = basis as Record<string, unknown>;
  return {
    addl: humanizeBasisEntry(o.addl_insd),
    subr: humanizeBasisEntry(o.subr_wvd),
  };
}

export function useHolderEndorsementStatus(args: {
  accountId: string | null;
  holderId: string | null;
  policyIds: string[];
}): UseQueryResult<HolderEndorsementStatusMap> {
  const { accountId, holderId, policyIds } = args;
  // Sort for a stable key regardless of selection order.
  const sortedPolicyIds = [...policyIds].sort();

  return useQuery({
    queryKey: ['endorsement-status', accountId, holderId, ...sortedPolicyIds],
    enabled: !!accountId && !!holderId && policyIds.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<HolderEndorsementStatusMap> => {
      const { data, error } = await supabase.rpc('resolve_holder_endorsements', {
        p_account_id: accountId,
        p_holder_id: holderId,
        p_policy_ids: sortedPolicyIds,
      });
      if (error) throw error;
      const rows = (data || []) as unknown as ResolveHolderEndorsementsRow[];
      const map: HolderEndorsementStatusMap = {};
      for (const row of rows) {
        const { addl, subr } = splitBasis(row.basis);
        map[row.line_key] = {
          addl_insd_resolved: row.addl_insd_resolved,
          subr_wvd_resolved: row.subr_wvd_resolved,
          addl_insd_basis: addl,
          subr_wvd_basis: subr,
          // Both phrases (dedup identical) for endorsement-form matching downstream.
          basis: Array.from(new Set([addl, subr].filter(Boolean))).join('; '),
        };
      }
      return map;
    },
  });
}
