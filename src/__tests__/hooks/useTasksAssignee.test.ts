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

describe('useTasks assignee enrichment', () => {
  const tasksQuery = {
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    tasksQuery.order.mockReturnValue(tasksQuery);
    tasksQuery.eq.mockReturnValue(tasksQuery);
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

    tasksQuery.order.mockImplementation(() =>
      Promise.resolve({ data: taskRows, error: null }),
    );

    const profilesQuery = {
      in: vi.fn().mockResolvedValue({
        data: [{ id: 'user-alex', full_name: 'Alex Producer' }],
        error: null,
      }),
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnValue(tasksQuery),
        } as never;
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue(profilesQuery),
        } as never;
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

    expect(profilesQuery.in).toHaveBeenCalledWith('id', ['user-alex']);
  });
});
