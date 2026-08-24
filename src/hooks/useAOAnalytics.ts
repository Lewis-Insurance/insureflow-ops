import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, addDays } from "date-fns";
import { addDaysLocalDate, todayLocalDate } from "@/lib/date/localDate";

export interface KPIData {
  totalRenewals: number;
  totalPremium: number;
  upcoming30Days: number;
  avgPremium: number;
  renewalRate: number;
  atRisk: number;
}

type AOAnalyticsFilters = { dateFrom?: string; dateTo?: string };

interface RenewalCountCriteria {
  status?: string;
  statuses?: string[];
  renewalDateFrom?: string;
  renewalDateTo?: string;
  renewalDateBefore?: string;
}

async function countRenewals(
  filters?: AOAnalyticsFilters,
  criteria: RenewalCountCriteria = {},
): Promise<number> {
  let query = supabase
    .from("ao_renewals")
    .select("id", { count: "exact", head: true });

  if (filters?.dateFrom) query = query.gte("renewal_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("renewal_date", filters.dateTo);
  if (criteria.status) query = query.eq("status", criteria.status);
  if (criteria.statuses) query = query.in("status", criteria.statuses);
  if (criteria.renewalDateFrom) query = query.gte("renewal_date", criteria.renewalDateFrom);
  if (criteria.renewalDateTo) query = query.lte("renewal_date", criteria.renewalDateTo);
  if (criteria.renewalDateBefore) query = query.lt("renewal_date", criteria.renewalDateBefore);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function sumRenewalPremium(filters?: AOAnalyticsFilters): Promise<number> {
  let query = supabase.from("ao_renewals").select("current_premium.sum()");
  if (filters?.dateFrom) query = query.gte("renewal_date", filters.dateFrom);
  if (filters?.dateTo) query = query.lte("renewal_date", filters.dateTo);

  const { data, error } = await query;
  if (error) throw error;
  const sum = data?.[0]?.sum;
  return sum != null ? Number(sum) : 0;
}

export const useAOAnalyticsKPIs = (filters?: AOAnalyticsFilters) => {
  return useQuery({
    queryKey: ["ao-analytics-kpis", filters],
    queryFn: async () => {
      const today = todayLocalDate();
      const thirtyDaysFromNow = addDaysLocalDate(today, 30);
      const fourteenDaysFromNow = addDaysLocalDate(today, 14);

      const [
        totalRenewals,
        totalPremium,
        upcoming30Days,
        renewed,
        lost,
        cancelled,
        atRisk,
      ] = await Promise.all([
        countRenewals(filters),
        sumRenewalPremium(filters),
        countRenewals(filters, { renewalDateFrom: today, renewalDateTo: thirtyDaysFromNow }),
        countRenewals(filters, { status: "renewed" }),
        countRenewals(filters, { status: "lost" }),
        countRenewals(filters, { status: "cancelled" }),
        countRenewals(filters, {
          statuses: ["pending", "contacted"],
          renewalDateBefore: fourteenDaysFromNow,
        }),
      ]);

      const avgPremium = totalRenewals > 0 ? totalPremium / totalRenewals : 0;
      const renewalRate = (renewed + lost + cancelled) > 0 
        ? (renewed / (renewed + lost + cancelled)) * 100 
        : 0;

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
