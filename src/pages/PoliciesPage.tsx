import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, MoreVertical, Download, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { AppLayout } from '@/components/layout/AppLayout';
import { AddPolicyModal } from '@/components/customers/AddPolicyModal';
import { ClientSelector } from '@/components/client/ClientSelector';
import { usePolicySearch } from '@/hooks/usePolicySearch';
import { usePolicyTriageCounts } from '@/hooks/usePolicyTriageCounts';
import { StatusPill, Chip, SectionLabel, NextRenewal, TriageTile, SkeletonRow } from '@/components/cc';
import { humanizeCarrier, humanizeLine } from '@/lib/format';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// Cohorts are computed server-side; clicking a tile filters the rows to it.
type Cohort = 'all' | 'expiring_30d' | 'lapsed' | 'no_renewal_date' | 'recently_bound';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

// Dense table column template (md+). Fixed order, same fields every row:
// Named insured | Policy # | Carrier | Line | Status | Premium | Renewal.
const COLS = 'md:grid-cols-[minmax(0,1fr)_140px_128px_120px_104px_96px_120px]';

export default function PoliciesPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [cohort, setCohort] = useState<Cohort>('all');
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);

  const { policies, loading, loadingMore, hasMore, fetchPolicies, fetchNextPage } = usePolicySearch();
  const { counts, refetch: refetchCounts } = usePolicyTriageCounts();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  // Single server-side fetch path for search + cohort. The hook loads the first
  // page on mount, so skip the first run here (a second concurrent fetch would
  // race it). Search is debounced exactly 250ms; cohort changes refetch too.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchPolicies(searchQuery, 'expiration_asc', cohort),
      250,
    );
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

  const handleRefresh = () => {
    fetchPolicies(searchQuery, 'expiration_asc', cohort);
    refetchCounts();
    toast({ title: 'Refreshed', description: 'Policy data has been refreshed' });
  };

  const handleExport = () => {
    toast({
      title: 'Export started',
      description: 'Policy data export will be available for download shortly',
    });
  };

  const handlePolicyAdded = () => {
    fetchPolicies(searchQuery, 'expiration_asc', cohort);
    refetchCounts();
  };

  const handleNewPolicy = () => {
    if (!selectedClient?.id) {
      toast({
        title: 'Select a client first',
        description: 'Pick a client below to attach the new policy to.',
      });
      return;
    }
    setAddPolicyOpen(true);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary (New Policy). Refresh/Export are ghost overflow. */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Policies</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              <span className="cc-num">{counts.total || policies.length}</span> in the book. Work the renewals that need you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More policy actions"
                  className="h-9 w-9 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-cc-lg">
                <DropdownMenuItem onClick={handleRefresh} className="gap-2 text-cc-text-secondary">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport} className="gap-2 text-cc-text-secondary">
                  <Download className="h-4 w-4" />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              data-primary
              onClick={handleNewPolicy}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <Plus className="h-4 w-4" />
              New policy
            </Button>
          </div>
        </header>

        {/* Triage strip: real policy cohorts, counted server-side over the whole book */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Expiring 30 days"
            count={counts.expiring_30d}
            sub="Renew now"
            tone="warning"
            active={cohort === 'expiring_30d'}
            onClick={() => toggleCohort('expiring_30d')}
          />
          <TriageTile
            label="Lapsed"
            count={counts.lapsed}
            sub="No longer active"
            tone="neutral"
            active={cohort === 'lapsed'}
            onClick={() => toggleCohort('lapsed')}
          />
          <TriageTile
            label="No renewal date"
            count={counts.no_renewal_date}
            sub="Needs a date"
            tone="neutral"
            active={cohort === 'no_renewal_date'}
            onClick={() => toggleCohort('no_renewal_date')}
          />
          <TriageTile
            label="Recently bound"
            count={counts.recently_bound}
            sub="Last 30 days"
            tone="info"
            active={cohort === 'recently_bound'}
            onClick={() => toggleCohort('recently_bound')}
          />
        </div>

        {/* Client selector (ghost control) so New Policy has an account to attach to */}
        <div className="flex flex-wrap items-center gap-3">
          <ClientSelector
            selectedClient={selectedClient}
            onSelect={setSelectedClient}
            placeholder="Select a client to attach a new policy"
            className="min-w-0 flex-1 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay sm:max-w-md"
          />
          <span className="text-sm text-cc-text-muted">
            {selectedClient?.id ? 'Client selected' : 'Select a client to enable New policy'}
          </span>
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
            <Input
              placeholder="Search policies"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search policies"
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
            {policies.length}
            {hasMore ? '+' : ''} shown
          </span>
        </div>

        {/* Dense, uniform table */}
        <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
          <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
            <SectionLabel>Named insured</SectionLabel>
            <SectionLabel>Policy #</SectionLabel>
            <SectionLabel>Carrier</SectionLabel>
            <SectionLabel>Line</SectionLabel>
            <SectionLabel>Status</SectionLabel>
            <SectionLabel className="text-right">Premium</SectionLabel>
            <SectionLabel>Renewal</SectionLabel>
          </div>

          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : policies.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="max-w-sm text-sm text-cc-text-secondary">
                {filtersActive
                  ? 'No policies match these filters. Clear them to see the full book.'
                  : 'No policies yet. Select a client above, then add the first policy to start the book.'}
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
            policies.map((policy) => (
              <div
                key={policy.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/policies/${policy.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/policies/${policy.id}`);
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-4 border-b border-cc-border-subtle px-4 py-3 transition-colors duration-fast last:border-b-0 hover:bg-cc-surface-raised',
                  'md:grid md:items-center',
                  COLS,
                )}
              >
                {/* Named insured (carries policy #, status, premium inline on mobile) */}
                <div className="min-w-0">
                  <div className="font-semibold text-cc-text-primary break-words">
                    {policy.named_insured || 'Unnamed policy'}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                    <span className="cc-num whitespace-nowrap font-mono text-xs text-cc-text-secondary">
                      {policy.policy_number}
                    </span>
                    <StatusPill status={policy.status} />
                  </div>
                </div>

                <div className="hidden md:block">
                  <span className="cc-num whitespace-nowrap font-mono text-sm text-cc-text-secondary">
                    {policy.policy_number}
                  </span>
                </div>

                <div className="hidden md:block">
                  <Chip>{humanizeCarrier(policy.carrier)}</Chip>
                </div>

                <div className="hidden text-sm text-cc-text-secondary md:block">
                  {humanizeLine(policy.line)}
                </div>

                <div className="hidden md:block">
                  <StatusPill status={policy.status} />
                </div>

                <div className="cc-num hidden whitespace-nowrap text-right text-sm font-semibold text-cc-text-primary md:block">
                  {usd.format(Number(policy.premium) || 0)}
                </div>

                <div className="hidden md:block">
                  <NextRenewal date={policy.expiration_date} />
                </div>
              </div>
            ))
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

      <AddPolicyModal
        open={addPolicyOpen}
        onOpenChange={setAddPolicyOpen}
        accountId={selectedClient?.id || ''}
        onSuccess={handlePolicyAdded}
      />
    </AppLayout>
  );
}
