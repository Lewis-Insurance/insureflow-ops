/**
 * Predictive Analytics Hooks
 *
 * React Query hooks for AI-powered customer predictions including:
 * - Churn prediction and risk scoring
 * - Renewal risk forecasting
 * - Product cross-sell recommendations
 * - Retention interventions
 * - LTV prediction and trends
 *
 * Updated to use customer_risk_scores schema (v2.0)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// =============================================================================
// Types (Updated for customer_risk_scores schema)
// =============================================================================

export type ChurnRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type LtvTrend = 'increasing' | 'stable' | 'declining';
export type PredictionStatus = 'active' | 'expired' | 'archived';

export type InterventionType =
  | 'check_in_call'
  | 'coverage_review'
  | 'premium_discount_offer'
  | 'payment_plan_adjustment'
  | 'loyalty_reward'
  | 'service_recovery'
  | 'proactive_claim_support'
  | 'policy_optimization';

export type InterventionStatus =
  | 'recommended'
  | 'scheduled'
  | 'completed'
  | 'dismissed'
  | 'expired';

export type InterventionOutcome = 'successful' | 'unsuccessful' | 'partial' | 'pending';

/**
 * Customer risk score from customer_risk_scores table
 */
export interface CustomerRiskScore {
  id: string;
  account_id: string;

  // Churn prediction
  churn_probability: number;
  churn_risk_level: ChurnRiskLevel;
  churn_confidence: number;

  // Renewal risk
  renewal_risk_probability: number;
  renewal_risk_level: ChurnRiskLevel;
  days_until_renewal: number | null;

  // Lifetime value prediction
  predicted_lifetime_value: number;
  current_lifetime_value: number;
  ltv_trend: LtvTrend;

  // Risk factors
  risk_factors: Array<{
    factor: string;
    weight: number;
    severity: string;
    points: number;
  }>;
  protective_factors: Array<{
    factor: string;
    weight: number;
    points: number;
  }>;

  // Recommended actions
  recommended_actions: Array<{
    action: string;
    priority: string;
    due_days: number;
    rationale: string;
  }>;

  // Product recommendations
  next_product_predictions: Array<{
    product: string;
    probability: number;
    rationale: string;
  }>;

  // Metadata
  model_version: string;
  scoring_metadata: any;
  scored_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Retention intervention from retention_interventions table
 */
export interface RetentionIntervention {
  id: string;
  account_id: string;
  risk_score_id: string | null;
  intervention_type: InterventionType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  recommended_timeline_days: number | null;
  status: InterventionStatus;
  assigned_to: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  outcome: InterventionOutcome | null;
  outcome_notes: string | null;
  customer_retained: boolean | null;
  pre_intervention_churn_probability: number | null;
  post_intervention_churn_probability: number | null;
  estimated_value_saved: number | null;
  intervention_metadata: any;
  created_at: string;
  updated_at: string;
}

/**
 * At-risk customer from churn_predictions materialized view
 */
export interface AtRiskCustomer {
  id: string;
  account_id: string;
  account_name: string;
  customer_since: string;
  churn_probability: number;
  churn_risk_level: ChurnRiskLevel;
  churn_confidence: number;
  renewal_risk_probability: number;
  renewal_risk_level: ChurnRiskLevel;
  days_until_renewal: number | null;
  predicted_lifetime_value: number;
  current_lifetime_value: number;
  ltv_trend: LtvTrend;
  risk_factors: any;
  protective_factors: any;
  recommended_actions: any;
  next_product_predictions: any;
  active_policies: number;
  won_quotes: number;
  last_interaction: string | null;
  scored_at: string;
  expires_at: string;
}

export interface CreateInterventionRequest {
  account_id: string;
  risk_score_id?: string;
  intervention_type: InterventionType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  recommended_timeline_days?: number;
  assigned_to?: string;
  scheduled_for?: string;
  intervention_metadata?: any;
}

// =============================================================================
// Mutation Hooks: Calculate Risk Scores
// =============================================================================

/**
 * Calculate risk scores for specific accounts
 */
export function useCalculateRiskScores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ accountIds }: { accountIds: string[] }) => {
      const { data, error } = await supabase.functions.invoke('calculate-customer-risk', {
        body: { accountIds },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Risk calculation failed');

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });
      queryClient.invalidateQueries({ queryKey: ['churn-predictions'] });

      toast.success(`Analyzed ${data.analyzed} customer${data.analyzed !== 1 ? 's' : ''}`, {
        description: 'Risk scores have been updated',
      });
    },
    onError: (error: Error) => {
      toast.error('Risk calculation failed', {
        description: error.message,
      });
    },
  });
}

/**
 * Calculate risk scores for all accounts (background job)
 */
export function useCalculateAllRiskScores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('calculate-customer-risk', {
        body: { calculateAll: true },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Risk calculation failed');

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['risk-scores'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });

      toast.success(`Analyzed ${data.analyzed} customers`, {
        description: 'All risk scores have been updated',
      });
    },
    onError: (error: Error) => {
      toast.error('Bulk risk calculation failed', {
        description: error.message,
      });
    },
  });
}

// =============================================================================
// Query Hooks: Risk Scores
// =============================================================================

/**
 * Get risk score for a specific account
 */
export function useAccountRiskScore(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ['risk-scores', accountId],
    queryFn: async (): Promise<CustomerRiskScore | null> => {
      if (!accountId) return null;

      const { data, error } = await supabase
        .from('customer_risk_scores')
        .select('*')
        .eq('account_id', accountId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No rows
        throw new Error(`Failed to fetch risk score: ${error.message}`);
      }

      return data as CustomerRiskScore;
    },
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get all customer risk scores with optional filters
 */
export function useCustomerRiskScores(filters?: {
  riskLevel?: ChurnRiskLevel;
  minChurnProbability?: number;
}) {
  return useQuery({
    queryKey: ['risk-scores', filters],
    queryFn: async () => {
      let query = supabase
        .from('customer_risk_scores')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('churn_probability', { ascending: false });

      if (filters?.riskLevel) {
        query = query.eq('churn_risk_level', filters.riskLevel);
      }

      if (filters?.minChurnProbability !== undefined) {
        query = query.gte('churn_probability', filters.minChurnProbability);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CustomerRiskScore[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get at-risk customers (churn probability >= threshold)
 * Uses the get_at_risk_customers RPC function
 */
export function useAtRiskCustomers(riskThreshold: number = 60, limit: number = 100) {
  return useQuery({
    queryKey: ['at-risk-customers', riskThreshold, limit],
    queryFn: async (): Promise<AtRiskCustomer[]> => {
      const { data, error } = await supabase.rpc('get_at_risk_customers', {
        p_risk_threshold: riskThreshold,
        p_limit: limit,
      });

      if (error) {
        // Fallback to direct query if RPC fails
        console.error('RPC failed, using fallback query:', error);

        const { data: fallbackData, error: fallbackError } = await supabase
          .from('churn_predictions')
          .select('*')
          .gte('churn_probability', riskThreshold)
          .order('churn_probability', { ascending: false })
          .limit(limit);

        if (fallbackError) throw new Error(`Failed to fetch at-risk customers: ${fallbackError.message}`);
        return fallbackData as AtRiskCustomer[];
      }

      return data as AtRiskCustomer[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get all churn predictions from materialized view
 */
export function useChurnPredictions() {
  return useQuery({
    queryKey: ['churn-predictions'],
    queryFn: async (): Promise<AtRiskCustomer[]> => {
      const { data, error } = await supabase
        .from('churn_predictions')
        .select('*')
        .order('churn_probability', { ascending: false });

      if (error) throw new Error(`Failed to fetch churn predictions: ${error.message}`);

      return data as AtRiskCustomer[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Query Hooks: Retention Interventions
// =============================================================================

/**
 * Get retention interventions for an account
 */
export function useRetentionInterventions(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ['retention-interventions', accountId],
    queryFn: async (): Promise<RetentionIntervention[]> => {
      if (!accountId) return [];

      const { data, error } = await supabase
        .from('retention_interventions')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch interventions: ${error.message}`);

      return data as RetentionIntervention[];
    },
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Get pending retention interventions (for staff dashboard)
 */
export function usePendingInterventions(assignedToUserId?: string) {
  return useQuery({
    queryKey: ['pending-interventions', assignedToUserId],
    queryFn: async (): Promise<RetentionIntervention[]> => {
      let query = supabase
        .from('retention_interventions')
        .select('*')
        .in('status', ['recommended', 'scheduled'])
        .order('priority', { ascending: false })
        .order('scheduled_for', { ascending: true });

      if (assignedToUserId) {
        query = query.eq('assigned_to', assignedToUserId);
      }

      const { data, error } = await query;

      if (error) throw new Error(`Failed to fetch pending interventions: ${error.message}`);

      return data as RetentionIntervention[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Get dashboard summary statistics
 */
export function useRiskDashboardStats() {
  return useQuery({
    queryKey: ['risk-dashboard-stats'],
    queryFn: async () => {
      const { data: scores, error} = await supabase
        .from('customer_risk_scores')
        .select('*')
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;

      const total = scores?.length || 0;
      const critical = scores?.filter((s: any) => s.churn_risk_level === 'critical').length || 0;
      const high = scores?.filter((s: any) => s.churn_risk_level === 'high').length || 0;
      const medium = scores?.filter((s: any) => s.churn_risk_level === 'medium').length || 0;
      const low = scores?.filter((s: any) => s.churn_risk_level === 'low').length || 0;

      const totalLTV = scores?.reduce((sum: number, s: any) => sum + (s.predicted_lifetime_value || 0), 0) || 0;
      const ltvAtRisk = scores
        ?.filter((s: any) => s.churn_probability >= 50)
        .reduce((sum: number, s: any) => sum + (s.predicted_lifetime_value || 0), 0) || 0;

      const avgChurnProbability = total > 0
        ? scores.reduce((sum: number, s: any) => sum + s.churn_probability, 0) / total
        : 0;

      return {
        total,
        critical,
        high,
        medium,
        low,
        totalLTV,
        ltvAtRisk,
        avgChurnProbability,
        percentAtRisk: total > 0 ? ((critical + high) / total) * 100 : 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Mutation Hooks: Retention Interventions
// =============================================================================

/**
 * Create a retention intervention
 */
export function useCreateIntervention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (intervention: Partial<RetentionIntervention>) => {
      const { data, error } = await supabase
        .from('retention_interventions')
        .insert(intervention)
        .select()
        .single();

      if (error) throw error;
      return data as RetentionIntervention;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['retention-interventions', data.account_id] });
      queryClient.invalidateQueries({ queryKey: ['pending-interventions'] });

      toast.success('Intervention created', {
        description: 'Retention action has been scheduled',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to create intervention', {
        description: error.message,
      });
    },
  });
}

/**
 * Update intervention status
 */
export function useUpdateInterventionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      interventionId,
      status,
      outcome,
      outcomeNotes,
      customerRetained,
    }: {
      interventionId: string;
      status: 'scheduled' | 'completed' | 'dismissed';
      outcome?: InterventionOutcome;
      outcomeNotes?: string;
      customerRetained?: boolean;
    }) => {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        if (outcome) updateData.outcome = outcome;
        if (outcomeNotes) updateData.outcome_notes = outcomeNotes;
        if (customerRetained !== undefined) updateData.customer_retained = customerRetained;
      }

      const { data, error } = await supabase
        .from('retention_interventions')
        .update(updateData)
        .eq('id', interventionId)
        .select()
        .single();

      if (error) throw error;
      return data as RetentionIntervention;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['retention-interventions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-interventions'] });

      toast.success('Intervention updated', {
        description: `Status changed to ${data.status}`,
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update intervention', {
        description: error.message,
      });
    },
  });
}

/**
 * Refresh churn predictions materialized view
 */
export function useRefreshChurnPredictions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_churn_predictions');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['churn-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });
      toast.success('Churn predictions refreshed');
    },
    onError: (error: any) => {
      console.error('Error refreshing predictions:', error);
      toast.error('Failed to refresh predictions');
    },
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get risk level color class
 */
export function getRiskLevelColor(level: ChurnRiskLevel): string {
  switch (level) {
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    case 'high':
      return 'text-orange-600 dark:text-orange-400';
    case 'medium':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'low':
      return 'text-green-600 dark:text-green-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}

/**
 * Get risk level badge variant
 */
export function getRiskLevelBadge(level: ChurnRiskLevel): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (level) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'destructive';
    case 'medium':
      return 'secondary';
    case 'low':
      return 'outline';
    default:
      return 'outline';
  }
}

/**
 * Get LTV trend icon
 */
export function getLtvTrendIcon(trend: LtvTrend): string {
  switch (trend) {
    case 'increasing':
      return '📈';
    case 'declining':
      return '📉';
    case 'stable':
      return '➡️';
    default:
      return '';
  }
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get priority color
 */
export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'text-red-600 dark:text-red-400';
    case 'high':
      return 'text-orange-600 dark:text-orange-400';
    case 'medium':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'low':
      return 'text-blue-600 dark:text-blue-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}
