import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MGA {
  id: string;
  name: string;
  code?: string;
  naic?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  main_phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  agency_login_url?: string;
  billing_portal_url?: string;
  portals?: any;
  default_commission_rate?: number;
  contact_info?: any;
  created_at: string;
  updated_at: string;
}

export function useMGAs() {
  return useQuery({
    queryKey: ['mgas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mgas')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as MGA[];
    }
  });
}

export function useCreateMGA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mga: Omit<MGA, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('mgas')
        .insert([mga])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgas'] });
      toast.success('MGA created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create MGA: ${error.message}`);
    }
  });
}

export function useUpdateMGA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MGA> & { id: string }) => {
      const { data, error } = await supabase
        .from('mgas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgas'] });
      toast.success('MGA updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update MGA: ${error.message}`);
    }
  });
}

export function useDeleteMGA() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('mgas')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mgas'] });
      toast.success('MGA deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete MGA: ${error.message}`);
    }
  });
}
