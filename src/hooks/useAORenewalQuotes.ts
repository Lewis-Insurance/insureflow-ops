import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface AORenewalQuote {
  id: string;
  renewal_id: string;
  carrier: string;
  premium: number;
  term_months: 6 | 12;
  status: 'quoted' | 'denied' | 'selected' | 'expired';
  denial_reason?: string | null;
  document_url?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface CreateQuoteInput {
  renewal_id: string;
  carrier: string;
  premium: number;
  term_months: 6 | 12;
  status?: 'quoted' | 'denied' | 'selected' | 'expired';
  denial_reason?: string;
  document_url?: string;
  notes?: string;
}

export function useAORenewalQuotes(renewalId?: string) {
  return useQuery({
    queryKey: ['ao-renewal-quotes', renewalId],
    queryFn: async () => {
      if (!renewalId) return [];
      
      const { data, error } = await supabase
        .from('ao_renewal_quotes')
        .select('*')
        .eq('renewal_id', renewalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AORenewalQuote[];
    },
    enabled: !!renewalId,
  });
}

export function useCreateAORenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateQuoteInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ao_renewal_quotes')
        .insert({
          ...input,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ao-renewal-quotes', variables.renewal_id] });
      queryClient.invalidateQueries({ queryKey: ['ao-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['ao-quotes-analytics'] });
      toast({
        title: 'Success',
        description: 'Quote added successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to add quote: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateAORenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateQuoteInput> }) => {
      const { data, error } = await supabase
        .from('ao_renewal_quotes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ao-renewal-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['ao-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['ao-quotes-analytics'] });
      toast({
        title: 'Success',
        description: 'Quote updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to update quote: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteAORenewalQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ao_renewal_quotes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ao-renewal-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['ao-renewals'] });
      queryClient.invalidateQueries({ queryKey: ['ao-quotes-analytics'] });
      toast({
        title: 'Success',
        description: 'Quote deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete quote: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
}

export function useQuotesAnalytics() {
  return useQuery({
    queryKey: ['ao-quotes-analytics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ao_quotes_analytics')
        .select('*')
        .order('total_quotes', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useQuotesComparison(renewalId?: string) {
  return useQuery({
    queryKey: ['ao-quotes-comparison', renewalId],
    queryFn: async () => {
      let query = supabase
        .from('ao_quotes_comparison')
        .select('*');

      if (renewalId) {
        query = query.eq('renewal_id', renewalId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
}

export function useDenialAnalysis() {
  return useQuery({
    queryKey: ['ao-quotes-denial-analysis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ao_quotes_denial_analysis')
        .select('*');

      if (error) throw error;
      return data;
    },
  });
}
