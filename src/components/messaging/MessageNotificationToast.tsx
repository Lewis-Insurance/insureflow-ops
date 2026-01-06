import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface MessageNotificationToastProps {
  senderName: string;
  senderAvatarUrl?: string | null;
  messagePreview: string;
  conversationName?: string;
  onViewClick: () => void;
}

export function MessageNotificationToast({
  senderName,
  senderAvatarUrl,
  messagePreview,
  conversationName,
  onViewClick,
}: MessageNotificationToastProps) {
  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Truncate message preview
  const truncatedPreview =
    messagePreview.length > 80 ? messagePreview.slice(0, 80) + '...' : messagePreview;

  return (
    <div className="flex items-start gap-3 w-full">
      <Avatar className="h-10 w-10 shrink-0">
        {senderAvatarUrl ? (
          <AvatarImage src={senderAvatarUrl} alt={senderName} />
        ) : null}
        <AvatarFallback className="bg-primary/10 text-primary text-sm">
          {getInitials(senderName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm truncate">{senderName}</span>
          {conversationName && (
            <span className="text-xs text-muted-foreground truncate">
              in {conversationName}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {truncatedPreview}
        </p>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 mt-1 text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onViewClick();
          }}
        >
          <MessageSquare className="h-3 w-3 mr-1" />
          View Message
        </Button>
      </div>
    </div>
  );
}

// Helper type for message notification data
export interface MessageNotificationData {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string | null;
  content: string;
  conversationName?: string;
  conversationType: 'direct' | 'group' | 'account_thread';
}
