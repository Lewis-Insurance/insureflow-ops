/**
 * Shared authentication utilities for Supabase Edge Functions
 *
 * Provides reusable functions for verifying user authentication and authorization
 * to prevent unauthorized access to edge functions.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  accountId?: string;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: string | null;
}

/**
 * Verifies the user's JWT token and returns the authenticated user
 *
 * @param req - The incoming HTTP request
 * @param supabase - Supabase client (optional, will create if not provided)
 * @returns AuthResult with user data or error
 */
export async function verifyAuth(
  req: Request,
  supabase?: SupabaseClient
): Promise<AuthResult> {
  try {
    // Get auth token from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        user: null,
        error: 'Missing or invalid Authorization header'
      };
    }

    const token = authHeader.replace('Bearer ', '');

    // Create Supabase client if not provided
    const client = supabase || createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the JWT token
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return {
        user: null,
        error: authError?.message || 'Invalid or expired token'
      };
    }

    // Get user's account membership (if applicable)
    const { data: membership } = await client
      .from('account_memberships')
      .select('account_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    return {
      user: {
        id: user.id,
        email: user.email,
        accountId: membership?.account_id
      },
      error: null
    };
  } catch (error: unknown) {
    return {
      user: null,
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
  }
}

/**
 * Middleware to require authentication for an edge function
 * Returns a 401 response if authentication fails
 *
 * @param req - The incoming HTTP request
 * @param supabase - Supabase client
 * @param corsHeaders - CORS headers to include in error response
 * @returns AuthenticatedUser if successful, or Response with 401 error
 */
export async function requireAuth(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<AuthenticatedUser | Response> {
  const { user, error } = await verifyAuth(req, supabase);

  if (error || !user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized: ' + (error || 'Authentication required')
      }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  return user;
}

/**
 * Verifies that the authenticated user has access to a specific resource
 *
 * @param supabase - Supabase client
 * @param userId - The authenticated user's ID
 * @param resourceType - Type of resource (e.g., 'lead', 'policy', 'account')
 * @param resourceId - ID of the resource to check access for
 * @returns true if user has access, false otherwise
 */
export async function verifyResourceAccess(
  supabase: SupabaseClient,
  userId: string,
  resourceType: 'lead' | 'policy' | 'account' | 'quote',
  resourceId: string
): Promise<boolean> {
  try {
    // Get user's account membership
    const { data: membership } = await supabase
      .from('account_memberships')
      .select('account_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership?.account_id) {
      return false;
    }

    // Check if resource belongs to user's account
    const { data, error } = await supabase
      .from(resourceType === 'lead' ? 'leads' : resourceType === 'policy' ? 'policies' : resourceType === 'quote' ? 'quotes' : 'accounts')
      .select('account_id')
      .eq('id', resourceId)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    // For accounts, check direct ID match
    if (resourceType === 'account') {
      return resourceId === membership.account_id;
    }

    // For other resources, check if account_id matches
    return data.account_id === membership.account_id;
  } catch (error: unknown) {
    console.error('Resource access verification failed:', error);
    return false;
  }
}
