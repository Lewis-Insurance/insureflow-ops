import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The one notes hook for the app. Notes are account-scoped: a single stream lives on the
 * customer (accounts.id) and is shared across their policies and STANDARD renewals. A note
 * added from a policy or renewal is tagged for context but still belongs to the customer, so
 * it shows everywhere for that customer. There is deliberately no limit on how many notes are
 * fetched or shown.
 *
 * AO Renewals are a separate module and do NOT use this system.
 */
export interface AccountNote {
  id: string;
  note_text: string;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  author_name: string;
  is_important: boolean;
  policy_id: string | null;
  renewal_id: string | null;
  /** e.g. "Policy AUTO-123" or "Renewal Progressive" when the note was captured in context. */
  context_label: string | null;
  source: string;
}

export const accountNotesKey = (accountId?: string | null) =>
  ['account-notes', accountId ?? null] as const;

export function useAccountNotes(accountId?: string | null) {
  return useQuery({
    queryKey: accountNotesKey(accountId),
    enabled: !!accountId,
    queryFn: async (): Promise<AccountNote[]> => {
      if (!accountId) return [];
      const { data, error } = await (supabase as any).rpc('get_account_notes', {
        p_account_id: accountId,
      });
      if (error) throw error;
      return (data ?? []) as AccountNote[];
    },
  });
}

interface AddNoteInput {
  note_text: string;
  policyId?: string | null;
  renewalId?: string | null;
  source?: string;
}

export function useAddAccountNote(accountId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddNoteInput) => {
      const text = input.note_text.trim();
      if (!text) throw new Error('Note is empty.');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to add a note.');
      const { error } = await supabase.from('customer_notes').insert({
        customer_id: accountId,
        note_text: text,
        created_by: user.id,
        policy_id: input.policyId ?? null,
        renewal_id: input.renewalId ?? null,
        source: input.source ?? 'manual',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountNotesKey(accountId) }),
  });
}

export function useUpdateAccountNote(accountId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; note_text: string }) => {
      const text = input.note_text.trim();
      if (!text) throw new Error('Note is empty.');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('customer_notes')
        .update({
          note_text: text,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        } as any)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountNotesKey(accountId) }),
  });
}

export function useDeleteAccountNote(accountId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete (invariant: soft deletes only) - stamp deleted_at, keep the row.
      const { error } = await supabase
        .from('customer_notes')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountNotesKey(accountId) }),
  });
}
