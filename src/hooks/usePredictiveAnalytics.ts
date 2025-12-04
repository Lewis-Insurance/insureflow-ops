/**
 * Predictive Analytics Hooks
 *
 * React Query hooks for AI-powered customer predictions including:
 * - Churn prediction
 * - Renewal forecasting
 * - Next product recommendations
 * - Retention interventions
 * - Analytics dashboard data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// =============================================================================
// Types
// =============================================================================

export type ChurnRiskLevel = 'very_low' | 'low' | 'medium' | 'high' | 'critical';
export type PriceElasticity = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type PredictionStatus = 'active' | 'expired' | 'archived';

export type InterventionType =
  | 'proactive_call'
  | 'special_offer'
  | 'coverage_review'
  | 'loyalty_program'
  | 'rate_freeze'
  | 'service_upgrade'
  | 'personal_visit'
  | 'customer_appreciation'
  | 'other';

export type InterventionStatus =
  | 'planned'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type CustomerResponse = 'positive' | 'neutral' | 'negative' | 'no_response';

export interface CustomerPrediction {
  id: string;
  account_id: string;
  customer_name: string;
  prediction_date: string;
  prediction_model_version: string;

  // Churn metrics
  churn_probability: number;
  churn_risk_level: ChurnRiskLevel;
  churn_factors: Array<{ factor: string; weight: number }>;

  // Renewal metrics
  renewal_probability: number;
  predicted_renewal_date: string;
  renewal_confidence_score: number;

  // Product prediction
  next_product_prediction: string;
  next_product_probability: number;
  cross_sell_opportunities: Array<{
    product: string;
    probability: number;
    rationale: string;
  }>;

  // Claim prediction
  claim_probability: number;
  predicted_claim_type: string;
  claim_risk_factors: any[];

  // Premium sensitivity
  premium_sensitivity_score: number;
  price_elasticity: PriceElasticity;
  max_acceptable_increase_pct: number;

  // LTV
  predicted_ltv: number;
  ltv_confidence: number;

  // AI insights
  ai_summary: string;
  ai_recommendations: Array<{
    action: string;
    timing: string;
    reason: string;
  }>;

  model_factors: Record<string, any>;
  status: PredictionStatus;
  expires_at: string;
  actions_taken: any[];
  outcome_actual: string | null;
  outcome_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface RetentionIntervention {
  id: string;
  account_id: string;
  prediction_id: string | null;
  intervention_type: InterventionType;
  intervention_title: string;
  intervention_description: string;
  churn_risk_at_intervention: string;
  triggered_by_score: number;
  scheduled_date: string;
  executed_date: string | null;
  assigned_to: string | null;
  offer_type: string | null;
  offer_value: number | null;
  offer_expires_at: string | null;
  status: InterventionStatus;
  customer_response: CustomerResponse | null;
  was_successful: boolean | null;
  success_metrics: any;
  intervention_cost: number | null;
  retained_revenue: number | null;
  roi: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AtRiskCustomer {
  id: string;
  account_id: string;
  customer_name: string;
  churn_probability: number;
  churn_risk_level: ChurnRiskLevel;
  churn_factors: any[];
  renewal_probability: number;
  predicted_renewal_date: string;
  predicted_ltv: number;
  premium_sensitivity_score: number;
  ai_summary: string;
  ai_recommendations: any[];
  prediction_date: string;
  intervention_count: number;
  last_intervention_date: string | null;
  days_until_renewal: number | null;
}

export interface CreatePredictionRequest {
  account_id: string;
  customer_name: string;
  churn_probability: number;
  churn_risk_level: ChurnRiskLevel;
  churn_factors?: any[];
  renewal_probability: number;
  predicted_renewal_date?: string;
  renewal_confidence_score: number;
  next_product_prediction?: string;
  next_product_probability?: number;
  cross_sell_opportunities?: any[];
  claim_probability?: number;
  predicted_claim_type?: string;
  claim_risk_factors?: any[];
  premium_sensitivity_score?: number;
  price_elasticity?: PriceElasticity;
  max_acceptable_increase_pct?: number;
  predicted_ltv?: number;
  ltv_confidence?: number;
  ai_summary?: string;
  ai_recommendations?: any[];
  model_factors?: Record<string, any>;
}

export interface CreateInterventionRequest {
  account_id: string;
  prediction_id?: string;
  intervention_type: InterventionType;
  intervention_title: string;
  intervention_description: string;
  churn_risk_at_intervention?: string;
  triggered_by_score?: number;
  scheduled_date: string;
  assigned_to?: string;
  offer_type?: string;
  offer_value?: number;
  offer_expires_at?: string;
  notes?: string;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all customer predictions with optional filters
 */
export function useCustomerPredictions(filters?: {
  accountId?: string;
  riskLevel?: ChurnRiskLevel;
  minChurnProbability?: number;
  status?: PredictionStatus;
}) {
  return useQuery({
    queryKey: ['customer-predictions', filters],
    queryFn: async () => {
      let query = supabase
        .from('customer_predictions' as any)
        .select('*')
        .order('churn_probability', { ascending: false });

      if (filters?.accountId) {
        query = query.eq('account_id', filters.accountId);
      }

      if (filters?.riskLevel) {
        query = query.eq('churn_risk_level', filters.riskLevel);
      }

      if (filters?.minChurnProbability !== undefined) {
        query = query.gte('churn_probability', filters.minChurnProbability);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      } else {
        query = query.eq('status', 'active'); // Default to active only
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CustomerPrediction[];
    },
  });
}

/**
 * Fetch a single customer prediction by ID
 */
export function useCustomerPrediction(predictionId: string | undefined) {
  return useQuery({
    queryKey: ['customer-prediction', predictionId],
    queryFn: async () => {
      if (!predictionId) return null;

      const { data, error } = await supabase
        .from('customer_predictions' as any)
        .select('*')
        .eq('id', predictionId)
        .single();

      if (error) throw error;
      return data as CustomerPrediction;
    },
    enabled: !!predictionId,
  });
}

/**
 * Fetch at-risk customers (churn probability >= 50%)
 */
export function useAtRiskCustomers() {
  return useQuery({
    queryKey: ['at-risk-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('at_risk_customers_current' as any)
        .select('*')
        .order('churn_probability', { ascending: false });

      if (error) throw error;
      return data as AtRiskCustomer[];
    },
  });
}

/**
 * Fetch retention interventions with optional filters
 */
export function useRetentionInterventions(filters?: {
  accountId?: string;
  predictionId?: string;
  status?: InterventionStatus;
}) {
  return useQuery({
    queryKey: ['retention-interventions', filters],
    queryFn: async () => {
      let query = supabase
        .from('retention_interventions' as any)
        .select('*')
        .order('scheduled_date', { ascending: false });

      if (filters?.accountId) {
        query = query.eq('account_id', filters.accountId);
      }

      if (filters?.predictionId) {
        query = query.eq('prediction_id', filters.predictionId);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as RetentionIntervention[];
    },
  });
}

/**
 * Fetch predictive analytics dashboard metrics
 */
export function usePredictiveAnalyticsDashboard() {
  return useQuery({
    queryKey: ['predictive-analytics-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('predictive_analytics_dashboard' as any)
        .select('*')
        .order('month', { ascending: false })
        .limit(12); // Last 12 months

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Get dashboard summary statistics
 */
export function usePredictionStats() {
  return useQuery({
    queryKey: ['prediction-stats'],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from('customer_predictions' as any)
        .select('*')
        .eq('status', 'active');

      if (error) throw error;

      const total = predictions?.length || 0;
      const critical = predictions?.filter((p: any) => p.churn_probability >= 70).length || 0;
      const high = predictions?.filter((p: any) => p.churn_probability >= 50 && p.churn_probability < 70).length || 0;
      const medium = predictions?.filter((p: any) => p.churn_probability >= 30 && p.churn_probability < 50).length || 0;
      const low = predictions?.filter((p: any) => p.churn_probability < 30).length || 0;

      const totalRevenue = predictions?.reduce((sum: number, p: any) => sum + (p.predicted_ltv || 0), 0) || 0;
      const revenueAtRisk = predictions
        ?.filter((p: any) => p.churn_probability >= 50)
        .reduce((sum: number, p: any) => sum + (p.predicted_ltv || 0), 0) || 0;

      return {
        total,
        critical,
        high,
        medium,
        low,
        totalRevenue,
        revenueAtRisk,
        avgChurnProbability: total > 0
          ? predictions.reduce((sum: number, p: any) => sum + p.churn_probability, 0) / total
          : 0,
      };
    },
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Create a new customer prediction
 */
export function useCreatePrediction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreatePredictionRequest) => {
      const { data, error } = await supabase
        .from('customer_predictions' as any)
        .insert(request)
        .select()
        .single();

      if (error) throw error;
      return data as CustomerPrediction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });
      queryClient.invalidateQueries({ queryKey: ['prediction-stats'] });
      toast.success('Prediction created successfully');
    },
    onError: (error: any) => {
      console.error('Error creating prediction:', error);
      toast.error('Failed to create prediction');
    },
  });
}

/**
 * Update an existing prediction
 */
export function useUpdatePrediction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CustomerPrediction> }) => {
      const { data, error } = await supabase
        .from('customer_predictions' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CustomerPrediction;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['customer-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['customer-prediction', data.id] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });
      queryClient.invalidateQueries({ queryKey: ['prediction-stats'] });
      toast.success('Prediction updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating prediction:', error);
      toast.error('Failed to update prediction');
    },
  });
}

/**
 * Record actual outcome for a prediction
 */
export function useRecordPredictionOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      predictionId,
      outcome,
      outcomeDate,
    }: {
      predictionId: string;
      outcome: string;
      outcomeDate: string;
    }) => {
      const { data, error } = await supabase
        .from('customer_predictions' as any)
        .update({
          outcome_actual: outcome,
          outcome_date: outcomeDate,
          status: 'archived',
        })
        .eq('id', predictionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });
      toast.success('Outcome recorded successfully');
    },
    onError: (error: any) => {
      console.error('Error recording outcome:', error);
      toast.error('Failed to record outcome');
    },
  });
}

/**
 * Create a retention intervention
 */
export function useCreateIntervention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateInterventionRequest) => {
      const { data, error } = await supabase
        .from('retention_interventions' as any)
        .insert(request)
        .select()
        .single();

      if (error) throw error;
      return data as RetentionIntervention;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-interventions'] });
      toast.success('Intervention created successfully');
    },
    onError: (error: any) => {
      console.error('Error creating intervention:', error);
      toast.error('Failed to create intervention');
    },
  });
}

/**
 * Update an intervention
 */
export function useUpdateIntervention() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<RetentionIntervention>;
    }) => {
      const { data, error } = await supabase
        .from('retention_interventions' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as RetentionIntervention;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-interventions'] });
      toast.success('Intervention updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating intervention:', error);
      toast.error('Failed to update intervention');
    },
  });
}

/**
 * Refresh predictive analytics dashboard
 */
export function useRefreshPredictiveAnalytics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('refresh_predictive_analytics_dashboard' as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictive-analytics-dashboard'] });
      toast.success('Analytics refreshed successfully');
    },
    onError: (error: any) => {
      console.error('Error refreshing analytics:', error);
      toast.error('Failed to refresh analytics');
    },
  });
}

/**
 * Expire old predictions
 */
export function useExpireOldPredictions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('expire_old_predictions' as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-predictions'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-customers'] });
      queryClient.invalidateQueries({ queryKey: ['prediction-stats'] });
      toast.success('Old predictions expired');
    },
    onError: (error: any) => {
      console.error('Error expiring predictions:', error);
      toast.error('Failed to expire predictions');
    },
  });
}

/**
 * Calculate intervention ROI
 */
export function useCalculateInterventionROI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (interventionId: string) => {
      const { data, error } = await supabase.rpc('calculate_intervention_roi' as any, {
        p_intervention_id: interventionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['retention-interventions'] });
      toast.success('ROI calculated successfully');
    },
    onError: (error: any) => {
      console.error('Error calculating ROI:', error);
      toast.error('Failed to calculate ROI');
    },
  });
}
