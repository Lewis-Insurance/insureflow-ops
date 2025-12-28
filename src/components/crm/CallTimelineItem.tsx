import React, { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  Mic,
  Play,
  ExternalLink
} from 'lucide-react';
import { format, formatDuration, intervalToDuration } from 'date-fns';

interface CallSession {
  id: string;
  account_id?: string;
  contact_id?: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  twilio_call_sid?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  disposition?: string;
  consent_played?: boolean;
  recording_url?: string;
  metadata?: unknown;
}

interface CallTimelineItemProps {
  call: CallSession;
  onPlayRecording?: (url: string) => void;
  compact?: boolean;
}

export const CallTimelineItem = memo(function CallTimelineItem({ call, onPlayRecording, compact = false }: CallTimelineItemProps) {
  const getStatusColor = (disposition?: string) => {
    switch (disposition) {
      case 'completed':
      case 'answered':
        return 'default';
      case 'no-answer':
      case 'busy':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (disposition?: string) => {
    switch (disposition) {
      case 'completed':
        return 'Completed';
      case 'answered':
        return 'Answered';
      case 'no-answer':
        return 'No Answer';
      case 'busy':
        return 'Busy';
      case 'failed':
        return 'Failed';
      case 'ringing':
        return 'Ringing';
      case 'in-progress':
        return 'In Progress';
      default:
        return disposition || 'Unknown';
    }
  };

  const formatCallDuration = (seconds?: number) => {
    if (!seconds) return null;
    
    const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
    const parts = [];
    
    if (duration.hours) parts.push(`${duration.hours}h`);
    if (duration.minutes) parts.push(`${duration.minutes}m`);
    if (duration.seconds) parts.push(`${duration.seconds}s`);
    
    return parts.join(' ') || '0s';
  };

  const handlePlayRecording = () => {
    if (call.recording_url && onPlayRecording) {
      onPlayRecording(call.recording_url);
    }
  };

  const handleOpenRecording = () => {
    if (call.recording_url) {
      window.open(call.recording_url, '_blank');
    }
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 border rounded-lg">
        <div className="flex items-center space-x-3">
          {call.direction === 'inbound' ? (
            <PhoneIncoming className="h-4 w-4 text-green-500" />
          ) : (
            <PhoneOutgoing className="h-4 w-4 text-blue-500" />
          )}
          <div>
            <p className="text-sm font-medium">
              {call.direction === 'inbound' ? 'Inbound Call' : 'Outbound Call'}
            </p>
            <p className="text-xs text-muted-foreground">
              {call.from_number} → {call.to_number}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={getStatusColor(call.disposition)}>
            {getStatusLabel(call.disposition)}
          </Badge>
          {call.duration_seconds && (
            <span className="text-xs text-muted-foreground">
              {formatCallDuration(call.duration_seconds)}
            </span>
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
            <div className="flex-shrink-0">
              {call.direction === 'inbound' ? (
                <PhoneIncoming className="h-5 w-5 text-green-500" />
              ) : (
                <PhoneOutgoing className="h-5 w-5 text-blue-500" />
              )}
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium">
                {call.direction === 'inbound' ? 'Inbound Call' : 'Outbound Call'}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                From: {call.from_number}
              </p>
              <p className="text-sm text-muted-foreground">
                To: {call.to_number}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Started: {format(new Date(call.started_at), 'MMM d, yyyy h:mm a')}
              </p>
              {call.ended_at && (
                <p className="text-xs text-muted-foreground">
                  Ended: {format(new Date(call.ended_at), 'MMM d, yyyy h:mm a')}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-end space-y-2">
            <Badge variant={getStatusColor(call.disposition)}>
              {getStatusLabel(call.disposition)}
            </Badge>
            
            {call.duration_seconds && (
              <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatCallDuration(call.duration_seconds)}</span>
              </div>
            )}
            
            {call.consent_played && (
              <Badge variant="outline">
                Consent Played
              </Badge>
            )}
          </div>
        </div>
        
        {call.recording_url && (
          <div className="mt-4 pt-3 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <Mic className="h-4 w-4" />
                <span>Recording Available</span>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePlayRecording}
                >
                  <Play className="h-3 w-3 mr-1" />
                  Play
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenRecording}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
        
        {call.twilio_call_sid && (
          <div className="mt-3 text-xs text-muted-foreground">
            Call ID: {call.twilio_call_sid}
          </div>
        )}
      </CardContent>
    </Card>
  );
});