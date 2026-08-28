import { useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export const ACTIVE_PORTAL_ACCOUNT_KEY = 'active_account_id';

export interface PortalAccount {
  account_id: string;
  name: string;
  is_home: boolean;
}

export function resolveActivePortalAccount(
  accounts: PortalAccount[],
  queryAccountId: string | null,
  storedAccountId: string | null,
): string | null {
  const accessibleIds = new Set(accounts.map((account) => account.account_id));
  if (queryAccountId && accessibleIds.has(queryAccountId)) return queryAccountId;
  if (storedAccountId && accessibleIds.has(storedAccountId)) return storedAccountId;
  return accounts.find((account) => account.is_home)?.account_id ?? accounts[0]?.account_id ?? null;
}

export function usePortalAccounts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const accountsQuery = useQuery({
    queryKey: ['portal-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_portal_accounts');
      if (error) throw error;
      return [...(data ?? [])].sort((left, right) =>
        Number(right.is_home) - Number(left.is_home) || left.name.localeCompare(right.name),
      ) as PortalAccount[];
    },
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const queryAccountId = searchParams.get('account');
  const storedAccountId = typeof window === 'undefined'
    ? null
    : window.sessionStorage.getItem(ACTIVE_PORTAL_ACCOUNT_KEY);
  const activeAccountId = useMemo(
    () => resolveActivePortalAccount(accounts, queryAccountId, storedAccountId),
    [accounts, queryAccountId, storedAccountId],
  );

  useEffect(() => {
    if (!accountsQuery.isSuccess || !activeAccountId) return;

    window.sessionStorage.setItem(ACTIVE_PORTAL_ACCOUNT_KEY, activeAccountId);
    if (queryAccountId !== activeAccountId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('account', activeAccountId);
        return next;
      }, { replace: true });
    }
  }, [accountsQuery.isSuccess, activeAccountId, queryAccountId, setSearchParams]);

  const selectAccount = useCallback((accountId: string) => {
    if (!accounts.some((account) => account.account_id === accountId)) return;
    window.sessionStorage.setItem(ACTIVE_PORTAL_ACCOUNT_KEY, accountId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('account', accountId);
      return next;
    }, { replace: true });
  }, [accounts, setSearchParams]);

  return {
    accounts,
    activeAccountId,
    activeAccount: accounts.find((account) => account.account_id === activeAccountId) ?? null,
    selectAccount,
    isLoading: accountsQuery.isLoading,
    error: accountsQuery.error,
  };
}
