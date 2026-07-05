// ============================================================================
// COMMERCIAL LOCATIONS HOOK (Commercial Lines SOW v3, Phase 3 Property)
// ============================================================================
// CRUD over the commercial_locations risk-store table (Phase 0 schema: full
// COPE, FL wind/flood fields). Same conventions as useCommercialProfile:
// '' normalizes to null, only changed fields are written, and each changed
// field stamps provenance (src='manual' by default; machine feeders pass a
// sources map). Soft delete only (deleted_at), matching the store's RLS.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CommercialLocation, FieldProvenance, ProvenanceSource } from '@/types/commercial';

/** The editable columns (mirrors migration 20260705160000). */
export type CommercialLocationInput = Partial<
  Omit<CommercialLocation, 'id' | 'account_id' | 'agency_workspace_id' | 'field_provenance' | 'created_by' | 'created_at' | 'updated_at' | 'deleted_at'>
>;

const KEY = (accountId: string | null) => ['commercial-locations', accountId];

export function useCommercialLocations(accountId: string | null) {
  return useQuery({
    queryKey: KEY(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_locations' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('location_number', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as CommercialLocation[]) ?? [];
    },
    staleTime: 60 * 1000,
    enabled: !!accountId,
  });
}

export function useSaveCommercialLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      existing: CommercialLocation | null;
      changes: CommercialLocationInput;
      sources?: Partial<Record<keyof CommercialLocationInput, ProvenanceSource>>;
    }) => {
      const norm = (v: unknown): unknown => (v === '' || v === undefined ? null : v);
      const changedKeys = (Object.keys(input.changes) as (keyof CommercialLocationInput)[]).filter(
        (k) => norm(input.existing?.[k]) !== norm(input.changes[k]),
      );
      if (changedKeys.length === 0) {
        return { location: input.existing, changed: false as const };
      }

      const now = new Date().toISOString();
      const provenance: FieldProvenance = { ...(input.existing?.field_provenance ?? {}) };
      for (const k of changedKeys) provenance[k] = { src: input.sources?.[k] ?? 'manual', at: now };

      const payload: Record<string, unknown> = { field_provenance: provenance };
      for (const k of changedKeys) payload[k] = norm(input.changes[k]);

      if (input.existing) {
        const { data, error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_locations' as any)
          .update(payload)
          .eq('id', input.existing.id)
          .select('*')
          .single();
        if (error) throw error;
        return { location: data as unknown as CommercialLocation, changed: true as const };
      }
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_locations' as any)
        .insert({ account_id: input.accountId, ...payload })
        .select('*')
        .single();
      if (error) throw error;
      return { location: data as unknown as CommercialLocation, changed: true as const };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: KEY(variables.accountId) });
      if (result?.changed === false) toast.info('No changes to save');
      else toast.success('Location saved');
    },
    onError: (error: Error) => toast.error(`Could not save the location: ${error.message}`),
  });
}

export function useDeleteCommercialLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; locationId: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_locations' as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.locationId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: KEY(v.accountId) });
      toast.success('Location removed');
    },
    onError: (error: Error) => toast.error(`Could not remove the location: ${error.message}`),
  });
}
