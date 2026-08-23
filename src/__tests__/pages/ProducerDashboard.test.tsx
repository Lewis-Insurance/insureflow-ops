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

vi.mock('@/hooks/useMyCollectConfirmWaiting', () => ({
  useMyCollectConfirmWaiting: vi.fn(),
  MY_COLLECT_CONFIRM_WAITING_KEY: ['my-collect-confirm-waiting'],
  COLLECT_CONFIRM_WAITING_LIMIT: 6,
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
import { useMyCollectConfirmWaiting } from '@/hooks/useMyCollectConfirmWaiting';
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

function mockConfirmWaiting(rows: unknown[]) {
  vi.mocked(useMyCollectConfirmWaiting).mockReturnValue({
    rows,
    limit: 6,
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMyCollectConfirmWaiting>);
}

function mockRenewalsDue(renewals_due: number) {
  vi.mocked(useMyNeedsMeToday).mockReturnValue({
    counts: { renewals_due, overdue_tasks: 1, new_leads: 3 },
    total: renewals_due + 4,
    loading: false,
    refetch: vi.fn(),
  });
}

const CONFIRM_ROW = {
  analysis_id: 'analysis-1',
  account_id: 'acct-1',
  account_name: 'Acme Manufacturing LLC',
  upload_id: 'upload-1',
  filename: 'dec-page.pdf',
  uploaded_at: '2026-08-22T14:05:00Z',
  pending_count: 1,
  line_class: 'commercial',
};

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

  mockConfirmWaiting([]);

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

  describe('lime budget with Portal came back', () => {
    it('card present and renewals due: card owns lime, header button is outline', async () => {
      mockRenewalsDue(2);
      mockConfirmWaiting([CONFIRM_ROW]);
      const { container } = renderProducerDashboard();

      await waitFor(() => {
        expect(screen.getByText('Portal came back')).toBeInTheDocument();
      });

      const primaries = container.querySelectorAll('[data-primary]');
      expect(primaries).toHaveLength(1);
      expect(primaries[0].textContent).toContain('Confirm write-back');

      const header = screen.getByRole('button', { name: /Work renewals/ });
      expect(header).not.toHaveAttribute('data-primary');
    });

    it('card absent and renewals due: header button is the lime primary', async () => {
      mockRenewalsDue(2);
      mockConfirmWaiting([]);
      const { container } = renderProducerDashboard();

      await waitFor(() => {
        expect(screen.getByText('Insureds by Type')).toBeInTheDocument();
      });

      expect(screen.queryByText('Portal came back')).not.toBeInTheDocument();
      const primaries = container.querySelectorAll('[data-primary]');
      expect(primaries).toHaveLength(1);
      expect(primaries[0].textContent).toContain('Work renewals');
    });

    it('card present and no renewals due: exactly one lime on the card', async () => {
      mockRenewalsDue(0);
      mockConfirmWaiting([CONFIRM_ROW]);
      const { container } = renderProducerDashboard();

      await waitFor(() => {
        expect(screen.getByText('Portal came back')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /Work renewals/ })).not.toBeInTheDocument();
      expect(container.querySelectorAll('[data-primary]')).toHaveLength(1);
    });

    it('card absent and no renewals due: zero lime', async () => {
      mockRenewalsDue(0);
      mockConfirmWaiting([]);
      const { container } = renderProducerDashboard();

      await waitFor(() => {
        expect(screen.getByText('Insureds by Type')).toBeInTheDocument();
      });

      expect(container.querySelectorAll('[data-primary]')).toHaveLength(0);
    });
  });
});
