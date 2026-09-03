/**
 * The item panel.
 *
 * Clicking a card opens this, not a new page. The producer stays on the board, does
 * the one thing (log a quote, move the follow up, write a note), and closes it. The
 * bottom of the panel carries the two outcomes: Bind is the single lime action here,
 * Lost is ghost beside it.
 */

import { Link } from 'react-router-dom';
import { ExternalLink, Mail, Phone } from 'lucide-react';

import { Chip, DateField, SectionLabel, Skeleton } from '@/components/cc';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { lineLabel } from '@/config/intake/lineConfig';
import { usePipelineItem, useUpdatePipelineItem, type PipelineItem } from '@/hooks/usePipeline';
import { addDaysLocalDate, extractLocalDate, todayLocalDate } from '@/lib/date/localDate';
import { formatPhoneForDisplay } from '@/lib/format';
import { kindLabel, stageLabel } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';
import { AssigneePicker } from './AssigneePicker';
import { NoteThread } from './NoteThread';
import { QuoteList } from './QuoteList';
import { FollowUpCell, LINE_STATE_LABELS, LastTouchCell, lineState } from './PipelineCard';

interface ItemPanelProps {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-6 w-52" />
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-16 w-full rounded-cc-md" />
      <Skeleton className="h-24 w-full rounded-cc-md" />
      <Skeleton className="h-24 w-full rounded-cc-md" />
    </div>
  );
}

function QuickDateChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center rounded-cc-md border px-3 text-sm transition-colors duration-fast',
        active
          ? 'border-cc-accent bg-cc-surface-overlay text-cc-text-primary'
          : 'border-transparent bg-cc-surface-overlay text-cc-text-secondary hover:text-cc-text-primary',
      )}
    >
      {label}
    </button>
  );
}

export function ItemPanel({ itemId, open, onOpenChange, onBind, onLost }: ItemPanelProps) {
  const { data: item, isLoading } = usePipelineItem(itemId ?? undefined);
  const update = useUpdatePipelineItem();

  const today = todayLocalDate();
  const current = item ? extractLocalDate(item.next_follow_up_date) : '';
  const quickDates = [
    { label: 'Tomorrow', iso: addDaysLocalDate(today, 1) },
    { label: '+3 days', iso: addDaysLocalDate(today, 3) },
    { label: '+7 days', iso: addDaysLocalDate(today, 7) },
  ];

  const setFollowUp = (iso: string) => {
    if (!item) return;
    update.mutate({ id: item.id, next_follow_up_date: iso || null });
  };

  const closed = item ? item.stage === 'bound' || item.stage === 'lost' : false;
  const partyHref = item?.party
    ? item.party.kind === 'lead'
      ? `/leads/${item.party.id}`
      : `/customers/${item.party.id}`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full border-cc-border-subtle bg-cc-surface p-0 sm:max-w-[520px]"
      >
        {isLoading || !item ? (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>Loading this item</SheetTitle>
              <SheetDescription>The pipeline item is still loading.</SheetDescription>
            </SheetHeader>
            <PanelSkeleton />
          </>
        ) : (
          <div className="flex h-full flex-col">
            {/* Header */}
            <SheetHeader className="space-y-2 border-b border-cc-border-subtle px-5 py-4 text-left">
              <SheetTitle className="break-words pr-8 text-lg font-semibold text-cc-text-primary">
                {item.party?.name ?? 'Unnamed'}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {kindLabel(item.kind)} at the {stageLabel(item.stage)} stage.
              </SheetDescription>
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{kindLabel(item.kind)}</Chip>
                {/* Stage is text, never a colour. */}
                <span className="text-sm text-cc-text-secondary">
                  Stage <span className="font-medium text-cc-text-primary">{stageLabel(item.stage)}</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <LastTouchCell item={item} />
                <FollowUpCell date={item.next_follow_up_date} />
              </div>
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
              {/* Party */}
              <section className="space-y-2">
                <SectionLabel>{item.party?.kind === 'lead' ? 'Prospect' : 'Customer'}</SectionLabel>
                {partyHref ? (
                  <Link
                    to={partyHref}
                    className="inline-flex items-center gap-1.5 text-sm text-cc-link transition-colors duration-fast hover:text-cc-link-hover"
                  >
                    Open the {item.party?.kind === 'lead' ? 'prospect' : 'customer'} file
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <p className="text-sm text-cc-text-muted">No file linked to this item yet.</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-cc-text-secondary">
                  {item.party?.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-cc-text-muted" aria-hidden="true" />
                      <span className="cc-num">{formatPhoneForDisplay(item.party.phone)}</span>
                    </span>
                  )}
                  {item.party?.email && (
                    <span className="inline-flex items-center gap-1.5 break-all">
                      <Mail className="h-3.5 w-3.5 text-cc-text-muted" aria-hidden="true" />
                      {item.party.email}
                    </span>
                  )}
                </div>
              </section>

              {/* A rewrite never touches the old policy. Say so where the work happens. */}
              {item.kind === 'rewrite' && (
                <p className="rounded-cc-md border border-cc-border-subtle bg-cc-surface-raised p-3 text-sm text-cc-text-secondary">
                  The old policy is left as it is. Cancel it through the usual cancellation flow
                  when the new one is in force.
                </p>
              )}

              {/* Lines */}
              <section className="space-y-2">
                <SectionLabel>Lines</SectionLabel>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.lines_wanted.length === 0 ? (
                    <span className="text-sm text-cc-text-muted">No lines listed yet.</span>
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
              </section>

              {/* Follow up */}
              <section className="space-y-2">
                <SectionLabel>Next follow up</SectionLabel>
                <div className="flex flex-wrap items-center gap-2">
                  {quickDates.map((quick) => (
                    <QuickDateChip
                      key={quick.label}
                      label={quick.label}
                      active={current === quick.iso}
                      onClick={() => setFollowUp(quick.iso)}
                    />
                  ))}
                  <DateField
                    value={current}
                    onChange={setFollowUp}
                    aria-label="Next follow up date"
                    className="cc-num h-8 rounded-cc-md border-cc-border-interactive bg-cc-surface-raised text-sm"
                    containerClassName="w-40"
                  />
                </div>
              </section>

              <AssigneePicker item={item} />

              <QuoteList item={item} />

              <NoteThread itemId={item.id} />
            </div>

            {/* Outcomes. Bind is the one lime action on this surface. */}
            <div className="space-y-2 border-t border-cc-border-subtle bg-cc-surface px-5 py-4">
              {closed && (
                <p className="text-sm text-cc-text-muted">
                  This one is closed as {stageLabel(item.stage).toLowerCase()}.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  data-primary
                  disabled={item.quotes.length === 0 || closed}
                  onClick={() => onBind(item)}
                  className="h-11 flex-1 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
                >
                  Bind
                </Button>
                <Button
                  variant="outline"
                  disabled={closed}
                  onClick={() => onLost(item)}
                  className="h-11 rounded-cc-md border-cc-border-interactive bg-transparent px-6 text-cc-text-primary hover:bg-cc-surface-overlay"
                >
                  Lost
                </Button>
              </div>
              {item.quotes.length === 0 && !closed && (
                <p className="text-xs text-cc-text-muted">
                  Add a quote before you bind. The bind writes policies from the quotes.
                </p>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
