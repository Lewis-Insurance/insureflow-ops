// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES (CORRECTED TO MATCH ACTUAL SCHEMA)
// ============================================================================

export interface NurtureCampaign {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  trigger_conditions: {
    lead_status?: string[];
    lead_score_min?: number;
    lead_score_max?: number;
    tags?: string[];
    insurance_types?: string[];
    time_based?: {
      after_event: 'lead_created' | 'last_contact' | 'lead_lost';
      delay_days: number;
    };
  };
  steps: Array<{
    step_number: number;
    delay_value: number;
    delay_unit: 'minutes' | 'hours' | 'days' | 'weeks';
    channel: 'email' | 'sms' | 'task' | 'webhook';
    template_id: string | null;
    conditions?: any;
    action_data?: any;
  }>;
  enrollment_count: number | null;
  completion_count: number | null;
  conversion_count: number | null;
  conversion_rate: number;
  active: boolean;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export interface CampaignEnrollment {
  id: string;
  campaign_id: string;
  lead_id: string;
  account_id: string;
  enrolled_at: string | null;
  current_step: number | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
  completed_at: string | null;
  converted: boolean;
  converted_at: string | null;
  last_execution_at: string | null;
  next_execution_at: string | null;
  last_activity_at: string | null;
  metadata: any;
}

export interface CampaignStepExecution {
  id: string;
  enrollment_id: string;
  campaign_id: string;
  lead_id: string;
  step_number: number;
  channel: 'email' | 'sms' | 'task' | 'webhook';
  template_id: string | null;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  scheduled_at: string;
  executed_at: string | null;
  error_message: string | null;
  metadata: any; // This is result_data in the hooks
  created_at: string | null;
}

export interface MessageTemplate {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  channel: 'email' | 'sms';
  subject: string | null;
  body: string;
  variables: any; // JSONB in DB, not TEXT[]
  category: string | null;
  active: boolean | null;
  usage_count: number;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

// ============================================================================
// NURTURE CAMPAIGNS HOOKS
// ============================================================================

export const useNurtureCampaigns = () => {
  return useQuery({
    queryKey: ['nurture-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as unknown as NurtureCampaign[];
    },
  });
};

export const useNurtureCampaign = (id: string | undefined) => {
  return useQuery({
    queryKey: ['nurture-campaign', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as NurtureCampaign;
    },
    enabled: !!id,
  });
};

export const useCreateNurtureCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (campaign: Omit<NurtureCampaign, 'id' | 'created_at' | 'updated_at' | 'enrollment_count' | 'completion_count' | 'conversion_count' | 'conversion_rate' | 'started_at' | 'ended_at' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's account_id
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No account membership found');

      const { data, error } = await supabase
        .from('nurture_campaigns')
        .insert({
          name: campaign.name,
          description: campaign.description,
          trigger_conditions: campaign.trigger_conditions,
          steps: campaign.steps,
          account_id: membership.account_id,
          created_by: user.id,
          active: campaign.active ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      toast({
        title: 'Success',
        description: 'Nurture campaign created successfully',
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
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['nurture-campaign', variables.id] });
      toast({
        title: 'Success',
        description: 'Campaign updated successfully',
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
        title: 'Success',
        description: 'Campaign deleted successfully',
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

export const useToggleCampaignActive = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const updates: any = { 
        status: active ? 'active' : 'paused'
      };
      
      // Set started_at when activating for first time
      if (active) {
        const { data: campaign } = await supabase
          .from('nurture_campaigns')
          .select('*')
          .eq('id', id)
          .single();
        
        if (campaign && !(campaign).started_at) {
          updates.started_at = new Date().toISOString();
        }
      } else {
        // Set ended_at when deactivating
        updates.ended_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('nurture_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['nurture-campaign', data.id] });
      toast({
        title: 'Success',
        description: `Campaign ${data.status === 'active' ? 'activated' : 'deactivated'} successfully`,
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

// ============================================================================
// CAMPAIGN ENROLLMENTS HOOKS
// ============================================================================

export const useCampaignEnrollments = (campaignId?: string) => {
  return useQuery({
    queryKey: ['campaign-enrollments', campaignId],
    queryFn: async () => {
      let query = supabase
        .from('campaign_enrollments')
        .select(`
          *,
          lead:leads(
            id,
            first_name,
            last_name,
            email,
            phone,
            status,
            lead_score
          ),
          campaign:nurture_campaigns(
            id,
            name
          )
        `)
        .order('enrolled_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
};

export const useLeadEnrollments = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['lead-enrollments', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('campaign_enrollments')
        .select(`
          *,
          campaign:nurture_campaigns(
            id,
            name,
            active
          )
        `)
        .eq('lead_id', leadId)
        .order('enrolled_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });
};

export const useEnrollLead = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ campaignId, leadId }: { campaignId: string; leadId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get account_id from user membership
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No account membership found');

      // Get campaign to calculate next execution
      const { data: campaign } = await supabase
        .from('nurture_campaigns')
        .select('steps')
        .eq('id', campaignId)
        .single();

      const steps = (campaign)?.steps;
      if (!campaign || !steps || !Array.isArray(steps) || steps.length === 0) {
        throw new Error('Campaign has no steps');
      }

      const firstStep = steps[0];
      const nextExecutionAt = calculateNextExecution(firstStep.delay_value, firstStep.delay_unit);

      const { data, error } = await supabase
        .from('campaign_enrollments')
        .insert({
          campaign_id: campaignId,
          lead_id: leadId,
          account_id: membership.account_id,
          current_step: 0,
          status: 'active',
          metadata: {},
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['lead-enrollments'] });
      toast({
        title: 'Success',
        description: 'Lead enrolled in campaign successfully',
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

export const useUpdateEnrollmentStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CampaignEnrollment['status'] }) => {
      const updates: any = { 
        status,
        last_activity_at: new Date().toISOString()
      };
      
      if (status === 'completed' || status === 'cancelled') {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('campaign_enrollments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['lead-enrollments'] });
      toast({
        title: 'Success',
        description: 'Enrollment status updated',
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

export const useMarkEnrollmentConverted = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { data, error } = await supabase
        .from('campaign_enrollments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['lead-enrollments'] });
      toast({
        title: 'Success',
        description: 'Lead marked as converted!',
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

// ============================================================================
// CAMPAIGN STEP EXECUTIONS HOOKS
// ============================================================================

export const useCampaignStepExecutions = (enrollmentId?: string) => {
  return useQuery({
    queryKey: ['campaign-step-executions', enrollmentId],
    queryFn: async () => {
      if (!enrollmentId) return [];

      const { data, error } = await supabase
        .from('campaign_step_executions')
        .select('*')
        .eq('enrollment_id', enrollmentId)
        .order('executed_at', { ascending: false });

      if (error) throw error;
      return data as unknown as CampaignStepExecution[];
    },
    enabled: !!enrollmentId,
  });
};

export const useCampaignExecutionStats = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign-execution-stats', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;

      const { data, error } = await supabase
        .from('campaign_step_executions')
        .select('status, channel')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      // Calculate stats
      const executions = data || [];
      const total = executions.length;
      const successful = executions.filter(e => e.status === 'sent' || e.status === 'delivered').length;
      const failed = executions.filter(e => e.status === 'failed').length;
      const pending = executions.filter(e => e.status === 'pending' || e.status === 'scheduled').length;

      const byChannel = executions.reduce((acc, exec) => {
        acc[exec.channel] = (acc[exec.channel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        total,
        successful,
        failed,
        pending,
        successRate: total > 0 ? (successful / total) * 100 : 0,
        byChannel,
      };
    },
    enabled: !!campaignId,
  });
};

// ============================================================================
// MESSAGE TEMPLATES HOOKS
// ============================================================================

export const useMessageTemplates = (channel?: 'email' | 'sms') => {
  return useQuery({
    queryKey: ['message-templates', channel],
    queryFn: async () => {
      let query = supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (channel) {
        query = query.eq('type', channel);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as unknown as MessageTemplate[];
    },
  });
};

export const useMessageTemplate = (id: string | undefined) => {
  return useQuery({
    queryKey: ['message-template', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as unknown as MessageTemplate;
    },
    enabled: !!id,
  });
};

export const useCreateMessageTemplate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: Omit<MessageTemplate, 'id' | 'created_at' | 'updated_at' | 'usage_count' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's account_id
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No account membership found');

      // Extract variables from body (store as array in JSONB)
      const variables = extractVariables(template.body);

      const { data, error } = await supabase
        .from('message_templates')
        .insert({
          name: template.name,
          description: template.description,
          type: template.channel,
          subject: template.subject,
          body: template.body,
          variables: variables,
          category: template.category,
          account_id: membership.account_id,
          created_by: user.id,
          is_active: template.active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast({
        title: 'Success',
        description: 'Template created successfully',
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

export const useUpdateMessageTemplate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<MessageTemplate> }) => {
      const dbUpdates: any = {};
      
      if (updates.body) {
        dbUpdates.body = updates.body;
        dbUpdates.variables = extractVariables(updates.body);
      }
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.channel) dbUpdates.type = updates.channel;
      if (updates.subject !== undefined) dbUpdates.subject = updates.subject;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.active !== undefined) dbUpdates.is_active = updates.active;

      const { data, error } = await supabase
        .from('message_templates')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      queryClient.invalidateQueries({ queryKey: ['message-template', variables.id] });
      toast({
        title: 'Success',
        description: 'Template updated successfully',
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

export const useDeleteMessageTemplate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      toast({
        title: 'Success',
        description: 'Template deleted successfully',
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

export const useIncrementTemplateUsage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      // Increment usage count manually since RPC doesn't exist yet
      const { data: template } = await supabase
        .from('message_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      
      if (template) {
        const currentCount = (template).usage_count || 0;
        await supabase
          .from('message_templates')
          .update({ usage_count: currentCount + 1 })
          .eq('id', templateId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
    },
  });
};

// ============================================================================
// CAMPAIGN UTILITY HOOKS
// ============================================================================

/**
 * Duplicate an existing campaign
 */
export const useDuplicateCampaign = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch original campaign
      const { data: original, error: fetchError } = await supabase
        .from('nurture_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (fetchError) throw fetchError;

      // Create duplicate with "(Copy)" suffix
      const { data, error } = await supabase
        .from('nurture_campaigns')
        .insert({
          account_id: (original).account_id,
          name: `${(original).name} (Copy)`,
          description: (original).description,
          trigger_conditions: (original).trigger_conditions,
          steps: (original).steps,
          status: 'draft', // Start as draft
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurture-campaigns'] });
      toast({
        title: 'Success',
        description: 'Campaign duplicated successfully',
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

/**
 * Get analytics summary for all campaigns
 */
export const useCampaignsAnalyticsSummary = () => {
  return useQuery({
    queryKey: ['campaigns-analytics-summary'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .single();

      if (!membership) throw new Error('No account membership found');

      // Break type chain to avoid deep instantiation
      const queryBuilder: any = supabase.from('nurture_campaigns');
      const { data, error } = await queryBuilder
        .select('*')
        .eq('account_id', membership.account_id);

      if (error) throw error;

      const campaigns = data || [];

      // Calculate summary metrics
      const totalEnrollments = campaigns.reduce((sum: number, c: any) => sum + (c.enrollment_count || 0), 0);
      const totalCompletions = campaigns.reduce((sum: number, c: any) => sum + (c.completion_count || 0), 0);
      const totalConversions = campaigns.reduce((sum: number, c: any) => sum + (c.conversion_count || 0), 0);

      return {
        total_campaigns: campaigns.length,
        active_campaigns: campaigns.filter((c: any) => c.status === 'active').length,
        draft_campaigns: campaigns.filter((c: any) => c.status === 'draft').length,
        paused_campaigns: campaigns.filter((c: any) => c.status === 'paused').length,
        total_enrollments: totalEnrollments,
        total_completions: totalCompletions,
        total_conversions: totalConversions,
        completion_rate: totalEnrollments > 0 ? (totalCompletions / totalEnrollments * 100) : 0,
        conversion_rate: totalEnrollments > 0 ? (totalConversions / totalEnrollments * 100) : 0,
        avg_enrollments_per_campaign: campaigns.length > 0 ? totalEnrollments / campaigns.length : 0,
      };
    },
  });
};

/**
 * Test if a lead matches campaign trigger conditions
 */
export const useTestCampaignConditions = () => {
  return useMutation({
    mutationFn: async ({ campaignId, leadId }: { campaignId: string; leadId: string }) => {
      // Fetch campaign conditions
      const { data: campaign, error: campaignError } = await supabase
        .from('nurture_campaigns')
        .select('trigger_conditions')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;

      // Fetch lead data
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*, lead_tags(tag:tags(name))')
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;

      const conditions = (campaign).trigger_conditions || {};
      const leadData = lead;
      
      // Test conditions
      let matches = true;
      const reasons: string[] = [];

      // Check lead status
      if (conditions.lead_status && conditions.lead_status.length > 0) {
        if (!conditions.lead_status.includes(leadData.status)) {
          matches = false;
          reasons.push(`Lead status "${leadData.status}" not in ${conditions.lead_status.join(', ')}`);
        }
      }

      // Check lead score range
      if (conditions.lead_score_min !== undefined || conditions.lead_score_max !== undefined) {
        const score = leadData.lead_score || 0;
        const min = conditions.lead_score_min || 0;
        const max = conditions.lead_score_max || 100;
        
        if (score < min || score > max) {
          matches = false;
          reasons.push(`Lead score ${score} not in range ${min}-${max}`);
        }
      }

      // Check insurance types
      if (conditions.insurance_types && conditions.insurance_types.length > 0) {
        const leadTypes = leadData.insurance_types || [];
        const hasMatch = conditions.insurance_types.some((type: string) => leadTypes.includes(type));
        
        if (!hasMatch) {
          matches = false;
          reasons.push(`No matching insurance types`);
        }
      }

      // Check tags
      if (conditions.tags && conditions.tags.length > 0) {
        const leadTags = (leadData.lead_tags || []).map((lt: any) => lt.tag?.name);
        const hasMatch = conditions.tags.some((tag: string) => leadTags.includes(tag));
        
        if (!hasMatch) {
          matches = false;
          reasons.push(`No matching tags`);
        }
      }

      return {
        matches,
        reasons: reasons.length > 0 ? reasons.join('; ') : 'All conditions met',
        lead_data: {
          status: leadData.status,
          score: leadData.lead_score,
          insurance_types: leadData.insurance_types,
          tags: (leadData.lead_tags || []).map((lt: any) => lt.tag?.name),
        },
      };
    },
  });
};

/**
 * Get campaign performance analytics
 */
export const useCampaignAnalytics = (campaignId: string | undefined) => {
  return useQuery({
    queryKey: ['campaign-analytics', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;

      // Get campaign data
      const { data: campaign, error: campaignError } = await supabase
        .from('nurture_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;

      // Get enrollments
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('campaign_enrollments')
        .select('status, enrolled_at, completed_at, converted')
        .eq('campaign_id', campaignId);

      if (enrollmentsError) throw enrollmentsError;

      const enrollmentsData = enrollments || [];
      const campaignData = campaign;

      return {
        campaign_id: campaignId,
        campaign_name: campaignData.name,
        status: campaignData.status,
        enrollment_count: campaignData.enrollment_count || 0,
        completion_count: campaignData.completion_count || 0,
        conversion_count: campaignData.conversion_count || 0,
        active_enrollments: enrollmentsData.filter(e => e.status === 'active').length,
        completed_enrollments: enrollmentsData.filter(e => e.status === 'completed').length,
        converted_enrollments: enrollmentsData.filter(e => e.converted).length,
        completion_rate: enrollmentsData.length > 0 
          ? (enrollmentsData.filter(e => e.status === 'completed').length / enrollmentsData.length * 100)
          : 0,
        conversion_rate: enrollmentsData.length > 0
          ? (enrollmentsData.filter(e => e.converted).length / enrollmentsData.length * 100)
          : 0,
      };
    },
    enabled: !!campaignId,
  });
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateNextExecution(delayValue: number, delayUnit: string): string {
  const now = new Date();
  
  switch (delayUnit) {
    case 'minutes':
      now.setMinutes(now.getMinutes() + delayValue);
      break;
    case 'hours':
      now.setHours(now.getHours() + delayValue);
      break;
    case 'days':
      now.setDate(now.getDate() + delayValue);
      break;
    case 'weeks':
      now.setDate(now.getDate() + (delayValue * 7));
      break;
  }
  
  return now.toISOString();
}

function extractVariables(text: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    variables.add(match[1]);
  }
  
  return Array.from(variables);
}
