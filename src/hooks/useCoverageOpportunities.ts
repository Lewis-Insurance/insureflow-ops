// ============================================================================
// COVERAGE OPPORTUNITIES HOOK
// ============================================================================
// Cross-sell opportunities
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CoverageOpportunity } from '@/types/portal';

export function useCoverageOpportunities() {
  const queryClient = useQueryClient();

  const opportunitiesQuery = useQuery({
    queryKey: ['portal-coverage-opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_coverage_opportunities')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;
      return data as CoverageOpportunity[];
    },
  });

  // Dismiss an opportunity
  const dismissOpportunity = useMutation({
    mutationFn: async ({
      opportunityId,
      reason
    }: {
      opportunityId: string;
      reason?: string;
    }) => {
      const { error } = await supabase
        .from('portal_coverage_opportunities')
        .update({
          status: 'dismissed',
          dismissed_at: new Date().toISOString(),
          dismissed_reason: reason,
        })
        .eq('id', opportunityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-coverage-opportunities'] });
    },
  });

  // Mark opportunity as clicked
  const clickOpportunity = useMutation({
    mutationFn: async (opportunityId: string) => {
      const { error } = await supabase
        .from('portal_coverage_opportunities')
        .update({
          status: 'clicked',
          clicked_at: new Date().toISOString(),
        })
        .eq('id', opportunityId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-coverage-opportunities'] });
    },
  });

  return {
    opportunities: opportunitiesQuery.data ?? [],
    isLoading: opportunitiesQuery.isLoading,
    error: opportunitiesQuery.error,
    refetch: opportunitiesQuery.refetch,
    dismissOpportunity,
    clickOpportunity,
  };
}
