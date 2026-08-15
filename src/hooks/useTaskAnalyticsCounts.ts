import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TaskScope } from '@/hooks/useTriageCohortFromUrl';
import type { TaskCategory, TaskPriority, TaskStatus } from '@/hooks/useTasks';

export interface TaskAnalyticsCounts {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  byCategory: Record<TaskCategory, number>;
  overdue: number;
  completionRate: number;
}

type CountFilter = {
  status?: TaskStatus;
  priority?: TaskPriority;
  category?: TaskCategory;
  overdue?: boolean;
};

async function resolveScopeUserId(scope?: TaskScope): Promise<string | null> {
  if (scope !== 'mine') {
    return null;
  }

  const { data: authData } = await supabase.auth.getUser();
  return authData.user?.id ?? null;
}

async function countTasks(
  scope: TaskScope | undefined,
  userId: string | null,
  filter?: CountFilter,
): Promise<number> {
  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (scope === 'unclaimed') {
    query = query.is('assignee_id', null);
  } else if (scope === 'mine') {
    if (userId) {
      query = query.or(`assignee_id.eq.${userId},assignee_id.is.null`);
    } else {
      query = query.is('assignee_id', null);
    }
  }

  if (filter?.status) {
    query = query.eq('status', filter.status);
  }

  if (filter?.priority) {
    query = query.eq('priority', filter.priority);
  }

  if (filter?.category) {
    query = query.eq('category', filter.category);
  }

  if (filter?.overdue) {
    query = query
      .in('status', ['pending', 'in_progress'])
      .not('due_at', 'is', null)
      .lt('due_at', new Date().toISOString());
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch task analytics counts: ${error.message}`);
  }

  return count ?? 0;
}

export function useTaskAnalyticsCounts(scope?: TaskScope) {
  return useQuery({
    queryKey: ['task-analytics-counts', scope ?? 'office'],
    queryFn: async (): Promise<TaskAnalyticsCounts> => {
      const userId = await resolveScopeUserId(scope);

      const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];
      const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
      const categories: TaskCategory[] = [
        'quote',
        'policy',
        'claim',
        'renewal',
        'service',
        'general',
      ];

      const [
        total,
        overdue,
        pending,
        inProgress,
        completed,
        cancelled,
        low,
        medium,
        high,
        urgent,
        quote,
        policy,
        claim,
        renewal,
        service,
        general,
      ] = await Promise.all([
        countTasks(scope, userId),
        countTasks(scope, userId, { overdue: true }),
        ...statuses.map((status) => countTasks(scope, userId, { status })),
        ...priorities.map((priority) => countTasks(scope, userId, { priority })),
        ...categories.map((category) => countTasks(scope, userId, { category })),
      ]);

      return {
        total,
        byStatus: {
          pending,
          in_progress: inProgress,
          completed,
          cancelled,
        },
        byPriority: {
          low,
          medium,
          high,
          urgent,
        },
        byCategory: {
          quote,
          policy,
          claim,
          renewal,
          service,
          general,
        },
        overdue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
