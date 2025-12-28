// ============================================================================
// CHANGE DETECTION BADGE
// ============================================================================
// A compact badge that shows when policy changes have been detected.
// Clicking opens the full change summary.
// ============================================================================

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Car,
  User,
  Shield,
  DollarSign,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useChangeSummary, type PolicyChange } from '@/hooks/useCanopyChangeDetection';
import { formatDistanceToNow } from 'date-fns';

interface ChangeDetectionBadgeProps {
  pullId: string;
  variant?: 'badge' | 'button' | 'inline';
  showPopover?: boolean;
  onViewDetails?: () => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  vehicle: Car,
  driver: User,
  coverage: Shield,
  premium: DollarSign,
  policy: Shield,
  claim: AlertCircle,
  dwelling: Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  vehicle: 'text-blue-600',
  driver: 'text-purple-600',
  coverage: 'text-green-600',
  premium: 'text-amber-600',
  policy: 'text-gray-600',
  claim: 'text-red-600',
  dwelling: 'text-cyan-600',
};

export function ChangeDetectionBadge({
  pullId,
  variant = 'badge',
  showPopover = true,
  onViewDetails,
}: ChangeDetectionBadgeProps) {
  const {
    hasChanges,
    summary,
    groupedChanges,
    previousDate,
    currentDate,
    criticalChanges,
    getBadgeText,
    isLoading,
  } = useChangeSummary(pullId);

  if (isLoading) {
    return (
      <Badge variant="outline" className="bg-muted animate-pulse">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        Checking...
      </Badge>
    );
  }

  if (!hasChanges) {
    return null;
  }

  const badgeText = getBadgeText();
  const hasCriticalChanges = criticalChanges.length > 0;
  const hasPremiumChange = summary?.premiumChanges ? summary.premiumChanges > 0 : false;

  const BadgeContent = () => (
    <Badge
      variant={hasCriticalChanges ? 'destructive' : 'secondary'}
      className={`cursor-pointer ${
        hasCriticalChanges
          ? 'bg-amber-500 hover:bg-amber-600'
          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
      }`}
    >
      <AlertCircle className="w-3 h-3 mr-1" />
      {badgeText}
      {hasPremiumChange && (
        <TrendingUp className="w-3 h-3 ml-1" />
      )}
    </Badge>
  );

  const PopoverBody = () => (
    <div className="space-y-3 p-1">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Policy Changes Detected</h4>
        {currentDate && previousDate && (
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(currentDate), { addSuffix: true })}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {Object.entries(groupedChanges).map(([category, changes]) => {
          const CategoryIcon = CATEGORY_ICONS[category] || AlertCircle;
          const colorClass = CATEGORY_COLORS[category] || 'text-gray-600';

          return (
            <div key={category} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CategoryIcon className={`w-4 h-4 ${colorClass}`} />
                <span className="text-sm capitalize">{category}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {(changes as PolicyChange[]).length}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Show first few critical changes */}
      {criticalChanges.length > 0 && (
        <div className="pt-2 border-t space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Key Changes:</p>
          {criticalChanges.slice(0, 3).map((change, idx) => (
            <ChangePreviewItem key={idx} change={change} />
          ))}
          {criticalChanges.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{criticalChanges.length - 3} more changes
            </p>
          )}
        </div>
      )}

      {onViewDetails && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={onViewDetails}
        >
          View All Changes
          <ArrowRight className="w-3 h-3 ml-2" />
        </Button>
      )}
    </div>
  );

  if (!showPopover) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div onClick={onViewDetails}>
              <BadgeContent />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click to view policy changes</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === 'button') {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            {badgeText}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <PopoverBody />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div>
          <BadgeContent />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <PopoverBody />
      </PopoverContent>
    </Popover>
  );
}

// Sub-component to preview a single change
function ChangePreviewItem({ change }: { change: PolicyChange }) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') return value.toLocaleString();
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getChangeIndicator = () => {
    switch (change.changeType) {
      case 'added':
        return <TrendingUp className="w-3 h-3 text-green-500" />;
      case 'removed':
        return <TrendingDown className="w-3 h-3 text-red-500" />;
      case 'modified':
        return <ArrowRight className="w-3 h-3 text-amber-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {getChangeIndicator()}
        <span className="font-medium">{change.fieldLabel}</span>
      </div>
      <div className="text-muted-foreground truncate max-w-[120px]">
        {change.changeType === 'modified' ? (
          <span>{formatValue(change.previousValue)} → {formatValue(change.currentValue)}</span>
        ) : change.changeType === 'added' ? (
          <span className="text-green-600">+ {formatValue(change.currentValue)}</span>
        ) : (
          <span className="text-red-600">- {formatValue(change.previousValue)}</span>
        )}
      </div>
    </div>
  );
}

export default ChangeDetectionBadge;
