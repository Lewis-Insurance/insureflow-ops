/**
 * The list view.
 *
 * The same fields as a card, in the same order on every row, at table density. Two
 * of them are editable in place because they are the two a producer changes twenty
 * times a day: the stage and the next follow up date. Everything else opens the panel.
 */

import { DateField, Chip, SectionLabel, Skeleton } from '@/components/cc';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PipelineItem } from '@/hooks/usePipeline';
import { lineLabel } from '@/config/intake/lineConfig';
import { extractLocalDate } from '@/lib/date/localDate';
import { PIPELINE_STAGES, kindLabel, stageLabel, type PipelineStage } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';
import {
  FollowUpCell,
  LastTouchCell,
  LINE_STATE_LABELS,
  assigneeBadges,
  bestPremiumAnnual,
  formatMoney,
  lineState,
  type StaffMember,
} from './PipelineCard';

const COLS =
  'lg:grid-cols-[minmax(0,1.4fr)_104px_minmax(0,1fr)_104px_76px_92px_136px_156px]';

interface PipelineListViewProps {
  items: PipelineItem[];
  staff: StaffMember[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (item: PipelineItem) => void;
  onOpen: (item: PipelineItem) => void;
  onStage: (item: PipelineItem, stage: PipelineStage) => void;
  onFollowUp: (item: PipelineItem, iso: string) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
}

function ListSkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-cc-border-subtle px-4 py-3">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-16" />
      <Skeleton className="h-6 w-6 rounded-pill" />
      <Skeleton className="ml-auto h-8 w-28 rounded-cc-md" />
      <Skeleton className="h-8 w-32 rounded-cc-md" />
    </div>
  );
}

export function PipelineListView({
  items,
  staff,
  isLoading,
  selectedId,
  onSelect,
  onOpen,
  onStage,
  onFollowUp,
  onBind,
  onLost,
}: PipelineListViewProps) {
  const changeStage = (item: PipelineItem, next: string) => {
    const stage = next as PipelineStage;
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
    <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
      <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 lg:grid', COLS)}>
        <SectionLabel>Who</SectionLabel>
        <SectionLabel>Kind</SectionLabel>
        <SectionLabel>Lines</SectionLabel>
        <SectionLabel>Premium a year</SectionLabel>
        <SectionLabel>On it</SectionLabel>
        <SectionLabel>Touched</SectionLabel>
        <SectionLabel>Stage</SectionLabel>
        <SectionLabel>Follow up</SectionLabel>
      </div>

      {isLoading
        ? Array.from({ length: 8 }).map((_, i) => <ListSkeletonRow key={i} />)
        : items.map((item) => {
            const premium = bestPremiumAnnual(item);
            const badges = assigneeBadges(item, staff);
            const name = item.party?.name ?? 'Unnamed';

            return (
              <div
                key={item.id}
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
                  'flex cursor-pointer flex-col gap-2 border-b border-cc-border-subtle px-4 py-2 transition-colors duration-fast last:border-b-0 hover:bg-cc-surface-raised',
                  'lg:grid lg:items-center lg:gap-4',
                  COLS,
                  selectedId === item.id && 'border-l-2 border-l-cc-accent bg-cc-surface-raised',
                )}
              >
                {/* Who. Never truncated. */}
                <div className="min-w-0 break-words text-sm font-semibold text-cc-text-primary">
                  {name}
                </div>

                <div>
                  <Chip>{kindLabel(item.kind)}</Chip>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {item.lines_wanted.length === 0 ? (
                    <span className="text-xs text-cc-text-muted">None listed</span>
                  ) : (
                    item.lines_wanted.map((line) => (
                      <Chip key={line}>
                        {lineLabel(line)}
                        <span className="ml-1 text-cc-text-muted">
                          {LINE_STATE_LABELS[lineState(item, line)]}
                        </span>
                      </Chip>
                    ))
                  )}
                </div>

                <div className="cc-num text-sm font-semibold text-cc-text-primary">
                  {premium === null ? (
                    <span className="text-xs font-normal text-cc-text-muted">Not quoted</span>
                  ) : (
                    formatMoney(premium)
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {badges.length === 0 ? (
                    <span className="text-xs text-cc-text-muted">Nobody</span>
                  ) : (
                    badges.slice(0, 2).map((badge) => (
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
                  {badges.length > 2 && (
                    <span className="cc-num inline-flex h-6 items-center rounded-pill bg-cc-surface-overlay px-1.5 text-[10px] text-cc-text-secondary">
                      +{badges.length - 2}
                    </span>
                  )}
                </div>

                <LastTouchCell item={item} />

                {/* Stage, editable in the row. Bound and Lost open their dialogs. */}
                <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Select value={item.stage} onValueChange={(v) => changeStage(item, v)}>
                    <SelectTrigger
                      aria-label={`Stage for ${name}`}
                      className="h-8 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-sm text-cc-text-primary"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINE_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stageLabel(stage)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Follow up, editable in the row. The overdue read stays visible under it. */}
                <div
                  className="space-y-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <DateField
                    value={extractLocalDate(item.next_follow_up_date)}
                    onChange={(iso) => onFollowUp(item, iso)}
                    aria-label={`Next follow up for ${name}`}
                    className="cc-num h-8 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-sm"
                  />
                  <FollowUpCell date={item.next_follow_up_date} />
                </div>
              </div>
            );
          })}
    </div>
  );
}
