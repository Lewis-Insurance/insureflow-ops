import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CoverageGapRequest {
  account_id: string;
  customer_profile?: {
    industry?: string;
    employees?: number;
    revenue?: number;
    vehicles?: number;
    handles_client_data?: boolean;
    [key: string]: any;
  };
  current_policies?: Array<{
    coverage_type: string;
    limits?: string;
    deductible?: string;
    premium?: number;
  }>;
  analysis_type?: 'automatic' | 'manual' | 'scheduled';
}

interface AnalysisResponse {
  success: boolean;
  analysis: any;
  gaps_found: number;
  risk_level: string;
  estimated_premium_increase: number;
}

/**
 * Hook to trigger coverage gap analysis for an account
 */
export function useAnalyzeCoverageGaps() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CoverageGapRequest) => {
      const { data, error } = await supabase.functions.invoke('analyze-coverage-gaps', {
        body: request,
      });

      if (error) throw error;
      return data as AnalysisResponse;
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Coverage Analysis Complete',
        description: `Found ${data.gaps_found} coverage gap${data.gaps_found !== 1 ? 's' : ''} with ${data.risk_level.toUpperCase()} risk level`,
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-analyses', variables.account_id] });
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-analyses'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze coverage gaps',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch coverage gap analyses for an account
 */
export function useCoverageGapAnalyses(accountId?: string) {
  return useQuery({
    queryKey: ['coverage-gap-analyses', accountId],
    queryFn: async () => {
      let query = supabase
        .from('coverage_gap_analysis')
        .select(`
          *,
          analyzed_by:auth.users!coverage_gap_analysis_analyzed_by_fkey(id, email),
          reviewed_by:auth.users!coverage_gap_analysis_reviewed_by_fkey(id, email),
          quote:quotes(id, quote_number, status)
        `)
        .order('analysis_date', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    enabled: true,
  });
}

/**
 * Hook to fetch a single coverage gap analysis with recommendations
 */
export function useCoverageGapAnalysis(analysisId?: string) {
  return useQuery({
    queryKey: ['coverage-gap-analysis', analysisId],
    queryFn: async () => {
      if (!analysisId) return null;

      const { data, error } = await supabase
        .from('coverage_gap_analysis')
        .select(`
          *,
          analyzed_by:auth.users!coverage_gap_analysis_analyzed_by_fkey(id, email),
          reviewed_by:auth.users!coverage_gap_analysis_reviewed_by_fkey(id, email),
          recommendations:coverage_recommendations(*)
        `)
        .eq('id', analysisId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!analysisId,
  });
}

/**
 * Hook to update coverage gap analysis status
 */
export function useUpdateCoverageGapAnalysis() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      analysisId,
      updates,
    }: {
      analysisId: string;
      updates: {
        status?: 'pending' | 'reviewed' | 'quoted' | 'sold' | 'declined' | 'expired';
        review_notes?: string;
        quote_id?: string;
        was_sold?: boolean;
        sale_amount?: number;
      };
    }) => {
      const updateData: any = { ...updates };

      // Auto-set reviewed_at and reviewed_by if status changes to reviewed
      if (updates.status === 'reviewed') {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        updateData.reviewed_by = user?.id;
        updateData.reviewed_at = new Date().toISOString();
      }

      // Auto-set quoted_at if quote_id is provided
      if (updates.quote_id) {
        updateData.quoted_at = new Date().toISOString();
        updateData.status = 'quoted';
      }

      // Auto-set sold_at if was_sold is true
      if (updates.was_sold) {
        updateData.sold_at = new Date().toISOString();
        updateData.status = 'sold';
      }

      const { data, error } = await supabase
        .from('coverage_gap_analysis')
        .update(updateData)
        .eq('id', analysisId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Analysis Updated',
        description: `Status changed to ${data.status}`,
      });

      queryClient.invalidateQueries({ queryKey: ['coverage-gap-analysis', data.id] });
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-analyses', data.account_id] });
      queryClient.invalidateQueries({ queryKey: ['coverage-gap-analyses'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to update individual coverage recommendation status
 */
export function useUpdateCoverageRecommendation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recommendationId,
      status,
      customerResponse,
    }: {
      recommendationId: string;
      status: 'pending' | 'accepted' | 'declined' | 'quoted';
      customerResponse?: string;
    }) => {
      const { data, error } = await supabase
        .from('coverage_recommendations')
        .update({
          status,
          customer_response: customerResponse,
          response_date: new Date().toISOString(),
        })
        .eq('id', recommendationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Recommendation Updated',
        description: `Marked as ${data.status}`,
      });

      queryClient.invalidateQueries({
        queryKey: ['coverage-gap-analysis', data.gap_analysis_id],
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch coverage gap analytics
 */
export function useCoverageGapAnalytics() {
  return useQuery({
    queryKey: ['coverage-gap-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coverage_gap_analytics')
        .select('*')
        .order('month', { ascending: false })
        .limit(12); // Last 12 months

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Hook to fetch coverage gap templates
 */
export function useCoverageGapTemplates(industry?: string) {
  return useQuery({
    queryKey: ['coverage-gap-templates', industry],
    queryFn: async () => {
      let query = supabase
        .from('coverage_gap_templates')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (industry) {
        query = query.or(`industry.eq.${industry},industry.is.null`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Hook to refresh the coverage gap analytics materialized view
 */
export function useRefreshCoverageGapAnalytics() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_coverage_gap_analytics');

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Analytics Refreshed',
        description: 'Coverage gap analytics have been updated',
      });

      queryClient.invalidateQueries({ queryKey: ['coverage-gap-analytics'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Refresh Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to automatically analyze coverage gaps for new accounts
 */
export function useAutoAnalyzeCoverageGaps(accountId: string, enabled = true) {
  const analyzeMutation = useAnalyzeCoverageGaps();

  return useQuery({
    queryKey: ['auto-analyze-coverage-gaps', accountId],
    queryFn: async () => {
      // Check if analysis already exists
      const { data: existing } = await supabase
        .from('coverage_gap_analysis')
        .select('id')
        .eq('account_id', accountId)
        .order('analysis_date', { ascending: false })
        .limit(1)
        .single();

      // If no analysis exists, trigger one
      if (!existing) {
        return analyzeMutation.mutateAsync({
          account_id: accountId,
          analysis_type: 'automatic',
        });
      }

      return existing;
    },
    enabled: enabled && !!accountId,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
