import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  Lead,
  LeadSource,
  LeadActivity,
  PipelineRule,
  AssignmentRule,
  NurtureCampaign,
  CampaignEnrollment,
  LeadDashboardMetrics,
  LeadWithRelations,
  CreateLeadRequest,
  UpdateLeadRequest,
  LeadFilters,
  PipelineStats,
  LeadSourcePerformance,
  LeadScoreHistory,
  LeadStatus,
} from '@/types/leads';

// ============================================
// LEAD SOURCES HOOKS
// ============================================

export const useLeadSources = () => {
  return useQuery({
    queryKey: ['lead-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as LeadSource[];
    },
  });
};

export const useLeadSource = (sourceId?: string) => {
  return useQuery({
    queryKey: ['lead-source', sourceId],
    queryFn: async () => {
      if (!sourceId) return null;
      
      const { data, error } = await supabase
        .from('lead_sources')
        .select('*')
        .eq('id', sourceId)
        .single();

      if (error) throw error;
      return data as LeadSource;
    },
    enabled: !!sourceId,
  });
};

export const useCreateLeadSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (source: Omit<LeadSource, 'id' | 'created_at' | 'updated_at' | 'total_leads' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('lead_sources')
        .insert({
          ...source,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as LeadSource;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast({
        title: 'Lead Source Created',
        description: `${data.name} has been created successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateLeadSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<LeadSource> }) => {
      const { data, error } = await supabase
        .from('lead_sources')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as LeadSource;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast({
        title: 'Lead Source Updated',
        description: 'Lead source has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteLeadSource = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_sources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-sources'] });
      toast({
        title: 'Lead Source Deleted',
        description: 'Lead source has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useLeadSourcePerformance = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['lead-source-performance', startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('source_id, status, lead_score, estimated_premium, created_at');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }
      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data: leads, error: leadsError } = await query;
      if (leadsError) throw leadsError;

      const { data: sources, error: sourcesError } = await supabase
        .from('lead_sources')
        .select('*');

      if (sourcesError) throw sourcesError;

      // Calculate performance metrics
      const performance: LeadSourcePerformance[] = sources.map(source => {
        const sourceLeads = leads?.filter(l => l.source_id === source.id) || [];
        const wonLeads = sourceLeads.filter(l => l.status === 'won');
        const totalValue = sourceLeads.reduce((sum, l) => sum + (l.estimated_premium || 0), 0);
        const avgScore = sourceLeads.length > 0
          ? sourceLeads.reduce((sum, l) => sum + l.lead_score, 0) / sourceLeads.length
          : 0;

        const conversionRate = sourceLeads.length > 0
          ? (wonLeads.length / sourceLeads.length) * 100
          : 0;

        const totalCost = source.cost_per_lead * sourceLeads.length;
        const roi = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

        return {
          ...source,
          conversion_rate: conversionRate,
          avg_lead_score: avgScore,
          total_value: totalValue,
          roi: roi,
        };
      });

      return performance;
    },
  });
};

// ============================================
// LEADS HOOKS
// ============================================

export const useLeads = (filters?: LeadFilters) => {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.assigned_to && filters.assigned_to.length > 0) {
        query = query.in('assigned_to', filters.assigned_to);
      }
      if (filters?.source_id && filters.source_id.length > 0) {
        query = query.in('source_id', filters.source_id);
      }
      if (filters?.lead_score_min !== undefined) {
        query = query.gte('lead_score', filters.lead_score_min);
      }
      if (filters?.lead_score_max !== undefined) {
        query = query.lte('lead_score', filters.lead_score_max);
      }
      if (filters?.created_after) {
        query = query.gte('created_at', filters.created_after);
      }
      if (filters?.created_before) {
        query = query.lte('created_at', filters.created_before);
      }
      if (filters?.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
  });
};

export const useLead = (leadId?: string) => {
  return useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data as Lead;
    },
    enabled: !!leadId,
  });
};

export const useLeadWithRelations = (leadId?: string) => {
  return useQuery({
    queryKey: ['lead-with-relations', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      
      // Get lead
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;

      // Get source
      let source = null;
      if (lead.source_id) {
        const { data: sourceData } = await supabase
          .from('lead_sources')
          .select('*')
          .eq('id', lead.source_id)
          .single();
        source = sourceData;
      }

      // Get activities
      const { data: activities } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      // Get score history
      const { data: scoreHistory } = await supabase
        .from('lead_score_history')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      // Get campaign enrollments
      const { data: campaignEnrollments } = await supabase
        .from('campaign_enrollments')
        .select('*')
        .eq('lead_id', leadId);

      return {
        ...lead,
        source,
        activities: activities || [],
        score_history: scoreHistory || [],
        campaign_enrollments: campaignEnrollments || [],
      } as LeadWithRelations;
    },
    enabled: !!leadId,
  });
};

export const useCreateLead = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (lead: CreateLeadRequest) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...lead,
          created_by: user?.id,
          tags: lead.tags || [],
          custom_fields: lead.custom_fields || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data as Lead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: 'Lead Created',
        description: `${data.first_name} ${data.last_name} has been added as a new lead.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateLead = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateLeadRequest }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      queryClient.invalidateQueries({ queryKey: ['lead-with-relations'] });
      toast({
        title: 'Lead Updated',
        description: 'Lead has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteLead = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast({
        title: 'Lead Deleted',
        description: 'Lead has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useConvertLeadToAccount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leadId, accountId, wonPremium }: { leadId: string; accountId: string; wonPremium?: number }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({
          status: 'won',
          converted_at: new Date().toISOString(),
          converted_account_id: accountId,
          won_premium: wonPremium,
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      toast({
        title: 'Lead Converted',
        description: 'Lead has been successfully converted to an account.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useMarkLeadAsLost = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leadId, reason, details }: { leadId: string; reason: string; details?: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({
          status: 'lost',
          lost_reason: reason,
          lost_reason_details: details,
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead'] });
      toast({
        title: 'Lead Marked as Lost',
        description: 'Lead has been marked as lost.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// ============================================
// LEAD ACTIVITIES HOOKS
// ============================================

export const useLeadActivities = (leadId?: string) => {
  return useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadActivity[];
    },
    enabled: !!leadId,
  });
};

export const useCreateLeadActivity = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (activity: Omit<LeadActivity, 'id' | 'created_at'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('lead_activities')
        .insert({
          ...activity,
          performed_by: user?.id,
          metadata: activity.metadata || {},
        })
        .select()
        .single();

      if (error) throw error;

      // Update last_contact_at on lead
      await supabase
        .from('leads')
        .update({
          last_contact_at: new Date().toISOString(),
          contact_count: supabase.rpc('increment_contact_count', { lead_id: activity.lead_id }),
        })
        .eq('id', activity.lead_id);

      return data as LeadActivity;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['lead', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['lead-with-relations', data.lead_id] });
      toast({
        title: 'Activity Logged',
        description: 'Activity has been logged successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// ============================================
// PIPELINE STATS HOOKS
// ============================================

export const usePipelineStats = () => {
  return useQuery({
    queryKey: ['pipeline-stats'],
    queryFn: async () => {
      const { data: leads, error } = await supabase
        .from('leads')
        .select('status, lead_score, estimated_premium, created_at, updated_at');

      if (error) throw error;

      const stages: LeadStatus[] = ['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'nurturing'];
      
      const stats: PipelineStats[] = stages.map(stage => {
        const stageLeads = leads?.filter(l => l.status === stage) || [];
        const totalValue = stageLeads.reduce((sum, l) => sum + (l.estimated_premium || 0), 0);
        const avgScore = stageLeads.length > 0
          ? stageLeads.reduce((sum, l) => sum + l.lead_score, 0) / stageLeads.length
          : 0;

        // Calculate average time in stage
        const avgTimeInStage = stageLeads.length > 0
          ? stageLeads.reduce((sum, l) => {
              const created = new Date(l.created_at).getTime();
              const updated = new Date(l.updated_at).getTime();
              return sum + (updated - created);
            }, 0) / stageLeads.length / (1000 * 60 * 60 * 24) // Convert to days
          : 0;

        return {
          stage,
          count: stageLeads.length,
          value: totalValue,
          avg_score: avgScore,
          avg_time_in_stage_days: avgTimeInStage,
        };
      });

      return stats;
    },
  });
};

// ============================================
// DASHBOARD METRICS HOOKS
// ============================================

export const useLeadDashboardMetrics = (producerId?: string, startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['lead-dashboard-metrics', producerId, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('lead_dashboard_metrics')
        .select('*')
        .order('metric_date', { ascending: false });

      if (producerId) {
        query = query.eq('producer_id', producerId);
      }
      if (startDate) {
        query = query.gte('metric_date', startDate);
      }
      if (endDate) {
        query = query.lte('metric_date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as LeadDashboardMetrics[];
    },
  });
};

// ============================================
// PIPELINE RULES HOOKS
// ============================================

export const usePipelineRules = () => {
  return useQuery({
    queryKey: ['pipeline-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pipeline_rules')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;
      return data as PipelineRule[];
    },
  });
};

export const useCreatePipelineRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (rule: Omit<PipelineRule, 'id' | 'created_at' | 'updated_at' | 'execution_count' | 'last_executed_at' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('pipeline_rules')
        .insert({
          ...rule,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as PipelineRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-rules'] });
      toast({
        title: 'Pipeline Rule Created',
        description: 'Pipeline rule has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUpdatePipelineRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PipelineRule> }) => {
      const { data, error } = await supabase
        .from('pipeline_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PipelineRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-rules'] });
      toast({
        title: 'Pipeline Rule Updated',
        description: 'Pipeline rule has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeletePipelineRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pipeline_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-rules'] });
      toast({
        title: 'Pipeline Rule Deleted',
        description: 'Pipeline rule has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// ============================================
// ASSIGNMENT RULES HOOKS
// ============================================

export const useAssignmentRules = () => {
  return useQuery({
    queryKey: ['assignment-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .order('priority', { ascending: false });

      if (error) throw error;
      return data as AssignmentRule[];
    },
  });
};

export const useCreateAssignmentRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (rule: Omit<AssignmentRule, 'id' | 'created_at' | 'updated_at' | 'assignment_count' | 'last_assigned_to' | 'last_assigned_at' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('assignment_rules')
        .insert({
          ...rule,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast({
        title: 'Assignment Rule Created',
        description: 'Assignment rule has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateAssignmentRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AssignmentRule> }) => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast({
        title: 'Assignment Rule Updated',
        description: 'Assignment rule has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteAssignmentRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assignment_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-rules'] });
      toast({
        title: 'Assignment Rule Deleted',
        description: 'Assignment rule has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// ============================================
// NURTURE CAMPAIGNS HOOKS
// ============================================

export const useNurtureCampaigns = () => {
  return useQuery({
    queryKey: ['nurture-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as NurtureCampaign[];
    },
  });
};

export const useNurtureCampaign = (campaignId?: string) => {
  return useQuery({
    queryKey: ['nurture-campaign', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return data as NurtureCampaign;
    },
    enabled: !!campaignId,
  });
};

export const useCreateNurtureCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (campaign: Omit<NurtureCampaign, 'id' | 'created_at' | 'updated_at' | 'enrollment_count' | 'active_count' | 'completion_count' | 'conversion_count' | 'conversion_rate' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .insert({
          ...campaign,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as NurtureCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      toast({
        title: 'Campaign Created',
        description: 'Nurture campaign has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateNurtureCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<NurtureCampaign> }) => {
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as NurtureCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      toast({
        title: 'Campaign Updated',
        description: 'Nurture campaign has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

export const useDeleteNurtureCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('nurture_campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      toast({
        title: 'Campaign Deleted',
        description: 'Nurture campaign has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// ============================================
// CAMPAIGN ENROLLMENTS HOOKS
// ============================================

export const useCampaignEnrollments = (campaignId?: string) => {
  return useQuery({
    queryKey: ['campaign-enrollments', campaignId],
    queryFn: async () => {
      let query = supabase
        .from('campaign_enrollments')
        .select('*')
        .order('enrolled_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CampaignEnrollment[];
    },
  });
};

export const useEnrollLeadInCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ campaignId, leadId }: { campaignId: string; leadId: string }) => {
      // Get campaign to determine total steps
      const { data: campaign, error: campaignError } = await supabase
        .from('nurture_campaigns')
        .select('steps')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;

      const totalSteps = campaign.steps.length;

      const { data, error } = await supabase
        .from('campaign_enrollments')
        .insert({
          campaign_id: campaignId,
          lead_id: leadId,
          total_steps: totalSteps,
        })
        .select()
        .single();

      if (error) throw error;

      // Update campaign enrollment count
      await supabase.rpc('increment_campaign_enrollment', { campaign_id: campaignId });

      return data as CampaignEnrollment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      toast({
        title: 'Lead Enrolled',
        description: 'Lead has been enrolled in the campaign.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};
