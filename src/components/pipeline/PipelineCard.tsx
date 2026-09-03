/**
 * The pipeline card, and the derived reads every pipeline surface shares.
 *
 * The card is the canonical anatomy of an item, so the small derivations it needs
 * (the yearly premium in play, the state of a line, who is on it, how stale it is) are defined
 * here and imported by the board, the list and the panel. One definition means the
 * board and the list can never disagree about the same number.
 *
 * A card moves two ways and both are equal: drag it, or use the stage menu. Touch
 * and keyboard users get the menu, so nothing on this board is drag only.
 */

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { differenceInCalendarDays } from 'date-fns';
import { AlertTriangle, CalendarClock, Check, Clock, MoreHorizontal } from 'lucide-react';

import { AccentSpine, Chip } from '@/components/cc';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PipelineItem, PipelineQuote } from '@/hooks/usePipeline';
import { lineLabel } from '@/config/intake/lineConfig';
import { differenceFromTodayInLocalDays, extractLocalDate, formatLocalDateDisplay } from '@/lib/date/localDate';
import { PIPELINE_STAGES, kindLabel, stageLabel, type PipelineStage } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared derivations
// ---------------------------------------------------------------------------

export interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** What a line has reached, read off that line's quotes. */
export type LineState = 'wanted' | 'quoted' | 'proposed' | 'bound';

export const LINE_STATE_LABELS: Record<LineState, string> = {
  wanted: 'wanted',
  quoted: 'quoted',
  proposed: 'proposed',
  bound: 'bound',
};

/**
 * Premiums are compared and totalled on a yearly basis so a six month quote never
 * looks half the price of a twelve month one. A missing term reads as annual.
 */
export function annualizedPremium(quote: PipelineQuote): number | null {
  if (quote.premium === null || quote.premium === undefined) return null;
  return quote.term === 'semiannual' ? quote.premium * 2 : quote.premium;
}

/** The best quote in hand for one line: the cheapest one still alive on that line. */
export function bestQuoteForLine(item: PipelineItem, line: string): PipelineQuote | null {
  const alive = item.quotes.filter(
    (q) => q.line === line && q.status !== 'declined' && annualizedPremium(q) !== null,
  );
  if (alive.length === 0) return null;
  return alive.reduce((best, q) =>
    (annualizedPremium(q) as number) < (annualizedPremium(best) as number) ? q : best,
  );
}

/** The single cheapest quote still alive, across every line. Used for the quotes list. */
export function bestQuote(item: PipelineItem): PipelineQuote | null {
  const alive = item.quotes.filter((q) => q.status !== 'declined' && annualizedPremium(q) !== null);
  if (alive.length === 0) return null;
  return alive.reduce((best, q) =>
    (annualizedPremium(q) as number) < (annualizedPremium(best) as number) ? q : best,
  );
}

/**
 * The yearly figure the card, the list and the tiles all show: the best quote on each
 * line, added up. That is what the sale is worth if it binds.
 *
 * Taking the single cheapest quote instead would be wrong on any multi line sale. A
 * home and auto sale quoted at 2,380 and 1,490 is worth 3,870, not 1,490, and the
 * tiles would then understate the money in play by exactly the amount that matters.
 */
export function bestPremiumAnnual(item: PipelineItem): number | null {
  const alive = item.quotes.filter((q) => q.status !== 'declined' && annualizedPremium(q) !== null);
  if (alive.length === 0) return null;

  const bestByLine = new Map<string, number>();
  for (const quote of alive) {
    const value = annualizedPremium(quote) as number;
    const current = bestByLine.get(quote.line);
    if (current === undefined || value < current) bestByLine.set(quote.line, value);
  }

  let total = 0;
  bestByLine.forEach((value) => {
    total += value;
  });
  return total;
}

export function lineState(item: PipelineItem, line: string): LineState {
  const quotes = item.quotes.filter((q) => q.line === line);
  if (quotes.some((q) => q.bound_policy_id)) return 'bound';
  if (quotes.some((q) => q.status === 'accepted' || q.status === 'proposed')) return 'proposed';
  if (quotes.length > 0) return 'quoted';
  return 'wanted';
}

export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function initialsOf(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean) return '??';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AssigneeBadge {
  id: string;
  initials: string;
  name: string;
}

export function assigneeBadges(item: PipelineItem, staff: StaffMember[]): AssigneeBadge[] {
  return item.assignees.map((id) => {
    const person = staff.find((s) => s.id === id);
    const name = person?.full_name || person?.email || 'Unknown';
    return { id, initials: initialsOf(person?.full_name || person?.email), name };
  });
}

/** Whole days since the last touch. Null when there is no timestamp. */
export function daysSinceTouch(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return differenceInCalendarDays(new Date(), parsed);
}

/** True when the follow up date has passed. */
export function isFollowUpOverdue(date: string | null | undefined): boolean {
  const days = differenceFromTodayInLocalDays(date);
  return days !== null && days < 0;
}

// ---------------------------------------------------------------------------
// Small shared cells
// ---------------------------------------------------------------------------

/** Last touch as a banded recency word, never a bare date. */
export function LastTouchCell({ item, className }: { item: PipelineItem; className?: string }) {
  const days = daysSinceTouch(item.last_touch_at);

  if (days === null) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-cc-text-muted', className)}>
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        No touch logged
      </span>
    );
  }

  const stale = days > 14;
  const label = days <= 0 ? 'today' : `${days}d`;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
      style={{ color: stale ? 'var(--cc-warning)' : 'var(--cc-text-muted)' }}
      title={`Last touch ${label}`}
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="cc-num">{label}</span>
      {stale && <span>stale</span>}
    </span>
  );
}

/** Next follow up. A date that has passed reads Overdue, with an icon and the word. */
export function FollowUpCell({
  date,
  className,
}: {
  date: string | null | undefined;
  className?: string;
}) {
  if (!date) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-cc-text-muted', className)}>
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        No follow up set
      </span>
    );
  }

  const days = differenceFromTodayInLocalDays(date) ?? 0;
  const overdue = days < 0;
  const soon = days >= 0 && days <= 2;
  const label = overdue ? 'Overdue' : days === 0 ? 'Today' : `in ${days}d`;

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
      style={{
        color: overdue
          ? 'var(--cc-danger-pill-text)'
          : soon
            ? 'var(--cc-warning)'
            : 'var(--cc-text-muted)',
      }}
      title={`Follow up ${formatLocalDateDisplay(extractLocalDate(date))}`}
    >
      {overdue ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="cc-num">{label}</span>
      <span className="cc-num text-cc-text-faint">{formatLocalDateDisplay(extractLocalDate(date))}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stage menu: the equal, pointer free path for moving a card
// ---------------------------------------------------------------------------

export function StageMenu({
  item,
  onStage,
  onBind,
  onLost,
  className,
}: {
  item: PipelineItem;
  onStage: (item: PipelineItem, stage: PipelineStage) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
  className?: string;
}) {
  const choose = (stage: PipelineStage) => {
    if (stage === item.stage) return;
    if (stage === 'bound') {
      onBind(item);
      return;
    }
    if (stage === 'lost') {
      onLost(item);
      return;
    }
    onStage(item, stage);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Move ${item.party?.name ?? 'this item'} to another stage`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-cc-md text-cc-text-muted transition-colors duration-fast hover:bg-cc-surface-overlay hover:text-cc-text-primary',
            className,
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-cc-lg border-cc-border-strong bg-cc-surface-overlay shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuLabel className="text-label uppercase tracking-label text-cc-text-muted">
          Move to stage
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-cc-border-subtle" />
        {PIPELINE_STAGES.filter((s) => s !== 'bound' && s !== 'lost').map((stage) => (
          <DropdownMenuItem
            key={stage}
            onSelect={() => choose(stage)}
            className="text-cc-text-secondary focus:bg-cc-surface-raised focus:text-cc-text-primary"
          >
            <span className="flex-1">{stageLabel(stage)}</span>
            {item.stage === stage && (
              <>
                <Check className="h-3.5 w-3.5 text-cc-accent" aria-hidden="true" />
                <span className="sr-only">Current stage</span>
              </>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-cc-border-subtle" />
        <DropdownMenuItem
          onSelect={() => choose('bound')}
          className="text-cc-text-secondary focus:bg-cc-surface-raised focus:text-cc-text-primary"
        >
          Bound, write the policies
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => choose('lost')}
          className="text-cc-text-secondary focus:bg-cc-surface-raised focus:text-cc-text-primary"
        >
          Lost, close it out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

interface PipelineCardProps {
  item: PipelineItem;
  staff: StaffMember[];
  selected: boolean;
  onOpen: (item: PipelineItem) => void;
  onSelect: (item: PipelineItem) => void;
  onStage: (item: PipelineItem, stage: PipelineStage) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
  /** Off inside the drag overlay, where a second draggable would fight the first. */
  draggable?: boolean;
}

export function PipelineCard({
  item,
  staff,
  selected,
  onOpen,
  onSelect,
  onStage,
  onBind,
  onLost,
  draggable = true,
}: PipelineCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !draggable,
    data: { stage: item.stage },
  });

  const premium = bestPremiumAnnual(item);
  const badges = assigneeBadges(item, staff);
  const name = item.party?.name ?? 'Unnamed';

  return (
    <AccentSpine
      ref={setNodeRef}
      active={selected}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${name}, ${stageLabel(item.stage)}`}
      onFocus={() => onSelect(item)}
      onClick={() => {
        onSelect(item);
        onOpen(item);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
          onOpen(item);
        }
      }}
      className={cn(
        'cursor-pointer space-y-2 p-3 transition-transform duration-base ease-glide hover:border-cc-border-interactive',
        isDragging && 'opacity-60 shadow-lift',
      )}
    >
      {/* Party name never truncates. A decision hangs on reading it whole. */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 break-words text-sm font-semibold leading-snug text-cc-text-primary">
          {name}
        </span>
        <StageMenu item={item} onStage={onStage} onBind={onBind} onLost={onLost} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{kindLabel(item.kind)}</Chip>
        {item.lines_wanted.map((line) => (
          <Chip key={line}>
            {lineLabel(line)}
            <span className="ml-1 text-cc-text-muted">{LINE_STATE_LABELS[lineState(item, line)]}</span>
          </Chip>
        ))}
        {item.lines_wanted.length === 0 && (
          <span className="text-xs text-cc-text-muted">No lines listed yet</span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="cc-num text-sm font-semibold text-cc-text-primary">
          {premium === null ? (
            <span className="text-xs font-normal text-cc-text-muted">No premium yet</span>
          ) : (
            <>
              {formatMoney(premium)}
              <span className="ml-1 text-xs font-normal text-cc-text-muted">per year</span>
            </>
          )}
        </span>
        <span className="flex items-center gap-1">
          {badges.length === 0 ? (
            <span className="text-xs text-cc-text-muted">Nobody yet</span>
          ) : (
            badges.slice(0, 3).map((badge) => (
              <span
                key={badge.id}
                title={badge.name}
                className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-cc-surface-overlay text-[10px] font-semibold text-cc-text-secondary"
              >
                {badge.initials}
                <span className="sr-only">{badge.name}</span>
              </span>
            ))
          )}
          {badges.length > 3 && (
            <span className="cc-num inline-flex h-6 items-center rounded-pill bg-cc-surface-overlay px-1.5 text-[10px] text-cc-text-secondary">
              +{badges.length - 3}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cc-border-subtle pt-2">
        <LastTouchCell item={item} />
        <FollowUpCell date={item.next_follow_up_date} />
      </div>
    </AccentSpine>
  );
}
