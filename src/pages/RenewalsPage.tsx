import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Repeat2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAoMigrationSearch } from '@/hooks/useAoMigrationSearch';
import { useAoMigrationCounts } from '@/hooks/useAoMigrationCounts';
import { StatusPill, Chip, SectionLabel, NextRenewal, LastContact, TriageTile, SkeletonRow } from '@/components/cc';
import { humanizeCarrier, humanizeStatus } from '@/lib/format';
import { cn } from '@/lib/utils';

// Cohorts are computed server-side; clicking a tile filters the rows to it.
// The Auto-Owners book moving off Auto-Owners to Nationwide and Progressive.
type Cohort = 'all' | 'not_started' | 'quote_out' | 'bound_elsewhere' | 'lapsing_week';

// Dense table column template (md+). Same fields, same order, every row:
// Client, current AO policy, target carrier, rewrite status, days to lapse, last contact.
const COLS = 'md:grid-cols-[minmax(0,1fr)_150px_130px_104px_120px_150px]';

export default function RenewalsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [cohort, setCohort] = useState<Cohort>('all');

  const { renewals, loading, loadingMore, hasMore, fetchRenewals, fetchNextPage } = useAoMigrationSearch();
  const { counts } = useAoMigrationCounts();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  // Single server-side fetch path for search + cohort. The hook loads the first
  // page on mount, so skip the first run here (a second concurrent fetch would
  // race it). Search is debounced; cohort changes refetch too.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchRenewals(searchQuery, 'renewal_asc', cohort), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, cohort]);

  const toggleCohort = (c: Cohort) => setCohort((cur) => (cur === c ? 'all' : c));
  const filtersActive = cohort !== 'all' || searchQuery.length > 0;
  const clearAll = () => {
    setCohort('all');
    setSearchQuery('');
  };

  const openRenewal = (id: string) => navigate(`/renewals/${id}/edit`);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">AO Migration</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              Auto-Owners book moving to Nationwide and Progressive.{' '}
              <span className="cc-num">{counts.total}</span> to rewrite.
            </p>
          </div>
          <Button
            data-primary
            onClick={() => navigate('/quotes/new')}
            className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            <Repeat2 className="h-4 w-4" />
            Start rewrite
          </Button>
        </header>

        {/* Triage strip: AO migration cohorts, counted server-side over the whole book */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Not started"
            count={counts.not_started}
            sub="Begin rewrite"
            tone="warning"
            active={cohort === 'not_started'}
            onClick={() => toggleCohort('not_started')}
          />
          <TriageTile
            label="Quote out"
            count={counts.quote_out}
            sub="Follow up"
            tone="info"
            active={cohort === 'quote_out'}
            onClick={() => toggleCohort('quote_out')}
          />
          <TriageTile
            label="Bound elsewhere"
            count={counts.bound_elsewhere}
            sub="Confirm moved"
            tone="success"
            active={cohort === 'bound_elsewhere'}
            onClick={() => toggleCohort('bound_elsewhere')}
          />
          <TriageTile
            label="Lapsing this week"
            count={counts.lapsing_week}
            sub="Act now"
            tone="danger"
            active={cohort === 'lapsing_week'}
            onClick={() => toggleCohort('lapsing_week')}
          />
        </div>

        {/* Filter row */}
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

          <span className="ml-auto cc-num text-sm text-cc-text-muted">
            {renewals.length}
            {hasMore ? '+' : ''} shown
          </span>
        </div>

        {/* Dense, uniform list */}
        <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
            <SectionLabel>Client</SectionLabel>
            <SectionLabel>Current AO policy</SectionLabel>
            <SectionLabel>Target carrier</SectionLabel>
            <SectionLabel>Rewrite status</SectionLabel>
            <SectionLabel>Days to lapse</SectionLabel>
            <SectionLabel>Last contact</SectionLabel>
          </div>

          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : renewals.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="max-w-sm text-sm text-cc-text-secondary">
                {filtersActive
                  ? 'No Auto-Owners renewals match these filters. Clear them to see the whole migration book.'
                  : 'The Auto-Owners migration book is clear. Nothing left to rewrite right now.'}
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
            renewals.map((r) => {
              const target = humanizeCarrier(r.moved_carrier || r.best_alternative_carrier || '');
              const policySub = humanizeStatus(r.policy_type) || humanizeCarrier(r.current_carrier);
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
                    <div className="font-semibold text-cc-text-primary break-words">{r.customer_name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                      <StatusPill status={r.status} />
                      <NextRenewal date={r.renewal_date} emptyLabel="No renewal date" />
                    </div>
                  </div>

                  {/* Current AO policy: number never truncates; sub line is type or carrier */}
                  <div className="hidden min-w-0 md:block">
                    <div className="cc-num whitespace-nowrap font-mono text-sm text-cc-text-secondary">{r.policy_number}</div>
                    {policySub && <div className="truncate text-xs text-cc-text-muted">{policySub}</div>}
                  </div>

                  {/* Target carrier: name chip, never colored. "Not set" when both null. */}
                  <div className="hidden md:block">
                    {target ? <Chip>{target}</Chip> : <span className="text-sm text-cc-text-muted">Not set</span>}
                  </div>

                  <div className="hidden md:block">
                    <StatusPill status={r.status} />
                  </div>

                  <div className="hidden md:block">
                    <NextRenewal date={r.renewal_date} emptyLabel="No renewal date" />
                  </div>

                  <div className="hidden md:block">
                    <LastContact date={r.last_contact_date} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasMore && !loading && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => fetchNextPage()}
              disabled={loadingMore}
              className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
            >
              {loadingMore ? 'Loading' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
