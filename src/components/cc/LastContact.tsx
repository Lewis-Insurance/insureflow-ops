import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow, format, differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';

/**
 * Last-contact recency as a banded, labeled state (component-rules.md
 * "Renewal countdown and contact recency"). Never a plain date. Shows both the
 * relative age and the absolute date, with a recency band. Color is paired with
 * a word, and the urgent band adds an icon.
 *
 * Banding for a general customer record (no renewal clock):
 *   never           -> warning  "No contact logged"
 *   <= 14 days       -> sage     recent, calm
 *   15..45 days      -> neutral  muted
 *   > 45 days        -> warning  "stale"
 *
 * Pass `urgent` (e.g. inside a 5-business-day renewal window) to force the
 * danger band when contact is missing or older than `urgentDays`.
 */
interface LastContactProps {
  date?: string | null;
  urgent?: boolean;
  urgentDays?: number;
  className?: string;
}

export function LastContact({ date, urgent, urgentDays = 3, className }: LastContactProps) {
  if (!date) {
    const danger = !!urgent;
    return (
      <span
        className={cn('inline-flex items-center gap-1.5', className)}
        style={{ color: danger ? 'var(--cc-danger-pill-text)' : 'var(--cc-warning)' }}
      >
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-cc-text-secondary">No contact logged</span>
      </span>
    );
  }

  const d = new Date(date);
  const days = differenceInCalendarDays(new Date(), d);
  const isDanger = urgent && days >= urgentDays;
  const recent = days <= 14;

  const toneColor = isDanger
    ? 'var(--cc-danger-pill-text)'
    : recent
      ? 'var(--cc-success)'
      : days > 45
        ? 'var(--cc-warning)'
        : 'var(--cc-text-secondary)';

  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span className="inline-flex items-center gap-1.5" style={{ color: toneColor }}>
        {isDanger ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        ) : recent ? (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        ) : null}
        <span className="cc-num">{formatDistanceToNow(d, { addSuffix: true })}</span>
      </span>
      <span className="cc-num text-xs text-cc-text-muted">{format(d, 'MMM d, yyyy')}</span>
    </span>
  );
}
