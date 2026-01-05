import { useState, useCallback } from 'react';
import { MessageSquare, Users, Hash, Building2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConversationSidebar } from '@/components/messaging/ConversationSidebar';
import { MessageThread } from '@/components/messaging/MessageThread';
import { MessageInput } from '@/components/messaging/MessageInput';
import { NewConversationDialog } from '@/components/messaging/NewConversationDialog';
import {
  useConversations,
  useEditMessage,
  usePresence,
  Conversation,
  Message,
} from '@/hooks/useTeamMessaging';
import { useAuth } from '@/hooks/useAuth';

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ConversationHeader({
  conversation,
  currentUserId,
}: {
  conversation: Conversation | null;
  currentUserId: string;
}) {
  if (!conversation) {
    return (
      <div className="h-16 border-b flex items-center px-4">
        <p className="text-muted-foreground">Select a conversation</p>
      </div>
    );
  }

  // Get display info based on conversation type
  const getDisplayInfo = () => {
    if (conversation.type === 'direct') {
      const otherParticipant = conversation.participants?.find(
        (p) => p.user_id !== currentUserId
      );
      return {
        name: otherParticipant?.profile?.full_name || otherParticipant?.profile?.email || 'Unknown',
        subtitle: 'Direct Message',
        icon: <MessageSquare className="h-4 w-4" />,
      };
    }
    if (conversation.type === 'account_thread') {
      return {
        name: conversation.name || 'Account Thread',
        subtitle: 'Account Discussion',
        icon: <Building2 className="h-4 w-4" />,
      };
    }
    return {
      name: conversation.name || 'Group Chat',
      subtitle: `${conversation.participants?.length || 0} members`,
      icon: <Hash className="h-4 w-4" />,
    };
  };

  const { name, subtitle, icon } = getDisplayInfo();

  return (
    <div className="h-16 border-b flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback>
            {conversation.type === 'direct' ? getInitials(name) : icon}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-semibold">{name}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      {conversation.type === 'group' && (
        <div className="flex items-center gap-2">
          {/* Show participant avatars */}
          <div className="flex -space-x-2">
            {conversation.participants?.slice(0, 3).map((p) => (
              <Avatar key={p.user_id} className="h-8 w-8 border-2 border-background">
                <AvatarFallback className="text-xs">
                  {getInitials(p.profile?.full_name)}
                </AvatarFallback>
              </Avatar>
            ))}
            {(conversation.participants?.length || 0) > 3 && (
              <div className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                <span className="text-xs font-medium">
                  +{(conversation.participants?.length || 0) - 3}
                </span>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TeamMessagingPage() {
  const { user, profile } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const { data: conversations } = useConversations();
  const editMessage = useEditMessage();

  // Get agency workspace ID from profile
  const agencyWorkspaceId = profile?.default_agency_workspace_id || null;

  // Track presence
  usePresence(agencyWorkspaceId);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    setReplyTo(null);
    setEditingMessage(null);
  }, []);

  const handleNewConversation = useCallback(() => {
    setShowNewConversation(true);
  }, []);

  const handleConversationCreated = useCallback(
    (conversationId: string) => {
      // Find and select the new conversation
      const newConvo = conversations?.find((c) => c.id === conversationId);
      if (newConvo) {
        setSelectedConversation(newConvo);
      }
    },
    [conversations]
  );

  const handleReply = useCallback((message: Message) => {
    setReplyTo(message);
    setEditingMessage(null);
  }, []);

  const handleEdit = useCallback((message: Message) => {
    setEditingMessage(message);
    setReplyTo(null);
  }, []);

  const handleEditComplete = useCallback(
    async (messageId: string, content: string) => {
      await editMessage.mutateAsync({ messageId, content });
      setEditingMessage(null);
    },
    [editMessage]
  );

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <div className="w-80 shrink-0">
          <ConversationSidebar
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <ConversationHeader
            conversation={selectedConversation}
            currentUserId={user?.id || ''}
          />

          {/* Messages */}
          <MessageThread
            conversation={selectedConversation}
            onReply={handleReply}
            onEdit={handleEdit}
          />

          {/* Input */}
          <MessageInput
            conversationId={selectedConversation?.id || null}
            agencyWorkspaceId={agencyWorkspaceId}
            replyTo={replyTo}
            editingMessage={editingMessage}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditingMessage(null)}
            onEditComplete={handleEditComplete}
          />
        </div>
      </div>

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        agencyWorkspaceId={agencyWorkspaceId}
        onConversationCreated={handleConversationCreated}
      />
    </AppLayout>
  );
}
