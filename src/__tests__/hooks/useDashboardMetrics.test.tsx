import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import {
  useDashboardMetrics,
  usePipelineHealth,
  useProducerLeaderboard,
} from '@/hooks/useDashboardMetrics';
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

function mockQueries(options: {
  count?: number;
  sum?: number | string;
  failLeadQuery?: number;
  producers?: Array<{ id: string; full_name: string; avatar_url: string | null; role: string }>;
  countFor?: (call: SelectCall) => number;
  sumFor?: (call: SelectCall) => number | string;
} = {}) {
  const calls: SelectCall[] = [];
  let leadQueryIndex = 0;
  vi.mocked(supabase.from).mockImplementation((table: string) => ({
    select: vi.fn((columns: string, selectOptions?: { count?: string; head?: boolean }) => {
      const call: SelectCall = { table, columns, options: selectOptions, filters: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const method of ['is', 'eq', 'gte', 'lte', 'in'] as const) {
        chain[method] = vi.fn((column: string, value: unknown) => {
          call.filters.push([method, column, value]);
          return chain;
        });
      }
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));

      if (table === 'profiles') {
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: options.producers ?? [
            { id: 'producer-1', full_name: 'One', avatar_url: null, role: 'producer' },
            { id: 'producer-2', full_name: 'Two', avatar_url: '/two.png', role: 'staff' },
          ],
          error: null,
        }).then(resolve);
      } else if (table === 'leads') {
        const currentIndex = leadQueryIndex++;
        const error = currentIndex === options.failLeadQuery ? new Error('lead query failed') : null;
        chain.then = (resolve: (value: unknown) => unknown) => {
          const response = selectOptions?.count === 'exact' && selectOptions.head
            ? { count: options.countFor?.(call) ?? options.count ?? 1501, data: null, error }
            : { data: [{ sum: options.sumFor?.(call) ?? options.sum ?? 3_003_501 }], error };
          return Promise.resolve(response).then(resolve);
        };
      }
      return chain;
    }),
  }) as never);
  return calls;
}

function expectExactLeadQueries(calls: SelectCall[]) {
  const leadCalls = calls.filter((call) => call.table === 'leads');
  const countCalls = leadCalls.filter((call) => call.columns === 'id');
  expect(countCalls.length).toBeGreaterThan(0);
  countCalls.forEach((call) => {
    expect(call.options).toEqual({ count: 'exact', head: true });
    expect(call.filters).toContainEqual(['is', 'deleted_at', null]);
  });
  expect(leadCalls.some((call) => call.columns === '*')).toBe(false);
  return { leadCalls, countCalls };
}

describe('Agency Dashboard metric hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-19T12:34:56.789Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('uses exact filtered counts and server sums for all dashboard periods and pipeline metrics', async () => {
    const calls = mockQueries();
    const { result } = renderHook(() => useDashboardMetrics('producer-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      today: { newLeads: 1501, contacted: 1501, qualified: 1501, quoted: 1501, won: 1501 },
      week: { newLeads: 1501, won: 1501, revenue: 3_003_501, conversionRate: 100 },
      mtd: { newLeads: 1501, won: 1501, revenue: 3_003_501, conversionRate: 100 },
      quarter: { newLeads: 1501, won: 1501, revenue: 3_003_501, conversionRate: 100 },
      pipeline: {
        new: 1501, contacted: 1501, qualified: 1501, quoted: 1501,
        won: 1501, lost: 1501, nurturing: 1501, totalValue: 3_003_501,
      },
    });

    const { leadCalls, countCalls } = expectExactLeadQueries(calls);
    expect(countCalls).toHaveLength(27);
    expect(leadCalls.filter((call) => call.columns === 'current_premium.sum()')).toHaveLength(4);
    leadCalls.forEach((call) => expect(call.filters).toContainEqual(['eq', 'assigned_to', 'producer-1']));

    const datedCalls = leadCalls.filter((call) => call.filters.some(([, column]) => column === 'created_at'));
    expect(datedCalls).toHaveLength(23);
    const rangeKey = (call: SelectCall) => call.filters
      .filter(([, column]) => column === 'created_at')
      .map(([method, , value]) => `${method}:${value}`)
      .join('|');
    const expectedRanges = new Map([
      ['gte:2026-08-01T00:00:00.000Z|lte:2026-08-31T23:59:59.999Z', 6],
      ['gte:2026-08-16T00:00:00.000Z|lte:2026-08-22T23:59:59.999Z', 6],
      ['gte:2026-07-01T00:00:00.000Z|lte:2026-09-30T23:59:59.999Z', 6],
      ['gte:2026-08-19T00:00:00.000Z|lte:2026-08-19T23:59:59.999Z', 5],
    ]);
    expectedRanges.forEach((cardinality, range) =>
      expect(datedCalls.filter((call) => rangeKey(call) === range)).toHaveLength(cardinality));

    const statuses = (selectedCalls: SelectCall[]) => selectedCalls.map((call) =>
      call.filters.find(([method, column]) => method === 'eq' && column === 'status')?.[2]);
    expect(statuses(countCalls.filter((call) => !call.filters.some(([, column]) => column === 'created_at'))))
      .toEqual(['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing']);
    expect(statuses(countCalls.filter((call) => rangeKey(call).startsWith('gte:2026-08-19'))))
      .toEqual(['new', 'contacted', 'qualified', 'quoted', 'won']);
    for (const range of [...expectedRanges.keys()].slice(0, 3)) {
      const rangeCalls = leadCalls.filter((call) => rangeKey(call) === range);
      expect(statuses(rangeCalls.filter((call) => call.columns === 'id')))
        .toEqual([undefined, 'contacted', 'qualified', 'quoted', 'won']);
      expect(rangeCalls.filter((call) => call.columns === 'current_premium.sum()'))
        .toHaveLength(1);
      expect(statuses(rangeCalls.filter((call) => call.columns === 'current_premium.sum()')))
        .toEqual(['won']);
    }
    const unrestrictedSums = leadCalls.filter((call) =>
      call.columns === 'current_premium.sum()' && !call.filters.some(([, column]) => column === 'created_at'));
    expect(unrestrictedSums).toHaveLength(1);
    expect(unrestrictedSums[0].filters.some(([, column]) => column === 'status')).toBe(false);

    const goalCall = calls.find((call) => call.table === 'producer_goals');
    expect(goalCall?.columns).toBe('*');
    expect(goalCall?.filters).toContainEqual(['eq', 'producer_id', 'producer-1']);
  });

  it('uses exact per-producer MTD counts and won premium aggregates for the leaderboard', async () => {
    const calls = mockQueries({
      producers: [
        { id: 'producer-1', full_name: 'One', avatar_url: null, role: 'producer' },
        { id: 'producer-2', full_name: 'Two', avatar_url: '/two.png', role: 'staff' },
      ],
      countFor: (call) => {
        const producer = call.filters.find(([, column]) => column === 'assigned_to')?.[2];
        const won = call.filters.some(([, column, value]) => column === 'status' && value === 'won');
        return producer === 'producer-1' ? (won ? 1501 : 4000) : (won ? 1700 : 3001);
      },
      sumFor: (call) => call.filters.some(([, , value]) => value === 'producer-1') ? '4503001.25' : '3401700.50',
    });
    const { result } = renderHook(() => useProducerLeaderboard(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { producer_id: 'producer-2', producer_name: 'Two', avatar_url: '/two.png', wins: 1700, revenue: 3_401_700.5, conversion_rate: 56.6, avg_deal_size: 2001 },
      { producer_id: 'producer-1', producer_name: 'One', avatar_url: null, wins: 1501, revenue: 4_503_001.25, conversion_rate: 37.5, avg_deal_size: 3000 },
    ]);
    const { leadCalls, countCalls } = expectExactLeadQueries(calls);
    expect(countCalls).toHaveLength(4);
    expect(leadCalls.filter((call) => call.columns === 'current_premium.sum()')).toHaveLength(2);
    leadCalls.forEach((call) => {
      expect(call.filters).toContainEqual(['is', 'deleted_at', null]);
      expect(call.filters.some(([method, column]) => method === 'eq' && column === 'assigned_to')).toBe(true);
      expect(call.filters).toContainEqual(['gte', 'created_at', '2026-08-01T00:00:00.000Z']);
      expect(call.filters).toContainEqual(['lte', 'created_at', '2026-08-31T23:59:59.999Z']);
    });
    for (const producerId of ['producer-1', 'producer-2']) {
      const producerCalls = leadCalls.filter((call) => call.filters.some(([, column, value]) =>
        column === 'assigned_to' && value === producerId));
      expect(producerCalls).toHaveLength(3);
      const total = producerCalls.find((call) => call.columns === 'id'
        && !call.filters.some(([, column]) => column === 'status'));
      expect(total).toBeDefined();
      const wonQueries = producerCalls.filter((call) =>
        call.filters.some(([, column, value]) => column === 'status' && value === 'won'));
      expect(wonQueries.map((call) => call.columns).sort()).toEqual(['current_premium.sum()', 'id']);
    }
    expect(calls.find((call) => call.table === 'profiles')?.filters).toContainEqual([
      'in', 'role', ['producer', 'staff', 'admin'],
    ]);
  });

  it('uses exact stage counts and server-side stage value sums for pipeline health', async () => {
    const stageCounts = new Map([
      ['new', 1501], ['contacted', 1402], ['qualified', 1303], ['quoted', 1204],
      ['won', 1105], ['lost', 1006], ['nurturing', 907],
    ]);
    const calls = mockQueries({
      countFor: (call) => stageCounts.get(String(call.filters.find(([, column]) => column === 'status')?.[2])) ?? 0,
      sumFor: (call) => String((stageCounts.get(String(call.filters.find(([, column]) => column === 'status')?.[2])) ?? 0) * 10),
    });
    const { result } = renderHook(() => usePipelineHealth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(7);
    expect(result.current.data).toEqual([...stageCounts].map(([stage, count]) => ({
      stage, count, value: count * 10, avgTimeInStage: 0, conversionRate: 0,
    })));
    const { leadCalls, countCalls } = expectExactLeadQueries(calls);
    expect(countCalls).toHaveLength(7);
    expect(leadCalls.filter((call) => call.columns === 'current_premium.sum()')).toHaveLength(7);
    leadCalls.forEach((call) => {
      expect(call.filters).toContainEqual(['is', 'deleted_at', null]);
      expect(call.filters.some(([method, column]) => method === 'eq' && column === 'status')).toBe(true);
    });
    for (const [stage] of stageCounts) {
      const stageCalls = leadCalls.filter((call) => call.filters.some(([, column, value]) =>
        column === 'status' && value === stage));
      expect(stageCalls.map((call) => call.columns).sort()).toEqual(['current_premium.sum()', 'id']);
    }
  });

  it('surfaces failed count and sum queries', async () => {
    mockQueries({ failLeadQuery: 0 });
    const countResult = renderHook(() => usePipelineHealth(), { wrapper: createWrapper() }).result;
    await waitFor(() => expect(countResult.current.isError).toBe(true));
    expect(countResult.current.error).toEqual(new Error('lead query failed'));

    vi.clearAllMocks();
    mockQueries({ failLeadQuery: 1 });
    const sumResult = renderHook(() => usePipelineHealth(), { wrapper: createWrapper() }).result;
    await waitFor(() => expect(sumResult.current.isError).toBe(true));
    expect(sumResult.current.error).toEqual(new Error('lead query failed'));
  });
});
