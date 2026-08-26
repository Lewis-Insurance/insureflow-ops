import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { useCommandCenterCounts } from '@/hooks/useCommandCenterCounts';
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

function formatRuntimeLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addRuntimeLocalDays(date: Date, days: number) {
  return formatRuntimeLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

function mockCounts(counts: number[], errorAt?: number) {
  const calls: SelectCall[] = [];
  let countIndex = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => ({
    select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
      const call: SelectCall = { table, columns, options, filters: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const method of ['eq', 'lt', 'gte', 'lte', 'in', 'is', 'neq'] as const) {
        chain[method] = vi.fn((column: string, value: unknown) => {
          call.filters.push([method, column, value]);
          return chain;
        });
      }
      const count = counts[countIndex++] ?? 0;
      const error = calls.length - 1 === errorAt ? new Error('count failed') : null;
      chain.then = (resolve: (value: { count: number; data: null; error: Error | null }) => unknown) =>
        Promise.resolve({ count, data: null, error }).then(resolve);
      return chain;
    }),
  }) as never);

  return calls;
}

describe('useCommandCenterCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the current tile filters with exact head counts beyond the row cap', async () => {
    const before = new Date();
    const calls = mockCounts([1501, 1201, 2200, 1100, 3300, 1300]);
    const { result } = renderHook(() => useCommandCenterCounts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const after = new Date();

    expect(result.current.data).toEqual({
      openQuotes: 1501,
      criticalQuotes: 1201,
      upcomingRenewals: 2200,
      urgentRenewals: 1100,
      activeTasks: 3300,
      overdueTasks: 1300,
      escalations: 2304,
    });

    expect(calls).toHaveLength(6);
    calls.forEach((call) => {
      expect(call.columns).toBe('id');
      expect(call.options).toEqual({ count: 'exact', head: true });
    });

    const today = formatRuntimeLocalDate(before);
    expect(calls.map((call) => [call.table, call.filters])).toEqual([
      ['quotes', [['eq', 'status', 'open']]],
      ['quotes', [
        ['eq', 'status', 'open'],
        ['lt', 'created_at', expect.any(String)],
      ]],
      ['policies', [
        ['gte', 'expiration_date', today],
        ['lte', 'expiration_date', addRuntimeLocalDays(before, 30)],
        ['in', 'status', ['active', 'pending']],
      ]],
      ['policies', [
        ['gte', 'expiration_date', today],
        ['lte', 'expiration_date', addRuntimeLocalDays(before, 7)],
        ['in', 'status', ['active', 'pending']],
      ]],
      ['tasks', [
        ['is', 'deleted_at', null],
        ['neq', 'status', 'completed'],
      ]],
      ['tasks', [
        ['is', 'deleted_at', null],
        ['neq', 'status', 'completed'],
        ['lt', 'due_at', expect.any(String)],
      ]],
    ]);

    const criticalQuoteCutoff = new Date(calls[1].filters[1][2] as string);
    const overdueTaskCutoff = new Date(calls[5].filters[2][2] as string);
    expect(criticalQuoteCutoff.getTime()).toBeGreaterThanOrEqual(before.getTime() - 24 * 60 * 60 * 1000);
    expect(criticalQuoteCutoff.getTime()).toBeLessThanOrEqual(after.getTime() - 24 * 60 * 60 * 1000);
    expect(overdueTaskCutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(overdueTaskCutoff.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('surfaces a failed count query', async () => {
    mockCounts([1, 2, 3, 4, 5, 6], 3);
    const { result } = renderHook(() => useCommandCenterCounts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(new Error('count failed'));
  });
});
