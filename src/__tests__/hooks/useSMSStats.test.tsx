import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { startOfDay } from 'date-fns';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { useSMSStats } from '@/hooks/useSMSMessages';
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

function mockCounts(counts: number[]) {
  const calls: SelectCall[] = [];
  let countIndex = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => ({
    select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
      const call: SelectCall = { table, columns, options, filters: [] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const method of ['eq', 'in', 'gte'] as const) {
        chain[method] = vi.fn((column: string, value: unknown) => {
          call.filters.push([method, column, value]);
          return chain;
        });
      }
      const count = counts[countIndex++] ?? 0;
      chain.then = (resolve: (value: { count: number; data: null; error: null }) => unknown) =>
        Promise.resolve({ count, data: null, error: null }).then(resolve);
      return chain;
    }),
  }) as never);

  return calls;
}

describe('useSMSStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T16:00:00Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('uses filtered exact head counts for all six uncapped SMS tiles', async () => {
    const calls = mockCounts([5000, 2400, 2600, 2100, 1200, 1500]);
    const { result } = renderHook(() => useSMSStats(), { wrapper: createWrapper() });

    await vi.runAllTimersAsync();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      total: 5000,
      inbound: 2400,
      outbound: 2600,
      delivered: 2100,
      failed: 1200,
      today: 1500,
    });
    expect(calls).toHaveLength(6);
    calls.forEach((call) => {
      expect(call.table).toBe('sms_messages');
      expect(call.columns).toBe('id');
      expect(call.options).toEqual({ count: 'exact', head: true });
    });
    expect(calls.map((call) => call.filters)).toEqual([
      [],
      [['eq', 'direction', 'inbound']],
      [['eq', 'direction', 'outbound']],
      [['eq', 'status', 'delivered']],
      [['in', 'status', ['failed', 'undelivered']]],
      [['gte', 'created_at', startOfDay(new Date()).toISOString()]],
    ]);
    expect(calls.some((call) => call.columns.includes('direction'))).toBe(false);
  });
});
