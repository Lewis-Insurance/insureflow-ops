import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, format } from 'date-fns';
import { logger } from '@/lib/logger';

export interface DashboardMetrics {
  today: {
    newLeads: number;
    contacted: number;
    qualified: number;
    quoted: number;
    won: number;
    goalTarget: number;
    goalProgress: number;
  };
  week: {
    newLeads: number;
    contacted: number;
    qualified: number;
    quoted: number;
    won: number;
    revenue: number;
    conversionRate: number;
  };
  mtd: {
    newLeads: number;
    contacted: number;
    qualified: number;
    quoted: number;
    won: number;
    revenue: number;
    conversionRate: number;
  };
  quarter: {
    newLeads: number;
    contacted: number;
    qualified: number;
    quoted: number;
    won: number;
    revenue: number;
    conversionRate: number;
  };
  trend: {
    projectedWins: number;
    projectedRevenue: number;
    onTrack: boolean;
    daysRemaining: number;
    dailyAverage: number;
  };
  pipeline: {
    new: number;
    contacted: number;
    qualified: number;
    quoted: number;
    won: number;
    lost: number;
    nurturing: number;
    totalValue: number;
  };
}

export interface ProducerLeaderboard {
  producer_id: string;
  producer_name: string;
  avatar_url?: string;
  wins: number;
  revenue: number;
  conversion_rate: number;
  avg_deal_size: number;
}

export interface PipelineHealth {
  stage: string;
  count: number;
  value: number;
  avgTimeInStage: number;
  conversionRate: number;
}

/**
 * Get dashboard metrics for a specific producer or agency-wide
 */
export function useDashboardMetrics(producerId?: string) {
  return useQuery({
    queryKey: ['dashboard-metrics', producerId],
    queryFn: async () => {
      const today = new Date();
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const dayStart = startOfDay(today);
      const dayEnd = endOfDay(today);
      
      // Week calculations
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      // Quarter calculations
      const quarter = Math.floor(today.getMonth() / 3);
      const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
      const quarterEnd = new Date(today.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);

      // Build query with optional producer filter
      let leadsQuery = supabase
        .from('leads')
        .select('*')
        .is('deleted_at', null); // Exclude soft-deleted leads

      if (producerId) {
        leadsQuery = leadsQuery.eq('assigned_to', producerId);
      }

      // Fetch all leads
      const { data: allLeads, error: allError } = await leadsQuery;
      if (allError) throw allError;

      // Fetch MTD leads
      let mtdQuery = supabase
        .from('leads')
        .select('*')
        .is('deleted_at', null) // Exclude soft-deleted leads
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (producerId) {
        mtdQuery = mtdQuery.eq('assigned_to', producerId);
      }

      const { data: mtdLeads, error: mtdError } = await mtdQuery;
      if (mtdError) throw mtdError;

      // Fetch today's leads
      let todayQuery = supabase
        .from('leads')
        .select('*')
        .is('deleted_at', null) // Exclude soft-deleted leads
        .gte('created_at', dayStart.toISOString())
        .lte('created_at', dayEnd.toISOString());

      if (producerId) {
        todayQuery = todayQuery.eq('assigned_to', producerId);
      }

      const { data: todayLeads, error: todayError } = await todayQuery;
      if (todayError) throw todayError;

      // Fetch this week's leads
      let weekQuery = supabase
        .from('leads')
        .select('*')
        .is('deleted_at', null) // Exclude soft-deleted leads
        .gte('created_at', weekStart.toISOString())
        .lte('created_at', weekEnd.toISOString());

      if (producerId) {
        weekQuery = weekQuery.eq('assigned_to', producerId);
      }

      const { data: weekLeads, error: weekError } = await weekQuery;
      if (weekError) throw weekError;

      // Fetch this quarter's leads
      let quarterQuery = supabase
        .from('leads')
        .select('*')
        .is('deleted_at', null) // Exclude soft-deleted leads
        .gte('created_at', quarterStart.toISOString())
        .lte('created_at', quarterEnd.toISOString());

      if (producerId) {
        quarterQuery = quarterQuery.eq('assigned_to', producerId);
      }

      const { data: quarterLeads, error: quarterError } = await quarterQuery;
      if (quarterError) throw quarterError;

      // Fetch producer goals (if individual dashboard)
      let dailyGoal = 5; // Default goal
      let monthlyGoal = 100; // Default goal
      
      if (producerId) {
        try {
          const { data: goals, error: goalsError } = await supabase
            .from('producer_goals')
            .select('*')
            .eq('producer_id', producerId)
            .eq('month', format(today, 'yyyy-MM'))
            .maybeSingle();
          
          if (!goalsError && goals) {
            dailyGoal = goals.daily_target || 5;
            monthlyGoal = goals.monthly_target || 100;
          }
        } catch (error) {
          logger.debug('Producer goals not available, using defaults');
        }
      }

      // Calculate metrics
      const todayStats = {
        newLeads: todayLeads?.filter(l => l.status === 'new').length || 0,
        contacted: todayLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: todayLeads?.filter(l => l.status === 'qualified').length || 0,
        quoted: todayLeads?.filter(l => l.status === 'quoted').length || 0,
        won: todayLeads?.filter(l => l.status === 'won').length || 0,
        goalTarget: dailyGoal,
        goalProgress: 0,
      };
      todayStats.goalProgress = (todayStats.won / dailyGoal) * 100;

      const mtdStats = {
        newLeads: mtdLeads?.length || 0,
        contacted: mtdLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: mtdLeads?.filter(l => l.status === 'qualified').length || 0,
        quoted: mtdLeads?.filter(l => l.status === 'quoted').length || 0,
        won: mtdLeads?.filter(l => l.status === 'won').length || 0,
        revenue: mtdLeads?.filter(l => l.status === 'won').reduce((sum, l) => sum + (l.current_premium || 0), 0) || 0,
        conversionRate: 0,
      };
      mtdStats.conversionRate = mtdStats.newLeads > 0 
        ? (mtdStats.won / mtdStats.newLeads) * 100 
        : 0;

      // Calculate this week's stats
      const weekStats = {
        newLeads: weekLeads?.length || 0,
        contacted: weekLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: weekLeads?.filter(l => l.status === 'qualified').length || 0,
        quoted: weekLeads?.filter(l => l.status === 'quoted').length || 0,
        won: weekLeads?.filter(l => l.status === 'won').length || 0,
        revenue: weekLeads?.filter(l => l.status === 'won').reduce((sum, l) => sum + (l.current_premium || 0), 0) || 0,
        conversionRate: 0,
      };
      weekStats.conversionRate = weekStats.newLeads > 0 
        ? (weekStats.won / weekStats.newLeads) * 100 
        : 0;

      // Calculate this quarter's stats
      const quarterStats = {
        newLeads: quarterLeads?.length || 0,
        contacted: quarterLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: quarterLeads?.filter(l => l.status === 'qualified').length || 0,
        quoted: quarterLeads?.filter(l => l.status === 'quoted').length || 0,
        won: quarterLeads?.filter(l => l.status === 'won').length || 0,
        revenue: quarterLeads?.filter(l => l.status === 'won').reduce((sum, l) => sum + (l.current_premium || 0), 0) || 0,
        conversionRate: 0,
      };
      quarterStats.conversionRate = quarterStats.newLeads > 0 
        ? (quarterStats.won / quarterStats.newLeads) * 100 
        : 0;

      // Calculate trend/projection
      const daysInMonth = endOfMonth(today).getDate();
      const daysElapsed = today.getDate();
      const daysRemaining = daysInMonth - daysElapsed;
      const dailyAverage = daysElapsed > 0 ? mtdStats.won / daysElapsed : 0;
      const projectedWins = Math.round(dailyAverage * daysInMonth);
      const projectedRevenue = Math.round((mtdStats.revenue / daysElapsed) * daysInMonth);

      const trendStats = {
        projectedWins,
        projectedRevenue,
        onTrack: projectedWins >= monthlyGoal,
        daysRemaining,
        dailyAverage: Math.round(dailyAverage * 10) / 10,
      };

      // Pipeline distribution
      const pipelineStats = {
        new: allLeads?.filter(l => l.status === 'new').length || 0,
        contacted: allLeads?.filter(l => l.status === 'contacted').length || 0,
        qualified: allLeads?.filter(l => l.status === 'qualified').length || 0,
        quoted: allLeads?.filter(l => l.status === 'quoted').length || 0,
        won: allLeads?.filter(l => l.status === 'won').length || 0,
        lost: allLeads?.filter(l => l.status === 'lost').length || 0,
        nurturing: allLeads?.filter(l => l.status === 'nurturing').length || 0,
        totalValue: allLeads?.reduce((sum, l) => sum + (l.current_premium || 0), 0) || 0,
      };

      const metrics: DashboardMetrics = {
        today: todayStats,
        week: weekStats,
        mtd: mtdStats,
        quarter: quarterStats,
        trend: trendStats,
        pipeline: pipelineStats,
      };

      return metrics;
    },
    refetchInterval: 60000, // Refresh every minute
  });
}

/**
 * Get producer leaderboard
 */
export function useProducerLeaderboard() {
  return useQuery({
    queryKey: ['producer-leaderboard'],
    queryFn: async () => {
      const monthStart = startOfMonth(new Date());
      const monthEnd = endOfMonth(new Date());

      // Get all producers with their MTD stats
      const { data: producers, error: producersError } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .in('role', ['producer', 'staff', 'admin']);

      if (producersError) throw producersError;

      const leaderboard: ProducerLeaderboard[] = [];

      for (const producer of producers || []) {
        const { data: leads } = await supabase
          .from('leads')
          .select('*')
          .is('deleted_at', null) // Exclude soft-deleted leads
          .eq('assigned_to', producer.id)
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString());

        const totalLeads = leads?.length || 0;
        const wins = leads?.filter(l => l.status === 'won').length || 0;
        const revenue = leads?.filter(l => l.status === 'won').reduce((sum, l) => sum + (l.current_premium || 0), 0) || 0;
        const conversionRate = totalLeads > 0 ? (wins / totalLeads) * 100 : 0;
        const avgDealSize = wins > 0 ? revenue / wins : 0;

        leaderboard.push({
          producer_id: producer.id,
          producer_name: producer.full_name || 'Unknown',
          avatar_url: producer.avatar_url,
          wins,
          revenue,
          conversion_rate: Math.round(conversionRate * 10) / 10,
          avg_deal_size: Math.round(avgDealSize),
        });
      }

      // Sort by wins descending
      return leaderboard.sort((a, b) => b.wins - a.wins);
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}

/**
 * Get pipeline health metrics
 */
export function usePipelineHealth() {
  return useQuery({
    queryKey: ['pipeline-health'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('*')
        .is('deleted_at', null); // Exclude soft-deleted leads

      if (error) throw error;

      const stages = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing'];
      const health: PipelineHealth[] = [];

      for (const stage of stages) {
        const stageLeads = leads?.filter(l => l.status === stage) || [];
        const count = stageLeads.length;
        const value = stageLeads.reduce((sum, l) => sum + (l.current_premium || 0), 0);
        
        // Calculate average time in stage (simplified)
        const avgTimeInStage = 0;
        
        // Calculate conversion rate
        const conversionRate = 0;

        health.push({
          stage,
          count,
          value,
          avgTimeInStage,
          conversionRate,
        });
      }

      return health;
    },
    refetchInterval: 300000, // Refresh every 5 minutes
  });
}

/**
 * Get historical trend data for charts
 */
export function useHistoricalTrend(days: number = 30, producerId?: string) {
  return useQuery({
    queryKey: ['historical-trend', days, producerId],
    queryFn: async () => {
      const today = new Date();
      const startDate = subDays(today, days);

      let query = supabase
        .from('leads')
        .select('created_at, status, current_premium')
        .is('deleted_at', null) // Exclude soft-deleted leads
        .gte('created_at', startDate.toISOString());

      if (producerId) {
        query = query.eq('assigned_to', producerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by day
      const dailyStats: Record<string, { date: string; newLeads: number; won: number; revenue: number }> = {};

      for (let i = 0; i <= days; i++) {
        const date = format(subDays(today, i), 'yyyy-MM-dd');
        dailyStats[date] = { date, newLeads: 0, won: 0, revenue: 0 };
      }

      data?.forEach(lead => {
        const date = format(new Date(lead.created_at), 'yyyy-MM-dd');
        if (dailyStats[date]) {
          dailyStats[date].newLeads++;
          if (lead.status === 'won') {
            dailyStats[date].won++;
            dailyStats[date].revenue += lead.current_premium || 0;
          }
        }
      });

      return Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}
