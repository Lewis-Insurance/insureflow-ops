import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/tasks/TaskEditModal', () => ({ TaskEditModal: () => null }));

const fetchTasks = vi.fn().mockResolvedValue([]);

vi.mock('@/hooks/useTasks', () => ({
  useTasks: vi.fn(),
}));

import { TaskKanbanBoard } from '@/components/tasks/TaskKanbanBoard';
import { useTasks } from '@/hooks/useTasks';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskKanbanBoard assignee display', () => {
  it('shows the assignee name when profiles are loaded on the task', () => {
    vi.mocked(useTasks).mockReturnValue({
      tasks: [
        {
          id: 'task-k1',
          title: 'Review endorsement',
          status: 'pending',
          priority: 'medium',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          assignee_id: 'user-alex',
          assignee: { id: 'user-alex', full_name: 'Alex Producer' },
        },
      ],
      loading: false,
      fetchTasks,
      updateTask: vi.fn(),
    } as ReturnType<typeof useTasks>);

    render(<TaskKanbanBoard />);

    expect(screen.getByText('Alex Producer')).toBeInTheDocument();
  });

  it('shows Unclaimed when assignee has no display name', () => {
    vi.mocked(useTasks).mockReturnValue({
      tasks: [
        {
          id: 'task-k2',
          title: 'Call insured',
          status: 'pending',
          priority: 'low',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          assignee_id: null,
          assignee: null,
        },
      ],
      loading: false,
      fetchTasks,
      updateTask: vi.fn(),
    } as ReturnType<typeof useTasks>);

    render(<TaskKanbanBoard />);

    expect(screen.getByText('Unclaimed')).toBeInTheDocument();
  });

  it('fetches with the active scope from TasksPage', async () => {
    vi.mocked(useTasks).mockReturnValue({
      tasks: [],
      loading: false,
      fetchTasks,
      updateTask: vi.fn(),
    } as ReturnType<typeof useTasks>);

    render(<TaskKanbanBoard scope="unclaimed" />);

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledWith({ scope: 'unclaimed' });
    });
  });
});
