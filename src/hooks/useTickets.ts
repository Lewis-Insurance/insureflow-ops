import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Ticket {
  id: string;
  ticket_number: string;
  account_id: string;
  contact_id?: string;
  assigned_to?: string;
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  source: 'email' | 'phone' | 'manual' | 'web_form' | 'chat';
  subject: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  created_by?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
  resolution?: string;
}

export function useTickets(filters?: { status?: string; priority?: string; assigned_to?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          accounts!inner(name, email),
          contacts(first_name, last_name),
          profiles:assignee_id(full_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status as any);
      }
      if (filters?.priority) {
        query = query.eq('priority', filters.priority as any);
      }
      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const createTicket = useMutation({
    mutationFn: async (ticketData: any) => {
      const { data, error } = await supabase
        .from('tickets')
        .insert([ticketData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: 'Ticket created successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create ticket',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Ticket> }) => {
      const { data, error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: 'Ticket updated successfully' });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update ticket',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    tickets: tickets || [],
    isLoading,
    createTicket: createTicket.mutateAsync,
    updateTicket: updateTicket.mutateAsync,
  };
}
