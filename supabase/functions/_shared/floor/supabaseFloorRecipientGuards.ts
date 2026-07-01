import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import {
  createAccountOfRecordRecipientGuard,
  createTier3ExternalRecipientGuard,
} from './floorRecipientGuards.ts';

export function createSupabaseFloorRecipientGuards(
  supabase: SupabaseClient,
  env: { allowlistRaw?: string | null; modesRaw?: string | null } = {},
) {
  const allowlistRaw = env.allowlistRaw ?? Deno.env.get('FLOOR_INTERNAL_SEND_ALLOWLIST');
  const modesRaw = env.modesRaw ?? Deno.env.get('FLOOR_PLAY_ALLOWLIST_MODES');

  async function loadWorkRequestContext(workRequestId: string) {
    const { data, error } = await supabase
      .from('automation_work_requests')
      .select('play_id, client_ref')
      .eq('id', workRequestId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    let accountEmail: string | null = null;
    const clientRef = data?.client_ref as string | null;
    if (clientRef) {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('email')
        .eq('id', clientRef)
        .maybeSingle();
      if (accountError) throw new Error(accountError.message);
      accountEmail = (account?.email as string | null) ?? null;
    }

    return {
      playId: (data?.play_id as string | null) ?? null,
      accountEmail,
    };
  }

  const assertRecipientOnFile = createAccountOfRecordRecipientGuard({
    modesRaw,
    resolveContext: loadWorkRequestContext,
  });

  const externalGuardFactory = createTier3ExternalRecipientGuard({
    allowlistRaw,
    modesRaw,
    resolvePlayId: async (workRequestId) => {
      const ctx = await loadWorkRequestContext(workRequestId);
      return ctx.playId;
    },
  });

  return {
    assertRecipientOnFile,
    assertExternalRecipientAllowedForWorkRequest: externalGuardFactory,
  };
}
