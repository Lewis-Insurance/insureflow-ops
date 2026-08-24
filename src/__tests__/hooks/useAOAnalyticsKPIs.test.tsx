import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { useAOAnalyticsKPIs } from '@/hooks/useAOAnalytics';
import { useAORenewalKPIs } from '@/hooks/useAORenewalAnalytics';
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

function mockQueries(counts: number[], sums: number[]) {
  const calls: SelectCall[] = [];
  let countIndex = 0;
  let sumIndex = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => ({
    select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
      const call: SelectCall = { table, columns, options, filters: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const method of ['gte', 'lte', 'lt', 'eq', 'in'] as const) {
        chain[method] = vi.fn((column: string, value: unknown) => {
          call.filters.push([method, column, value]);
          return chain;
        });
      }
      if (options?.count === 'exact' && options.head) {
        const count = counts[countIndex++] ?? 0;
        chain.then = (resolve: (value: { count: number; data: null; error: null }) => unknown) =>
          Promise.resolve({ count, data: null, error: null }).then(resolve);
      } else {
        const sum = sums[sumIndex++] ?? 0;
        chain.then = (resolve: (value: { data: Array<{ sum: number }>; error: null }) => unknown) =>
          Promise.resolve({ data: [{ sum }], error: null }).then(resolve);
      }
      return chain;
    }),
  }) as never);

  return calls;
}

describe('AO KPI hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T16:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('uses exact head counts and server aggregates for uncapped analytics KPIs', async () => {
    const calls = mockQueries([2500, 1200, 1400, 300, 100, 275], [5_000_000]);
    const { result } = renderHook(
      () => useAOAnalyticsKPIs({ dateFrom: '2026-01-01', dateTo: '2026-12-31' }),
      { wrapper: createWrapper() },
    );

    await vi.runAllTimersAsync();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      totalRenewals: 2500,
      totalPremium: 5_000_000,
      upcoming30Days: 1200,
      avgPremium: 2000,
      renewalRate: (1400 / 1800) * 100,
      atRisk: 275,
    });

    expect(calls).toHaveLength(7);
    calls.forEach((call) => expect(call.table).toBe('ao_renewals'));

    const countCalls = calls.filter((call) => call.columns === 'id');
    expect(countCalls).toHaveLength(6);
    countCalls.forEach((call) => {
      expect(call.columns).toBe('id');
      expect(call.options).toEqual({ count: 'exact', head: true });
      expect(call.filters).toContainEqual(['gte', 'renewal_date', '2026-01-01']);
      expect(call.filters).toContainEqual(['lte', 'renewal_date', '2026-12-31']);
    });

    const aggregateCall = calls.find((call) => call.columns === 'current_premium.sum()');
    expect(aggregateCall).toBeDefined();
    expect(aggregateCall?.filters).toContainEqual(['gte', 'renewal_date', '2026-01-01']);
    expect(aggregateCall?.filters).toContainEqual(['lte', 'renewal_date', '2026-12-31']);

    const upcomingCall = countCalls.find((call) =>
      call.filters.some(([method, column, value]) =>
        method === 'gte' && column === 'renewal_date' && value === '2026-08-24'));
    expect(upcomingCall?.filters).toContainEqual(['lte', 'renewal_date', '2026-09-23']);

    const atRiskCall = countCalls.find((call) =>
      call.filters.some(([method, column]) => method === 'in' && column === 'status'));
    expect(atRiskCall?.filters).toContainEqual(['in', 'status', ['pending', 'contacted']]);
    expect(atRiskCall?.filters).toContainEqual(['lt', 'renewal_date', '2026-09-07']);

    const terminalStatuses = countCalls.flatMap((call) =>
      call.filters
        .filter(([method, column]) => method === 'eq' && column === 'status')
        .map(([, , value]) => value));
    expect(terminalStatuses).toEqual(['renewed', 'lost', 'cancelled']);
    expect(calls.some((call) => call.columns === '*')).toBe(false);
  });

  it('uses exact status counts and server-side premium sums for renewal summary KPIs', async () => {
    const calls = mockQueries([1100, 200, 1300], [220_000, 30_000, 750_000]);
    const { result } = renderHook(() => useAORenewalKPIs(), { wrapper: createWrapper() });

    await vi.runAllTimersAsync();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      premiumLost: 250_000,
      policiesLost: 1300,
      premiumRetained: 750_000,
      policiesRetained: 1300,
      retentionRate: 75,
    });
    expect(calls).toHaveLength(6);
    calls.forEach((call) => expect(call.table).toBe('ao_renewals'));
    const siblingCountCalls = calls.filter((call) => call.columns === 'id');
    expect(siblingCountCalls).toHaveLength(3);
    siblingCountCalls.forEach((call) =>
      expect(call.options).toEqual({ count: 'exact', head: true }));
    expect(siblingCountCalls.map((call) => call.filters)).toEqual([
      [['eq', 'status', 'lost']],
      [['eq', 'status', 'cancelled']],
      [['eq', 'status', 'moved']],
    ]);

    const aggregatePairs = calls
      .filter((call) => call.columns.endsWith('.sum()'))
      .map((call) => [call.columns, call.filters]);
    expect(aggregatePairs).toEqual([
      ['current_premium.sum()', [['eq', 'status', 'lost']]],
      ['current_premium.sum()', [['eq', 'status', 'cancelled']]],
      ['moved_premium.sum()', [['eq', 'status', 'moved']]],
    ]);
    expect(calls.some((call) => call.columns === '*' || call.columns.includes('status,'))).toBe(false);
  });
});
