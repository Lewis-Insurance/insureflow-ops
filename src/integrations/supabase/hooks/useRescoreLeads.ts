import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../client';
import { toast } from 'sonner';

interface RescoreLeadsParams {
  leadIds?: string[];
  rescoreAll?: boolean;
}

export const useRescoreLeads = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadIds, rescoreAll = false }: RescoreLeadsParams) => {
      const { data, error } = await supabase.functions.invoke('lead-scoring-engine', {
        body: {
          leadIds: rescoreAll ? undefined : leadIds,
          rescore_all: rescoreAll,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Successfully scored ${data.scored} lead(s)`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to score leads: ${error.message}`);
    },
  });
};

// Hook to get score explanation
export const getScoreBreakdown = (lead: {
  insurance_types?: string[];
  current_premium?: number | null;
  decision_timeframe?: string | null;
  email?: string | null;
  phone?: string | null;
  current_carrier?: string | null;
  source?: { type?: string } | null;
}) => {
  const breakdown = {
    insuranceNeeds: 0,
    premium: 0,
    timeline: 0,
    contact: 0,
    source: 0,
    carrier: 0,
    total: 0,
  };

  // Insurance Needs (0-25)
  const needs = lead.insurance_types || [];
  if (needs.includes('commercial')) {
    breakdown.insuranceNeeds = 25;
  } else if (needs.length >= 3) {
    breakdown.insuranceNeeds = 20;
  } else if (needs.length === 2) {
    breakdown.insuranceNeeds = 15;
  } else if (needs.length === 1) {
    breakdown.insuranceNeeds = 10;
  }

  // Premium (0-20)
  if (lead.current_premium) {
    if (lead.current_premium >= 5000) {
      breakdown.premium = 20;
    } else if (lead.current_premium >= 2500) {
      breakdown.premium = 15;
    } else if (lead.current_premium >= 1000) {
      breakdown.premium = 10;
    } else {
      breakdown.premium = 5;
    }
  } else {
    breakdown.premium = 8;
  }

  // Timeline (0-20)
  switch (lead.decision_timeframe) {
    case 'immediate':
      breakdown.timeline = 20;
      break;
    case '30_days':
      breakdown.timeline = 15;
      break;
    case '60_days':
      breakdown.timeline = 10;
      break;
    case '90_days':
      breakdown.timeline = 5;
      break;
    case 'no_rush':
      breakdown.timeline = 2;
      break;
    default:
      breakdown.timeline = 8;
  }

  // Contact (0-15)
  if (lead.email && lead.phone) {
    breakdown.contact = 15;
  } else if (lead.email || lead.phone) {
    breakdown.contact = 10;
  }

  // Source (0-10)
  const highQualitySources = ['referral', 'website', 'event'];
  const mediumQualitySources = ['social_media', 'email', 'advertising'];
  const sourceType = lead.source?.type;

  if (sourceType && highQualitySources.includes(sourceType)) {
    breakdown.source = 10;
  } else if (sourceType && mediumQualitySources.includes(sourceType)) {
    breakdown.source = 6;
  } else {
    breakdown.source = 3;
  }

  // Carrier (0-10)
  if (lead.current_carrier) {
    breakdown.carrier = 10;
  } else {
    breakdown.carrier = 5;
  }

  breakdown.total = Object.values(breakdown).reduce((sum, val) => sum + val, 0) - breakdown.total;

  return breakdown;
};
