// ============================================================================
// CERTIFICATES-NEEDING-REISSUE HOOK (07 §3.3 / §3.5)
// ============================================================================
// Read model for the renewal reissue cascade batch queue. Wraps the two
// SECURITY INVOKER RPCs added in migration 20260704150000:
//   - list_certificates_needing_reissue(p_account_id uuid default null)
//   - count_certificates_needing_reissue(p_account_id uuid default null)
//
// Neither RPC nor the certificate tables are in the generated Supabase types,
// so the SETOF result is cast `as unknown as X` exactly like useCertificates.ts
// binds list_certificates. Types are NOT regenerated here.
//
// React Query keys (07 §3.5): ['certificates-needing-reissue', accountId] and
// ['certificates-needing-reissue-count', accountId]. accountId is optional; a
// null/undefined account runs the whole-book query (the RPC default).
// ============================================================================

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { COIReadiness } from '@/types/master-coi';
import type { CertificateLineKey } from '@/types/certificates';

/** The reason a single certificate line is stale (07 §3.3). */
export type ReissueStaleReason = 'renewed' | 'expired';

/**
 * One stale coverage line inside a `CertificateNeedingReissue` row. Dates are
 * ISO `YYYY-MM-DD` (or null); the queue formats them to MM/DD/YYYY as separate
 * labeled tokens (never a range dash).
 */
export interface ReissueStaleLine {
  line_key: string;
  policy_id: string;
  /** The expiration printed on the issued certificate (from its snapshot). */
  printed_expiration: string | null;
  /** The policy's current expiration after the renewal advanced the date. */
  current_expiration: string | null;
  reason: ReissueStaleReason | null;
}

/**
 * One row from `list_certificates_needing_reissue`. Field names mirror the RPC
 * `returns table(...)` column list exactly (migration 20260704150000).
 */
export interface CertificateNeedingReissue {
  certificate_id: string;
  certificate_number: string;
  holder_id: string;
  holder_name: string;
  account_id: string;
  issued_at: string;
  /** The stale lines with printed-vs-current dates (07 §3.3). */
  stale_lines: ReissueStaleLine[];
  line_keys: string[];
  policy_ids: string[];
  /** get_master_coi(account, policy_ids)->'readiness' for the selected lines. */
  readiness: COIReadiness | null;
  /** coalesce((readiness->>'ready')::boolean, false) computed server-side. */
  is_ready: boolean;
}

export interface UseCertificatesNeedingReissueResult {
  rows: CertificateNeedingReissue[];
  count: number;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useCertificatesNeedingReissue(
  accountId?: string | null,
): UseCertificatesNeedingReissueResult {
  const queryClient = useQueryClient();
  // Normalize undefined to null so the RPC receives the whole-book default and
  // the query key is stable across both call forms.
  const account = accountId ?? null;

  const listQuery = useQuery({
    queryKey: ['certificates-needing-reissue', account],
    queryFn: async (): Promise<CertificateNeedingReissue[]> => {
      const { data, error } = await supabase.rpc('list_certificates_needing_reissue', {
        p_account_id: account,
      });
      if (error) throw error;
      // Not in the generated types; bind the SETOF rows to the read model
      // (matches the useCertificates.ts cast pattern for list_certificates).
      return (data || []) as unknown as CertificateNeedingReissue[];
    },
    staleTime: 30 * 1000,
  });

  const countQuery = useQuery({
    queryKey: ['certificates-needing-reissue-count', account],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('count_certificates_needing_reissue', {
        p_account_id: account,
      });
      if (error) throw error;
      return typeof data === 'number' ? data : Number(data ?? 0);
    },
    staleTime: 30 * 1000,
  });

  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['certificates-needing-reissue', account] }),
      queryClient.invalidateQueries({
        queryKey: ['certificates-needing-reissue-count', account],
      }),
    ]);
  }, [queryClient, account]);

  return {
    rows: listQuery.data ?? [],
    count: countQuery.data ?? 0,
    isLoading: listQuery.isLoading || countQuery.isLoading,
    refetch,
  };
}

/** Re-export so the queue can narrow line keys against the canonical enum. */
export type { CertificateLineKey };
