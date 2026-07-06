// ============================================================================
// COMMERCIAL SUBMISSIONS HOOK (Commercial Lines SOW v3, Section 3.3 / Phase 1)
// ============================================================================
// List/create/update the account's E&S submissions plus their two evidence
// children: submission_declinations (the diligent-effort record, append-only)
// and submission_offer_rejections (the offer-and-rejection E&O log).
// Phase 0 tables, not in generated types -> certificates-style double-casts.
// agency_workspace_id is trigger-derived; RLS is staff + workspace.
// NO market registry by design (Landen Q1): the send target is free text.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { createClientSendApproval, type ClientSendApprovalMarker } from '@/lib/clientSendApproval';
import { toast } from 'sonner';
import type {
  CommercialLineKey,
  CommercialSubmission,
  OfferCoverage,
  OfferDecision,
  SubmissionDeclination,
  SubmissionOfferRejection,
  SubmissionStatus,
} from '@/types/commercial';

const SUBMISSIONS_KEY = (accountId: string | null) => ['commercial-submissions', accountId];

export function useCommercialSubmissions(accountId: string | null) {
  return useQuery({
    queryKey: SUBMISSIONS_KEY(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_submissions' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as CommercialSubmission[]) ?? [];
    },
    staleTime: 30 * 1000,
    enabled: !!accountId,
  });
}

export function useCreateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      targetLines: CommercialLineKey[];
      effectiveDate: string | null;
      wholesalerName?: string;
      wholesalerEmail?: string;
      notes?: string;
      /** Remarket clone: the bound/expiring policy this submission renews away from. */
      remarketOfPolicyId?: string | null;
    }) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_submissions' as any)
        .insert({
          account_id: input.accountId,
          target_lines: input.targetLines,
          effective_date: input.effectiveDate,
          wholesaler_name: input.wholesalerName?.trim() || null,
          wholesaler_email: input.wholesalerEmail?.trim() || null,
          notes: input.notes?.trim() || null,
          remarket_of_policy_id: input.remarketOfPolicyId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as CommercialSubmission;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
      // The pipeline page aggregates submissions workspace-wide.
      queryClient.invalidateQueries({ queryKey: ['commercial-pipeline'] });
      toast.success('Submission created');
    },
    onError: (error: Error) => toast.error(`Could not create the submission: ${error.message}`),
  });
}

export function useUpdateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      submissionId: string;
      changes: Partial<
        Pick<
          CommercialSubmission,
          'status' | 'effective_date' | 'wholesaler_name' | 'wholesaler_email' | 'notes' | 'target_lines'
        >
      >;
    }) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_submissions' as any)
        .update(input.changes)
        .eq('id', input.submissionId)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as CommercialSubmission;
    },
    // Optimistic patch (review fix): without it the status select snaps back
    // to the old value until the refetch lands.
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
      const prev = queryClient.getQueryData<CommercialSubmission[]>(SUBMISSIONS_KEY(v.accountId));
      queryClient.setQueryData<CommercialSubmission[]>(SUBMISSIONS_KEY(v.accountId), (old) =>
        old?.map((s) => (s.id === v.submissionId ? ({ ...s, ...v.changes } as CommercialSubmission) : s)) ?? old,
      );
      return { prev };
    },
    onError: (error: Error, v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(SUBMISSIONS_KEY(v.accountId), ctx.prev);
      toast.error(`Could not update the submission: ${error.message}`);
    },
    onSettled: (_d, _e, v) => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
      // Status moves change the pipeline funnel workspace-wide.
      queryClient.invalidateQueries({ queryKey: ['commercial-pipeline'] });
    },
  });
}

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'draft', 'intake', 'packet_ready', 'signing', 'submitted', 'quoted', 'proposed', 'bound', 'lost', 'abandoned',
];

// ---------------------------------------------------------------------------
// Packet generation (ACORD 125 + 126 fill pipeline, Phase 1b)
// ---------------------------------------------------------------------------

/** One structured issue from the server's 422 VALIDATION body (form-tagged). */
export interface PacketIssue {
  form: '125' | '126';
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

/** A typed failure preserving the server's error code and issue list. */
export class PacketGenerationError extends Error {
  readonly code: string | null;
  readonly issues: PacketIssue[];

  constructor(message: string, code: string | null, issues: PacketIssue[]) {
    super(message);
    this.name = 'PacketGenerationError';
    this.code = code;
    this.issues = issues;
  }
}

interface GeneratePacketResponse {
  success: boolean;
  storage_path: string;
  signed_url: string;
  forms: string[];
}

/**
 * supabase-js FunctionsHttpError carries the raw Response on `context`; parse
 * the { error: { code, message, issues } } body (the useIssueCertificate
 * pattern) so the UI can list exactly what data is missing.
 */
async function toPacketError(error: unknown): Promise<PacketGenerationError> {
  const ctx = (error as { context?: unknown } | null)?.context;
  const response = ctx instanceof Response ? ctx : null;

  let code: string | null = null;
  let issues: PacketIssue[] = [];
  let message = error instanceof Error ? error.message : 'Packet generation failed.';

  if (response) {
    try {
      const body = (await response.clone().json()) as {
        error?: string | { code?: string; message?: string; issues?: PacketIssue[] };
        message?: string;
      };
      if (typeof body.error === 'object' && body.error !== null) {
        if (body.error.code) code = body.error.code;
        if (body.error.message) message = body.error.message;
        if (Array.isArray(body.error.issues)) issues = body.error.issues;
      } else if (typeof body.error === 'string') {
        if (typeof body.message === 'string' && body.message) {
          // The Fence approval gate shape: { error: <code>, message: <human> }.
          code = body.error;
          message = body.message;
        } else {
          message = body.error;
        }
      }
    } catch {
      // Body was not JSON; keep the default message.
    }
  }

  return new PacketGenerationError(message, code, issues);
}

/**
 * Generate the ACORD 125 + 126 submission packet on the server
 * (generate-submission-packet), then open the signed URL in a new tab and
 * refresh the submission (its status may have advanced to packet_ready).
 */
export function useGenerateSubmissionPacket() {
  const queryClient = useQueryClient();
  return useMutation<GeneratePacketResponse, PacketGenerationError, { accountId: string; submissionId: string }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<GeneratePacketResponse>(
        'generate-submission-packet',
        { body: { submission_id: input.submissionId } },
      );
      if (error) throw await toPacketError(error);
      if (!data?.success) throw new PacketGenerationError('The server returned no packet.', null, []);
      return data;
    },
    onSuccess: (data, v) => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
      // packet_ready moves the pipeline funnel workspace-wide.
      queryClient.invalidateQueries({ queryKey: ['commercial-pipeline'] });
      // window.open fires after an async gap, so popup blockers routinely eat
      // it (review fix): with a URL, the toast always carries an Open action
      // as the reliable path. A MISSING url is a different situation (server
      // stored the packet but returned no link) - say that, never blame a
      // popup blocker (review fix round 2).
      if (data.signed_url) {
        const opened = window.open(data.signed_url, '_blank', 'noopener,noreferrer');
        toast.success(
          opened ? 'Submission packet generated (ACORD 125 + 126)'
                 : 'Packet generated. Your browser blocked the tab - use Open packet.',
          { action: { label: 'Open packet', onClick: () => window.open(data.signed_url, '_blank', 'noopener,noreferrer') }, duration: 15000 },
        );
      } else {
        toast.success('Submission packet generated and stored. Open it from the submission shortly.');
      }
    },
    onError: (error) => {
      const blocking = error.issues.filter((i) => i.severity === 'error');
      if (error.code === 'VALIDATION' && blocking.length > 0) {
        const shown = blocking.slice(0, 3).map((i) => i.message).join(' ');
        const more = blocking.length > 3 ? ` (+${blocking.length - 3} more)` : '';
        toast.error(`The packet needs more data: ${shown}${more}`);
      } else {
        toast.error(`Could not generate the packet: ${error.message}`);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// The universal send (Fence-gated email to the wholesaler) + download link
// ---------------------------------------------------------------------------

interface SendPacketResponse {
  success: boolean;
  resend_id: string;
  to: string;
}

/**
 * Email the latest generated packet to the wholesaler via send-submission-packet.
 *
 * Fence: mints a one-time, server-verified named-human approval over the EXACT
 * send payload ({ submission_id, to, cc, note }, empty optionals omitted - the
 * SendCertificateDialog normalization), then invokes with the marker in the
 * body. The edge function re-hashes the body minus the marker and consumes the
 * approval; any drift between the minted payload and the request is a 403.
 */
export function useSendSubmissionPacket() {
  const queryClient = useQueryClient();
  return useMutation<
    SendPacketResponse,
    PacketGenerationError,
    { accountId: string; submissionId: string; to: string; cc?: string; note?: string }
  >({
    mutationFn: async (input) => {
      // Build the send payload ONCE; the approval is minted over this exact
      // object so the server's consume-side hash matches.
      const sendPayload = {
        submission_id: input.submissionId,
        to: input.to.trim(),
        cc: input.cc?.trim() ? input.cc.trim() : undefined,
        note: input.note?.trim() ? input.note.trim() : undefined,
      };
      let approval: ClientSendApprovalMarker;
      try {
        approval = await createClientSendApproval('send-submission-packet', sendPayload);
      } catch (error) {
        throw await toPacketError(error);
      }
      const { data, error } = await supabase.functions.invoke<SendPacketResponse>(
        'send-submission-packet',
        { body: { ...sendPayload, client_send_approval: approval } },
      );
      if (error) throw await toPacketError(error);
      if (!data?.success) throw new PacketGenerationError('The server did not confirm the send.', null, []);
      return data;
    },
    onSuccess: (data, v) => {
      // packet_ready/signing -> submitted moves the pipeline funnel workspace-wide.
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
      queryClient.invalidateQueries({ queryKey: ['commercial-pipeline'] });
      toast.success(`${data.to} - packet sent`);
    },
    onError: (error) => {
      if (error.code === 'NO_PACKET') {
        toast.error('No packet to send yet. Generate the packet first.');
      } else {
        toast.error(`Could not send the packet: ${error.message}`);
      }
    },
  });
}

interface PacketLinkResponse {
  success: boolean;
  signed_url: string;
  storage_path: string;
}

/**
 * Fetch a fresh one-hour signed URL for the latest generated packet
 * (get-submission-packet-link) and open it in a new tab.
 */
export function useSubmissionPacketLink() {
  return useMutation<PacketLinkResponse, PacketGenerationError, { submissionId: string }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<PacketLinkResponse>(
        'get-submission-packet-link',
        { body: { submission_id: input.submissionId } },
      );
      if (error) throw await toPacketError(error);
      if (!data?.success || !data.signed_url) {
        throw new PacketGenerationError('The server returned no packet link.', null, []);
      }
      return data;
    },
    onSuccess: (data) => {
      // window.open fires after an async gap, so popup blockers routinely eat
      // it: with a URL, the toast always carries an Open action as the
      // reliable path (the useGenerateSubmissionPacket handling).
      const opened = window.open(data.signed_url, '_blank', 'noopener,noreferrer');
      toast.success(
        opened ? 'Submission packet opened'
               : 'Packet ready. Your browser blocked the tab - use Open packet.',
        { action: { label: 'Open packet', onClick: () => window.open(data.signed_url, '_blank', 'noopener,noreferrer') }, duration: 15000 },
      );
    },
    onError: (error) => {
      if (error.code === 'NO_PACKET') {
        toast.error('No packet yet. Generate the packet first.');
      } else {
        toast.error(`Could not fetch the packet: ${error.message}`);
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Declinations (diligent-effort record; append-only by design)
// ---------------------------------------------------------------------------

export function useSubmissionDeclinations(submissionId: string | null) {
  return useQuery({
    queryKey: ['submission-declinations', submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_declinations' as any)
        .select('*')
        .eq('submission_id', submissionId)
        .order('declined_at', { ascending: true });
      if (error) throw error;
      return (data as unknown as SubmissionDeclination[]) ?? [];
    },
    enabled: !!submissionId,
  });
}

export function useAddDeclination() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      submissionId: string;
      carrierName: string;
      declinedAt: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_declinations' as any)
        .insert({
          submission_id: input.submissionId,
          carrier_name: input.carrierName.trim(),
          declined_at: input.declinedAt,
          reason: input.reason?.trim() || null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as SubmissionDeclination;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['submission-declinations', v.submissionId] });
      toast.success('Declination recorded');
    },
    onError: (error: Error) => toast.error(`Could not record the declination: ${error.message}`),
  });
}

// ---------------------------------------------------------------------------
// Offer / rejection log (E&O record)
// ---------------------------------------------------------------------------

export function useOfferRejections(accountId: string | null) {
  return useQuery({
    queryKey: ['offer-rejections', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_offer_rejections' as any)
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as SubmissionOfferRejection[]) ?? [];
    },
    enabled: !!accountId,
  });
}

export function useRecordOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      submissionId?: string | null;
      coverage: OfferCoverage;
      decision: OfferDecision;
      details?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_offer_rejections' as any)
        .insert({
          account_id: input.accountId,
          submission_id: input.submissionId ?? null,
          coverage: input.coverage,
          decision: input.decision,
          decided_at: input.decision === 'pending' ? null : new Date().toISOString(),
          details: input.details ?? {},
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as SubmissionOfferRejection;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['offer-rejections', v.accountId] });
      toast.success('Offer recorded');
    },
    onError: (error: Error) => toast.error(`Could not record the offer: ${error.message}`),
  });
}
