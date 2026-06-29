import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * "Needs me today" counts, server-computed from real signals (get_needs_me_today
 * RPC). Renewals due agrees with the Policies triage strip by sharing its SQL.
 * Missed calls and quotes-to-send are intentionally absent (no real signal yet).
 * Refetches on window focus so the queue stays live.
 */
export interface NeedsMeToday {
  renewals_due: number;
  overdue_tasks: number;
  new_leads: number;
}

const EMPTY: NeedsMeToday = { renewals_due: 0, overdue_tasks: 0, new_leads: 0 };

export function useNeedsMeToday() {
  const [counts, setCounts] = useState<NeedsMeToday>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_needs_me_today');
    if (!error && data && data.length > 0) setCounts(data[0] as NeedsMeToday);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const total = counts.renewals_due + counts.overdue_tasks + counts.new_leads;
  return { counts, total, loading, refetch };
}
