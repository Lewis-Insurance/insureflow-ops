import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import { useExtractAccountMatch } from '@/hooks/useExtractAccountMatch';

const rpc = vi.fn();
const from = vi.fn();
const toast = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const SNAPSHOT: ExtractSnapshotV1 = {
  schema_version: 1,
  insured_name: 'Synthetic Test Insured LLC',
  carriers: [],
  effective_date: null,
  expiration_date: null,
  claims_made: null,
  defense_inside_limits: null,
  premium: { total: null, frequency: null },
  fees: [],
  commission: null,
  coverages: [],
  locations: [],
  vehicles: [],
  drivers: [],
  document_type: 'commercial_policy',
  policy_number: 'POL-TEST-001',
  key_details: [],
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function mockFromUpdate() {
  from.mockImplementation((table: string) => {
    if (table === 'accounts') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    }

    return {
      update: () => ({
        eq: async () => ({ error: null }),
      }),
      select: () => ({
        in: () => ({
          is: async () => ({
            data: [
              {
                id: 'policy-1',
                account_id: 'acct-policy-1',
                accounts: { name: 'Synthetic Test Insured LLC' },
              },
            ],
            error: null,
          }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  toast.mockReset();
  mockFromUpdate();
});

describe('useExtractAccountMatch', () => {
  it('proposes ranked matches from duplicate and search RPCs when account is not linked', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_duplicate_accounts') {
        return {
          data: [
            {
              account_id: 'acct-dup-1',
              name: 'Synthetic Test Insured LLC',
              email: null,
              phone: null,
              city: null,
              state: null,
              account_status: 'active',
              active_policy_count: 1,
              match_basis: 'name',
            },
          ],
          error: null,
        };
      }
      if (fn === 'global_search_v1') {
        return {
          data: [
            {
              entity_type: 'account',
              id: 'acct-search-1',
              label: 'Synthetic Test Insured LLC',
              subtitle: 'Test City, FL',
              email: null,
              phone: null,
            },
            {
              entity_type: 'policy',
              id: 'policy-1',
              label: 'Policy #POL-TEST-001',
              subtitle: 'Carrier Alpha - GL (Synthetic Test Insured LLC)',
              email: null,
              phone: null,
            },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    });

    const { result } = renderHook(
      () =>
        useExtractAccountMatch({
          analysisId: 'analysis-1',
          snapshot: SNAPSHOT,
          accountId: null,
          documentId: 'doc-1',
          extractedData: null,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposing).toBe(false);
    });

    expect(result.current.candidates.map((c) => c.accountId)).toEqual([
      'acct-dup-1',
      'acct-policy-1',
      'acct-search-1',
    ]);
    expect(result.current.candidates[0].source).toBe('duplicate');
  });

  it('persists account pick to document_analysis and documents', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const updates: Record<string, unknown>[] = [];

    from.mockImplementation((table: string) => ({
      update: (payload: unknown) => ({
        eq: async () => {
          updates.push({ table, payload });
          return { error: null };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }));

    const { result } = renderHook(
      () =>
        useExtractAccountMatch({
          analysisId: 'analysis-1',
          snapshot: SNAPSHOT,
          accountId: null,
          documentId: 'doc-1',
          extractedData: { carrier_name: 'Synthetic Carrier' },
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposing).toBe(false);
    });

    await act(async () => {
      result.current.persistPick('acct-dup-1', 'personal', true);
    });

    await waitFor(() => {
      expect(result.current.persisting).toBe(false);
    });

    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'document_analysis',
          payload: expect.objectContaining({
            account_id: 'acct-dup-1',
            extracted_data: expect.objectContaining({
              carrier_name: 'Synthetic Carrier',
              booking: {
                line_category: 'personal',
                line_category_source: 'override',
              },
            }),
          }),
        }),
        expect.objectContaining({
          table: 'documents',
          payload: { account_id: 'acct-dup-1' },
        }),
      ]),
    );
    expect(toast).toHaveBeenCalled();
  });
});
