import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AORenewal, AORenewalTerm } from "./useAORenewals";
import { logger } from '@/lib/logger';

export interface CarrierBreakdown {
  carrier: string;
  count: number;
  premium: number;
  avgPremium: number;
  percentOfMoved: number;
}

export interface TermBreakdown {
  term: AORenewalTerm;
  count: number;
  premium: number;
  percentOfMoved: number;
}

export interface AORenewalAnalytics {
  // Core KPIs
  premiumLost: number;
  policiesLost: number;
  premiumRetained: number;
  policiesRetained: number;
  retentionRate: number;

  // Breakdown by status
  lostCount: number;
  lostPremium: number;
  cancelledCount: number;
  cancelledPremium: number;
  movedCount: number;
  movedPremium: number;
  renewedCount: number;
  renewedPremium: number;

  // Carrier breakdown
  byCarrier: CarrierBreakdown[];

  // Term breakdown
  byTerm: TermBreakdown[];

  // Time-based metrics (current month)
  movedThisMonth: number;
  movedThisMonthPremium: number;

  // Total at-risk premium (pending + contacted + quoted)
  atRiskPremium: number;
  atRiskCount: number;
}

export interface DateRange {
  from?: Date;
  to?: Date;
}

/**
 * Hook to fetch AO Renewal analytics and KPI data.
 *
 * @param dateRange - Optional date range filter for the analytics
 */
export function useAORenewalAnalytics(dateRange?: DateRange) {
  return useQuery({
    queryKey: ["ao-renewal-analytics", dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async (): Promise<AORenewalAnalytics> => {
      // Build query
      let query = supabase
        .from("ao_renewals")
        .select("*");

      // Apply date range filter if provided
      if (dateRange?.from) {
        query = query.gte("renewal_date", dateRange.from.toISOString().split("T")[0]);
      }
      if (dateRange?.to) {
        query = query.lte("renewal_date", dateRange.to.toISOString().split("T")[0]);
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Error fetching AO renewal analytics:", error);
        throw error;
      }

      const renewals = (data || []) as AORenewal[];
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      // Initialize analytics
      const analytics: AORenewalAnalytics = {
        premiumLost: 0,
        policiesLost: 0,
        premiumRetained: 0,
        policiesRetained: 0,
        retentionRate: 0,
        lostCount: 0,
        lostPremium: 0,
        cancelledCount: 0,
        cancelledPremium: 0,
        movedCount: 0,
        movedPremium: 0,
        renewedCount: 0,
        renewedPremium: 0,
        byCarrier: [],
        byTerm: [],
        movedThisMonth: 0,
        movedThisMonthPremium: 0,
        atRiskPremium: 0,
        atRiskCount: 0,
      };

      // Carrier aggregation map
      const carrierMap = new Map<string, { count: number; premium: number }>();
      const termMap = new Map<AORenewalTerm, { count: number; premium: number }>();

      // Process each renewal
      renewals.forEach((renewal) => {
        const premium = renewal.current_premium || 0;
        const movedPremium = renewal.moved_premium || 0;

        switch (renewal.status) {
          case "lost":
            analytics.lostCount++;
            analytics.lostPremium += premium;
            break;

          case "cancelled":
            analytics.cancelledCount++;
            analytics.cancelledPremium += premium;
            break;

          case "moved":
            analytics.movedCount++;
            analytics.movedPremium += movedPremium;

            // Track by carrier
            if (renewal.moved_carrier) {
              const existing = carrierMap.get(renewal.moved_carrier) || { count: 0, premium: 0 };
              existing.count++;
              existing.premium += movedPremium;
              carrierMap.set(renewal.moved_carrier, existing);
            }

            // Track by term
            if (renewal.moved_term) {
              const existing = termMap.get(renewal.moved_term) || { count: 0, premium: 0 };
              existing.count++;
              existing.premium += movedPremium;
              termMap.set(renewal.moved_term, existing);
            }

            // Check if moved this month
            const updatedDate = new Date(renewal.updated_at);
            if (updatedDate.getMonth() === currentMonth && updatedDate.getFullYear() === currentYear) {
              analytics.movedThisMonth++;
              analytics.movedThisMonthPremium += movedPremium;
            }
            break;

          case "renewed":
            analytics.renewedCount++;
            analytics.renewedPremium += premium;
            break;

          case "pending":
          case "contacted":
          case "quoted":
            analytics.atRiskCount++;
            analytics.atRiskPremium += premium;
            break;
        }
      });

      // Calculate total lost (lost + cancelled)
      analytics.premiumLost = analytics.lostPremium + analytics.cancelledPremium;
      analytics.policiesLost = analytics.lostCount + analytics.cancelledCount;

      // Retained is the moved premium
      analytics.premiumRetained = analytics.movedPremium;
      analytics.policiesRetained = analytics.movedCount;

      // Calculate retention rate
      // Retention rate = moved premium / (lost + cancelled + moved) * 100
      const totalAtRiskClosed = analytics.premiumLost + analytics.premiumRetained;
      analytics.retentionRate = totalAtRiskClosed > 0
        ? (analytics.premiumRetained / totalAtRiskClosed) * 100
        : 0;

      // Build carrier breakdown
      const totalMovedCount = analytics.movedCount || 1; // Avoid division by zero
      analytics.byCarrier = Array.from(carrierMap.entries())
        .map(([carrier, data]) => ({
          carrier,
          count: data.count,
          premium: data.premium,
          avgPremium: data.count > 0 ? data.premium / data.count : 0,
          percentOfMoved: (data.count / totalMovedCount) * 100,
        }))
        .sort((a, b) => b.premium - a.premium);

      // Build term breakdown
      analytics.byTerm = Array.from(termMap.entries())
        .map(([term, data]) => ({
          term,
          count: data.count,
          premium: data.premium,
          percentOfMoved: (data.count / totalMovedCount) * 100,
        }))
        .sort((a, b) => b.premium - a.premium);

      return analytics;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Hook to fetch just the summary KPI cards data (lighter weight).
 */
export function useAORenewalKPIs() {
  return useQuery({
    queryKey: ["ao-renewal-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ao_renewals")
        .select("status, current_premium, moved_premium, moved_carrier");

      if (error) {
        logger.error("Error fetching AO renewal KPIs:", error);
        throw error;
      }

      const renewals = data || [];

      let lostPremium = 0;
      let cancelledPremium = 0;
      let movedPremium = 0;
      let lostCount = 0;
      let cancelledCount = 0;
      let movedCount = 0;

      renewals.forEach((renewal) => {
        const premium = renewal.current_premium || 0;

        switch (renewal.status) {
          case "lost":
            lostCount++;
            lostPremium += premium;
            break;
          case "cancelled":
            cancelledCount++;
            cancelledPremium += premium;
            break;
          case "moved":
            movedCount++;
            movedPremium += renewal.moved_premium || 0;
            break;
        }
      });

      const premiumLost = lostPremium + cancelledPremium;
      const policiesLost = lostCount + cancelledCount;
      const totalClosed = premiumLost + movedPremium;
      const retentionRate = totalClosed > 0 ? (movedPremium / totalClosed) * 100 : 0;

      return {
        premiumLost,
        policiesLost,
        premiumRetained: movedPremium,
        policiesRetained: movedCount,
        retentionRate,
      };
    },
    staleTime: 60 * 1000,
  });
}
