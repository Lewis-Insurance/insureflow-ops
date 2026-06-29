import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Server-side policy search + pagination. Mirrors useUnifiedCustomers exactly:
 * a single-page fetch that replaces rows, a fetchNextPage that appends from a
 * loadedRef offset, and book-wide cohort/search/sort applied server-side so
 * pagination stays correct. Triage tile counts come from usePolicyTriageCounts,
 * never from counting these rows.
 */
export interface PolicyRow {
  id: string;
  account_id: string;
  named_insured: string;
  policy_number: string;
  carrier: string;
  line: string;
  status: string;
  premium: number;
  expiration_date: string | null;
  created_at: string;
}

const PAGE_SIZE = 250;

interface PolicyFilters {
  q?: string;
  sort?: string;
  cohort?: string;
  carrier?: string;
  status?: string;
}

export function usePolicySearch() {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Active filters + how many rows are loaded, so fetchNextPage pages from the
  // right offset without re-running the whole query.
  const filtersRef = useRef<PolicyFilters>({ q: '', sort: 'expiration_asc' });
  const loadedRef = useRef(0);

  const buildFilters = (f: PolicyFilters): Record<string, string> => {
    const out: Record<string, string> = { q: f.q ?? '' };
    if (f.cohort && f.cohort !== 'all') out.cohort = f.cohort;
    if (f.carrier) out.carrier = f.carrier;
    if (f.status) out.status = f.status;
    return out;
  };

  // Load the FIRST page for a given filter set. Replaces the prior rows rather
  // than accumulating the whole book. Cohort is applied server-side so the
  // rendered rows match the triage tile.
  const fetchPolicies = async (searchQuery = '', sort = 'expiration_asc', cohort?: string) => {
    try {
      setLoading(true);
      filtersRef.current = { q: searchQuery, sort, cohort };

      const { data, error } = await supabase.rpc('search_policies', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: 0,
        p_sort: sort,
      });

      if (error) throw error;

      const rows = (data || []) as PolicyRow[];
      setPolicies(rows);
      loadedRef.current = rows.length;
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      toast({
        title: 'Error loading policies',
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
      const { data, error } = await supabase.rpc('search_policies', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: loadedRef.current,
        p_sort: filtersRef.current.sort ?? 'expiration_asc',
      });

      if (error) throw error;

      const rows = (data || []) as PolicyRow[];
      setPolicies((prev) => [...prev, ...rows]);
      loadedRef.current += rows.length;
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      toast({
        title: 'Error loading more policies',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  return { policies, loading, loadingMore, hasMore, fetchPolicies, fetchNextPage };
}
