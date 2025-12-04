import { supabase } from '@/integrations/supabase/client';

/**
 * Utility functions for automatic task generation
 */

export type TriggerEvent = 
  | 'quote_requested'
  | 'quote_accepted'
  | 'policy_issued'
  | 'policy_renewal_due'
  | 'claim_filed'
  | 'payment_overdue'
  | 'service_request'
  | 'manual';

/**
 * Generate tasks from templates based on a trigger event
 * @param triggerEvent - The event that triggers task generation
 * @param accountId - The account ID to create tasks for
 * @param entityType - Optional entity type (e.g., 'quote', 'policy', 'claim')
 * @param entityId - Optional entity ID
 * @returns Result of task generation including count and created task IDs
 */
export async function generateTasks(
  triggerEvent: TriggerEvent,
  accountId: string,
  entityType?: string,
  entityId?: string
): Promise<{
  success: boolean;
  generated_count: number;
  tasks: Array<{ task_id: string; template_id: string; template_name: string }>;
} | null> {
  try {
    const { data, error } = await supabase.rpc('generate_tasks_from_templates', {
      p_trigger_event: triggerEvent,
      p_account_id: accountId,
      p_entity_type: entityType || null,
      p_entity_id: entityId || null,
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error generating tasks:', error);
    return null;
  }
}

/**
 * Example usage in your business logic:
 * 
 * // When a quote is created
 * await generateTasks('quote_requested', accountId, 'quote', quoteId);
 * 
 * // When a quote is accepted
 * await generateTasks('quote_accepted', accountId, 'quote', quoteId);
 * 
 * // When a policy is issued
 * await generateTasks('policy_issued', accountId, 'policy', policyId);
 * 
 * // When a claim is filed
 * await generateTasks('claim_filed', accountId, 'claim', claimId);
 * 
 * // For renewals (call this from a scheduled job)
 * await generateTasks('policy_renewal_due', accountId, 'policy', policyId);
 */
