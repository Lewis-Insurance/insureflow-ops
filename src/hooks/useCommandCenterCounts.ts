import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CommandCenterCounts {
  openQuotes: number;
  criticalQuotes: number;
  upcomingRenewals: number;
  urgentRenewals: number;
  activeTasks: number;
  overdueTasks: number;
  escalations: number;
}

export function useCommandCenterCounts() {
  return useQuery({
    queryKey: ['command-center', 'counts'],
    queryFn: async (): Promise<CommandCenterCounts> => {
      const now = new Date();
      const quoteCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const nowIso = now.toISOString();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const sevenDaysFromNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      const sevenDaysFromToday = `${sevenDaysFromNow.getFullYear()}-${String(sevenDaysFromNow.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysFromNow.getDate()).padStart(2, '0')}`;
      const thirtyDaysFromNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
      const thirtyDaysFromToday = `${thirtyDaysFromNow.getFullYear()}-${String(thirtyDaysFromNow.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysFromNow.getDate()).padStart(2, '0')}`;

      const results = await Promise.all([
        supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open'),
        supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'open')
          .lt('created_at', quoteCutoff),
        supabase
          .from('policies')
          .select('id', { count: 'exact', head: true })
          .gte('expiration_date', today)
          .lte('expiration_date', thirtyDaysFromToday)
          .in('status', ['active', 'pending']),
        supabase
          .from('policies')
          .select('id', { count: 'exact', head: true })
          .gte('expiration_date', today)
          .lte('expiration_date', sevenDaysFromToday)
          .in('status', ['active', 'pending']),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .neq('status', 'completed'),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .neq('status', 'completed')
          .lt('due_at', nowIso),
      ]);

      for (const result of results) {
        if (result.error) throw result.error;
      }

      const [
        openQuotesResult,
        criticalQuotesResult,
        upcomingRenewalsResult,
        urgentRenewalsResult,
        activeTasksResult,
        overdueTasksResult,
      ] = results;

      const openQuotes = openQuotesResult.count ?? 0;
      const criticalQuotes = criticalQuotesResult.count ?? 0;
      const upcomingRenewals = upcomingRenewalsResult.count ?? 0;
      const urgentRenewals = urgentRenewalsResult.count ?? 0;
      const activeTasks = activeTasksResult.count ?? 0;
      const overdueTasks = overdueTasksResult.count ?? 0;

      return {
        openQuotes,
        criticalQuotes,
        upcomingRenewals,
        urgentRenewals,
        activeTasks,
        overdueTasks,
        escalations: criticalQuotes + urgentRenewals + Math.min(overdueTasks, 3),
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
