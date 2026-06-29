import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Whole-book policy triage counts computed server-side (get_policy_triage_counts
 * RPC). Counts are intentionally independent of the list's current page/search/
 * cohort so the triage tiles always report the true book-wide cohort sizes. This
 * mirrors useCustomerTriageCounts exactly so tile counts never break when the row
 * list is paginated. Never compute these client-side over a fetched page.
 */
export interface PolicyTriageCounts {
  total: number;
  expiring_30d: number;
  lapsed: number;
  no_renewal_date: number;
  recently_bound: number;
}

const EMPTY: PolicyTriageCounts = {
  total: 0,
  expiring_30d: 0,
  lapsed: 0,
  no_renewal_date: 0,
  recently_bound: 0,
};

export function usePolicyTriageCounts() {
  const [counts, setCounts] = useState<PolicyTriageCounts>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_policy_triage_counts');
    if (!error && data && data.length > 0) {
      setCounts(data[0] as PolicyTriageCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { counts, loading, refetch };
}
