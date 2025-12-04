import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../client';
import { useToast } from '@/hooks/use-toast';

export interface AutomationRule {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_conditions: any;
  applies_to: string;
  is_active: boolean;
  priority: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationAction {
  id: string;
  rule_id: string;
  action_order: number;
  action_type: string;
  action_config: any;
  conditions: any;
  delay_minutes: number;
  is_active: boolean;
  created_at: string;
}

export interface AutomationExecution {
  id: string;
  rule_id: string;
  action_id: string | null;
  entity_type: string;
  entity_id: string;
  trigger_data: any;
  action_result: any;
  status: string;
  error_message: string | null;
  executed_at: string;
  created_at: string;
}

// ============================================================================
// AUTOMATION RULES HOOKS
// ============================================================================

export const useAutomationRules = () => {
  return useQuery({
    queryKey: ['automation-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AutomationRule[];
    },
  });
};

export const useAutomationRule = (id: string | undefined) => {
  return useQuery({
    queryKey: ['automation-rule', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    enabled: !!id,
  });
};

export const useCreateAutomationRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (rule: Omit<AutomationRule, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: memberships } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1);

      if (!memberships || memberships.length === 0) {
        throw new Error('No account membership found');
      }

      const membership = memberships[0];

      const { data, error } = await supabase
        .from('automation_rules')
        .insert({
          ...rule,
          account_id: membership.account_id,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast({
        title: 'Success',
        description: 'Automation rule created successfully',
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

export const useUpdateAutomationRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AutomationRule> }) => {
      const { data, error } = await supabase
        .from('automation_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['automation-rule', variables.id] });
      toast({
        title: 'Success',
        description: 'Rule updated successfully',
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

export const useDeleteAutomationRule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast({
        title: 'Success',
        description: 'Rule deleted successfully',
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

export const useToggleRuleActive = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('automation_rules')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['automation-rule', data.id] });
      toast({
        title: 'Success',
        description: `Rule ${data.is_active ? 'activated' : 'deactivated'}`,
      });
    },
  });
};

// ============================================================================
// AUTOMATION ACTIONS HOOKS
// ============================================================================

export const useAutomationActions = (ruleId: string | undefined) => {
  return useQuery({
    queryKey: ['automation-actions', ruleId],
    queryFn: async () => {
      if (!ruleId) return [];

      const { data, error } = await supabase
        .from('automation_actions')
        .select('*')
        .eq('rule_id', ruleId)
        .order('action_order', { ascending: true });

      if (error) throw error;
      return data as AutomationAction[];
    },
    enabled: !!ruleId,
  });
};

export const useCreateAutomationAction = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (action: Omit<AutomationAction, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('automation_actions')
        .insert(action)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationAction;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-actions', data.rule_id] });
      toast({
        title: 'Success',
        description: 'Action added successfully',
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

export const useUpdateAutomationAction = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AutomationAction> }) => {
      const { data, error } = await supabase
        .from('automation_actions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationAction;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['automation-actions', data.rule_id] });
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

export const useDeleteAutomationAction = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ruleId }: { id: string; ruleId: string }) => {
      const { error } = await supabase
        .from('automation_actions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return ruleId;
    },
    onSuccess: (ruleId) => {
      queryClient.invalidateQueries({ queryKey: ['automation-actions', ruleId] });
      toast({
        title: 'Success',
        description: 'Action deleted successfully',
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
// EXECUTION LOGS HOOKS
// ============================================================================

export const useAutomationExecutions = (ruleId: string | undefined) => {
  return useQuery({
    queryKey: ['automation-executions', ruleId],
    queryFn: async () => {
      if (!ruleId) return [];

      const { data, error } = await supabase
        .from('automation_executions')
        .select('*')
        .eq('rule_id', ruleId)
        .order('created_at', { ascending: false})
        .limit(100);

      if (error) throw error;
      return data as AutomationExecution[];
    },
    enabled: !!ruleId,
  });
};

export const useExecutionStats = (ruleId: string | undefined) => {
  return useQuery({
    queryKey: ['automation-execution-stats', ruleId],
    queryFn: async () => {
      if (!ruleId) return null;

      const { data, error } = await supabase
        .from('automation_executions')
        .select('status')
        .eq('rule_id', ruleId);

      if (error) throw error;

      const executions = data[];
      const total = executions.length;
      const success = executions.filter(e => e.status === 'success').length;
      const failed = executions.filter(e => e.status === 'failed').length;
      const pending = executions.filter(e => e.status === 'pending').length;

      return {
        total,
        success,
        failed,
        pending,
        success_rate: total > 0 ? (success / total * 100) : 0,
      };
    },
    enabled: !!ruleId,
  });
};
