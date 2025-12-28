/**
 * Marketing Automation Workflows Hooks
 *
 * Provides CRUD operations and management for:
 * - Automation workflows (birthday, renewal, welcome, etc.)
 * - Workflow stages (multi-step sequences)
 * - Workflow executions (contact-level tracking)
 * - Workflow templates (prebuilt workflows)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export type WorkflowType =
  | 'birthday'
  | 'policy_renewal'
  | 'referral_request'
  | 'turning_65'
  | 'welcome_client'
  | 'cross_sell'
  | 'thank_you'
  | 'client_pulse'
  | 'x_date'
  | 'new_policy'
  | 'lost_deal'
  | 'policy_anniversary'
  | 'custom';

export type WorkflowStatus = 'draft' | 'active' | 'paused' | 'archived';

export type TriggerType =
  | 'date_based'
  | 'event_based'
  | 'manual'
  | 'pipeline_stage'
  | 'segment_entry';

export type ActionType =
  | 'email'
  | 'sms'
  | 'postcard'
  | 'task'
  | 'reminder'
  | 'internal_notification'
  | 'voicemail_drop'
  | 'pipeline_move'
  | 'tag_add'
  | 'tag_remove'
  | 'field_update'
  | 'webhook'
  | 'wait_for_event'
  | 'branch'
  | 'a_b_split';

export type DelayType =
  | 'immediate'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'specific_date'
  | 'specific_time';

export interface AutomationWorkflow {
  id: string;
  agency_workspace_id: string;
  name: string;
  description: string | null;
  workflow_type: WorkflowType;
  status: WorkflowStatus;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  filter_config: Record<string, unknown>;
  goal_config: Record<string, unknown>;
  send_window_start: string;
  send_window_end: string;
  send_days: string[];
  timezone: string;
  daily_send_limit: number;
  total_recipients_limit: number | null;
  cooldown_days: number;
  total_enrolled: number;
  total_completed: number;
  total_converted: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  stages?: WorkflowStage[];
}

export interface WorkflowStage {
  id: string;
  workflow_id: string;
  stage_number: number;
  name: string;
  delay_type: DelayType;
  delay_value: number;
  delay_from: 'trigger' | 'previous_stage' | 'enrollment' | 'specific_date';
  specific_date: string | null;
  send_time: string;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  conditions: Array<Record<string, unknown>>;
  stop_on_reply: boolean;
  stop_on_click: boolean;
  stop_on_unsubscribe: boolean;
  stop_on_goal: boolean;
  is_ab_test: boolean;
  ab_test_config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  agency_workspace_id: string;
  contact_id: string | null;
  account_id: string | null;
  lead_id: string | null;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'converted' | 'stopped' | 'error' | 'skipped';
  current_stage: number;
  context_data: Record<string, unknown>;
  enrolled_at: string;
  started_at: string | null;
  completed_at: string | null;
  stopped_at: string | null;
  converted_at: string | null;
  stop_reason: string | null;
  emails_sent: number;
  emails_opened: number;
  emails_clicked: number;
  sms_sent: number;
  sms_replied: number;
  contact?: Record<string, unknown>;
  account?: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  workflow_type: WorkflowType;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  filter_config: Record<string, unknown>;
  goal_config: Record<string, unknown>;
  stages: Array<Partial<WorkflowStage>>;
  category: string | null;
  estimated_conversion_rate: number | null;
  recommended_for: string[] | null;
  is_system: boolean;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  workflow_type: WorkflowType;
  trigger_type: TriggerType;
  trigger_config?: Record<string, unknown>;
  filter_config?: Record<string, unknown>;
  goal_config?: Record<string, unknown>;
  send_window_start?: string;
  send_window_end?: string;
  send_days?: string[];
  timezone?: string;
  daily_send_limit?: number;
  cooldown_days?: number;
}

export interface UpdateWorkflowInput extends Partial<CreateWorkflowInput> {
  id: string;
  status?: WorkflowStatus;
}

export interface CreateStageInput {
  workflow_id: string;
  stage_number: number;
  name: string;
  delay_type: DelayType;
  delay_value?: number;
  delay_from?: 'trigger' | 'previous_stage' | 'enrollment' | 'specific_date';
  send_time?: string;
  action_type: ActionType;
  action_config: Record<string, unknown>;
  conditions?: Array<Record<string, unknown>>;
  stop_on_reply?: boolean;
  stop_on_click?: boolean;
}

// ============================================================================
// useAutomationWorkflows - List and manage workflows
// ============================================================================

export function useAutomationWorkflows(options?: {
  status?: WorkflowStatus;
  type?: WorkflowType;
}) {
  const { agency } = useActiveAgency();

  return useQuery<AutomationWorkflow[]>({
    queryKey: ['automation-workflows', agency?.id, options?.status, options?.type],
    queryFn: async () => {
      if (!agency?.id) return [];

      let query = supabase
        .from('automation_workflows')
        .select(`
          *,
          stages:automation_workflow_stages(count)
        `)
        .eq('agency_workspace_id', agency.id)
        .order('created_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.type) {
        query = query.eq('workflow_type', options.type);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch workflows', { error: error.message });
        throw error;
      }

      return data as AutomationWorkflow[];
    },
    enabled: !!agency?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// ============================================================================
// useWorkflow - Single workflow with stages
// ============================================================================

export function useWorkflow(workflowId?: string) {
  return useQuery<AutomationWorkflow>({
    queryKey: ['automation-workflow', workflowId],
    queryFn: async () => {
      if (!workflowId) throw new Error('Workflow ID required');

      const { data, error } = await supabase
        .from('automation_workflows')
        .select(`
          *,
          stages:automation_workflow_stages(*)
        `)
        .eq('id', workflowId)
        .single();

      if (error) {
        logger.error('Failed to fetch workflow', { error: error.message });
        throw error;
      }

      // Sort stages by stage_number
      if (data.stages) {
        data.stages.sort((a: WorkflowStage, b: WorkflowStage) => a.stage_number - b.stage_number);
      }

      return data as AutomationWorkflow;
    },
    enabled: !!workflowId,
  });
}

// ============================================================================
// useWorkflowMutations - Create, update, delete workflows
// ============================================================================

export function useWorkflowMutations() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  const createWorkflow = useMutation<AutomationWorkflow, Error, CreateWorkflowInput>({
    mutationFn: async (input) => {
      if (!agency?.id) throw new Error('No active agency');

      const { data, error } = await supabase
        .from('automation_workflows')
        .insert({
          ...input,
          agency_workspace_id: agency.id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to create workflow', { error: error.message });
        throw error;
      }

      return data as AutomationWorkflow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
    },
  });

  const updateWorkflow = useMutation<AutomationWorkflow, Error, UpdateWorkflowInput>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase
        .from('automation_workflows')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update workflow', { error: error.message });
        throw error;
      }

      return data as AutomationWorkflow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', data.id] });
    },
  });

  const deleteWorkflow = useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('automation_workflows')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('Failed to delete workflow', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
    },
  });

  const activateWorkflow = useMutation<AutomationWorkflow, Error, string>({
    mutationFn: async (id) => {
      const { data, error } = await supabase
        .from('automation_workflows')
        .update({ status: 'active' })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to activate workflow', { error: error.message });
        throw error;
      }

      return data as AutomationWorkflow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', data.id] });
    },
  });

  const pauseWorkflow = useMutation<AutomationWorkflow, Error, string>({
    mutationFn: async (id) => {
      const { data, error } = await supabase
        .from('automation_workflows')
        .update({ status: 'paused' })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to pause workflow', { error: error.message });
        throw error;
      }

      return data as AutomationWorkflow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', data.id] });
    },
  });

  const duplicateWorkflow = useMutation<AutomationWorkflow, Error, string>({
    mutationFn: async (id) => {
      // Get the workflow with stages
      const { data: original, error: fetchError } = await supabase
        .from('automation_workflows')
        .select('*, stages:automation_workflow_stages(*)')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Create new workflow
      const { id: _id, created_at, updated_at, stages, total_enrolled, total_completed, total_converted, ...workflowData } = original;

      const { data: newWorkflow, error: createError } = await supabase
        .from('automation_workflows')
        .insert({
          ...workflowData,
          name: `${original.name} (Copy)`,
          status: 'draft',
          total_enrolled: 0,
          total_completed: 0,
          total_converted: 0,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Copy stages
      if (stages && stages.length > 0) {
        const newStages = stages.map((stage: WorkflowStage) => {
          const { id: _stageId, workflow_id, created_at: _createdAt, updated_at: _updatedAt, ...stageData } = stage;
          return {
            ...stageData,
            workflow_id: newWorkflow.id,
          };
        });

        const { error: stagesError } = await supabase
          .from('automation_workflow_stages')
          .insert(newStages);

        if (stagesError) throw stagesError;
      }

      return newWorkflow as AutomationWorkflow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
    },
  });

  return {
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    activateWorkflow,
    pauseWorkflow,
    duplicateWorkflow,
  };
}

// ============================================================================
// useWorkflowStages - Manage workflow stages
// ============================================================================

export function useWorkflowStages(workflowId?: string) {
  const queryClient = useQueryClient();

  const stages = useQuery<WorkflowStage[]>({
    queryKey: ['workflow-stages', workflowId],
    queryFn: async () => {
      if (!workflowId) return [];

      const { data, error } = await supabase
        .from('automation_workflow_stages')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('stage_number', { ascending: true });

      if (error) {
        logger.error('Failed to fetch stages', { error: error.message });
        throw error;
      }

      return data as WorkflowStage[];
    },
    enabled: !!workflowId,
  });

  const addStage = useMutation<WorkflowStage, Error, CreateStageInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('automation_workflow_stages')
        .insert(input)
        .select()
        .single();

      if (error) {
        logger.error('Failed to add stage', { error: error.message });
        throw error;
      }

      return data as WorkflowStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', workflowId] });
    },
  });

  const updateStage = useMutation<WorkflowStage, Error, { id: string } & Partial<CreateStageInput>>({
    mutationFn: async ({ id, ...input }) => {
      const { data, error } = await supabase
        .from('automation_workflow_stages')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update stage', { error: error.message });
        throw error;
      }

      return data as WorkflowStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', workflowId] });
    },
  });

  const deleteStage = useMutation<void, Error, string>({
    mutationFn: async (stageId) => {
      const { error } = await supabase
        .from('automation_workflow_stages')
        .delete()
        .eq('id', stageId);

      if (error) {
        logger.error('Failed to delete stage', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', workflowId] });
    },
  });

  const reorderStages = useMutation<void, Error, { stageId: string; newNumber: number }[]>({
    mutationFn: async (reorders) => {
      // Update each stage's stage_number
      for (const { stageId, newNumber } of reorders) {
        const { error } = await supabase
          .from('automation_workflow_stages')
          .update({ stage_number: newNumber })
          .eq('id', stageId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-stages', workflowId] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', workflowId] });
    },
  });

  return {
    stages,
    addStage,
    updateStage,
    deleteStage,
    reorderStages,
  };
}

// ============================================================================
// useWorkflowExecutions - Track workflow executions
// ============================================================================

export function useWorkflowExecutions(workflowId?: string, options?: {
  status?: WorkflowExecution['status'];
  limit?: number;
}) {
  return useQuery<WorkflowExecution[]>({
    queryKey: ['workflow-executions', workflowId, options?.status, options?.limit],
    queryFn: async () => {
      if (!workflowId) return [];

      let query = supabase
        .from('automation_workflow_executions')
        .select(`
          *,
          contact:contacts(id, first_name, last_name, email),
          account:accounts(id, name)
        `)
        .eq('workflow_id', workflowId)
        .order('enrolled_at', { ascending: false });

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch executions', { error: error.message });
        throw error;
      }

      return data as WorkflowExecution[];
    },
    enabled: !!workflowId,
    refetchInterval: 30000, // Refresh every 30 seconds for active workflows
  });
}

// ============================================================================
// useWorkflowTemplates - Prebuilt workflow templates
// ============================================================================

export function useWorkflowTemplates() {
  return useQuery<WorkflowTemplate[]>({
    queryKey: ['workflow-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_workflow_templates')
        .select('*')
        .eq('is_system', true)
        .order('name');

      if (error) {
        logger.error('Failed to fetch templates', { error: error.message });
        throw error;
      }

      return data as WorkflowTemplate[];
    },
    staleTime: 60 * 60 * 1000, // 1 hour (templates don't change often)
  });
}

// ============================================================================
// useCreateFromTemplate - Create workflow from template
// ============================================================================

export function useCreateFromTemplate() {
  const queryClient = useQueryClient();
  const { agency } = useActiveAgency();

  return useMutation<AutomationWorkflow, Error, { templateId: string; name?: string }>({
    mutationFn: async ({ templateId, name }) => {
      if (!agency?.id) throw new Error('No active agency');

      // Get the template
      const { data: template, error: templateError } = await supabase
        .from('automation_workflow_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      // Create workflow from template
      const { data: workflow, error: workflowError } = await supabase
        .from('automation_workflows')
        .insert({
          agency_workspace_id: agency.id,
          name: name || template.name,
          description: template.description,
          workflow_type: template.workflow_type,
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config,
          filter_config: template.filter_config,
          goal_config: template.goal_config,
          status: 'draft',
        })
        .select()
        .single();

      if (workflowError) throw workflowError;

      // Create stages from template
      const stages = (template.stages as Array<Partial<WorkflowStage>>) || [];
      if (stages.length > 0) {
        const stageInserts = stages.map((stage) => ({
          workflow_id: workflow.id,
          stage_number: stage.stage_number || 1,
          name: stage.name || `Stage ${stage.stage_number}`,
          delay_type: stage.delay_type || 'immediate',
          delay_value: stage.delay_value || 0,
          delay_from: stage.delay_from || 'trigger',
          send_time: stage.send_time || '09:00',
          action_type: stage.action_type || 'email',
          action_config: stage.action_config || {},
          conditions: stage.conditions || [],
          stop_on_reply: stage.stop_on_reply ?? false,
          stop_on_click: stage.stop_on_click ?? false,
          stop_on_unsubscribe: stage.stop_on_unsubscribe ?? true,
          stop_on_goal: stage.stop_on_goal ?? true,
        }));

        const { error: stagesError } = await supabase
          .from('automation_workflow_stages')
          .insert(stageInserts);

        if (stagesError) throw stagesError;
      }

      return workflow as AutomationWorkflow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows'] });
    },
  });
}

// ============================================================================
// useEnrollContact - Manually enroll contact in workflow
// ============================================================================

export function useEnrollContact() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, {
    workflowId: string;
    contactId?: string;
    leadId?: string;
    accountId?: string;
  }>({
    mutationFn: async ({ workflowId, contactId, leadId, accountId }) => {
      const { error } = await supabase.functions.invoke('automation-processor', {
        body: {
          action: 'enroll_contact',
          workflow_id: workflowId,
          contact_id: contactId,
          lead_id: leadId,
          account_id: accountId,
        },
      });

      if (error) {
        logger.error('Failed to enroll contact', { error: error.message });
        throw error;
      }
    },
    onSuccess: (_data, { workflowId }) => {
      queryClient.invalidateQueries({ queryKey: ['workflow-executions', workflowId] });
    },
  });
}

// ============================================================================
// useStopExecution - Stop an active execution
// ============================================================================

export function useStopExecution() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { executionId: string; reason?: string }>({
    mutationFn: async ({ executionId, reason }) => {
      const { error } = await supabase.functions.invoke('automation-processor', {
        body: {
          action: 'stop_execution',
          execution_id: executionId,
          reason: reason || 'Manual stop',
        },
      });

      if (error) {
        logger.error('Failed to stop execution', { error: error.message });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow-executions'] });
    },
  });
}

// ============================================================================
// useWorkflowPerformance - Analytics view
// ============================================================================

export function useWorkflowPerformance(workflowId?: string) {
  return useQuery({
    queryKey: ['workflow-performance', workflowId],
    queryFn: async () => {
      if (!workflowId) return null;

      const { data, error } = await supabase
        .from('v_workflow_performance')
        .select('*')
        .eq('id', workflowId)
        .single();

      if (error) {
        logger.error('Failed to fetch performance', { error: error.message });
        throw error;
      }

      return data;
    },
    enabled: !!workflowId,
    refetchInterval: 60000, // Refresh every minute
  });
}
