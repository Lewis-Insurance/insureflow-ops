import { useState, useCallback, useEffect } from 'react';
import { MessageSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConversationSidebar } from './ConversationSidebar';
import { MessageThread } from './MessageThread';
import { MessageInput } from './MessageInput';
import { NewConversationDialog } from './NewConversationDialog';
import {
  useConversations,
  useEditMessage,
  usePresence,
  Conversation,
  Message,
} from '@/hooks/useTeamMessaging';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useMessengerOptional } from '@/contexts/MessengerContext';

interface FloatingMessengerProps {
  className?: string;
}

export function FloatingMessenger({ className }: FloatingMessengerProps) {
  const { user, profile } = useAuth();
  const messengerContext = useMessengerOptional();

  // Use context state if available, otherwise fall back to local state
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  // Use context if available, otherwise use local state
  const isOpen = messengerContext?.isOpen ?? localIsOpen;
  const setIsOpen = messengerContext?.setIsOpen ?? setLocalIsOpen;

  const { data: conversations, refetch: refetchConversations } = useConversations();
  const editMessage = useEditMessage();
  const queryClient = useQueryClient();

  // Get agency workspace ID from profile
  const agencyWorkspaceId = profile?.default_agency_workspace_id || null;

  // Track presence when messenger is open
  usePresence(isOpen ? agencyWorkspaceId : null);

  // Sync selected conversation with context for focus detection
  useEffect(() => {
    if (messengerContext) {
      messengerContext.setActiveViewingConversationId(selectedConversation?.id || null);
    }
  }, [selectedConversation?.id, messengerContext]);

  // Handle external navigation to a conversation (from toast notification)
  useEffect(() => {
    if (
      messengerContext?.selectedConversationId &&
      conversations &&
      messengerContext.selectedConversationId !== selectedConversation?.id
    ) {
      const targetConversation = conversations.find(
        (c) => c.id === messengerContext.selectedConversationId
      );
      if (targetConversation) {
        setSelectedConversation(targetConversation);
        setReplyTo(null);
        setEditingMessage(null);
        // Clear the context's selectedConversationId after navigating
        messengerContext.setSelectedConversationId(null);
      }
    }
  }, [messengerContext?.selectedConversationId, conversations, selectedConversation?.id, messengerContext]);

  // Calculate total unread count
  const totalUnread = conversations?.reduce((sum, conv) => sum + (conv.unread_count || 0), 0) || 0;

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    setReplyTo(null);
    setEditingMessage(null);
  }, []);

  const handleNewConversation = useCallback(() => {
    setShowNewConversation(true);
  }, []);

  const handleConversationCreated = useCallback(
    async (conversationId: string) => {
      // Refetch conversations to get the new one
      const result = await refetchConversations();
      const newConvo = result.data?.find((c) => c.id === conversationId);
      if (newConvo) {
        setSelectedConversation(newConvo);
      }
    },
    [refetchConversations]
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

  const handleBack = useCallback(() => {
    setSelectedConversation(null);
    setReplyTo(null);
    setEditingMessage(null);
  }, []);

  // Don't render if user is not authenticated
  if (!user) return null;

  return (
    <>
      {/* Floating Button */}
      <div className={cn('fixed bottom-6 right-6 z-50', className)}>
        {!isOpen && (
          <Button
            size="lg"
            className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
            onClick={() => setIsOpen(true)}
          >
            <MessageSquare className="h-6 w-6" />
            {totalUnread > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-6 min-w-6 px-1.5 text-xs"
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Messenger Panel */}
      {isOpen && (
        <div
          className={cn(
            'fixed z-50 bg-background border rounded-lg shadow-2xl flex flex-col transition-all duration-200',
            isExpanded
              ? 'bottom-4 right-4 left-4 top-20 md:left-auto md:w-[800px] md:h-[600px]'
              : 'bottom-6 right-6 w-[380px] h-[500px]'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              {selectedConversation && !isExpanded && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </Button>
              )}
              <h3 className="font-semibold">
                {selectedConversation
                  ? getConversationTitle(selectedConversation, user?.id || '')
                  : 'Messages'}
              </h3>
              {totalUnread > 0 && !selectedConversation && (
                <Badge variant="secondary" className="text-xs">
                  {totalUnread} unread
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setIsOpen(false);
                  setSelectedConversation(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden">
            {isExpanded ? (
              // Expanded view: sidebar + thread
              <>
                <div className="w-72 shrink-0 border-r">
                  <ConversationSidebar
                    selectedId={selectedConversation?.id || null}
                    onSelect={handleSelectConversation}
                    onNewConversation={handleNewConversation}
                  />
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  <MessageThread
                    conversation={selectedConversation}
                    onReply={handleReply}
                    onEdit={handleEdit}
                  />
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
              </>
            ) : (
              // Compact view: list OR thread
              <div className="flex-1 flex flex-col min-w-0">
                {selectedConversation ? (
                  <>
                    <MessageThread
                      conversation={selectedConversation}
                      onReply={handleReply}
                      onEdit={handleEdit}
                    />
                    <MessageInput
                      conversationId={selectedConversation?.id || null}
                      agencyWorkspaceId={agencyWorkspaceId}
                      replyTo={replyTo}
                      editingMessage={editingMessage}
                      onCancelReply={() => setReplyTo(null)}
                      onCancelEdit={() => setEditingMessage(null)}
                      onEditComplete={handleEditComplete}
                    />
                  </>
                ) : (
                  <ConversationSidebar
                    selectedId={null}
                    onSelect={handleSelectConversation}
                    onNewConversation={handleNewConversation}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Conversation Dialog */}
      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        agencyWorkspaceId={agencyWorkspaceId}
        onConversationCreated={handleConversationCreated}
      />
    </>
  );
}

// Helper to get conversation title
function getConversationTitle(conversation: Conversation, currentUserId: string): string {
  if (conversation.type === 'direct') {
    const otherParticipant = conversation.participants?.find(
      (p) => p.user_id !== currentUserId
    );
    return otherParticipant?.profile?.full_name || otherParticipant?.profile?.email || 'Direct Message';
  }
  if (conversation.type === 'account_thread') {
    return conversation.name || 'Account Thread';
  }
  return conversation.name || 'Group Chat';
}
