import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Whole-book task triage counts computed server-side (get_task_triage_counts RPC).
 * Counts are intentionally independent of the list's current page/search/cohort
 * so the triage tiles always report the true book-wide cohort sizes. Mirrors the
 * Leads pattern (useLeadTriageCounts) so tile counts never break when the row
 * list is paginated.
 *
 * overdue = open task with due_at in the past.
 * due_this_week = open task due within the next 7 days.
 * high_priority = open task at high/urgent priority.
 * completed = task in the completed cohort.
 */
export interface TaskTriageCounts {
  open_total: number;
  overdue: number;
  due_this_week: number;
  high_priority: number;
  completed: number;
}

const EMPTY: TaskTriageCounts = {
  open_total: 0,
  overdue: 0,
  due_this_week: 0,
  high_priority: 0,
  completed: 0,
};

export function useTaskTriageCounts() {
  const [counts, setCounts] = useState<TaskTriageCounts>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_task_triage_counts');
    if (!error && data && data.length > 0) {
      setCounts(data[0] as TaskTriageCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { counts, loading, refetch };
}
