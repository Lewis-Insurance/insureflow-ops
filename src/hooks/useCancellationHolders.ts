// ============================================================================
// CANCELLATION-NOTICE HOLDER-LIST HOOK (07 §5.2)
// ============================================================================
// Read-only data layer for the cancellation notice workflow. When a policy is
// cancelled or non-renewed, staff must know which active certificate holders
// were promised notice. This hook wraps the SECURITY DEFINER reader
// `list_active_cert_holders_for_policy(p_policy_id)`, which returns the active
// certs (issued or sent, not superseded/voided) that reference the policy,
// each with the holder's snapshot identity (the promised-notice mailing
// address) plus live directory ids and the holder's `notice_days`.
//
// The certificate tables are NOT in the generated Supabase types, so the RPC
// result is cast exactly like useCertificates.ts (`as unknown as X`). Types are
// NOT regenerated here.
//
// React Query key: ['cancellation-holders', policyId]. Enabled only when a
// policyId is truthy.
// ============================================================================

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * The promised-notice mailing address frozen in the certificate snapshot
 * (04 Section 4). This is the identity we promised notice to, not the live
 * directory row, so it is the authoritative address for a cancellation notice.
 */
export interface CancellationHolderAddress {
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/**
 * One row of `list_active_cert_holders_for_policy` (07 §5.2). One active
 * certificate that references the policy, with the holder's snapshot identity
 * and the live directory row id for current contact info.
 */
export interface CancellationHolder {
  certificate_id: string;
  certificate_number: string;
  /** Live additional_insureds directory row id (current contact info). */
  holder_id: string;
  /** Holder display name, from the cert snapshot (promised-notice identity). */
  holder_name: string;
  /**
   * The promised-notice mailing address from the cert snapshot, shape
   * { line1, city, state, zip }. May be null when the snapshot omitted it.
   */
  holder_address: CancellationHolderAddress | null;
  /** When the certificate was issued. */
  issued_at: string;
  /** The holder's requirements notice_days, when set; otherwise null. */
  notice_days: number | null;
}

export interface UseCancellationHoldersResult {
  holders: CancellationHolder[];
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useCancellationHolders(
  policyId: string | null,
): UseCancellationHoldersResult {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['cancellation-holders', policyId],
    queryFn: async (): Promise<CancellationHolder[]> => {
      const { data, error } = await supabase.rpc(
        // list_active_cert_holders_for_policy is not in the generated types
        // (the certificate tables are omitted); bind its SETOF rows to the
        // reader contract, matching the useCertificates.ts cast pattern.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'list_active_cert_holders_for_policy' as any,
        { p_policy_id: policyId },
      );
      if (error) throw error;
      return (data || []) as unknown as CancellationHolder[];
    },
    enabled: !!policyId,
    staleTime: 30 * 1000,
  });

  const refetch = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ['cancellation-holders', policyId],
    });
  }, [queryClient, policyId]);

  return {
    holders: query.data ?? [],
    isLoading: query.isLoading,
    refetch,
  };
}
