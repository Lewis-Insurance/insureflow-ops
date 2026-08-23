import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AORenewal } from '@/hooks/useAORenewals';
import { useAoRenewalEvidence } from '@/hooks/useAoRenewalEvidence';
import type { AoRenewalExtractSignal } from '@/lib/aoRenewalExtractSignal';

const from = vi.fn();
const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...args: unknown[]) => from(...args), rpc: (...args: unknown[]) => rpc(...args) } }));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

function makeRenewal(id: string, accountId: string | null): AORenewal {
  return { id, account_id: accountId, customer_name: 'Sample', policy_number: `P-${id}`, policy_type: 'gl',
    renewal_date: '2026-06-01', current_premium: 1, term_months: 12, current_carrier: null,
    status: 'pending', priority: 'normal', assigned_to: null, notes: null, custom_data: null,
    losses_3yr: null, oldest_in_household: null, created_at: '2026-01-01', updated_at: '2026-01-01',
    last_contact_date: null, follow_up_date: null, follow_up_reason: null, follow_up_task_id: null,
    moved_carrier: null, moved_term: null, moved_premium: null };
}

const calls = { documents: [] as string[][], quotes: [] as string[][], fallback: [] as string[][] };
function installBuilders() {
  from.mockImplementation((table: string) => {
    if (table === 'documents' || table === 'quotes') {
      const builder = {
        select: vi.fn(() => builder),
        in: vi.fn((_column: string, ids: string[]) => { calls[table].push(ids); return builder; }),
        eq: vi.fn(() => builder),
        is: vi.fn(async () => ({ data: [], error: null })),
      };
      return builder;
    }
    const fallback = {
      select: vi.fn(() => fallback),
      in: vi.fn((_column: string, values: string[]) => {
        if (_column === 'renewal_id') calls.fallback.push(values);
        return _column === 'status' ? Promise.resolve({ data: [], error: null }) : fallback;
      }),
    };
    return fallback;
  });
}

beforeEach(() => {
  from.mockReset(); rpc.mockReset();
  calls.documents.length = calls.quotes.length = calls.fallback.length = 0;
  installBuilders();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('useAoRenewalEvidence', () => {
  it('stays disabled for empty input', async () => {
    const { result } = renderHook(() => useAoRenewalEvidence([]), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('chunks deduplicated account ids at 50 and returns a renewal-id map', async () => {
    const renewals = Array.from({ length: 52 }, (_, index) => makeRenewal(`r-${index}`, `a-${index % 51}`));
    const { result } = renderHook(() => useAoRenewalEvidence(renewals), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(calls.documents.map((ids) => ids.length)).toEqual([50, 1]);
    expect(calls.quotes.map((ids) => ids.length)).toEqual([50, 1]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([, args]) => args.p_account_ids.length)).toEqual([50, 1]);
    expect(result.current.data).toBeInstanceOf(Map);
    expect(result.current.data?.size).toBe(52);
    expect(result.current.data?.get('r-0')?.renewalId).toBe('r-0');
  });

  it('chunks only unlinked renewal fallback reads and does no account query', async () => {
    const renewals = Array.from({ length: 51 }, (_, index) => makeRenewal(`u-${index}`, null));
    const { result } = renderHook(() => useAoRenewalEvidence(renewals), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.fallback.map((ids) => ids.length)).toEqual([50, 1]);
    expect(rpc).not.toHaveBeenCalled();
    expect(calls.documents).toEqual([]);
    expect(result.current.data?.size).toBe(51);
  });

  it('recomposes when a late extract signal arrives without refetching raw evidence', async () => {
    const renewals = [makeRenewal('r-late', 'account-late')];
    const { result, rerender } = renderHook(
      ({ signals }: { signals?: Map<string, AoRenewalExtractSignal> }) => useAoRenewalEvidence(renewals, signals),
      { wrapper: wrapper(), initialProps: { signals: undefined } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.get('r-late')?.dec.state).toBe('none');
    const rawFetches = from.mock.calls.length;
    const rpcFetches = rpc.mock.calls.length;

    rerender({ signals: new Map([['r-late', { analysisId: 'analysis-late', label: 'Extract ready', documentType: 'dec_page' }]]) });

    await waitFor(() => expect(result.current.data?.get('r-late')?.dec.state).toBe('on_file'));
    expect(result.current.data?.get('r-late')?.extract?.analysisId).toBe('analysis-late');
    expect(from).toHaveBeenCalledTimes(rawFetches);
    expect(rpc).toHaveBeenCalledTimes(rpcFetches);
  });

  it('refetches when an existing renewal becomes linked without changing renewal identity', async () => {
    const { result, rerender } = renderHook(
      ({ accountId }: { accountId: string | null }) => useAoRenewalEvidence([makeRenewal('same-id', accountId)]),
      { wrapper: wrapper(), initialProps: { accountId: null } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.fallback).toEqual([['same-id']]);
    expect(calls.documents).toEqual([]);

    rerender({ accountId: 'new-account' });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(calls.documents).toEqual([['new-account']]));
    expect(calls.quotes).toEqual([['new-account']]);
    expect(rpc).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.data?.get('same-id')?.accountId).toBe('new-account'));
    expect(result.current.isLoading).toBe(false);
  });
});
