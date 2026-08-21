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

const POLICY_ONLY_SNAPSHOT: ExtractSnapshotV1 = {
  ...SNAPSHOT,
  insured_name: null,
  policy_number: 'POL-TEST-ONLY',
};

const NAME_ONLY_SNAPSHOT: ExtractSnapshotV1 = {
  ...SNAPSHOT,
  policy_number: null,
};

const BLANK_SNAPSHOT: ExtractSnapshotV1 = {
  ...SNAPSHOT,
  insured_name: null,
  policy_number: null,
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

function mockProposeSuccess() {
  rpc.mockImplementation(async (fn: string, args?: { p_search_term?: string }) => {
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
      if (args?.p_search_term === 'POL-TEST-001') {
        return {
          data: [
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
        ],
        error: null,
      };
    }
    return { data: [], error: null };
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
    mockProposeSuccess();

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

  it('searches by policy number only when insured name is blank', async () => {
    rpc.mockImplementation(async (fn: string, args?: { p_search_term?: string }) => {
      if (fn === 'find_duplicate_accounts') {
        throw new Error('find_duplicate_accounts should not be called');
      }
      if (fn === 'global_search_v1') {
        expect(args?.p_search_term).toBe('POL-TEST-ONLY');
        return {
          data: [
            {
              entity_type: 'policy',
              id: 'policy-1',
              label: 'Policy #POL-TEST-ONLY',
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
          snapshot: POLICY_ONLY_SNAPSHOT,
          accountId: null,
          documentId: 'doc-1',
          extractedData: null,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposing).toBe(false);
    });

    expect(rpc).not.toHaveBeenCalledWith('find_duplicate_accounts', expect.anything());
    expect(rpc).toHaveBeenCalledWith('global_search_v1', {
      p_search_term: 'POL-TEST-ONLY',
      p_limit: 10,
    });
    expect(result.current.candidates.map((c) => c.accountId)).toEqual(['acct-policy-1']);
    expect(result.current.proposeError).toBeNull();
  });

  it('searches by insured name only when policy number is blank', async () => {
    rpc.mockImplementation(async (fn: string, args?: { p_search_term?: string }) => {
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
        expect(args?.p_search_term).toBe('Synthetic Test Insured LLC');
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
          snapshot: NAME_ONLY_SNAPSHOT,
          accountId: null,
          documentId: 'doc-1',
          extractedData: null,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposing).toBe(false);
    });

    expect(rpc).toHaveBeenCalledWith('find_duplicate_accounts', expect.anything());
    expect(rpc).toHaveBeenCalledWith('global_search_v1', {
      p_search_term: 'Synthetic Test Insured LLC',
      p_limit: 25,
    });
    expect(result.current.candidates.map((c) => c.accountId)).toEqual(['acct-dup-1', 'acct-search-1']);
  });

  it('does not search when insured name and policy number are both blank', async () => {
    const { result } = renderHook(
      () =>
        useExtractAccountMatch({
          analysisId: 'analysis-1',
          snapshot: BLANK_SNAPSHOT,
          accountId: null,
          documentId: 'doc-1',
          extractedData: null,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposing).toBe(false);
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.candidates).toEqual([]);
    expect(result.current.proposeError).toBeNull();
    expect(result.current.proposeWarning).toBeNull();
  });

  it('sets proposeError when all lookups fail and no candidates are returned', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'find_duplicate_accounts') {
        return { data: null, error: { message: 'duplicate lookup failed' } };
      }
      if (fn === 'global_search_v1') {
        return { data: null, error: { message: 'search lookup failed' } };
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

    expect(result.current.candidates).toEqual([]);
    expect(result.current.proposeError).toBe('Account search failed. Try again in a moment.');
    expect(result.current.proposeWarning).toBeNull();
  });

  it('calls persist_extract_account_link RPC on successful persist pick', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'persist_extract_account_link') {
        return { data: null, error: null };
      }
      return { data: [], error: null };
    });

    from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        in: () => ({
          is: async () => ({ data: [], error: null }),
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

    expect(rpc).toHaveBeenCalledWith('persist_extract_account_link', {
      p_analysis_id: 'analysis-1',
      p_account_id: 'acct-dup-1',
      p_document_id: 'doc-1',
      p_extracted_data: expect.objectContaining({
        carrier_name: 'Synthetic Carrier',
        booking: {
          line_category: 'personal',
          line_category_source: 'override',
        },
      }),
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Account linked',
      }),
    );
  });

  it('shows toast error when persist_extract_account_link RPC fails', async () => {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'persist_extract_account_link') {
        return { data: null, error: { message: 'document update affected 0 rows' } };
      }
      return { data: [], error: null };
    });

    from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        in: () => ({
          is: async () => ({ data: [], error: null }),
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
          extractedData: null,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposing).toBe(false);
    });

    await act(async () => {
      result.current.persistPick('acct-dup-1', 'commercial', false);
    });

    await waitFor(() => {
      expect(result.current.persisting).toBe(false);
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Could not link account',
        variant: 'destructive',
      }),
    );
  });
});
