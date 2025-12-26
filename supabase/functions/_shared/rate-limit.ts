/**
 * Rate limiting utilities for Supabase Edge Functions
 *
 * Implements rate limiting to prevent abuse of functions like SMS and email sending.
 * Uses Supabase database to track request counts.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
  /** Identifier type for rate limiting */
  keyType: 'user' | 'ip' | 'account';
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  error?: string;
}

/**
 * Default rate limits for different function types
 */
export const RATE_LIMITS = {
  sms: { maxRequests: 10, windowSeconds: 60, keyType: 'user' as const },
  email: { maxRequests: 20, windowSeconds: 60, keyType: 'user' as const },
  ai: { maxRequests: 30, windowSeconds: 60, keyType: 'user' as const },
  default: { maxRequests: 100, windowSeconds: 60, keyType: 'user' as const },
};

/**
 * Check if a request is within rate limits
 *
 * @param supabase - Supabase client with service role key
 * @param functionName - Name of the function being rate limited
 * @param identifier - User ID, IP address, or account ID
 * @param config - Rate limit configuration
 * @returns RateLimitResult indicating if request is allowed
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  functionName: string,
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.default
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - config.windowSeconds * 1000);
  const key = `${functionName}:${config.keyType}:${identifier}`;

  try {
    // Count requests in the current window
    const { count, error: countError } = await supabase
      .from('rate_limit_log')
      .select('*', { count: 'exact', head: true })
      .eq('rate_key', key)
      .gte('created_at', windowStart.toISOString());

    if (countError) {
      // If table doesn't exist or other error, allow the request but log
      console.warn('Rate limit check failed:', countError.message);
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
        error: 'Rate limit check failed, allowing request'
      };
    }

    const currentCount = count || 0;
    const remaining = Math.max(0, config.maxRequests - currentCount);
    const resetAt = new Date(now.getTime() + config.windowSeconds * 1000);

    if (currentCount >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        error: `Rate limit exceeded. Try again after ${resetAt.toISOString()}`
      };
    }

    // Log this request
    await supabase
      .from('rate_limit_log')
      .insert({
        rate_key: key,
        function_name: functionName,
        identifier,
        identifier_type: config.keyType,
      });

    return {
      allowed: true,
      remaining: remaining - 1,
      resetAt
    };
  } catch (error: unknown) {
    console.error('Rate limit error:', error);
    // On error, allow the request to prevent blocking legitimate users
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: new Date(now.getTime() + config.windowSeconds * 1000),
      error: 'Rate limit system error'
    };
  }
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  headers: Record<string, string>,
  result: RateLimitResult,
  config: RateLimitConfig
): Record<string, string> {
  return {
    ...headers,
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
  };
}

/**
 * Create a 429 Too Many Requests response
 */
export function rateLimitExceededResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response {
  const headers = addRateLimitHeaders(corsHeaders, result, RATE_LIMITS.default);
  headers['Content-Type'] = 'application/json';
  headers['Retry-After'] = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString();

  return new Response(
    JSON.stringify({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: result.resetAt.toISOString(),
    }),
    {
      status: 429,
      headers,
    }
  );
}
