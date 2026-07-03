// ============================================================================
// MASTER COI HOOK
// ============================================================================
// All data in and out for the Master COI panel (blueprint Section 3).
//
// One read query + three mutation RPCs + one direct-upsert mutation. The RPC
// parameter names below are the EXACT deployed signatures (verified against
// prod project lrqajzwcmdwahnjyidgv via pg_get_functiondef), NOT the blueprint's
// guessed names:
//   get_master_coi(p_account_id uuid, p_policy_ids uuid[] default null) -> jsonb
//   save_master_coi_fields(p_policy_id uuid, p_updates jsonb) -> jsonb   [NO account_id param]
//   set_line_ai_endorsement(p_line text, p_row_id uuid, p_status text,
//       p_endorsement_form text default null,
//       p_endorsement_effective_date date default null) -> jsonb          [NO account_id param]
//   mark_master_coi_reviewed(p_account_id uuid) -> jsonb
//
// account_coi_profiles has NO save RPC: we upsert directly. agency_workspace_id
// is trigger-derived on insert; RLS is is_staff() AND is_agency_member().
//
// For save_master_coi_fields and set_line_ai_endorsement the RPC itself takes no
// account_id; the mutation still receives `accountId` and uses it ONLY to
// invalidate the ['master-coi', accountId] query.
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { COIEndorsementStatus, MasterCOI } from '@/types/master-coi';

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function useMasterCoi(accountId: string) {
  return useQuery({
    queryKey: ['master-coi', accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_master_coi', {
        p_account_id: accountId,
      });
      if (error) throw error;
      // get_master_coi returns a generic jsonb (not in generated types); the
      // double-cast binds it to the read-model contract, matching how untyped
      // RPCs are consumed elsewhere.
      return data as unknown as MasterCOI;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId,
  });
}

// ---------------------------------------------------------------------------
// Mutation: save coverage-line fields -> save_master_coi_fields(p_policy_id, p_updates)
// ---------------------------------------------------------------------------

export function useSaveMasterCoiFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      policyId: string;
      updates: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc('save_master_coi_fields', {
        p_policy_id: input.policyId,
        p_updates: input.updates,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['master-coi', variables.accountId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      toast.success('Coverage line saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save coverage line: ${error.message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: set one AI-row endorsement -> set_line_ai_endorsement(...)
// ---------------------------------------------------------------------------

export function useSetLineAiEndorsement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      line: string;
      rowId: string;
      status: COIEndorsementStatus;
      endorsementForm?: string | null;
      effectiveDate?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('set_line_ai_endorsement', {
        p_line: input.line,
        p_row_id: input.rowId,
        p_status: input.status,
        p_endorsement_form: input.endorsementForm ?? null,
        p_endorsement_effective_date: input.effectiveDate ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['master-coi', variables.accountId] });
      const message: Record<COIEndorsementStatus, string> = {
        endorsed: 'Endorsement marked on file',
        requested: 'Endorsement requested',
        none: 'Endorsement cleared',
      };
      toast.success(message[variables.status]);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update endorsement: ${error.message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: mark the Master COI reviewed -> mark_master_coi_reviewed(p_account_id)
// ---------------------------------------------------------------------------

export function useMarkMasterCoiReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string }) => {
      const { data, error } = await supabase.rpc('mark_master_coi_reviewed', {
        p_account_id: input.accountId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['master-coi', variables.accountId] });
      toast.success('Master COI marked reviewed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark reviewed: ${error.message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: save certificate defaults -> DIRECT upsert on account_coi_profiles
// ---------------------------------------------------------------------------
// No save RPC exists for this table. Upsert on the account_id conflict target.
// agency_workspace_id is trigger-derived on insert; the table is not in
// generated types, so the .from() target is cast (typecheck is not a gate; the
// Vite build is).
//
// Only fields the operator actually edited are written, so saving one default
// never clobbers the other and never flips ops_source of an untouched, non-
// manually-sourced description. `ops_source` is set to 'manual' ONLY when the
// description itself is being changed by this edit.

export function useSaveAccountCoiProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      /** Present only when the description field was edited in this save. */
      descriptionOfOperations?: string | null;
      /** Present only when the remarks field was edited in this save. */
      defaultRemarks?: string | null;
    }) => {
      const row: Record<string, unknown> = { account_id: input.accountId };
      if ('descriptionOfOperations' in input) {
        row.description_of_operations = input.descriptionOfOperations ?? null;
        // Provenance flips to manual only for a real description edit.
        row.ops_source = 'manual';
      }
      if ('defaultRemarks' in input) {
        row.default_remarks = input.defaultRemarks ?? null;
      }
      const { data, error } = await (supabase.from('account_coi_profiles') as any).upsert(
        row,
        { onConflict: 'account_id' },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['master-coi', variables.accountId] });
      toast.success('Certificate defaults saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save defaults: ${error.message}`);
    },
  });
}
