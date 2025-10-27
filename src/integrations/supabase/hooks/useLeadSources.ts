import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../client';
import { toast } from 'sonner';

export interface LeadSource {
  id: string;
  account_id: string;
  name: string;
  type: 'website' | 'social_media' | 'referral' | 'walk_in' | 'phone' | 'event' | 'purchased_list' | 'email' | 'advertising' | 'other';
  description: string | null;
  cost_per_lead: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
  total_leads: number;
  total_conversions: number;
  total_revenue: number;
}

export interface LeadSourceInsert {
  account_id: string;
  name: string;
  type: LeadSource['type'];
  description?: string | null;
  cost_per_lead?: number | null;
  is_active?: boolean;
}

export const useLeadSources = (accountId?: string) => {
  return useQuery({
    queryKey: ['lead-sources', accountId],
    queryFn: async () => {
      let query = supabase
        .from('lead_sources')
        .select('*')
        .order('name');

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as LeadSource[];
    },
  });
};

export const useCreateLeadSource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (source: LeadSourceInsert) => {
      const { data, error } = await supabase
        .from('lead_sources')
        .insert(source)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast.success('Lead source created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create lead source: ${error.message}`);
    },
  });
};

export const useUpdateLeadSource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<LeadSourceInsert>;
    }) => {
      const { data, error } = await supabase
        .from('lead_sources')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast.success('Lead source updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update lead source: ${error.message}`);
    },
  });
};

export const useDeleteLeadSource = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_sources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast.success('Lead source deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete lead source: ${error.message}`);
    },
  });
};
