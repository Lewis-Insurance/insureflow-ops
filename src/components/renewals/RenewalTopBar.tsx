import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, ExternalLink, AlertTriangle } from 'lucide-react';
import { StatusPill } from '@/components/cc';
import { humanizeCarrier, humanizeLine } from '@/lib/format';
import { termLabel, normalizePolicyTerm, renewalPillStatus } from '@/lib/renewals/renewalTerm';
import { formatMoney } from '@/lib/renewals/format';
import { parseLocalDate, differenceFromTodayInLocalDays } from '@/lib/date/localDate';
import { cn } from '@/lib/utils';
import type { Renewal } from '@/hooks/useRenewalWorkflow';

/**
 * Region 1 — top bar. Identity you can read at a glance (customer, then a prominent
 * carrier + line-of-business), plus the two facts that drive a renewal call: the premium
 * change and how long until it renews. No lime here.
 */
export function RenewalTopBar({ renewal }: { renewal: Renewal }) {
  const navigate = useNavigate();

  const carrier = renewal.carrier ? humanizeCarrier(renewal.carrier) : null;
  const line = renewal.policy_type ? humanizeLine(renewal.policy_type) : null;
  const identity = [carrier, line].filter(Boolean).join('  ·  ') || 'Renewal';
  const term = renewal.policy_term ? termLabel(normalizePolicyTerm(renewal.policy_term)) : null;

  // Premium change — the crux of the conversation. Delta only when both terms are known.
  const cur = renewal.current_premium;
  const ren = renewal.renewal_premium;
  const delta = cur != null && ren != null && cur !== 0 ? ((ren - cur) / cur) * 100 : null;

  // Countdown — emphasized. Anchored on the expiration (fallback renewal_date), local-safe.
  const exp = renewal.expiration_date || renewal.renewal_date || null;
  const days = differenceFromTodayInLocalDays(exp);
  const overdue = days != null && days < 0;
  const soon = days != null && days >= 0 && days <= 30;
  const countdownColor = overdue ? 'text-cc-danger' : soon ? 'text-cc-warning' : 'text-cc-text-primary';

  return (
    <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface-raised p-5 shadow-card">
      {/* Row 1: back + who + view account */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Back to renewals"
            onClick={() => navigate('/renewals')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-cc-md text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-label uppercase tracking-label text-cc-text-muted">Renewal</p>
            <h1 className="truncate text-2xl font-bold tracking-tight text-cc-text-primary">
              {renewal.account?.name || 'Account'}
            </h1>
          </div>
        </div>
        <Link
          to={`/customers/${renewal.account_id}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-cc-md px-2.5 py-1.5 text-sm text-cc-text-muted hover:bg-cc-surface-overlay hover:text-cc-text-primary"
        >
          View account <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Row 2: prominent carrier + line (the "what"), policy meta, and the stat strip */}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold text-cc-text-primary">{identity}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-cc-text-muted">
            <span className="cc-num">Policy {renewal.policy_number || '--'}</span>
            {term && (
              <>
                <span aria-hidden="true">&middot;</span>
                <span>{term}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-stretch gap-5">
          {/* Premium change */}
          <div className="text-right">
            <p className="text-label uppercase tracking-label text-cc-text-muted">Premium</p>
            <div className="mt-1 flex items-baseline justify-end gap-2">
              <span className="cc-num text-base text-cc-text-secondary">{formatMoney(cur)}</span>
              {ren != null && (
                <>
                  <span className="text-cc-text-muted" aria-hidden="true">&rarr;</span>
                  <span className="cc-num text-base font-semibold text-cc-text-primary">{formatMoney(ren)}</span>
                </>
              )}
              {delta != null && (
                <span
                  className={cn(
                    'cc-num text-sm font-medium',
                    delta > 0 ? 'text-cc-warning' : delta < 0 ? 'text-cc-success' : 'text-cc-text-muted',
                  )}
                >
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          <div className="w-px self-stretch bg-cc-border-subtle" aria-hidden="true" />

          {/* Emphasized countdown */}
          <div className="text-right">
            <p className="text-label uppercase tracking-label text-cc-text-muted">Renews</p>
            {days == null ? (
              <p className="mt-1 text-sm text-cc-text-muted">No renewal date</p>
            ) : overdue ? (
              <div className="mt-1 inline-flex items-center gap-1.5 text-cc-danger">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span className="text-lg font-bold">Overdue</span>
              </div>
            ) : (
              <div className="mt-0.5 flex items-baseline justify-end gap-1.5">
                <span className={cn('cc-num text-2xl font-bold leading-none', countdownColor)}>
                  {days === 0 ? 'Today' : days}
                </span>
                {days !== 0 && <span className="text-xs text-cc-text-muted">{days === 1 ? 'day' : 'days'}</span>}
              </div>
            )}
            {exp && (
              <p className="cc-num mt-1 text-xs text-cc-text-muted">{format(parseLocalDate(exp), 'MMM d, yyyy')}</p>
            )}
          </div>

          <div className="w-px self-stretch bg-cc-border-subtle" aria-hidden="true" />

          {/* Status */}
          <div className="flex items-center">
            <StatusPill
              status={renewalPillStatus(renewal.status)}
              override={renewal.status === 'renewed' ? { label: 'Renewed', tone: 'success' } : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
