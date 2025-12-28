/**
 * Agency-Aware Authentication Utilities
 *
 * Extends base auth with agency workspace membership verification.
 * Use this for any endpoint that operates on agency-scoped data.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface AgencyAuthenticatedUser {
  id: string;
  email?: string;
  agencyWorkspaceIds: string[];
  defaultAgencyId?: string;
  isStaff: boolean;
}

export interface AgencyAuthResult {
  user: AgencyAuthenticatedUser | null;
  error: string | null;
  statusCode: number;
}

/**
 * Verifies user authentication AND loads their agency memberships
 */
export async function verifyAgencyAuth(
  req: Request,
  supabase?: SupabaseClient
): Promise<AgencyAuthResult> {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        user: null,
        error: 'Missing or invalid Authorization header',
        statusCode: 401
      };
    }

    const token = authHeader.replace('Bearer ', '');

    const client = supabase || createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify JWT
    const { data: { user }, error: authError } = await client.auth.getUser(token);

    if (authError || !user) {
      return {
        user: null,
        error: authError?.message || 'Invalid or expired token',
        statusCode: 401
      };
    }

    // Get user's agency memberships
    const { data: memberships, error: membershipError } = await client
      .from('agency_workspace_memberships')
      .select('agency_workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (membershipError) {
      console.error('Failed to fetch memberships:', membershipError);
      return {
        user: null,
        error: 'Failed to verify agency membership',
        statusCode: 500
      };
    }

    // Get user profile for default agency and staff status
    const { data: profile } = await client
      .from('profiles')
      .select('default_agency_workspace_id, is_staff')
      .eq('id', user.id)
      .single();

    const agencyWorkspaceIds = memberships?.map(m => m.agency_workspace_id) || [];

    return {
      user: {
        id: user.id,
        email: user.email,
        agencyWorkspaceIds,
        defaultAgencyId: profile?.default_agency_workspace_id,
        isStaff: profile?.is_staff || false
      },
      error: null,
      statusCode: 200
    };
  } catch (error: unknown) {
    console.error('Agency auth error:', error);
    return {
      user: null,
      error: error instanceof Error ? error.message : 'Authentication failed',
      statusCode: 500
    };
  }
}

/**
 * Middleware that requires authentication and returns 401 if not authenticated
 */
export async function requireAgencyAuth(
  req: Request,
  supabase: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<AgencyAuthenticatedUser | Response> {
  const { user, error, statusCode } = await verifyAgencyAuth(req, supabase);

  if (error || !user) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized: ' + (error || 'Authentication required')
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  return user;
}

/**
 * Verifies user has membership in a specific agency
 */
export function verifyAgencyMembership(
  user: AgencyAuthenticatedUser,
  agencyWorkspaceId: string
): boolean {
  if (!agencyWorkspaceId) return false;
  return user.agencyWorkspaceIds.includes(agencyWorkspaceId);
}

/**
 * Middleware that requires membership in a specific agency
 * Returns 403 Forbidden if user is not a member
 */
export function requireAgencyMembership(
  user: AgencyAuthenticatedUser,
  agencyWorkspaceId: string,
  corsHeaders: Record<string, string>
): Response | null {
  if (!verifyAgencyMembership(user, agencyWorkspaceId)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Forbidden: You are not a member of this agency'
      }),
      {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  return null;
}

/**
 * Verifies user has admin/owner role in a specific agency
 */
export async function verifyAgencyAdmin(
  supabase: SupabaseClient,
  userId: string,
  agencyWorkspaceId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('agency_workspace_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('agency_workspace_id', agencyWorkspaceId)
    .eq('status', 'active')
    .single();

  if (error || !data) return false;
  return ['owner', 'admin'].includes(data.role);
}

/**
 * For public endpoints: verifies a tokenized link
 * Used for NPS surveys, review requests, unsubscribe links, etc.
 */
export interface TokenPayload {
  type: 'nps_survey' | 'review_request' | 'unsubscribe' | 'portal_invite';
  resourceId: string;
  agencyWorkspaceId: string;
  contactId?: string;
  expiresAt: number;
}

export async function verifyPublicToken(
  supabase: SupabaseClient,
  token: string,
  expectedType: TokenPayload['type']
): Promise<{ valid: boolean; payload?: TokenPayload; error?: string }> {
  try {
    // Tokens are stored in a simple token table
    const { data, error } = await supabase
      .from('public_access_tokens')
      .select('*')
      .eq('token', token)
      .eq('type', expectedType)
      .single();

    if (error || !data) {
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Check expiration
    if (new Date(data.expires_at) < new Date()) {
      return { valid: false, error: 'Token has expired' };
    }

    // Check if already used (for one-time tokens)
    if (data.used_at && data.single_use) {
      return { valid: false, error: 'Token has already been used' };
    }

    return {
      valid: true,
      payload: {
        type: data.type,
        resourceId: data.resource_id,
        agencyWorkspaceId: data.agency_workspace_id,
        contactId: data.contact_id,
        expiresAt: new Date(data.expires_at).getTime()
      }
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
}

/**
 * Creates a public access token for tokenized links
 */
export async function createPublicToken(
  supabase: SupabaseClient,
  payload: Omit<TokenPayload, 'expiresAt'> & { expiresInHours?: number; singleUse?: boolean }
): Promise<{ token: string; expiresAt: Date } | null> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (payload.expiresInHours || 72));

    // Generate secure random token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const { error } = await supabase
      .from('public_access_tokens')
      .insert({
        token,
        type: payload.type,
        resource_id: payload.resourceId,
        agency_workspace_id: payload.agencyWorkspaceId,
        contact_id: payload.contactId,
        expires_at: expiresAt.toISOString(),
        single_use: payload.singleUse ?? false
      });

    if (error) {
      console.error('Failed to create token:', error);
      return null;
    }

    return { token, expiresAt };
  } catch (error) {
    console.error('Token creation error:', error);
    return null;
  }
}
