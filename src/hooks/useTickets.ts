import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export interface Ticket {
  id: string;
  ticket_number: string;
  account_id: string;
  contact_id?: string;
  assigned_to?: string;
  assignee_id?: string;
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

export interface TicketWithRelations extends Ticket {
  accounts: {
    name: string;
    email: string;
  };
  contacts?: {
    first_name: string;
    last_name: string;
  };
  assigned_profile?: {
    full_name: string;
  };
}

export function useTickets(filters?: { status?: string; priority?: string; assigned_to?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tickets, isLoading, error, refetch } = useQuery({
    queryKey: ['tickets', filters],
    queryFn: async () => {
      let query = supabase
        .from('tickets')
        .select(`
          *,
          accounts!inner(name, email),
          contacts(first_name, last_name),
          assigned_profile:assignee_id(full_name)
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
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Real-time subscription for ticket updates
  useEffect(() => {
    const channel = supabase
      .channel('tickets-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['tickets'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tickets'] });
      
      // Snapshot previous value
      const previousTickets = queryClient.getQueryData(['tickets', filters]);
      
      // Optimistically update
      queryClient.setQueryData(['tickets', filters], (old: TicketWithRelations[] | undefined) => {
        return old?.map(ticket => 
          ticket.id === id ? { ...ticket, ...updates } : ticket
        );
      });
      
      return { previousTickets };
    },
    onError: (err: any, variables, context) => {
      // Rollback on error
      if (context?.previousTickets) {
        queryClient.setQueryData(['tickets', filters], context.previousTickets);
      }
      toast({
        title: 'Failed to update ticket',
        description: err.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const deleteTicket = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tickets'] });
      
      // Snapshot previous value
      const previousTickets = queryClient.getQueryData(['tickets', filters]);
      
      // Optimistically remove from list
      queryClient.setQueryData(['tickets', filters], (old: TicketWithRelations[] | undefined) => {
        return old?.filter(ticket => ticket.id !== id);
      });
      
      return { previousTickets };
    },
    onError: (err: any, variables, context) => {
      // Rollback on error
      if (context?.previousTickets) {
        queryClient.setQueryData(['tickets', filters], context.previousTickets);
      }
      toast({
        title: 'Failed to delete ticket',
        description: err.message,
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      toast({ title: 'Ticket deleted successfully' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  return {
    tickets: tickets || [],
    isLoading,
    error,
    refetch,
    createTicket: createTicket.mutateAsync,
    updateTicket: updateTicket.mutateAsync,
    deleteTicket: deleteTicket.mutateAsync,
    isCreating: createTicket.isPending,
    isUpdating: updateTicket.isPending,
    isDeleting: deleteTicket.isPending,
  };
}
