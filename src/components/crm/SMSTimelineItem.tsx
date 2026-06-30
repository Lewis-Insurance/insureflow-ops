import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  MessageSquare, 
  MessageCircle, 
  Send, 
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface SMSMessage {
  id: string;
  account_id?: string;
  contact_id?: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status?: string;
  twilio_message_sid?: string;
  campaign_id?: string;
  error_code?: string;
  created_at: string;
  metadata?: any;
}

interface SMSTimelineItemProps {
  message: SMSMessage;
  compact?: boolean;
  maskContent?: boolean;
  onRevealContent?: (messageId: string) => void;
}

export function SMSTimelineItem({ 
  message, 
  compact = false, 
  maskContent = false,
  onRevealContent 
}: SMSTimelineItemProps) {
  const [showFullMessage, setShowFullMessage] = useState(false);
  const [contentRevealed, setContentRevealed] = useState(false);

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'delivered':
        return CheckCircle;
      case 'sent':
      case 'queued':
        return Clock;
      case 'failed':
      case 'undelivered':
        return X;
      default:
        return MessageCircle;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'delivered':
        return 'text-success';
      case 'sent':
      case 'queued':
        return 'text-info';
      case 'failed':
      case 'undelivered':
        return 'text-destructive';
      case 'received':
        return 'text-success';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusVariant = (status?: string) => {
    switch (status) {
      case 'delivered':
      case 'received':
        return 'default';
      case 'failed':
      case 'undelivered':
        return 'destructive';
      case 'sent':
      case 'queued':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'delivered':
        return 'Delivered';
      case 'sent':
        return 'Sent';
      case 'queued':
        return 'Queued';
      case 'failed':
        return 'Failed';
      case 'undelivered':
        return 'Undelivered';
      case 'received':
        return 'Received';
      default:
        return status || 'Unknown';
    }
  };

  const isKeywordResponse = (body: string) => {
    const upperBody = body.toUpperCase();
    return /\b(STOP|START|UNSTOP|HELP|INFO)\b/.test(upperBody);
  };

  const handleRevealContent = () => {
    if (onRevealContent) {
      onRevealContent(message.id);
    }
    setContentRevealed(true);
  };

  const shouldMaskContent = maskContent && !contentRevealed;
  const displayContent = shouldMaskContent 
    ? '****** [Click to reveal] ******'
    : message.body;

  const StatusIcon = getStatusIcon(message.status);

  if (compact) {
    return (
      <div className={cn(
        "flex items-start space-x-3 p-3 border rounded-lg",
        message.direction === 'inbound' ? "border-l-4 border-l-success" : "border-l-4 border-l-info"
      )}>
        <div className="flex-shrink-0 mt-1">
          {message.direction === 'inbound' ? (
            <MessageSquare className="h-4 w-4 text-success" />
          ) : (
            <Send className="h-4 w-4 text-info" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {message.direction === 'inbound' ? 'Received SMS' : 'Sent SMS'}
            </p>
            <Badge variant={getStatusVariant(message.status)}>
              {getStatusLabel(message.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {message.from_number} → {message.to_number}
          </p>
          <p 
            className={cn(
              "text-sm mt-1 line-clamp-2",
              shouldMaskContent && "italic text-muted-foreground cursor-pointer"
            )}
            onClick={shouldMaskContent ? handleRevealContent : undefined}
          >
            {displayContent}
          </p>
          {isKeywordResponse(message.body) && (
            <Badge variant="outline">
              Keyword Response
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
              message.direction === 'inbound'
                ? "bg-success/10"
                : "bg-info/10"
            )}>
              {message.direction === 'inbound' ? (
                <MessageSquare className="h-4 w-4 text-success" />
              ) : (
                <Send className="h-4 w-4 text-info" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-medium">
                  {message.direction === 'inbound' ? 'Received SMS' : 'Sent SMS'}
                </h4>
                {isKeywordResponse(message.body) && (
                  <Badge variant="outline">
                    Keyword
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From: {message.from_number} → To: {message.to_number}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(message.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-end space-y-2">
            <div className="flex items-center space-x-1">
              <StatusIcon className={cn("h-4 w-4", getStatusColor(message.status))} />
              <Badge variant={getStatusVariant(message.status)}>
                {getStatusLabel(message.status)}
              </Badge>
            </div>
          </div>
        </div>
        
        <div className="mt-4 pt-3 border-t">
          <div 
            className={cn(
              "text-sm p-3 rounded-lg",
              message.direction === 'inbound'
                ? "bg-muted/50 border-l-2 border-l-success"
                : "bg-primary/5 border-l-2 border-l-info",
              shouldMaskContent && "cursor-pointer hover:bg-muted/70"
            )}
            onClick={shouldMaskContent ? handleRevealContent : undefined}
          >
            {shouldMaskContent && (
              <div className="flex items-center space-x-2 mb-2 text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span className="text-xs">Content masked for privacy - click to reveal</span>
              </div>
            )}
            {displayContent}
          </div>
        </div>
        
        {message.error_code && (
          <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">
              Error: {message.error_code}
            </span>
          </div>
        )}
        
        {(message.twilio_message_sid || message.campaign_id) && (
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            {message.twilio_message_sid && (
              <div>Message ID: {message.twilio_message_sid}</div>
            )}
            {message.campaign_id && (
              <div>Campaign: {message.campaign_id}</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}