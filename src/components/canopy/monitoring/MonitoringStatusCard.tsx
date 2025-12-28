// ============================================================================
// MONITORING STATUS CARD
// ============================================================================
// Displays the current monitoring status for a Canopy pull, including
// refresh schedule, next due date, and reconnection requirements.
// ============================================================================

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock,
  Calendar,
  Activity,
  Loader2,
  Info,
} from 'lucide-react';
import { useMonitoringStatus, useRefreshPull } from '@/hooks/useCanopyMonitoring';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format, isPast, differenceInDays } from 'date-fns';

interface MonitoringStatusCardProps {
  pullId: string;
  compact?: boolean;
}

export function MonitoringStatusCard({ pullId, compact = false }: MonitoringStatusCardProps) {
  const { data: monitoring, isLoading, error } = useMonitoringStatus(pullId);
  const refreshMutation = useRefreshPull();
  const { toast } = useToast();

  const handleRefresh = async () => {
    try {
      const result = await refreshMutation.mutateAsync({ pullId });
      if (result.success) {
        toast({
          title: 'Refresh initiated',
          description: result.message || 'Policy data refresh has been started.',
        });
      } else {
        toast({
          title: 'Refresh failed',
          description: result.error || 'Could not refresh policy data.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Refresh error',
        description: err instanceof Error ? err.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card className={compact ? 'p-4' : ''}>
        <CardContent className="py-4 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error || !monitoring) {
    return (
      <Card className={compact ? 'p-4' : ''}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="w-4 h-4" />
            <span className="text-sm">Monitoring not enabled</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const monitoringStatus = monitoring.status || 'unknown';
  const lastRefresh = monitoring.last_refresh_at ? new Date(monitoring.last_refresh_at) : null;
  const nextRefreshDue = monitoring.next_refresh_due ? new Date(monitoring.next_refresh_due) : null;
  const requiresReconnect = monitoring.requires_reconnect || false;
  const refreshCount = monitoring.refresh_count || 0;
  const isActive = monitoringStatus === 'active' && !requiresReconnect;
  const isDue = nextRefreshDue && isPast(nextRefreshDue);

  const getStatusBadge = () => {
    if (requiresReconnect) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Reconnect Required
        </Badge>
      );
    }
    if (isDue) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1 bg-amber-100 text-amber-800">
          <Clock className="w-3 h-3" />
          Refresh Due
        </Badge>
      );
    }
    if (isActive) {
      return (
        <Badge className="bg-green-500 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Active
        </Badge>
      );
    }
    return (
      <Badge variant="outline">{monitoringStatus}</Badge>
    );
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Monitoring</span>
          {getStatusBadge()}
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshMutation.isPending || requiresReconnect}
              >
                {refreshMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {requiresReconnect ? 'Reconnect required before refresh' : 'Refresh policy data'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-base">Policy Monitoring</CardTitle>
          </div>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Automatic policy change detection
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Last Refresh
            </p>
            <p className="text-sm font-medium">
              {lastRefresh ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      {formatDistanceToNow(lastRefresh, { addSuffix: true })}
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(lastRefresh, 'PPpp')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                'Never'
              )}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next Due
            </p>
            <p className={`text-sm font-medium ${isDue ? 'text-amber-600' : ''}`}>
              {nextRefreshDue ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-left">
                      {isDue ? 'Overdue' : formatDistanceToNow(nextRefreshDue, { addSuffix: true })}
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(nextRefreshDue, 'PPpp')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                'Not scheduled'
              )}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Refresh Count</p>
            <p className="text-sm font-medium">{refreshCount}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Refresh Interval</p>
            <p className="text-sm font-medium">30 days</p>
          </div>
        </div>

        {requiresReconnect && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Reconnection Required</p>
                <p className="text-xs text-red-600 mt-1">
                  The carrier connection has expired. The customer needs to re-authenticate to continue monitoring.
                </p>
              </div>
            </div>
          </div>
        )}

        {isDue && !requiresReconnect && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Refresh Overdue</p>
                <p className="text-xs text-amber-600 mt-1">
                  Policy data hasn't been refreshed in over 30 days. Click refresh to get the latest data.
                </p>
              </div>
            </div>
          </div>
        )}

        <Button
          className="w-full"
          variant={isDue ? 'default' : 'outline'}
          onClick={handleRefresh}
          disabled={refreshMutation.isPending || requiresReconnect}
        >
          {refreshMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Now
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Note: Each refresh is billed as a Canopy Pull
        </p>
      </CardContent>
    </Card>
  );
}

export default MonitoringStatusCard;
