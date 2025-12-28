/**
 * Cron Authentication Utility
 *
 * Verifies that scheduled/cron requests come from a trusted source.
 * This prevents public access to scheduled actions even with the anon key.
 *
 * Usage in edge functions:
 *   import { verifyCronSecret } from '../_shared/cron-auth.ts';
 *
 *   // At start of scheduled action handler:
 *   const cronError = verifyCronSecret(req);
 *   if (cronError) return cronError;
 */

import { getCorsHeaders } from './cors.ts';

const CRON_SECRET_HEADER = 'X-Cron-Secret';

/**
 * Verify the cron secret header matches the expected value.
 *
 * @param req - The incoming request
 * @returns Response if verification fails, null if verified
 */
export function verifyCronSecret(req: Request): Response | null {
  const cronSecret = Deno.env.get('CRON_SECRET');

  // If no secret is configured, allow in development but warn
  if (!cronSecret) {
    const isDev = Deno.env.get('ENVIRONMENT') !== 'production';
    if (isDev) {
      console.warn('[CRON-AUTH] CRON_SECRET not configured - allowing request in development');
      return null;
    }
    // In production, reject if secret not configured
    console.error('[CRON-AUTH] CRON_SECRET not configured in production');
    return new Response(
      JSON.stringify({ error: 'Cron authentication not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const providedSecret = req.headers.get(CRON_SECRET_HEADER);

  if (!providedSecret) {
    console.warn('[CRON-AUTH] Missing cron secret header');
    return new Response(
      JSON.stringify({ error: 'Unauthorized - missing cron authentication' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(providedSecret, cronSecret)) {
    console.warn('[CRON-AUTH] Invalid cron secret provided');
    return new Response(
      JSON.stringify({ error: 'Unauthorized - invalid cron authentication' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return null; // Verification passed
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generate headers for pg_cron calls.
 * Use this when setting up cron jobs in migrations.
 *
 * Example migration SQL:
 *   SELECT cron.schedule(
 *     'job-name',
 *     '* /5 * * * *',
 *     $$
 *     SELECT net.http_post(
 *       url := 'https://PROJECT.supabase.co/functions/v1/my-function',
 *       headers := jsonb_build_object(
 *         'Content-Type', 'application/json',
 *         'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key'),
 *         'X-Cron-Secret', current_setting('app.cron_secret')
 *       ),
 *       body := '{}'::jsonb
 *     );
 *     $$
 *   );
 */
export const CRON_HEADER_NAME = CRON_SECRET_HEADER;
