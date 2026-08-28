import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PolicyNamedInsuredSummary {
  policy_id: string;
  account_id: string;
  name: string;
}

interface PolicyNamedInsuredRow {
  policy_id: string;
  account_id: string;
  account: { name: string } | null;
}

export function usePolicyNamedInsureds(policyIds: string[]) {
  const normalizedPolicyIds = [...new Set(policyIds)].sort();

  return useQuery({
    queryKey: ['policy-named-insureds', 'batch', normalizedPolicyIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policy_named_insureds')
        .select('policy_id, account_id, account:accounts!policy_named_insureds_account_id_fkey(name)')
        .in('policy_id', normalizedPolicyIds)
        .order('created_at');

      if (error) throw error;

      return (data as unknown as PolicyNamedInsuredRow[])
        .filter((row) => row.account)
        .map((row) => ({
          policy_id: row.policy_id,
          account_id: row.account_id,
          name: row.account!.name,
        }));
    },
    enabled: normalizedPolicyIds.length > 0,
  });
}
