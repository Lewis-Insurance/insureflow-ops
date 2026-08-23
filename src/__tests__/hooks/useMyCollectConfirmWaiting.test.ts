import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useMyCollectConfirmWaiting } from '@/hooks/useMyCollectConfirmWaiting';

const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  rpc.mockReset();
});

describe('useMyCollectConfirmWaiting', () => {
  it('calls get_my_collect_confirm_waiting with p_limit 6 and maps rows', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          analysis_id: 'analysis-1',
          account_id: 'acct-1',
          account_name: 'Acme Manufacturing LLC',
          upload_id: 'upload-1',
          filename: 'dec-page.pdf',
          uploaded_at: '2026-08-22T14:05:00Z',
          pending_count: '2',
          line_class: 'commercial',
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMyCollectConfirmWaiting(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(rpc).toHaveBeenCalledWith('get_my_collect_confirm_waiting', { p_limit: 6 });
    expect(result.current.rows).toEqual([
      {
        analysis_id: 'analysis-1',
        account_id: 'acct-1',
        account_name: 'Acme Manufacturing LLC',
        upload_id: 'upload-1',
        filename: 'dec-page.pdf',
        uploaded_at: '2026-08-22T14:05:00Z',
        pending_count: 2,
        line_class: 'commercial',
      },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('returns empty rows when the RPC returns null data', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useMyCollectConfirmWaiting(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.rows).toEqual([]);
  });

  it('surfaces RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });

    const { result } = renderHook(() => useMyCollectConfirmWaiting(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error?.message).toBe('permission denied');
    expect(result.current.rows).toEqual([]);
  });
});
