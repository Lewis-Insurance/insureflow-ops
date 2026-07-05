// ============================================================================
// COMMERCIAL INTAKE HOOK (SOW v3 3.5 feeder #3 - Phase 2)
// ============================================================================
// Staff side: mint/revoke tokenized intake links (server-minted via
// create_commercial_intake_link) and review the STAGED client submissions.
// Public side: fetch/submit against the commercial-intake edge fn using the
// anon key + token (the token is the credential; same pattern as the
// document-collection portal).
// Applying a staged submission is composed in the UI: the standard profile
// save with provenance sources 'client', then the staged row flips to applied.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface IntakeLink {
  id: string;
  account_id: string;
  submission_id: string | null;
  token: string;
  expires_at: string;
  revoked_at: string | null;
  last_submitted_at: string | null;
  created_at: string;
}

export interface IntakeStagedSubmission {
  id: string;
  link_id: string;
  account_id: string;
  payload: Record<string, string | number>;
  client_note: string | null;
  status: 'pending' | 'applied' | 'dismissed';
  submitted_at: string;
}

export const intakePortalUrl = (token: string) =>
  `${window.location.origin}/portal/intake/${token}`;

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

export function useIntakeLinks(accountId: string | null) {
  return useQuery({
    queryKey: ['intake-links', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_intake_links' as any)
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as IntakeLink[]) ?? [];
    },
    enabled: !!accountId,
  });
}

export function useCreateIntakeLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; submissionId?: string | null }) => {
      const { data, error } = await supabase.rpc('create_commercial_intake_link', {
        p_account_id: input.accountId,
        p_submission_id: input.submissionId ?? null,
      });
      if (error) throw error;
      return data as unknown as { link_id: string; token: string; expires_at: string };
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['intake-links', v.accountId] });
      toast.success('Intake link created');
    },
    onError: (error: Error) => toast.error(`Could not create the link: ${error.message}`),
  });
}

export function useRevokeIntakeLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { accountId: string; linkId: string }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_intake_links' as any)
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', input.linkId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['intake-links', v.accountId] });
      toast.success('Link revoked');
    },
    onError: (error: Error) => toast.error(`Could not revoke the link: ${error.message}`),
  });
}

export function useIntakeSubmissions(accountId: string | null) {
  return useQuery({
    queryKey: ['intake-submissions', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_intake_submissions' as any)
        .select('*')
        .eq('account_id', accountId)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as IntakeStagedSubmission[]) ?? [];
    },
    enabled: !!accountId,
  });
}

export function useSetIntakeSubmissionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      stagedId: string;
      status: 'applied' | 'dismissed';
    }) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_intake_submissions' as any)
        .update({
          status: input.status,
          applied_by: input.status === 'applied' ? (await supabase.auth.getUser()).data.user?.id ?? null : null,
          applied_at: input.status === 'applied' ? new Date().toISOString() : null,
        })
        .eq('id', input.stagedId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['intake-submissions', v.accountId] });
    },
    onError: (error: Error) => toast.error(`Could not update the submission: ${error.message}`),
  });
}

// ---------------------------------------------------------------------------
// Public side (token is the credential; anon key only identifies the project)
// ---------------------------------------------------------------------------

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/commercial-intake`;
const ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

async function callIntake(body: Record<string, unknown>) {
  const response = await fetch(FUNCTIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ error: 'Unexpected response' }));
  if (!response.ok || result?.error) throw new Error(result?.error || 'Request failed');
  return result;
}

export interface IntakePortalData {
  business_name: string;
  expires_at: string;
  prefill: Record<string, string | number | null>;
}

export function useIntakePortalData(token: string | null) {
  return useQuery({
    queryKey: ['intake-portal', token],
    queryFn: async () => (await callIntake({ action: 'fetch', token })) as IntakePortalData,
    enabled: !!token,
    retry: 1,
    staleTime: 30_000,
  });
}

export function useIntakePortalSubmit() {
  return useMutation({
    mutationFn: async (input: {
      token: string;
      payload: Record<string, string | number>;
      clientNote?: string;
    }) =>
      callIntake({
        action: 'submit',
        token: input.token,
        payload: input.payload,
        client_note: input.clientNote,
      }),
  });
}
