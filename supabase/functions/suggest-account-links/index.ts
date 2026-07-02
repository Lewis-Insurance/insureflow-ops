/**
 * Suggest Account Links Edge Function
 *
 * Nightly pass that proposes account relationships from signals already in the
 * data (shared phone/address, surname-business, business-email-name, spouse name).
 * It NEVER auto-commits: every proposal lands in account_relationship_suggestions
 * with status 'pending' for a human to confirm in one click.
 *
 * The heavy lifting is a single set-based SQL function so the whole book is
 * processed in one fast, idempotent statement.
 *
 * Authentication: Requires X-Cron-Secret header (matches CRON_SECRET).
 * Self-contained (no shared imports) so it deploys as a single file.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Constant-time comparison to avoid timing attacks on the cron secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // Scheduled job: gate on the cron secret (no public access).
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const provided = req.headers.get('X-Cron-Secret');
    if (!provided || !timingSafeEqual(provided, cronSecret)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const started = Date.now();
    const { data, error } = await supabase.rpc('generate_relationship_suggestions');

    if (error) {
      console.error('[suggest-account-links] rpc error', error.message);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    console.log('[suggest-account-links] done', JSON.stringify(data), `${Date.now() - started}ms`);
    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[suggest-account-links] unhandled', message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
