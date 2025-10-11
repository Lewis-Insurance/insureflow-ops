import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface COI {
  id: string;
  account_id: string;
  policy_id?: string;
  ticket_id?: string;
  certificate_number: string;
  certificate_holder_name: string;
  certificate_holder_address?: any;
  effective_date: string;
  expiration_date: string;
  coverage_details: any;
  additional_insureds?: any[];
  special_provisions?: string;
  document_url?: string;
  status: string;
  ai_generated?: boolean;
  generated_by?: string;
  approved_by?: string;
  sent_at?: string;
  current_version?: number;
  versions?: any[];
  created_at: string;
  updated_at: string;
}

export function useCOI(ticketId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cois, isLoading } = useQuery({
    queryKey: ['cois', ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      const { data, error } = await supabase
        .from('certificates_of_insurance')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as COI[];
    },
    enabled: !!ticketId,
  });

  const createCOI = useMutation({
    mutationFn: async (coiData: any) => {
      const { data, error } = await supabase
        .from('certificates_of_insurance')
        .insert([coiData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cois', ticketId] });
      toast({ title: 'COI created successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create COI',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCOI = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<COI> }) => {
      const { data, error } = await supabase
        .from('certificates_of_insurance')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cois', ticketId] });
      toast({ title: 'COI updated successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update COI',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    cois: cois || [],
    isLoading,
    createCOI: createCOI.mutateAsync,
    updateCOI: updateCOI.mutateAsync,
  };
}