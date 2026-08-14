import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

function makeTasksQuery(
  resolveValue: () => { data: unknown[]; error: null },
  options?: { defer?: boolean },
) {
  let deferredResolve: (value: { data: unknown[]; error: null }) => void;
  const deferred = options?.defer
    ? new Promise<{ data: unknown[]; error: null }>((resolve) => {
        deferredResolve = resolve;
      })
    : null;

  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.is = vi.fn(chain);
  query.order = vi.fn(chain);
  query.eq = vi.fn(chain);
  query.or = vi.fn(chain);
  query.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    (deferred ?? Promise.resolve(resolveValue())).then(onFulfilled, onRejected);

  return {
    query,
    resolveDeferred: () => deferredResolve!(resolveValue()),
  };
}

describe('useTasks assignee enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads profiles for assignee_id and attaches assignee on each task', async () => {
    const taskRows = [
      {
        id: 'task-1',
        title: 'Bind policy',
        status: 'pending',
        priority: 'medium',
        assignee_id: 'user-alex',
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T00:00:00Z',
      },
    ];

    const { query: tasksQuery } = makeTasksQuery(() => ({ data: taskRows, error: null }));

    const profilesQuery = {
      in: vi.fn().mockResolvedValue({
        data: [{ id: 'user-alex', full_name: 'Alex Producer' }],
        error: null,
      }),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'tasks') {
        return { select: vi.fn().mockReturnValue(tasksQuery) } as never;
      }
      if (table === 'profiles') {
        return { select: vi.fn().mockReturnValue(profilesQuery) } as never;
      }
      return {} as never;
    });

    const { result } = renderHook(() => useTasks());

    await act(async () => {
      await result.current.fetchTasks();
    });

    await waitFor(() => {
      expect(result.current.tasks[0]?.assignee?.full_name).toBe('Alex Producer');
    });

    expect(tasksQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(profilesQuery.in).toHaveBeenCalledWith('id', ['user-alex']);
  });

  it('does not let a stale office response overwrite a newer mine response', async () => {
    const { query: officeQuery, resolveDeferred: resolveOffice } = makeTasksQuery(
      () => ({
        data: [{ id: 'office-1', title: 'Office task', assignee_id: 'other-user' }],
        error: null,
      }),
      { defer: true },
    );

    const { query: mineQuery } = makeTasksQuery(() => ({
      data: [{ id: 'mine-1', title: 'Mine task', assignee_id: null }],
      error: null,
    }));

    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-1' } },
    } as never);

    let tasksSelectCount = 0;
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'tasks') {
        tasksSelectCount += 1;
        const query = tasksSelectCount === 1 ? officeQuery : mineQuery;
        return { select: vi.fn().mockReturnValue(query) } as never;
      }
      return { select: vi.fn() } as never;
    });

    const { result } = renderHook(() => useTasks());

    await act(async () => {
      const officeFetch = result.current.fetchTasks({ scope: 'office' });
      const mineFetch = result.current.fetchTasks({ scope: 'mine' });
      await mineFetch;
      resolveOffice();
      await officeFetch;
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
    });
    expect(result.current.tasks[0]?.id).toBe('mine-1');
    expect(mineQuery.or).toHaveBeenCalledWith('assignee_id.eq.user-1,assignee_id.is.null');
  });
});
