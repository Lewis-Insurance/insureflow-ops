import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { useBookOfBusinessData } from '@/hooks/useBookOfBusinessData';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
  orFilter?: string;
}

function createCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.is = vi.fn(() => chain);
  chain.or = vi.fn((filter: string) => {
    chain._orFilter = filter;
    return chain;
  });
  chain.then = (resolve: (value: { count: number; data: null; error: null }) => void) =>
    Promise.resolve({ count, data: null, error: null }).then(resolve);
  return chain;
}

function mockBookOfBusinessSupabase({
  personalTotal = 2500,
  commercialTotal = 3200,
  personalInsured = 1715,
  commercialInsured = 2100,
}: {
  personalTotal?: number;
  commercialTotal?: number;
  personalInsured?: number;
  commercialInsured?: number;
} = {}) {
  const selectCalls: SelectCall[] = [];

  const personalOr =
    'type.eq.household,account_type.eq.individual,account_type.eq.household';
  const commercialOr =
    'type.eq.commercial_business,account_type.eq.business';

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'accounts') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          const chain = createCountChain(0);
          const call: SelectCall = { table, columns, options };
          selectCalls.push(call);

          chain.or = vi.fn((filter: string) => {
            call.orFilter = filter;
            const withPolicies = columns.includes('policies!inner');
            if (filter === personalOr && withPolicies) {
              chain.then = (resolve) =>
                Promise.resolve({ count: personalInsured, data: null, error: null }).then(resolve);
            } else if (filter === personalOr) {
              chain.then = (resolve) =>
                Promise.resolve({ count: personalTotal, data: null, error: null }).then(resolve);
            } else if (filter === commercialOr && withPolicies) {
              chain.then = (resolve) =>
                Promise.resolve({ count: commercialInsured, data: null, error: null }).then(resolve);
            } else if (filter === commercialOr) {
              chain.then = (resolve) =>
                Promise.resolve({ count: commercialTotal, data: null, error: null }).then(resolve);
            }
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

describe('useBookOfBusinessData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests exact counts with head: true and derives prospects from totals minus insured', async () => {
    const { selectCalls } = mockBookOfBusinessSupabase({
      personalTotal: 2500,
      commercialTotal: 3200,
      personalInsured: 1715,
      commercialInsured: 2100,
    });

    const { result } = renderHook(() => useBookOfBusinessData(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.insureds.personal).toBe(1715);
    expect(result.current.data?.insureds.commercial).toBe(2100);
    expect(result.current.data?.prospects.personal).toBe(785);
    expect(result.current.data?.prospects.commercial).toBe(1100);

    expect(selectCalls).toHaveLength(4);
    selectCalls.forEach((call) => {
      expect(call.options).toEqual({ count: 'exact', head: true });
      expect(call.table).toBe('accounts');
    });

    const insuredCalls = selectCalls.filter((call) => call.columns.includes('policies!inner'));
    expect(insuredCalls).toHaveLength(2);
  });

  it('throws when a count query errors', async () => {
    const errorChain: Record<string, unknown> = {};
    errorChain.is = vi.fn(() => errorChain);
    errorChain.or = vi.fn(() => errorChain);
    errorChain.then = (resolve: (value: { count: null; data: null; error: { message: string } }) => void) =>
      Promise.resolve({ count: null, data: null, error: { message: 'count failed' } }).then(resolve);

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => errorChain),
    } as never);

    const { result } = renderHook(() => useBookOfBusinessData(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('Failed to fetch accounts: count failed');
  });
});
