import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useAgencyWorkspace', () => ({
  useActiveAgency: () => ({ activeAgency: { agency_workspace_id: 'workspace-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import CanopyImportPage from '@/pages/CanopyImportPage';
import { supabase } from '@/integrations/supabase/client';

interface SelectCall {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
  limit?: number;
}

function createCountChain(count: number) {
  const chain: Record<string, unknown> = {};
  chain.eq = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.then = (resolve: (value: { count: number; data: null; error: null }) => void) =>
    Promise.resolve({ count, data: null, error: null }).then(resolve);
  return chain;
}

function createListChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.not = vi.fn(() => chain);
  chain.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return chain;
}

function mockCanopyImportPageSupabase({
  totalImports = 47,
  completedImports = 38,
  leadsCreated = 31,
  recentPullRows = 20,
}: {
  totalImports?: number;
  completedImports?: number;
  leadsCreated?: number;
  recentPullRows?: number;
} = {}) {
  const selectCalls: SelectCall[] = [];
  let canopyPullCountIndex = 0;
  const countValues = [totalImports, completedImports, leadsCreated];

  const recentPulls = Array.from({ length: recentPullRows }, (_, index) => ({
    id: `pull-${index}`,
    canopy_pull_id: `canopy-${index}`,
    status: 'complete',
    policy_count: 1,
    carrier_count: 1,
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    lead_id: null,
    account_id: null,
    error_message: null,
    metadata: null,
  }));

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'canopy_pulls') {
      return {
        select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          const call: SelectCall = { table, columns, options };
          selectCalls.push(call);

          if (options?.count === 'exact' && options?.head) {
            const count = countValues[canopyPullCountIndex] ?? 0;
            canopyPullCountIndex += 1;
            return createCountChain(count);
          }

          const listChain = createListChain(recentPulls);
          listChain.limit = vi.fn((limit: number) => {
            call.limit = limit;
            return listChain;
          });
          return listChain;
        }),
      } as never;
    }

    if (table === 'leads') {
      return {
        select: vi.fn((columns: string) => {
          selectCalls.push({ table, columns });
          return createListChain([]);
        }),
      } as never;
    }

    return {} as never;
  });

  return { selectCalls };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CanopyImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CanopyImportPage import stats tiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses exact head counts for tiles instead of the limited recent-pull list length', async () => {
    const stats = {
      totalImports: 47,
      completedImports: 38,
      leadsCreated: 31,
      recentPullRows: 20,
    };
    const { selectCalls } = mockCanopyImportPageSupabase(stats);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('47')).toBeInTheDocument();
    });

    expect(screen.getByText('38')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('Full history. Not the last 20.')).toBeInTheDocument();

    const headCountCalls = selectCalls.filter(
      (call) => call.table === 'canopy_pulls' && call.options?.count === 'exact' && call.options?.head,
    );
    expect(headCountCalls).toHaveLength(3);
    headCountCalls.forEach((call) => {
      expect(call.options).toEqual({ count: 'exact', head: true });
    });

    const recentListCall = selectCalls.find(
      (call) => call.table === 'canopy_pulls' && call.limit === 20,
    );
    expect(recentListCall).toBeDefined();
    expect(stats.recentPullRows).toBe(20);
    expect(stats.totalImports).not.toBe(stats.recentPullRows);
  });
});
