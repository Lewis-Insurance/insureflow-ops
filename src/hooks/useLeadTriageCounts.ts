import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Whole-book lead triage counts computed server-side (get_lead_triage_counts RPC).
 * Counts are intentionally independent of the list's current page/search/cohort
 * so the triage tiles always report the true book-wide cohort sizes. Mirrors the
 * Customers pattern (useCustomerTriageCounts) so tile counts never break when the
 * row list is paginated.
 *
 * hot = lead_score >= 70.
 */
export interface LeadTriageCounts {
  total: number;
  new_leads: number;
  hot: number;
  qualified: number;
  quoted: number;
}

const EMPTY: LeadTriageCounts = {
  total: 0,
  new_leads: 0,
  hot: 0,
  qualified: 0,
  quoted: 0,
};

export function useLeadTriageCounts() {
  const [counts, setCounts] = useState<LeadTriageCounts>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_lead_triage_counts');
    if (!error && data && data.length > 0) {
      setCounts(data[0] as LeadTriageCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { counts, loading, refetch };
}
