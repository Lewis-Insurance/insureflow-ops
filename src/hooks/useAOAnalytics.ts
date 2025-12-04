import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, startOfMonth, endOfMonth, addDays } from "date-fns";

export interface KPIData {
  totalRenewals: number;
  totalPremium: number;
  upcoming30Days: number;
  avgPremium: number;
  renewalRate: number;
  atRisk: number;
}

export const useAOAnalyticsKPIs = (filters?: { dateFrom?: string; dateTo?: string }) => {
  return useQuery({
    queryKey: ["ao-analytics-kpis", filters],
    queryFn: async () => {
      let query = supabase.from("ao_renewals").select("*");

      if (filters?.dateFrom) {
        query = query.gte("renewal_date", filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte("renewal_date", filters.dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;

      const today = new Date();
      const thirtyDaysFromNow = addDays(today, 30);

      const totalRenewals = data.length;
      const totalPremium = data.reduce((sum, r) => sum + (r.current_premium || 0), 0);
      
      const upcoming30Days = data.filter(r => {
        const renewalDate = new Date(r.renewal_date);
        return renewalDate >= today && renewalDate <= thirtyDaysFromNow;
      }).length;

      const avgPremium = totalRenewals > 0 ? totalPremium / totalRenewals : 0;

      const renewed = data.filter(r => r.status === 'renewed').length;
      const lost = data.filter(r => r.status === 'lost').length;
      const cancelled = data.filter(r => r.status === 'cancelled').length;
      const renewalRate = (renewed + lost + cancelled) > 0 
        ? (renewed / (renewed + lost + cancelled)) * 100 
        : 0;

      const atRisk = data.filter(r => {
        const renewalDate = new Date(r.renewal_date);
        const daysUntil = differenceInDays(renewalDate, today);
        return (r.status === 'pending' || r.status === 'contacted') && daysUntil < 14;
      }).length;

      return {
        totalRenewals,
        totalPremium,
        upcoming30Days,
        avgPremium,
        renewalRate,
        atRisk,
      } as KPIData;
    },
  });
};

export const useAOPipelineData = () => {
  return useQuery({
    queryKey: ["ao-pipeline-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewals_pipeline_summary")
        .select("*");
      
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAOPriorityData = () => {
  return useQuery({
    queryKey: ["ao-priority-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewals_priority_summary")
        .select("*");
      
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAOMonthlyForecast = () => {
  return useQuery({
    queryKey: ["ao-monthly-forecast"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewals_monthly_forecast")
        .select("*")
        .order("month", { ascending: true })
        .limit(12);
      
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAOAtRiskRenewals = () => {
  return useQuery({
    queryKey: ["ao-at-risk-renewals"],
    queryFn: async () => {
      const thirtyDaysFromNow = addDays(new Date(), 30);

      const { data, error } = await supabase
        .from("ao_renewals")
        .select("*")
        .in("status", ["pending", "contacted"])
        .in("priority", ["urgent", "high"])
        .lte("renewal_date", thirtyDaysFromNow.toISOString())
        .order("renewal_date", { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
  });
};

export const useAOTopRenewals = (limit = 20) => {
  return useQuery({
    queryKey: ["ao-top-renewals", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewals")
        .select("*")
        .not("current_premium", "is", null)
        .order("current_premium", { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data || [];
    },
  });
};

export const calculateRiskScore = (renewal: any): number => {
  const today = new Date();
  const renewalDate = new Date(renewal.renewal_date);
  const daysUntil = differenceInDays(renewalDate, today);
  
  const priorityWeights = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };
  
  const priorityWeight = priorityWeights[renewal.priority as keyof typeof priorityWeights] || 1;
  const premium = renewal.current_premium || 0;
  
  let premiumWeight = 0;
  if (premium > 5000) premiumWeight = 10;
  else if (premium > 2500) premiumWeight = 5;
  
  return Math.max(0, (30 - daysUntil) * priorityWeight + premiumWeight);
};
