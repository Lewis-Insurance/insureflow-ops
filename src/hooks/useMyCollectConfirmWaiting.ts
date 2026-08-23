import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * "Portal came back" rows for the signed-in producer (get_my_collect_confirm_waiting RPC).
 * One row per extracted portal upload that still has pending write-back proposals.
 * Refetches on window focus so the card clears after the producer confirms or rejects.
 */
export interface CollectConfirmWaitingRow {
  analysis_id: string;
  account_id: string;
  account_name: string;
  upload_id: string;
  filename: string;
  uploaded_at: string;
  pending_count: number;
  line_class: 'personal' | 'commercial' | null;
}

export const MY_COLLECT_CONFIRM_WAITING_KEY = ['my-collect-confirm-waiting'] as const;
export const COLLECT_CONFIRM_WAITING_LIMIT = 6;

export function useMyCollectConfirmWaiting(limit: number = COLLECT_CONFIRM_WAITING_LIMIT) {
  const query = useQuery({
    queryKey: [...MY_COLLECT_CONFIRM_WAITING_KEY, limit],
    queryFn: async (): Promise<CollectConfirmWaitingRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_my_collect_confirm_waiting', {
        p_limit: limit,
      });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          analysis_id: String(row.analysis_id),
          account_id: String(row.account_id),
          account_name: String(row.account_name ?? ''),
          upload_id: String(row.upload_id),
          filename: String(row.filename ?? ''),
          uploaded_at: String(row.uploaded_at),
          pending_count: Number(row.pending_count ?? 0),
          line_class:
            row.line_class === 'personal' || row.line_class === 'commercial'
              ? row.line_class
              : null,
        };
      });
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  return {
    rows: query.data ?? [],
    limit,
    loading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
