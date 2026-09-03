/**
 * The board.
 *
 * Four open columns, then a collapsed Bound and Lost pair on the right holding this
 * month's closed work. A card moves by drag or by its stage menu, and the two paths
 * are equal: touch and keyboard users are not second class here.
 *
 * Dropping on Bound or Lost never writes the stage directly. Those two outcomes are
 * transactions (policies get written, a renewal gets closed), so the drop opens the
 * matching dialog and the dialog does the work.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { SectionLabel, Skeleton } from '@/components/cc';
import type { PipelineItem } from '@/hooks/usePipeline';
import { CLOSED_STAGES, OPEN_STAGES, stageLabel, type PipelineStage } from '@/lib/pipeline/stages';
import { cn } from '@/lib/utils';
import { PipelineCard, type StaffMember } from './PipelineCard';

interface PipelineBoardProps {
  items: PipelineItem[];
  staff: StaffMember[];
  isLoading: boolean;
  /** Renders the collapsed closed pair. Off when the user hides closed work. */
  showClosed: boolean;
  /**
   * Opens one of the closed sections. The page sets this when a tile asks for
   * closed work, so the answer is not hidden behind a collapsed header.
   */
  focusClosed?: PipelineStage | null;
  selectedId: string | null;
  onSelect: (item: PipelineItem) => void;
  onOpen: (item: PipelineItem) => void;
  onStage: (item: PipelineItem, stage: PipelineStage) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
}

/** True when a closed item was closed inside the current calendar month. */
function closedThisMonth(item: PipelineItem): boolean {
  const stamp = item.bound_at ?? item.updated_at;
  if (!stamp) return false;
  const closed = new Date(stamp);
  if (Number.isNaN(closed.getTime())) return false;
  const now = new Date();
  return closed.getFullYear() === now.getFullYear() && closed.getMonth() === now.getMonth();
}

function ColumnSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-24 w-full rounded-cc-lg" />
      <Skeleton className="h-24 w-full rounded-cc-lg" />
      <Skeleton className="h-24 w-full rounded-cc-lg" />
    </div>
  );
}

interface ColumnProps {
  stage: PipelineStage;
  items: PipelineItem[];
  staff: StaffMember[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (item: PipelineItem) => void;
  onOpen: (item: PipelineItem) => void;
  onStage: (item: PipelineItem, stage: PipelineStage) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
}

function BoardColumn({
  stage,
  items,
  staff,
  isLoading,
  selectedId,
  onSelect,
  onOpen,
  onStage,
  onBind,
  onLost,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${stageLabel(stage)} column`}
      className={cn(
        'flex min-w-[264px] flex-col rounded-cc-xl border bg-cc-surface p-3 transition-colors duration-fast',
        isOver ? 'border-cc-border-interactive bg-cc-surface-raised' : 'border-cc-border-subtle',
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <SectionLabel>{stageLabel(stage)}</SectionLabel>
        <span className="cc-num text-sm font-semibold text-cc-text-primary">{items.length}</span>
      </header>

      <div className="flex flex-col gap-2">
        {isLoading ? (
          <ColumnSkeleton />
        ) : items.length === 0 ? (
          <p className="rounded-cc-md border border-dashed border-cc-border-subtle px-3 py-6 text-center text-xs text-cc-text-muted">
            Nothing here. Drop a card in, or use the stage menu on a card.
          </p>
        ) : (
          items.map((item) => (
            <PipelineCard
              key={item.id}
              item={item}
              staff={staff}
              selected={selectedId === item.id}
              onSelect={onSelect}
              onOpen={onOpen}
              onStage={onStage}
              onBind={onBind}
              onLost={onLost}
            />
          ))
        )}
      </div>
    </section>
  );
}

interface ClosedSectionProps {
  stage: PipelineStage;
  items: PipelineItem[];
  staff: StaffMember[];
  expanded: boolean;
  onToggle: () => void;
  selectedId: string | null;
  onSelect: (item: PipelineItem) => void;
  onOpen: (item: PipelineItem) => void;
  onStage: (item: PipelineItem, stage: PipelineStage) => void;
  onBind: (item: PipelineItem) => void;
  onLost: (item: PipelineItem) => void;
}

function ClosedSection({
  stage,
  items,
  staff,
  expanded,
  onToggle,
  selectedId,
  onSelect,
  onOpen,
  onStage,
  onBind,
  onLost,
}: ClosedSectionProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-cc-lg border p-2 transition-colors duration-fast',
        isOver ? 'border-cc-border-interactive bg-cc-surface-raised' : 'border-cc-border-subtle',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-cc-sm px-1 py-1 text-left transition-colors duration-fast hover:bg-cc-surface-overlay"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-cc-text-muted" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-cc-text-muted" aria-hidden="true" />
        )}
        <SectionLabel className="flex-1">{stageLabel(stage)}</SectionLabel>
        <span className="cc-num text-sm font-semibold text-cc-text-primary">{items.length}</span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {items.length === 0 ? (
            <p className="px-1 py-3 text-xs text-cc-text-muted">
              Nothing closed this month. Drag a card here when it lands.
            </p>
          ) : (
            items.map((item) => (
              <PipelineCard
                key={item.id}
                item={item}
                staff={staff}
                selected={selectedId === item.id}
                onSelect={onSelect}
                onOpen={onOpen}
                onStage={onStage}
                onBind={onBind}
                onLost={onLost}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function PipelineBoard({
  items,
  staff,
  isLoading,
  showClosed,
  focusClosed = null,
  selectedId,
  onSelect,
  onOpen,
  onStage,
  onBind,
  onLost,
}: PipelineBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [expandedClosed, setExpandedClosed] = useState<PipelineStage | null>(focusClosed);

  // Asking for closed work opens it. Letting go of the tile leaves it as it is,
  // because collapsing something the user just opened would read as a glitch.
  useEffect(() => {
    if (focusClosed) setExpandedClosed(focusClosed);
  }, [focusClosed]);

  // A short distance before a drag starts, so a plain click still opens the panel.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, PipelineItem[]>();
    for (const stage of [...OPEN_STAGES, ...CLOSED_STAGES]) map.set(stage, []);
    for (const item of items) {
      const bucket = map.get(item.stage as PipelineStage);
      if (!bucket) continue;
      if (CLOSED_STAGES.includes(item.stage as PipelineStage) && !closedThisMonth(item)) continue;
      bucket.push(item);
    }
    return map;
  }, [items]);

  const dragging = draggingId ? items.find((i) => i.id === draggingId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over) return;

    const target = String(over.id) as PipelineStage;
    const item = items.find((i) => i.id === String(active.id));
    if (!item || item.stage === target) return;

    if (target === 'bound') {
      onBind(item);
      return;
    }
    if (target === 'lost') {
      onLost(item);
      return;
    }
    onStage(item, target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="overflow-x-auto pb-2">
        <div
          className={cn(
            'flex items-start gap-3',
            showClosed ? 'min-w-[1160px]' : 'min-w-[1080px]',
          )}
        >
          {OPEN_STAGES.map((stage) => (
            <div key={stage} className="flex-1">
              <BoardColumn
                stage={stage}
                items={byStage.get(stage) ?? []}
                staff={staff}
                isLoading={isLoading}
                selectedId={selectedId}
                onSelect={onSelect}
                onOpen={onOpen}
                onStage={onStage}
                onBind={onBind}
                onLost={onLost}
              />
            </div>
          ))}

          {showClosed && (
            <aside
              aria-label="Closed this month"
              className="w-[240px] shrink-0 space-y-2 rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-3"
            >
              <p className="px-1 text-xs text-cc-text-muted">Closed this month</p>
              {CLOSED_STAGES.map((stage) => (
                <ClosedSection
                  key={stage}
                  stage={stage}
                  items={byStage.get(stage) ?? []}
                  staff={staff}
                  expanded={expandedClosed === stage}
                  onToggle={() => setExpandedClosed((cur) => (cur === stage ? null : stage))}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onOpen={onOpen}
                  onStage={onStage}
                  onBind={onBind}
                  onLost={onLost}
                />
              ))}
            </aside>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="w-[264px] opacity-95">
            <PipelineCard
              item={dragging}
              staff={staff}
              selected
              draggable={false}
              onSelect={() => undefined}
              onOpen={() => undefined}
              onStage={() => undefined}
              onBind={() => undefined}
              onLost={() => undefined}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
