/**
 * React Query hooks for the Coterie (mock) commercial quoting slice.
 *
 * Phase 1 is internal/staff-only and MOCK: creating a quote calls the
 * `coterie-quote` edge function (fixtures only) and the approval mutations write
 * to `carrier_approval_gates`. Nothing here binds, sends, or charges.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { assertDistinctApprover } from '@/integrations/coterie/approval';
import type {
  CarrierApprovalGateRow,
  CoterieQuoteFormValues,
  CoterieQuoteResponse,
  CoterieQuoteRow,
  ApprovalStatus,
} from '@/integrations/coterie/types';

const QUOTES_KEY = ['coterie', 'quotes'] as const;
const GATES_KEY = ['coterie', 'approval-gates'] as const;

/**
 * The Coterie tables (coterie_quotes, carrier_approval_gates) are added by
 * `20260701120000_coterie_quote_schema.sql`, which is NOT auto-applied in
 * Phase 1. Until `supabase gen types` is re-run, they are absent from the
 * generated `Database` type, so we access them through an untyped view and cast
 * results to the explicit row types defined in `@/integrations/coterie/types`.
 */
const coterieDb = supabase as unknown as {
  from: (table: string) => any;
};

/** Create a mock Coterie quote for an existing account via the edge function. */
export function useCreateCoterieQuote() {
  const queryClient = useQueryClient();

  return useMutation<CoterieQuoteResponse, Error, CoterieQuoteFormValues>({
    mutationFn: async (values) => {
      const { data, error } = await supabase.functions.invoke('coterie-quote', {
        body: values,
      });

      if (error) {
        logger.error('Coterie quote request failed', { error: error.message });
        throw error;
      }
      return data as CoterieQuoteResponse;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUOTES_KEY });
      queryClient.invalidateQueries({ queryKey: GATES_KEY });
      if (variables.accountId) {
        queryClient.invalidateQueries({ queryKey: [...QUOTES_KEY, variables.accountId] });
      }
    },
  });
}

/** List persisted Coterie quotes, optionally filtered to one account. */
export function useCoterieQuotes(accountId?: string) {
  return useQuery<CoterieQuoteRow[]>({
    queryKey: accountId ? [...QUOTES_KEY, accountId] : QUOTES_KEY,
    queryFn: async () => {
      let query = coterieDb
        .from('coterie_quotes')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('Failed to load Coterie quotes', { error: error.message });
        throw error;
      }
      return (data ?? []) as CoterieQuoteRow[];
    },
    staleTime: 30 * 1000,
  });
}

interface ApprovalGateFilters {
  status?: ApprovalStatus;
  accountId?: string;
}

/** List carrier approval gates for the quote entity type. */
export function useCoterieApprovalGates(filters: ApprovalGateFilters = {}) {
  const { status, accountId } = filters;
  return useQuery<CarrierApprovalGateRow[]>({
    queryKey: [...GATES_KEY, status ?? 'all', accountId ?? 'all'],
    queryFn: async () => {
      let query = coterieDb
        .from('carrier_approval_gates')
        .select('*')
        .eq('entity_type', 'quote')
        .order('created_at', { ascending: false })
        .limit(200);

      if (status) query = query.eq('status', status);
      if (accountId) query = query.eq('account_id', accountId);

      const { data, error } = await query;
      if (error) {
        logger.error('Failed to load approval gates', { error: error.message });
        throw error;
      }
      return (data ?? []) as CarrierApprovalGateRow[];
    },
    staleTime: 30 * 1000,
  });
}

interface UpdateApprovalGateInput {
  gateId: string;
  decision: 'approved' | 'denied';
  denialReason?: string;
  /**
   * The gate's requester. Required to enforce separation of duties on approval:
   * the approver must be a different identified human than the requester. RLS
   * enforces this server-side; passing it here surfaces a friendly error first.
   */
  requestedBy?: string | null;
}

/**
 * Approve or deny an approval gate. Records the acting user (named human) and a
 * timestamp. This NEVER triggers a bind/send — it only records the decision.
 *
 * Separation of duties: approving a gate you requested is rejected (both here,
 * pre-flight, and authoritatively by RLS) so the named-human approver is never
 * forgeable — important because Phase 2 wires bind/send to gate status.
 */
export function useUpdateCoterieApprovalGate() {
  const queryClient = useQueryClient();

  return useMutation<CarrierApprovalGateRow, Error, UpdateApprovalGateInput>({
    mutationFn: async ({ gateId, decision, denialReason, requestedBy }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be signed in to review approvals.');
      }

      if (decision === 'approved') {
        // Pre-flight separation-of-duties check (RLS enforces this server-side).
        assertDistinctApprover({ approverId: user.id, requestedBy });
      }

      const update: Record<string, unknown> = {
        status: decision,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        denial_reason: decision === 'denied' ? denialReason ?? 'No reason provided' : null,
      };

      const { data, error } = await coterieDb
        .from('carrier_approval_gates')
        .update(update)
        .eq('id', gateId)
        .select('*')
        .single();

      if (error) {
        logger.error('Failed to update approval gate', { error: error.message });
        throw error;
      }
      return data as CarrierApprovalGateRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GATES_KEY });
    },
  });
}
