// ============================================================================
// HAVEN POLICY FEED - Edge Function
// ============================================================================
// The provider endpoint Haven's InsureFlow receiver polls. The receiver's
// transport (Circle-of-Life, src/lib/insurance/insureflow/transport.ts) pins
// this exact path and request shape:
//
//   GET /functions/v1/haven-policy-feed?after=<decimal>&limit=<1..100>
//   Authorization: Bearer hvn_<64 hex>
//   Accept: application/json
//
// It follows no redirects, sends no browser credentials, caps the response at
// 3 MiB and demands `content-type: application/json` with a {success, data}
// wrapper. Anything else it treats as a transport failure and keeps its existing
// cursor, so this function must be boring and exact rather than helpful.
//
// 401 is the only status that carries meaning to the reader: it stops claiming
// and marks the credential rejected. Every other failure must look like a plain
// error so the reader preserves its state and retries.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN_PATTERN = /^hvn_[a-f0-9]{64}$/;
const CURSOR_PATTERN = /^(0|[1-9][0-9]{0,18})$/;
const MAX_CURSOR = 9223372036854775807n;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  // This is a machine feed read by a server. No browser should ever cache,
  // share or embed it.
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: JSON_HEADERS,
  });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req) => {
  // Deliberately no CORS handling. A browser has no business reading this, and
  // advertising it to one would be the wrong signal.
  if (req.method !== 'GET') return fail(405, 'method_not_allowed');

  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!TOKEN_PATTERN.test(token)) return fail(401, 'unauthorized');

  const url = new URL(req.url);
  const after = url.searchParams.get('after') ?? '0';
  const limitRaw = url.searchParams.get('limit') ?? '100';

  // Reject unknown query parameters outright. The reader only ever sends these
  // two, so anything else is not the reader.
  for (const key of url.searchParams.keys()) {
    if (key !== 'after' && key !== 'limit') return fail(400, 'invalid_request');
  }
  if (!CURSOR_PATTERN.test(after) || BigInt(after) > MAX_CURSOR) return fail(400, 'invalid_request');
  if (!/^[1-9][0-9]?$|^100$/.test(limitRaw)) return fail(400, 'invalid_request');

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // The token is never stored, only its digest, so the lookup is by hash.
    const tokenHash = await sha256Hex(token);
    const { data: integration, error: integrationError } = await supabase
      .from('haven_feed_integrations')
      .select('id, enabled, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (integrationError) {
      console.error('[haven-policy-feed] integration lookup failed', integrationError.message);
      return fail(500, 'server_error');
    }
    // Unknown, disabled and revoked are one answer to the caller. Telling them
    // apart would tell an attacker which tokens exist.
    if (!integration || !integration.enabled || integration.revoked_at) {
      return fail(401, 'unauthorized');
    }

    const { data, error } = await supabase.rpc('haven_policy_feed', {
      p_integration_id: integration.id,
      p_after: Number(after),
      p_limit: Number(limitRaw),
    });

    if (error) {
      // Never echo the database message: it can name policies and accounts, and
      // the reader is required to treat any non-401 failure identically anyway.
      console.error('[haven-policy-feed] feed build failed', error.message);
      return fail(500, 'server_error');
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (err) {
    console.error('[haven-policy-feed] unhandled', err instanceof Error ? err.message : 'unknown');
    return fail(500, 'server_error');
  }
});
