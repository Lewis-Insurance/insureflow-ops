import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, startOfMonth, subDays, subMonths, format } from 'date-fns';

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
  average_score: number;
  total_pipeline_value: number;
}

export function useLeadMetrics(dateRange?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['lead-metrics', dateRange],
    queryFn: async () => {
      let query = supabase.from('leads').select('*', { count: 'exact' });

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
      }

      const { data: allLeads, error } = await query;

      if (error) {
        console.error('Error fetching lead metrics:', error);
        throw error;
      }

      const metrics: LeadMetrics = {
        total_leads: allLeads.length,
        new_leads: allLeads.filter(l => l.status === 'new').length,
        contacted_leads: allLeads.filter(l => l.status === 'contacted').length,
        qualified_leads: allLeads.filter(l => l.status === 'qualified').length,
        quoted_leads: allLeads.filter(l => l.status === 'quoted').length,
        won_leads: allLeads.filter(l => l.status === 'won').length,
        lost_leads: allLeads.filter(l => l.status === 'lost').length,
        nurturing_leads: allLeads.filter(l => l.status === 'nurturing').length,
        conversion_rate: allLeads.length > 0 
          ? (allLeads.filter(l => l.status === 'won').length / allLeads.length) * 100 
          : 0,
        average_score: allLeads.length > 0
          ? allLeads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / allLeads.length
          : 0,
        total_pipeline_value: allLeads
          .filter(l => ['qualified', 'quoted', 'nurturing'].includes(l.status))
          .reduce((sum, l) => sum + (l.current_premium || 0), 0),
      };

      return metrics;
    },
  });
}

export function useConversionFunnel(dateRange?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['conversion-funnel', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('status, created_at');

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching funnel data:', error);
        throw error;
      }

      // Calculate funnel stages
      const total = data.length;
      const contacted = data.filter(l => 
        ['contacted', 'qualified', 'quoted', 'nurturing', 'won'].includes(l.status)
      ).length;
      const qualified = data.filter(l => 
        ['qualified', 'quoted', 'nurturing', 'won'].includes(l.status)
      ).length;
      const quoted = data.filter(l => 
        ['quoted', 'nurturing', 'won'].includes(l.status)
      ).length;
      const won = data.filter(l => l.status === 'won').length;

      return [
        { 
          stage: 'New Leads', 
          count: total, 
          percentage: 100,
          dropoff: 0 
        },
        { 
          stage: 'Contacted', 
          count: contacted, 
          percentage: total > 0 ? (contacted / total) * 100 : 0,
          dropoff: total - contacted
        },
        { 
          stage: 'Qualified', 
          count: qualified, 
          percentage: total > 0 ? (qualified / total) * 100 : 0,
          dropoff: contacted - qualified
        },
        { 
          stage: 'Quoted', 
          count: quoted, 
          percentage: total > 0 ? (quoted / total) * 100 : 0,
          dropoff: qualified - quoted
        },
        { 
          stage: 'Won', 
          count: won, 
          percentage: total > 0 ? (won / total) * 100 : 0,
          dropoff: quoted - won
        },
      ];
    },
  });
}

export function useLeadSourcePerformance(dateRange?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['lead-source-performance', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('source_id, status, lead_score, current_premium, created_at');

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching source performance:', error);
        throw error;
      }

      // Group by source_id
      const sourceMetrics = data.reduce((acc, lead) => {
        const sourceId = lead.source_id || 'unknown';
        
        if (!acc[sourceId]) {
          acc[sourceId] = {
            source: sourceId,
            total: 0,
            won: 0,
            lost: 0,
            in_progress: 0,
            conversion_rate: 0,
            total_value: 0,
            avg_score: 0,
            scores: [],
          };
        }

        acc[sourceId].total++;
        if (lead.status === 'won') acc[sourceId].won++;
        if (lead.status === 'lost') acc[sourceId].lost++;
        if (['contacted', 'qualified', 'quoted', 'nurturing'].includes(lead.status)) {
          acc[sourceId].in_progress++;
        }
        acc[sourceId].total_value += lead.current_premium || 0;
        acc[sourceId].scores.push(lead.lead_score || 0);

        return acc;
      }, {} as Record<string, any>);

      // Calculate rates
      const sourceArray = Object.values(sourceMetrics).map((metrics: any) => {
        metrics.conversion_rate = metrics.total > 0 
          ? (metrics.won / metrics.total) * 100 
          : 0;
        metrics.avg_score = metrics.scores.length > 0
          ? metrics.scores.reduce((a: number, b: number) => a + b, 0) / metrics.scores.length
          : 0;
        delete metrics.scores;
        return metrics;
      });

      return sourceArray.sort((a, b) => b.total - a.total);
    },
  });
}

export function useLeadTrends(period: 'week' | 'month' | 'quarter' = 'month') {
  return useQuery({
    queryKey: ['lead-trends', period],
    queryFn: async () => {
      const now = new Date();
      let startDate: Date;
      let intervals: Date[] = [];

      if (period === 'week') {
        startDate = subDays(now, 7);
        for (let i = 7; i >= 0; i--) {
          intervals.push(subDays(now, i));
        }
      } else if (period === 'month') {
        startDate = subDays(now, 30);
        for (let i = 30; i >= 0; i -= 3) {
          intervals.push(subDays(now, i));
        }
      } else {
        startDate = subMonths(now, 3);
        for (let i = 12; i >= 0; i--) {
          intervals.push(subDays(now, i * 7));
        }
      }

      const { data, error } = await supabase
        .from('leads')
        .select('created_at, status')
        .gte('created_at', startDate.toISOString());

      if (error) {
        console.error('Error fetching trends:', error);
        throw error;
      }

      // Group by time interval
      const trends = intervals.map(date => {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + (period === 'week' ? 1 : period === 'month' ? 3 : 7));

        const leadsInInterval = data.filter(lead => {
          const leadDate = new Date(lead.created_at);
          return leadDate >= date && leadDate < nextDate;
        });

        return {
          date: format(date, period === 'week' ? 'EEE' : 'MMM d'),
          total: leadsInInterval.length,
          new: leadsInInterval.filter(l => l.status === 'new').length,
          contacted: leadsInInterval.filter(l => l.status === 'contacted').length,
          qualified: leadsInInterval.filter(l => l.status === 'qualified').length,
          won: leadsInInterval.filter(l => l.status === 'won').length,
          lost: leadsInInterval.filter(l => l.status === 'lost').length,
        };
      });

      return trends;
    },
  });
}

export function useLeadScoreDistribution() {
  return useQuery({
    queryKey: ['lead-score-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('lead_score, status');

      if (error) {
        console.error('Error fetching score distribution:', error);
        throw error;
      }

      // Group into score ranges
      const ranges = [
        { range: '0-20', min: 0, max: 20, count: 0, won: 0 },
        { range: '21-40', min: 21, max: 40, count: 0, won: 0 },
        { range: '41-60', min: 41, max: 60, count: 0, won: 0 },
        { range: '61-80', min: 61, max: 80, count: 0, won: 0 },
        { range: '81-100', min: 81, max: 100, count: 0, won: 0 },
      ];

      data.forEach(lead => {
        const score = lead.lead_score || 0;
        const range = ranges.find(r => score >= r.min && score <= r.max);
        if (range) {
          range.count++;
          if (lead.status === 'won') range.won++;
        }
      });

      return ranges.map(r => ({
        ...r,
        win_rate: r.count > 0 ? (r.won / r.count) * 100 : 0,
      }));
    },
  });
}

export function usePipelineVelocity() {
  return useQuery({
    queryKey: ['pipeline-velocity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('status, created_at, last_contact_at, converted_at, updated_at');

      if (error) {
        console.error('Error fetching velocity:', error);
        throw error;
      }

      const wonLeads = data.filter(l => l.status === 'won' && l.converted_at);
      
      const avgDaysToWin = wonLeads.length > 0
        ? wonLeads.reduce((sum, lead) => {
            const created = new Date(lead.created_at).getTime();
            const converted = new Date(lead.converted_at!).getTime();
            return sum + (converted - created) / (1000 * 60 * 60 * 24);
          }, 0) / wonLeads.length
        : 0;

      // Calculate average time in each stage (rough estimation based on status)
      const newLeads = data.filter(l => l.status === 'new');
      const contactedLeads = data.filter(l => l.status === 'contacted');
      const qualifiedLeads = data.filter(l => l.status === 'qualified');
      const quotedLeads = data.filter(l => l.status === 'quoted');

      const avgTimeInNew = newLeads.length > 0
        ? newLeads.reduce((sum, l) => {
            const created = new Date(l.created_at).getTime();
            const updated = new Date(l.updated_at).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / newLeads.length
        : 0;

      const avgTimeInContacted = contactedLeads.length > 0
        ? contactedLeads.reduce((sum, l) => {
            const created = new Date(l.created_at).getTime();
            const updated = new Date(l.updated_at).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / contactedLeads.length
        : 0;

      const avgTimeInQualified = qualifiedLeads.length > 0
        ? qualifiedLeads.reduce((sum, l) => {
            const created = new Date(l.created_at).getTime();
            const updated = new Date(l.updated_at).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / qualifiedLeads.length
        : 0;

      const avgTimeInQuoted = quotedLeads.length > 0
        ? quotedLeads.reduce((sum, l) => {
            const created = new Date(l.created_at).getTime();
            const updated = new Date(l.updated_at).getTime();
            return sum + (updated - created) / (1000 * 60 * 60 * 24);
          }, 0) / quotedLeads.length
        : 0;

      const stageVelocity = {
        new: Math.round(avgTimeInNew * 10) / 10,
        contacted: Math.round(avgTimeInContacted * 10) / 10,
        qualified: Math.round(avgTimeInQualified * 10) / 10,
        quoted: Math.round(avgTimeInQuoted * 10) / 10,
        overall: Math.round(avgDaysToWin * 10) / 10,
        leads_per_day: data.length > 0 ? Math.round((data.length / 30) * 10) / 10 : 0,
      };

      return stageVelocity;
    },
  });
}

export function useProducerPerformance(dateRange?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['producer-performance', dateRange],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('assigned_to, status, lead_score, estimated_premium, created_at, insurance_types');

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching producer performance:', error);
        throw error;
      }

      // Get unique producers
      const producerIds = Array.from(new Set(data.map(l => l.assigned_to).filter(Boolean)));

      // Fetch producer profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', producerIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Calculate metrics per producer
      const producerMetrics = producerIds.map(producerId => {
        const producerLeads = data.filter(l => l.assigned_to === producerId);
        const wonLeads = producerLeads.filter(l => l.status === 'won');
        const profile = profileMap.get(producerId);

        return {
          producer_id: producerId,
          producer_name: profile?.full_name || 'Unknown',
          avatar_url: profile?.avatar_url,
          total_leads: producerLeads.length,
          won_leads: wonLeads.length,
          lost_leads: producerLeads.filter(l => l.status === 'lost').length,
          active_leads: producerLeads.filter(l => 
            ['new', 'contacted', 'qualified', 'quoted', 'nurturing'].includes(l.status)
          ).length,
          win_rate: producerLeads.length > 0 
            ? (wonLeads.length / producerLeads.length) * 100 
            : 0,
          avg_lead_score: producerLeads.length > 0
            ? producerLeads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / producerLeads.length
            : 0,
          total_value: wonLeads.reduce((sum, l) => sum + (l.estimated_premium || 0), 0),
        };
      });

      return producerMetrics.sort((a, b) => b.won_leads - a.won_leads);
    },
  });
}

export interface InsuranceTypePerformance {
  type: string;
  total: number;
  won: number;
  lost: number;
  win_rate: number;
  total_value: number;
  avg_value: number;
}

export function useInsuranceTypePerformance(
  dateRange?: { start: string; end: string }
) {
  return useQuery({
    queryKey: ['insurance-type-performance', dateRange],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's account
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No account membership found');

      let query = supabase
        .from('leads')
        .select('insurance_types, status, estimated_premium')
        .eq('account_id', membership.account_id);

      if (dateRange) {
        query = query
          .gte('created_at', dateRange.start)
          .lte('created_at', dateRange.end);
      }

      const { data: leads, error } = await query;

      if (error) throw error;

      // Aggregate by insurance type
      const typeMap = new Map<string, {
        total: number;
        won: number;
        lost: number;
        total_value: number;
      }>();

      leads?.forEach((lead) => {
        // Handle insurance_types as array
        const types = Array.isArray(lead.insurance_types) 
          ? lead.insurance_types 
          : lead.insurance_types 
            ? [lead.insurance_types] 
            : [];

        types.forEach((type: string) => {
          if (!type) return;

          if (!typeMap.has(type)) {
            typeMap.set(type, { total: 0, won: 0, lost: 0, total_value: 0 });
          }

          const stats = typeMap.get(type)!;
          stats.total++;

          if (lead.status === 'won') {
            stats.won++;
            stats.total_value += lead.estimated_premium || 0;
          } else if (lead.status === 'lost') {
            stats.lost++;
          }
        });
      });

      // Convert to array and calculate metrics
      const results: InsuranceTypePerformance[] = Array.from(typeMap.entries()).map(
        ([type, stats]) => ({
          type,
          total: stats.total,
          won: stats.won,
          lost: stats.lost,
          win_rate: stats.total > 0 ? (stats.won / stats.total) * 100 : 0,
          total_value: stats.total_value,
          avg_value: stats.won > 0 ? stats.total_value / stats.won : 0,
        })
      );

      // Sort by total leads descending
      return results.sort((a, b) => b.total - a.total);
    },
  });
}
