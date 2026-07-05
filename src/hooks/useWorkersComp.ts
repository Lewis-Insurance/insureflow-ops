// ============================================================================
// WORKERS COMP HOOK (Commercial Lines SOW v3, Phase 4)
// ============================================================================
// CRUD for the WC risk-store tables: commercial_wc_classes (state, class
// code, payroll, counts) and commercial_wc_exemptions (FL DWC exemption
// records). Same conventions as the other risk-store hooks: '' -> null,
// changed-only writes, per-field provenance src='manual', soft delete only.
// Plus the wc_class_codes reference read for the class picker.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  CommercialWcClass,
  CommercialWcExemption,
  FieldProvenance,
  WcClassCode,
} from '@/types/commercial';

const CLASSES_KEY = (accountId: string | null) => ['commercial-wc-classes', accountId];
const EXEMPTIONS_KEY = (accountId: string | null) => ['commercial-wc-exemptions', accountId];

export type WcClassInput = Partial<
  Pick<CommercialWcClass, 'state' | 'location_id' | 'class_code' | 'class_description' | 'employee_count' | 'annual_payroll'>
>;
export type WcExemptionInput = Partial<
  Pick<CommercialWcExemption, 'person_name' | 'title' | 'exemption_number' | 'scope' | 'effective_date' | 'expiration_date'>
>;

const norm = (v: unknown): unknown => (v === '' || v === undefined ? null : v);

function buildChange<T extends Record<string, unknown>>(
  existing: Record<string, unknown> | null,
  changes: T,
): { changedKeys: (keyof T)[]; payload: Record<string, unknown> } {
  const changedKeys = (Object.keys(changes) as (keyof T)[]).filter(
    (k) => norm(existing?.[k as string]) !== norm(changes[k]),
  );
  const now = new Date().toISOString();
  const provenance: FieldProvenance = {
    ...((existing?.field_provenance as FieldProvenance | undefined) ?? {}),
  };
  for (const k of changedKeys) provenance[k as string] = { src: 'manual', at: now };
  const payload: Record<string, unknown> = { field_provenance: provenance };
  for (const k of changedKeys) payload[k as string] = norm(changes[k]);
  return { changedKeys, payload };
}

// ---------------------------------------------------------------------------
// Class / payroll rows
// ---------------------------------------------------------------------------

export function useWcClasses(accountId: string | null) {
  return useQuery({
    queryKey: CLASSES_KEY(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_wc_classes' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('class_code', { ascending: true });
      if (error) throw error;
      return (data as unknown as CommercialWcClass[]) ?? [];
    },
    staleTime: 60 * 1000,
    enabled: !!accountId,
  });
}

export function useSaveWcClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      existing: CommercialWcClass | null;
      changes: WcClassInput;
    }) => {
      const { changedKeys, payload } = buildChange(
        input.existing as unknown as Record<string, unknown> | null,
        input.changes,
      );
      if (changedKeys.length === 0) return { changed: false as const };
      if (input.existing) {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_wc_classes' as any)
          .update(payload)
          .eq('id', input.existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_wc_classes' as any)
          .insert({ account_id: input.accountId, ...payload });
        if (error) throw error;
      }
      return { changed: true as const };
    },
    onSuccess: (res, v) => {
      queryClient.invalidateQueries({ queryKey: CLASSES_KEY(v.accountId) });
      if (res.changed === false) toast.info('No changes to save');
      else toast.success('Class saved');
    },
    onError: (error: Error) => toast.error(`Could not save the class: ${error.message}`),
  });
}

export function useDeleteWcClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; id: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_wc_classes' as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: CLASSES_KEY(v.accountId) });
      toast.success('Class removed');
    },
    onError: (error: Error) => toast.error(`Could not remove the class: ${error.message}`),
  });
}

// ---------------------------------------------------------------------------
// FL exemptions
// ---------------------------------------------------------------------------

export function useWcExemptions(accountId: string | null) {
  return useQuery({
    queryKey: EXEMPTIONS_KEY(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_wc_exemptions' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('person_name', { ascending: true });
      if (error) throw error;
      return (data as unknown as CommercialWcExemption[]) ?? [];
    },
    staleTime: 60 * 1000,
    enabled: !!accountId,
  });
}

export function useSaveWcExemption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      existing: CommercialWcExemption | null;
      changes: WcExemptionInput;
    }) => {
      const { changedKeys, payload } = buildChange(
        input.existing as unknown as Record<string, unknown> | null,
        input.changes,
      );
      if (changedKeys.length === 0) return { changed: false as const };
      if (input.existing) {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_wc_exemptions' as any)
          .update(payload)
          .eq('id', input.existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('commercial_wc_exemptions' as any)
          .insert({ account_id: input.accountId, ...payload });
        if (error) throw error;
      }
      return { changed: true as const };
    },
    onSuccess: (res, v) => {
      queryClient.invalidateQueries({ queryKey: EXEMPTIONS_KEY(v.accountId) });
      if (res.changed === false) toast.info('No changes to save');
      else toast.success('Exemption saved');
    },
    onError: (error: Error) => toast.error(`Could not save the exemption: ${error.message}`),
  });
}

export function useDeleteWcExemption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; id: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_wc_exemptions' as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: EXEMPTIONS_KEY(v.accountId) });
      toast.success('Exemption removed');
    },
    onError: (error: Error) => toast.error(`Could not remove the exemption: ${error.message}`),
  });
}

// ---------------------------------------------------------------------------
// Class-code reference (seeded FL set; free entry still allowed in the UI)
// ---------------------------------------------------------------------------

export function useWcClassCodes() {
  return useQuery({
    queryKey: ['wc-class-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('wc_class_codes' as any)
        .select('*')
        .order('code', { ascending: true });
      if (error) throw error;
      return (data as unknown as WcClassCode[]) ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}
