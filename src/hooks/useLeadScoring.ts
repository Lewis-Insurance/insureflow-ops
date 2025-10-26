import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ScoringFactors {
  contactInfo: number;
  insuranceNeeds: number;
  premiumPotential: number;
  timeline: number;
  engagement: number;
  source: number;
}

interface ScoringResult {
  success: boolean;
  leadId: string;
  score: number;
  factors: ScoringFactors;
  recommendation: string;
}

/**
 * Hook to manually trigger lead scoring
 */
export function useScoreLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('calculate-lead-score', {
        body: { leadId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads', leadId] });
      toast({
        title: "Lead scored",
        description: `Score: ${data.score}/100`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to score lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to bulk score all leads
 */
export function useBulkScoreLeads() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Fetch all unscored leads
      const { data: leads, error: fetchError } = await supabase
        .from('leads')
        .select('id')
        .is('lead_score', null);

      if (fetchError) throw fetchError;

      // Score each lead
      const results = await Promise.allSettled(
        leads.map((lead) =>
          supabase.functions.invoke('calculate-lead-score', {
            body: { leadId: lead.id },
          })
        )
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return { successful, failed, total: leads.length };
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: "Bulk scoring complete",
        description: `Scored ${results.successful} leads successfully${
          results.failed > 0 ? `, ${results.failed} failed` : ''
        }`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk scoring failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
