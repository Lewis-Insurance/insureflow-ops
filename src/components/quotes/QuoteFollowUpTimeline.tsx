import { useQuoteFollowups } from "@/hooks/useQuoteFollowups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, XCircle, Clock, Mail, MessageSquare, Bell, Calendar } from "lucide-react";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface QuoteFollowUpTimelineProps {
  quoteId: string;
}

export function QuoteFollowUpTimeline({ quoteId }: QuoteFollowUpTimelineProps) {
  const { data: followups, isLoading, error } = useQuoteFollowups(quoteId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Follow-Up Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load timeline: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "sent":
        return <CheckCircle2 className="h-5 w-5 text-blue-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      case "cancelled":
        return <XCircle className="h-5 w-5 text-gray-600" />;
      case "pending":
        return <Clock className="h-5 w-5 text-orange-600" />;
      case "scheduled":
        return <Calendar className="h-5 w-5 text-blue-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-50 border-green-200";
      case "sent":
        return "bg-blue-50 border-blue-200";
      case "failed":
        return "bg-red-50 border-red-200";
      case "cancelled":
        return "bg-gray-50 border-gray-200";
      case "pending":
        return "bg-orange-50 border-orange-200";
      case "scheduled":
        return "bg-blue-50 border-blue-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "send_email":
        return <Mail className="h-4 w-4" />;
      case "send_sms":
        return <MessageSquare className="h-4 w-4" />;
      case "create_task":
        return <Clock className="h-4 w-4" />;
      case "create_notification":
        return <Bell className="h-4 w-4" />;
      case "all":
        return <Bell className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Follow-Up Timeline</CardTitle>
        <CardDescription>
          {followups?.length || 0} follow-up{followups && followups.length !== 1 ? "s" : ""}{" "}
          for this quote
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!followups || followups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 text-gray-400" />
            <p>No follow-ups scheduled</p>
            <p className="text-sm">
              Follow-ups will be created automatically based on configured rules
            </p>
          </div>
        ) : (
          <div className="relative space-y-4">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200" />

            {followups.map((followup, index) => {
              const isScheduled = followup.status === "scheduled";
              const isOverdue =
                isScheduled && new Date(followup.scheduled_at) < new Date();

              return (
                <div key={followup.id} className="relative pl-12">
                  {/* Timeline node */}
                  <div className="absolute left-3 top-3 -ml-2.5 z-10 bg-white">
                    {getStatusIcon(followup.status)}
                  </div>

                  {/* Follow-up card */}
                  <div
                    className={`p-4 border rounded-lg ${getStatusColor(
                      followup.status
                    )} ${isOverdue ? "ring-2 ring-red-500" : ""}`}
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              Attempt #{followup.follow_up_number}
                            </Badge>
                            <Badge
                              variant={
                                followup.status === "completed"
                                  ? "default"
                                  : followup.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {followup.status}
                            </Badge>
                            {followup.rule && (
                              <Badge variant="outline" className="text-xs">
                                {getActionIcon(followup.rule.action_type)}
                                <span className="ml-1">{followup.rule.action_type}</span>
                              </Badge>
                            )}
                          </div>
                          {followup.rule && (
                            <div className="text-sm font-medium">
                              {followup.rule.name}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Timing */}
                      <div className="text-sm space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                            {isScheduled ? "Scheduled: " : "Executed: "}
                            {format(
                              new Date(
                                isScheduled
                                  ? followup.scheduled_at
                                  : followup.executed_at || followup.scheduled_at
                              ),
                              "MMM d, yyyy 'at' h:mm a"
                            )}
                          </span>
                          {isScheduled && (
                            <span
                              className={`text-xs ${
                                isOverdue ? "text-red-600" : "text-muted-foreground"
                              }`}
                            >
                              ({formatDistanceToNow(new Date(followup.scheduled_at), {
                                addSuffix: true,
                              })})
                            </span>
                          )}
                        </div>

                        {isOverdue && (
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-4 w-4" />
                            <span className="font-medium">Overdue</span>
                          </div>
                        )}

                        {followup.next_follow_up_at && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            <span>
                              Next follow-up:{" "}
                              {formatDistanceToNow(new Date(followup.next_follow_up_at), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions Taken */}
                      {(followup.task_created_id ||
                        followup.email_sent_at ||
                        followup.sms_sent_at ||
                        followup.notification_created_id) && (
                        <div className="pt-2 border-t space-y-1">
                          <div className="text-xs font-medium text-muted-foreground">
                            Actions Taken:
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {followup.task_created_id && (
                              <Badge variant="outline" className="gap-1">
                                <Clock className="h-3 w-3" />
                                Task Created
                              </Badge>
                            )}
                            {followup.email_sent_at && (
                              <Badge variant="outline" className="gap-1">
                                <Mail className="h-3 w-3" />
                                Email Sent
                              </Badge>
                            )}
                            {followup.sms_sent_at && (
                              <Badge variant="outline" className="gap-1">
                                <MessageSquare className="h-3 w-3" />
                                SMS Sent
                              </Badge>
                            )}
                            {followup.notification_created_id && (
                              <Badge variant="outline" className="gap-1">
                                <Bell className="h-3 w-3" />
                                Notification Created
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Response */}
                      {followup.response_received && (
                        <div className="pt-2 border-t space-y-1">
                          <div className="flex items-center gap-2">
                            {followup.response_type === "accepted" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : followup.response_type === "rejected" ? (
                              <XCircle className="h-4 w-4 text-red-600" />
                            ) : (
                              <MessageSquare className="h-4 w-4 text-blue-600" />
                            )}
                            <span className="text-sm font-medium">
                              Response:{" "}
                              {followup.response_type
                                ?.replace(/_/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase())}
                            </span>
                          </div>
                          {followup.response_received_at && (
                            <div className="text-xs text-muted-foreground">
                              Received:{" "}
                              {formatDistanceToNow(new Date(followup.response_received_at), {
                                addSuffix: true,
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Outcome */}
                      {followup.outcome && (
                        <div className="pt-2 border-t">
                          <div className="text-xs font-medium text-muted-foreground">
                            Outcome:
                          </div>
                          <div className="text-sm">
                            {followup.outcome.replace(/_/g, " ").replace(/\b\w/g, (l) =>
                              l.toUpperCase()
                            )}
                          </div>
                          {followup.outcome_notes && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {followup.outcome_notes}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error */}
                      {followup.error_message && (
                        <div className="pt-2 border-t">
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">Error:</span>
                          </div>
                          <div className="text-xs text-red-600 mt-1">
                            {followup.error_message}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
