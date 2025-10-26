import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PipelineStats {
  stage: string;
  count: number;
  value: number;
  avg_score: number;
}

export interface LeadSourcePerformance {
  id: string;
  name: string;
  total_leads: number;
  won_leads: number;
  conversion_rate: number;
  total_revenue: number;
  roi: number;
}

export function usePipelineStats() {
  return useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('status, current_premium, lead_score');

      if (error) throw error;

      const statsMap = new Map<string, { count: number; value: number; totalScore: number }>();

      leads?.forEach((lead) => {
        const stage = lead.status;
        if (!statsMap.has(stage)) {
          statsMap.set(stage, { count: 0, value: 0, totalScore: 0 });
        }
        const stats = statsMap.get(stage)!;
        stats.count++;
        stats.value += lead.current_premium || 0;
        stats.totalScore += lead.lead_score;
      });

      const result: PipelineStats[] = Array.from(statsMap.entries()).map(([stage, data]) => ({
        stage,
        count: data.count,
        value: data.value,
        avg_score: data.count > 0 ? data.totalScore / data.count : 0,
      }));

      return result;
    },
  });
}

export function useLeadSourcePerformance() {
  return useQuery({
    queryKey: ['lead-source-performance'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select(`
          source_id,
          status,
          current_premium,
          source:lead_sources(id, name)
        `);

      if (error) throw error;

      const sourceMap = new Map<string, {
        name: string;
        total: number;
        won: number;
        revenue: number;
      }>();

      leads?.forEach((lead) => {
        const sourceId = lead.source_id || 'unknown';
        const sourceName = lead.source?.name || 'Unknown';

        if (!sourceMap.has(sourceId)) {
          sourceMap.set(sourceId, { name: sourceName, total: 0, won: 0, revenue: 0 });
        }

        const source = sourceMap.get(sourceId)!;
        source.total++;

        if (lead.status === 'won') {
          source.won++;
          source.revenue += lead.current_premium || 0;
        }
      });

      const result: LeadSourcePerformance[] = Array.from(sourceMap.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        total_leads: data.total,
        won_leads: data.won,
        conversion_rate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        total_revenue: data.revenue,
        roi: data.revenue > 0 ? (data.revenue / data.total) : 0,
      }));

      return result.sort((a, b) => b.total_leads - a.total_leads);
    },
  });
}
