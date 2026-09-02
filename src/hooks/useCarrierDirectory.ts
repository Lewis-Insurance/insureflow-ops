// The carrier directory: one source of truth for carrier name + NAIC.
//
// Product decision (2026-09-02): `public.carriers` is the only carrier store.
// The Carriers page owns it, and every other surface that needs a carrier reads
// and writes those same rows. This module is the shared write path so a carrier
// added from the Add Policy form is the same record the Carriers page manages,
// and so a NAIC typed anywhere reaches the next certificate.
//
// Master COI resolves an insurer's NAIC live from `carriers` (see
// 20260902120000_master_coi_naic_resolution.sql), so a carrier write has to
// invalidate the COI read models too. Without that, a NAIC corrected on the
// Carriers page is invisible to Generate COI for up to the master-coi query's
// five minute staleTime, which reads as "the NAIC is not generating".

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CarrierDirectoryEntry {
  id: string;
  name: string;
  /** null when no NAIC is on file. Never an empty string. */
  naic: string | null;
}

/** Blank is not a NAIC. Store null so "no NAIC on file" stays distinguishable. */
export function normalizeNaic(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The directory row for an exact carrier name, case and whitespace insensitive.
 * Save paths call this as a backstop so a form submitted before the picker had
 * linked (or before the directory finished loading) still writes carrier_id.
 */
export function findCarrierByName(
  directory: CarrierDirectoryEntry[],
  name: string | null | undefined,
): CarrierDirectoryEntry | null {
  const needle = (name ?? '').trim().toLowerCase();
  if (!needle) return null;
  return directory.find((c) => c.name.trim().toLowerCase() === needle) ?? null;
}

/**
 * Everything a carrier change can move: the directory itself, the policies that
 * display a carrier, and the Master COI / certificate read models that resolve
 * NAIC through it. Exported so the Carriers page and the admin carrier tab call
 * exactly the same list.
 */
export function invalidateCarrierDependents(queryClient: QueryClient) {
  // ['carriers'] is a prefix, so this also covers ['carriers', 'with-naic'].
  queryClient.invalidateQueries({ queryKey: ['carriers'] });
  queryClient.invalidateQueries({ queryKey: ['master-coi'] });
  queryClient.invalidateQueries({ queryKey: ['certificate-preview'] });
  queryClient.invalidateQueries({ queryKey: ['policies'] });
  queryClient.invalidateQueries({ queryKey: ['policy'] });
}

/** The carrier directory with NAIC, sorted by name. */
export function useCarrierDirectory() {
  return useQuery({
    queryKey: ['carriers', 'with-naic'],
    queryFn: async (): Promise<CarrierDirectoryEntry[]> => {
      const { data, error } = await supabase
        .from('carriers')
        .select('id, name, naic')
        .order('name');
      if (error) throw new Error(`Failed to load the carrier directory: ${error.message}`);
      return (data ?? []).map((c) => ({
        id: c.id as string,
        name: (c.name as string) ?? '',
        naic: normalizeNaic(c.naic as string | null),
      }));
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Add a carrier to the directory from wherever the staffer happens to be.
 * A name that already exists (case and whitespace insensitive) links to the
 * existing row instead of creating a duplicate, because a second row for the
 * same carrier is how a book ends up with one carrier that has a NAIC and one
 * that does not.
 */
export function useCreateCarrier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; naic?: string | null }): Promise<CarrierDirectoryEntry> => {
      const name = input.name.trim();
      if (!name) throw new Error('Enter a carrier name.');
      const naic = normalizeNaic(input.naic);

      const { data: existing, error: lookupError } = await supabase
        .from('carriers')
        .select('id, name, naic')
        .ilike('name', name)
        .limit(1);
      if (lookupError) throw new Error(`Could not check the carrier directory: ${lookupError.message}`);

      if (existing && existing.length > 0) {
        const row = existing[0];
        const currentNaic = normalizeNaic(row.naic as string | null);
        // Same carrier already on file. Fill in the NAIC if it was blank and one
        // was supplied; never overwrite a NAIC that is already recorded.
        if (naic && !currentNaic) {
          const { error } = await supabase.from('carriers').update({ naic }).eq('id', row.id as string);
          if (error) throw new Error(`Failed to save the NAIC: ${error.message}`);
          return { id: row.id as string, name: (row.name as string) ?? name, naic };
        }
        return { id: row.id as string, name: (row.name as string) ?? name, naic: currentNaic };
      }

      const { data, error } = await supabase
        .from('carriers')
        .insert([{ name, naic }])
        .select('id, name, naic')
        .single();
      if (error) throw new Error(`Failed to add the carrier: ${error.message}`);
      return {
        id: data.id as string,
        name: (data.name as string) ?? name,
        naic: normalizeNaic(data.naic as string | null),
      };
    },
    onSuccess: () => invalidateCarrierDependents(queryClient),
  });
}

/** Set or correct a carrier's NAIC on the same row the Carriers page owns. */
export function useSetCarrierNaic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { carrierId: string; naic: string | null }): Promise<string | null> => {
      const naic = normalizeNaic(input.naic);
      const { error } = await supabase
        .from('carriers')
        .update({ naic })
        .eq('id', input.carrierId);
      if (error) throw new Error(`Failed to save the NAIC: ${error.message}`);
      return naic;
    },
    onSuccess: () => invalidateCarrierDependents(queryClient),
  });
}
