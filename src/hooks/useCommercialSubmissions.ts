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
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as CommercialSubmission;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
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
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY(v.accountId) });
    },
    onError: (error: Error) => toast.error(`Could not update the submission: ${error.message}`),
  });
}

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'draft', 'intake', 'packet_ready', 'signing', 'submitted', 'quoted', 'proposed', 'bound', 'lost', 'abandoned',
];

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
