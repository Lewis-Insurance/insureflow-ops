import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTriageCohortFromUrl, parseScopeFromUrl, type TaskScope } from '@/hooks/useTriageCohortFromUrl';
import { Search, X, Plus, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AppLayout } from '@/components/layout/AppLayout';
import { TaskKanbanBoard } from '@/components/tasks/TaskKanbanBoard';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { TaskAnalyticsDashboard } from '@/components/tasks/TaskAnalyticsDashboard';
import { TaskForm } from '@/components/tasks/TaskForm';
import { TaskEditModal } from '@/components/tasks/TaskEditModal';
import { useTasks, Task } from '@/hooks/useTasks';
import type { TaskRow } from '@/hooks/useTaskSearch';
import { toast } from '@/hooks/use-toast';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { useTaskTriageCounts } from '@/hooks/useTaskTriageCounts';
import { supabase } from '@/integrations/supabase/client';
import { StatusPill, Chip, SectionLabel, TriageTile, SkeletonRow } from '@/components/cc';
import { humanizeEnum } from '@/lib/format';
import { taskAssigneeLabel } from '@/lib/taskAssignee';
import { cn } from '@/lib/utils';

// Cohorts are computed server-side; clicking a tile filters the rows to it.
type Cohort = 'all' | 'overdue' | 'due_this_week' | 'high_priority' | 'completed';

const TASK_COHORTS = [
  'all',
  'overdue',
  'due_this_week',
  'high_priority',
  'completed',
] as const satisfies readonly Cohort[];

// The secondary views are preserved unchanged behind a single segmented control.
// 'list' is the Calm Command Index list and the default; it replaces the old
// MyTasksDashboard tab.
type View = 'list' | 'kanban' | 'calendar' | 'analytics';

const VIEWS: { value: View; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'kanban', label: 'Kanban' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'analytics', label: 'Analytics' },
];

// Dense table column template (md+): Title | Account | Assigned | Status | Priority | Due.
const COLS = 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_110px_100px_140px]';

const SCOPES: { value: TaskScope; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'unclaimed', label: 'Unclaimed' },
  { value: 'office', label: 'Whole office' },
];

function scopeSubtitle(scope: TaskScope): string {
  switch (scope) {
    case 'mine':
      return 'Yours and unclaimed.';
    case 'unclaimed':
      return 'Unclaimed work in the office.';
    case 'office':
      return 'Whole office.';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Due date band: overdue -> danger, within 7 days -> warning, else neutral.
// Color is never the only signal; overdue carries the word "Overdue".
type DueBand = { color: string; label: string; overdue: boolean };

function dueBand(dueAt: string | null, completedAt: string | null): DueBand | null {
  if (!dueAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;

  const dateLabel = due.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // A completed task is never "overdue"; show its due date in neutral.
  if (completedAt) {
    return { color: 'var(--cc-text-muted)', label: dateLabel, overdue: false };
  }

  const now = Date.now();
  const diff = due.getTime() - now;

  if (diff < 0) {
    return { color: 'var(--cc-danger-pill-text)', label: 'Overdue', overdue: true };
  }
  if (diff <= 7 * DAY_MS) {
    return { color: 'var(--cc-warning)', label: dateLabel, overdue: false };
  }
  return { color: 'var(--cc-text-secondary)', label: dateLabel, overdue: false };
}

export default function TasksPage() {
  const [view, setView] = useState<View>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = parseScopeFromUrl(searchParams.get('scope')) ?? 'mine';
  const [cohort, setCohort] = useTriageCohortFromUrl<Cohort>(TASK_COHORTS);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [loadingTaskId, setLoadingTaskId] = useState<string | null>(null);
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);

  const setScope = (next: TaskScope) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'mine') {
        params.delete('scope');
      } else {
        params.set('scope', next);
      }
      return params;
    });
  };

  const { tasks, loading, loadingMore, hasMore, fetchTasks, fetchNextPage, refetch } = useTaskSearch();
  const { counts, refetch: refetchCounts } = useTaskTriageCounts(scope);
  const { createTask } = useTasks();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  // Completed tasks sort newest-completed first; everything else by due date.
  const sort = cohort === 'completed' ? 'created_desc' : 'due_asc';

  // Single server-side fetch path for search + cohort + scope. useTaskSearch does not
  // auto-fetch on mount; TasksPage owns the first scoped request. Search is debounced.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      fetchTasks(searchQuery, sort, cohort !== 'all' ? cohort : undefined, scope);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchTasks(searchQuery, sort, cohort !== 'all' ? cohort : undefined, scope),
      250,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, cohort, scope]);

  const toggleCohort = (c: Cohort) => setCohort((cur) => (cur === c ? 'all' : c));
  const filtersActive = cohort !== 'all' || searchQuery.length > 0;
  const clearAll = () => {
    setCohort('all');
    setSearchQuery('');
  };

  const handleCreateTask = async (taskData: Partial<Task>) => {
    await createTask(taskData);
    setCreateDialogOpen(false);
    // Refresh the index list and the triage counts after a successful create.
    refetch();
    refetchCounts();
  };

  const fetchFullTask = async (taskId: string): Promise<Task | null> => {
    const { data, error } = await supabase
      .from('tasks')
      .select(
        `
          *,
          account:accounts(id, name),
          policy:policies(id, policy_number, carrier, line_of_business)
        `,
      )
      .eq('id', taskId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return null;

    const row = data as Task;
    if (!row.assignee_id) return row;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', row.assignee_id)
      .single();

    return profile ? { ...row, assignee: profile } : row;
  };

  const handleRowClick = async (row: TaskRow) => {
    setLoadingTaskId(row.id);
    try {
      const full = await fetchFullTask(row.id);
      if (!full) return;

      const enriched =
        !full.account && row.account_name && row.account_id
          ? { ...full, account: { id: row.account_id, name: row.account_name } }
          : full;

      setSelectedTask(enriched);
      setEditModalOpen(true);
    } finally {
      setLoadingTaskId(null);
    }
  };

  const isOpenTask = (status: string | null) => status === 'pending' || status === 'in_progress';

  const handleMarkDone = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setMarkingDoneId(taskId);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;

      toast({
        title: 'Task completed',
        description: 'Marked as done.',
      });

      window.dispatchEvent(new CustomEvent('tasks:updated'));
      refetch();
      refetchCounts();
    } catch {
      toast({
        title: 'Error',
        description: 'Could not mark task as done.',
        variant: 'destructive',
      });
    } finally {
      setMarkingDoneId(null);
    }
  };

  const handleTaskUpdate = () => {
    window.dispatchEvent(new CustomEvent('tasks:updated'));
    refetch();
    refetchCounts();
    setEditModalOpen(false);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary (Create task) */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">Tasks</h1>
            <p className="mt-1 text-sm text-cc-text-secondary">
              Work queue. Click a row to open it.
            </p>
            <p className="mt-0.5 text-sm text-cc-text-muted">
              <span className="cc-num">{counts.open_total}</span> open. {scopeSubtitle(scope)}
            </p>
          </div>
          <Button
            data-primary
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
          >
            <Plus className="h-4 w-4" />
            Create task
          </Button>
        </header>

        {/* Triage strip: server-counted task cohorts that route into work */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TriageTile
            label="Overdue"
            count={counts.overdue}
            sub="Do these now"
            tone={counts.overdue > 0 ? 'danger' : 'neutral'}
            active={cohort === 'overdue'}
            onClick={() => toggleCohort('overdue')}
          />
          <TriageTile
            label="Due this week"
            count={counts.due_this_week}
            sub="Plan ahead"
            tone="warning"
            active={cohort === 'due_this_week'}
            onClick={() => toggleCohort('due_this_week')}
          />
          <TriageTile
            label="High priority"
            count={counts.high_priority}
            sub="Focus here"
            tone="info"
            active={cohort === 'high_priority'}
            onClick={() => toggleCohort('high_priority')}
          />
          <TriageTile
            label="Completed"
            count={counts.completed}
            sub="Recently done"
            tone="neutral"
            active={cohort === 'completed'}
            onClick={() => toggleCohort('completed')}
          />
        </div>

        {/* Scope: whose tasks are in view */}
        <div
          role="group"
          aria-label="Task scope"
          className="inline-flex flex-wrap rounded-cc-md bg-cc-surface-raised p-0.5"
        >
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              aria-pressed={scope === s.value}
              className={cn(
                'rounded-[10px] px-3 py-1.5 text-sm transition-colors duration-fast',
                scope === s.value
                  ? 'bg-cc-surface-overlay text-cc-text-primary'
                  : 'text-cc-text-muted hover:text-cc-text-secondary',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* View switch: List is the Calm Command index; the rest are preserved views */}
        <div
          role="group"
          aria-label="Switch view"
          className="inline-flex flex-wrap rounded-cc-md bg-cc-surface-raised p-0.5"
        >
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
                  placeholder="Search tasks"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search tasks"
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
                {tasks.length}
                {hasMore ? '+' : ''} shown
              </span>
            </div>

            {/* Dense, uniform list */}
            <div className="overflow-hidden rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card">
              <div className={cn('hidden gap-4 border-b border-cc-border-subtle px-4 py-2.5 md:grid', COLS)}>
                <SectionLabel>Task</SectionLabel>
                <SectionLabel>Account</SectionLabel>
                <SectionLabel>Assigned</SectionLabel>
                <SectionLabel>Status</SectionLabel>
                <SectionLabel>Priority</SectionLabel>
                <SectionLabel>Due</SectionLabel>
              </div>

              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <p className="max-w-sm text-sm text-cc-text-secondary">
                    {filtersActive
                      ? 'No tasks match these filters. Clear them to see everything on your plate.'
                      : 'No tasks yet. Create your first task to start tracking the work.'}
                  </p>
                  {/* No second lime here: the header "Create task" is the surface's single
                      lime primary (action hierarchy). When filtered, offer a ghost Clear. */}
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
                tasks.map((task) => {
                  const title = task.title || 'Untitled task';
                  const account = task.account_name || humanizeEnum(task.entity_type) || 'No account';
                  const assigneeLabel = taskAssigneeLabel(task.assignee_name, null, task.assignee_id);
                  const band = dueBand(task.due_at, task.completed_at);
                  return (
                    <div
                      key={task.id}
                      className="flex items-stretch border-b border-cc-border-subtle last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleRowClick(task)}
                        disabled={loadingTaskId === task.id}
                        className={cn(
                          'flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 text-left transition-colors duration-fast hover:bg-cc-surface-raised',
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cc-focus-ring focus-visible:ring-inset',
                          'md:grid md:items-center md:gap-4',
                          loadingTaskId === task.id && 'opacity-60',
                          COLS,
                        )}
                      >
                        {/* Title (carries status + priority inline on mobile) */}
                        <div className="min-w-0">
                          <div className="font-semibold text-cc-text-primary break-words">{title}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 md:hidden">
                            <StatusPill status={task.status} />
                            <Chip>{humanizeEnum(task.priority)}</Chip>
                            <span className="text-xs text-cc-text-muted">{assigneeLabel}</span>
                          </div>
                        </div>

                        {/* Account / entity */}
                        <div className="truncate text-sm text-cc-text-muted">{account}</div>

                        <div className="truncate text-sm text-cc-text-secondary">{assigneeLabel}</div>

                        <div className="hidden md:block">
                          <StatusPill status={task.status} />
                        </div>

                        {/* Priority is a neutral chip: the word carries the level, not color */}
                        <div className="hidden md:block">
                          {task.priority ? <Chip>{humanizeEnum(task.priority)}</Chip> : null}
                        </div>

                        {/* Due: banded date. Overdue is danger + the word "Overdue" */}
                        <div className="cc-num hidden text-sm md:flex md:items-center md:gap-1.5">
                          {band ? (
                            <span style={{ color: band.color }} className={band.overdue ? 'font-semibold' : undefined}>
                              {band.label}
                            </span>
                          ) : (
                            <span className="text-cc-text-muted">No due date</span>
                          )}
                        </div>
                      </button>

                      {isOpenTask(task.status) && (
                        <div className="flex shrink-0 items-center border-l border-cc-border-subtle px-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => handleMarkDone(e, task.id)}
                            disabled={markingDoneId === task.id}
                            className="gap-1.5 rounded-cc-md border-cc-border-interactive bg-transparent text-cc-text-secondary hover:bg-cc-surface-overlay hover:text-cc-text-primary"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Mark done
                          </Button>
                        </div>
                      )}
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
        ) : view === 'kanban' ? (
          <TaskKanbanBoard scope={scope} />
        ) : view === 'calendar' ? (
          <TaskCalendarView scope={scope} />
        ) : (
          <TaskAnalyticsDashboard scope={scope} />
        )}

        <TaskForm
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateTask}
        />

        <TaskEditModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          task={selectedTask}
          onTaskUpdate={handleTaskUpdate}
        />
      </div>
    </AppLayout>
  );
}
