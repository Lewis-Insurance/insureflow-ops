import type { SuspenseSweepItem, SuspenseTaskRow } from '../types.ts';

const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 100,
  high: 75,
  medium: 40,
  low: 10,
};

const OPEN_STATUSES = new Set(['pending', 'in_progress']);

function hoursOverdue(dueAt: string | null, now: Date): number {
  if (!dueAt) return 0;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return 0;
  const diffMs = now.getTime() - due;
  return diffMs > 0 ? diffMs / (1000 * 60 * 60) : 0;
}

/** Play 3 stub: rank open tasks for owner nudges. Internal Tier 1-2. */
export function runSuspenseSweepPlay(
  tasks: SuspenseTaskRow[],
  now: Date = new Date(),
  limit = 10,
): SuspenseSweepItem[] {
  const open = tasks.filter((task) => OPEN_STATUSES.has(task.status.toLowerCase()));

  const ranked = open
    .map((task) => {
      const overdueHours = hoursOverdue(task.due_at, now);
      const priorityWeight = PRIORITY_WEIGHT[task.priority.toLowerCase()] ?? 20;
      const premiumWeight = Math.min(50, (task.premium_hint ?? 0) / 100);
      const severity_score = priorityWeight + overdueHours + premiumWeight;
      const reason =
        overdueHours > 0
          ? `Overdue ${Math.floor(overdueHours)}h · ${task.priority} priority`
          : `${task.priority} priority · due soon`;

      return {
        task_id: task.id,
        title: task.title,
        owner_id: task.assignee_id,
        severity_score,
        reason,
      };
    })
    .sort((a, b) => b.severity_score - a.severity_score);

  return ranked.slice(0, limit);
}
