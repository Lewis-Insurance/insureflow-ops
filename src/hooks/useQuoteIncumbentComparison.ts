import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { QuoteCoverage } from '@/hooks/useRankedQuotes';
import type { PolicyWithAccount } from '@/hooks/usePolicies';
import {
  buildPolicyStructuredSnapshot,
  buildQuoteStructuredSnapshot,
} from '@/lib/quoteIncumbent/buildStructuredSnapshot';
import { diffQuoteIncumbentSnapshots } from '@/lib/quoteIncumbent/diffQuoteIncumbent';
import {
  proposeIncumbentPolicies,
  type IncumbentPolicyCandidate,
} from '@/lib/quoteIncumbent/proposeIncumbentPolicy';

export interface QuoteIncumbentComparisonInput {
  accountId: string;
  quoteId: string;
  quoteLineOfBusiness: string;
  policyNumberHint?: string | null;
  carrierHint?: string | null;
  claimsMade?: boolean | null;
  defenseInsideLimits?: boolean | null;
  enabled?: boolean;
}

export function useQuoteIncumbentComparison({
  accountId,
  quoteId,
  quoteLineOfBusiness,
  policyNumberHint,
  carrierHint,
  claimsMade,
  defenseInsideLimits,
  enabled = true,
}: QuoteIncumbentComparisonInput) {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [skipComparison, setSkipComparison] = useState(false);

  const policiesQuery = useQuery({
    queryKey: ['policies', 'account', accountId, 'incumbent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('effective_date', { ascending: false });

      if (error) throw error;
      return (data ?? []) as PolicyWithAccount[];
    },
    enabled: enabled && !!accountId,
    staleTime: 60_000,
  });

  const quoteQuery = useQuery({
    queryKey: ['quote', quoteId, 'incumbent-comparison'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(
          `
          *,
          carrier_info:carriers!quotes_carrier_id_fkey(id, name),
          quote_coverages (*)
        `,
        )
        .eq('id', quoteId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: enabled && !!quoteId,
    staleTime: 30_000,
  });

  const incumbentCandidates = useMemo(() => {
    if (!policiesQuery.data) return [] as IncumbentPolicyCandidate[];
    return proposeIncumbentPolicies({
      policies: policiesQuery.data,
      quoteLineOfBusiness,
      policyNumberHint,
      carrierHint,
    });
  }, [policiesQuery.data, quoteLineOfBusiness, policyNumberHint, carrierHint]);

  const suggestedPolicyId = incumbentCandidates[0]?.policy.id ?? null;

  const activePolicyId = skipComparison ? null : (selectedPolicyId ?? suggestedPolicyId);

  const diffResult = useMemo(() => {
    if (!activePolicyId || !quoteQuery.data || skipComparison) return null;

    const incumbentPolicy = policiesQuery.data?.find((p) => p.id === activePolicyId);
    if (!incumbentPolicy) return null;

    const quote = quoteQuery.data;
    const options =
      quote.options && typeof quote.options === 'object' && !Array.isArray(quote.options)
        ? (quote.options as Record<string, unknown>)
        : null;

    const incumbentSnapshot = buildPolicyStructuredSnapshot(incumbentPolicy, incumbentPolicy.carrier);

    const quoteSnapshot = buildQuoteStructuredSnapshot({
      id: quote.id,
      line_of_business: quote.line_of_business,
      premium: quote.premium,
      quote_ref: quote.quote_ref,
      expiration_date: quote.expires_at,
      carrier_name:
        (options?.carrier_name as string | undefined) ??
        quote.carrier_info?.name ??
        quote.competitor_carrier,
      options,
      coverages: (quote.quote_coverages ?? []) as QuoteCoverage[],
      claims_made: claimsMade,
      defense_inside_limits: defenseInsideLimits,
    });

    return diffQuoteIncumbentSnapshots(incumbentSnapshot, quoteSnapshot);
  }, [
    activePolicyId,
    policiesQuery.data,
    quoteQuery.data,
    skipComparison,
    claimsMade,
    defenseInsideLimits,
  ]);

  return {
    policiesLoading: policiesQuery.isLoading,
    quoteLoading: quoteQuery.isLoading,
    incumbentCandidates,
    suggestedPolicyId,
    selectedPolicyId: activePolicyId,
    setSelectedPolicyId,
    skipComparison,
    setSkipComparison,
    diffResult,
    hasIncumbentOptions: incumbentCandidates.length > 0,
  };
}
