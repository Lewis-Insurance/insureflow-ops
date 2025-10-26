// src/hooks/useAssignmentRules.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { 
  AssignmentRule, 
  AssignmentRuleCreateInput, 
  AssignmentRuleUpdateInput,
  LeadAssignment,
  LeadAssignmentInput,
  ProducerWorkloadStats
} from '@/types/leadAssignment';

// =====================================================
// QUERY KEYS
// =====================================================

export const assignmentKeys = {
  all: ['assignment'] as const,
  rules: () => [...assignmentKeys.all, 'rules'] as const,
  rule: (accountId: string) => [...assignmentKeys.rules(), accountId] as const,
  ruleDetail: (id: string) => [...assignmentKeys.rules(), 'detail', id] as const,
  activeRules: (accountId: string) => [...assignmentKeys.rules(), accountId, 'active'] as const,
  
  assignments: () => [...assignmentKeys.all, 'assignments'] as const,
  assignmentsByLead: (leadId: string) => [...assignmentKeys.assignments(), 'lead', leadId] as const,
  assignmentsByProducer: (producerId: string) => [...assignmentKeys.assignments(), 'producer', producerId] as const,
  
  workload: () => [...assignmentKeys.all, 'workload'] as const,
  workloadByProducer: (producerId: string) => [...assignmentKeys.workload(), producerId] as const,
  workloadByAccount: (accountId: string) => [...assignmentKeys.workload(), 'account', accountId] as const,
};

// =====================================================
// ASSIGNMENT RULES HOOKS
// =====================================================

/**
 * Get all assignment rules for an account
 */
export function useAssignmentRules(accountId: string) {
  return useQuery({
    queryKey: assignmentKeys.rule(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('account_id', accountId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AssignmentRule[];
    },
    enabled: !!accountId,
  });
}

/**
 * Get a single assignment rule by ID
 */
export function useAssignmentRule(ruleId: string) {
  return useQuery({
    queryKey: assignmentKeys.ruleDetail(ruleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('id', ruleId)
        .single();

      if (error) throw error;
      return data as AssignmentRule;
    },
    enabled: !!ruleId,
  });
}

/**
 * Get only active assignment rules (for matching logic)
 */
export function useActiveAssignmentRules(accountId: string) {
  return useQuery({
    queryKey: assignmentKeys.activeRules(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (error) throw error;
      return data as AssignmentRule[];
    },
    enabled: !!accountId,
  });
}

/**
 * Create a new assignment rule
 */
export function useCreateAssignmentRule(accountId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignmentRuleCreateInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('assignment_rules')
        .insert({
          account_id: accountId,
          created_by: user.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.rule(accountId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.activeRules(accountId) });
      toast.success('Assignment rule created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create assignment rule: ${error.message}`);
    },
  });
}

/**
 * Update an existing assignment rule
 */
export function useUpdateAssignmentRule(ruleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AssignmentRuleUpdateInput) => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ruleId)
        .select()
        .single();

      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.ruleDetail(ruleId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.rule(data.account_id) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.activeRules(data.account_id) });
      toast.success('Assignment rule updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update assignment rule: ${error.message}`);
    },
  });
}

/**
 * Delete an assignment rule
 */
export function useDeleteAssignmentRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { data: rule } = await supabase
        .from('assignment_rules')
        .select('account_id')
        .eq('id', ruleId)
        .single();

      const { error } = await supabase
        .from('assignment_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      return rule?.account_id;
    },
    onSuccess: (accountId) => {
      if (accountId) {
        queryClient.invalidateQueries({ queryKey: assignmentKeys.rule(accountId) });
        queryClient.invalidateQueries({ queryKey: assignmentKeys.activeRules(accountId) });
      }
      toast.success('Assignment rule deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete assignment rule: ${error.message}`);
    },
  });
}

/**
 * Toggle assignment rule active status
 */
export function useToggleAssignmentRule(ruleId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isActive: boolean) => {
      const { data, error } = await supabase
        .from('assignment_rules')
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ruleId)
        .select()
        .single();

      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.ruleDetail(ruleId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.rule(data.account_id) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.activeRules(data.account_id) });
      toast.success(`Rule ${data.is_active ? 'activated' : 'deactivated'} successfully`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to toggle rule: ${error.message}`);
    },
  });
}

// =====================================================
// LEAD ASSIGNMENTS HOOKS
// =====================================================

/**
 * Get assignment history for a lead
 */
export function useLeadAssignments(leadId: string) {
  return useQuery({
    queryKey: assignmentKeys.assignmentsByLead(leadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_assignments')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadAssignment[];
    },
    enabled: !!leadId,
  });
}

/**
 * Get all leads assigned to a producer
 */
export function useProducerAssignments(producerId: string) {
  return useQuery({
    queryKey: assignmentKeys.assignmentsByProducer(producerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_assignments')
        .select('*')
        .eq('assigned_to', producerId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LeadAssignment[];
    },
    enabled: !!producerId,
  });
}

/**
 * Manually assign a lead to a producer
 */
export function useAssignLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LeadAssignmentInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update the lead's assigned_to field
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .update({ 
          assigned_to: input.assigned_to,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', input.lead_id)
        .select()
        .single();

      if (leadError) throw leadError;

      // Create assignment record
      const { data: assignment, error: assignmentError } = await supabase
        .from('lead_assignments')
        .insert({
          lead_id: input.lead_id,
          assigned_to: input.assigned_to,
          assigned_by: user.id,
          assignment_rule_id: input.assignment_rule_id,
          assignment_method: 'manual',
          reason: input.reason || 'Manual assignment',
        })
        .select()
        .single();

      if (assignmentError) throw assignmentError;

      return { lead, assignment };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.assignmentsByLead(data.lead.id) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.assignmentsByProducer(data.assignment.assigned_to) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead assigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign lead: ${error.message}`);
    },
  });
}

/**
 * Reassign a lead to a different producer
 */
export function useReassignLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LeadAssignmentInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update the lead
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .update({ 
          assigned_to: input.assigned_to,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', input.lead_id)
        .select()
        .single();

      if (leadError) throw leadError;

      // Create reassignment record
      const { data: assignment, error: assignmentError } = await supabase
        .from('lead_assignments')
        .insert({
          lead_id: input.lead_id,
          assigned_to: input.assigned_to,
          assigned_by: user.id,
          assignment_rule_id: input.assignment_rule_id,
          assignment_method: 'reassignment',
          reason: input.reason || 'Lead reassigned',
        })
        .select()
        .single();

      if (assignmentError) throw assignmentError;

      return { lead, assignment };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.assignmentsByLead(data.lead.id) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead reassigned successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reassign lead: ${error.message}`);
    },
  });
}

// =====================================================
// WORKLOAD STATS HOOKS
// =====================================================

/**
 * Get workload stats for a specific producer
 */
export function useProducerWorkload(producerId: string) {
  return useQuery({
    queryKey: assignmentKeys.workloadByProducer(producerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_workload_stats')
        .select('*')
        .eq('producer_id', producerId)
        .single();

      if (error) {
        // Return empty stats if not found
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }
      return data as ProducerWorkloadStats;
    },
    enabled: !!producerId,
  });
}

/**
 * Get workload stats for all producers in an account
 */
export function useAccountProducerWorkloads(accountId: string) {
  return useQuery({
    queryKey: assignmentKeys.workloadByAccount(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producer_workload_stats')
        .select('*')
        .eq('account_id', accountId)
        .order('active_leads_count', { ascending: false });

      if (error) throw error;
      return data as ProducerWorkloadStats[];
    },
    enabled: !!accountId,
  });
}

/**
 * Get the producer with the lowest workload (for workload-based assignment)
 */
export function useLowestWorkloadProducer(accountId: string, eligibleProducerIds?: string[]) {
  return useQuery({
    queryKey: [...assignmentKeys.workloadByAccount(accountId), 'lowest', eligibleProducerIds],
    queryFn: async () => {
      let query = supabase
        .from('producer_workload_stats')
        .select('*')
        .eq('account_id', accountId)
        .order('active_leads_count', { ascending: true })
        .limit(1);

      // Filter by eligible producers if provided
      if (eligibleProducerIds && eligibleProducerIds.length > 0) {
        query = query.in('producer_id', eligibleProducerIds);
      }

      const { data, error } = await query.single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as ProducerWorkloadStats;
    },
    enabled: !!accountId,
  });
}

// =====================================================
// UTILITY FUNCTION: Call Round Robin Function
// =====================================================

/**
 * Call the database function to get next round robin producer
 */
export async function getNextRoundRobinProducer(ruleId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_next_round_robin_producer', {
    p_rule_id: ruleId,
  });

  if (error) {
    console.error('Error getting next round robin producer:', error);
    return null;
  }

  return data as string | null;
}
