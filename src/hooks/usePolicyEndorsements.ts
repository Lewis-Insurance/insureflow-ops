// ============================================================================
// POLICY ENDORSEMENT WRITE/READ HOOKS
// ============================================================================
// React Query wrappers over the endorsement write paths added in
// 20260707130000_coi_endorsement_write_paths.sql. These are the human write
// surface the certificate resolver (resolve_holder_endorsements) already reads,
// so a change here flows straight into what a certificate prints (Y/N in the
// ADDL INSD / SUBR WVD columns).
//
// Reads: get_line_endorsements(policy, line) -> { blanket, scheduled } in one
// uniform shape per line (WC is waiver-only; the others carry AI + waiver).
// Writes: set the single blanket row, attach a specific directory holder, flip
// status/waiver/form on a row, or remove a row. Every mutation invalidates the
// line's endorsement query, the account Master COI, and the holder-resolution
// cache so the policy page, Master COI, and Generate COI all stay consistent.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

/**
 * The endorsement RPCs are intentionally not in the generated Supabase types
 * (the whole book of custom RPCs is omitted; regenerating types is tracked as a
 * separate effort). Route calls through one locally-typed shim so the rest of
 * this file stays fully typed and we add zero new type errors.
 */
type RpcResult = { data: unknown; error: { message: string } | null };
const callRpc = (fn: string, args: Record<string, unknown>): Promise<RpcResult> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.rpc as any)(fn, args);

export type EndorsementLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property';
export type EndorsementStatus = 'none' | 'requested' | 'endorsed';

/** The single blanket-signature row for a line (null when none exists). */
export interface BlanketEndorsement {
  present: boolean;
  row_id: string;
  status: EndorsementStatus;
  /** true for AI-bearing lines; always false for WC. */
  addl_insd: boolean;
  subr_wvd: boolean;
  endorsement_form: string | null;
  is_manual: boolean;
}

/** One scheduled (specific) additional insured / waiver row. */
export interface ScheduledEndorsement {
  row_id: string;
  additional_insured_id: string | null;
  name: string;
  status: EndorsementStatus;
  subr_wvd: boolean;
  endorsement_form: string | null;
  is_manual: boolean;
  has_evidence: boolean;
}

export interface LineEndorsements {
  line: EndorsementLineKey;
  blanket: BlanketEndorsement | null;
  scheduled: ScheduledEndorsement[];
}

const EMPTY: Omit<LineEndorsements, 'line'> = { blanket: null, scheduled: [] };

/** Read the current endorsement picture for one (policy, line). */
export function usePolicyLineEndorsements(
  policyId: string | null | undefined,
  line: EndorsementLineKey,
) {
  return useQuery({
    queryKey: ['policy-endorsements', policyId, line],
    enabled: !!policyId,
    queryFn: async (): Promise<LineEndorsements> => {
      const { data, error } = await callRpc('get_line_endorsements', {
        p_policy_id: policyId,
        p_line: line,
      });
      if (error) throw error;
      const obj = (data ?? {}) as Partial<LineEndorsements>;
      return {
        line,
        blanket: (obj.blanket as BlanketEndorsement | null) ?? EMPTY.blanket,
        scheduled: Array.isArray(obj.scheduled)
          ? (obj.scheduled as ScheduledEndorsement[])
          : EMPTY.scheduled,
      };
    },
  });
}

/**
 * The four endorsement mutations, bundled with a shared cache invalidation so a
 * write on the policy page also refreshes the Master COI and any open holder
 * resolution (the Generate COI toggles).
 */
export function usePolicyEndorsementActions(
  accountId: string,
  policyId: string,
  line: EndorsementLineKey,
) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['policy-endorsements', policyId, line] });
    queryClient.invalidateQueries({ queryKey: ['master-coi', accountId] });
    queryClient.invalidateQueries({ queryKey: ['endorsement-status'] });
  };

  const onError = (context: string) => (err: unknown) => {
    logger.error(`policy endorsement ${context} failed`, err);
    toast.error('Could not update the endorsement. Please try again.');
  };

  const setBlanket = useMutation({
    mutationFn: async (vars: {
      addlInsd: boolean;
      subrWvd: boolean;
      status?: EndorsementStatus;
      form?: string | null;
    }) => {
      const { data, error } = await callRpc('set_line_blanket_endorsement', {
        p_policy_id: policyId,
        p_line: line,
        p_addl_insd: vars.addlInsd,
        p_subr_wvd: vars.subrWvd,
        p_status: vars.status ?? 'endorsed',
        p_form: vars.form ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
    onError: onError('set blanket'),
  });

  const attachScheduled = useMutation({
    mutationFn: async (vars: {
      additionalInsuredId: string;
      subrWvd?: boolean;
      status?: EndorsementStatus;
      form?: string | null;
    }) => {
      const { data, error } = await callRpc('attach_line_scheduled_ai', {
        p_policy_id: policyId,
        p_line: line,
        p_additional_insured_id: vars.additionalInsuredId,
        p_subr_wvd: vars.subrWvd ?? false,
        p_status: vars.status ?? 'endorsed',
        p_form: vars.form ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
    onError: onError('attach scheduled'),
  });

  const setRow = useMutation({
    mutationFn: async (vars: {
      rowId: string;
      status?: EndorsementStatus;
      subrWvd?: boolean;
      form?: string | null;
    }) => {
      const { data, error } = await callRpc('set_line_endorsement_row', {
        p_line: line,
        p_row_id: vars.rowId,
        p_status: vars.status ?? null,
        p_subr_wvd: vars.subrWvd ?? null,
        p_form: vars.form ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
    onError: onError('set row'),
  });

  const removeRow = useMutation({
    mutationFn: async (vars: { rowId: string }) => {
      const { data, error } = await callRpc('remove_line_endorsement_row', {
        p_line: line,
        p_row_id: vars.rowId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
    onError: onError('remove row'),
  });

  return { setBlanket, attachScheduled, setRow, removeRow };
}
