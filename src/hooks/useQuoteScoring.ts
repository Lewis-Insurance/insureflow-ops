import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface QuoteScoringResult {
  success: boolean;
  id: string;
  score: number;
  price_score: number;
  coverage_completeness_score: number;
  carrier_rating_score: number;
  deductible_score: number;
  value_score: number;
  recommendation: string;
  missing_critical_coverages: string[];
}

/**
 * Hook to manually trigger quote scoring for a single quote
 * Shows toast notifications for user feedback
 */
export function useScoreQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (quoteId: string): Promise<QuoteScoringResult> => {
      const { data, error } = await supabase.functions.invoke("calculate-quote-score", {
        body: { quoteIds: [quoteId] },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Scoring failed");

      return data.scores[0];
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh quote data
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quotes", data.id] });
      queryClient.invalidateQueries({ queryKey: ["ranked-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quote-rankings"] });

      toast.success(`Quote scored: ${data.score}/100`, {
        description: data.recommendation,
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to score quote", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to bulk score multiple quotes by IDs or all quotes for an account
 */
export function useBulkScoreQuotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountId,
      quoteIds,
    }: {
      accountId?: string;
      quoteIds?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke("calculate-quote-score", {
        body: accountId ? { accountId } : { quoteIds },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Scoring failed");

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["ranked-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quote-rankings"] });

      toast.success(`Scored ${data.scored} quotes successfully`, {
        description: "All quotes have been re-evaluated",
      });
    },
    onError: (error: Error) => {
      toast.error("Bulk scoring failed", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to automatically score a quote after creation
 * Silent operation - no toasts, minimal feedback
 * Call this in your quote creation flow
 */
export function useAutoScoreQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (quoteId: string) => {
      // Small delay to ensure quote and coverages are fully created
      await new Promise((resolve) => setTimeout(resolve, 500));

      const { data, error } = await supabase.functions.invoke("calculate-quote-score", {
        body: { quoteIds: [quoteId] },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Scoring failed");

      return data.scores[0];
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quotes", data.id] });
      queryClient.invalidateQueries({ queryKey: ["ranked-quotes"] });
      queryClient.invalidateQueries({ queryKey: ["quote-rankings"] });
    },
    onError: (error: Error) => {
      // Silent fail for auto-scoring - don't interrupt user flow
      console.error("Auto-scoring failed:", error);
    },
  });
}

// ============================================================================
// Ranked Quotes Query Hooks
// ============================================================================

export interface RankedQuote {
  quote_id: string;
  premium: number;
  quote_score: number;
  price_score: number;
  coverage_completeness_score: number;
  carrier_rating_score: number;
  deductible_score: number;
  value_score: number;
  ai_recommendation: string;
  carrier_name: string;
  status: string;
  rank: number;
  total_quotes: number;
  coverage_count: number;
  created_at: string;
}

/**
 * Get ranked quotes for an account (from materialized view or function)
 */
export function useRankedQuotesByAccount(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ["ranked-quotes", accountId],
    queryFn: async (): Promise<RankedQuote[]> => {
      if (!accountId) return [];

      // Try RPC function first
      const { data, error } = await supabase.rpc("get_ranked_quotes_for_account", {
        p_account_id: accountId,
        p_include_unscored: false,
      });

      if (error) {
        console.error("RPC failed, falling back to direct query:", error);

        // Fallback to direct query
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("quotes")
          .select("*")
          .eq("account_id", accountId)
          .not("quote_score", "is", null)
          .order("quote_score", { ascending: false });

        if (fallbackError) throw new Error(`Failed to fetch ranked quotes: ${fallbackError.message}`);

        return fallbackData.map((q, index) => ({
          quote_id: q.id,
          premium: q.premium,
          quote_score: q.quote_score,
          price_score: q.price_score,
          coverage_completeness_score: q.coverage_completeness_score,
          carrier_rating_score: q.carrier_rating_score,
          deductible_score: q.deductible_score,
          value_score: q.value_score,
          ai_recommendation: q.ai_recommendation,
          carrier_name: q.competitor_carrier || "Unknown",
          status: q.status || "pending",
          rank: index + 1,
          total_quotes: fallbackData.length,
          coverage_count: 0,
          created_at: q.created_at,
        }));
      }

      return data || [];
    },
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Get top-ranked quote for an account
 */
export function useTopQuoteForAccount(accountId: string | null | undefined) {
  return useQuery({
    queryKey: ["top-quote", accountId],
    queryFn: async (): Promise<RankedQuote | null> => {
      if (!accountId) return null;

      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("account_id", accountId)
        .not("quote_score", "is", null)
        .order("quote_score", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows
        throw new Error(`Failed to fetch top quote: ${error.message}`);
      }

      return {
        quote_id: data.id,
        premium: data.premium,
        quote_score: data.quote_score,
        price_score: data.price_score,
        coverage_completeness_score: data.coverage_completeness_score,
        carrier_rating_score: data.carrier_rating_score,
        deductible_score: data.deductible_score,
        value_score: data.value_score,
        ai_recommendation: data.ai_recommendation,
        carrier_name: data.competitor_carrier || "Unknown",
        status: data.status || "pending",
        rank: 1,
        total_quotes: 1,
        coverage_count: 0,
        created_at: data.created_at,
      };
    },
    enabled: !!accountId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get score color class based on score value
 */
export function getScoreColorClass(score: number): string {
  if (score >= 85) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-blue-600 dark:text-blue-400";
  if (score >= 55) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

/**
 * Get score badge variant based on score value
 */
export function getScoreBadgeVariant(score: number): "default" | "secondary" | "destructive" {
  if (score >= 70) return "default"; // Green/blue
  if (score >= 55) return "secondary"; // Yellow
  return "destructive"; // Red
}

/**
 * Get rank emoji based on position
 */
export function getRankEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}
