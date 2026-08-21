import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import type { DuplicateAccount } from '@/hooks/useDuplicateAccounts';
import {
  classifyLineCategory,
  inferAccountType,
  mapDuplicateToCandidate,
  mapNameSearchToCandidate,
  mapPolicySearchToCandidate,
  mergeBookingIntoExtractedData,
  rankAccountMatches,
  readBookingFromExtractedData,
  type AccountMatchCandidate,
  type ExtractBookingMeta,
  type GlobalSearchRow,
  type LineCategory,
} from '@/lib/extractAccountMatch';

const NAME_SEARCH_LIMIT = 25;
const POLICY_SEARCH_LIMIT = 10;

export interface UseExtractAccountMatchInput {
  analysisId: string;
  snapshot: ExtractSnapshotV1;
  accountId: string | null | undefined;
  documentId: string | null | undefined;
  extractedData: unknown;
}

export function useExtractAccountMatch({
  analysisId,
  snapshot,
  accountId,
  documentId,
  extractedData,
}: UseExtractAccountMatchInput) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const proposeSeq = useRef(0);

  const [candidates, setCandidates] = useState<AccountMatchCandidate[]>([]);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  const booking = useMemo(
    () => readBookingFromExtractedData(extractedData, snapshot),
    [extractedData, snapshot],
  );

  const linkedAccountQuery = useQuery({
    queryKey: ['extract-account-match-linked', accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type')
        .eq('id', accountId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });

  const proposeMatches = useCallback(async () => {
    const seq = ++proposeSeq.current;
    const insuredName = snapshot.insured_name?.trim();
    if (!insuredName) {
      setCandidates([]);
      setProposeError(null);
      return;
    }

    setProposing(true);
    setProposeError(null);

    try {
      const accountType = inferAccountType(snapshot);
      const rawCandidates: AccountMatchCandidate[] = [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: duplicateData, error: duplicateError } = await (supabase.rpc as any)(
        'find_duplicate_accounts',
        {
          p_name: insuredName,
          p_type: accountType,
          p_email: null,
          p_phone: null,
          p_dob: null,
          p_limit: 5,
        },
      );

      if (duplicateError) {
        logger.error('find_duplicate_accounts error', duplicateError);
      } else {
        (duplicateData as DuplicateAccount[] | null)?.forEach((dup, index) => {
          rawCandidates.push(mapDuplicateToCandidate(dup, index));
        });
      }

      const { data: nameSearchData, error: nameSearchError } = await supabase.rpc('global_search_v1', {
        p_search_term: insuredName,
        p_limit: NAME_SEARCH_LIMIT,
      });

      if (nameSearchError) {
        logger.error('global_search_v1 name error', nameSearchError);
      } else {
        (nameSearchData as GlobalSearchRow[] | null)?.forEach((row, index) => {
          const mapped = mapNameSearchToCandidate(row, index);
          if (mapped) rawCandidates.push(mapped);
        });
      }

      const policyNumber = snapshot.policy_number?.trim();
      if (policyNumber) {
        const { data: policySearchData, error: policySearchError } = await supabase.rpc(
          'global_search_v1',
          {
            p_search_term: policyNumber,
            p_limit: POLICY_SEARCH_LIMIT,
          },
        );

        if (policySearchError) {
          logger.error('global_search_v1 policy error', policySearchError);
        } else {
          const policyRows = ((policySearchData as GlobalSearchRow[] | null) ?? []).filter(
            (row) => row.entity_type === 'policy',
          );

          if (policyRows.length > 0) {
            const policyIds = policyRows.map((row) => row.id);
            const { data: policyAccounts, error: policyAccountsError } = await supabase
              .from('policies')
              .select('id, account_id, accounts(name)')
              .in('id', policyIds)
              .is('deleted_at', null);

            if (policyAccountsError) {
              logger.error('policy account lookup error', policyAccountsError);
            } else {
              policyRows.forEach((row, index) => {
                const policy = policyAccounts?.find((p) => p.id === row.id);
                const accountIdFromPolicy = policy?.account_id;
                if (!accountIdFromPolicy) return;

                const accountName =
                  (policy?.accounts as { name?: string | null } | null)?.name?.trim() ||
                  row.subtitle?.match(/\(([^)]+)\)$/)?.[1]?.trim() ||
                  row.label;

                rawCandidates.push(
                  mapPolicySearchToCandidate(accountIdFromPolicy, accountName, row.label, index),
                );
              });
            }
          }
        }
      }

      if (seq !== proposeSeq.current) return;
      setCandidates(rankAccountMatches(rawCandidates));
    } catch (err) {
      if (seq !== proposeSeq.current) return;
      logger.error('propose account matches error', err);
      setProposeError(err instanceof Error ? err.message : 'Failed to propose account matches');
      setCandidates([]);
    } finally {
      if (seq === proposeSeq.current) {
        setProposing(false);
      }
    }
  }, [snapshot]);

  useEffect(() => {
    if (accountId) {
      setCandidates([]);
      setProposeError(null);
      return;
    }
    void proposeMatches();
  }, [accountId, proposeMatches]);

  const persistPickMutation = useMutation({
    mutationFn: async ({
      chosenAccountId,
      lineCategory,
      overridden,
    }: {
      chosenAccountId: string;
      lineCategory: LineCategory;
      overridden: boolean;
    }) => {
      const bookingMeta: ExtractBookingMeta = {
        line_category: lineCategory,
        line_category_source: overridden ? 'override' : 'snapshot',
      };

      const mergedExtractedData = mergeBookingIntoExtractedData(extractedData, bookingMeta);

      const { error: analysisError } = await supabase
        .from('document_analysis')
        .update({
          account_id: chosenAccountId,
          extracted_data: mergedExtractedData,
        })
        .eq('id', analysisId);

      if (analysisError) throw analysisError;

      if (documentId) {
        const { error: documentError } = await supabase
          .from('documents')
          .update({ account_id: chosenAccountId })
          .eq('id', documentId);

        if (documentError) throw documentError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-analysis', analysisId] });
      toast({
        title: 'Account linked',
        description: 'This analysis is now linked to the selected account.',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Could not link account',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const persistPick = useCallback(
    (chosenAccountId: string, lineCategory: LineCategory, overridden: boolean) => {
      persistPickMutation.mutate({ chosenAccountId, lineCategory, overridden });
    },
    [persistPickMutation],
  );

  return {
    candidates,
    proposing,
    proposeError,
    proposeMatches,
    booking,
    defaultLineCategory: classifyLineCategory(snapshot),
    linkedAccount: linkedAccountQuery.data,
    linkedAccountLoading: linkedAccountQuery.isLoading,
    persistPick,
    persisting: persistPickMutation.isPending,
  };
}
