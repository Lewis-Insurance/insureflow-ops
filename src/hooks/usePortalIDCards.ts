// ============================================================================
// PORTAL ID CARDS HOOK
// ============================================================================
// ID card access with RPC-based actions
// ============================================================================

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PortalIDCard } from '@/types/portal';

export function usePortalIDCards() {
  const idCardsQuery = useQuery({
    queryKey: ['portal-id-cards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_id_cards')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PortalIDCard[];
    },
  });

  // Get ID card image URL (view action)
  const getIDCardImageUrl = useCallback(async (cardId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('get-id-card-image', {
      body: { cardId, action: 'view' },
    });

    if (error) throw new Error(error.message || 'Failed to get ID card');
    return data.url;
  }, []);

  // Download ID card as PDF
  const downloadIDCard = useCallback(async (cardId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('get-id-card-image', {
      body: { cardId, action: 'download' },
    });

    if (error) throw new Error(error.message || 'Failed to download ID card');
    return data.url;
  }, []);

  // Get Apple Wallet pass URL
  const getAppleWalletPass = useCallback(async (cardId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('generate-apple-pass', {
      body: { cardId },
    });

    if (error) throw new Error(error.message || 'Failed to generate Apple pass');
    return data.passUrl;
  }, []);

  // Get Google Wallet pass URL
  const getGoogleWalletPass = useCallback(async (cardId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('generate-google-pass', {
      body: { cardId },
    });

    if (error) throw new Error(error.message || 'Failed to generate Google pass');
    return data.passUrl;
  }, []);

  return {
    idCards: idCardsQuery.data ?? [],
    isLoading: idCardsQuery.isLoading,
    error: idCardsQuery.error,
    refetch: idCardsQuery.refetch,
    getIDCardImageUrl,
    downloadIDCard,
    getAppleWalletPass,
    getGoogleWalletPass,
  };
}
