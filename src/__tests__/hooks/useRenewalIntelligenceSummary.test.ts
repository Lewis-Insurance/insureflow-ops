import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  EMPTY_RENEWAL_INTELLIGENCE_SUMMARY,
  fetchAllSupabaseRows,
  mapRenewalIntelligenceSummaryRow,
} from '@/lib/renewalIntelligenceSummary';
import { useRenewalIntelligenceSummary } from '@/hooks/useRenewalIntelligence';

describe('mapRenewalIntelligenceSummaryRow', () => {
  it('returns empty summary for null/undefined rows', () => {
    expect(mapRenewalIntelligenceSummaryRow(null)).toEqual(EMPTY_RENEWAL_INTELLIGENCE_SUMMARY);
    expect(mapRenewalIntelligenceSummaryRow(undefined)).toEqual(EMPTY_RENEWAL_INTELLIGENCE_SUMMARY);
  });

  it('maps RPC counts without capping at 1000', () => {
    const summary = mapRenewalIntelligenceSummaryRow({
      total_renewals: 1757,
      renewals_next_30_days: 110,
      critical_risk: 12,
      high_risk: 48,
      medium_risk: 301,
      low_risk: 1396,
      avg_risk_score: 34,
      active_campaigns: 7,
    });

    expect(summary.total_renewals).toBe(1757);
    expect(summary.renewals_next_30_days).toBe(110);
    expect(summary.critical_risk + summary.high_risk + summary.medium_risk + summary.low_risk).toBe(1757);
    expect(summary.avg_risk_score).toBe(34);
    expect(summary.active_campaigns).toBe(7);
  });

  it('coalesces null fields to zero', () => {
    expect(
      mapRenewalIntelligenceSummaryRow({
        total_renewals: null,
        renewals_next_30_days: null,
        critical_risk: null,
        high_risk: null,
        medium_risk: null,
        low_risk: null,
        avg_risk_score: null,
        active_campaigns: null,
      })
    ).toEqual(EMPTY_RENEWAL_INTELLIGENCE_SUMMARY);
  });
});

describe('fetchAllSupabaseRows', () => {
  it('fetches every page until a short final page', async () => {
    const allRows = [
      ...Array.from({ length: 1000 }, (_, i) => ({ id: `row-${i}` })),
      ...Array.from({ length: 757 }, (_, i) => ({ id: `row-${1000 + i}` })),
    ];
    let call = 0;

    const rows = await fetchAllSupabaseRows(async ({ from, to }) => {
      call += 1;
      return {
        data: allRows.slice(from, to + 1),
        error: null,
      };
    });

    expect(rows).toHaveLength(1757);
    expect(call).toBe(2);
  });

  it('throws when a page errors', async () => {
    await expect(
      fetchAllSupabaseRows(async () => ({
        data: null,
        error: { message: 'boom' },
      }))
    ).rejects.toThrow('boom');
  });
});

const rpcMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: vi.fn(),
  },
}));

describe('useRenewalIntelligenceSummary', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('uses get_renewal_intelligence_summary RPC instead of client-side row counting', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          total_renewals: 1757,
          renewals_next_30_days: 110,
          critical_risk: 12,
          high_risk: 48,
          medium_risk: 301,
          low_risk: 1396,
          avg_risk_score: 34,
          active_campaigns: 7,
        },
      ],
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useRenewalIntelligenceSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith('get_renewal_intelligence_summary');
    expect(result.current.data?.total_renewals).toBe(1757);
    expect(result.current.data?.low_risk).toBe(1396);
  });
});
