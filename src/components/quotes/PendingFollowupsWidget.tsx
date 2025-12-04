import { usePendingFollowups, useMarkFollowupResponse, useCancelFollowup } from "@/hooks/useQuoteFollowups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, XCircle, Clock, Mail, MessageSquare, Bell } from "lucide-react";
import { Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

export function PendingFollowupsWidget({ limit = 10 }: { limit?: number }) {
  const { data: followups, isLoading, error } = usePendingFollowups(limit);
  const markResponse = useMarkFollowupResponse();
  const cancelFollowup = useCancelFollowup();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Follow-Ups</CardTitle>
          <CardDescription>Loading...</CardDescription>
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
          <CardTitle>Pending Follow-Ups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load follow-ups: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const overdueFollowups = followups?.filter(
    (f) => new Date(f.scheduled_at) < new Date()
  ) || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pending Follow-Ups</CardTitle>
            <CardDescription>
              {followups?.length || 0} scheduled • {overdueFollowups.length} overdue
            </CardDescription>
          </div>
          {overdueFollowups.length > 0 && (
            <Badge variant="destructive">
              <AlertCircle className="h-3 w-3 mr-1" />
              {overdueFollowups.length} Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!followups || followups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p>No pending follow-ups</p>
            <p className="text-sm">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {followups.map((followup) => {
              const isOverdue = new Date(followup.scheduled_at) < new Date();
              const actionIcons = {
                create_task: <Bell className="h-3 w-3" />,
                send_email: <Mail className="h-3 w-3" />,
                send_sms: <MessageSquare className="h-3 w-3" />,
                all: <Bell className="h-3 w-3" />,
              };

              return (
                <div
                  key={followup.id}
                  className={`p-3 border rounded-lg ${
                    isOverdue ? "border-red-200 bg-red-50" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {followup.quote?.account?.name || "Unknown Account"}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          Attempt #{followup.follow_up_number}
                        </Badge>
                        {followup.quote?.quote_score && (
                          <Badge
                            variant={
                              followup.quote.quote_score >= 70 ? "default" : "secondary"
                            }
                            className="text-xs"
                          >
                            {followup.quote.quote_score}/100
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          Quote: {followup.quote?.quote_ref || followup.quote_id.slice(0, 8)}
                        </span>
                        {followup.quote?.carrier_info?.name && (
                          <>
                            <span>•</span>
                            <span>{followup.quote.carrier_info.name}</span>
                          </>
                        )}
                        {followup.quote?.premium && (
                          <>
                            <span>•</span>
                            <span>${followup.quote.premium.toLocaleString()}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="h-3 w-3" />
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                          {isOverdue ? "Overdue: " : "Due: "}
                          {formatDistanceToNow(new Date(followup.scheduled_at), {
                            addSuffix: true,
                          })}
                        </span>
                        {followup.rule && (
                          <>
                            <span>•</span>
                            <span className="text-muted-foreground">
                              {followup.rule.name}
                            </span>
                          </>
                        )}
                        {followup.rule?.action_type && (
                          <Badge variant="outline" className="text-xs">
                            {actionIcons[followup.rule.action_type as keyof typeof actionIcons] || (
                              <Bell className="h-3 w-3" />
                            )}
                            <span className="ml-1">{followup.rule.action_type}</span>
                          </Badge>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            markResponse.mutate({
                              followupId: followup.id,
                              responseType: "accepted",
                            })
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                          Mark as Accepted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            markResponse.mutate({
                              followupId: followup.id,
                              responseType: "rejected",
                            })
                          }
                        >
                          <XCircle className="h-4 w-4 mr-2 text-red-600" />
                          Mark as Rejected
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            markResponse.mutate({
                              followupId: followup.id,
                              responseType: "requested_changes",
                            })
                          }
                        >
                          <MessageSquare className="h-4 w-4 mr-2 text-blue-600" />
                          Requested Changes
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => cancelFollowup.mutate(followup.id)}
                          className="text-destructive"
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Follow-Up
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
