/**
 * Levitate Marketing Automations Hooks
 *
 * React Query hooks for managing automation recipes, enrollments, and executions.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type TriggerType =
  | 'birthday'
  | 'policy_renewal'
  | 'new_customer'
  | 'claim_closed'
  | 'policy_anniversary'
  | 'no_contact'
  | 'tag_added'
  | 'manual'
  | 'api';

export type StepType =
  | 'send_email'
  | 'send_sms'
  | 'wait'
  | 'branch'
  | 'add_tag'
  | 'remove_tag'
  | 'update_field'
  | 'create_task'
  | 'send_notification'
  | 'enroll_in_automation'
  | 'exit';

export type EnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';

export interface AutomationRecipe {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  entry_criteria: Record<string, unknown> | null;
  exit_criteria: Record<string, unknown> | null;
  is_active: boolean;
  max_concurrent_enrollments: number | null;
  total_enrollments: number;
  active_enrollments: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationStep {
  id: string;
  recipe_id: string;
  org_id: string;
  step_name: string;
  step_order: number;
  step_type: StepType;
  step_config: Record<string, unknown>;
  delay_amount: number | null;
  delay_unit: string | null;
  next_step_id: string | null;
  branch_yes_step_id: string | null;
  branch_no_step_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface AutomationEnrollment {
  id: string;
  org_id: string;
  recipe_id: string;
  contact_id: string | null;
  account_id: string | null;
  policy_id: string | null;
  current_step_id: string | null;
  status: EnrollmentStatus;
  enrolled_at: string;
  paused_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  context_data: Record<string, unknown>;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRecipeParams {
  name: string;
  description?: string;
  trigger_type: TriggerType;
  trigger_config?: Record<string, unknown>;
  entry_criteria?: Record<string, unknown>;
  is_active?: boolean;
}

export interface CreateStepParams {
  recipe_id: string;
  step_name: string;
  step_order: number;
  step_type: StepType;
  step_config?: Record<string, unknown>;
  delay_amount?: number;
  delay_unit?: 'minutes' | 'hours' | 'days' | 'weeks';
  next_step_id?: string;
  branch_yes_step_id?: string;
  branch_no_step_id?: string;
}

export interface EnrollContactParams {
  recipe_id: string;
  contact_id?: string;
  account_id?: string;
  policy_id?: string;
  context_data?: Record<string, unknown>;
}

// ============================================================================
// QUERY HOOKS
// ============================================================================

/**
 * Get all automation recipes
 */
export function useMarketingAutomations(filters?: {
  trigger_type?: TriggerType;
  is_active?: boolean;
}) {
  return useQuery({
    queryKey: ['marketing-automations', filters],
    queryFn: async () => {
      let query = supabase
        .from('marketing_automation_recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.trigger_type) {
        query = query.eq('trigger_type', filters.trigger_type);
      }
      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AutomationRecipe[];
    },
  });
}

/**
 * Get a single automation recipe with its steps
 */
export function useMarketingAutomation(recipeId: string | null) {
  return useQuery({
    queryKey: ['marketing-automation', recipeId],
    queryFn: async () => {
      if (!recipeId) return null;

      const { data: recipe, error: recipeError } = await supabase
        .from('marketing_automation_recipes')
        .select('*')
        .eq('id', recipeId)
        .single();

      if (recipeError) throw recipeError;

      const { data: steps, error: stepsError } = await supabase
        .from('marketing_automation_steps')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('step_order', { ascending: true });

      if (stepsError) throw stepsError;

      return {
        ...recipe,
        steps: steps || [],
      } as AutomationRecipe & { steps: AutomationStep[] };
    },
    enabled: !!recipeId,
  });
}

/**
 * Get automation enrollments
 */
export function useAutomationEnrollments(filters?: {
  recipe_id?: string;
  contact_id?: string;
  account_id?: string;
  status?: EnrollmentStatus;
}) {
  return useQuery({
    queryKey: ['automation-enrollments', filters],
    queryFn: async () => {
      let query = supabase
        .from('marketing_automation_enrollments')
        .select(`
          *,
          recipe:marketing_automation_recipes(id, name),
          contact:contacts(id, first_name, last_name, email)
        `)
        .order('enrolled_at', { ascending: false });

      if (filters?.recipe_id) {
        query = query.eq('recipe_id', filters.recipe_id);
      }
      if (filters?.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }
      if (filters?.account_id) {
        query = query.eq('account_id', filters.account_id);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Get enrollment execution history
 */
export function useEnrollmentHistory(enrollmentId: string | null) {
  return useQuery({
    queryKey: ['enrollment-history', enrollmentId],
    queryFn: async () => {
      if (!enrollmentId) return [];

      const { data, error } = await supabase
        .from('marketing_automation_step_executions')
        .select(`
          *,
          step:marketing_automation_steps(id, step_name, step_type)
        `)
        .eq('enrollment_id', enrollmentId)
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!enrollmentId,
  });
}

/**
 * Get automation analytics
 */
export function useAutomationAnalytics(recipeId?: string) {
  return useQuery({
    queryKey: ['automation-analytics', recipeId],
    queryFn: async () => {
      let enrollmentsQuery = supabase
        .from('marketing_automation_enrollments')
        .select('status', { count: 'exact' });

      if (recipeId) {
        enrollmentsQuery = enrollmentsQuery.eq('recipe_id', recipeId);
      }

      const { data: enrollments, error, count } = await enrollmentsQuery;

      if (error) throw error;

      // Calculate status breakdown
      const statusCounts = {
        active: 0,
        paused: 0,
        completed: 0,
        cancelled: 0,
        failed: 0,
      };

      enrollments?.forEach((e) => {
        if (e.status in statusCounts) {
          statusCounts[e.status as keyof typeof statusCounts]++;
        }
      });

      return {
        total: count || 0,
        ...statusCounts,
        completion_rate: count ? Math.round((statusCounts.completed / count) * 100) : 0,
      };
    },
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

/**
 * Create a new automation recipe
 */
export function useCreateAutomation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateRecipeParams) => {
      const { data, error } = await supabase
        .from('marketing_automation_recipes')
        .insert({
          name: params.name,
          description: params.description,
          trigger_type: params.trigger_type,
          trigger_config: params.trigger_config || {},
          entry_criteria: params.entry_criteria,
          is_active: params.is_active ?? false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRecipe;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automations'] });
      toast({
        title: 'Automation Created',
        description: `"${data.name}" has been created successfully.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Creating Automation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update an automation recipe
 */
export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<AutomationRecipe> & { id: string }) => {
      const { data, error } = await supabase
        .from('marketing_automation_recipes')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRecipe;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automations'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-automation', data.id] });
      toast({
        title: 'Automation Updated',
        description: `"${data.name}" has been updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Updating Automation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Toggle automation active status
 */
export function useToggleAutomation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('marketing_automation_recipes')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRecipe;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automations'] });
      toast({
        title: data.is_active ? 'Automation Activated' : 'Automation Paused',
        description: `"${data.name}" is now ${data.is_active ? 'active' : 'paused'}.`,
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
}

/**
 * Delete an automation recipe
 */
export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('marketing_automation_recipes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automations'] });
      toast({
        title: 'Automation Deleted',
        description: 'The automation has been deleted.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Deleting Automation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Create an automation step
 */
export function useCreateAutomationStep() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: CreateStepParams) => {
      const { data, error } = await supabase
        .from('marketing_automation_steps')
        .insert({
          recipe_id: params.recipe_id,
          step_name: params.step_name,
          step_order: params.step_order,
          step_type: params.step_type,
          step_config: params.step_config || {},
          delay_amount: params.delay_amount,
          delay_unit: params.delay_unit,
          next_step_id: params.next_step_id,
          branch_yes_step_id: params.branch_yes_step_id,
          branch_no_step_id: params.branch_no_step_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AutomationStep;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automation', data.recipe_id] });
      toast({
        title: 'Step Added',
        description: `Step "${data.step_name}" has been added.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Adding Step',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update an automation step
 */
export function useUpdateAutomationStep() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      recipe_id,
      ...updates
    }: Partial<AutomationStep> & { id: string; recipe_id: string }) => {
      const { data, error } = await supabase
        .from('marketing_automation_steps')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, recipe_id } as AutomationStep;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automation', data.recipe_id] });
      toast({
        title: 'Step Updated',
        description: `Step "${data.step_name}" has been updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Updating Step',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Delete an automation step
 */
export function useDeleteAutomationStep() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, recipe_id }: { id: string; recipe_id: string }) => {
      const { error } = await supabase
        .from('marketing_automation_steps')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, recipe_id };
    },
    onSuccess: ({ recipe_id }) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-automation', recipe_id] });
      toast({
        title: 'Step Deleted',
        description: 'The step has been removed from the automation.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Deleting Step',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Manually enroll a contact in an automation
 */
export function useEnrollInAutomation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: EnrollContactParams) => {
      // Use the database function for proper enrollment
      const { data, error } = await supabase.rpc('enroll_in_automation', {
        p_recipe_id: params.recipe_id,
        p_contact_id: params.contact_id || null,
        p_account_id: params.account_id || null,
        p_policy_id: params.policy_id || null,
        p_context_data: params.context_data || {},
        p_triggered_by: null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-automations'] });
      toast({
        title: 'Contact Enrolled',
        description: 'The contact has been enrolled in the automation.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Enrolling Contact',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Cancel an enrollment
 */
export function useCancelEnrollment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      enrollment_id,
      reason,
    }: {
      enrollment_id: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc('cancel_automation_enrollment', {
        p_enrollment_id: enrollment_id,
        p_reason: reason || 'Manual cancellation',
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-enrollments'] });
      toast({
        title: 'Enrollment Cancelled',
        description: 'The enrollment has been cancelled.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error Cancelling Enrollment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Pause/Resume an enrollment
 */
export function usePauseEnrollment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      enrollment_id,
      pause,
    }: {
      enrollment_id: string;
      pause: boolean;
    }) => {
      const { data, error } = await supabase
        .from('marketing_automation_enrollments')
        .update({
          status: pause ? 'paused' : 'active',
          paused_at: pause ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrollment_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-enrollments'] });
      toast({
        title: data.status === 'paused' ? 'Enrollment Paused' : 'Enrollment Resumed',
        description: `The enrollment has been ${data.status === 'paused' ? 'paused' : 'resumed'}.`,
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
}
