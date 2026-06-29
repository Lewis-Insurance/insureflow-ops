import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Auto-Owners migration queue rows (search_ao_renewals RPC). Mirrors the
 * useUnifiedCustomers fetch architecture: first page loads on mount, fetchRenewals
 * replaces rows for a new filter set, fetchNextPage appends from the loaded offset
 * so paging stays correct (DATA-REALITY.md). Cohort and search are applied
 * server-side; triage counts come from useAoMigrationCounts, never from this page.
 */
export interface AoRenewalRow {
  id: string;
  account_id: string;
  customer_name: string;
  policy_number: string;
  policy_type: string;
  current_carrier: string;
  renewal_date: string | null;
  current_premium: number | null;
  status: string;
  moved_carrier: string | null;
  best_alternative_carrier: string | null;
  last_contact_date: string | null;
  follow_up_date: string | null;
}

const PAGE_SIZE = 250;

interface RenewalFilters {
  q?: string;
  sort?: string;
  cohort?: string;
}

export function useAoMigrationSearch() {
  const [renewals, setRenewals] = useState<AoRenewalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Active filters + how many rows are loaded, so fetchNextPage pages from the
  // right offset without re-running the whole query.
  const filtersRef = useRef<RenewalFilters>({ q: '', sort: 'renewal_asc' });
  const loadedRef = useRef(0);

  const buildFilters = (f: RenewalFilters): Record<string, string> => {
    const out: Record<string, string> = { q: f.q ?? '' };
    if (f.cohort && f.cohort !== 'all') out.cohort = f.cohort;
    return out;
  };

  // Load the FIRST page for a given filter set. Replaces the prior rows so the
  // rendered list matches the active triage tile / search.
  const fetchRenewals = async (q = '', sort = 'renewal_asc', cohort?: string) => {
    try {
      setLoading(true);
      filtersRef.current = { q, sort, cohort };

      const { data, error } = await supabase.rpc('search_ao_renewals', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: 0,
        p_sort: sort,
      });

      if (error) throw error;

      const rows = (data || []) as AoRenewalRow[];
      setRenewals(rows);
      loadedRef.current = rows.length;
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      toast({
        title: 'Error loading migration queue',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Append the next page for the current filter set.
  const fetchNextPage = async () => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const { data, error } = await supabase.rpc('search_ao_renewals', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: loadedRef.current,
        p_sort: filtersRef.current.sort ?? 'renewal_asc',
      });

      if (error) throw error;

      const rows = (data || []) as AoRenewalRow[];
      setRenewals((prev) => [...prev, ...rows]);
      loadedRef.current += rows.length;
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      toast({
        title: 'Error loading more renewals',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchRenewals();
  }, []);

  return {
    renewals,
    loading,
    loadingMore,
    hasMore,
    fetchRenewals,
    fetchNextPage,
  };
}
