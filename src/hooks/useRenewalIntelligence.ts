import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  EMPTY_RENEWAL_INTELLIGENCE_SUMMARY,
  fetchAllSupabaseRows,
  mapRenewalIntelligenceSummaryRow,
  type RenewalIntelligenceSummaryRow,
} from '@/lib/renewalIntelligenceSummary';

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

// Fetch at-risk renewals (paginated to exceed PostgREST max_rows)
export const useAtRiskRenewals = () => {
  return useQuery({
    queryKey: ['at-risk-renewals'],
    queryFn: async () => {
      try {
        const rows = await fetchAllSupabaseRows<AtRiskRenewal>(({ from, to }) =>
          supabase
            .from('renewals')
            .select('*')
            .not('risk_score', 'is', null)
            .gte('risk_score', 50)
            .in('status', ['upcoming', 'in_progress'])
            .order('risk_score', { ascending: false })
            .order('id', { ascending: true })
            .range(from, to)
        );
        return rows;
      } catch (err) {
        console.error('Error in at-risk renewals:', err);
        return [] as AtRiskRenewal[];
      }
    },
  });
};

// Get renewal intelligence summary (server-side counts via RPC)
export const useRenewalIntelligenceSummary = () => {
  return useQuery({
    queryKey: ['renewal-intelligence-summary'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc('get_renewal_intelligence_summary');

        if (error) {
          console.warn('Error fetching renewal intelligence summary:', error.message);
          return { ...EMPTY_RENEWAL_INTELLIGENCE_SUMMARY };
        }

        const row = (data?.[0] ?? null) as RenewalIntelligenceSummaryRow | null;
        return mapRenewalIntelligenceSummaryRow(row);
      } catch (err) {
        console.error('Error in renewal intelligence summary:', err);
        return { ...EMPTY_RENEWAL_INTELLIGENCE_SUMMARY };
      }
    },
  });
};

// Bulk calculate risk scores - calls the database function directly
export const useBulkCalculateRisk = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Call the database function that syncs policies, aggregates indicators, and calculates risk
      const { data, error } = await supabase.rpc('refresh_renewal_intelligence', {
        days_ahead: 90 // Sync policies expiring in next 90 days
      });

      if (error) {
        console.error('Error refreshing renewal intelligence:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      const result = data?.[0];
      if (result) {
        toast.success(
          `Refreshed ${result.policies_synced} renewals: ${result.critical_risk} critical, ${result.high_risk} high, ${result.medium_risk} medium, ${result.low_risk} low`
        );
      } else {
        toast.success('Risk scores recalculated for all renewals');
      }
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
      // For single renewal, we can still use the edge function if available
      // or just trigger a full refresh (simpler approach)
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

// Sync policies to renewals table without calculating risk
export const useSyncPoliciesToRenewals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (daysAhead: number = 90) => {
      const { data, error } = await supabase.rpc('sync_policies_to_renewals', {
        days_ahead: daysAhead
      });

      if (error) {
        console.error('Error syncing policies to renewals:', error);
        throw error;
      }

      return data;
    },
    onSuccess: (data) => {
      const result = data?.[0];
      if (result) {
        toast.success(`Synced ${result.synced_count} policies (${result.new_count} new, ${result.updated_count} updated)`);
      }
      queryClient.invalidateQueries({ queryKey: ['renewals'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-intelligence-summary'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to sync policies: ${error.message}`);
    },
  });
};
