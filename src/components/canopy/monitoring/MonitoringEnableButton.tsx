// ============================================================================
// MONITORING ENABLE BUTTON
// ============================================================================
// Button to enable/toggle monitoring for a Canopy pull. Includes confirmation
// dialog explaining the billing implications.
// ============================================================================

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Activity,
  AlertCircle,
  DollarSign,
  Loader2,
  Check,
} from 'lucide-react';
import { useMonitoringStatus } from '@/hooks/useCanopyMonitoring';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface MonitoringEnableButtonProps {
  pullId: string;
  canopyPullId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function MonitoringEnableButton({
  pullId,
  canopyPullId,
  variant = 'outline',
  size = 'default',
}: MonitoringEnableButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const { data: monitoring, isLoading } = useMonitoringStatus(pullId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isMonitoringEnabled = monitoring?.status === 'active';

  const handleEnableMonitoring = async () => {
    setIsEnabling(true);
    try {
      const { data, error } = await supabase.functions.invoke('canopy-monitoring', {
        body: {
          action: 'enable',
          pull_id: pullId,
          canopy_pull_id: canopyPullId,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Monitoring enabled',
          description: 'You will be notified when policy changes are detected.',
        });
        queryClient.invalidateQueries({ queryKey: ['canopy-monitoring'] });
        setShowDialog(false);
      } else {
        throw new Error(data?.error || 'Failed to enable monitoring');
      }
    } catch (err) {
      toast({
        title: 'Failed to enable monitoring',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsEnabling(false);
    }
  };

  if (isLoading) {
    return (
      <Button variant={variant} size={size} disabled>
        <Loader2 className="w-4 h-4 animate-spin" />
      </Button>
    );
  }

  if (isMonitoringEnabled) {
    return (
      <Button variant="ghost" size={size} disabled className="text-green-600">
        <Check className="w-4 h-4 mr-2" />
        Monitoring Active
      </Button>
    );
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowDialog(true)}
      >
        <Activity className="w-4 h-4 mr-2" />
        Enable Monitoring
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Enable Policy Monitoring
            </DialogTitle>
            <DialogDescription>
              Automatically detect changes to the customer's insurance policies.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h4 className="font-medium text-sm">What is Monitoring?</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Automatic policy refresh every 30 days
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Detect coverage changes, new vehicles, drivers
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Get notified of premium changes
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-green-500 mt-0.5" />
                  Identify cross-sell opportunities
                </li>
              </ul>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm text-amber-800">Billing Notice</h4>
                  <p className="text-xs text-amber-600 mt-1">
                    Each monitoring refresh is billed as a Canopy Pull. Refreshes occur
                    automatically every 30 days while monitoring is active.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-sm text-blue-800">Token Expiration</h4>
                  <p className="text-xs text-blue-600 mt-1">
                    Carrier auth tokens typically expire after 90-180 days. If the token
                    expires, the customer will need to re-authenticate to continue monitoring.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEnableMonitoring} disabled={isEnabling}>
              {isEnabling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4 mr-2" />
                  Enable Monitoring
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default MonitoringEnableButton;
