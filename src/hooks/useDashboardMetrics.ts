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

interface LeadQueryFilters {
  producerId?: string;
  start?: string;
  end?: string;
  status?: string;
}

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing'] as const;

function applyLeadFilters<T extends {
  is: (column: string, value: null) => T;
  eq: (column: string, value: string) => T;
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
}>(query: T, filters: LeadQueryFilters): T {
  let filtered = query.is('deleted_at', null);
  if (filters.producerId) filtered = filtered.eq('assigned_to', filters.producerId);
  if (filters.start) filtered = filtered.gte('created_at', filters.start);
  if (filters.end) filtered = filtered.lte('created_at', filters.end);
  if (filters.status) filtered = filtered.eq('status', filters.status);
  return filtered;
}

async function countLeads(filters: LeadQueryFilters = {}): Promise<number> {
  const query = applyLeadFilters(
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    filters,
  );
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function sumLeadPremium(filters: LeadQueryFilters = {}): Promise<number> {
  const query = applyLeadFilters(
    supabase.from('leads').select('current_premium.sum()'),
    filters,
  );
  const { data, error } = await query;
  if (error) throw error;
  const sum = data?.[0]?.sum;
  return sum != null ? Number(sum) : 0;
}

async function getPeriodMetrics(
  start: Date,
  end: Date,
  producerId?: string,
) {
  const period = { producerId, start: start.toISOString(), end: end.toISOString() };
  const [newLeads, contacted, qualified, quoted, won, revenue] = await Promise.all([
    countLeads(period),
    countLeads({ ...period, status: 'contacted' }),
    countLeads({ ...period, status: 'qualified' }),
    countLeads({ ...period, status: 'quoted' }),
    countLeads({ ...period, status: 'won' }),
    sumLeadPremium({ ...period, status: 'won' }),
  ]);
  return {
    newLeads,
    contacted,
    qualified,
    quoted,
    won,
    revenue,
    conversionRate: newLeads > 0 ? (won / newLeads) * 100 : 0,
  };
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

      const pipelineCountsPromise = Promise.all(
        PIPELINE_STAGES.map((status) => countLeads({ producerId, status })),
      );
      const [mtdStats, weekStats, quarterStats, todayCounts, pipelineCounts, totalValue] = await Promise.all([
        getPeriodMetrics(monthStart, monthEnd, producerId),
        getPeriodMetrics(weekStart, weekEnd, producerId),
        getPeriodMetrics(quarterStart, quarterEnd, producerId),
        Promise.all(
          ['new', 'contacted', 'qualified', 'quoted', 'won'].map((status) =>
            countLeads({
              producerId,
              start: dayStart.toISOString(),
              end: dayEnd.toISOString(),
              status,
            }),
          ),
        ),
        pipelineCountsPromise,
        sumLeadPremium({ producerId }),
      ]);

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
        newLeads: todayCounts[0],
        contacted: todayCounts[1],
        qualified: todayCounts[2],
        quoted: todayCounts[3],
        won: todayCounts[4],
        goalTarget: dailyGoal,
        goalProgress: 0,
      };
      todayStats.goalProgress = (todayStats.won / dailyGoal) * 100;

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
        new: pipelineCounts[0],
        contacted: pipelineCounts[1],
        qualified: pipelineCounts[2],
        quoted: pipelineCounts[3],
        won: pipelineCounts[4],
        lost: pipelineCounts[5],
        nurturing: pipelineCounts[6],
        totalValue,
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
        const period = {
          producerId: producer.id,
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        };
        const [totalLeads, wins, revenue] = await Promise.all([
          countLeads(period),
          countLeads({ ...period, status: 'won' }),
          sumLeadPremium({ ...period, status: 'won' }),
        ]);
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
      return Promise.all(PIPELINE_STAGES.map(async (stage): Promise<PipelineHealth> => {
        const [count, value] = await Promise.all([
          countLeads({ status: stage }),
          sumLeadPremium({ status: stage }),
        ]);
        return { stage, count, value, avgTimeInStage: 0, conversionRate: 0 };
      }));
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
