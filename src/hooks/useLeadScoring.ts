import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

interface ScoringResult {
  success: boolean;
  leadId: string;
  score: number;
  factors: {
    contactInfo: number;
    insuranceNeeds: number;
    premiumPotential: number;
    timeline: number;
    engagement: number;
    source: number;
  };
  recommendation: string;
}

/**
 * Hook to manually trigger lead scoring for a single lead
 */
export function useScoreLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string): Promise<ScoringResult> => {
      const { data, error } = await supabase.functions.invoke("calculate-lead-score", {
        body: { leadId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Scoring failed");
      
      return data;
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh lead data
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads", data.leadId] });
      queryClient.invalidateQueries({ queryKey: ["leadMetrics"] });
      
      toast.success(`Lead scored: ${data.score}/100`, {
        description: data.recommendation,
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to score lead", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to bulk score multiple leads or all unscored leads
 */
export function useBulkScoreLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadIds?: string[]) => {
      let leadsToScore: string[];

      if (leadIds && leadIds.length > 0) {
        // Score specific leads
        leadsToScore = leadIds;
      } else {
        // Fetch all unscored leads (or all leads if you want to rescore)
        const { data: leads, error: fetchError } = await supabase
          .from("leads")
          .select("id")
          .or("lead_score.is.null,last_scored_at.is.null"); // Only unscored leads

        if (fetchError) throw fetchError;
        leadsToScore = leads.map((lead) => lead.id);
      }

      if (leadsToScore.length === 0) {
        return { successful: 0, failed: 0, total: 0 };
      }

      // Score leads in batches of 5 to avoid overwhelming the Edge Function
      const batchSize = 5;
      const batches: string[][] = [];
      
      for (let i = 0; i < leadsToScore.length; i += batchSize) {
        batches.push(leadsToScore.slice(i, i + batchSize));
      }

      let successful = 0;
      let failed = 0;

      // Process batches sequentially
      for (const batch of batches) {
        const results = await Promise.allSettled(
          batch.map((leadId) =>
            supabase.functions.invoke("calculate-lead-score", {
              body: { leadId },
            })
          )
        );

        successful += results.filter((r) => r.status === "fulfilled").length;
        failed += results.filter((r) => r.status === "rejected").length;
      }

      return { successful, failed, total: leadsToScore.length };
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leadMetrics"] });
      
      if (results.total === 0) {
        toast.info("No leads to score", {
          description: "All leads have already been scored",
        });
      } else {
        toast.success(`Scored ${results.successful} leads successfully`, {
          description:
            results.failed > 0
              ? `${results.failed} leads failed to score`
              : "All leads scored successfully",
        });
      }
    },
    onError: (error: Error) => {
      toast.error("Bulk scoring failed", {
        description: error.message,
      });
    },
  });
}

/**
 * Hook to automatically score a lead after creation
 * Call this in your lead creation flow
 */
export function useAutoScoreLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string): Promise<ScoringResult> => {
      // Small delay to ensure lead is fully created
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const { data, error } = await supabase.functions.invoke("calculate-lead-score", {
        body: { leadId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Scoring failed");
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads", data.leadId] });
    },
    onError: (error: Error) => {
      // Silent fail for auto-scoring - don't interrupt user flow
      logger.error("Auto-scoring failed:", error);
    },
  });
}
