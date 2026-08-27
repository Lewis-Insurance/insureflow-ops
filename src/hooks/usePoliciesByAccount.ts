import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PolicyWithAccount } from './usePolicies';

type AccountPolicyRequiredFields = Pick<
  PolicyWithAccount,
  | 'id'
  | 'account_id'
  | 'policy_number'
  | 'line_of_business'
  | 'status'
  | 'premium'
  | 'effective_date'
  | 'expiration_date'
  | 'named_insured'
>;

export type AccountPolicy = AccountPolicyRequiredFields &
  Partial<Omit<PolicyWithAccount, keyof AccountPolicyRequiredFields>> & {
    membership: 'owner' | 'named_insured';
    owner_account_id: string;
    owner_account_name: string;
  };

type AccountPolicyRpcRow = {
  id: string;
  account_id: string;
  membership: string;
  owner_account_id: string;
  owner_account_name: string;
  policy_number: string | null;
  line_of_business: string | null;
  status: string | null;
  premium: number | null;
  effective_date: string | null;
  expiration_date: string | null;
  named_insured: string | null;
  carrier_name: string | null;
};

function mapAccountPolicy(row: AccountPolicyRpcRow): AccountPolicy {
  return {
    ...row,
    membership: row.membership === 'named_insured' ? 'named_insured' : 'owner',
    carrier_info: row.carrier_name ? { id: '', name: row.carrier_name } : undefined,
  };
}

export function usePoliciesByAccount(accountId: string) {
  return useQuery({
    queryKey: ['policies', 'account', accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_account_policies', {
        p_account_id: accountId,
      });

      if (error) {
        throw new Error(`Failed to fetch policies: ${error.message}`);
      }

      return (data as AccountPolicyRpcRow[]).map(mapAccountPolicy);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!accountId,
  });
}
