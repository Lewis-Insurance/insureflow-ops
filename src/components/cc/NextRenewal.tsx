import { AlertTriangle } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';

/**
 * Next renewal as a banded, labeled state (component-rules.md "Renewal countdown").
 * Days to renewal is a tabular figure with a band, never a plain date, and color
 * is paired with a word: overdue is danger with an icon and the word "Overdue",
 * inside 30 days is warning, otherwise neutral. No active policy reads as such.
 */
export function NextRenewal({
  date,
  className,
  emptyLabel = 'No active policy',
}: {
  date?: string | null;
  className?: string;
  /** Shown when there is no date. Defaults to "No active policy"; renewal surfaces pass "No renewal date". */
  emptyLabel?: string;
}) {
  if (!date) {
    return <span className={cn('text-sm text-cc-text-muted', className)}>{emptyLabel}</span>;
  }

  const d = new Date(date);
  const days = differenceInCalendarDays(d, new Date());
  const overdue = days < 0;
  const soon = days >= 0 && days <= 30;

  const color = overdue
    ? 'var(--cc-danger-pill-text)'
    : soon
      ? 'var(--cc-warning)'
      : 'var(--cc-text-secondary)';

  const label = overdue ? 'Overdue' : days === 0 ? 'Today' : `${days}d`;

  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className="inline-flex items-center gap-1.5" style={{ color }}>
        {overdue && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="cc-num text-sm">{label}</span>
      </span>
      <span className="cc-num text-xs text-cc-text-muted">{format(d, 'MMM d, yyyy')}</span>
    </span>
  );
}
