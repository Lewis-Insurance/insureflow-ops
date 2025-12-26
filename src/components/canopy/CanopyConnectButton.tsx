// ============================================================================
// CANOPY CONNECT BUTTON
// ============================================================================
// Button component to initiate Canopy Connect insurance data import
// ============================================================================

import React from 'react';
import { Button } from '@/components/ui/button';
import { useCanopyConnect, CanopyPullResult } from '@/hooks/useCanopyConnect';
import { Shield, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CanopyConnectButtonProps {
  /** Link to an existing lead */
  leadId?: string;
  /** Link to an existing account */
  accountId?: string;
  /** Whether to create a new lead or attach to existing account */
  mode?: 'create_lead' | 'attach_account';
  /** Called when import completes successfully */
  onComplete?: (result: CanopyPullResult) => void;
  /** Called when import fails */
  onError?: (error: Error) => void;
  /** Called when user exits the widget */
  onExit?: () => void;
  /** Button variant */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  /** Button size */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Additional class names */
  className?: string;
  /** Custom button text */
  children?: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
}

export function CanopyConnectButton({
  leadId,
  accountId,
  mode,
  onComplete,
  onError,
  onExit,
  variant = 'default',
  size = 'default',
  className,
  children,
  disabled = false,
}: CanopyConnectButtonProps) {
  const {
    initiatePull,
    isLoading,
    status,
    reset,
  } = useCanopyConnect({
    leadId,
    accountId,
    mode,
    onSuccess: (result) => {
      onComplete?.(result);
      // Reset after a delay so user sees success state
      setTimeout(reset, 3000);
    },
    onError,
    onExit,
  });

  const handleClick = async () => {
    if (status === 'complete' || status === 'error') {
      reset();
    }
    await initiatePull();
  };

  // Determine icon based on status
  const getIcon = () => {
    switch (status) {
      case 'initiating':
      case 'pending':
      case 'authenticated':
      case 'processing':
        return <Loader2 className="w-4 h-4 mr-2 animate-spin" />;
      case 'complete':
        return <CheckCircle className="w-4 h-4 mr-2 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 mr-2 text-red-500" />;
      default:
        return <Shield className="w-4 h-4 mr-2" />;
    }
  };

  // Determine button text based on status
  const getButtonText = () => {
    if (children) return children;

    switch (status) {
      case 'initiating':
        return 'Starting...';
      case 'pending':
        return 'Connecting...';
      case 'authenticated':
        return 'Authenticated';
      case 'processing':
        return 'Importing...';
      case 'complete':
        return 'Import Complete';
      case 'error':
        return 'Try Again';
      default:
        return 'Import Insurance Data';
    }
  };

  const isDisabled = disabled || (isLoading && status !== 'error');

  return (
    <Button
      onClick={handleClick}
      disabled={isDisabled}
      variant={status === 'error' ? 'destructive' : variant}
      size={size}
      className={cn(
        status === 'idle' && 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700',
        status === 'complete' && 'bg-green-600 hover:bg-green-700',
        className
      )}
    >
      {getIcon()}
      {getButtonText()}
    </Button>
  );
}

// ============================================================================
// COMPACT VARIANT - For use in action bars
// ============================================================================

export function CanopyConnectIconButton({
  leadId,
  accountId,
  mode,
  onComplete,
  onError,
  className,
}: Omit<CanopyConnectButtonProps, 'variant' | 'size' | 'children'>) {
  const { initiatePull, isLoading, status } = useCanopyConnect({
    leadId,
    accountId,
    mode,
    onSuccess: onComplete,
    onError,
  });

  return (
    <Button
      onClick={initiatePull}
      disabled={isLoading}
      variant="ghost"
      size="icon"
      className={className}
      title="Import insurance data from Canopy"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === 'complete' ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : (
        <Shield className="w-4 h-4" />
      )}
    </Button>
  );
}

// ============================================================================
// STATUS BADGE - Shows current import status
// ============================================================================

interface CanopyStatusBadgeProps {
  pullId: string;
  className?: string;
}

export function CanopyStatusBadge({ pullId, className }: CanopyStatusBadgeProps) {
  // This would use useCanopyPull to get status
  // For now, just a placeholder
  return (
    <div className={cn(
      'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
      'bg-blue-100 text-blue-800',
      className
    )}>
      <Clock className="w-3 h-3 mr-1" />
      Processing
    </div>
  );
}

export default CanopyConnectButton;
