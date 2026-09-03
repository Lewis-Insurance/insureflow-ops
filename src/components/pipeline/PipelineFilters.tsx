/**
 * The filter row: search, mine, kind, hide closed, and the board or list switch.
 *
 * Every toggle here is the same chip so the row reads as one control strip rather
 * than five different widgets. No chip is ever filled lime; a selected chip takes a
 * lime border and the primary text colour (component-rules, quick action chips).
 */

import type { RefObject } from 'react';
import { LayoutGrid, List, Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { KIND_LABELS, PIPELINE_KINDS, type PipelineKind } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';

export type PipelineView = 'board' | 'list';

function ToggleChip({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-cc-md border px-3 text-sm transition-colors duration-fast',
        active
          ? 'border-cc-accent bg-cc-surface-overlay text-cc-text-primary'
          : 'border-transparent bg-cc-surface-overlay text-cc-text-secondary hover:text-cc-text-primary',
      )}
    >
      {children}
    </button>
  );
}

interface PipelineFiltersProps {
  search: string;
  onSearch: (value: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  mine: boolean;
  onMine: (value: boolean) => void;
  kinds: PipelineKind[];
  onKinds: (kinds: PipelineKind[]) => void;
  hideClosed: boolean;
  onHideClosed: (value: boolean) => void;
  view: PipelineView;
  onView: (view: PipelineView) => void;
  shownCount: number;
  filtersActive: boolean;
  onClear: () => void;
}

export function PipelineFilters({
  search,
  onSearch,
  searchRef,
  mine,
  onMine,
  kinds,
  onKinds,
  hideClosed,
  onHideClosed,
  view,
  onView,
  shownCount,
  filtersActive,
  onClear,
}: PipelineFiltersProps) {
  const toggleKind = (kind: PipelineKind) => {
    onKinds(kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cc-text-muted"
          aria-hidden="true"
        />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search name, phone, carrier"
          aria-label="Search the pipeline"
          className="h-8 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised pl-9 text-cc-text-primary placeholder:text-cc-text-muted"
        />
      </div>

      <ToggleChip active={mine} onClick={() => onMine(!mine)} label="Show only my items">
        Mine
      </ToggleChip>

      <span className="mx-1 hidden h-5 w-px bg-cc-border-subtle sm:block" aria-hidden="true" />

      {PIPELINE_KINDS.map((kind) => (
        <ToggleChip
          key={kind}
          active={kinds.includes(kind)}
          onClick={() => toggleKind(kind)}
          label={`Filter by ${KIND_LABELS[kind]}`}
        >
          {KIND_LABELS[kind]}
        </ToggleChip>
      ))}

      <ToggleChip
        active={hideClosed}
        onClick={() => onHideClosed(!hideClosed)}
        label="Hide bound and lost work"
      >
        Hide closed
      </ToggleChip>

      {filtersActive && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-sm text-cc-text-secondary transition-colors duration-fast hover:text-cc-text-primary"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="cc-num text-sm text-cc-text-muted">{shownCount} shown</span>

        {/* Board or list. Remembered per user, so muscle memory survives a reload. */}
        <div
          role="group"
          aria-label="Choose the pipeline view"
          className="flex items-center gap-1 rounded-cc-md bg-cc-surface-raised p-1"
        >
          <button
            type="button"
            onClick={() => onView('board')}
            aria-pressed={view === 'board'}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-cc-sm px-2 text-xs transition-colors duration-fast',
              view === 'board'
                ? 'bg-cc-surface-overlay text-cc-text-primary'
                : 'text-cc-text-muted hover:text-cc-text-secondary',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            Board
          </button>
          <button
            type="button"
            onClick={() => onView('list')}
            aria-pressed={view === 'list'}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 rounded-cc-sm px-2 text-xs transition-colors duration-fast',
              view === 'list'
                ? 'bg-cc-surface-overlay text-cc-text-primary'
                : 'text-cc-text-muted hover:text-cc-text-secondary',
            )}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            List
          </button>
        </div>
      </div>
    </div>
  );
}
