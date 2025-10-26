import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

export function useCalculateLeadScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('calculate-lead-score', {
        body: { leadId },
      });

      if (error) throw error;
      return data as ScoringResult;
    },
    onSuccess: (data) => {
      toast.success(`Lead score updated: ${data.score}/100`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.leadId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to calculate lead score: ${error.message}`);
    },
  });
}

export function useBulkCalculateLeadScores() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadIds: string[]) => {
      const results = await Promise.allSettled(
        leadIds.map(async (leadId) => {
          const { data, error } = await supabase.functions.invoke('calculate-lead-score', {
            body: { leadId },
          });
          if (error) throw error;
          return data as ScoringResult;
        })
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return { successful, failed, total: leadIds.length };
    },
    onSuccess: (data) => {
      toast.success(`Scored ${data.successful}/${data.total} leads successfully`);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to calculate lead scores: ${error.message}`);
    },
  });
}
