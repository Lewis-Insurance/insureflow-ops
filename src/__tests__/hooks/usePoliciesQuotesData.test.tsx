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

import { usePoliciesQuotesData } from '@/hooks/usePoliciesQuotesData';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function createAggregateChain(data: unknown[], error: { message: string } | null = null) {
  const chain: Record<string, unknown> = {};
  chain.is = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.then = (resolve: (value: { data: unknown[]; error: { message: string } | null }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function mockAggregateQueries() {
  const calls: SelectCall[] = [];
  const results = [
    [
      { line_of_business: 'Personal Auto', count: 1700 },
      { line_of_business: 'General Liability', count: 1150 },
      { line_of_business: 'Health', count: 80 },
    ],
    [
      { carrier: 'Acme', count: 1900 },
      { carrier: 'Beacon', count: 700 },
    ],
    [
      { account: { state: 'TX' }, count: 2100 },
      { account: null, count: 75 },
    ],
    [
      { status: 'open', count: 1400 },
      { status: null, count: 45 },
    ],
    [
      { carrier: { name: 'Acme' }, count: 1250 },
      { carrier: null, count: 30 },
    ],
  ];
  let resultIndex = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => ({
    select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
      calls.push({ table, columns, options });
      return createAggregateChain(results[resultIndex++] || []);
    }),
  }) as never);

  return calls;
}

describe('usePoliciesQuotesData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses server-side grouped counts and returns counts above 1000', async () => {
    const calls = mockAggregateQueries();

    const { result } = renderHook(() => usePoliciesQuotesData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.policiesByLineOfBusiness).toEqual([
      { label: 'Personal Auto', count: 1700 },
      { label: 'General Liability', count: 1150 },
      { label: 'Health', count: 80 },
    ]);
    expect(result.current.data?.policiesByLineOfBusinessClass).toEqual([
      { label: 'Personal', count: 1700 },
      { label: 'Commercial', count: 1150 },
      { label: 'Life-Health', count: 80 },
    ]);
    expect(result.current.data?.policiesByCarrier[0]).toEqual({ label: 'Acme', count: 1900 });
    expect(result.current.data?.policiesByState[0]).toEqual({ label: 'TX', count: 2100 });
    expect(result.current.data?.quotesByStage[0]).toEqual({ label: 'Open', count: 1400 });
    expect(result.current.data?.quotesByCarrier[0]).toEqual({ label: 'Acme', count: 1250 });

    expect(calls).toHaveLength(5);
    calls.forEach((call) => {
      expect(call.columns).toContain('count:id.count()');
      expect(call.options).toBeUndefined();
    });
    expect(calls.some((call) => call.columns.includes('*'))).toBe(false);
  });

  it('keeps policy filters and does not fetch raw book rows', async () => {
    mockAggregateQueries();

    const { result } = renderHook(() => usePoliciesQuotesData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const policyBuilders = vi.mocked(supabase.from).mock.results.slice(0, 3);
    for (const builderResult of policyBuilders) {
      const builder = builderResult.value as { select: ReturnType<typeof vi.fn> };
      const chain = builder.select.mock.results[0].value as {
        is: ReturnType<typeof vi.fn>;
      };
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null);
    }
  });

  it('throws when a policy aggregate fails', async () => {
    let queryIndex = 0;
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn(() => {
        const chain = createAggregateChain(
          [],
          queryIndex++ === 0 ? { message: 'group count failed' } : null,
        );
        return chain;
      }),
    }) as never);

    const { result } = renderHook(() => usePoliciesQuotesData(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Failed to fetch policies: group count failed');
  });
});
