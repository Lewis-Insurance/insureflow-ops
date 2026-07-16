import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCarriers() {
  return useQuery({
    queryKey: ['carriers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('id, name')
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch carriers: ${error.message}`);
      }

      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export interface CarrierOption {
  id: string;
  name: string;
  naic: string | null;
}

/**
 * Carriers with their NAIC codes, for the unified Add Policy page's carrier
 * combobox. Picking a saved carrier lets us populate policies.carrier_id and
 * policies.carrier_naic (only a subset of carriers have a NAIC on file).
 */
export function useCarriersWithNaic() {
  return useQuery({
    queryKey: ['carriers', 'with-naic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('id, name, naic')
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch carriers: ${error.message}`);
      }

      return (data || []) as CarrierOption[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useMGAs() {
  return useQuery({
    queryKey: ['mgas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mgas')
        .select('id, name')
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch MGAs: ${error.message}`);
      }

      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useLinesOfBusiness() {
  return useQuery({
    queryKey: ['lines_of_business'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lines_of_business')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch lines of business: ${error.message}`);
      }

      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useBusinessTypes() {
  return useQuery({
    queryKey: ['business_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_types')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) {
        throw new Error(`Failed to fetch business types: ${error.message}`);
      }

      return data || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}