import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, differenceInDays, addDays, format } from 'date-fns';

export type ProjectionMetric = 'revenue' | 'leads' | 'policies' | 'calls' | 'quotes';

interface ProjectionData {
  date: string;
  actual: number;
  projected: number;
  target: number;
}

interface MetricSummary {
  current: number;
  projected: number;
  target: number;
  percentOfTarget: number;
  percentOfPeriod: number;
  onTrack: boolean;
  variance: number;
}

interface ProjectionResult {
  metric: ProjectionMetric;
  data: ProjectionData[];
  summary: MetricSummary;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Hook to calculate projections based on current actuals and elapsed time
 * Extrapolates performance based on time elapsed vs total period
 */
export function useLeadProjections(
  metric: ProjectionMetric = 'revenue',
  periodStart?: Date,
  periodEnd?: Date
) {
  const start = periodStart || startOfMonth(new Date());
  const end = periodEnd || endOfMonth(new Date());

  return useQuery({
    queryKey: ['lead-projections', metric, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      // Fetch lead data for the period
      const { data: leads, error } = await supabase
        .from('leads')
        .select('*, lead_activities(*)')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (error) throw error;

      // Calculate total days in period and elapsed days
      const totalDays = differenceInDays(end, start);
      const elapsedDays = differenceInDays(new Date(), start);
      const percentElapsed = Math.min((elapsedDays / totalDays) * 100, 100);

      // Calculate actuals based on metric
      let currentActual = 0;
      let dailyData: { [date: string]: number } = {};

      leads?.forEach((lead) => {
        const leadDate = format(new Date(lead.created_at), 'yyyy-MM-dd');
        
        switch (metric) {
          case 'revenue':
            currentActual += lead.current_premium || 0;
            dailyData[leadDate] = (dailyData[leadDate] || 0) + (lead.current_premium || 0);
            break;
          case 'leads':
            currentActual += 1;
            dailyData[leadDate] = (dailyData[leadDate] || 0) + 1;
            break;
          case 'policies':
            if (lead.status === 'won') {
              currentActual += 1;
              dailyData[leadDate] = (dailyData[leadDate] || 0) + 1;
            }
            break;
          case 'calls':
            const callActivities = lead.lead_activities?.filter(
              (a: any) => a.activity_type === 'call'
            ).length || 0;
            currentActual += callActivities;
            dailyData[leadDate] = (dailyData[leadDate] || 0) + callActivities;
            break;
          case 'quotes':
            if (['proposal', 'won'].includes(lead.status)) {
              currentActual += 1;
              dailyData[leadDate] = (dailyData[leadDate] || 0) + 1;
            }
            break;
        }
      });

      // Calculate projection based on current pace
      const dailyRate = elapsedDays > 0 ? currentActual / elapsedDays : 0;
      const projectedTotal = dailyRate * totalDays;

      // Set targets based on metric (these would ideally come from a goals table)
      const targets: Record<ProjectionMetric, number> = {
        revenue: 100000, // $100k monthly revenue target
        leads: 50, // 50 leads per month
        policies: 20, // 20 policies per month
        calls: 200, // 200 calls per month
        quotes: 30, // 30 quotes per month
      };

      const target = targets[metric];
      const percentOfTarget = (currentActual / target) * 100;
      const expectedAtThisPoint = (target * percentElapsed) / 100;
      const variance = currentActual - expectedAtThisPoint;
      const onTrack = currentActual >= expectedAtThisPoint * 0.9; // Within 10% tolerance

      // Generate daily projection data
      const projectionData: ProjectionData[] = [];
      let runningActual = 0;

      for (let i = 0; i <= totalDays; i++) {
        const date = addDays(start, i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayActual = dailyData[dateStr] || 0;
        runningActual += dayActual;

        projectionData.push({
          date: dateStr,
          actual: i <= elapsedDays ? runningActual : 0,
          projected: dailyRate * i,
          target: (target / totalDays) * i,
        });
      }

      // Determine trend
      const firstHalfDays = Math.floor(elapsedDays / 2);
      const firstHalfActual = projectionData
        .slice(0, firstHalfDays)
        .reduce((sum, d) => sum + (d.actual > 0 ? 1 : 0), 0);
      const secondHalfActual = projectionData
        .slice(firstHalfDays, elapsedDays)
        .reduce((sum, d) => sum + (d.actual > 0 ? 1 : 0), 0);

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (secondHalfActual > firstHalfActual * 1.1) trend = 'up';
      else if (secondHalfActual < firstHalfActual * 0.9) trend = 'down';

      const result: ProjectionResult = {
        metric,
        data: projectionData,
        summary: {
          current: currentActual,
          projected: projectedTotal,
          target,
          percentOfTarget,
          percentOfPeriod: percentElapsed,
          onTrack,
          variance,
        },
        trend,
      };

      return result;
    },
  });
}

/**
 * Hook to get projections for multiple metrics at once
 */
export function useMultiMetricProjections(
  metrics: ProjectionMetric[] = ['revenue', 'leads', 'policies', 'quotes'],
  periodStart?: Date,
  periodEnd?: Date
) {
  const start = periodStart || startOfMonth(new Date());
  const end = periodEnd || endOfMonth(new Date());

  return useQuery({
    queryKey: ['multi-metric-projections', metrics, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      // Fetch all data once
      const { data: leads, error } = await supabase
        .from('leads')
        .select('*, lead_activities(*)')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (error) throw error;

      const totalDays = differenceInDays(end, start);
      const elapsedDays = differenceInDays(new Date(), start);

      // Process all metrics
      const results: Record<ProjectionMetric, ProjectionResult> = {} as any;

      metrics.forEach((metric) => {
        let currentActual = 0;

        leads?.forEach((lead) => {
          switch (metric) {
            case 'revenue':
              currentActual += lead.current_premium || 0;
              break;
            case 'leads':
              currentActual += 1;
              break;
            case 'policies':
              if (lead.status === 'won') currentActual += 1;
              break;
            case 'calls':
              const callActivities = lead.lead_activities?.filter(
                (a: any) => a.activity_type === 'call'
              ).length || 0;
              currentActual += callActivities;
              break;
            case 'quotes':
              if (['proposal', 'won'].includes(lead.status)) currentActual += 1;
              break;
          }
        });

        const dailyRate = elapsedDays > 0 ? currentActual / elapsedDays : 0;
        const projectedTotal = dailyRate * totalDays;

        const targets: Record<ProjectionMetric, number> = {
          revenue: 100000,
          leads: 50,
          policies: 20,
          calls: 200,
          quotes: 30,
        };

        const target = targets[metric];
        const percentElapsed = Math.min((elapsedDays / totalDays) * 100, 100);
        const percentOfTarget = (currentActual / target) * 100;
        const expectedAtThisPoint = (target * percentElapsed) / 100;
        const variance = currentActual - expectedAtThisPoint;

        results[metric] = {
          metric,
          data: [],
          summary: {
            current: currentActual,
            projected: projectedTotal,
            target,
            percentOfTarget,
            percentOfPeriod: percentElapsed,
            onTrack: currentActual >= expectedAtThisPoint * 0.9,
            variance,
          },
          trend: variance > 0 ? 'up' : variance < 0 ? 'down' : 'stable',
        };
      });

      return results;
    },
  });
}
