import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

import { useConversionFunnel } from '@/hooks/useLeadAnalytics';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
  filters: Array<[string, string, unknown]>;
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function mockFunnelCounts(counts: number[], errorAt?: number) {
  const calls: SelectCall[] = [];
  let countIndex = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => ({
    select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
      const call: SelectCall = { table, columns, options, filters: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};

      for (const method of ['is', 'gte', 'lte', 'eq', 'in'] as const) {
        chain[method] = vi.fn((column: string, value: unknown) => {
          call.filters.push([method, column, value]);
          return chain;
        });
      }

      const index = countIndex++;
      const error = index === errorAt ? new Error('count failed') : null;
      chain.then = (resolve: (value: { count: number; data: null; error: Error | null }) => unknown) =>
        Promise.resolve({ count: counts[index] ?? 0, data: null, error }).then(resolve);
      return chain;
    }),
  }) as never);

  return calls;
}

describe('useConversionFunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses exact head counts beyond the row cap with cumulative status filters', async () => {
    const calls = mockFunnelCounts([5001, 4200, 3100, 2200, 1200]);
    const { result } = renderHook(() => useConversionFunnel(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      { stage: 'New Leads', count: 5001, percentage: 100, dropoff: 0 },
      { stage: 'Contacted', count: 4200, percentage: (4200 / 5001) * 100, dropoff: 801 },
      { stage: 'Qualified', count: 3100, percentage: (3100 / 5001) * 100, dropoff: 1100 },
      { stage: 'Quoted', count: 2200, percentage: (2200 / 5001) * 100, dropoff: 900 },
      { stage: 'Won', count: 1200, percentage: (1200 / 5001) * 100, dropoff: 1000 },
    ]);

    expect(calls).toHaveLength(5);
    calls.forEach((call) => {
      expect(call.table).toBe('leads');
      expect(call.columns).toBe('id');
      expect(call.options).toEqual({ count: 'exact', head: true });
      expect(call.filters[0]).toEqual(['is', 'deleted_at', null]);
    });
    expect(calls.map((call) => call.filters.slice(1))).toEqual([
      [],
      [['in', 'status', ['contacted', 'qualified', 'quoted', 'nurturing', 'won']]],
      [['in', 'status', ['qualified', 'quoted', 'nurturing', 'won']]],
      [['in', 'status', ['quoted', 'nurturing', 'won']]],
      [['eq', 'status', 'won']],
    ]);
  });

  it('applies the optional created_at range to every count', async () => {
    const calls = mockFunnelCounts([50, 40, 30, 20, 10]);
    const dateRange = { start: '2026-01-01T00:00:00Z', end: '2026-01-31T23:59:59Z' };
    const { result } = renderHook(() => useConversionFunnel(dateRange), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    calls.forEach((call) => {
      expect(call.filters).toContainEqual(['is', 'deleted_at', null]);
      expect(call.filters).toContainEqual(['gte', 'created_at', dateRange.start]);
      expect(call.filters).toContainEqual(['lte', 'created_at', dateRange.end]);
    });
  });

  it('surfaces a failed count query', async () => {
    mockFunnelCounts([50, 40, 30, 20, 10], 2);
    const { result } = renderHook(() => useConversionFunnel(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('count failed'));
  });
});
