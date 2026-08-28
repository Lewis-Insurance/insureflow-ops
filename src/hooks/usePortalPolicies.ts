import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function usePortalPolicies(accountId: string | null) {
  return useQuery({
    queryKey: ['portal-policies', accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_my_portal_policies', {
        p_account_id: accountId!,
      });

      if (error) throw error;
      return [...data].sort((left, right) =>
        (left.expiration_date ?? '').localeCompare(right.expiration_date ?? ''),
      );
    },
    enabled: !!accountId,
  });
}
