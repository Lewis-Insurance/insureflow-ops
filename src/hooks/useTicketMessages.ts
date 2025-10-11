import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const PAGE_SIZE = 50;

interface PageData {
  data: any[];
  nextFrom: number | null;
}

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
  profiles?: { full_name: string };
}

export function useTicketMessages(ticketId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery<PageData>({
    queryKey: ['ticket-messages', ticketId],
    enabled: !!ticketId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextFrom,
    queryFn: async ({ pageParam = 0 }) => {
      if (!ticketId) return { data: [], nextFrom: null };
      const from = pageParam as number;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from('ticket_messages')
        .select(`
          *,
          profiles!ticket_messages_author_id_fkey(full_name)
        `, { count: 'exact' })
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })
        .range(from, to);
      if (error) throw error;
      const nextFrom = to + 1 < (count ?? 0) ? to + 1 : null;
      return { data: data as any[], nextFrom };
    },
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
    onError: (error: any) =>
      toast({ 
        title: 'Failed to add message', 
        description: error.message, 
        variant: 'destructive' 
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['ticket-messages', ticketId] }),
  });

  return {
    messages: query.data?.pages.flatMap((p) => p.data) ?? [],
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    addMessage: addMessage.mutateAsync,
  };
}
