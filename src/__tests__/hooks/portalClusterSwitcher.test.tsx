import { readFileSync } from 'node:fs';
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_PORTAL_ACCOUNT_KEY,
  resolveActivePortalAccount,
  type PortalAccount,
  usePortalAccounts,
} from '@/hooks/usePortalAccounts';
import { useServiceRequests } from '@/hooks/useServiceRequests';

const rpc = vi.fn();
const requestQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
};
requestQuery.select.mockReturnValue(requestQuery);
requestQuery.eq.mockReturnValue(requestQuery);
requestQuery.order.mockResolvedValue({ data: [], error: null });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: vi.fn(() => requestQuery),
  },
}));

const accounts: PortalAccount[] = [
  { account_id: 'home-id', name: 'Home Company', is_home: true },
  { account_id: 'site-id', name: 'Site Company', is_home: false },
];

describe('portal cluster switcher', () => {
  let observedSearch = '';

  beforeEach(() => {
    rpc.mockReset();
    window.sessionStorage.clear();
    observedSearch = '';
  });

  function LocationObserver() {
    observedSearch = useLocation().search;
    return null;
  }

  function wrapper(initialEntry = '/portal/dashboard') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }: PropsWithChildren) => (
      <MemoryRouter initialEntries={[initialEntry]}>
        <QueryClientProvider client={queryClient}>
          <LocationObserver />
          {children}
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  it('uses a valid query account before session storage', () => {
    expect(resolveActivePortalAccount(accounts, 'site-id', 'home-id')).toBe('site-id');
  });

  it('falls back through storage to home and rejects inaccessible ids', () => {
    expect(resolveActivePortalAccount(accounts, 'foreign-id', 'site-id')).toBe('site-id');
    expect(resolveActivePortalAccount(accounts, 'foreign-id', 'also-foreign')).toBe('home-id');
  });

  it('calls the account RPC, sorts home first, and canonicalizes invalid state without losing query params', async () => {
    rpc.mockResolvedValue({
      data: [accounts[1], accounts[0]],
      error: null,
    });
    window.sessionStorage.setItem(ACTIVE_PORTAL_ACCOUNT_KEY, 'foreign-id');

    const { result } = renderHook(() => usePortalAccounts(), {
      wrapper: wrapper('/portal/dashboard?account=also-foreign&tab=documents'),
    });

    await waitFor(() => expect(result.current.activeAccountId).toBe('home-id'));
    await waitFor(() => expect(observedSearch).toContain('account=home-id'));
    expect(observedSearch).toContain('tab=documents');
    expect(result.current.accounts.map((account) => account.account_id)).toEqual(['home-id', 'site-id']);
    expect(window.sessionStorage.getItem(ACTIVE_PORTAL_ACCOUNT_KEY)).toBe('home-id');
    expect(rpc).toHaveBeenCalledWith('list_my_portal_accounts');

    act(() => result.current.selectAccount('site-id'));
    await waitFor(() => expect(result.current.activeAccountId).toBe('site-id'));
    expect(window.sessionStorage.getItem(ACTIVE_PORTAL_ACCOUNT_KEY)).toBe('site-id');
    expect(observedSearch).toContain('tab=documents');
  });

  it('passes the selected account in the create request mutation', async () => {
    rpc.mockResolvedValue({ data: 'request-id', error: null });
    const { result } = renderHook(() => useServiceRequests('site-id'), { wrapper: wrapper() });

    await act(async () => {
      await result.current.createRequest.mutateAsync({
        request_type: 'general_inquiry',
        request_title: 'Question',
        request_data: { details: 'Please help with this request.' },
      });
    });

    expect(rpc).toHaveBeenCalledWith('create_my_service_request', expect.objectContaining({
      p_account_id: 'site-id',
    }));
  });

  it('scopes every portal resource query and selected-account request path', () => {
    const documents = readFileSync('src/hooks/usePortalDocuments.ts', 'utf8');
    const cards = readFileSync('src/hooks/usePortalIDCards.ts', 'utf8');
    const requests = readFileSync('src/hooks/useServiceRequests.ts', 'utf8');
    const policies = readFileSync('src/hooks/usePortalPolicies.ts', 'utf8');

    for (const source of [documents, cards, requests]) {
      expect(source).toContain(".eq('account_id', accountId!)");
      expect(source).toContain('enabled: !!accountId');
    }
    expect(policies).toContain('p_account_id: accountId!');
    expect(policies).toContain('enabled: !!accountId');
    expect(requests).toContain('p_account_id: accountId');
    expect(policies).toContain("rpc('list_my_portal_policies'");
    expect(policies).not.toContain('list_account_policies');
  });
});
