import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface TopFactor {
  factor_key: string;
  direction: 'positive' | 'negative';
  weight: number;
  raw_value: number;
  contribution: number;
  explanation: string;
}

interface PolicyRenewalRiskScore {
  id: string;
  created_at: string;
  agency_workspace_id: string;
  account_id: string;
  policy_id: string;
  renewal_date: string;
  score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  top_factors: TopFactor[];
  scoring_inputs: Record<string, unknown>;
  model_name: string;
  model_version: string;
}

interface AccountChurnRiskScore {
  id: string;
  created_at: string;
  agency_workspace_id: string;
  account_id: string;
  score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  top_factors: TopFactor[];
  policy_risk_summary: Array<{
    policy_id: string;
    score: number;
    risk_level: string;
  }>;
  model_name: string;
  model_version: string;
  run_date: string;
}

interface AnalyticsJobRun {
  id: string;
  created_at: string;
  job_type: string;
  status: 'created' | 'running' | 'completed' | 'failed' | 'cancelled';
  started_at: string | null;
  finished_at: string | null;
  model_name: string | null;
  model_version: string | null;
  stats: Record<string, unknown>;
  error: string | null;
}

interface RetentionModelConfig {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  config: {
    weights: Record<string, number>;
    thresholds: {
      low: number;
      medium: number;
      high: number;
    };
    windows: {
      renewal_days_ahead: number;
      contact_stale_days: number;
      claim_lookback_months: number;
      payment_lookback_days: number;
    };
  };
  notes: string | null;
}

interface UpcomingRenewal {
  policy_id: string;
  account_id: string;
  account_name: string;
  policy_number: string;
  line_of_business: string;
  carrier_name: string | null;
  premium: number;
  effective_date: string;
  expiration_date: string;
  days_to_renewal: number;
  assigned_to: string | null;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get policy renewal risk scores with filters
 */
export function usePolicyRenewalRiskScores(params?: {
  accountId?: string;
  policyId?: string;
  riskLevel?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['policy-renewal-risk-scores', params],
    queryFn: async () => {
      let query = supabase
        .from('policy_renewal_risk_scores')
        .select('*')
        .order('score', { ascending: false });

      if (params?.accountId) {
        query = query.eq('account_id', params.accountId);
      }
      if (params?.policyId) {
        query = query.eq('policy_id', params.policyId);
      }
      if (params?.riskLevel) {
        query = query.eq('risk_level', params.riskLevel);
      }
      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PolicyRenewalRiskScore[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get account churn risk scores with filters
 */
export function useAccountChurnRiskScores(params?: {
  accountId?: string;
  riskLevel?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['account-churn-risk-scores', params],
    queryFn: async () => {
      let query = supabase
        .from('account_churn_risk_scores')
        .select('*')
        .order('score', { ascending: false });

      if (params?.accountId) {
        query = query.eq('account_id', params.accountId);
      }
      if (params?.riskLevel) {
        query = query.eq('risk_level', params.riskLevel);
      }
      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AccountChurnRiskScore[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get upcoming renewals for an agency
 */
export function useUpcomingRenewals(params: {
  agencyWorkspaceId: string;
  daysAhead?: number;
  accountId?: string;
}) {
  return useQuery({
    queryKey: ['upcoming-renewals', params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_upcoming_renewals', {
        p_agency_workspace_id: params.agencyWorkspaceId,
        p_days_ahead: params.daysAhead || 60,
        p_account_id: params.accountId || null,
      });

      if (error) throw error;
      return data as UpcomingRenewal[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!params.agencyWorkspaceId,
  });
}

/**
 * Get retention model configurations
 */
export function useRetentionModelConfigs() {
  return useQuery({
    queryKey: ['retention-model-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retention_model_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RetentionModelConfig[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Get analytics job runs for retention scoring
 */
export function useRetentionJobRuns(limit = 20) {
  return useQuery({
    queryKey: ['retention-job-runs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_job_runs')
        .select('*')
        .eq('job_type', 'renewal_scoring')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as AnalyticsJobRun[];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Update retention model config
 */
export function useUpdateRetentionModelConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Partial<RetentionModelConfig>;
    }) => {
      const { data, error } = await supabase
        .from('retention_model_configs')
        .update(params.updates)
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-model-configs'] });
      toast.success('Retention model config updated');
    },
    onError: (error) => {
      toast.error(`Failed to update config: ${error.message}`);
    },
  });
}

/**
 * Get retention risk summary statistics
 */
export function useRetentionRiskSummary(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['retention-risk-summary', agencyWorkspaceId],
    queryFn: async () => {
      let query = supabase
        .from('policy_renewal_risk_scores')
        .select('risk_level, score');

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const scores = data || [];
      const summary = {
        total: scores.length,
        critical: scores.filter(s => s.risk_level === 'critical').length,
        high: scores.filter(s => s.risk_level === 'high').length,
        medium: scores.filter(s => s.risk_level === 'medium').length,
        low: scores.filter(s => s.risk_level === 'low').length,
        averageScore: scores.length > 0
          ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length
          : 0,
      };

      return summary;
    },
    staleTime: 5 * 60 * 1000,
  });
}
