import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

import { useTaskAnalyticsCounts } from '@/hooks/useTaskAnalyticsCounts';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
}

interface MockCounts {
  total: number;
  overdue: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
}

function createQueryableChain(resolve: () => number) {
  const chain: Record<string, unknown> = {};
  const methods = ['is', 'eq', 'or', 'in', 'not', 'lt'] as const;

  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }

  chain.then = (onFulfilled: (value: { count: number; data: null; error: null }) => unknown) =>
    Promise.resolve({ count: resolve(), data: null, error: null }).then(onFulfilled);

  return chain;
}

function mockTaskAnalyticsSupabase(
  counts: MockCounts,
  { userId = 'user-123' }: { userId?: string | null } = {},
) {
  const selectCalls: SelectCall[] = [];
  let queryIndex = 0;

  const queryKinds = [
    'total',
    'overdue',
    'status:pending',
    'status:in_progress',
    'status:completed',
    'status:cancelled',
    'priority:low',
    'priority:medium',
    'priority:high',
    'priority:urgent',
    'category:quote',
    'category:policy',
    'category:claim',
    'category:renewal',
    'category:service',
    'category:general',
  ] as const;

  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: null,
  } as never);

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table !== 'tasks') {
      return {} as never;
    }

    return {
      select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
        selectCalls.push({ table, columns, options });
        const kind = queryKinds[queryIndex] ?? 'total';
        queryIndex += 1;

        const resolve = () => {
          if (kind === 'total') return counts.total;
          if (kind === 'overdue') return counts.overdue;
          if (kind.startsWith('status:')) {
            return counts.byStatus[kind.split(':')[1]] ?? 0;
          }
          if (kind.startsWith('priority:')) {
            return counts.byPriority[kind.split(':')[1]] ?? 0;
          }
          if (kind.startsWith('category:')) {
            return counts.byCategory[kind.split(':')[1]] ?? 0;
          }
          return 0;
        };

        return createQueryableChain(resolve);
      }),
    } as never;
  });

  return { selectCalls };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const DEFAULT_COUNTS: MockCounts = {
  total: 2500,
  overdue: 87,
  byStatus: { pending: 900, in_progress: 400, completed: 1100, cancelled: 100 },
  byPriority: { low: 500, medium: 1200, high: 600, urgent: 200 },
  byCategory: {
    quote: 300,
    policy: 800,
    claim: 200,
    renewal: 400,
    service: 500,
    general: 300,
  },
};

describe('useTaskAnalyticsCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests exact counts with head: true and returns uncapped totals above 1000', async () => {
    const { selectCalls } = mockTaskAnalyticsSupabase(DEFAULT_COUNTS);

    const { result } = renderHook(() => useTaskAnalyticsCounts('office'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total).toBe(2500);
    expect(result.current.data?.overdue).toBe(87);
    expect(result.current.data?.byStatus.completed).toBe(1100);
    expect(result.current.data?.completionRate).toBe(44);
    expect(result.current.data?.byCategory.policy).toBe(800);

    expect(selectCalls).toHaveLength(16);
    selectCalls.forEach((call) => {
      expect(call.table).toBe('tasks');
      expect(call.columns).toBe('*');
      expect(call.options).toEqual({ count: 'exact', head: true });
    });

    const rowFetchCalls = selectCalls.filter(
      (call) => call.options?.head !== true || call.options?.count !== 'exact',
    );
    expect(rowFetchCalls).toHaveLength(0);
  });

  it('applies mine scope filter with assignee or unclaimed', async () => {
    const { selectCalls } = mockTaskAnalyticsSupabase(DEFAULT_COUNTS, { userId: 'user-abc' });

    const { result } = renderHook(() => useTaskAnalyticsCounts('mine'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.auth.getUser).toHaveBeenCalled();

    const firstChain = vi.mocked(supabase.from).mock.results[0]?.value as {
      select: ReturnType<typeof vi.fn>;
    };
    const queryChain = firstChain.select.mock.results[0]?.value as {
      or: ReturnType<typeof vi.fn>;
    };
    expect(queryChain.or).toHaveBeenCalledWith('assignee_id.eq.user-abc,assignee_id.is.null');
    expect(selectCalls).toHaveLength(16);
  });

  it('applies unclaimed scope filter', async () => {
    mockTaskAnalyticsSupabase(DEFAULT_COUNTS);

    const { result } = renderHook(() => useTaskAnalyticsCounts('unclaimed'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const firstChain = vi.mocked(supabase.from).mock.results[0]?.value as {
      select: ReturnType<typeof vi.fn>;
    };
    const queryChain = firstChain.select.mock.results[0]?.value as {
      is: ReturnType<typeof vi.fn>;
    };
    expect(queryChain.is).toHaveBeenCalledWith('assignee_id', null);
  });

  it('throws when a count query errors', async () => {
    const errorChain: Record<string, unknown> = {};
    const methods = ['is', 'eq', 'or', 'in', 'not', 'lt'] as const;
    for (const method of methods) {
      errorChain[method] = vi.fn(() => errorChain);
    }
    errorChain.then = (resolve: (value: { count: null; data: null; error: { message: string } }) => void) =>
      Promise.resolve({ count: null, data: null, error: { message: 'count failed' } }).then(resolve);

    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as never);

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => errorChain),
    } as never);

    const { result } = renderHook(() => useTaskAnalyticsCounts('office'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Failed to fetch task analytics counts: count failed');
  });
});
