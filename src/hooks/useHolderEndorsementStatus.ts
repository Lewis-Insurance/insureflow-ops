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

/** The per-line resolved state, keyed by canonical line key. Basis is the human string. */
export interface HolderEndorsementLineStatus {
  addl_insd_resolved: COIHolderEndorsementResolved;
  subr_wvd_resolved: COIHolderEndorsementResolved;
  /** e.g. 'blanket CG 20 10' or 'scheduled: matched by directory id'. */
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
 * Coerce the RPC's `basis` (jsonb; string or object per 02 Section 4.7.3) into a
 * single human string for the inline toggle copy. Objects are stringified so the
 * caller always gets a printable value.
 */
function basisToString(basis: unknown): string {
  if (typeof basis === 'string') return basis;
  if (basis == null) return '';
  try {
    return JSON.stringify(basis);
  } catch {
    return '';
  }
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
        map[row.line_key] = {
          addl_insd_resolved: row.addl_insd_resolved,
          subr_wvd_resolved: row.subr_wvd_resolved,
          basis: basisToString(row.basis),
        };
      }
      return map;
    },
  });
}
