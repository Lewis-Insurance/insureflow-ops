import { useState, useEffect, useRef, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusPill, Chip, SectionLabel, SkeletonRow, TriageTile } from '@/components/cc';
import { UserPlus, Search, X, MoreVertical, Pencil, GitMerge, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { formatLocalDateDisplay } from '@/lib/date/localDate';
import {
  useAdditionalInsuredsList,
  mergeAdditionalInsuredsManual,
  useAdditionalInsuredSearch,
  type AdditionalInsuredListRow,
  type AdditionalInsuredSearchResult,
} from '@/hooks/useAdditionalInsureds';
import {
  AdditionalInsuredDrawer,
  type AdditionalInsuredEditRow,
} from '@/components/additional-insureds/AdditionalInsuredDrawer';
import { AdditionalInsuredDuplicatesView } from '@/components/additional-insureds/AdditionalInsuredDuplicatesView';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

/**
 * Additional Insureds directory. Index/List archetype (per CustomersPage): a
 * single lime primary that opens the add drawer, a 3-tile triage strip driven by
 * count_additional_insured_cohorts, a debounced search + kind filter row, and a
 * dense uniform table with a per-row overflow menu (Edit / Merge into another /
 * Remove). When the "Possible duplicates" tile is active the table region is
 * swapped for the dedup review view (not a separate route).
 */

// Cohort keys map to the triage tiles; clicking a tile filters the rows to it.
type Cohort = 'all' | 'duplicates' | 'missing_address' | 'never_used';
type KindFilter = 'all' | 'business' | 'individual' | 'government' | 'lender' | 'other';

const KIND_LABEL: Record<string, string> = {
  business: 'Business',
  individual: 'Individual',
  government: 'Government',
  lender: 'Lender',
  other: 'Other',
};

function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? (kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : 'Business');
}

// Dense table column template (md+): Name / Kind / Location / Contact / Used / Flags / actions.
const COLS = 'md:grid-cols-[minmax(0,1fr)_110px_150px_150px_120px_140px_44px]';

export default function AdditionalInsuredsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [cohort, setCohort] = useState<Cohort>('all');

  // The cohort passed to the list RPC: 'duplicates' swaps the whole table region
  // for the review view, so it is never sent as a row filter.
  const listCohort = cohort === 'all' || cohort === 'duplicates' ? null : cohort;

  const { rows, cohorts, loading, refetch } = useAdditionalInsuredsList({
    q: debouncedQuery || null,
    kind: kindFilter === 'all' ? null : kindFilter,
    cohort: listCohort,
  });

  // Drawer state: null initial = create, a row = edit.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editRow, setEditRow] = useState<AdditionalInsuredEditRow | null>(null);

  // Per-row merge-into-another target picker.
  const [mergeSource, setMergeSource] = useState<AdditionalInsuredListRow | null>(null);

  // Soft-delete confirm.
  const [removeTarget, setRemoveTarget] = useState<AdditionalInsuredListRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const toggleCohort = (c: Cohort) => setCohort((cur) => (cur === c ? 'all' : c));
  const filtersActive = cohort !== 'all' || kindFilter !== 'all' || searchQuery.length > 0;
  const clearAll = () => {
    setCohort('all');
    setKindFilter('all');
    setSearchQuery('');
  };

  const openCreate = () => {
    setEditRow(null);
    setDrawerOpen(true);
  };

  const openEdit = (row: AdditionalInsuredListRow) => {
    setEditRow({
      id: row.additional_insured_id,
      name: row.name,
      kind: row.kind,
      address_line1: row.address_line1,
      city: row.city,
      state: row.state,
      zip_code: row.zip_code,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
    });
    setDrawerOpen(true);
  };

  const requestRemove = (row: AdditionalInsuredListRow) => {
    if ((row.usage_count ?? 0) > 0) {
      toast({
        title: 'In use, cannot remove',
        description: 'This record is on active certificates. Merge it into another record instead.',
        variant: 'destructive',
      });
      return;
    }
    setRemoveTarget(row);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const { error } = await supabase
      .from('additional_insureds' as never)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', removeTarget.additional_insured_id);
    setRemoving(false);
    setRemoveTarget(null);
    if (error) {
      logger.error('additional insured remove error', error);
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Record removed' });
    refetch();
  };

  const duplicatesActive = cohort === 'duplicates';

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">
              Additional insureds
            </h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              Certificate holders and additional insureds shared across every customer.
            </p>
          </div>
          <Button
            data-primary
            onClick={openCreate}
            className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            <UserPlus className="h-4 w-4" />
            Add additional insured
          </Button>
        </header>

        {/* Triage strip: three cohorts, counted server-side */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Possible duplicates"
            count={cohorts.pending_duplicate_groups}
            sub="Review and merge"
            tone="warning"
            active={cohort === 'duplicates'}
            onClick={() => toggleCohort('duplicates')}
          />
          <TriageTile
            label="Missing address"
            count={cohorts.missing_address}
            sub="Cannot print on a COI"
            tone="neutral"
            active={cohort === 'missing_address'}
            onClick={() => toggleCohort('missing_address')}
          />
          <TriageTile
            label="Never used"
            count={cohorts.never_used}
            sub="No certificates yet"
            tone="neutral"
            active={cohort === 'never_used'}
            onClick={() => toggleCohort('never_used')}
          />
        </div>

        {duplicatesActive ? (
          <AdditionalInsuredDuplicatesView onChanged={refetch} />
        ) : (
          <>
            {/* Filter row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
                <Input
                  placeholder="Search additional insureds"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search additional insureds"
                  className="h-9 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised pl-9 text-cc-text-primary placeholder:text-cc-text-muted"
                />
              </div>

              <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
                <SelectTrigger
                  aria-label="Filter by kind"
                  className="h-9 w-[150px] rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-cc-text-primary"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                  <SelectItem value="government">Government</SelectItem>
                  <SelectItem value="lender">Lender</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
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
                <SectionLabel>Name</SectionLabel>
                <SectionLabel>Kind</SectionLabel>
                <SectionLabel>Location</SectionLabel>
                <SectionLabel>Contact</SectionLabel>
                <SectionLabel className="text-right">Used</SectionLabel>
                <SectionLabel>Flags</SectionLabel>
                <span className="sr-only">Actions</span>
              </div>

              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <p className="max-w-sm text-sm text-cc-text-secondary">
                    {filtersActive
                      ? 'No additional insureds match these filters. Clear them to see the full book.'
                      : 'No additional insureds yet. Add your first shared certificate holder.'}
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
                      onClick={openCreate}
                      className="gap-2 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                    >
                      <UserPlus className="h-4 w-4" />
                      Add additional insured
                    </Button>
                  )}
                </div>
              ) : (
                rows.map((row) => {
                  const location = [row.city, row.state].filter(Boolean).join(', ');
                  const contact = row.email || row.phone || '';
                  const noAddress = !row.address_line1 || !row.address_line1.trim();
                  return (
                    <div
                      key={row.additional_insured_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEdit(row);
                        }
                      }}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-4 border-b border-cc-border-subtle px-4 py-3 transition-colors duration-fast last:border-b-0 hover:bg-cc-surface-raised',
                        'md:grid md:items-center',
                        COLS,
                      )}
                    >
                      {/* Name (no truncation) + inline flags on mobile */}
                      <div className="min-w-0">
                        <div className="font-semibold text-cc-text-primary break-words">{row.name}</div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 md:hidden">
                          <Chip>{kindLabel(row.kind)}</Chip>
                          {row.has_pending_duplicate && (
                            <StatusPill override={{ label: 'Possible duplicate', tone: 'warning' }} />
                          )}
                          {noAddress && <StatusPill override={{ label: 'No address', tone: 'neutral' }} />}
                        </div>
                      </div>

                      <div className="hidden md:block">
                        <Chip>{kindLabel(row.kind)}</Chip>
                      </div>

                      <div className="hidden text-sm text-cc-text-secondary md:block">
                        {location || <span className="text-cc-text-faint">Not set</span>}
                      </div>

                      <div className="hidden truncate text-sm text-cc-text-muted md:block">
                        {contact ? (
                          <span className={cn(row.email ? '' : 'cc-num')}>{contact}</span>
                        ) : (
                          <span className="text-cc-text-faint">Not set</span>
                        )}
                      </div>

                      <div className="hidden text-right text-sm text-cc-text-secondary md:block">
                        <span className="cc-num">{row.usage_count}</span>
                        <div className="text-xs text-cc-text-muted">
                          {row.usage_count === 0
                            ? 'Never'
                            : row.last_used_at
                              ? formatLocalDateDisplay(row.last_used_at)
                              : 'Used'}
                        </div>
                      </div>

                      <div className="hidden flex-wrap gap-1.5 md:flex">
                        {row.has_pending_duplicate && (
                          <StatusPill override={{ label: 'Possible duplicate', tone: 'warning' }} />
                        )}
                        {noAddress && <StatusPill override={{ label: 'No address', tone: 'neutral' }} />}
                      </div>

                      {/* Per-row overflow */}
                      <div
                        className="flex shrink-0 justify-end"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              aria-label={`Actions for ${row.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-56 border-cc-border-strong bg-cc-surface-overlay"
                          >
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setMergeSource(row)}>
                              <GitMerge className="mr-2 h-4 w-4" />
                              Merge into another
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => requestRemove(row)}
                              className="text-cc-danger focus:text-cc-danger"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* Add / edit drawer */}
      <AdditionalInsuredDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        initial={editRow}
        onSaved={() => {
          setDrawerOpen(false);
          refetch();
        }}
      />

      {/* Per-row merge-into-another target picker */}
      <MergeIntoAnotherSheet
        source={mergeSource}
        onOpenChange={(o) => !o && setMergeSource(null)}
        onMerged={() => {
          setMergeSource(null);
          refetch();
        }}
      />

      {/* Soft-delete confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent className="rounded-cc-xl border-cc-border-subtle bg-cc-surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-cc-text-primary">
              Remove {removeTarget?.name ?? 'this record'}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-cc-text-muted">
              This soft-deletes the additional insured. It is not on any certificate, so nothing else changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRemove();
              }}
              disabled={removing}
              className="rounded-cc-md font-semibold"
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

/**
 * A small target picker for the per-row "Merge into another" action. Searches the
 * live book (excluding the source), then merges the source INTO the chosen target
 * via mergeAdditionalInsuredsManual (source is the loser). Kept in-page: the
 * queue-driven review flow lives in AdditionalInsuredDuplicatesView.
 */
function MergeIntoAnotherSheet({
  source,
  onOpenChange,
  onMerged,
}: {
  source: AdditionalInsuredListRow | null;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}) {
  const open = !!source;
  const { results, loading, search, clear } = useAdditionalInsuredSearch();
  const [query, setQuery] = useState('');
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      clear();
    }
  }, [open, clear]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      if (query.trim().length >= 2) search(query);
      else clear();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, search, clear]);

  const handleMerge = useCallback(
    async (target: AdditionalInsuredSearchResult) => {
      if (!source) return;
      setMerging(target.additional_insured_id);
      // The survivor is the chosen target; the source row is the single loser.
      const ok = await mergeAdditionalInsuredsManual(target.additional_insured_id, [
        source.additional_insured_id,
      ]);
      setMerging(null);
      if (ok) onMerged();
    },
    [source, onMerged],
  );

  const visibleResults = results.filter(
    (r) => r.additional_insured_id !== source?.additional_insured_id,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[480px]">
        <div className="flex h-full flex-col">
          <SheetHeader className="space-y-1 border-b border-cc-border-subtle p-6 text-left">
            <SheetTitle className="flex items-center gap-2 text-cc-text-primary">
              <GitMerge className="h-4 w-4 text-cc-accent" />
              Merge into another record
            </SheetTitle>
            <SheetDescription className="text-cc-text-muted">
              Pick the record to keep. <span className="text-cc-text-secondary">{source?.name}</span> merges into it
              and everything it is used on moves over.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the record to keep"
                aria-label="Search the record to keep"
                className="rounded-cc-md border-cc-border-subtle bg-cc-surface pl-9 text-cc-text-primary"
              />
            </div>

            <div className="rounded-cc-md border border-cc-border-subtle bg-cc-surface">
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-sm text-cc-text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching the book
                </div>
              ) : query.trim().length < 2 ? (
                <p className="px-3 py-3 text-sm text-cc-text-muted">Type to find the record to keep.</p>
              ) : visibleResults.length === 0 ? (
                <p className="px-3 py-3 text-sm text-cc-text-muted">No other matching records.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-cc-border-subtle overflow-y-auto">
                  {visibleResults.map((r) => (
                    <li key={r.additional_insured_id}>
                      <button
                        type="button"
                        disabled={merging != null}
                        onClick={() => handleMerge(r)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-cc-surface-overlay disabled:opacity-60"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-cc-text-primary">{r.name}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-cc-text-muted">
                            <span>{kindLabel(r.kind)}</span>
                            {(r.city || r.state) && <span>{[r.city, r.state].filter(Boolean).join(', ')}</span>}
                          </p>
                        </div>
                        {merging === r.additional_insured_id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-cc-text-muted" />
                        ) : (
                          <Chip>
                            <span className="cc-num">{r.usage_count}</span>&nbsp;certs
                          </Chip>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
