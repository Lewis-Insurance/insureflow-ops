import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  points: number;
  details: string;
}

interface RenewalWithRisk {
  id: string;
  account_id: string;
  policy_id: string | null;
  policy_number: string | null;
  carrier: string | null;
  policy_type: string;
  current_premium: number | null;
  renewal_premium: number | null;
  renewal_date: string;
  expiration_date: string;
  status: string;
  priority: string | null;
  assigned_to: string | null;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical' | null;
  risk_factors: RiskFactor[];
  last_risk_calculation: string | null;
  last_contact_date: string | null;
  contact_count: number;
  engagement_score: number;
  price_change_pct: number | null;
  has_recent_claim: boolean;
  has_payment_issues: boolean;
  competitor_activity_detected: boolean;
  sentiment_score: number;
  notes: string | null;
  account: {
    id: string;
    name: string;
  };
  assigned: {
    id: string;
    full_name: string;
  } | null;
}

interface RenewalRiskHistory {
  id: string;
  renewal_id: string;
  risk_score: number;
  risk_level: string;
  risk_factors: RiskFactor[];
  calculated_at: string;
}

interface RenewalCampaign {
  id: string;
  renewal_id: string;
  account_id: string;
  campaign_type: string;
  days_before_renewal: number;
  start_date: string;
  end_date: string | null;
  touchpoints: any[];
  completed_touchpoints: number;
  total_touchpoints: number;
  personalization: any;
  status: string;
  renewal_result: string | null;
  created_at: string;
}

// Hook to get all renewals with risk scores
export function useRenewalsWithRisk() {
  return useQuery({
    queryKey: ['renewals-with-risk'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewals')
        .select(`
          *,
          account:accounts!renewals_account_id_fkey(id, name),
          assigned:profiles!renewals_assigned_to_fkey(id, full_name)
        `)
        .order('renewal_date', { ascending: true });

      if (error) throw error;
      return data as unknown as RenewalWithRisk[];
    }
  });
}

// Hook to get high-risk renewals
export function useHighRiskRenewals() {
  return useQuery({
    queryKey: ['high-risk-renewals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewals')
        .select(`
          *,
          account:accounts!renewals_account_id_fkey(id, name),
          assigned:profiles!renewals_assigned_to_fkey(id, full_name)
        `)
        .in('risk_level', ['high', 'critical'])
        .in('status', ['upcoming', 'in_progress'])
        .order('risk_score', { ascending: false });

      if (error) throw error;
      return data as unknown as RenewalWithRisk[];
    }
  });
}

// Hook to get upcoming renewals (next 90 days)
export function useUpcomingRenewals(days: number = 90) {
  return useQuery({
    queryKey: ['upcoming-renewals', days],
    queryFn: async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const { data, error } = await supabase
        .from('renewals')
        .select(`
          *,
          account:accounts!renewals_account_id_fkey(id, name),
          assigned:profiles!renewals_assigned_to_fkey(id, full_name)
        `)
        .in('status', ['upcoming', 'in_progress'])
        .lte('renewal_date', futureDate.toISOString().split('T')[0])
        .order('renewal_date', { ascending: true });

      if (error) throw error;
      return data as unknown as RenewalWithRisk[];
    }
  });
}

// Hook to get risk history for a renewal
export function useRenewalRiskHistory(renewalId: string) {
  return useQuery({
    queryKey: ['renewal-risk-history', renewalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_risk_history')
        .select('*')
        .eq('renewal_id', renewalId)
        .order('calculated_at', { ascending: false });

      if (error) throw error;
      return data as unknown as RenewalRiskHistory[];
    },
    enabled: !!renewalId
  });
}

// Hook to get campaigns for a renewal
export function useRenewalCampaigns(renewalId: string) {
  return useQuery({
    queryKey: ['renewal-campaigns', renewalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .select('*')
        .eq('renewal_id', renewalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RenewalCampaign[];
    },
    enabled: !!renewalId
  });
}

// Hook to get all active campaigns
export function useActiveRenewalCampaigns() {
  return useQuery({
    queryKey: ['active-renewal-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_campaigns')
        .select(`
          *,
          renewal:renewals!renewal_campaigns_renewal_id_fkey(
            id,
            renewal_date,
            policy_type,
            account:accounts!renewals_account_id_fkey(id, name)
          )
        `)
        .eq('status', 'active')
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data;
    }
  });
}

// Mutation to calculate risk for a single renewal
export function useCalculateRenewalRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (renewalId: string) => {
      const { data, error } = await supabase.functions.invoke('calculate-renewal-risk', {
        body: { renewal_id: renewalId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewals-with-risk'] });
      queryClient.invalidateQueries({ queryKey: ['high-risk-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-renewals'] });
    }
  });
}

// Mutation to batch calculate risk for all upcoming renewals
export function useBatchCalculateRenewalRisk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (daysAhead: number = 120) => {
      const { data, error } = await supabase.functions.invoke('renewal-risk-batch', {
        body: { days_ahead: daysAhead }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewals-with-risk'] });
      queryClient.invalidateQueries({ queryKey: ['high-risk-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-renewals'] });
    }
  });
}

// Hook to get renewal risk analytics
export function useRenewalRiskAnalytics() {
  return useQuery({
    queryKey: ['renewal-risk-analytics'],
    queryFn: async () => {
      const { data: renewals, error } = await supabase
        .from('renewals')
        .select('risk_level, risk_score, status, renewal_premium')
        .in('status', ['upcoming', 'in_progress']);

      if (error) throw error;

      // Calculate analytics
      const total = renewals.length;
      const critical = renewals.filter(r => r.risk_level === 'critical').length;
      const high = renewals.filter(r => r.risk_level === 'high').length;
      const medium = renewals.filter(r => r.risk_level === 'medium').length;
      const low = renewals.filter(r => r.risk_level === 'low' || !r.risk_level).length;

      const atRiskPremium = renewals
        .filter(r => r.risk_level === 'high' || r.risk_level === 'critical')
        .reduce((sum, r) => sum + (r.renewal_premium || 0), 0);

      const avgRiskScore = renewals.length > 0
        ? renewals.reduce((sum, r) => sum + (r.risk_score || 0), 0) / renewals.length
        : 0;

      return {
        total,
        by_level: {
          critical,
          high,
          medium,
          low
        },
        at_risk_count: critical + high,
        at_risk_premium: atRiskPremium,
        avg_risk_score: Math.round(avgRiskScore)
      };
    }
  });
}
