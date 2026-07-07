// Policy additional coverages hook.
//
// Read + add + remove the custom "write-in" coverage rows for one policy line
// (public.policy_additional_coverages). These are the coverages a user adds by
// name + amount from the coverage panel - the clean replacement for the old
// Manual Details modal. RLS scopes the table to staff of the policy's workspace,
// so the CRUD goes straight through PostgREST (no RPC). The table is not in the
// generated types yet, so the .from() target is cast, matching how other new
// tables are consumed in this codebase.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PolicyAdditionalCoverage {
  id: string;
  name: string;
  amount: number | null;
}

const keyFor = (policyId: string, line: string) => [
  'policy-additional-coverages',
  policyId,
  line,
];

export function usePolicyAdditionalCoverages(policyId: string, line: string) {
  const queryClient = useQueryClient();
  const queryKey = keyFor(policyId, line);

  const query = useQuery({
    queryKey,
    enabled: Boolean(policyId && line),
    queryFn: async (): Promise<PolicyAdditionalCoverage[]> => {
      const { data, error } = await (
        supabase
          .from('policy_additional_coverages' as never)
          .select('id, name, amount')
          .eq('policy_id', policyId)
          .eq('line', line)
          .order('created_at', { ascending: true }) as unknown as Promise<{
          data: PolicyAdditionalCoverage[] | null;
          error: { message: string } | null;
        }>
      );
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async (input: { name: string; amount: number | null }) => {
      const { error } = await (
        supabase.from('policy_additional_coverages' as never).insert({
          policy_id: policyId,
          line,
          name: input.name,
          amount: input.amount,
        } as never) as unknown as Promise<{ error: { message: string } | null }>
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Coverage added');
    },
    onError: (e: Error) => toast.error(`Failed to add coverage: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase
          .from('policy_additional_coverages' as never)
          .delete()
          .eq('id', id) as unknown as Promise<{ error: { message: string } | null }>
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Coverage removed');
    },
    onError: (e: Error) => toast.error(`Failed to remove coverage: ${e.message}`),
  });

  return {
    coverages: query.data ?? [],
    isLoading: query.isLoading,
    add,
    remove,
  };
}
