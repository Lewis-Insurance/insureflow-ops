import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AtRiskRenewal {
  id: string;
  account_id: string;
  policy_id: string;
  policy_number: string;
  carrier: string;
  policy_type: string;
  current_premium: number;
  renewal_premium: number;
  renewal_date: string;
  expiration_date?: string;
  status: string;
  assigned_to: string;
  risk_score?: number;
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
  risk_calculated_at?: string;
  last_risk_calculation?: string;
  last_contact_date?: string;
  days_since_last_contact?: number;
  contact_count?: number;
  engagement_score?: number;
  sentiment_score?: number;
  customer_satisfaction_score?: number;
  price_increase_pct?: number;
  price_change_pct?: number;
  has_recent_claim?: boolean;
  has_payment_issues?: boolean;
  competitor_activity_detected?: boolean;
  risk_factors?: Record<string, boolean>;
  campaign_type?: string;
  completed_touchpoints?: number;
  total_touchpoints?: number;
}

export interface RenewalIntelligenceSummary {
  total_renewals: number;
  renewals_next_30_days: number;
  critical_risk: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  avg_risk_score: number;
  active_campaigns: number;
}

// Fetch at-risk renewals
export const useAtRiskRenewals = () => {
  return useQuery({
    queryKey: ['at-risk-renewals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewals')
        .select('*')
        .not('risk_score', 'is', null)
        .gte('risk_score', 50)
        .in('status', ['upcoming', 'in_progress'])
        .order('risk_score', { ascending: false });

      if (error) throw error;
      return (data || []) as AtRiskRenewal[];
    },
  });
};

// Get renewal intelligence summary
export const useRenewalIntelligenceSummary = () => {
  return useQuery({
    queryKey: ['renewal-intelligence-summary'],
    queryFn: async () => {
      // Fetch all upcoming/in-progress renewals
      const { data: renewals, error } = await supabase
        .from('renewals')
        .select('risk_level, risk_score, renewal_date')
        .in('status', ['upcoming', 'in_progress']);

      if (error) throw error;

      const allRenewals = (renewals || [])[];
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Count renewals in next 30 days
      const renewalsNext30Days = allRenewals.filter(r => {
        if (!r.renewal_date) return false;
        const renewalDate = new Date(r.renewal_date);
        return renewalDate >= now && renewalDate <= thirtyDaysFromNow;
      }).length;

      // Count active campaigns
      const { data: campaigns } = await supabase
        .from('renewal_campaigns')
        .select('id', { count: 'exact' })
        .eq('status', 'active');

      const summary: RenewalIntelligenceSummary = {
        total_renewals: allRenewals.length,
        renewals_next_30_days: renewalsNext30Days,
        critical_risk: allRenewals.filter(r => r.risk_level === 'critical').length,
        high_risk: allRenewals.filter(r => r.risk_level === 'high').length,
        medium_risk: allRenewals.filter(r => r.risk_level === 'medium').length,
        low_risk: allRenewals.filter(r => r.risk_level === 'low').length,
        avg_risk_score: allRenewals.length > 0
          ? Math.round(allRenewals.reduce((sum: number, r: any) => sum + (r.risk_score || 0), 0) / allRenewals.length)
          : 0,
        active_campaigns: campaigns?.length || 0,
      };

      return summary;
    },
  });
};

// Bulk calculate risk scores
export const useBulkCalculateRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('calculate-renewal-risk', {
        body: { bulk: true },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Risk scores recalculated for all renewals');
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-intelligence-summary'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to recalculate risks: ${error.message}`);
    },
  });
};

// Calculate risk for single renewal
export const useCalculateRenewalRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (renewalId: string) => {
      const { data, error } = await supabase.functions.invoke('calculate-renewal-risk', {
        body: { renewal_id: renewalId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Risk score calculated');
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['at-risk-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-intelligence-summary'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to calculate risk: ${error.message}`);
    },
  });
};
