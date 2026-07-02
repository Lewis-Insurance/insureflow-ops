import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/**
 * Paginated server-side task search (search_tasks RPC). Mirrors useLeadSearch
 * exactly: the first page loads on mount, fetchTasks replaces the rows for a new
 * filter set, and fetchNextPage appends from the right offset using loadedRef so
 * paging never re-runs the whole query. Cohort is applied server-side so the
 * rendered rows always match the active triage tile.
 */
export interface TaskRow {
  id: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_at: string | null;
  entity_type: string | null;
  account_id: string | null;
  account_name: string | null;
  created_at: string;
  completed_at: string | null;
}

const PAGE_SIZE = 250;

interface TaskFilters {
  q?: string;
  sort?: string;
  cohort?: string;
}

export function useTaskSearch() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active filters + how many rows are loaded, so fetchNextPage pages from the
  // right offset without re-running the whole query.
  const filtersRef = useRef<TaskFilters>({ q: '', sort: 'due_asc' });
  const loadedRef = useRef(0);

  const buildFilters = (f: TaskFilters): Record<string, string> => {
    const out: Record<string, string> = { q: f.q ?? '' };
    if (f.cohort && f.cohort !== 'all') out.cohort = f.cohort;
    return out;
  };

  // Load the FIRST page for a given filter set, replacing the current rows.
  // Cohort is applied server-side so the rendered rows match the triage tile.
  const fetchTasks = async (q = '', sort = 'due_asc', cohort?: string) => {
    try {
      setLoading(true);
      filtersRef.current = { q, sort, cohort };

      const { data, error } = await supabase.rpc('search_tasks', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: 0,
        p_sort: sort,
      });

      if (error) throw error;

      const rows = (data || []) as TaskRow[];
      setTasks(rows);
      loadedRef.current = rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setTotalCount(rows.length);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast({
        title: 'Error loading tasks',
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
      const { data, error } = await supabase.rpc('search_tasks', {
        p_filters: buildFilters(filtersRef.current),
        p_limit: PAGE_SIZE,
        p_offset: loadedRef.current,
        p_sort: filtersRef.current.sort ?? 'due_asc',
      });

      if (error) throw error;

      const rows = (data || []) as TaskRow[];
      setTasks((prev) => [...prev, ...rows]);
      loadedRef.current += rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setTotalCount(loadedRef.current);
    } catch (err) {
      toast({
        title: 'Error loading more tasks',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return {
    tasks,
    totalCount,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchTasks,
    fetchNextPage,
    refetch: () => fetchTasks(),
  };
}
