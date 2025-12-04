import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLeads } from '@/hooks/useLeads';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowRight,
  User,
  Phone,
  Mail,
  Calendar,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadStatus } from '@/types/leads';

const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; color: string; icon: any }
> = {
  new: { label: 'New', color: 'text-blue-500', icon: AlertCircle },
  contacted: { label: 'Contacted', color: 'text-purple-500', icon: Phone },
  qualified: { label: 'Qualified', color: 'text-indigo-500', icon: CheckCircle },
  quoted: { label: 'Quoted', color: 'text-amber-500', icon: Mail },
  won: { label: 'Won', color: 'text-green-500', icon: TrendingUp },
  lost: { label: 'Lost', color: 'text-red-500', icon: XCircle },
  nurturing: { label: 'Nurturing', color: 'text-teal-500', icon: Clock },
};

interface TimelineEvent {
  id: string;
  leadId: string;
  leadName: string;
  leadEmail?: string;
  leadPhone?: string;
  status: LeadStatus;
  timestamp: string;
  assignedTo?: {
    name: string;
    avatar?: string;
  };
  estimatedPremium?: number;
  insuranceTypes?: string[];
}

export function TimelineView() {
  const { data: leadsResponse, isLoading } = useLeads();
  const allLeads = leadsResponse?.data || [];

  const timelineEvents = useMemo(() => {
    // Create timeline events from leads
    const events: TimelineEvent[] = allLeads.map((lead) => ({
      id: lead.id,
      leadId: lead.id,
      leadName: `${lead.first_name} ${lead.last_name}`,
      leadEmail: lead.email,
      leadPhone: lead.phone,
      status: lead.status as LeadStatus,
      timestamp: lead.updated_at || lead.created_at,
      assignedTo: lead.assigned_to
        ? {
            name: 'Assigned',
            avatar: undefined,
          }
        : undefined,
      estimatedPremium: lead.estimated_premium,
      insuranceTypes: lead.insurance_types || [],
    }));

    // Sort by most recent first
    return events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [allLeads]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, TimelineEvent[]> = {};

    timelineEvents.forEach((event) => {
      const dateKey = format(new Date(event.timestamp), 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    return groups;
  }, [timelineEvents]);

  const sortedDates = Object.keys(groupedByDate).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold">Lead Activity Timeline</h2>
        <p className="text-muted-foreground">
          Chronological view of lead progression through pipeline stages
        </p>
      </div>

      {/* Timeline Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm font-medium">New Leads</p>
                <p className="text-2xl font-bold">
                  {timelineEvents.filter((e) => e.status === 'new').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Contacted</p>
                <p className="text-2xl font-bold">
                  {
                    timelineEvents.filter((e) => e.status === 'contacted')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Quoted</p>
                <p className="text-2xl font-bold">
                  {timelineEvents.filter((e) => e.status === 'quoted').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm font-medium">Won</p>
                <p className="text-2xl font-bold">
                  {timelineEvents.filter((e) => e.status === 'won').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <div className="space-y-8">
        {sortedDates.map((dateKey) => {
          const events = groupedByDate[dateKey];
          const date = new Date(dateKey);

          return (
            <div key={dateKey}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-4">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">{format(date, 'EEEE, MMMM d, yyyy')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(date, { addSuffix: true })}
                  </p>
                </div>
              </div>

              {/* Timeline Events for this date */}
              <div className="space-y-4 ml-8 border-l-2 border-border pl-6">
                {events.map((event) => {
                  const config = STATUS_CONFIG[event.status];
                  const StatusIcon = config.icon;

                  return (
                    <Card
                      key={event.id}
                      className="hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {/* Status Icon */}
                          <div
                            className={cn(
                              'rounded-full p-2 bg-background border-2 -ml-[43px]',
                              config.color
                            )}
                          >
                            <StatusIcon className="h-4 w-4" />
                          </div>

                          {/* Event Details */}
                          <div className="flex-1 space-y-2">
                            {/* Header */}
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-semibold text-lg">
                                  {event.leadName}
                                </h4>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <span>
                                    {format(new Date(event.timestamp), 'h:mm a')}
                                  </span>
                                  <ArrowRight className="h-3 w-3" />
                                  <Badge variant="outline" className={config.color}>
                                    {config.label}
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            {/* Contact Info */}
                            <div className="flex items-center gap-4 text-sm">
                              {event.leadEmail && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span>{event.leadEmail}</span>
                                </div>
                              )}
                              {event.leadPhone && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  <span>{event.leadPhone}</span>
                                </div>
                              )}
                            </div>

                            {/* Additional Details */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                {/* Insurance Types */}
                                {event.insuranceTypes &&
                                  event.insuranceTypes.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {event.insuranceTypes
                                        .slice(0, 3)
                                        .map((type) => (
                                          <Badge
                                            key={type}
                                            variant="secondary"
                                            className="text-xs"
                                          >
                                            {type}
                                          </Badge>
                                        ))}
                                      {event.insuranceTypes.length > 3 && (
                                        <Badge variant="secondary" className="text-xs">
                                          +{event.insuranceTypes.length - 3}
                                        </Badge>
                                      )}
                                    </div>
                                  )}

                                {/* Estimated Premium */}
                                {event.estimatedPremium && (
                                  <span className="text-sm font-medium">
                                    ${event.estimatedPremium.toLocaleString()}
                                  </span>
                                )}
                              </div>

                              {/* Assigned Producer */}
                              {event.assignedTo && (
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-muted-foreground" />
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={event.assignedTo.avatar} />
                                      <AvatarFallback className="text-xs">
                                        {event.assignedTo.name.charAt(0)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm text-muted-foreground">
                                      {event.assignedTo.name}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {timelineEvents.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Activity Yet</h3>
              <p className="text-muted-foreground">
                Lead activity will appear here as they move through the pipeline
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
