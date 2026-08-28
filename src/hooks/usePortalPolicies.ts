import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePortalPolicies(accountId: string | null) {
  return useQuery({
    queryKey: ['portal-policies', accountId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('portal_user_policies')
        .select('policy_id, policy_number, line_of_business, carrier_name, policy_status, effective_date, expiration_date')
        .eq('account_id', accountId!)
        .order('expiration_date', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!accountId,
  });
}
