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
          status: 'draft',
        } as any)
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
        .update(updates as any)
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
        
        if (campaign && !(campaign as any).started_at) {
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

      const steps = (campaign as any)?.steps;
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
        } as any)
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
        .update(updates as any)
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
        } as any)
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
        .from('campaign_step_executions' as any)
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
        .from('campaign_step_executions' as any)
        .select('status, channel')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      // Calculate stats
      const executions = data as any[];
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
        .from('message_templates' as any)
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
        .from('message_templates' as any)
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
        .from('message_templates' as any)
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
        .from('message_templates' as any)
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
        .from('message_templates' as any)
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
        .from('message_templates' as any)
        .select('*')
        .eq('id', templateId)
        .single();
      
      if (template) {
        const currentCount = (template as any).usage_count || 0;
        await supabase
          .from('message_templates' as any)
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
