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

vi.mock('@/components/tasks/TaskEditModal', () => ({
  TaskEditModal: ({
    open,
    onTaskUpdate,
  }: {
    open: boolean;
    onTaskUpdate: () => void;
  }) =>
    open ? (
      <div data-testid="task-edit-modal">
        <button type="button" onClick={onTaskUpdate}>
          Save task
        </button>
      </div>
    ) : null,
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('@/hooks/useTasks', () => ({
  useTasks: vi.fn(() => ({ createTask: vi.fn() })),
}));

const fetchTasks = vi.fn().mockResolvedValue(undefined);
const fetchNextPage = vi.fn();
const listRefetch = vi.fn();
const triageRefetch = vi.fn();

vi.mock('@/hooks/useTaskSearch', () => ({
  useTaskSearch: vi.fn(() => ({
    tasks: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    fetchTasks,
    fetchNextPage,
    refetch: listRefetch,
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
    refetch: triageRefetch,
  })),
}));

import TasksPage from '@/pages/TasksPage';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { useTaskTriageCounts } from '@/hooks/useTaskTriageCounts';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

function mockTaskFetch() {
  const tasksSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'task-1',
      title: 'Follow up quote',
      status: 'pending',
      priority: 'medium',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
      assignee_id: null,
    },
    error: null,
  });

  const tasksChain: Record<string, unknown> = {};
  const chain = () => tasksChain;
  tasksChain.select = vi.fn(chain);
  tasksChain.eq = vi.fn(chain);
  tasksChain.is = vi.fn(chain);
  tasksChain.single = tasksSingle;

  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const updateChain: Record<string, unknown> = { eq: updateEq };
  const updateFn = vi.fn().mockReturnValue(updateChain);

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'tasks') {
      return {
        select: vi.fn().mockReturnValue(tasksChain),
        update: updateFn,
      } as never;
    }
    return {} as never;
  });

  return { tasksSingle, tasksChain, updateFn, updateEq };
}

function renderWithTasks(tasks: Array<Record<string, unknown>>) {
  vi.mocked(useTaskSearch).mockReturnValue({
    tasks,
    loading: false,
    loadingMore: false,
    hasMore: false,
    fetchTasks,
    fetchNextPage,
    refetch: listRefetch,
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
    refetch: triageRefetch,
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

  it('renders Assigned when assignee_id is set but assignee_name is blank', () => {
    renderWithTasks([
      {
        id: 'task-1b',
        title: 'Empty assignee name',
        status: 'pending',
        priority: 'low',
        due_at: null,
        entity_type: 'account',
        account_id: 'acct-1',
        account_name: 'Acme LLC',
        created_at: '2026-08-01T00:00:00Z',
        completed_at: null,
        assignee_id: 'user-1',
        assignee_name: '   ',
      },
    ]);

    expect(screen.getAllByText('Assigned').length).toBeGreaterThan(0);
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
      expect(fetchTasks).toHaveBeenCalledWith('', 'due_asc', undefined, 'unclaimed', false);
    });
  });

  it('defaults to mine scope subtitle when no URL param', () => {
    renderWithTasks([]);
    expect(screen.getByText('Work queue. Click a row to open it.')).toBeInTheDocument();
    expect(screen.getByText(/Yours and unclaimed\./)).toBeInTheDocument();
  });

  it('renders each list row as a button with type="button"', () => {
    renderWithTasks([
      {
        id: 'task-row',
        title: 'Open editor row',
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

    const row = screen.getByRole('button', { name: /Open editor row/i });
    expect(row).toHaveAttribute('type', 'button');
  });

  it('clicking a list row opens TaskEditModal after fetching the full task', async () => {
    const user = userEvent.setup();
    const { tasksChain } = mockTaskFetch();
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

    await user.click(screen.getByRole('button', { name: /Follow up quote/i }));

    await waitFor(() => {
      expect(tasksChain.eq).toHaveBeenCalledWith('id', 'task-1');
      expect(screen.getByTestId('task-edit-modal')).toBeInTheDocument();
    });
  });

  it('onTaskUpdate refetches the list and triage counts and dispatches tasks:updated', async () => {
    const user = userEvent.setup();
    mockTaskFetch();
    const updatedListener = vi.fn();
    window.addEventListener('tasks:updated', updatedListener);

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

    await user.click(screen.getByRole('button', { name: /Follow up quote/i }));
    await waitFor(() => {
      expect(screen.getByTestId('task-edit-modal')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Save task' }));

    expect(listRefetch).toHaveBeenCalled();
    expect(triageRefetch).toHaveBeenCalled();
    expect(updatedListener).toHaveBeenCalled();

    window.removeEventListener('tasks:updated', updatedListener);
  });

  it('mark done does not open modal and refetches list and triage counts', async () => {
    const user = userEvent.setup();
    const { updateFn, updateEq } = mockTaskFetch();
    const updatedListener = vi.fn();
    window.addEventListener('tasks:updated', updatedListener);

    renderWithTasks([
      {
        id: 'task-open',
        title: 'Pending task item',
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

    await user.click(screen.getByRole('button', { name: /Mark done/i }));

    await waitFor(() => {
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          completed_at: expect.any(String),
        }),
      );
      expect(updateEq).toHaveBeenCalledWith('id', 'task-open');
      expect(listRefetch).toHaveBeenCalled();
      expect(triageRefetch).toHaveBeenCalled();
      expect(updatedListener).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('task-edit-modal')).not.toBeInTheDocument();

    window.removeEventListener('tasks:updated', updatedListener);
  });

  it('does not show mark done for completed tasks', () => {
    renderWithTasks([
      {
        id: 'task-done',
        title: 'Already done',
        status: 'completed',
        priority: 'low',
        due_at: null,
        entity_type: 'account',
        account_id: 'acct-1',
        account_name: 'Acme LLC',
        created_at: '2026-08-01T00:00:00Z',
        completed_at: '2026-08-02T00:00:00Z',
        assignee_id: null,
        assignee_name: null,
      },
    ]);

    expect(screen.queryByRole('button', { name: /Mark done/i })).not.toBeInTheDocument();
  });

  it('toasts when full task fetch fails and does not open the modal', async () => {
    const user = userEvent.setup();
    const tasksChain: Record<string, unknown> = {};
    const chain = () => tasksChain;
    tasksChain.select = vi.fn(chain);
    tasksChain.eq = vi.fn(chain);
    tasksChain.is = vi.fn(chain);
    tasksChain.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'tasks') {
        return { select: vi.fn().mockReturnValue(tasksChain) } as never;
      }
      return {} as never;
    });

    renderWithTasks([
      {
        id: 'task-missing',
        title: 'Missing task row',
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

    await user.click(screen.getByRole('button', { name: /Missing task row/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          description: 'Could not open this task.',
          variant: 'destructive',
        }),
      );
    });

    expect(screen.queryByTestId('task-edit-modal')).not.toBeInTheDocument();
  });
});
