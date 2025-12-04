/**
 * Empty State Component
 *
 * Standardized empty state UI with icon, title, description, and optional action
 * Used throughout the app for consistent UX when no data is available
 */

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export interface EmptyStateProps {
  /**
   * Icon to display (from lucide-react)
   */
  icon: LucideIcon;

  /**
   * Main heading text
   */
  title: string;

  /**
   * Descriptive text explaining the empty state
   */
  description: string;

  /**
   * Optional action button
   */
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  };

  /**
   * Secondary action (e.g., "Learn more")
   */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };

  /**
   * Whether to render as a card (default: true)
   */
  asCard?: boolean;

  /**
   * Custom className for container
   */
  className?: string;

  /**
   * Icon size (default: 12)
   */
  iconSize?: number;

  /**
   * Icon color classes (default: text-muted-foreground)
   */
  iconClassName?: string;
}

/**
 * Empty State Component
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon={Users}
 *   title="No customers found"
 *   description="Get started by adding your first customer"
 *   action={{
 *     label: "Add Customer",
 *     onClick: () => navigate('/customers/new')
 *   }}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  asCard = true,
  className = '',
  iconSize = 12,
  iconClassName = 'text-muted-foreground',
}: EmptyStateProps) {
  const content = (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      {/* Icon */}
      <Icon className={`h-${iconSize} w-${iconSize} mb-4 ${iconClassName}`} />

      {/* Title */}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>

      {/* Description */}
      <p className="text-muted-foreground max-w-md mb-6">{description}</p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex gap-3">
          {action && (
            <Button onClick={action.onClick} variant={action.variant || 'default'}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="outline">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (asCard) {
    return (
      <Card>
        <CardContent className="p-0">{content}</CardContent>
      </Card>
    );
  }

  return content;
}

/**
 * Specialized empty states for common scenarios
 */

export interface SpecializedEmptyStateProps {
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

/**
 * Empty search results state
 */
export function EmptySearchState({
  onAction,
  actionLabel = 'Clear Search',
  className,
}: SpecializedEmptyStateProps) {
  const { FileSearch } = require('lucide-react');
  return (
    <EmptyState
      icon={FileSearch}
      title="No results found"
      description="We couldn't find any matches for your search. Try adjusting your filters or search terms."
      action={
        onAction
          ? {
              label: actionLabel,
              onClick: onAction,
              variant: 'outline',
            }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty list state (generic)
 */
export function EmptyListState({
  entityName = 'items',
  onAction,
  actionLabel,
  className,
}: SpecializedEmptyStateProps & { entityName?: string }) {
  const { Inbox } = require('lucide-react');
  return (
    <EmptyState
      icon={Inbox}
      title={`No ${entityName} yet`}
      description={`Get started by creating your first ${entityName.toLowerCase()}.`}
      action={
        onAction
          ? {
              label: actionLabel || `Add ${entityName}`,
              onClick: onAction,
            }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Empty filtered list state
 */
export function EmptyFilteredState({
  onAction,
  actionLabel = 'Clear Filters',
  className,
}: SpecializedEmptyStateProps) {
  const { Filter } = require('lucide-react');
  return (
    <EmptyState
      icon={Filter}
      title="No matches found"
      description="No items match your current filters. Try adjusting or clearing your filters to see more results."
      action={
        onAction
          ? {
              label: actionLabel,
              onClick: onAction,
              variant: 'outline',
            }
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Error state (for when data failed to load)
 */
export function ErrorState({
  onAction,
  actionLabel = 'Try Again',
  className,
  errorMessage,
}: SpecializedEmptyStateProps & { errorMessage?: string }) {
  const { AlertTriangle } = require('lucide-react');
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong"
      description={
        errorMessage || 'We encountered an error loading this data. Please try again.'
      }
      action={
        onAction
          ? {
              label: actionLabel,
              onClick: onAction,
            }
          : undefined
      }
      iconClassName="text-destructive"
      className={className}
    />
  );
}

/**
 * Loading placeholder state
 */
export function LoadingState({ className }: { className?: string }) {
  const { Loader2 } = require('lucide-react');
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 ${className}`}>
      <Loader2 className="h-12 w-12 mb-4 text-muted-foreground animate-spin" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}

/**
 * No permission state
 */
export function NoPermissionState({ className }: { className?: string }) {
  const { Lock } = require('lucide-react');
  return (
    <EmptyState
      icon={Lock}
      title="Access Denied"
      description="You don't have permission to view this content. Contact your administrator if you believe this is an error."
      iconClassName="text-muted-foreground"
      className={className}
    />
  );
}
