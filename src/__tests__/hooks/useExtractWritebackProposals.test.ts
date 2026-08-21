import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import { hashExtractSnapshot } from '@/lib/extractWritebackProposal';
import { useExtractWritebackProposals } from '@/hooks/useExtractWritebackProposals';

const from = vi.fn();
const authGetUser = vi.fn();
const toast = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    auth: {
      getUser: () => authGetUser(),
    },
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
  insured_name: 'Acme Manufacturing LLC',
  carriers: ['Hartford', 'Travelers'],
  effective_date: '2026-03-01',
  expiration_date: '2027-03-01',
  claims_made: null,
  defense_inside_limits: null,
  premium: { total: 48250, frequency: 'annual' },
  fees: [{ type: 'broker', amount: 500 }],
  commission: { percent: 12.5, amount: 5781.25 },
  coverages: [
    {
      name: 'General Liability',
      limit: '$2,000,000',
      deductible: '$1,000',
      premium: 22000,
      parent_coverage: null,
    },
  ],
  locations: [],
  vehicles: [],
  drivers: [],
  document_type: 'commercial_quote',
  policy_number: 'COM-2026-0042',
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

type MockProposalRow = {
  id: string;
  carrier_name: string;
  status: string;
  snapshot_hash?: string;
  proposed_quote: unknown;
};

let pendingRows: MockProposalRow[] = [];
let upsertCalls = 0;
let supersedeCalls = 0;
let supersededSnapshotHashes: string[] = [];
let supersededRowIds: string[] = [];

function mockProposalsTableWithWorkingReject() {
  from.mockImplementation((table: string) => {
    if (table !== 'extract_writeback_proposals') {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: (_col: string, snapshotHash: unknown) => ({
                order: async () => ({
                  data: pendingRows.filter(
                    (row) =>
                      row.status === 'pending' &&
                      (row.snapshot_hash === undefined || row.snapshot_hash === snapshotHash),
                  ),
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
      upsert: (_rows: unknown[], _opts: unknown) => ({
        select: async () => {
          upsertCalls += 1;
          if (pendingRows.filter((r) => r.status === 'pending').length === 0) {
            pendingRows = [
              {
                id: 'proposal-1',
                carrier_name: 'Hartford',
                status: 'pending',
                proposed_quote: {},
              },
              {
                id: 'proposal-2',
                carrier_name: 'Travelers',
                status: 'pending',
                proposed_quote: {},
              },
            ];
            return { data: pendingRows, error: null };
          }
          return { data: [], error: null };
        },
      }),
      update: (payload: { status: string }) => {
        const rejectById = async (proposalId: string) => {
          pendingRows = pendingRows.filter((row) => row.id !== proposalId);
          expect(payload.status).toBe('rejected');
          return { error: null };
        };

        return {
          eq: (col: string, val: unknown) => {
            if (col === 'id') {
              return rejectById(val as string);
            }

            return {
              eq: (_col2: string, _val2: unknown) => ({
                eq: (_col3: string, _val3: unknown) => ({
                  neq: async (_col4: string, snapshotHash: string) => {
                    supersedeCalls += 1;
                    supersededSnapshotHashes.push(snapshotHash);
                    const stalePending = pendingRows.filter(
                      (row) =>
                        row.snapshot_hash !== undefined &&
                        row.snapshot_hash !== snapshotHash &&
                        row.status === 'pending',
                    );
                    supersededRowIds.push(...stalePending.map((row) => row.id));
                    pendingRows = pendingRows.map((row) =>
                      row.snapshot_hash !== undefined &&
                      row.snapshot_hash !== snapshotHash &&
                      row.status === 'pending'
                        ? { ...row, status: 'rejected' }
                        : row,
                    );
                    expect(payload.status).toBe('rejected');
                    return { error: null };
                  },
                }),
              }),
            };
          },
        };
      },
    };
  });
}

beforeEach(() => {
  from.mockReset();
  authGetUser.mockReset();
  toast.mockReset();
  pendingRows = [];
  upsertCalls = 0;
  supersedeCalls = 0;
  supersededSnapshotHashes = [];
  supersededRowIds = [];
  authGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockProposalsTableWithWorkingReject();
});

describe('useExtractWritebackProposals', () => {
  it('inserts pending proposals when account is linked and loads them', async () => {
    const { result } = renderHook(
      () =>
        useExtractWritebackProposals({
          analysisId: 'analysis-1',
          accountId: 'acct-1',
          snapshot: SNAPSHOT,
          lineCategory: 'commercial',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(upsertCalls).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      expect(result.current.proposals).toHaveLength(2);
    });
    expect(result.current.proposals.map((p) => p.carrier_name)).toEqual(['Hartford', 'Travelers']);
  });

  it('rejects a proposal and removes it from pending list', async () => {
    pendingRows = [
      { id: 'proposal-1', carrier_name: 'Hartford', status: 'pending', proposed_quote: {} },
      { id: 'proposal-2', carrier_name: 'Travelers', status: 'pending', proposed_quote: {} },
    ];

    const { result } = renderHook(
      () =>
        useExtractWritebackProposals({
          analysisId: 'analysis-1',
          accountId: 'acct-1',
          snapshot: SNAPSHOT,
          lineCategory: 'commercial',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposals).toHaveLength(2);
    });

    await act(async () => {
      result.current.rejectProposal('proposal-1');
    });

    await waitFor(() => {
      expect(result.current.proposals).toHaveLength(1);
    });
    expect(result.current.proposals[0].carrier_name).toBe('Travelers');
    expect(toast).toHaveBeenCalled();
  });

  it('does not upsert again for the same snapshot hash (idempotent rebuild)', async () => {
    const { result, rerender } = renderHook(
      () =>
        useExtractWritebackProposals({
          analysisId: 'analysis-1',
          accountId: 'acct-1',
          snapshot: SNAPSHOT,
          lineCategory: 'commercial',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(upsertCalls).toBeGreaterThanOrEqual(1);
    });

    const initialUpserts = upsertCalls;

    rerender();

    await waitFor(() => {
      expect(result.current.ensuring).toBe(false);
    });

    expect(upsertCalls).toBe(initialUpserts);
  });

  it('stays idle when accountId is missing', async () => {
    const { result } = renderHook(
      () =>
        useExtractWritebackProposals({
          analysisId: 'analysis-1',
          accountId: null,
          snapshot: SNAPSHOT,
          lineCategory: 'commercial',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.proposalsLoading).toBe(false);
    });

    expect(upsertCalls).toBe(0);
    expect(result.current.proposals).toEqual([]);
  });

  it('supersedes stale pending rows with a different snapshot_hash before upsert', async () => {
    const currentHash = await hashExtractSnapshot(SNAPSHOT);
    pendingRows = [
      {
        id: 'stale-1',
        carrier_name: 'Old Carrier',
        status: 'pending',
        snapshot_hash: 'stale-hash-different-from-current',
        proposed_quote: {},
      },
    ];

    renderHook(
      () =>
        useExtractWritebackProposals({
          analysisId: 'analysis-1',
          accountId: 'acct-1',
          snapshot: SNAPSHOT,
          lineCategory: 'commercial',
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(supersedeCalls).toBeGreaterThanOrEqual(1);
    });

    expect(supersededSnapshotHashes).toContain(currentHash);
    expect(supersededRowIds).toContain('stale-1');

    await waitFor(() => {
      expect(upsertCalls).toBeGreaterThanOrEqual(1);
    });
  });
});
