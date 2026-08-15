import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { useLeadMetrics } from '@/hooks/useLeadAnalytics';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
  status?: string;
  dateRange?: { start: string; end: string };
}

function createCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.is = vi.fn(() => chain);
  chain.gte = vi.fn((column: string, value: string) => {
    chain._gte = { column, value };
    return chain;
  });
  chain.lte = vi.fn((column: string, value: string) => {
    chain._lte = { column, value };
    return chain;
  });
  chain.eq = vi.fn((column: string, value: string) => {
    chain._eq = { column, value };
    return chain;
  });
  chain.in = vi.fn(() => chain);
  chain.then = (resolve: (value: { count: number; data: null; error: null }) => void) =>
    Promise.resolve({ count, data: null, error: null }).then(resolve);
  return chain;
}

function createDataChain(rows: Record<string, number | null>[]) {
  const chain: Record<string, unknown> = {};
  chain.is = vi.fn(() => chain);
  chain.gte = vi.fn(() => chain);
  chain.lte = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.then = (resolve: (value: { data: Record<string, number | null>[]; error: null }) => void) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return chain;
}

function mockLeadMetricsSupabase({
  total = 1000,
  newCount = 200,
  contactedCount = 150,
  qualifiedCount = 120,
  quotedCount = 80,
  wonCount = 50,
  lostCount = 30,
  nurturingCount = 70,
  averageScore = 72.5,
  pipelineValue = 250000,
}: {
  total?: number;
  newCount?: number;
  contactedCount?: number;
  qualifiedCount?: number;
  quotedCount?: number;
  wonCount?: number;
  lostCount?: number;
  nurturingCount?: number;
  averageScore?: number;
  pipelineValue?: number;
} = {}) {
  const selectCalls: SelectCall[] = [];

  const statusCounts: Record<string, number> = {
    new: newCount,
    contacted: contactedCount,
    qualified: qualifiedCount,
    quoted: quotedCount,
    won: wonCount,
    lost: lostCount,
    nurturing: nurturingCount,
  };

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'leads') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          const call: SelectCall = { table, columns, options };
          selectCalls.push(call);

          if (columns === 'lead_score') {
            return createDataChain([{ lead_score: averageScore }]);
          }

          if (columns === 'current_premium') {
            return createDataChain([{ current_premium: pipelineValue }]);
          }

          const chain = createCountChain(total);
          chain.eq = vi.fn((column: string, value: string) => {
            call.status = value;
            chain.then = (resolve) =>
              Promise.resolve({
                count: statusCounts[value] ?? 0,
                data: null,
                error: null,
              }).then(resolve);
            return chain;
          });
          chain.gte = vi.fn((column: string, value: string) => {
            call.dateRange = { start: value, end: call.dateRange?.end ?? '' };
            return chain;
          });
          chain.lte = vi.fn((column: string, value: string) => {
            call.dateRange = { start: call.dateRange?.start ?? '', end: value };
            return chain;
          });

          return chain;
        }),
      } as never;
    }

    return {} as never;
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

describe('useLeadMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses head count queries and derives metrics from count property, not array length', async () => {
    const { selectCalls } = mockLeadMetricsSupabase({
      total: 1000,
      newCount: 200,
      contactedCount: 150,
      qualifiedCount: 120,
      quotedCount: 80,
      wonCount: 50,
      lostCount: 30,
      nurturingCount: 70,
      averageScore: 72.5,
      pipelineValue: 250000,
    });

    const { result } = renderHook(() => useLeadMetrics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      total_leads: 1000,
      new_leads: 200,
      contacted_leads: 150,
      qualified_leads: 120,
      quoted_leads: 80,
      won_leads: 50,
      lost_leads: 30,
      nurturing_leads: 70,
      conversion_rate: 5,
      average_score: 72.5,
      total_pipeline_value: 250000,
    });

    const countCalls = selectCalls.filter((call) => call.columns === 'id');
    expect(countCalls).toHaveLength(8);
    countCalls.forEach((call) => {
      expect(call.options).toEqual({ count: 'exact', head: true });
      expect(call.table).toBe('leads');
    });

    expect(selectCalls.some((call) => call.columns === 'lead_score')).toBe(true);
    expect(selectCalls.some((call) => call.columns === 'current_premium')).toBe(true);

    const nonHeadCalls = selectCalls.filter(
      (call) => call.columns === 'id' && call.options?.head !== true
    );
    expect(nonHeadCalls).toHaveLength(0);

    const starSelectCalls = selectCalls.filter((call) => call.columns === '*');
    expect(starSelectCalls).toHaveLength(0);
  });

  it('applies dateRange filters to count and aggregate queries', async () => {
    const { selectCalls } = mockLeadMetricsSupabase({ total: 42, wonCount: 7 });

    const dateRange = { start: '2026-01-01', end: '2026-01-31' };
    const { result } = renderHook(() => useLeadMetrics(dateRange), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.total_leads).toBe(42);
    expect(result.current.data?.conversion_rate).toBe((7 / 42) * 100);

    const datedCalls = selectCalls.filter(
      (call) => call.dateRange?.start === dateRange.start && call.dateRange?.end === dateRange.end
    );
    expect(datedCalls.length).toBeGreaterThan(0);
  });
});
