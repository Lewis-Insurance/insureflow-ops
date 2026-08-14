import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { BookOfBusinessTab } from '@/components/dashboard/BookOfBusinessTab';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
}

function createCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.is = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.then = (resolve: (value: { count: number; data: null; error: null }) => void) =>
    Promise.resolve({ count, data: null, error: null }).then(resolve);
  return chain;
}

function mockBookOfBusinessSupabase({
  personalTotal = 2500,
  commercialTotal = 3200,
  personalInsured = 1715,
  commercialInsured = 2500,
}: {
  personalTotal?: number;
  commercialTotal?: number;
  personalInsured?: number;
  commercialInsured?: number;
} = {}) {
  const selectCalls: SelectCall[] = [];

  const personalOr =
    'type.eq.household,type.eq.individual,type.eq.personal,account_type.eq.individual,account_type.eq.personal';
  const commercialOr =
    'type.eq.business,type.eq.commercial,type.eq.commercial_business,type.eq.corporate,account_type.eq.business,account_type.eq.commercial,account_type.eq.corporate';

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'accounts') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          const chain = createCountChain(0);
          const call: SelectCall = { table, columns, options };
          selectCalls.push(call);

          chain.or = vi.fn((filter: string) => {
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

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(QueryClientProvider, { client: queryClient }, ui)
  );
}

describe('BookOfBusinessTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests exact counts with head: true and renders uncapped totals past 1000', async () => {
    const { selectCalls } = mockBookOfBusinessSupabase({
      personalTotal: 2500,
      commercialTotal: 3200,
      personalInsured: 1715,
      commercialInsured: 2500,
    });

    renderWithQueryClient(<BookOfBusinessTab />);

    await waitFor(() => {
      expect(screen.getByText('2500')).toBeInTheDocument();
    });

    expect(screen.getByText('1715')).toBeInTheDocument();
    expect(screen.getByText('Full book. Not the first 1,000.')).toBeInTheDocument();

    selectCalls.forEach((call) => {
      expect(call.options).toEqual({ count: 'exact', head: true });
    });
  });
});
