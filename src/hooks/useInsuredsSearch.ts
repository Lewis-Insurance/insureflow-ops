import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type InsuredRow = {
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
};

export type InsuredFilters = {
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

export function useInsuredsSearch(initial: InsuredFilters = {}) {
  const [filters, setFilters] = useState<InsuredFilters>(initial);
  const [sort, setSort] = useState<'updated_at_desc'|'updated_at_asc'|'name_asc'|'name_desc'>('updated_at_desc');
  const [rows, setRows] = useState<InsuredRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [cursor, setCursor] = useState<{updated_at: string; id: string} | null>(null);
  const debRef = useRef<number | undefined>(undefined);

  const run = async (reset = false) => {
    setLoading(true); setError(null);
    const payload: any = {
      p_filters: filters,
      p_limit: 25,
      p_after_updated_at: reset || !cursor ? null : cursor.updated_at,
      p_after_id: reset || !cursor ? null : cursor.id,
      p_sort: sort,
    };
    const { data, error } = await supabase.rpc('insureds_search_v1', payload);
    if (error) { setError(error.message); setLoading(false); return; }
    const list = (data ?? []) as InsuredRow[];
    setRows(reset ? list : [...rows, ...list]);
    if (list.length > 0) {
      const last = list[list.length - 1];
      setCursor({ updated_at: last.updated_at, id: last.account_id });
    } else if (reset) {
      setCursor(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    window.clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => { run(true); }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), sort]);

  return {
    rows, loading, error,
    filters, setFilters,
    sort, setSort,
    loadMore: () => run(false),
    refresh: () => run(true),
  };
}