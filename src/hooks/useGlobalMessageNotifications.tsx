import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useMessengerOptional } from '@/contexts/MessengerContext';
import { MessageNotificationToast, MessageNotificationData } from '@/components/messaging/MessageNotificationToast';
import { logger } from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface ConversationParticipantData {
  conversation_id: string;
  muted: boolean;
  notifications_enabled: boolean;
  conversation: {
    id: string;
    type: 'direct' | 'group' | 'account_thread';
    name: string | null;
  };
}

interface MessagePayload {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  created_at: string;
}

/**
 * Global message notification hook
 * Listens for new messages across ALL conversations the user is a participant of
 * and shows toast notifications for messages from other users.
 */
export function useGlobalMessageNotifications() {
  const { user } = useAuth();
  const { toast, dismiss } = useToast();
  const queryClient = useQueryClient();
  const messengerContext = useMessengerOptional();

  // Store conversation data for filtering
  const conversationDataRef = useRef<Map<string, ConversationParticipantData>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Debounce tracking for rapid messages
  const lastNotificationTimeRef = useRef<Map<string, number>>(new Map());
  const NOTIFICATION_DEBOUNCE_MS = 2000; // 2 seconds debounce per conversation

  // Fetch user's conversation participant data (with mute/notification preferences)
  const fetchConversationData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Use the RPC function to get participant data with conversation info
      const { data: participants, error } = await supabase
        .rpc('get_conversation_participants_for_user', { p_user_id: user.id });

      if (error) {
        logger.error('[GlobalMessageNotifications] Error fetching conversations:', error);
        return;
      }

      // Get conversation details for the participant records
      if (participants && participants.length > 0) {
        const conversationIds = [...new Set(participants.map((p: { conversation_id: string }) => p.conversation_id))];

        const { data: conversations, error: convError } = await supabase
          .from('team_conversations')
          .select('id, type, name')
          .in('id', conversationIds);

        if (convError) {
          logger.error('[GlobalMessageNotifications] Error fetching conversation details:', convError);
          return;
        }

        // Build lookup map
        const convMap = new Map(conversations?.map(c => [c.id, c]) || []);
        const participantMap = new Map<string, ConversationParticipantData>();

        participants.forEach((p: {
          conversation_id: string;
          muted: boolean;
          notifications_enabled: boolean;
        }) => {
          const conv = convMap.get(p.conversation_id);
          if (conv) {
            participantMap.set(p.conversation_id, {
              conversation_id: p.conversation_id,
              muted: p.muted || false,
              notifications_enabled: p.notifications_enabled !== false, // default true
              conversation: conv as { id: string; type: 'direct' | 'group' | 'account_thread'; name: string | null },
            });
          }
        });

        conversationDataRef.current = participantMap;
        logger.debug('[GlobalMessageNotifications] Loaded conversation data for', participantMap.size, 'conversations');
      }
    } catch (error) {
      logger.error('[GlobalMessageNotifications] Failed to fetch conversation data:', error);
    }
  }, [user?.id]);

  // Fetch sender profile
  const fetchSenderProfile = useCallback(async (senderId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', senderId)
      .single();
    return data;
  }, []);

  // Get display name for conversation
  const getConversationDisplayName = useCallback(
    async (conversationData: ConversationParticipantData, senderId: string) => {
      if (conversationData.conversation.type === 'direct') {
        // For direct messages, don't show conversation name (redundant with sender name)
        return undefined;
      }
      return conversationData.conversation.name || 'Group Chat';
    },
    []
  );

  // Show notification for a new message
  const showMessageNotification = useCallback(
    async (message: MessagePayload) => {
      if (!user?.id) return;

      // Skip own messages
      if (message.sender_id === user.id) return;

      // Check if this conversation is in user's list
      const conversationData = conversationDataRef.current.get(message.conversation_id);
      if (!conversationData) {
        // User is not a participant, or data not loaded yet
        return;
      }

      // Check if conversation is muted
      if (conversationData.muted) {
        logger.debug('[GlobalMessageNotifications] Skipping muted conversation:', message.conversation_id);
        return;
      }

      // Check notification preference
      if (!conversationData.notifications_enabled) {
        logger.debug('[GlobalMessageNotifications] Notifications disabled for:', message.conversation_id);
        return;
      }

      // Check if user is currently viewing this conversation (focus detection)
      if (
        messengerContext?.isOpen &&
        messengerContext?.activeViewingConversationId === message.conversation_id
      ) {
        logger.debug('[GlobalMessageNotifications] User is viewing this conversation, skipping notification');
        // Still invalidate queries to update the UI
        queryClient.invalidateQueries({ queryKey: ['team-messages', message.conversation_id] });
        return;
      }

      // Debounce check - avoid flooding with notifications from same conversation
      const lastTime = lastNotificationTimeRef.current.get(message.conversation_id);
      const now = Date.now();
      if (lastTime && now - lastTime < NOTIFICATION_DEBOUNCE_MS) {
        logger.debug('[GlobalMessageNotifications] Debouncing notification for:', message.conversation_id);
        // Still invalidate queries
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
        return;
      }
      lastNotificationTimeRef.current.set(message.conversation_id, now);

      // Fetch sender profile
      const senderProfile = await fetchSenderProfile(message.sender_id);
      const senderName = senderProfile?.full_name || senderProfile?.email || 'Someone';
      const senderAvatarUrl = senderProfile?.avatar_url;

      // Get conversation display name
      const conversationName = await getConversationDisplayName(conversationData, message.sender_id);

      // Create notification data
      const notificationData: MessageNotificationData = {
        messageId: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        senderName,
        senderAvatarUrl,
        content: message.content,
        conversationName,
        conversationType: conversationData.conversation.type,
      };

      // Show toast notification
      const { dismiss: dismissToast } = toast({
        duration: 5000,
        description: (
          <MessageNotificationToast
            senderName={notificationData.senderName}
            senderAvatarUrl={notificationData.senderAvatarUrl}
            messagePreview={notificationData.content}
            conversationName={notificationData.conversationName}
            onViewClick={() => {
              dismissToast();
              messengerContext?.openConversation(notificationData.conversationId);
            }}
          />
        ),
      });

      // Invalidate queries to update unread counts
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
    },
    [user?.id, toast, dismiss, queryClient, messengerContext, fetchSenderProfile, getConversationDisplayName]
  );

  // Set up real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    // Load conversation data first
    fetchConversationData();

    // Subscribe to all team_messages INSERT events
    const channel = supabase
      .channel('global-message-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'team_messages',
        },
        (payload) => {
          const message = payload.new as MessagePayload;
          showMessageNotification(message);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.debug('[GlobalMessageNotifications] Subscribed to message notifications');
        } else if (status === 'CHANNEL_ERROR') {
          logger.error('[GlobalMessageNotifications] Channel subscription error');
        }
      });

    channelRef.current = channel;

    // Also refresh conversation data when conversations query is invalidated
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.query.queryKey[0] === 'team-conversations'
      ) {
        fetchConversationData();
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      unsubscribe();
    };
  }, [user?.id, fetchConversationData, showMessageNotification, queryClient]);

  // Return nothing - this hook just sets up subscriptions
  return null;
}
