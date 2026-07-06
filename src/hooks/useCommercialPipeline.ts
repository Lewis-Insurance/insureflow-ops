// ============================================================================
// COMMERCIAL PIPELINE HOOK (Commercial Lines SOW v3, closing rigor)
// ============================================================================
// Workspace-wide reads for the pipeline page (RLS scopes every query to the
// caller's member workspaces): the submission spine, its quotes, and the
// commercial book's renewal runway. Plus the per-policy bound-events read
// the Bound terms card uses. Read-only; no mutations here.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PipelineQuote, PipelineSubmission } from '@/lib/commercial/pipeline';

export interface PipelineSubmissionRow extends PipelineSubmission {
  account_id: string;
  target_lines: string[];
  wholesaler_name: string | null;
}

export function usePipelineSubmissions() {
  return useQuery({
    queryKey: ['commercial-pipeline', 'submissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('commercial_submissions' as any)
        .select('id, account_id, status, target_lines, wholesaler_name, created_at, updated_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as PipelineSubmissionRow[]) ?? [];
    },
    staleTime: 60 * 1000,
  });
}

export function usePipelineQuotes() {
  return useQuery({
    queryKey: ['commercial-pipeline', 'quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('quotes' as any)
        .select('id, status, premium, options, competitor_carrier, submission_id')
        .not('submission_id', 'is', null)
        .is('deleted_at', null);
      if (error) throw error;
      return (data as unknown as (PipelineQuote & { submission_id: string })[]) ?? [];
    },
    staleTime: 60 * 1000,
  });
}

export interface RunwayPolicyRow {
  id: string;
  account_id: string;
  policy_number: string | null;
  carrier: string | null;
  line_of_business: string | null;
  premium: number | null;
  status: string;
  expiration_date: string | null;
  account: { id: string; name: string | null } | null;
}

export function useCommercialRunwayPolicies() {
  return useQuery({
    queryKey: ['commercial-pipeline', 'runway-policies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('id, account_id, policy_number, carrier, line_of_business, premium, status, expiration_date, account:accounts!policies_account_id_fkey(id, name)')
        .eq('line_category', 'commercial')
        .in('status', ['active', 'pending'])
        .is('deleted_at', null)
        .not('expiration_date', 'is', null)
        .order('expiration_date', { ascending: true });
      if (error) throw error;
      return (data as unknown as RunwayPolicyRow[]) ?? [];
    },
    staleTime: 60 * 1000,
  });
}

/** submission_id -> bound-event timestamp; the precise cycle-time source. */
export function usePipelineBoundTimes() {
  return useQuery({
    queryKey: ['commercial-pipeline', 'bound-times'],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_events' as any)
        .select('submission_id, created_at')
        .eq('action', 'bound')
        .order('created_at', { ascending: true });
      if (error) throw error;
      const map: Record<string, string> = {};
      // Ascending order: the FIRST bound event per submission wins (a re-run
      // of a bind logs another row; the original bind is the cycle end).
      for (const row of (data as unknown as { submission_id: string; created_at: string }[]) ?? []) {
        if (!(row.submission_id in map)) map[row.submission_id] = row.created_at;
      }
      return map;
    },
    staleTime: 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Bound events for one policy (the Bound terms card)
// ---------------------------------------------------------------------------

export interface BoundEventRow {
  id: string;
  submission_id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function usePolicyBoundEvents(policyId: string | undefined) {
  return useQuery({
    queryKey: ['policy-bound-events', policyId],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('submission_events' as any)
        .select('id, submission_id, created_at, metadata')
        .eq('action', 'bound')
        .eq('metadata->>policy_id', policyId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data as unknown as BoundEventRow[]) ?? [];
    },
    staleTime: 60 * 1000,
    enabled: !!policyId,
  });
}
