import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id?: string;
  author_type: 'agent' | 'customer' | 'system' | 'ai';
  message_type: 'comment' | 'email' | 'phone_note' | 'internal_note';
  content: string;
  attachments?: any[];
  metadata?: Record<string, any>;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export function useTicketMessages(ticketId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['ticket-messages', ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      const { data, error } = await supabase
        .from('ticket_messages')
        .select(`
          *,
          profiles!ticket_messages_author_id_fkey(full_name)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!ticketId,
  });

  const addMessage = useMutation({
    mutationFn: async (messageData: any) => {
      const { data, error } = await supabase
        .from('ticket_messages')
        .insert([messageData])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-messages', ticketId] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to add message',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    messages: messages || [],
    isLoading,
    addMessage: addMessage.mutateAsync,
  };
}
