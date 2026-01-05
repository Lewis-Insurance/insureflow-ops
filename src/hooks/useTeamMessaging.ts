import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Types
export interface Conversation {
  id: string;
  agency_workspace_id: string;
  type: 'direct' | 'group' | 'account_thread';
  name: string | null;
  description: string | null;
  account_id: string | null;
  created_by: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  participants?: ConversationParticipant[];
  last_message?: Message | null;
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  last_read_at: string | null;
  muted: boolean;
  notifications_enabled: boolean;
  // Joined profile data
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'file' | 'system' | 'link';
  reply_to_id: string | null;
  metadata: {
    mentions?: string[];
    file_url?: string;
    file_name?: string;
    linked_entity_type?: string;
    linked_entity_id?: string;
  };
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  // Joined data
  sender?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
  reply_to?: Message | null;
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface UserPresence {
  user_id: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  last_seen_at: string;
  custom_status: string | null;
}

// Hook to get user's conversations
export function useConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['team-conversations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Use SECURITY DEFINER function to get ALL participants for user's conversations
      // This bypasses RLS which would only return the user's own participant records
      const { data: allParticipants, error: partError } = await supabase
        .rpc('get_conversation_participants_for_user', { p_user_id: user.id });

      if (partError) {
        logger.error('[useConversations] Error fetching participants:', partError);
        throw partError;
      }

      if (!allParticipants || allParticipants.length === 0) {
        return [];
      }

      // Get unique conversation IDs
      const conversationIds = [...new Set(allParticipants.map((p: { conversation_id: string }) => p.conversation_id))];

      // Group participants by conversation
      const participantsByConversation = new Map<string, typeof allParticipants>();
      allParticipants.forEach((p: { conversation_id: string }) => {
        const existing = participantsByConversation.get(p.conversation_id) || [];
        existing.push(p);
        participantsByConversation.set(p.conversation_id, existing);
      });

      // Fetch conversations (without nested participant select - we already have them)
      const { data: conversations, error: convError } = await supabase
        .from('team_conversations')
        .select('*')
        .in('id', conversationIds)
        .eq('is_archived', false)
        .order('updated_at', { ascending: false });

      if (convError) {
        logger.error('[useConversations] Error fetching conversations:', convError);
        throw convError;
      }

      if (!conversations || conversations.length === 0) {
        return [];
      }

      // Collect all unique user IDs from participants
      const allUserIds = new Set<string>();
      allParticipants.forEach((p: { user_id: string }) => {
        allUserIds.add(p.user_id);
      });

      // Fetch all profiles in one query
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', Array.from(allUserIds));

      if (profileError) {
        logger.error('[useConversations] Error fetching profiles:', profileError);
        // Don't throw - continue with partial data
      }

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Attach profiles to participants and fetch last message
      const conversationsWithData = await Promise.all(
        conversations.map(async (conv) => {
          // Get participants for this conversation and attach profiles
          const convParticipants = participantsByConversation.get(conv.id) || [];
          const participantsWithProfiles = convParticipants.map((p: ConversationParticipant) => ({
            ...p,
            profile: profileMap.get(p.user_id) || null,
          }));

          // Fetch last message
          const { data: messages } = await supabase
            .from('team_messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          // Get unread count
          const myParticipation = participantsWithProfiles.find(
            (p: ConversationParticipant) => p.user_id === user.id
          );
          const lastReadAt = myParticipation?.last_read_at;

          let unreadCount = 0;
          if (lastReadAt) {
            const { count } = await supabase
              .from('team_messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conv.id)
              .neq('sender_id', user.id)
              .is('deleted_at', null)
              .gt('created_at', lastReadAt);
            unreadCount = count || 0;
          }

          return {
            ...conv,
            participants: participantsWithProfiles,
            last_message: messages?.[0] || null,
            unread_count: unreadCount,
          };
        })
      );

      return conversationsWithData as Conversation[];
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });
}

// Hook to get messages in a conversation
export function useMessages(conversationId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['team-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      // Fetch messages with reactions (no profile join - FK doesn't exist)
      const { data: messages, error } = await supabase
        .from('team_messages')
        .select(`
          *,
          reactions:team_message_reactions(*)
        `)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('[useMessages] Error fetching messages:', error);
        throw error;
      }

      if (!messages || messages.length === 0) {
        return [];
      }

      // Collect unique sender IDs
      const senderIds = [...new Set(messages.map(m => m.sender_id))];

      // Fetch sender profiles
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', senderIds);

      if (profileError) {
        logger.error('[useMessages] Error fetching profiles:', profileError);
        // Continue with partial data
      }

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Attach sender profiles to messages
      const messagesWithSenders = messages.map(m => ({
        ...m,
        sender: profileMap.get(m.sender_id) || null,
      }));

      return messagesWithSenders as Message[];
    },
    enabled: !!conversationId && !!user?.id,
    staleTime: 10000,
  });
}

// Hook for real-time message subscriptions
export function useMessageSubscription(
  conversationId: string | null,
  onNewMessage: (message: Message) => void
) {
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    const messageChannel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as { id: string; sender_id: string };

          // Fetch the full message with reactions
          const { data: message } = await supabase
            .from('team_messages')
            .select(`
              *,
              reactions:team_message_reactions(*)
            `)
            .eq('id', newMsg.id)
            .single();

          if (!message) return;

          // Fetch sender profile separately
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .eq('id', newMsg.sender_id)
            .single();

          const messageWithSender = {
            ...message,
            sender: senderProfile || null,
          };

          onNewMessage(messageWithSender as Message);
        }
      )
      .subscribe();

    setChannel(messageChannel);

    return () => {
      messageChannel.unsubscribe();
    };
  }, [conversationId, onNewMessage]);

  return channel;
}

// Hook for sending messages
export function useSendMessage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToId,
      metadata,
    }: {
      conversationId: string;
      content: string;
      replyToId?: string;
      metadata?: Message['metadata'];
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('team_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
          reply_to_id: replyToId || null,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) {
        logger.error('[useSendMessage] Error sending message:', error);
        throw error;
      }

      // If there are mentions, create mention records
      if (metadata?.mentions && metadata.mentions.length > 0) {
        await supabase.from('team_message_mentions').insert(
          metadata.mentions.map((userId) => ({
            message_id: data.id,
            mentioned_user_id: userId,
          }))
        );
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to send message',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook for creating conversations
export function useCreateConversation() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      name,
      participantIds,
      accountId,
      agencyWorkspaceId,
    }: {
      type: 'direct' | 'group' | 'account_thread';
      name?: string;
      participantIds: string[];
      accountId?: string;
      agencyWorkspaceId: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // For direct messages, use the helper function
      if (type === 'direct' && participantIds.length === 1) {
        const { data, error } = await supabase.rpc('get_or_create_dm_conversation', {
          p_user_id_1: user.id,
          p_user_id_2: participantIds[0],
          p_agency_workspace_id: agencyWorkspaceId,
        });

        if (error) throw error;
        return { id: data };
      }

      // For group chats and account threads
      const { data: conversation, error: convError } = await supabase
        .from('team_conversations')
        .insert({
          agency_workspace_id: agencyWorkspaceId,
          type,
          name: name || null,
          account_id: accountId || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      // Add creator as owner
      const participants = [
        { conversation_id: conversation.id, user_id: user.id, role: 'owner' },
        ...participantIds.map((userId) => ({
          conversation_id: conversation.id,
          user_id: userId,
          role: 'member',
        })),
      ];

      const { error: partError } = await supabase
        .from('team_conversation_participants')
        .insert(participants);

      if (partError) throw partError;

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      toast({
        title: 'Conversation created',
        description: 'You can now start messaging.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create conversation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook for marking conversation as read
export function useMarkAsRead() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('team_conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
  });
}

// Hook for user presence
export function usePresence(agencyWorkspaceId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Update presence on mount and periodically
  useEffect(() => {
    if (!user?.id || !agencyWorkspaceId) return;

    const updatePresence = async () => {
      await supabase.from('team_user_presence').upsert({
        user_id: user.id,
        agency_workspace_id: agencyWorkspaceId,
        status: 'online',
        last_seen_at: new Date().toISOString(),
      });
    };

    updatePresence();

    // Update every 30 seconds
    const interval = setInterval(updatePresence, 30000);

    // Set offline on unmount
    return () => {
      clearInterval(interval);
      supabase.from('team_user_presence').upsert({
        user_id: user.id,
        agency_workspace_id: agencyWorkspaceId,
        status: 'offline',
        last_seen_at: new Date().toISOString(),
      });
    };
  }, [user?.id, agencyWorkspaceId]);

  // Query presence for all users in workspace
  return useQuery({
    queryKey: ['team-presence', agencyWorkspaceId],
    queryFn: async () => {
      if (!agencyWorkspaceId) return [];

      const { data, error } = await supabase
        .from('team_user_presence')
        .select('*')
        .eq('agency_workspace_id', agencyWorkspaceId);

      if (error) throw error;
      return (data || []) as UserPresence[];
    },
    enabled: !!agencyWorkspaceId,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

// Hook for adding reactions
export function useAddReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase.from('team_message_reactions').insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });

      if (error && error.code !== '23505') {
        // Ignore duplicate key errors
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
    },
  });
}

// Hook for removing reactions
export function useRemoveReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('team_message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
    },
  });
}

// Hook for editing messages
export function useEditMessage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('team_messages')
        .update({
          content,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to edit message',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook for deleting messages (soft delete)
export function useDeleteMessage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('team_messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('sender_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-messages'] });
    },
  });
}

// Hook to get team members for @mentions
export function useTeamMembers(agencyWorkspaceId: string | null) {
  return useQuery({
    queryKey: ['team-members', agencyWorkspaceId],
    queryFn: async () => {
      if (!agencyWorkspaceId) return [];

      // First, get all memberships for the workspace
      const { data: memberships, error: membershipError } = await supabase
        .from('agency_workspace_memberships')
        .select('user_id, role')
        .eq('agency_workspace_id', agencyWorkspaceId)
        .eq('status', 'active');

      if (membershipError) {
        logger.error('[useTeamMembers] Error fetching memberships:', membershipError);
        throw membershipError;
      }

      if (!memberships || memberships.length === 0) {
        return [];
      }

      // Then, get profiles for those users
      const userIds = memberships.map((m) => m.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      if (profileError) {
        logger.error('[useTeamMembers] Error fetching profiles:', profileError);
        throw profileError;
      }

      // Merge memberships with profiles
      return memberships.map((m) => {
        const profile = profiles?.find((p) => p.id === m.user_id);
        return {
          id: m.user_id,
          role: m.role,
          full_name: profile?.full_name || null,
          email: profile?.email || null,
          avatar_url: profile?.avatar_url || null,
        };
      });
    },
    enabled: !!agencyWorkspaceId,
    staleTime: 60000,
  });
}
