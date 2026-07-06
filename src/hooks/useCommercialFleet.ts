// ============================================================================
// COMMERCIAL FLEET HOOK (Commercial Lines SOW v3, Phase 6 Business Auto)
// ============================================================================
// CRUD for the fleet risk-store tables: commercial_vehicles (VIN, unit,
// values, deductibles, lienholder, garaging link) and commercial_drivers
// (roster; DOB and license MASKED in the UI). Same conventions as the other
// risk-store hooks: '' -> null, changed-only writes, per-field provenance
// (default src='manual'; a sources map lets the VIN decode stamp
// src='extracted' so manual re-edits reclaim the field), soft delete only.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  CommercialDriver,
  CommercialVehicle,
  FieldProvenance,
  ProvenanceSource,
} from '@/types/commercial';

const VEHICLES_KEY = (accountId: string | null) => ['commercial-vehicles', accountId];
const DRIVERS_KEY = (accountId: string | null) => ['commercial-drivers', accountId];

export type CommercialVehicleInput = Partial<
  Pick<
    CommercialVehicle,
    | 'unit_number' | 'vin' | 'year' | 'make' | 'model' | 'vehicle_type' | 'body_type'
    | 'gvwr' | 'radius_of_operation' | 'vehicle_use' | 'cost_new' | 'stated_value'
    | 'comprehensive_deductible' | 'collision_deductible' | 'ownership'
    | 'lienholder_name' | 'lienholder_address' | 'garaging_location_id'
  >
>;
export type CommercialDriverInput = Partial<
  Pick<
    CommercialDriver,
    | 'first_name' | 'last_name' | 'date_of_birth' | 'license_number' | 'license_state'
    | 'years_licensed' | 'hire_date' | 'violations_3yr' | 'accidents_3yr' | 'excluded'
  >
>;

const norm = (v: unknown): unknown => (v === '' || v === undefined ? null : v);

function buildChange<T extends Record<string, unknown>>(
  existing: Record<string, unknown> | null,
  changes: T,
  sources?: Partial<Record<keyof T, ProvenanceSource>>,
): { changedKeys: (keyof T)[]; payload: Record<string, unknown> } {
  const changedKeys = (Object.keys(changes) as (keyof T)[]).filter(
    (k) => norm(existing?.[k as string]) !== norm(changes[k]),
  );
  const now = new Date().toISOString();
  const provenance: FieldProvenance = {
    ...((existing?.field_provenance as FieldProvenance | undefined) ?? {}),
  };
  for (const k of changedKeys) provenance[k as string] = { src: sources?.[k] ?? 'manual', at: now };
  const payload: Record<string, unknown> = { field_provenance: provenance };
  for (const k of changedKeys) payload[k as string] = norm(changes[k]);
  return { changedKeys, payload };
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export function useCommercialVehicles(accountId: string | null) {
  return useQuery({
    queryKey: VEHICLES_KEY(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_vehicles' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as CommercialVehicle[]) ?? [];
    },
    staleTime: 60 * 1000,
    enabled: !!accountId,
  });
}

export function useSaveCommercialVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      existing: CommercialVehicle | null;
      changes: CommercialVehicleInput;
      /** VIN decode stamps its fills src='extracted'; manual edits reclaim. */
      sources?: Partial<Record<keyof CommercialVehicleInput, ProvenanceSource>>;
    }) => {
      const { changedKeys, payload } = buildChange(
        input.existing as unknown as Record<string, unknown> | null,
        input.changes,
        input.sources,
      );
      if (changedKeys.length === 0) return { changed: false as const };
      if (input.existing) {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_vehicles' as any)
          .update(payload)
          .eq('id', input.existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_vehicles' as any)
          .insert({ account_id: input.accountId, ...payload });
        if (error) throw error;
      }
      return { changed: true as const };
    },
    onSuccess: (res, v) => {
      queryClient.invalidateQueries({ queryKey: VEHICLES_KEY(v.accountId) });
      if (res.changed === false) toast.info('No changes to save');
      else toast.success('Vehicle saved');
    },
    onError: (error: Error) => toast.error(`Could not save the vehicle: ${error.message}`),
  });
}

export function useDeleteCommercialVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; id: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_vehicles' as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: VEHICLES_KEY(v.accountId) });
      toast.success('Vehicle removed');
    },
    onError: (error: Error) => toast.error(`Could not remove the vehicle: ${error.message}`),
  });
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export function useCommercialDrivers(accountId: string | null) {
  return useQuery({
    queryKey: DRIVERS_KEY(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_drivers' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('last_name', { ascending: true });
      if (error) throw error;
      return (data as unknown as CommercialDriver[]) ?? [];
    },
    staleTime: 60 * 1000,
    enabled: !!accountId,
  });
}

export function useSaveCommercialDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      existing: CommercialDriver | null;
      changes: CommercialDriverInput;
    }) => {
      const { changedKeys, payload } = buildChange(
        input.existing as unknown as Record<string, unknown> | null,
        input.changes,
      );
      if (changedKeys.length === 0) return { changed: false as const };
      if (input.existing) {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_drivers' as any)
          .update(payload)
          .eq('id', input.existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_drivers' as any)
          .insert({ account_id: input.accountId, ...payload });
        if (error) throw error;
      }
      return { changed: true as const };
    },
    onSuccess: (res, v) => {
      queryClient.invalidateQueries({ queryKey: DRIVERS_KEY(v.accountId) });
      if (res.changed === false) toast.info('No changes to save');
      else toast.success('Driver saved');
    },
    onError: (error: Error) => toast.error(`Could not save the driver: ${error.message}`),
  });
}

export function useDeleteCommercialDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; id: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_drivers' as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: DRIVERS_KEY(v.accountId) });
      toast.success('Driver removed');
    },
    onError: (error: Error) => toast.error(`Could not remove the driver: ${error.message}`),
  });
}
