import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AORenewal } from "./useAORenewals";
import { logger } from '@/lib/logger';

export interface MyAORenewalsStats {
  count: number;
  totalPremium: number;
  upcomingWithin7Days: number;
  upcomingWithin30Days: number;
  totalIncludingCompleted?: number; // Total count including completed statuses
}

export interface MyAORenewalsData {
  renewals: AORenewal[];
  stats: MyAORenewalsStats;
}

/**
 * Hook to fetch AO Renewals assigned to the current authenticated user.
 * Returns renewals sorted by renewal_date ascending (nearest first).
 *
 * @param limit - Optional limit on number of renewals to fetch (default: all)
 * @param excludeCompleted - If true, excludes 'renewed', 'lost', 'cancelled', 'moved' statuses (default: false)
 */
export function useMyAORenewals(limit?: number, excludeCompleted: boolean = false) {
  return useQuery({
    queryKey: ["my-ao-renewals", limit, excludeCompleted],
    queryFn: async (): Promise<MyAORenewalsData> => {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return {
          renewals: [],
          stats: {
            count: 0,
            totalPremium: 0,
            upcomingWithin7Days: 0,
            upcomingWithin30Days: 0,
            totalIncludingCompleted: 0,
          },
        };
      }

      // Build query for renewals assigned to current user
      let query = supabase
        .from("ao_renewals")
        .select("*")
        .eq("assigned_to", user.id)
        .order("renewal_date", { ascending: true });

      // Exclude completed statuses if requested
      if (excludeCompleted) {
        query = query.in("status", ["pending", "contacted", "quoted"]);
      }

      // Apply limit if provided
      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error("Error fetching my AO renewals:", error);
        throw error;
      }

      // If excluding completed, also fetch total count to show in stats
      let totalIncludingCompleted = 0;
      if (excludeCompleted) {
        const { count, error: countError } = await supabase
          .from("ao_renewals")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id);

        if (!countError && count !== null) {
          totalIncludingCompleted = count;
        }
      }

      const renewals = (data || []) as AORenewal[];
      const now = new Date();

      // Calculate stats
      const stats: MyAORenewalsStats = {
        count: renewals.length,
        totalPremium: renewals.reduce((sum, r) => sum + (r.current_premium || 0), 0),
        upcomingWithin7Days: 0,
        upcomingWithin30Days: 0,
        totalIncludingCompleted: excludeCompleted ? totalIncludingCompleted : renewals.length,
      };

      // Count upcoming renewals
      renewals.forEach((renewal) => {
        const renewalDate = new Date(renewal.renewal_date);
        const daysUntil = Math.floor(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntil >= 0 && daysUntil <= 7) {
          stats.upcomingWithin7Days++;
        }
        if (daysUntil >= 0 && daysUntil <= 30) {
          stats.upcomingWithin30Days++;
        }
      });

      return { renewals, stats };
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to get just the count and stats for the current user's assigned renewals.
 * More lightweight than useMyAORenewals when you only need stats.
 */
export function useMyAORenewalsCount() {
  return useQuery({
    queryKey: ["my-ao-renewals-count"],
    queryFn: async (): Promise<MyAORenewalsStats> => {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();

      if (authError || !user) {
        return {
          count: 0,
          totalPremium: 0,
          upcomingWithin7Days: 0,
          upcomingWithin30Days: 0,
        };
      }

      // Fetch all renewals assigned to user (we need all to calculate stats)
      const { data, error } = await supabase
        .from("ao_renewals")
        .select("renewal_date, current_premium, status")
        .eq("assigned_to", user.id)
        .in("status", ["pending", "contacted", "quoted"]); // Only active statuses

      if (error) {
        logger.error("Error fetching my AO renewals count:", error);
        throw error;
      }

      const renewals = data || [];
      const now = new Date();

      const stats: MyAORenewalsStats = {
        count: renewals.length,
        totalPremium: renewals.reduce((sum, r) => sum + (r.current_premium || 0), 0),
        upcomingWithin7Days: 0,
        upcomingWithin30Days: 0,
      };

      renewals.forEach((renewal) => {
        const renewalDate = new Date(renewal.renewal_date);
        const daysUntil = Math.floor(
          (renewalDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntil >= 0 && daysUntil <= 7) {
          stats.upcomingWithin7Days++;
        }
        if (daysUntil >= 0 && daysUntil <= 30) {
          stats.upcomingWithin30Days++;
        }
      });

      return stats;
    },
    staleTime: 30 * 1000,
  });
}
