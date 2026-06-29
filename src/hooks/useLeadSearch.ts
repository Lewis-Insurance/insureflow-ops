import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Paginated server-side lead search (search_leads RPC). Mirrors the
 * useUnifiedCustomers fetch architecture exactly: the first page loads on mount,
 * fetchLeads replaces the rows for a new filter set, and fetchNextPage appends
 * from the right offset using loadedRef so paging never re-runs the whole query.
 * Cohort and status are applied server-side so the rendered rows always match
 * the active triage tile.
 */
export interface LeadRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  lead_score: number | null;
  insurance_types: string[] | null;
  current_carrier: string | null;
  last_contact_at: string | null;
  next_follow_up_date: string | null;
  account_id: string | null;
  converted_account_id: string | null;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 250;

interface LeadFilters {
  q?: string;
  sort?: string;
  cohort?: string;
  status?: string;
}

export function useLeadSearch() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active filters + how many rows are loaded, so fetchNextPage pages from the
  // right offset without re-running the whole query.
  const filtersRef = useRef<LeadFilters>({ q: '', sort: 'score_desc' });
  const loadedRef = useRef(0);

  const buildFilters = (f: LeadFilters): Record<string, string> => {
    const out: Record<string, string> = { q: f.q ?? '' };
    if (f.cohort && f.cohort !== 'all') out.cohort = f.cohort;
    if (f.status) out.status = f.status;
    return out;
  };

  // Load the FIRST page for a given filter set, replacing the current rows.
  // Cohort and status are applied server-side so the rendered rows match the
  // triage tile / status filter.
  const fetchLeads = async (q = '', sort = 'score_desc', cohort?: string, status?: string) => {
    try {
      setLoading(true);
      filtersRef.current = { q, sort, cohort, status };

      const { data, error } = await supabase.rpc('search_leads', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: 0,
        p_sort: sort,
      });

      if (error) throw error;

      const rows = (data || []) as LeadRow[];
      setLeads(rows);
      loadedRef.current = rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setTotalCount(rows.length);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast({
        title: 'Error loading leads',
        description: message,
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
      const { data, error } = await supabase.rpc('search_leads', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: loadedRef.current,
        p_sort: filtersRef.current.sort ?? 'score_desc',
      });

      if (error) throw error;

      const rows = (data || []) as LeadRow[];
      setLeads((prev) => [...prev, ...rows]);
      loadedRef.current += rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setTotalCount(loadedRef.current);
    } catch (err) {
      toast({
        title: 'Error loading more leads',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  return {
    leads,
    totalCount,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchLeads,
    fetchNextPage,
    refetch: () => fetchLeads(),
  };
}
