import { useState, useEffect, useRef, useCallback } from 'react';
import { useChromeAction } from '@/components/layout/chrome/chromeActions';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { useUnifiedCustomers } from '@/hooks/useUnifiedCustomers';
import { useCustomerTriageCounts } from '@/hooks/useCustomerTriageCounts';
import { useTags } from '@/hooks/useTags';
import { StatusPill, Chip, SectionLabel, NextRenewal, TriageTile, SkeletonRow } from '@/components/cc';
import { humanizeAccountType } from '@/lib/format';
import { cn } from '@/lib/utils';

// Cohorts are computed server-side; clicking a tile filters the rows to it.
type Cohort = 'all' | 'renewals_30d' | 'overdue' | 'no_active_policy' | 'new_30d';
type TypeFilter = 'all' | 'household' | 'business';

// Dense table column template (md+). Renewal replaces the structurally-null
// balance/last-contact columns; the real signal in this book is policy renewal.
// The Policies column is right-aligned and wide enough that its tracked label
// never runs flush into the Renewal column header (was 72px -> collided).
const COLS = 'md:grid-cols-[minmax(0,1fr)_104px_120px_104px_150px_44px]';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [cohort, setCohort] = useState<Cohort>('all');

  // Global chrome (header "New customer" / Cmd-K) opens the add-customer modal here.
  useChromeAction('new-customer', useCallback(() => setAddCustomerOpen(true), []));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { customers, loading, loadingMore, hasMore, fetchCustomers, fetchNextPage } = useUnifiedCustomers();
  const { counts } = useCustomerTriageCounts();
  const { seedDefaultTags } = useTags();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  // 'business' maps to the real account type value; search, cohort and type are
  // all applied server-side so paging stays correct.
  const serverType =
    typeFilter === 'household' ? 'household' : typeFilter === 'business' ? 'commercial_business' : undefined;

  const handleCustomerAdded = () => fetchCustomers(searchQuery, 'updated_at_desc', cohort, serverType);

  // Single server-side fetch path for search + cohort + type. The hook loads the
  // first page on mount, so skip the first run here (a second concurrent fetch
  // would race it). Search is debounced; cohort/type changes refetch too.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchCustomers(searchQuery, 'updated_at_desc', cohort, serverType),
      250,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, cohort, typeFilter]);

  const toggleCohort = (c: Cohort) => setCohort((cur) => (cur === c ? 'all' : c));
  const filtersActive = cohort !== 'all' || typeFilter !== 'all' || searchQuery.length > 0;
  const clearAll = () => {
    setCohort('all');
    setTypeFilter('all');
    setSearchQuery('');
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Customers</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              <span className="cc-num">{counts.total || customers.length}</span> in the book. Work the ones that need you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => seedDefaultTags()}
              className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
            >
              <Tag className="h-4 w-4" />
              Setup tags
            </Button>
            <Button
              data-primary
              onClick={() => setAddCustomerOpen(true)}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <UserPlus className="h-4 w-4" />
              Add customer
            </Button>
          </div>
        </header>

        {/* Triage strip: real renewal/policy cohorts, counted server-side */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Renewals 30 days"
            count={counts.renewals_30d}
            sub="Renew now"
            tone="warning"
            active={cohort === 'renewals_30d'}
            onClick={() => toggleCohort('renewals_30d')}
          />
          <TriageTile
            label="Overdue renewals"
            count={counts.overdue}
            sub="Lapsed, act"
            tone={counts.overdue > 0 ? 'danger' : 'neutral'}
            active={cohort === 'overdue'}
            onClick={() => toggleCohort('overdue')}
          />
          <TriageTile
            label="No active policy"
            count={counts.no_active_policy}
            sub="Cross sell"
            tone="neutral"
            active={cohort === 'no_active_policy'}
            onClick={() => toggleCohort('no_active_policy')}
          />
          <TriageTile
            label="New this 30 days"
            count={counts.new_30d}
            sub="Onboard"
            tone="info"
            active={cohort === 'new_30d'}
            onClick={() => toggleCohort('new_30d')}
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
            <Input
              placeholder="Search customers"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search customers"
              className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised pl-9 text-cc-text-primary placeholder:text-cc-text-muted"
            />
          </div>

          <div role="group" aria-label="Filter by type" className="inline-flex rounded-cc-md bg-cc-surface-raised p-0.5">
            {(['all', 'household', 'business'] as TypeFilter[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                aria-pressed={typeFilter === t}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-sm capitalize transition-colors duration-fast',
                  typeFilter === t
                    ? 'bg-cc-surface-overlay text-cc-text-primary'
                    : 'text-cc-text-muted hover:text-cc-text-secondary',
                )}
              >
                {t === 'all' ? 'All' : t === 'household' ? 'Personal' : 'Commercial'}
              </button>
            ))}
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
            {customers.length}
            {hasMore ? '+' : ''} shown
          </span>
        </div>

        {/* Dense, uniform list */}
        <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
            <SectionLabel>Customer</SectionLabel>
            <SectionLabel>Type</SectionLabel>
            <SectionLabel>Status</SectionLabel>
            <SectionLabel className="text-right">Policies</SectionLabel>
            <SectionLabel>Renewal</SectionLabel>
            <span className="sr-only">Actions</span>
          </div>

          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="max-w-sm text-sm text-cc-text-secondary">
                {filtersActive
                  ? 'No customers match these filters. Clear them to see the full book.'
                  : 'No customers yet. Add your first customer to start working the book.'}
              </p>
              {filtersActive ? (
                <Button
                  variant="outline"
                  onClick={clearAll}
                  className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setAddCustomerOpen(true)}
                  className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  <UserPlus className="h-4 w-4" />
                  Add customer
                </Button>
              )}
            </div>
          ) : (
            customers.map((customer) => {
              const name = customer.display_name || customer.name;
              const secondary =
                customer.email ||
                customer.primary_email ||
                [customer.city, customer.state].filter(Boolean).join(', ');
              return (
                <div
                  key={customer.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/customers/${customer.id}`);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-4 border-b border-cc-border-subtle px-4 py-3 transition-colors duration-fast last:border-b-0 hover:bg-cc-surface-raised',
                    'md:grid md:items-center',
                    COLS,
                  )}
                >
                  {/* Customer (carries status inline on mobile) */}
                  <div className="min-w-0">
                    <div className="font-semibold text-cc-text-primary break-words">{name}</div>
                    {secondary && <div className="truncate text-xs text-cc-text-muted">{secondary}</div>}
                    <div className="mt-1.5 md:hidden">
                      <StatusPill status={customer.status} />
                    </div>
                  </div>

                  <div className="hidden md:block">
                    <Chip>{humanizeAccountType(customer.type)}</Chip>
                  </div>

                  <div className="hidden md:block">
                    <StatusPill status={customer.status} />
                  </div>

                  <div className="cc-num hidden text-right text-sm text-cc-text-secondary md:block">
                    {customer.policies_count ?? 0}
                  </div>

                  <div className="hidden md:block">
                    <NextRenewal date={customer.next_expiration_at} />
                  </div>

                  <div
                    className="flex shrink-0 justify-end"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <ActionMenu account={{ id: customer.id, name }} />
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

      <AddCustomerModal open={addCustomerOpen} onOpenChange={setAddCustomerOpen} onSuccess={handleCustomerAdded} />
    </AppLayout>
  );
}
