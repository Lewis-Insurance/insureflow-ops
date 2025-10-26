import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '../types';

type LeadSource = Database['public']['Tables']['lead_sources']['Row'];
type LeadSourceInsert = Database['public']['Tables']['lead_sources']['Insert'];
type LeadSourceUpdate = Database['public']['Tables']['lead_sources']['Update'];

// Fetch all lead sources
export const useLeadSources = (includeInactive = false) => {
  return useQuery({
    queryKey: ['lead_sources', includeInactive],
    queryFn: async () => {
      let query = supabase
        .from('lead_sources')
        .select('*')
        .order('name');

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as LeadSource[];
    },
  });
};

// Fetch single lead source
export const useLeadSource = (sourceId: string | undefined) => {
  return useQuery({
    queryKey: ['lead_source', sourceId],
    queryFn: async () => {
      if (!sourceId) return null;

      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (error) throw error;
      return data as LeadSource;
    },
    enabled: !!sourceId,
  });
};

// Create lead source
export const useCreateLeadSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (source: LeadSourceInsert) => {
      const { data, error } = await supabase
        .from('lead_sources')
        .insert(source)
        .select()
        .single();

      if (error) throw error;
      return data as LeadSource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_sources'] });
      toast({
        title: 'Lead source created',
        description: 'New lead source has been added successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating lead source',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// Update lead source
export const useUpdateLeadSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: LeadSourceUpdate }) => {
      const { data, error } = await supabase
        .from('lead_sources')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as LeadSource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_sources'] });
      toast({
        title: 'Lead source updated',
        description: 'Lead source has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating lead source',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// Delete lead source
export const useDeleteLeadSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { error } = await supabase
        .from('lead_sources')
        .delete()
        .eq('id', sourceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_sources'] });
      toast({
        title: 'Lead source deleted',
        description: 'Lead source has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting lead source',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};
