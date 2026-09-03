/**
 * The Pipeline page.
 *
 * One board for every sale in flight, whatever it started as: a new prospect, a
 * cross-sell, a renewal being reshopped, a rewrite. The stages are the same for all
 * four because the work is the same for all four.
 *
 * Two views over the same set. The board is the default because a producer reads
 * position faster than a row; the list is there for the days you want density. The
 * choice is remembered per user.
 *
 * Bound and Lost are not stage writes. They are transactions that write policies or
 * close a renewal, so both paths (drag, stage menu, panel button) open the matching
 * dialog and the dialog does the work.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/cc';
import { Button } from '@/components/ui/button';
import { BindDialog } from '@/components/pipeline/BindDialog';
import { ItemPanel } from '@/components/pipeline/ItemPanel';
import { LostDialog } from '@/components/pipeline/LostDialog';
import { PipelineBoard } from '@/components/pipeline/PipelineBoard';
import { PipelineFilters, type PipelineView } from '@/components/pipeline/PipelineFilters';
import { closedThisMonth } from '@/components/pipeline/PipelineCard';
import { PipelineTiles, tileMatches, type TileKey } from '@/components/pipeline/PipelineTiles';
import { PipelineListView } from '@/components/pipeline/PipelineListView';
import { useIntakeV4Enabled } from '@/hooks/useFeatureFlag';
import {
  usePipelineItems,
  useUpdatePipelineItem,
  useWorkspaceStaff,
  type PipelineItem,
} from '@/hooks/usePipeline';
import { OPEN_STAGES, isOpenStage, type PipelineKind, type PipelineStage } from '@/lib/pipeline/stages';

const VIEW_STORAGE_KEY = 'cc-pipeline-view';

function readStoredView(): PipelineView {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

function storeView(view: PipelineView) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // A blocked or full localStorage is not worth a message. The view still works
    // for this session, it just will not be remembered.
  }
}

/**
 * The board itself. It lives in its own component so the gate below can decide
 * whether it exists at all: a user without the flag never runs the query and never
 * registers the key handlers.
 */
function PipelineWorkspace() {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const panelItemId = searchParams.get('item');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [kinds, setKinds] = useState<PipelineKind[]>([]);
  const [hideClosed, setHideClosed] = useState(true);
  const [tile, setTile] = useState<TileKey | null>(null);
  const [view, setView] = useState<PipelineView>(readStoredView);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bindItem, setBindItem] = useState<PipelineItem | null>(null);
  const [lostItem, setLostItem] = useState<PipelineItem | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const { data: staff = [] } = useWorkspaceStaff();
  const update = useUpdatePipelineItem();

  // The search term is part of the query key, so a raw keystroke would be a fresh
  // read of the whole board. Settle for a moment first.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Closed work is always fetched. The board's closed pair and the "Bound this
  // month" tile both have to be right, and a count that lies is worse than a
  // slightly larger read. The user's Hide closed toggle is applied below.
  const { data: items = [], isLoading } = usePipelineItems({
    search: debouncedSearch,
    mine,
    kinds: kinds.length > 0 ? kinds : undefined,
    hideClosed: false,
  });

  const openCount = useMemo(() => items.filter((i) => isOpenStage(i.stage)).length, [items]);

  const visible = useMemo(() => {
    let rows = items;
    if (tile) rows = rows.filter((item) => tileMatches(tile, item));
    // Closed work is only ever shown for the month in progress. Every surface uses
    // the same rule, so the "N shown" count always matches what is on screen.
    rows = rows.filter((item) =>
      isOpenStage(item.stage) ? true : !hideClosed && closedThisMonth(item),
    );
    return rows;
  }, [items, tile, hideClosed]);

  // The three that narrow the query itself, as opposed to the two applied on top.
  const queryFiltersActive = search.trim().length > 0 || mine || kinds.length > 0;
  const filtersActive = queryFiltersActive || tile !== null || !hideClosed;

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setMine(false);
    setKinds([]);
    setTile(null);
    setHideClosed(true);
  };

  const changeView = (next: PipelineView) => {
    setView(next);
    storeView(next);
  };

  const toggleTile = (key: TileKey) => {
    setTile((current) => {
      const next = current === key ? null : key;
      // Asking for this month's bound work has to actually show it.
      if (next === 'bound_month') setHideClosed(false);
      return next;
    });
  };

  const openItem = useCallback(
    (item: PipelineItem) => {
      const next = new URLSearchParams(searchParams);
      next.set('item', item.id);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const closePanel = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('item');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const moveStage = useCallback(
    (item: PipelineItem, stage: PipelineStage) => {
      if (item.stage === stage) return;
      update.mutate({ id: item.id, stage });
    },
    [update],
  );

  const setFollowUp = (item: PipelineItem, iso: string) => {
    update.mutate({ id: item.id, next_follow_up_date: iso || null });
  };

  const dialogOpen = !!bindItem || !!lostItem;
  const panelOpen = !!panelItemId;

  // Keyboard: n for a new lead, / for the search box, and left or right to walk a
  // selected card through the open stages. Cmd+K belongs to the command palette and
  // is deliberately not touched here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (panelOpen || dialogOpen) return;

      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (typing) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        navigate('/leads/new');
        return;
      }

      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (!selectedId) return;

      const item = items.find((i) => i.id === selectedId);
      if (!item) return;
      const index = OPEN_STAGES.indexOf(item.stage as PipelineStage);
      if (index === -1) return;

      const nextIndex = event.key === 'ArrowRight' ? index + 1 : index - 1;
      if (nextIndex < 0 || nextIndex >= OPEN_STAGES.length) return;

      event.preventDefault();
      moveStage(item, OPEN_STAGES[nextIndex]);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialogOpen, items, moveStage, navigate, panelOpen, selectedId]);

  // "Nothing at all" is only true with the filters off. A search that finds nothing
  // must keep the filter row on screen, or there is no way back out of it.
  const nothingAtAll = !isLoading && items.length === 0 && !queryFiltersActive;
  const nothingMatches = !isLoading && visible.length === 0 && !nothingAtAll;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1280px] space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Pipeline</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              <span className="cc-num">{openCount}</span> open right now.{' '}
              <Link
                to="/renewals"
                className="text-cc-link transition-colors duration-fast hover:text-cc-link-hover"
              >
                Renewals, where the candidates come from
              </Link>
              .
            </p>
          </div>
          {/* One lime fill per surface. When the board is empty the empty state
              carries it, so the header stands down rather than doubling up. */}
          {!nothingAtAll && (
            <Button
              data-primary
              onClick={() => navigate('/leads/new')}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <Plus className="h-4 w-4" />
              New lead
            </Button>
          )}
        </header>

        {/* A board with nothing on it does not need five zeroes and a filter row
            above it. It needs the one sentence and the one button. */}
        {nothingAtAll ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-20 text-center shadow-card">
            <p className="max-w-sm text-sm text-cc-text-secondary">
              Nothing in the pipeline. When the phone rings, New lead.
            </p>
            <Button
              data-primary
              onClick={() => navigate('/leads/new')}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <Plus className="h-4 w-4" />
              New lead
            </Button>
          </div>
        ) : (
          <>
            <PipelineTiles items={items} active={tile} onToggle={toggleTile} />

            <PipelineFilters
              search={search}
              onSearch={setSearch}
              searchRef={searchRef}
              mine={mine}
              onMine={setMine}
              kinds={kinds}
              onKinds={setKinds}
              hideClosed={hideClosed}
              onHideClosed={setHideClosed}
              view={view}
              onView={changeView}
              shownCount={visible.length}
              filtersActive={filtersActive}
              onClear={clearFilters}
            />

            {nothingMatches ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-cc-xl border border-cc-border-subtle bg-cc-surface px-6 py-20 text-center shadow-card">
                <p className="max-w-sm text-sm text-cc-text-secondary">
                  Nothing matches these filters. Clear them to see the whole board.
                </p>
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  Clear filters
                </Button>
              </div>
            ) : view === 'board' ? (
              <PipelineBoard
                items={visible}
                staff={staff}
                isLoading={isLoading}
                showClosed={!hideClosed}
                focusClosed={tile === 'bound_month' ? 'bound' : null}
                selectedId={selectedId}
                onSelect={(item) => setSelectedId(item.id)}
                onOpen={openItem}
                onStage={moveStage}
                onBind={setBindItem}
                onLost={setLostItem}
              />
            ) : (
              <PipelineListView
                items={visible}
                staff={staff}
                isLoading={isLoading}
                selectedId={selectedId}
                onSelect={(item) => setSelectedId(item.id)}
                onOpen={openItem}
                onStage={moveStage}
                onFollowUp={setFollowUp}
                onBind={setBindItem}
                onLost={setLostItem}
              />
            )}
          </>
        )}
      </div>

      {/* An outcome started from the panel closes the panel first, so the office
          never ends up looking at a dialog stacked on top of a sheet. */}
      <ItemPanel
        itemId={panelItemId}
        open={panelOpen}
        onOpenChange={(next) => {
          if (!next) closePanel();
        }}
        onBind={(item) => {
          closePanel();
          setBindItem(item);
        }}
        onLost={(item) => {
          closePanel();
          setLostItem(item);
        }}
      />

      {/* Both dialogs take a real item, so they mount only when there is one. */}
      {bindItem && (
        <BindDialog
          open
          onOpenChange={(next) => {
            if (!next) setBindItem(null);
          }}
          item={bindItem}
        />
      )}

      {lostItem && (
        <LostDialog
          open
          onOpenChange={(next) => {
            if (!next) setLostItem(null);
          }}
          item={lostItem}
        />
      )}
    </AppLayout>
  );
}

/**
 * The pilot gate. The flag fails closed, so a read that errors and a flag that is
 * off look the same here, and neither shows a board.
 */
export default function PipelinePage() {
  const flag = useIntakeV4Enabled();

  if (flag.isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1280px] space-y-6 p-6">
          <Skeleton className="h-8 w-40" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-cc-xl" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-cc-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!flag.enabled) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[720px] p-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">
            Pipeline
          </h1>
          <div className="mt-4 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-6 shadow-card">
            <p className="text-sm text-cc-text-secondary">
              The pipeline is not switched on for this account yet. It goes live with the new
              intake, and until then the old screens stay where they are.
            </p>
            <p className="mt-3 text-sm text-cc-text-muted">
              Nothing is lost while it is off. Renewals and leads keep working exactly as they do
              today.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return <PipelineWorkspace />;
}
