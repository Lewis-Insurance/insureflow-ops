import { useFollowUpStats } from "@/hooks/useQuoteFollowups";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, TrendingUp, TrendingDown, CheckCircle2, Clock } from "lucide-react";
import { Loader2 } from "lucide-react";

interface FollowUpStatsCardProps {
  accountId?: string;
  className?: string;
}

export function FollowUpStatsCard({ accountId, className }: FollowUpStatsCardProps) {
  const { data: stats, isLoading, error } = useFollowUpStats();

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Follow-Up Statistics</CardTitle>
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
      <Card className={className}>
        <CardHeader>
          <CardTitle>Follow-Up Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load statistics: {error.message}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const responseRate = stats.response_rate || 0;
  const completionRate = stats.scheduled > 0
    ? Math.round((stats.completed / stats.scheduled) * 100)
    : 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Follow-Up Statistics</CardTitle>
        <CardDescription>
          {accountId ? "Account-specific metrics" : "Organization-wide metrics"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-2xl font-bold text-primary">
                {stats.scheduled}
              </div>
              <div className="text-xs text-muted-foreground">Scheduled</div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold text-blue-600">
                {stats.sent}
              </div>
              <div className="text-xs text-muted-foreground">Sent</div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold text-green-600">
                {stats.completed}
              </div>
              <div className="text-xs text-muted-foreground">Completed</div>
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-bold text-orange-600">
                {stats.pending}
              </div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Completed</span>
              </div>
              <span className="font-semibold">{stats.completed}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <span>Pending</span>
              </div>
              <span className="font-semibold">{stats.pending}</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span>Failed</span>
              </div>
              <span className="font-semibold">{stats.failed}</span>
            </div>
          </div>

          {/* Performance Indicators */}
          <div className="pt-4 border-t space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Response Rate</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{Math.round(responseRate)}%</span>
                  {responseRate >= 60 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : responseRate >= 40 ? (
                    <TrendingUp className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    responseRate >= 60
                      ? "bg-green-600"
                      : responseRate >= 40
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                  style={{ width: `${responseRate}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Completion Rate</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{completionRate}%</span>
                  {completionRate >= 80 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : completionRate >= 60 ? (
                    <TrendingUp className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    completionRate >= 80
                      ? "bg-green-600"
                      : completionRate >= 60
                      ? "bg-yellow-600"
                      : "bg-red-600"
                  }`}
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Status Summary */}
          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="text-muted-foreground">Cancelled</div>
                <div className="font-semibold text-gray-600">{stats.cancelled}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Failed</div>
                <div className="font-semibold text-red-600">{stats.failed}</div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
