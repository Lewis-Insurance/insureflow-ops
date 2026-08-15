import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { useCanopyImportStats } from '@/hooks/useCanopyImportStats';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.then = (onFulfilled: (value: { count: number; data: null; error: null }) => unknown) =>
    Promise.resolve({ count, data: null, error: null }).then(onFulfilled);
  return chain;
}

function mockCanopyImportStatsSupabase({
  totalImports = 47,
  completedImports = 38,
  leadsCreated = 31,
}: {
  totalImports?: number;
  completedImports?: number;
  leadsCreated?: number;
} = {}) {
  const selectCalls: SelectCall[] = [];
  let countQueryIndex = 0;
  const countValues = [totalImports, completedImports, leadsCreated];

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table !== 'canopy_pulls') {
      return {} as never;
    }

    return {
      select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
        selectCalls.push({ table, columns, options });

        if (options?.count === 'exact' && options?.head) {
          const count = countValues[countQueryIndex] ?? 0;
          countQueryIndex += 1;
          return createCountChain(count);
        }

        return {} as never;
      }),
    } as never;
  });

  return { selectCalls };
}

describe('useCanopyImportStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests exact counts with head: true and returns uncapped totals', async () => {
    const { selectCalls } = mockCanopyImportStatsSupabase({
      totalImports: 47,
      completedImports: 38,
      leadsCreated: 31,
    });

    const { result } = renderHook(() => useCanopyImportStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.totalImports).toBe(47);
    expect(result.current.data?.completedImports).toBe(38);
    expect(result.current.data?.leadsCreated).toBe(31);

    expect(selectCalls).toHaveLength(3);
    selectCalls.forEach((call) => {
      expect(call.table).toBe('canopy_pulls');
      expect(call.columns).toBe('*');
      expect(call.options).toEqual({ count: 'exact', head: true });
    });
  });

  it('applies status and lead_id filters on count queries', async () => {
    const eqCalls: Array<[string, string]> = [];
    const notCalls: Array<[string, string, null]> = [];

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table !== 'canopy_pulls') {
        return {} as never;
      }

      return {
        select: vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
          if (options?.count === 'exact' && options?.head) {
            const chain = createCountChain(1);
            chain.eq = vi.fn((column: string, value: string) => {
              eqCalls.push([column, value]);
              return chain;
            });
            chain.not = vi.fn((column: string, operator: string, value: null) => {
              notCalls.push([column, operator, value]);
              return chain;
            });
            return chain;
          }
          return {} as never;
        }),
      } as never;
    });

    const { result } = renderHook(() => useCanopyImportStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(eqCalls).toEqual([['status', 'complete']]);
    expect(notCalls).toEqual([['lead_id', 'is', null]]);
  });

  it('throws when a count query errors', async () => {
    const errorChain: Record<string, unknown> = {};
    errorChain.eq = vi.fn(() => errorChain);
    errorChain.not = vi.fn(() => errorChain);
    errorChain.then = (resolve: (value: { count: null; data: null; error: { message: string } }) => void) =>
      Promise.resolve({ count: null, data: null, error: { message: 'count failed' } }).then(resolve);

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => errorChain),
    } as never);

    const { result } = renderHook(() => useCanopyImportStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Failed to fetch Canopy import stats: count failed');
  });
});
