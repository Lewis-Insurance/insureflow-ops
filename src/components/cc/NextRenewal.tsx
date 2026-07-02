import { AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { differenceFromTodayInLocalDays, extractLocalDate, parseLocalDate } from '@/lib/date/localDate';

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

  // Local-date parsing: new Date('YYYY-MM-DD') is UTC midnight, which renders the
  // previous day and flips "Overdue" a day early in US timezones.
  const d = parseLocalDate(extractLocalDate(date));
  const days = differenceFromTodayInLocalDays(date) ?? 0;
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
