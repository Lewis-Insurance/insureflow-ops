import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { NeedsMeToday } from '@/hooks/useNeedsMeToday';

/**
 * Producer-scoped "needs me today" counts (get_my_needs_me_today RPC).
 * Overdue tasks and new leads are filtered to the signed-in user; renewals
 * stay agency-wide (same SQL as get_needs_me_today). Refetches on window focus.
 */
const EMPTY: NeedsMeToday = { renewals_due: 0, overdue_tasks: 0, new_leads: 0 };

export function useMyNeedsMeToday() {
  const [counts, setCounts] = useState<NeedsMeToday>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_needs_me_today');
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
