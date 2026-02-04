/**
 * CORS configuration for Supabase Edge Functions
 *
 * Restricts cross-origin requests to authorized domains only.
 */

// Allowed origins - production and development
const ALLOWED_ORIGINS = [
  'https://lewisinsurance.ai',
  'https://www.lewisinsurance.ai',
  'https://lewisinsurance.netlify.app',
  // Customer portal website
  'https://lewisinsurance.com',
  'https://www.lewisinsurance.com',
];

// Add development origins if not in production
const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV') || 'development';
if (env === 'development' || env === 'local') {
  ALLOWED_ORIGINS.push(
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:3001',  // Next.js portal dev
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001'
  );
}

/**
 * Get CORS headers for a specific origin
 * Returns headers with the origin if it's in the allowed list,
 * otherwise returns the first allowed origin (will fail CORS check)
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle CORS preflight request
 * Returns a Response for OPTIONS requests, null otherwise
 */
export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin');
  const headers = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }

  return null;
}

/**
 * Legacy export for backwards compatibility
 * @deprecated Use getCorsHeaders() instead for proper origin checking
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
