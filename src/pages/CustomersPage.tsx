import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/layout/AppLayout';
import { ActionMenu } from '@/components/customers/ActionMenu';
import { AddCustomerModal } from '@/components/customers/AddCustomerModal';
import { useUnifiedCustomers, type UnifiedCustomer } from '@/hooks/useUnifiedCustomers';
import { useTags } from '@/hooks/useTags';
import { StatusPill, Chip, SectionLabel, LastContact, TriageTile, SkeletonRow } from '@/components/cc';
import { differenceInCalendarDays } from 'date-fns';
import { cn } from '@/lib/utils';

type Segment = 'all' | 'leads' | 'stale' | 'balance' | 'active';
type TypeFilter = 'all' | 'household' | 'business';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const isLead = (s?: string) => /lead|prospect|^new$|qualif|nurtur/i.test(s ?? '');
const isActive = (s?: string) => /active|customer|client/i.test(s ?? '');
const isBusiness = (t?: string) => /business|commercial|organization|org/i.test(t ?? '');
const isStale = (c: UnifiedCustomer) =>
  !c.last_contact_at || differenceInCalendarDays(new Date(), new Date(c.last_contact_at)) > 30;
const hasBalance = (c: UnifiedCustomer) => (c.balance ?? 0) > 0;

// Dense table column template, shared by header and every row so no row is sparse.
// Gated to md+ so the row collapses to a compact two-part layout on narrow screens.
const COLS = 'md:grid-cols-[minmax(0,1fr)_104px_120px_72px_110px_150px_44px]';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [segment, setSegment] = useState<Segment>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const { customers, loading, fetchCustomers } = useUnifiedCustomers();
  const { seedDefaultTags } = useTags();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  const handleCustomerAdded = () => fetchCustomers(searchQuery);

  // Debounced server-side search. The hook already loads the book on mount, so
  // skip the first run here. Firing on mount too would launch a second
  // concurrent full-book fetch that races the hook's and trips a statement
  // timeout over the REST API (data loads from one, the other throws a toast).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(searchQuery), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  // Counts route the triage strip; computed from the full returned set.
  const counts = useMemo(
    () => ({
      leads: customers.filter((c) => isLead(c.status)).length,
      stale: customers.filter(isStale).length,
      balance: customers.filter(hasBalance).length,
      active: customers.filter((c) => isActive(c.status)).length,
    }),
    [customers],
  );

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (typeFilter === 'business' && !isBusiness(c.type)) return false;
      if (typeFilter === 'household' && isBusiness(c.type)) return false;
      if (segment === 'leads' && !isLead(c.status)) return false;
      if (segment === 'stale' && !isStale(c)) return false;
      if (segment === 'balance' && !hasBalance(c)) return false;
      if (segment === 'active' && !isActive(c.status)) return false;
      return true;
    });
  }, [customers, segment, typeFilter]);

  const toggleSegment = (s: Segment) => setSegment((cur) => (cur === s ? 'all' : s));
  const filtersActive = segment !== 'all' || typeFilter !== 'all' || searchQuery.length > 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Customers</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              <span className="cc-num">{customers.length}</span> in the book. Work the ones that need you.
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

        {/* Triage strip: at most four tiles, each routes into work */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Leads to work"
            count={counts.leads}
            sub="Pending follow up"
            tone="warning"
            active={segment === 'leads'}
            onClick={() => toggleSegment('leads')}
          />
          <TriageTile
            label="No contact 30+ days"
            count={counts.stale}
            sub="Reach out"
            tone={counts.stale > 0 ? 'danger' : 'neutral'}
            active={segment === 'stale'}
            onClick={() => toggleSegment('stale')}
          />
          <TriageTile
            label="Open balance"
            count={counts.balance}
            sub="Collect"
            tone={counts.balance > 0 ? 'warning' : 'neutral'}
            active={segment === 'balance'}
            onClick={() => toggleSegment('balance')}
          />
          <TriageTile
            label="Active book"
            count={counts.active}
            sub="In force"
            tone="success"
            active={segment === 'active'}
            onClick={() => toggleSegment('active')}
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

          {/* Type segmented control */}
          <div
            role="group"
            aria-label="Filter by type"
            className="inline-flex rounded-cc-md bg-cc-surface-raised p-0.5"
          >
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
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>

          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSegment('all');
                setTypeFilter('all');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 text-sm text-cc-text-secondary hover:text-cc-text-primary"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          <span className="ml-auto cc-num text-sm text-cc-text-muted">
            {filtered.length} shown
          </span>
        </div>

        {/* Dense, uniform list */}
        <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          {/* Column header */}
          <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
            <SectionLabel>Customer</SectionLabel>
            <SectionLabel>Type</SectionLabel>
            <SectionLabel>Status</SectionLabel>
            <SectionLabel className="text-right">Policies</SectionLabel>
            <SectionLabel className="text-right">Balance</SectionLabel>
            <SectionLabel>Last contact</SectionLabel>
            <span className="sr-only">Actions</span>
          </div>

          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="max-w-sm text-sm text-cc-text-secondary">
                {filtersActive
                  ? 'No customers match these filters. Clear them to see the full book.'
                  : 'No customers yet. Add your first customer to start working the book.'}
              </p>
              {filtersActive ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSegment('all');
                    setTypeFilter('all');
                    setSearchQuery('');
                  }}
                  className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  Clear filters
                </Button>
              ) : (
                // Ghost, not lime: the header already carries the one lime primary (Rule 9).
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
            filtered.map((customer) => {
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
                    {secondary && (
                      <div className="truncate text-xs text-cc-text-muted">{secondary}</div>
                    )}
                    <div className="mt-1.5 md:hidden">
                      <StatusPill status={customer.status} />
                    </div>
                  </div>

                  {/* Type */}
                  <div className="hidden md:block">
                    <Chip>{isBusiness(customer.type) ? 'Business' : 'Household'}</Chip>
                  </div>

                  {/* Status */}
                  <div className="hidden md:block">
                    <StatusPill status={customer.status} />
                  </div>

                  {/* Policies */}
                  <div className="cc-num hidden text-right text-sm text-cc-text-secondary md:block">
                    {customer.policies_count ?? 0}
                  </div>

                  {/* Balance (money never truncates) */}
                  <div
                    className="cc-num hidden text-right text-sm md:block"
                    style={{ color: hasBalance(customer) ? 'var(--cc-warning)' : 'var(--cc-text-muted)' }}
                  >
                    {usd.format(customer.balance ?? 0)}
                  </div>

                  {/* Last contact */}
                  <div className="hidden text-sm md:block">
                    <LastContact date={customer.last_contact_at} />
                  </div>

                  {/* Per-row overflow */}
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
      </div>

      <AddCustomerModal
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        onSuccess={handleCustomerAdded}
      />
    </AppLayout>
  );
}
