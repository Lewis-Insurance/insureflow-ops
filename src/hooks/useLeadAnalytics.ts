import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface WinRateByProducer {
  producer_id: string;
  producer_name: string;
  total_leads: number;
  won_leads: number;
  win_rate: number;
  avg_deal_value: number;
}

interface WinRateBySource {
  source_id: string;
  source_name: string;
  total_leads: number;
  won_leads: number;
  win_rate: number;
  avg_deal_value: number;
}

interface WinRateByInsuranceType {
  insurance_type: string;
  total_leads: number;
  won_leads: number;
  win_rate: number;
  avg_deal_value: number;
}

// Hook to get win rate breakdown by producer
export function useWinRateByProducer() {
  return useQuery({
    queryKey: ['win-rate-by-producer'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select(`
          *,
          assigned:profiles!leads_assigned_to_fkey(id, full_name)
        `);

      if (error) throw error;

      // Group by producer
      const producerMap = new Map<string, { 
        name: string; 
        total: number; 
        won: number; 
        revenue: number 
      }>();

      leads?.forEach((lead) => {
        const producerId = lead.assigned_to || 'unassigned';
        const producerName = lead.assigned?.full_name || 'Unassigned';
        
        if (!producerMap.has(producerId)) {
          producerMap.set(producerId, { 
            name: producerName, 
            total: 0, 
            won: 0, 
            revenue: 0 
          });
        }
        
        const producer = producerMap.get(producerId)!;
        producer.total++;
        
        if (lead.status === 'won') {
          producer.won++;
          producer.revenue += lead.current_premium || 0;
        }
      });

      // Convert to array
      const result: WinRateByProducer[] = Array.from(producerMap.entries()).map(([id, data]) => ({
        producer_id: id,
        producer_name: data.name,
        total_leads: data.total,
        won_leads: data.won,
        win_rate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avg_deal_value: data.won > 0 ? data.revenue / data.won : 0,
      }));

      return result.sort((a, b) => b.win_rate - a.win_rate);
    }
  });
}

// Hook to get win rate breakdown by source
export function useWinRateBySource() {
  return useQuery({
    queryKey: ['win-rate-by-source'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select(`
          *,
          source:lead_sources(id, name)
        `);

      if (error) throw error;

      // Group by source
      const sourceMap = new Map<string, { 
        name: string; 
        total: number; 
        won: number; 
        revenue: number 
      }>();

      leads?.forEach((lead) => {
        const sourceId = lead.source_id || 'unknown';
        const sourceName = lead.source?.name || 'Unknown';
        
        if (!sourceMap.has(sourceId)) {
          sourceMap.set(sourceId, { 
            name: sourceName, 
            total: 0, 
            won: 0, 
            revenue: 0 
          });
        }
        
        const source = sourceMap.get(sourceId)!;
        source.total++;
        
        if (lead.status === 'won') {
          source.won++;
          source.revenue += lead.current_premium || 0;
        }
      });

      // Convert to array
      const result: WinRateBySource[] = Array.from(sourceMap.entries()).map(([id, data]) => ({
        source_id: id,
        source_name: data.name,
        total_leads: data.total,
        won_leads: data.won,
        win_rate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avg_deal_value: data.won > 0 ? data.revenue / data.won : 0,
      }));

      return result.sort((a, b) => b.win_rate - a.win_rate);
    }
  });
}

// Hook to get win rate breakdown by insurance type
export function useWinRateByInsuranceType() {
  return useQuery({
    queryKey: ['win-rate-by-insurance-type'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('*');

      if (error) throw error;

      // Group by insurance type
      const typeMap = new Map<string, { 
        total: number; 
        won: number; 
        revenue: number 
      }>();

      leads?.forEach((lead) => {
        // A lead can have multiple insurance types
        const types = lead.insurance_types || [];
        
        types.forEach((type: string) => {
          if (!typeMap.has(type)) {
            typeMap.set(type, { total: 0, won: 0, revenue: 0 });
          }
          
          const typeData = typeMap.get(type)!;
          typeData.total++;
          
          if (lead.status === 'won') {
            typeData.won++;
            typeData.revenue += lead.current_premium || 0;
          }
        });
      });

      // Convert to array
      const result: WinRateByInsuranceType[] = Array.from(typeMap.entries()).map(([type, data]) => ({
        insurance_type: type,
        total_leads: data.total,
        won_leads: data.won,
        win_rate: data.total > 0 ? (data.won / data.total) * 100 : 0,
        avg_deal_value: data.won > 0 ? data.revenue / data.won : 0,
      }));

      return result.sort((a, b) => b.win_rate - a.win_rate);
    }
  });
}

export interface LeadMetrics {
  total_leads: number;
  new_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  quoted_leads: number;
  won_leads: number;
  lost_leads: number;
  nurturing_leads: number;
  conversion_rate: number;
  total_pipeline_value: number;
  average_score: number;
}

export function useLeadMetrics() {
  return useQuery({
    queryKey: ['lead-metrics'],
    queryFn: async () => {
      // Get current week start date
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      weekStart.setHours(0, 0, 0, 0);

      // Fetch all leads
      const { data: allLeads, error: allError } = await supabase
        .from('leads')
        .select('status, lead_score, estimated_premium, created_at');

      if (allError) throw allError;

      // Fetch new leads from this week
      const { data: newLeadsData, error: newError } = await supabase
        .from('leads')
        .select('id')
        .gte('created_at', weekStart.toISOString());

      if (newError) throw newError;

      // Calculate metrics
      const totalLeads = allLeads?.length || 0;
      const newLeads = newLeadsData?.length || 0;
      
      const statusCounts = {
        new: 0,
        contacted: 0,
        qualified: 0,
        quoted: 0,
        won: 0,
        lost: 0,
        nurturing: 0,
      };

      let totalScore = 0;
      let totalPipelineValue = 0;

      allLeads?.forEach((lead) => {
        // Count by status
        if (lead.status in statusCounts) {
          statusCounts[lead.status as keyof typeof statusCounts]++;
        }

        // Sum scores
        totalScore += lead.lead_score || 0;

        // Sum pipeline value (excluding won/lost)
        if (lead.status !== 'won' && lead.status !== 'lost') {
          totalPipelineValue += lead.estimated_premium || 0;
        }
      });

      const conversionRate = totalLeads > 0 
        ? (statusCounts.won / totalLeads) * 100 
        : 0;

      const averageScore = totalLeads > 0 
        ? totalScore / totalLeads 
        : 0;

      const metrics: LeadMetrics = {
        total_leads: totalLeads,
        new_leads: newLeads,
        contacted_leads: statusCounts.contacted,
        qualified_leads: statusCounts.qualified,
        quoted_leads: statusCounts.quoted,
        won_leads: statusCounts.won,
        lost_leads: statusCounts.lost,
        nurturing_leads: statusCounts.nurturing,
        conversion_rate: conversionRate,
        total_pipeline_value: totalPipelineValue,
        average_score: averageScore,
      };

      return metrics;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
