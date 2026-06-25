import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'
import { requireAuth } from '../_shared/auth.ts'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import {
  getProvisionableAgencyWorkspaceId,
  isStaffAdminRole,
  normalizeAgencyWorkspaceId,
  requireActiveProvisionedAdmin,
  syncAdminUserProvisioning,
  type AdminProfileRole,
} from '../_shared/admin-provisioning.ts'

function workspaceAssignmentRequiredResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: 'Workspace assignment required for staff/admin users',
      code: 'workspace_assignment_required',
      field: 'agencyWorkspaceId',
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

function invalidWorkspaceResponse(corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({
      error: 'agencyWorkspaceId must reference an active agency workspace where the acting admin can provision users',
      code: 'invalid_agency_workspace',
      field: 'agencyWorkspaceId',
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabaseAdmin as any, corsHeaders)
    if (authResult instanceof Response) {
      return authResult // Return 401 if auth failed
    }
    const authenticatedUser = authResult

    // Check if user is an active, provisioned admin. These functions run with
    // service-role privileges after this point, so the actor check must fail closed.
    try {
      await requireActiveProvisionedAdmin(supabaseAdmin, authenticatedUser.id)
    } catch (adminError) {
      console.warn('Admin authorization failed:', adminError)
      return new Response(
        JSON.stringify({ error: 'Forbidden - Active provisioned admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get request body
    const { email, password, fullName, role, agencyWorkspaceId } = await req.json()
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const normalizedFullName = String(fullName || '').trim()
    const selectedRole = (String(role || 'customer').trim() || 'customer') as AdminProfileRole
    const allowedRoles: AdminProfileRole[] = ['customer', 'staff', 'admin']
    const requestedAgencyWorkspaceId = normalizeAgencyWorkspaceId(agencyWorkspaceId)

    if (!normalizedEmail || !password || !normalizedFullName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!allowedRoles.includes(selectedRole)) {
      return new Response(
        JSON.stringify({ error: 'Invalid role selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (isStaffAdminRole(selectedRole)) {
      if (!requestedAgencyWorkspaceId) {
        return workspaceAssignmentRequiredResponse(corsHeaders)
      }

      const provisionableAgencyWorkspaceId = await getProvisionableAgencyWorkspaceId(
        supabaseAdmin,
        requestedAgencyWorkspaceId,
        authenticatedUser.id,
      )
      if (!provisionableAgencyWorkspaceId) {
        return invalidWorkspaceResponse(corsHeaders)
      }
    }

    // Create the user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: normalizedFullName,
      },
    })

    if (createError) {
      throw createError
    }

    let provisioning
    try {
      provisioning = await syncAdminUserProvisioning(supabaseAdmin, {
        userId: newUser.user.id,
        role: selectedRole,
        actorId: authenticatedUser.id,
        agencyWorkspaceId: isStaffAdminRole(selectedRole) ? requestedAgencyWorkspaceId : null,
        active: true,
        requireExplicitAgency: isStaffAdminRole(selectedRole),
      })
    } catch (provisioningError) {
      console.error('Provisioning error:', provisioningError)
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      if (rollbackError) {
        console.error('Failed to roll back auth user after provisioning error:', rollbackError)
      }
      throw provisioningError
    }

    // Upsert profile metadata after Auth creation. A database trigger may have
    // already inserted the profile row, so INSERT can conflict and lose the role.
    // profiles remains canonical for app/admin metadata.
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: newUser.user.id,
          email: normalizedEmail,
          full_name: normalizedFullName,
          role: selectedRole,
          status: 'active',
          is_staff: provisioning.is_staff,
          default_agency_workspace_id: provisioning.agency_workspace_id,
          deleted_at: null,
          deleted_by: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select('id, email, full_name, role, status, is_staff, default_agency_workspace_id')
      .single()

    if (profileError) {
      console.error('Profile upsert error:', profileError)
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      if (rollbackError) {
        console.error('Failed to roll back auth user after profile upsert error:', rollbackError)
      }
      throw profileError
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser.user, profile: profileData, provisioning }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
