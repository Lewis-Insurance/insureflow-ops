import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

const officeRow = {
  id: 'office-1',
  title: 'Office task',
  status: 'pending',
  priority: 'medium',
  due_at: null,
  entity_type: 'account',
  account_id: 'acct-1',
  account_name: 'Office Co',
  created_at: '2026-08-01T00:00:00Z',
  completed_at: null,
  assignee_id: 'other-user',
  assignee_name: 'Other Agent',
};

const mineRow = {
  id: 'mine-1',
  title: 'Mine task',
  status: 'pending',
  priority: 'medium',
  due_at: null,
  entity_type: 'account',
  account_id: 'acct-2',
  account_name: 'Mine Co',
  created_at: '2026-08-01T00:00:00Z',
  completed_at: null,
  assignee_id: null,
  assignee_name: null,
};

describe('useTaskSearch request sequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not auto-fetch on mount (TasksPage owns the first scoped request)', () => {
    renderHook(() => useTaskSearch());
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('ignores a stale unscoped office response when a newer mine fetch wins', async () => {
    let resolveOffice!: (value: { data: typeof officeRow[]; error: null }) => void;
    let resolveMine!: (value: { data: typeof mineRow[]; error: null }) => void;

    const officePromise = new Promise<{ data: typeof officeRow[]; error: null }>((resolve) => {
      resolveOffice = resolve;
    });
    const minePromise = new Promise<{ data: typeof mineRow[]; error: null }>((resolve) => {
      resolveMine = resolve;
    });

    vi.mocked(supabase.rpc)
      .mockReturnValueOnce(officePromise as never)
      .mockReturnValueOnce(minePromise as never);

    const { result } = renderHook(() => useTaskSearch());

    await act(async () => {
      const officeFetch = result.current.fetchTasks('', 'due_asc', undefined, 'office');
      const mineFetch = result.current.fetchTasks('', 'due_asc', undefined, 'mine');

      resolveMine({ data: [mineRow], error: null });
      await mineFetch;

      resolveOffice({ data: [officeRow], error: null });
      await officeFetch;
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]?.id).toBe('mine-1');
  });
});
