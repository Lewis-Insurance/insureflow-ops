import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, X, Paperclip, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from '@/components/ui/popover';
import { useSendMessage, useTeamMembers, Message } from '@/hooks/useTeamMessaging';

interface MessageInputProps {
  conversationId: string | null;
  agencyWorkspaceId: string | null;
  replyTo?: Message | null;
  editingMessage?: Message | null;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onEditComplete?: (messageId: string, content: string) => void;
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

export function MessageInput({
  conversationId,
  agencyWorkspaceId,
  replyTo,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  onEditComplete,
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [mentionSearch, setMentionSearch] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useSendMessage();
  const { data: teamMembers } = useTeamMembers(agencyWorkspaceId);

  // Initialize content when editing
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Filter team members for mention suggestions
  const filteredMembers = teamMembers?.filter((member) => {
    if (!mentionSearch) return true;
    const searchLower = mentionSearch.toLowerCase();
    return (
      member.full_name?.toLowerCase().includes(searchLower) ||
      member.email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const handleContentChange = (value: string) => {
    setContent(value);

    // Check for @ mentions
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.slice(lastAtIndex + 1);
      // Only show mentions if @ is at start or after a space, and no space after @
      const charBeforeAt = value[lastAtIndex - 1];
      if ((lastAtIndex === 0 || charBeforeAt === ' ' || charBeforeAt === '\n') && !textAfterAt.includes(' ')) {
        setMentionSearch(textAfterAt);
        setMentionStartIndex(lastAtIndex);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
    setMentionSearch('');
  };

  const handleSelectMention = (member: { id: string; full_name: string | null }) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = content.slice(0, mentionStartIndex);
    const afterMention = content.slice(mentionStartIndex + mentionSearch.length + 1);
    const newContent = `${beforeMention}@${member.full_name || 'user'} ${afterMention}`;

    setContent(newContent);
    setSelectedMentions([...selectedMentions, member.id]);
    setShowMentions(false);
    setMentionSearch('');
    setMentionStartIndex(-1);
    textareaRef.current?.focus();
  };

  const handleSend = async () => {
    if (!content.trim() || !conversationId) return;

    if (editingMessage && onEditComplete) {
      onEditComplete(editingMessage.id, content.trim());
      setContent('');
      return;
    }

    try {
      await sendMessage.mutateAsync({
        conversationId,
        content: content.trim(),
        replyToId: replyTo?.id,
        metadata: selectedMentions.length > 0 ? { mentions: selectedMentions } : undefined,
      });
      setContent('');
      setSelectedMentions([]);
      onCancelReply?.();
    } catch (error) {
      // Error handled by the hook
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Cancel on Escape
    if (e.key === 'Escape') {
      if (showMentions) {
        setShowMentions(false);
      } else if (editingMessage) {
        onCancelEdit?.();
        setContent('');
      } else if (replyTo) {
        onCancelReply?.();
      }
    }
  };

  const isDisabled = !conversationId || sendMessage.isPending;

  return (
    <div className="border-t p-4">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-muted/50 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              Replying to <span className="font-medium">{replyTo.sender?.full_name}</span>
            </p>
            <p className="text-sm truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelReply}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Edit indicator */}
      {editingMessage && (
        <div className="flex items-center gap-2 mb-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
          <div className="flex-1">
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              Editing message
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
            onCancelEdit?.();
            setContent('');
          }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="relative">
        <Popover open={showMentions && filteredMembers.length > 0}>
          <PopoverAnchor asChild>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  placeholder={isDisabled ? 'Select a conversation...' : 'Type a message... (@ to mention)'}
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isDisabled}
                  className="min-h-[80px] resize-none pr-20"
                  rows={3}
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isDisabled}
                    onClick={() => {
                      // Insert @ at cursor position
                      const start = textareaRef.current?.selectionStart || content.length;
                      const newContent = content.slice(0, start) + '@' + content.slice(start);
                      setContent(newContent);
                      setMentionStartIndex(start);
                      setMentionSearch('');
                      setShowMentions(true);
                      textareaRef.current?.focus();
                    }}
                  >
                    <AtSign className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleSend}
                disabled={!content.trim() || isDisabled}
                className="h-auto"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </PopoverAnchor>

          <PopoverContent
            className="w-64 p-0"
            align="start"
            side="top"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Command>
              <CommandList>
                <CommandEmpty>No team members found</CommandEmpty>
                <CommandGroup heading="Team Members">
                  {filteredMembers.slice(0, 5).map((member) => (
                    <CommandItem
                      key={member.id}
                      onSelect={() => handleSelectMention(member)}
                      className="flex items-center gap-2"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {getInitials(member.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.full_name || member.email}
                        </p>
                        {member.full_name && member.email && (
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Enter</kbd> to send,{' '}
        <kbd className="px-1 py-0.5 bg-muted rounded text-xs">Shift+Enter</kbd> for new line
      </p>
    </div>
  );
}
