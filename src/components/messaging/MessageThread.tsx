import { useEffect, useRef, useCallback, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { MoreHorizontal, Reply, Smile, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useMessages,
  useMessageSubscription,
  useMarkAsRead,
  useAddReaction,
  useRemoveReaction,
  useDeleteMessage,
  Message,
  Conversation,
} from '@/hooks/useTeamMessaging';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

interface MessageThreadProps {
  conversation: Conversation | null;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
}

const EMOJI_OPTIONS = ['👍', '❤️', '😄', '😮', '😢', '🎉'];

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatMessageDate(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

function MessageBubble({
  message,
  isOwnMessage,
  showSender,
  onReply,
  onEdit,
  currentUserId,
}: {
  message: Message;
  isOwnMessage: boolean;
  showSender: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  currentUserId: string;
}) {
  const [showActions, setShowActions] = useState(false);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const deleteMessage = useDeleteMessage();

  const handleReaction = (emoji: string) => {
    const existingReaction = message.reactions?.find(
      (r) => r.user_id === currentUserId && r.emoji === emoji
    );

    if (existingReaction) {
      removeReaction.mutate({ messageId: message.id, emoji });
    } else {
      addReaction.mutate({ messageId: message.id, emoji });
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this message?')) {
      deleteMessage.mutate(message.id);
    }
  };

  // Group reactions by emoji
  const reactionCounts = message.reactions?.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div
      className={cn(
        'group flex gap-3 px-4 py-1 hover:bg-muted/30 transition-colors',
        showSender && 'mt-4'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      <div className="w-9 shrink-0">
        {showSender && (
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-xs">
              {getInitials(message.sender?.full_name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        {showSender && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-medium text-sm">
              {message.sender?.full_name || message.sender?.email || 'Unknown'}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
            {message.edited_at && (
              <span className="text-xs text-muted-foreground">(edited)</span>
            )}
          </div>
        )}

        {/* Reply preview */}
        {message.reply_to && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 mb-1 border-l-2 border-primary/50">
            <span className="font-medium">{message.reply_to.sender?.full_name}</span>:{' '}
            {message.reply_to.content.slice(0, 50)}
            {message.reply_to.content.length > 50 && '...'}
          </div>
        )}

        {/* Message text */}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>

        {/* Reactions */}
        {Object.keys(reactionCounts).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(reactionCounts).map(([emoji, count]) => {
              const hasReacted = message.reactions?.some(
                (r) => r.user_id === currentUserId && r.emoji === emoji
              );
              return (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border',
                    hasReacted
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-muted/50 border-transparent hover:border-muted-foreground/20'
                  )}
                >
                  <span>{emoji}</span>
                  <span className="text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className={cn(
          'flex items-start gap-0.5 opacity-0 transition-opacity',
          showActions && 'opacity-100'
        )}
      >
        {/* Emoji picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Smile className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="end">
            <div className="flex gap-1">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="text-lg hover:bg-muted rounded p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Reply */}
        {onReply && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onReply(message)}
          >
            <Reply className="h-4 w-4" />
          </Button>
        )}

        {/* More actions */}
        {isOwnMessage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(message)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

function DateDivider({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-medium text-muted-foreground">
        {formatMessageDate(date)}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-2">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

export function MessageThread({ conversation, onReply, onEdit }: MessageThreadProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: messages, isLoading } = useMessages(conversation?.id || null);
  const markAsRead = useMarkAsRead();

  // Handle new messages from subscription
  const handleNewMessage = useCallback(
    (newMessage: Message) => {
      queryClient.setQueryData<Message[]>(
        ['team-messages', conversation?.id],
        (old) => (old ? [...old, newMessage] : [newMessage])
      );
      // Scroll to bottom on new message
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    },
    [conversation?.id, queryClient]
  );

  // Subscribe to new messages
  useMessageSubscription(conversation?.id || null, handleNewMessage);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messages && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  // Mark as read when viewing
  useEffect(() => {
    if (conversation?.id) {
      markAsRead.mutate(conversation.id);
    }
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="font-medium">Select a conversation</p>
          <p className="text-sm">Choose a conversation from the sidebar to start messaging</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <MessageSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Group messages by date and determine when to show sender
  const messagesWithMeta = messages?.map((msg, idx) => {
    const prevMsg = messages[idx - 1];
    const currentDate = new Date(msg.created_at);
    const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;

    // Show date divider if different day
    const showDateDivider = !prevDate ||
      currentDate.toDateString() !== prevDate.toDateString();

    // Show sender if:
    // - First message of the day
    // - Different sender than previous
    // - More than 5 minutes since last message from same sender
    const showSender = showDateDivider ||
      prevMsg?.sender_id !== msg.sender_id ||
      (currentDate.getTime() - (prevDate?.getTime() || 0)) > 5 * 60 * 1000;

    return { msg, showDateDivider, showSender, date: currentDate };
  }) || [];

  return (
    <ScrollArea className="flex-1" ref={scrollRef}>
      <div className="py-4">
        {messages?.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p className="font-medium">No messages yet</p>
            <p className="text-sm">Start the conversation!</p>
          </div>
        ) : (
          messagesWithMeta.map(({ msg, showDateDivider, showSender, date }) => (
            <div key={msg.id}>
              {showDateDivider && <DateDivider date={date} />}
              <MessageBubble
                message={msg}
                isOwnMessage={msg.sender_id === user?.id}
                showSender={showSender}
                onReply={onReply}
                onEdit={onEdit}
                currentUserId={user?.id || ''}
              />
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
