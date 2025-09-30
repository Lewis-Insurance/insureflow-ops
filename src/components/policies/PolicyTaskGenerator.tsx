import { useEffect } from 'react';
import { useTaskTemplates } from '@/hooks/useTaskTemplates';

interface PolicyTaskGeneratorProps {
  policyId: string;
  accountId: string;
  isNewPolicy?: boolean;
}

/**
 * Component that automatically generates tasks when a policy is issued.
 * Usage: Include this component in your policy creation flow.
 */
export function PolicyTaskGenerator({ policyId, accountId, isNewPolicy }: PolicyTaskGeneratorProps) {
  const { generateTasksFromEvent } = useTaskTemplates();

  useEffect(() => {
    if (isNewPolicy) {
      // Generate tasks when policy is issued
      generateTasksFromEvent('policy_issued', accountId, 'policy', policyId);
    }
  }, [isNewPolicy, policyId, accountId, generateTasksFromEvent]);

  // This component doesn't render anything
  return null;
}
