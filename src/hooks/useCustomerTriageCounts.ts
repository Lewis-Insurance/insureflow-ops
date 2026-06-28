import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Whole-book triage counts computed server-side (get_customer_triage_counts RPC).
 * Counts are intentionally independent of the list's current page/search/cohort
 * so the triage tiles always report the true book-wide cohort sizes. This is the
 * pattern every list surface (Policies, Renewals) should reuse so tile counts
 * never break when the row list is paginated.
 */
export interface TriageCounts {
  total: number;
  renewals_30d: number;
  renewals_60d: number;
  overdue: number;
  no_active_policy: number;
  new_30d: number;
}

const EMPTY: TriageCounts = {
  total: 0,
  renewals_30d: 0,
  renewals_60d: 0,
  overdue: 0,
  no_active_policy: 0,
  new_30d: 0,
};

export function useCustomerTriageCounts() {
  const [counts, setCounts] = useState<TriageCounts>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_customer_triage_counts');
    if (!error && data && data.length > 0) {
      setCounts(data[0] as TriageCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { counts, loading, refetch };
}
