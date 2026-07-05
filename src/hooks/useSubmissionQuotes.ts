// ============================================================================
// SUBMISSION QUOTES + BIND (Commercial Lines SOW v3 Phase 1, Path B tail)
// ============================================================================
// Quote capture against a submission (structured GL limits in quote_coverages)
// and the bind write-through: winning quote -> won (siblings lost), the GL
// limits written to the CHOSEN POLICY through save_master_coi_fields (the
// registry-whitelisted, provenance-ledgered COI write path), a 'bound'
// submission event, and submission status 'bound'. Because the write lands on
// the exact cgl_details paths get_master_coi reads, the bound policy is
// COI-ready the moment bind completes (Path B hands off to Path A).
//
// Registry paths verified live: cgl_details.limits.each_occurrence [REQ],
// cgl_details.limits.general_aggregate [REQ]. Quote status vocabulary is the
// prod enum: open / won / lost. Free-text carrier lives in options.carrier_name
// (E&S carriers are often not in the carriers table; no registry by design).
//
// v1 is a client-side sequence (not atomic); a server-side bind RPC is listed
// for Phase 1b hardening. Each step throws on failure so nothing silently
// half-binds; re-running bind is safe (won/lost updates and field saves are
// idempotent, the event log just gains a second row).
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SubmissionQuoteCoverage {
  id: string;
  quote_id: string;
  coverage_type: string;
  limit_amount: number | null;
  premium_amount: number | null;
}

export interface SubmissionQuote {
  id: string;
  account_id: string;
  submission_id: string | null;
  line_of_business: string;
  premium: number | null;
  status: 'open' | 'won' | 'lost' | string;
  quoted_at: string | null;
  competitor_carrier: string | null;
  options: Record<string, unknown> | null;
  quote_coverages?: SubmissionQuoteCoverage[];
}

export const GL_EACH_OCCURRENCE_PATH = 'cgl_details.limits.each_occurrence';
export const GL_GENERAL_AGGREGATE_PATH = 'cgl_details.limits.general_aggregate';

export function quoteCarrierName(q: SubmissionQuote): string {
  const fromOptions = q.options && typeof q.options === 'object' ? q.options['carrier_name'] : null;
  return (typeof fromOptions === 'string' && fromOptions.trim()) || q.competitor_carrier || 'Unknown carrier';
}

export function useSubmissionQuotes(submissionId: string | null) {
  return useQuery({
    queryKey: ['submission-quotes', submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('quotes' as any)
        .select('id, account_id, submission_id, line_of_business, premium, status, quoted_at, competitor_carrier, options, quote_coverages(id, quote_id, coverage_type, limit_amount, premium_amount)')
        .eq('submission_id', submissionId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as SubmissionQuote[]) ?? [];
    },
    enabled: !!submissionId,
  });
}

export function useAddSubmissionQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      submissionId: string;
      carrierName: string;
      premium: number | null;
      eachOccurrence: number | null;
      generalAggregate: number | null;
    }) => {
      const { data: quote, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('quotes' as any)
        .insert({
          account_id: input.accountId,
          submission_id: input.submissionId,
          line_of_business: 'gl',
          premium: input.premium,
          status: 'open',
          quoted_at: new Date().toISOString(),
          options: { carrier_name: input.carrierName.trim() },
        })
        .select('id')
        .single();
      if (error) throw error;

      const coverageRows = [
        input.eachOccurrence != null && {
          quote_id: (quote as { id: string }).id,
          coverage_type: 'gl_each_occurrence',
          limit_amount: input.eachOccurrence,
        },
        input.generalAggregate != null && {
          quote_id: (quote as { id: string }).id,
          coverage_type: 'gl_general_aggregate',
          limit_amount: input.generalAggregate,
        },
      ].filter(Boolean);
      if (coverageRows.length > 0) {
        const { error: covError } = await supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('quote_coverages' as any)
          .insert(coverageRows);
        if (covError) throw covError;
      }

      // First quote moves a pre-quote submission into 'quoted'.
      const { error: subError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_submissions' as any)
        .update({ status: 'quoted' })
        .eq('id', input.submissionId)
        .in('status', ['draft', 'intake', 'packet_ready', 'signing', 'submitted']);
      if (subError) throw subError;

      return quote;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['submission-quotes', v.submissionId] });
      queryClient.invalidateQueries({ queryKey: ['commercial-submissions', v.accountId] });
      toast.success('Quote recorded');
    },
    onError: (error: Error) => toast.error(`Could not record the quote: ${error.message}`),
  });
}

export function useBindSubmissionQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      accountId: string;
      submissionId: string;
      quoteId: string;
      /** The policy the win becomes; limits are written to ITS cgl_details. */
      policyId: string;
      eachOccurrence: number | null;
      generalAggregate: number | null;
    }) => {
      // 1) Winner won, open siblings lost.
      const { error: winError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('quotes' as any)
        .update({ status: 'won' })
        .eq('id', input.quoteId);
      if (winError) throw winError;
      const { error: loseError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('quotes' as any)
        .update({ status: 'lost' })
        .eq('submission_id', input.submissionId)
        .neq('id', input.quoteId)
        .eq('status', 'open');
      if (loseError) throw loseError;

      // 2) Write the bound GL limits to the policy through the COI write path
      //    (registry-whitelisted; stamps the manual-write provenance ledger).
      const updates: Record<string, number> = {};
      if (input.eachOccurrence != null) updates[GL_EACH_OCCURRENCE_PATH] = input.eachOccurrence;
      if (input.generalAggregate != null) updates[GL_GENERAL_AGGREGATE_PATH] = input.generalAggregate;
      if (Object.keys(updates).length > 0) {
        const { error: saveError } = await supabase.rpc('save_master_coi_fields', {
          p_policy_id: input.policyId,
          p_updates: updates,
        });
        if (saveError) throw saveError;
      }

      // 3) Audit event, then the submission closes as bound.
      const { error: eventError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_events' as any)
        .insert({
          submission_id: input.submissionId,
          action: 'bound',
          metadata: { quote_id: input.quoteId, policy_id: input.policyId, ...updates },
        });
      if (eventError) throw eventError;
      const { error: subError } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_submissions' as any)
        .update({ status: 'bound' })
        .eq('id', input.submissionId);
      if (subError) throw subError;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['submission-quotes', v.submissionId] });
      queryClient.invalidateQueries({ queryKey: ['commercial-submissions', v.accountId] });
      queryClient.invalidateQueries({ queryKey: ['master-coi', v.accountId] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      toast.success('Bound. The policy is COI-ready once its line details pass readiness.');
    },
    onError: (error: Error) => toast.error(`Bind failed: ${error.message}`),
  });
}

// ---------------------------------------------------------------------------
// Account policy picker (bind target).
// ---------------------------------------------------------------------------

export interface BindablePolicy {
  id: string;
  policy_number: string | null;
  carrier: string | null;
  line_of_business: string | null;
  status: string | null;
}

export function useAccountPolicies(accountId: string | null) {
  return useQuery({
    queryKey: ['account-policies-lite', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, carrier, line_of_business, status')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as BindablePolicy[]) ?? [];
    },
    enabled: !!accountId,
  });
}
