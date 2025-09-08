import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Phone, 
  MessageSquare, 
  FileText, 
  User, 
  DollarSign, 
  AlertTriangle,
  Clock,
  CheckCircle,
  Calendar
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { ActivityEvent, CallSession, SMSMessage, Task } from '@/types/crm';

interface ActivityTimelineProps {
  events?: ActivityEvent[];
  calls?: CallSession[];
  messages?: SMSMessage[];
  tasks?: Task[];
}

interface TimelineItem {
  id: string;
  type: 'event' | 'call' | 'sms' | 'task';
  timestamp: string;
  title: string;
  description?: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  status?: string;
  metadata?: any;
}

export function ActivityTimeline({ events = [], calls = [], messages = [], tasks = [] }: ActivityTimelineProps) {
  // Combine all activities into a single timeline
  const timelineItems: TimelineItem[] = [
    // Events
    ...events.map(event => ({
      id: event.id,
      type: 'event' as const,
      timestamp: event.occurred_at,
      title: formatEventTitle(event.type),
      description: event.payload ? JSON.stringify(event.payload) : undefined,
      icon: getEventIcon(event.type),
      iconColor: getEventColor(event.type),
      metadata: event.payload
    })),
    
    // Calls
    ...calls.map(call => ({
      id: call.id,
      type: 'call' as const,
      timestamp: call.started_at,
      title: call.direction === 'inbound' ? 'Inbound Call' : 'Outbound Call',
      description: `${call.from_number} → ${call.to_number}${call.duration_seconds ? ` (${Math.round(call.duration_seconds / 60)}m)` : ''}`,
      icon: Phone,
      iconColor: 'text-blue-500',
      status: call.disposition,
      metadata: call
    })),
    
    // SMS Messages
    ...messages.map(message => ({
      id: message.id,
      type: 'sms' as const,
      timestamp: message.created_at,
      title: message.direction === 'in' ? 'Received SMS' : 'Sent SMS',
      description: message.body,
      icon: MessageSquare,
      iconColor: message.direction === 'in' ? 'text-green-500' : 'text-blue-500',
      status: message.status,
      metadata: message
    })),
    
    // Tasks
    ...tasks.map(task => ({
      id: task.id,
      type: 'task' as const,
      timestamp: task.created_at,
      title: task.title,
      description: task.description,
      icon: getTaskIcon(task.status),
      iconColor: getTaskColor(task.priority),
      status: task.status,
      metadata: task
    }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (timelineItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Activity Yet</h3>
            <p className="text-muted-foreground">
              When interactions occur with this account, they'll appear here.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline</CardTitle>
        <p className="text-sm text-muted-foreground">
          All interactions and events for this account
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timelineItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="relative">
                {/* Timeline line */}
                {index < timelineItems.length - 1 && (
                  <div className="absolute left-4 top-8 w-0.5 h-16 bg-border" />
                )}
                
                <div className="flex items-start space-x-4">
                  {/* Icon */}
                  <div className="flex-shrink-0 w-8 h-8 bg-background border-2 border-border rounded-full flex items-center justify-center">
                    <Icon className={`h-4 w-4 ${item.iconColor}`} />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">{item.title}</h4>
                      <div className="flex items-center space-x-2">
                        {item.status && (
                          <Badge variant="outline" className="text-xs">
                            {item.status}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    
                    {item.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(item.timestamp), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {timelineItems.length >= 20 && (
          <div className="mt-6 text-center">
            <Button variant="outline" size="sm">
              Load More Activity
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatEventTitle(eventType: string): string {
  const eventTitles: Record<string, string> = {
    'account_created': 'Account Created',
    'account_updated': 'Account Updated',
    'contact_created': 'Contact Added',
    'contact_updated': 'Contact Updated',
    'policy_created': 'Policy Added',
    'policy_updated': 'Policy Updated',
    'claim_created': 'Claim Filed',
    'claim_updated': 'Claim Updated',
    'document_uploaded': 'Document Uploaded',
    'signature_completed': 'Document Signed',
    'renewal_notice': 'Renewal Notice Sent',
    'payment_received': 'Payment Received'
  };
  
  return eventTitles[eventType] || eventType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getEventIcon(eventType: string): React.ComponentType<any> {
  const eventIcons: Record<string, React.ComponentType<any>> = {
    'account_created': User,
    'account_updated': User,
    'contact_created': User,
    'contact_updated': User,
    'policy_created': DollarSign,
    'policy_updated': DollarSign,
    'claim_created': AlertTriangle,
    'claim_updated': AlertTriangle,
    'document_uploaded': FileText,
    'signature_completed': CheckCircle,
    'renewal_notice': Calendar,
    'payment_received': DollarSign
  };
  
  return eventIcons[eventType] || FileText;
}

function getEventColor(eventType: string): string {
  const eventColors: Record<string, string> = {
    'account_created': 'text-green-500',
    'account_updated': 'text-blue-500',
    'contact_created': 'text-green-500',
    'contact_updated': 'text-blue-500',
    'policy_created': 'text-green-500',
    'policy_updated': 'text-blue-500',
    'claim_created': 'text-orange-500',
    'claim_updated': 'text-orange-500',
    'document_uploaded': 'text-purple-500',
    'signature_completed': 'text-green-500',
    'renewal_notice': 'text-yellow-500',
    'payment_received': 'text-green-500'
  };
  
  return eventColors[eventType] || 'text-muted-foreground';
}

function getTaskIcon(status: string): React.ComponentType<any> {
  switch (status) {
    case 'completed':
      return CheckCircle;
    case 'in_progress':
      return Clock;
    default:
      return AlertTriangle;
  }
}

function getTaskColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'text-red-500';
    case 'high':
      return 'text-orange-500';
    case 'medium':
      return 'text-yellow-500';
    default:
      return 'text-green-500';
  }
}