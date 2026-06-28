import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Calm Command status pill (component-rules.md "Status pills and metadata chips").
 * Background sits at 14% alpha of its semantic color, text at the full semantic
 * color. The danger pill uses the lightened --cc-danger-pill-text so it clears
 * 4.5:1 on the 14% fill. Color is never the only signal: every pill shows a word,
 * and critical states (Overdue, Lapsed) add an icon.
 *
 * Shared vocabulary, never improvised per page:
 * Active, Contacted, Pending, Lead, Quoted, Quote sent, Bound, Declined, Lapsed, Overdue.
 */

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const TONE_VAR: Record<Tone, string> = {
  success: '--cc-success',
  info: '--cc-info',
  warning: '--cc-warning',
  danger: '--cc-danger',
  neutral: '--cc-text-muted',
};

interface Entry {
  label: string;
  tone: Tone;
  critical?: boolean;
}

const VOCAB: Record<string, Entry> = {
  active: { label: 'Active', tone: 'success' },
  customer: { label: 'Active', tone: 'success' },
  client: { label: 'Active', tone: 'success' },
  contacted: { label: 'Contacted', tone: 'info' },
  pending: { label: 'Pending', tone: 'warning' },
  prospect: { label: 'Prospect', tone: 'info' },
  lead: { label: 'Lead', tone: 'warning' },
  new: { label: 'New lead', tone: 'warning' },
  nurturing: { label: 'Nurturing', tone: 'info' },
  qualified: { label: 'Qualified', tone: 'info' },
  quoted: { label: 'Quoted', tone: 'info' },
  'quote sent': { label: 'Quote sent', tone: 'info' },
  open: { label: 'Open', tone: 'info' },
  won: { label: 'Won', tone: 'success' },
  bound: { label: 'Bound', tone: 'success' },
  moved: { label: 'Moved', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  lost: { label: 'Lost', tone: 'neutral' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  non_renewed: { label: 'Non renewed', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'danger', critical: true },
  lapsed: { label: 'Lapsed', tone: 'danger', critical: true },
  suspended: { label: 'Suspended', tone: 'danger', critical: true },
};

function titleCase(s: string) {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function resolve(status?: string | null): Entry {
  const key = (status ?? '').trim().toLowerCase();
  if (key && VOCAB[key]) return VOCAB[key];
  return { label: key ? titleCase(key) : 'Unknown', tone: 'neutral' };
}

interface StatusPillProps {
  status?: string | null;
  /** Force a tone/label, bypassing the shared vocabulary. */
  override?: Entry;
  className?: string;
}

export function StatusPill({ status, override, className }: StatusPillProps) {
  const entry = override ?? resolve(status);
  const varName = TONE_VAR[entry.tone];
  const text =
    entry.tone === 'danger'
      ? 'var(--cc-danger-pill-text)'
      : entry.tone === 'neutral'
        ? 'var(--cc-text-secondary)'
        : `var(${varName})`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
      style={{
        backgroundColor: `color-mix(in srgb, var(${varName}) 14%, transparent)`,
        color: text,
      }}
    >
      {entry.critical && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
      {entry.label}
    </span>
  );
}
