import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CustomerRow = {
  account_id: string;
  display_name: string | null;
  org_name: string | null;
  type: string | null;
  city: string | null;
  state: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  policies_count: number | null;
  balance: number | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  rank?: number;
};

export type CustomerFilters = {
  q?: string;
  type?: string;
  status?: string;
  city?: string;
  state?: string;
  postal?: string;
  created_from?: string;
  created_to?: string;
  updated_from?: string;
  updated_to?: string;
};

export function useCustomersSearch(initial: CustomerFilters = {}) {
  const [filters, setFilters] = useState<CustomerFilters>(initial);
  const [sort, setSort] = useState<'updated_at_desc'|'updated_at_asc'|'name_asc'|'name_desc'|'rank_desc'>('updated_at_desc');
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debRef = useRef<number | undefined>(undefined);

  const run = async (reset = false) => {
    setLoading(true); 
    setError(null);
    
    const currentOffset = reset ? 0 : offset;
    const payload = {
      p_filters: filters,
      p_limit: 25,
      p_offset: currentOffset,
      p_sort: sort,
    };

    try {
      const { data, error } = await supabase.rpc('customers_search_v1', payload);
      if (error) { 
        setError(error.message); 
        setLoading(false); 
        return; 
      }
      
      const list = (data ?? []) as CustomerRow[];
      setRows(reset ? list : [...rows, ...list]);
      setHasMore(list.length === 25);
      setOffset(reset ? 25 : currentOffset + 25);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
    
    setLoading(false);
  };

  useEffect(() => {
    window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => { 
      setOffset(0);
      run(true); 
    }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), sort]);

  const setSortTyped = (value: string) => {
    setSort(value as typeof sort);
  };

  return {
    rows, 
    loading, 
    error,
    hasMore,
    filters, 
    setFilters,
    sort, 
    setSort: setSortTyped,
    loadMore: () => run(false),
    refresh: () => {
      setOffset(0);
      run(true);
    },
  };
}