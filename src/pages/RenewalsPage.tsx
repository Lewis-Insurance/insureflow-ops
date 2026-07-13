import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { differenceFromTodayInLocalDays } from '@/lib/date/localDate';
import { Search, Brain, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { useRenewals, useReopenRenewal, type Renewal } from '@/hooks/useRenewalWorkflow';
import { supabase } from '@/integrations/supabase/client';
import { StatusPill, Chip, SectionLabel, NextRenewal, LastContact, TriageTile, SkeletonRow } from '@/components/cc';
import { humanizeCarrier, humanizeStatus } from '@/lib/format';
import { renewalPillStatus } from '@/lib/renewals/renewalTerm';
import { isHiddenByAoMigration } from '@/lib/renewals/aoMigrationFilter';
import { cn } from '@/lib/utils';

// The general renewals worklist: EVERY policy renewal, every carrier. The
// Auto-Owners migration queue is a separate surface and lives at /ao-renewals.
// Cohorts segment the open book by what needs attention; clicking a tile filters
// the rows to it. Counts are computed over the whole book, not the filtered view.
type Cohort = 'all' | 'overdue' | 'due_week' | 'quoted';
// View scope: the working (open) book, the closed outcomes (reopenable), or everything.
type Scope = 'open' | 'closed' | 'all';

// Statuses that mean the renewal is still being worked (not a terminal outcome).
const OPEN_STATUSES = new Set(['pending', 'contacted', 'quoted', 'upcoming', 'in_progress']);

const isOpen = (r: Renewal) => OPEN_STATUSES.has(r.status);
// Local-date math: new Date('YYYY-MM-DD') is UTC midnight, which shifts the
// Overdue / Due-this-week cohorts a day early in US timezones.
const daysToRenewal = (r: Renewal) =>
  r.renewal_date ? differenceFromTodayInLocalDays(r.renewal_date) : null;

// Each cohort is a predicate over a renewal. 'all' is the unfiltered book.
const COHORT_PREDICATE: Record<Exclude<Cohort, 'all'>, (r: Renewal) => boolean> = {
  overdue: (r) => isOpen(r) && (daysToRenewal(r) ?? 1) < 0,
  due_week: (r) => {
    const d = daysToRenewal(r);
    return isOpen(r) && d !== null && d >= 0 && d <= 7;
  },
  quoted: (r) => r.status === 'quoted',
};

// Dense table column template (md+). Same fields, same order, every row:
// Client, policy, carrier, status, renewal countdown, last contact.
const COLS = 'md:grid-cols-[minmax(0,1fr)_150px_140px_116px_120px_150px]';

export default function RenewalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [cohort, setCohort] = useState<Cohort>('all');
  const [carrier, setCarrier] = useState<string>('all');
  const [scope, setScope] = useState<Scope>('open');
  const [reopenTarget, setReopenTarget] = useState<Renewal | null>(null);
  const reopen = useReopenRenewal();

  // Pull the whole book once (all carriers, ordered by renewal date). Cohort,
  // carrier and search are applied client-side so the tile counts stay accurate
  // and filtering is instant.
  const { data: renewalsRaw = [], isLoading } = useRenewals();

  // Auto-Owners personal-auto renewals are worked in the dedicated AO Renewals
  // migration queue (/ao-renewals) through Jan 30, 2027, so hide them here until
  // then to avoid double-listing the same policy. Self-expires Feb 1, 2027 (see
  // aoMigrationFilter). Everything downstream (counts, carriers, rows) reads this
  // filtered book, so tiles and list stay consistent.
  const renewals = useMemo(
    () => renewalsRaw.filter((r) => !isHiddenByAoMigration(r)),
    [renewalsRaw],
  );

  // Keep the renewals table current with upcoming policies. Best-effort and
  // silent: a toast on every page load would be noise. Runs once per mount.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    supabase
      .rpc('sync_policies_to_renewals', { days_ahead: 90 })
      .then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ['renewals'] });
      });
  }, [queryClient]);

  // Cohort counts over the whole book.
  const counts = useMemo(
    () => ({
      total: renewals.length,
      overdue: renewals.filter(COHORT_PREDICATE.overdue).length,
      due_week: renewals.filter(COHORT_PREDICATE.due_week).length,
      quoted: renewals.filter(COHORT_PREDICATE.quoted).length,
    }),
    [renewals],
  );

  // Distinct carriers present, for the carrier filter. Name chips, never colored.
  const carriers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of renewals) {
      if (r.carrier && !seen.has(r.carrier)) seen.set(r.carrier, humanizeCarrier(r.carrier));
    }
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [renewals]);

  const rows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = renewals.filter((r) => {
      if (scope === 'open' && !isOpen(r)) return false;
      if (scope === 'closed' && isOpen(r)) return false;
      if (cohort !== 'all' && !COHORT_PREDICATE[cohort](r)) return false;
      if (carrier !== 'all' && r.carrier !== carrier) return false;
      if (q) {
        const name = r.account?.name?.toLowerCase() ?? '';
        const policy = r.policy_number?.toLowerCase() ?? '';
        if (!name.includes(q) && !policy.includes(q)) return false;
      }
      return true;
    });
    // Default ordering puts the next thing to work on top: still-open renewals
    // first, then by renewal date ascending so the most overdue (past) and the
    // soonest-to-expire come first. Closed outcomes and undated rows sink down.
    return filtered.sort((a, b) => {
      const aOpen = isOpen(a) ? 0 : 1;
      const bOpen = isOpen(b) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      const at = a.renewal_date ? new Date(a.renewal_date).getTime() : Infinity;
      const bt = b.renewal_date ? new Date(b.renewal_date).getTime() : Infinity;
      return at - bt;
    });
  }, [renewals, cohort, carrier, searchQuery, scope]);

  // Cohort tiles are open-book views, so picking one snaps scope back to Open. Switching to the
  // Closed view clears any cohort so an open-only predicate can't zero out the closed list.
  const toggleCohort = (c: Exclude<Cohort, 'all'>) =>
    setCohort((cur) => {
      const next = cur === c ? 'all' : c;
      if (next !== 'all') setScope('open');
      return next;
    });
  const changeScope = (s: Scope) => {
    setScope(s);
    if (s === 'closed') setCohort('all');
  };
  const filtersActive =
    cohort !== 'all' || carrier !== 'all' || searchQuery.length > 0 || scope !== 'open';
  const clearAll = () => {
    setCohort('all');
    setCarrier('all');
    setSearchQuery('');
    setScope('open');
  };

  const openRenewal = (id: string) => navigate(`/renewals/${id}/edit`);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Renewals</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              Every policy renewal across all carriers.{' '}
              <span className="cc-num">{counts.total}</span> in the book.
            </p>
          </div>
          <Button
            data-primary
            onClick={() => navigate('/renewals/intelligence')}
            className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            <Brain className="h-4 w-4" />
            Renewal intelligence
          </Button>
        </header>

        {/* Triage strip: open book segmented by what needs attention */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TriageTile
            label="Overdue"
            count={counts.overdue}
            sub="Act now"
            tone="danger"
            active={cohort === 'overdue'}
            onClick={() => toggleCohort('overdue')}
          />
          <TriageTile
            label="Due this week"
            count={counts.due_week}
            sub="Reach out"
            tone="warning"
            active={cohort === 'due_week'}
            onClick={() => toggleCohort('due_week')}
          />
          <TriageTile
            label="Quoted"
            count={counts.quoted}
            sub="Awaiting decision"
            tone="success"
            active={cohort === 'quoted'}
            onClick={() => toggleCohort('quoted')}
          />
        </div>

        {/* Filter row: search + carrier */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
            <Input
              placeholder="Search client or policy"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search renewals"
              className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised pl-9 text-cc-text-primary placeholder:text-cc-text-muted"
            />
          </div>

          <Select value={carrier} onValueChange={setCarrier}>
            <SelectTrigger
              aria-label="Filter by carrier"
              className="h-9 w-auto min-w-[160px] gap-2 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary"
            >
              <SelectValue placeholder="All carriers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All carriers</SelectItem>
              {carriers.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={scope} onValueChange={(v) => changeScope(v as Scope)}>
            <SelectTrigger
              aria-label="Filter by status"
              className="h-9 w-auto min-w-[150px] gap-2 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open renewals</SelectItem>
              <SelectItem value="closed">Closed renewals</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>

          {filtersActive && (
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-sm text-cc-text-secondary hover:text-cc-text-primary"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          <span className="ml-auto cc-num text-sm text-cc-text-muted">{rows.length} shown</span>
        </div>

        {/* Dense, uniform list */}
        <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
            <SectionLabel>Client</SectionLabel>
            <SectionLabel>Policy</SectionLabel>
            <SectionLabel>Carrier</SectionLabel>
            <SectionLabel>Status</SectionLabel>
            <SectionLabel>Renewal</SectionLabel>
            <SectionLabel>Last contact</SectionLabel>
          </div>

          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="max-w-sm text-sm text-cc-text-secondary">
                {filtersActive
                  ? 'No renewals match these filters. Clear them to see the whole book.'
                  : 'No renewals in the book yet. Upcoming policies sync in automatically.'}
              </p>
              {filtersActive && (
                <Button
                  variant="outline"
                  onClick={clearAll}
                  className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            rows.map((r) => {
              const carrierName = humanizeCarrier(r.carrier);
              const policySub = humanizeStatus(r.policy_type);
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openRenewal(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openRenewal(r.id);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-4 border-b border-cc-border-subtle px-4 py-3 transition-colors duration-fast last:border-b-0 hover:bg-cc-surface-raised',
                    'md:grid md:items-center',
                    COLS,
                  )}
                >
                  {/* Client (carries status + countdown inline on mobile) */}
                  <div className="min-w-0">
                    <div className="font-semibold text-cc-text-primary break-words">
                      {r.account?.name || 'Unknown client'}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                      <StatusPill
                        status={renewalPillStatus(r.status)}
                        override={r.status === 'renewed' ? { label: 'Renewed', tone: 'success' } : undefined}
                      />
                      <NextRenewal date={r.renewal_date} emptyLabel="No renewal date" />
                    </div>
                  </div>

                  {/* Policy: number never truncates; sub line is the policy type */}
                  <div className="hidden min-w-0 md:block">
                    <div className="cc-num whitespace-nowrap font-mono text-sm text-cc-text-secondary">
                      {r.policy_number || '--'}
                    </div>
                    {policySub && <div className="truncate text-xs text-cc-text-muted">{policySub}</div>}
                  </div>

                  {/* Carrier: name chip, never colored. "Not set" when null. */}
                  <div className="hidden md:block">
                    {carrierName ? <Chip>{carrierName}</Chip> : <span className="text-sm text-cc-text-muted">Not set</span>}
                  </div>

                  <div className="hidden md:block">
                    <StatusPill
                      status={renewalPillStatus(r.status)}
                      override={r.status === 'renewed' ? { label: 'Renewed', tone: 'success' } : undefined}
                    />
                  </div>

                  <div className="hidden md:block">
                    <NextRenewal date={r.renewal_date} emptyLabel="No renewal date" />
                  </div>

                  <div className="hidden md:block">
                    {isOpen(r) ? (
                      <LastContact date={r.last_contact_date} />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReopenTarget(r);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-cc-md border border-cc-border-interactive bg-transparent px-2.5 py-1.5 text-sm text-cc-text-primary transition-colors hover:bg-cc-surface-overlay"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reopen confirmation. Copy adapts: did-not-renew reactivates the policy; moved/renewed
            reopen the renewal only (their policy record was already changed by the outcome). */}
        <Dialog open={!!reopenTarget} onOpenChange={(o) => { if (!o) setReopenTarget(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reopen this renewal?</DialogTitle>
              <DialogDescription>
                {reopenTarget?.account?.name ? `${reopenTarget.account.name} — ` : ''}
                {reopenTarget && ['lost', 'cancelled', 'non_renewed', 'lapsed'].includes(reopenTarget.status)
                  ? `This renewal was marked ${humanizeStatus(reopenTarget.status)}. Reopening returns it to your working queue and reactivates the policy.`
                  : `This renewal was marked ${humanizeStatus(reopenTarget?.status || '')}. Reopening returns it to your working queue. The policy record was already updated by that outcome and will not be changed automatically.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReopenTarget(null)}
                className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                Cancel
              </Button>
              <Button
                data-primary
                disabled={reopen.isPending}
                onClick={() => {
                  if (!reopenTarget) return;
                  reopen.mutate({ renewalId: reopenTarget.id }, { onSuccess: () => setReopenTarget(null) });
                }}
                className="gap-2 rounded-cc-md bg-cc-accent text-cc-on-accent hover:bg-cc-accent-hover"
              >
                <RotateCcw className="h-4 w-4" />
                {reopen.isPending ? 'Reopening...' : 'Reopen renewal'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
