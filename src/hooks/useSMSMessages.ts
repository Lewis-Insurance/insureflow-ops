import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SMSMessage {
  id: string;
  twilio_message_sid?: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  body: string;
  status?: string;
  error_code?: string;
  campaign_id?: string;
  account_id?: string;
  contact_id?: string;
  created_at: string;
  // Joined data
  account?: {
    id: string;
    name: string;
  };
  contact?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string;
  };
}

export interface SMSConversation {
  phone_number: string;
  account_id?: string;
  contact_id?: string;
  account_name?: string;
  contact_name?: string;
  last_message: SMSMessage;
  unread_count: number;
  message_count: number;
}

export interface SMSFilters {
  direction?: 'inbound' | 'outbound';
  status?: string;
  search?: string;
  account_id?: string;
  contact_id?: string;
  date_from?: string;
  date_to?: string;
}

// Fetch all SMS messages with optional filters
export const useSMSMessages = (filters?: SMSFilters) => {
  return useQuery({
    queryKey: ['sms-messages', filters],
    queryFn: async () => {
      try {
        let query = supabase
          .from('sms_messages')
          .select(`
            *,
            account:accounts(id, name),
            contact:contacts(id, first_name, last_name, phone)
          `)
          .order('created_at', { ascending: false });

        if (filters?.direction) {
          query = query.eq('direction', filters.direction);
        }
        if (filters?.status) {
          query = query.eq('status', filters.status);
        }
        if (filters?.account_id) {
          query = query.eq('account_id', filters.account_id);
        }
        if (filters?.contact_id) {
          query = query.eq('contact_id', filters.contact_id);
        }
        if (filters?.search) {
          query = query.or(`body.ilike.%${filters.search}%,from_number.ilike.%${filters.search}%,to_number.ilike.%${filters.search}%`);
        }
        if (filters?.date_from) {
          query = query.gte('created_at', filters.date_from);
        }
        if (filters?.date_to) {
          query = query.lte('created_at', filters.date_to);
        }

        const { data, error } = await query.limit(500);

        if (error) {
          console.warn('Error fetching SMS messages:', error.message);
          return [] as SMSMessage[];
        }

        return (data || []) as SMSMessage[];
      } catch (err) {
        console.error('Error in SMS messages:', err);
        return [] as SMSMessage[];
      }
    },
  });
};

// Fetch SMS conversations (grouped by phone number)
export const useSMSConversations = () => {
  return useQuery({
    queryKey: ['sms-conversations'],
    queryFn: async () => {
      try {
        // Get all messages and group by phone number
        const { data: messages, error } = await supabase
          .from('sms_messages')
          .select(`
            *,
            account:accounts(id, name),
            contact:contacts(id, first_name, last_name, phone)
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('Error fetching SMS conversations:', error.message);
          return [] as SMSConversation[];
        }

        // Group by phone number (the customer's phone)
        const conversationsMap = new Map<string, SMSConversation>();

        (messages || []).forEach((msg: SMSMessage) => {
          // Determine customer phone (opposite of our number)
          const customerPhone = msg.direction === 'inbound' ? msg.from_number : msg.to_number;
          
          if (!conversationsMap.has(customerPhone)) {
            conversationsMap.set(customerPhone, {
              phone_number: customerPhone,
              account_id: msg.account_id,
              contact_id: msg.contact_id,
              account_name: msg.account?.name,
              contact_name: msg.contact ? `${msg.contact.first_name} ${msg.contact.last_name}` : undefined,
              last_message: msg,
              unread_count: msg.direction === 'inbound' && msg.status === 'received' ? 1 : 0,
              message_count: 1,
            });
          } else {
            const conv = conversationsMap.get(customerPhone)!;
            conv.message_count++;
            if (msg.direction === 'inbound' && msg.status === 'received') {
              conv.unread_count++;
            }
            // Update account/contact if we find one
            if (!conv.account_id && msg.account_id) {
              conv.account_id = msg.account_id;
              conv.account_name = msg.account?.name;
            }
            if (!conv.contact_id && msg.contact_id) {
              conv.contact_id = msg.contact_id;
              conv.contact_name = msg.contact ? `${msg.contact.first_name} ${msg.contact.last_name}` : undefined;
            }
          }
        });

        return Array.from(conversationsMap.values());
      } catch (err) {
        console.error('Error in SMS conversations:', err);
        return [] as SMSConversation[];
      }
    },
  });
};

// Fetch messages for a specific conversation (by phone number)
export const useSMSConversation = (phoneNumber: string | null) => {
  return useQuery({
    queryKey: ['sms-conversation', phoneNumber],
    queryFn: async () => {
      if (!phoneNumber) return [];

      try {
        const { data, error } = await supabase
          .from('sms_messages')
          .select(`
            *,
            account:accounts(id, name),
            contact:contacts(id, first_name, last_name, phone)
          `)
          .or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('Error fetching conversation:', error.message);
          return [] as SMSMessage[];
        }

        return (data || []) as SMSMessage[];
      } catch (err) {
        console.error('Error in conversation:', err);
        return [] as SMSMessage[];
      }
    },
    enabled: !!phoneNumber,
  });
};

// Send SMS message
export const useSendSMS = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      to_number: string;
      body: string;
      account_id?: string;
      contact_id?: string;
    }) => {
      // Call the send-sms edge function
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: payload,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] });
      queryClient.invalidateQueries({ queryKey: ['sms-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['sms-conversation'] });
      toast({
        title: 'SMS Sent',
        description: 'Your message has been sent successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send SMS',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// Link SMS to account/contact
export const useLinkSMSToAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      messageId, 
      accountId, 
      contactId 
    }: { 
      messageId: string; 
      accountId?: string; 
      contactId?: string;
    }) => {
      const { data, error } = await supabase
        .from('sms_messages')
        .update({ 
          account_id: accountId, 
          contact_id: contactId 
        })
        .eq('id', messageId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] });
      queryClient.invalidateQueries({ queryKey: ['sms-conversations'] });
      toast({
        title: 'SMS Linked',
        description: 'Message has been linked to the customer.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to link SMS',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// Bulk link all messages from a phone number to an account/contact
export const useBulkLinkSMS = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      phoneNumber, 
      accountId, 
      contactId 
    }: { 
      phoneNumber: string; 
      accountId?: string; 
      contactId?: string;
    }) => {
      // Update all messages where this phone number appears
      const { data, error } = await supabase
        .from('sms_messages')
        .update({ 
          account_id: accountId, 
          contact_id: contactId 
        })
        .or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sms-messages'] });
      queryClient.invalidateQueries({ queryKey: ['sms-conversations'] });
      toast({
        title: 'Messages Linked',
        description: `${data?.length || 0} messages linked to customer.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to link messages',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// Get SMS stats
export const useSMSStats = () => {
  return useQuery({
    queryKey: ['sms-stats'],
    queryFn: async () => {
      try {
        const { data: messages, error } = await supabase
          .from('sms_messages')
          .select('direction, status, created_at');

        if (error) {
          console.warn('Error fetching SMS stats:', error.message);
          return {
            total: 0,
            inbound: 0,
            outbound: 0,
            delivered: 0,
            failed: 0,
            today: 0,
          };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = {
          total: messages?.length || 0,
          inbound: messages?.filter(m => m.direction === 'inbound').length || 0,
          outbound: messages?.filter(m => m.direction === 'outbound').length || 0,
          delivered: messages?.filter(m => m.status === 'delivered').length || 0,
          failed: messages?.filter(m => m.status === 'failed' || m.status === 'undelivered').length || 0,
          today: messages?.filter(m => new Date(m.created_at) >= today).length || 0,
        };

        return stats;
      } catch (err) {
        console.error('Error in SMS stats:', err);
        return {
          total: 0,
          inbound: 0,
          outbound: 0,
          delivered: 0,
          failed: 0,
          today: 0,
        };
      }
    },
  });
};


