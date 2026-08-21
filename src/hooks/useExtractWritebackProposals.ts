import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import type { LineCategory } from '@/lib/extractAccountMatch';
import {
  buildProposedQuotesFromSnapshot,
  hashExtractSnapshot,
  type ProposedQuotePayload,
} from '@/lib/extractWritebackProposal';

export type ExtractWritebackProposalStatus = 'pending' | 'applied' | 'rejected';

export interface ExtractWritebackProposalRow {
  id: string;
  document_analysis_id: string;
  account_id: string;
  snapshot_hash: string;
  carrier_name: string;
  line_class: LineCategory;
  status: ExtractWritebackProposalStatus;
  proposed_quote: ProposedQuotePayload;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UseExtractWritebackProposalsInput {
  analysisId: string;
  accountId: string | null | undefined;
  snapshot: ExtractSnapshotV1;
  lineCategory: LineCategory;
  enabled?: boolean;
}

const PROPOSALS_QUERY_KEY = 'extract-writeback-proposals';

function proposalsQueryKey(analysisId: string, accountId: string) {
  return [PROPOSALS_QUERY_KEY, analysisId, accountId] as const;
}

export function useExtractWritebackProposals({
  analysisId,
  accountId,
  snapshot,
  lineCategory,
  enabled = true,
}: UseExtractWritebackProposalsInput) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const lastEnsuredKey = useRef<string | null>(null);

  const isActive = enabled && !!accountId;

  const proposalsQuery = useQuery({
    queryKey: proposalsQueryKey(analysisId, accountId ?? ''),
    queryFn: async () => {
      if (!accountId) return [] as ExtractWritebackProposalRow[];

      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('extract_writeback_proposals' as any)
        .select('*')
        .eq('document_analysis_id', analysisId)
        .eq('account_id', accountId)
        .eq('status', 'pending')
        .order('carrier_name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ExtractWritebackProposalRow[];
    },
    enabled: isActive,
  });

  const ensureProposalsMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) return { inserted: 0 };

      const snapshotHash = await hashExtractSnapshot(snapshot);
      const payloads = buildProposedQuotesFromSnapshot(snapshot, accountId, lineCategory);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const rows = payloads.map((payload) => ({
        document_analysis_id: analysisId,
        account_id: accountId,
        snapshot_hash: snapshotHash,
        carrier_name: payload.quote.options.carrier_name,
        line_class: lineCategory,
        status: 'pending' as const,
        proposed_quote: payload,
        created_by: user?.id ?? null,
      }));

      if (rows.length === 0) return { inserted: 0 };

      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('extract_writeback_proposals' as any)
        .upsert(rows, {
          onConflict: 'document_analysis_id,account_id,snapshot_hash,carrier_name',
          ignoreDuplicates: true,
        })
        .select('id');

      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
    onSuccess: () => {
      if (accountId) {
        queryClient.invalidateQueries({
          queryKey: proposalsQueryKey(analysisId, accountId),
        });
      }
    },
    onError: (err: Error) => {
      logger.error('ensure extract writeback proposals error', err);
      toast({
        title: 'Could not build write-back proposals',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const rejectProposalMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('extract_writeback_proposals' as any)
        .update({ status: 'rejected' })
        .eq('id', proposalId);

      if (error) throw error;
    },
    onSuccess: () => {
      if (accountId) {
        queryClient.invalidateQueries({
          queryKey: proposalsQueryKey(analysisId, accountId),
        });
      }
      toast({
        title: 'Proposal rejected',
        description: 'This write-back proposal was dismissed.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not reject proposal',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: ensureProposalsAsync, isPending: ensuring } = ensureProposalsMutation;

  const ensureProposals = useCallback(() => {
    if (!isActive) return;
    void ensureProposalsAsync();
  }, [isActive, ensureProposalsAsync]);

  const rejectProposal = useCallback(
    (proposalId: string) => {
      rejectProposalMutation.mutate(proposalId);
    },
    [rejectProposalMutation],
  );

  useEffect(() => {
    if (!isActive) {
      lastEnsuredKey.current = null;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const snapshotHash = await hashExtractSnapshot(snapshot);
        const key = `${analysisId}:${accountId}:${snapshotHash}:${lineCategory}`;
        if (lastEnsuredKey.current === key) return;

        await ensureProposalsAsync();
        if (!cancelled) {
          lastEnsuredKey.current = key;
        }
      } catch {
        // onError toast handles user feedback
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analysisId, accountId, lineCategory, snapshot, isActive, ensureProposalsAsync]);

  return {
    proposals: proposalsQuery.data ?? [],
    proposalsLoading: proposalsQuery.isLoading,
    proposalsError: proposalsQuery.error,
    ensuring,
    rejecting: rejectProposalMutation.isPending,
    ensureProposals,
    rejectProposal,
  };
}
