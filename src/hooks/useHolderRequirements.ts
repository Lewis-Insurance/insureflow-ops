// ============================================================================
// HOLDER REQUIREMENTS HOOK (07-supplemental-enhancements.md Section 4.4)
// ============================================================================
// Thin React-Query wrapper over the deployed SECURITY INVOKER RPC
// get_additional_insured_requirements(p_id uuid) -> TABLE(requirements jsonb,
// requirements_notes text) (07 §4.3/§4.4; migration 20260704160000). The
// additional_insureds staff + workspace RLS scopes what the caller can read.
//
// The generator fetches the picked holder's requirements profile here and feeds
// the parsed closed schema to evaluateHolderRequirements for the advisory
// compliance strip. A holder with no requirements parses to null and the strip
// renders nothing, so behavior is byte-identical to the pre-engine generator.
//
// The RPC is not in the generated Supabase types, so its SETOF row is bound via
// the `as unknown as` cast exactly like useCertificates.ts /
// useHolderEndorsementStatus.ts do. Types are NOT regenerated here.
//
// Query key: ['holder-requirements', holderId]. Enabled only when holderId is
// truthy.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  parseHolderRequirements,
  type HolderRequirements,
} from '@/lib/acord/acord25/requirements';

/** One raw SETOF row from get_additional_insured_requirements. */
interface HolderRequirementsRow {
  requirements: unknown;
  requirements_notes: string | null;
}

/** The parsed profile the generator consumes. */
export interface HolderRequirementsResult {
  /** Null when the holder has no evaluable requirements (behaves as today). */
  requirements: HolderRequirements | null;
  /** Free text that never participates in evaluation (07 §4.2). */
  notes: string | null;
}

export function useHolderRequirements(
  holderId: string | null,
): UseQueryResult<HolderRequirementsResult> {
  return useQuery({
    queryKey: ['holder-requirements', holderId],
    enabled: !!holderId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<HolderRequirementsResult> => {
      const { data, error } = await supabase.rpc('get_additional_insured_requirements', {
        p_id: holderId,
      });
      if (error) throw error;
      const rows = (data || []) as unknown as HolderRequirementsRow[];
      const row = rows[0] ?? null;
      return {
        requirements: parseHolderRequirements(row?.requirements ?? null),
        notes: row?.requirements_notes ?? null,
      };
    },
  });
}
