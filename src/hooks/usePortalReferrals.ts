// ============================================================================
// PORTAL REFERRALS HOOK
// ============================================================================
// Referrals with RPC-based creation
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  PortalReferral,
  QuoteProductType,
} from '@/types/portal';

export function usePortalReferrals() {
  const queryClient = useQueryClient();

  const referralsQuery = useQuery({
    queryKey: ['portal-referrals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_referrals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PortalReferral[];
    },
  });

  // Create referral via RPC
  const createReferral = useMutation({
    mutationFn: async (params: {
      referee_name: string;
      referee_email?: string | null;
      referee_phone?: string | null;
      referee_relationship?: string | null;
      products_interested?: QuoteProductType[];
      notes?: string | null;
    }) => {
      const { data, error } = await supabase.rpc('create_my_referral', {
        p_referee_name: params.referee_name,
        p_referee_email: params.referee_email ?? null,
        p_referee_phone: params.referee_phone ?? null,
        p_referee_relationship: params.referee_relationship ?? null,
        p_products_interested: params.products_interested ?? [],
        p_notes: params.notes ?? null,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-referrals'] });
    },
  });

  return {
    referrals: referralsQuery.data ?? [],
    isLoading: referralsQuery.isLoading,
    error: referralsQuery.error,
    refetch: referralsQuery.refetch,
    createReferral,
  };
}
