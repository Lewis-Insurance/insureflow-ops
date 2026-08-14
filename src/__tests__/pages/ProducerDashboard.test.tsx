import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useMyNeedsMeToday', () => ({
  useMyNeedsMeToday: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useCustomerTriageCounts', () => ({
  useCustomerTriageCounts: vi.fn(),
}));

vi.mock('@/hooks/usePolicySearch', () => ({
  usePolicySearch: vi.fn(),
}));

vi.mock('@/components/tasks/TaskEditModal', () => ({
  TaskEditModal: () => null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

import ProducerDashboard from '@/pages/ProducerDashboard';
import { useMyNeedsMeToday } from '@/hooks/useMyNeedsMeToday';
import { useAuth } from '@/hooks/useAuth';
import { useCustomerTriageCounts } from '@/hooks/useCustomerTriageCounts';
import { usePolicySearch } from '@/hooks/usePolicySearch';
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
  const personalOr =
    'type.eq.household,type.eq.individual,type.eq.personal,account_type.eq.individual,account_type.eq.personal';
  const commercialOr =
    'type.eq.business,type.eq.commercial,type.eq.commercial_business,type.eq.corporate,account_type.eq.business,account_type.eq.commercial,account_type.eq.corporate';

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'accounts') {
      return {
        select: vi.fn((columns: string) => {
          const chain = createCountChain(0);

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
}

function renderProducerDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ProducerDashboard />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(useAuth).mockReturnValue({
    profile: { full_name: 'Brian Lewis', role: 'agent' },
    signOut: vi.fn(),
  } as ReturnType<typeof useAuth>);

  vi.mocked(useMyNeedsMeToday).mockReturnValue({
    counts: { renewals_due: 2, overdue_tasks: 1, new_leads: 3 },
    total: 6,
    loading: false,
    refetch: vi.fn(),
  });

  vi.mocked(useCustomerTriageCounts).mockReturnValue({
    counts: { total: 1200 },
    loading: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useCustomerTriageCounts>);

  vi.mocked(usePolicySearch).mockReturnValue({
    policies: [],
    loading: false,
    fetchPolicies: vi.fn(),
  } as ReturnType<typeof usePolicySearch>);

  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: null },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getUser>>);

  mockBookOfBusinessSupabase();
});

describe('ProducerDashboard', () => {
  it('renders book of business tiles', async () => {
    renderProducerDashboard();

    await waitFor(() => {
      expect(screen.getByText('Insureds by Type')).toBeInTheDocument();
    });

    expect(screen.getByText('Prospects by Type')).toBeInTheDocument();
  });

  it('renders the uncapped book subtitle', async () => {
    renderProducerDashboard();

    await waitFor(() => {
      expect(screen.getByText('Full book. Not the first 1,000.')).toBeInTheDocument();
    });
  });

  it('renders the book section before My tasks in DOM order', async () => {
    renderProducerDashboard();

    await waitFor(() => {
      expect(screen.getByText('Insureds by Type')).toBeInTheDocument();
    });

    const bookSection = screen.getByLabelText('Book of business');
    const myTasksLabel = screen.getByText('My tasks');

    expect(
      bookSection.compareDocumentPosition(myTasksLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
