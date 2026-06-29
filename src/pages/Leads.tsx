import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, X, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/layout/AppLayout';
import { QuickLeadCapture } from '@/components/leads/QuickLeadCapture';
import { PipelineKanban } from '@/components/leads/PipelineKanban';
import { TeamPipelineView } from '@/components/leads/TeamPipelineView';
import { TimelineView } from '@/components/leads/TimelineView';
import { LeadAnalyticsDashboard } from '@/components/leads/analytics/LeadAnalyticsDashboard';
import { ProducerSalesDashboard } from '@/components/leads/ProducerSalesDashboard';
import { useLeadSearch } from '@/hooks/useLeadSearch';
import { useLeadTriageCounts } from '@/hooks/useLeadTriageCounts';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { StatusPill, Chip, SectionLabel, LastContact, TriageTile, SkeletonRow } from '@/components/cc';
import { humanizeEnum } from '@/lib/format';
import { cn } from '@/lib/utils';

// Cohorts are computed server-side; clicking a tile filters the rows to it.
// 'hot' is lead_score >= 70 (see useLeadTriageCounts).
type Cohort = 'all' | 'new' | 'hot' | 'qualified' | 'quoted';

// The secondary views are preserved unchanged behind a single segmented control.
// 'list' is the Calm Command Index list and the default.
type View = 'list' | 'pipeline' | 'team' | 'timeline' | 'analytics' | 'producer';

const VIEWS: { value: View; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'team', label: 'Team' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'producer', label: 'My dashboard' },
];

// Dense table column template (md+): Name | Contact | Insurance | Status | Score | Last contact.
// Score is right-aligned tabular; Last contact is wide enough for the banded recency value.
const COLS = 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_150px_120px_64px_160px]';

// Score tint by weight/number only, never a colored badge fill.
function scoreColor(score: number | null): string {
  const s = score ?? 0;
  if (s >= 70) return 'var(--cc-success)';
  if (s >= 40) return 'var(--cc-text-secondary)';
  return 'var(--cc-text-muted)';
}

export default function Leads() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [view, setView] = useState<View>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [cohort, setCohort] = useState<Cohort>('all');

  const { leads, loading, loadingMore, hasMore, fetchLeads, fetchNextPage } = useLeadSearch();
  const { counts } = useLeadTriageCounts();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  // Filters for the preserved secondary views (unchanged contract).
  const debouncedSearch = useDebounce(searchQuery, 500);
  const secondaryFilters = {
    search: debouncedSearch || undefined,
    status: cohort !== 'all' && cohort !== 'hot' ? [cohort] : undefined,
  };

  // Single server-side fetch path for search + cohort. The hook loads the first
  // page on mount, so skip the first run here (a second concurrent fetch would
  // race it). Search is debounced; cohort changes refetch too.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLeads(searchQuery, 'score_desc', cohort), 250);
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

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary (the QuickLeadCapture trigger) */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Leads</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              <span className="cc-num">{counts.total || leads.length}</span> in the pipeline. Work the ones
              that need you.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/leads/analytics">
              <Button
                variant="outline"
                className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
              >
                <TrendingUp className="h-4 w-4" />
                Advanced analytics
              </Button>
            </Link>
            {/* QuickLeadCapture renders its own lime default Button trigger: the single primary. */}
            <QuickLeadCapture />
          </div>
        </header>

        {/* Triage strip: server-counted lead cohorts that route into work */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="New leads"
            count={counts.new_leads}
            sub="Reach out"
            tone="warning"
            active={cohort === 'new'}
            onClick={() => toggleCohort('new')}
          />
          <TriageTile
            label="Hot leads"
            count={counts.hot}
            sub="Call now"
            tone={counts.hot > 0 ? 'danger' : 'neutral'}
            active={cohort === 'hot'}
            onClick={() => toggleCohort('hot')}
          />
          <TriageTile
            label="Qualified"
            count={counts.qualified}
            sub="Quote them"
            tone="info"
            active={cohort === 'qualified'}
            onClick={() => toggleCohort('qualified')}
          />
          <TriageTile
            label="Quoted"
            count={counts.quoted}
            sub="Follow up"
            tone="success"
            active={cohort === 'quoted'}
            onClick={() => toggleCohort('quoted')}
          />
        </div>

        {/* View switch: List is the Calm Command index; the rest are preserved views */}
        <div role="group" aria-label="Switch view" className="inline-flex flex-wrap rounded-cc-md bg-cc-surface-raised p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              aria-pressed={view === v.value}
              className={cn(
                'rounded-[10px] px-3 py-1.5 text-sm transition-colors duration-fast',
                view === v.value
                  ? 'bg-cc-surface-overlay text-cc-text-primary'
                  : 'text-cc-text-muted hover:text-cc-text-secondary',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === 'list' ? (
          <>
            {/* Filter row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
                <Input
                  placeholder="Search leads"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search leads"
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
                {leads.length}
                {hasMore ? '+' : ''} shown
              </span>
            </div>

            {/* Dense, uniform list */}
            <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
              <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
                <SectionLabel>Name</SectionLabel>
                <SectionLabel>Contact</SectionLabel>
                <SectionLabel>Insurance</SectionLabel>
                <SectionLabel>Status</SectionLabel>
                <SectionLabel className="text-right">Score</SectionLabel>
                <SectionLabel>Last contact</SectionLabel>
              </div>

              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : leads.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <p className="max-w-sm text-sm text-cc-text-secondary">
                    {filtersActive
                      ? 'No leads match these filters. Clear them to see the whole pipeline.'
                      : 'No leads yet. Add your first lead to start working the pipeline.'}
                  </p>
                  {/* No second lime here: the header "Add lead" is the surface's single
                      lime primary (Rule 9). When filtered, offer a ghost Clear. */}
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
                leads.map((lead) => {
                  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
                  const name = fullName || lead.company_name || 'Unnamed lead';
                  const showCompanySub = !!lead.company_name && !!fullName;
                  const contact = lead.email || lead.phone || '';
                  const types = lead.insurance_types ?? [];
                  return (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/leads/${lead.id}`);
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer flex-col gap-2 border-b border-cc-border-subtle px-4 py-3 transition-colors duration-fast last:border-b-0 hover:bg-cc-surface-raised',
                        'md:grid md:items-center md:gap-4',
                        COLS,
                      )}
                    >
                      {/* Name (carries status + score inline on mobile) */}
                      <div className="min-w-0">
                        <div className="font-semibold text-cc-text-primary break-words">{name}</div>
                        {showCompanySub && (
                          <div className="truncate text-xs text-cc-text-muted">{lead.company_name}</div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 md:hidden">
                          <StatusPill status={lead.status} />
                          <span className="cc-num text-sm font-semibold" style={{ color: scoreColor(lead.lead_score) }}>
                            {lead.lead_score ?? 0}
                          </span>
                        </div>
                      </div>

                      {/* Contact */}
                      <div className="truncate text-sm text-cc-text-muted">{contact || 'No contact info'}</div>

                      {/* Insurance: up to 2 neutral chips + overflow */}
                      <div className="hidden flex-wrap gap-1.5 md:flex">
                        {types.slice(0, 2).map((t) => (
                          <Chip key={t}>{humanizeEnum(t)}</Chip>
                        ))}
                        {types.length > 2 && <Chip>{`+${types.length - 2}`}</Chip>}
                      </div>

                      <div className="hidden md:block">
                        <StatusPill status={lead.status} />
                      </div>

                      <div
                        className="cc-num hidden text-right text-sm font-semibold md:block"
                        style={{ color: scoreColor(lead.lead_score) }}
                      >
                        {lead.lead_score ?? 0}
                      </div>

                      <div className="hidden md:block">
                        <LastContact date={lead.last_contact_at} />
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
          </>
        ) : view === 'pipeline' ? (
          <PipelineKanban filters={secondaryFilters} />
        ) : view === 'team' ? (
          <TeamPipelineView />
        ) : view === 'timeline' ? (
          <TimelineView />
        ) : view === 'analytics' ? (
          <LeadAnalyticsDashboard filters={secondaryFilters} />
        ) : (
          <ProducerSalesDashboard
            producerId={user?.id || ''}
            producerName={user?.user_metadata?.full_name || 'Your Name'}
            filters={secondaryFilters}
          />
        )}
      </div>
    </AppLayout>
  );
}
