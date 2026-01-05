import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Users, MessageSquare, Building2, Plus, Search, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useConversations, Conversation, ConversationParticipant } from '@/hooks/useTeamMessaging';
import { useAuth } from '@/hooks/useAuth';

interface ConversationSidebarProps {
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ConversationItem({
  conversation,
  isSelected,
  currentUserId,
  onClick,
}: {
  conversation: Conversation;
  isSelected: boolean;
  currentUserId: string;
  onClick: () => void;
}) {
  // Get display name based on conversation type
  const getDisplayName = () => {
    if (conversation.type === 'direct') {
      // For DMs, show the other person's name
      const otherParticipant = conversation.participants?.find(
        (p) => p.user_id !== currentUserId
      );
      return otherParticipant?.profile?.full_name || otherParticipant?.profile?.email || 'Unknown';
    }
    if (conversation.type === 'account_thread') {
      return conversation.name || 'Account Thread';
    }
    return conversation.name || 'Group Chat';
  };

  // Get avatar content
  const getAvatarContent = () => {
    if (conversation.type === 'direct') {
      const otherParticipant = conversation.participants?.find(
        (p) => p.user_id !== currentUserId
      );
      return getInitials(otherParticipant?.profile?.full_name);
    }
    if (conversation.type === 'account_thread') {
      return <Building2 className="h-4 w-4" />;
    }
    return <Hash className="h-4 w-4" />;
  };

  // Get icon based on type
  const getTypeIcon = () => {
    if (conversation.type === 'direct') return <MessageSquare className="h-3 w-3" />;
    if (conversation.type === 'account_thread') return <Building2 className="h-3 w-3" />;
    return <Users className="h-3 w-3" />;
  };

  const displayName = getDisplayName();
  const lastMessage = conversation.last_message;
  const unreadCount = conversation.unread_count || 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-muted/50'
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback
          className={cn(
            'text-xs',
            conversation.type === 'group' && 'bg-blue-100 text-blue-700',
            conversation.type === 'account_thread' && 'bg-green-100 text-green-700'
          )}
        >
          {getAvatarContent()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium truncate">{displayName}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-muted-foreground">{getTypeIcon()}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {conversation.type === 'direct' && 'Direct Message'}
                  {conversation.type === 'group' && 'Group Chat'}
                  {conversation.type === 'account_thread' && 'Account Thread'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {lastMessage && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: false })}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-muted-foreground truncate">
            {lastMessage?.content || 'No messages yet'}
          </p>
          {unreadCount > 0 && (
            <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs shrink-0">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </div>

        {conversation.type === 'group' && conversation.participants && (
          <p className="text-xs text-muted-foreground mt-1">
            {conversation.participants.length} members
          </p>
        )}
      </div>
    </button>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

export function ConversationSidebar({
  selectedId,
  onSelect,
  onNewConversation,
}: ConversationSidebarProps) {
  const { user } = useAuth();
  const { data: conversations, isLoading } = useConversations();
  const [search, setSearch] = useState('');

  // Filter conversations by search
  const filteredConversations = conversations?.filter((conv) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();

    // Search by name
    if (conv.name?.toLowerCase().includes(searchLower)) return true;

    // Search by participant names
    if (conv.participants?.some((p) =>
      p.profile?.full_name?.toLowerCase().includes(searchLower) ||
      p.profile?.email?.toLowerCase().includes(searchLower)
    )) return true;

    return false;
  }) || [];

  // Group conversations by type
  const directMessages = filteredConversations.filter((c) => c.type === 'direct');
  const groupChats = filteredConversations.filter((c) => c.type === 'group');
  const accountThreads = filteredConversations.filter((c) => c.type === 'account_thread');

  return (
    <div className="flex flex-col h-full border-r">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">Messages</h2>
          <Button size="sm" onClick={onNewConversation}>
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No conversations yet</p>
            <p className="text-sm mt-1">Start a new conversation with your team</p>
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {/* Direct Messages */}
            {directMessages.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  Direct Messages
                </h3>
                <div className="space-y-1">
                  {directMessages.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isSelected={selectedId === conv.id}
                      currentUserId={user?.id || ''}
                      onClick={() => onSelect(conv)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Group Chats */}
            {groupChats.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  Channels
                </h3>
                <div className="space-y-1">
                  {groupChats.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isSelected={selectedId === conv.id}
                      currentUserId={user?.id || ''}
                      onClick={() => onSelect(conv)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Account Threads */}
            {accountThreads.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
                  Account Discussions
                </h3>
                <div className="space-y-1">
                  {accountThreads.map((conv) => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isSelected={selectedId === conv.id}
                      currentUserId={user?.id || ''}
                      onClick={() => onSelect(conv)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
