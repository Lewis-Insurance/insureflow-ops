// ============================================================================
// COMMERCIAL PROFILE HOOK (Commercial Lines SOW v3, Section 3.1 / Phase 1)
// ============================================================================
// Read + save for the account's commercial_profiles row (one live row per
// account, partial-unique index). Tables are Phase 0 additions not yet in the
// generated Supabase types (typegen deferred - drift risk), so `.from()` uses
// the same double-cast pattern as the certificates module.
//
// Provenance (SOW v3 3.1): every save stamps field_provenance[field] =
// { src: 'manual', at: ISO } for each CHANGED field, merged over the existing
// map. Machine feeders (extraction/canopy/client/book, Phase 2) stage
// suggestions instead of writing here; `manual` is never machine-overwritten.
// agency_workspace_id is trigger-derived on insert (commercial_fill_workspace).
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CommercialProfile, FieldProvenance, ProvenanceSource } from '@/types/commercial';

/** The manually editable columns (mirrors migration 20260705160000). */
export type CommercialProfileInput = Partial<
  Pick<
    CommercialProfile,
    | 'legal_name'
    | 'dba'
    | 'fein'
    | 'entity_type'
    | 'sic_code'
    | 'naics_code'
    | 'description_of_operations'
    | 'years_in_business'
    | 'employee_count'
    | 'part_time_employee_count'
    | 'annual_revenue'
    | 'annual_payroll'
    | 'uses_subcontractors'
    | 'subcontractor_cost'
    | 'website'
    | 'wc_experience_mod'
    | 'wc_experience_mod_effective'
  >
>;

export function useCommercialProfile(accountId: string | null) {
  return useQuery({
    queryKey: ['commercial-profile', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_profiles' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as CommercialProfile | null) ?? null;
    },
    staleTime: 60 * 1000,
    enabled: !!accountId,
  });
}

/**
 * Upsert-by-account: update the live row when it exists, insert otherwise.
 * (A plain .upsert() cannot target the partial unique index.)
 */
export function useSaveCommercialProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      existing: CommercialProfile | null;
      changes: CommercialProfileInput;
      /**
       * Per-field provenance override for machine-fed values (e.g. Sunbiz
       * applies 'extracted'). Fields absent here stamp 'manual'.
       */
      sources?: Partial<Record<keyof CommercialProfileInput, ProvenanceSource>>;
    }) => {
      // Normalize before comparing (review fix): the form seeds '' for null
      // DB values; treating '' as a change stamped provenance and persisted
      // empty strings for untouched fields.
      const norm = (v: unknown): unknown => (v === '' || v === undefined ? null : v);
      const changedKeys = (Object.keys(input.changes) as (keyof CommercialProfileInput)[]).filter(
        (k) => norm(input.existing?.[k]) !== norm(input.changes[k]),
      );
      if (changedKeys.length === 0) {
        return { profile: input.existing, changed: false as const };
      }

      const now = new Date().toISOString();
      const provenance: FieldProvenance = { ...(input.existing?.field_provenance ?? {}) };
      for (const k of changedKeys) provenance[k] = { src: input.sources?.[k] ?? 'manual', at: now };

      // Write ONLY the changed fields, normalized (null, never '').
      const payload: Record<string, unknown> = { field_provenance: provenance };
      for (const k of changedKeys) payload[k] = norm(input.changes[k]);

      if (input.existing) {
        const { data, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_profiles' as any)
          .update(payload)
          .eq('id', input.existing.id)
          .select('*')
          .single();
        if (error) throw error;
        return { profile: data as unknown as CommercialProfile, changed: true as const };
      }
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_profiles' as any)
        .insert({ account_id: input.accountId, ...payload })
        .select('*')
        .single();
      if (error) throw error;
      return { profile: data as unknown as CommercialProfile, changed: true as const };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['commercial-profile', variables.accountId] });
      if (result?.changed === false) {
        toast.info('No changes to save');
      } else {
        toast.success('Business profile saved');
      }
    },
    onError: (error: Error) => {
      toast.error(`Could not save the business profile: ${error.message}`);
    },
  });
}
