import { assertPolicyInForceForSend } from './assertPolicyInForceForSend.ts';

interface SupabaseLikeClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
}

export function createSupabasePolicyInForceGuard(supabase: SupabaseLikeClient) {
  const db = {
    async findPolicyInForceByNumber(policyNumber: string) {
      const { data } = await supabase
        .from('policy_in_force_status')
        .select('in_force')
        .eq('policy_number', policyNumber)
        .maybeSingle();
      if (!data) return null;
      return { in_force: data.in_force === true };
    },
  };

  return async (_approverId: string, policyNumber: string): Promise<void> => {
    await assertPolicyInForceForSend(db, policyNumber);
  };
}
