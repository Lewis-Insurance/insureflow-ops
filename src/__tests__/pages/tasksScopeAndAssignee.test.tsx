import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/tasks/TaskKanbanBoard', () => ({ TaskKanbanBoard: () => null }));
vi.mock('@/components/tasks/TaskCalendarView', () => ({ TaskCalendarView: () => null }));
vi.mock('@/components/tasks/TaskAnalyticsDashboard', () => ({ TaskAnalyticsDashboard: () => null }));
vi.mock('@/components/tasks/TaskForm', () => ({ TaskForm: () => null }));
vi.mock('@/hooks/useTasks', () => ({
  useTasks: vi.fn(() => ({ createTask: vi.fn() })),
}));

const fetchTasks = vi.fn().mockResolvedValue(undefined);
const fetchNextPage = vi.fn();

vi.mock('@/hooks/useTaskSearch', () => ({
  useTaskSearch: vi.fn(() => ({
    tasks: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    fetchTasks,
    fetchNextPage,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useTaskTriageCounts', () => ({
  useTaskTriageCounts: vi.fn(() => ({
    counts: {
      open_total: 2,
      overdue: 1,
      due_this_week: 0,
      high_priority: 0,
      completed: 0,
    },
    loading: false,
    refetch: vi.fn(),
  })),
}));

import TasksPage from '@/pages/TasksPage';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { useTaskTriageCounts } from '@/hooks/useTaskTriageCounts';

function renderWithTasks(tasks: Array<Record<string, unknown>>) {
  vi.mocked(useTaskSearch).mockReturnValue({
    tasks,
    loading: false,
    loadingMore: false,
    hasMore: false,
    fetchTasks,
    fetchNextPage,
    refetch: vi.fn(),
  } as ReturnType<typeof useTaskSearch>);

  return render(
    <MemoryRouter initialEntries={['/tasks']}>
      <TasksPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useTaskTriageCounts).mockReturnValue({
    counts: {
      open_total: 2,
      overdue: 1,
      due_this_week: 0,
      high_priority: 0,
      completed: 0,
    },
    loading: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useTaskTriageCounts>);
});

describe('TasksPage scope and assignee', () => {
  it('renders Unclaimed when assignee_name is null', () => {
    renderWithTasks([
      {
        id: 'task-1',
        title: 'Follow up quote',
        status: 'pending',
        priority: 'medium',
        due_at: null,
        entity_type: 'account',
        account_id: 'acct-1',
        account_name: 'Acme LLC',
        created_at: '2026-08-01T00:00:00Z',
        completed_at: null,
        assignee_id: null,
        assignee_name: null,
      },
    ]);

    expect(screen.getAllByText('Unclaimed').length).toBeGreaterThan(0);
  });

  it('renders assignee name when present', () => {
    renderWithTasks([
      {
        id: 'task-2',
        title: 'Bind policy',
        status: 'in_progress',
        priority: 'high',
        due_at: '2026-08-20T00:00:00Z',
        entity_type: 'policy',
        account_id: 'acct-2',
        account_name: 'Beta Corp',
        created_at: '2026-08-01T00:00:00Z',
        completed_at: null,
        assignee_id: 'user-alex',
        assignee_name: 'Alex Producer',
      },
    ]);

    expect(screen.getAllByText('Alex Producer').length).toBeGreaterThan(0);
  });

  it('scope control changes fetch scope', async () => {
    const user = userEvent.setup();
    renderWithTasks([]);

    await user.click(screen.getByRole('button', { name: 'Unclaimed' }));

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledWith('', 'due_asc', undefined, 'unclaimed');
    });
  });

  it('defaults to mine scope subtitle when no URL param', () => {
    renderWithTasks([]);
    expect(screen.getByText(/Yours and unclaimed\./)).toBeInTheDocument();
  });
});
