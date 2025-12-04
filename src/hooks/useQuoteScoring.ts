import { useMutation, useQueryClient } from "@tanstack/react-query";
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
