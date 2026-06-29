import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Whole-book Auto-Owners migration counts computed server-side
 * (get_ao_migration_counts RPC). Counts are intentionally independent of the
 * list's current page / search / cohort so the triage tiles always report the
 * true book-wide cohort sizes. Mirrors useCustomerTriageCounts so tile counts
 * never break when the row list is paginated (DATA-REALITY.md).
 */
export interface AoMigrationCounts {
  total: number;
  not_started: number;
  quote_out: number;
  bound_elsewhere: number;
  lapsing_week: number;
}

const EMPTY: AoMigrationCounts = {
  total: 0,
  not_started: 0,
  quote_out: 0,
  bound_elsewhere: 0,
  lapsing_week: 0,
};

export function useAoMigrationCounts() {
  const [counts, setCounts] = useState<AoMigrationCounts>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_ao_migration_counts');
    if (!error && data && data.length > 0) {
      setCounts(data[0] as AoMigrationCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { counts, loading, refetch };
}
