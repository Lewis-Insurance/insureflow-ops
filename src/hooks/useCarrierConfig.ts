// ============================================================================
// CARRIER CONFIG HOOK
// ============================================================================
// Get carrier portal URLs
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CarrierPortalConfig } from '@/types/portal';

export function useCarrierConfig(carrierCode?: string) {
  return useQuery({
    queryKey: ['carrier-config', carrierCode],
    queryFn: async () => {
      let query = supabase
        .from('carrier_portal_configs')
        .select('*')
        .eq('is_active', true);

      if (carrierCode) {
        query = query.eq('carrier_code', carrierCode);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CarrierPortalConfig[];
    },
    enabled: true,
  });
}
