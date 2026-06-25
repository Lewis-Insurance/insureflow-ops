import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'
import { requireAuth } from '../_shared/auth.ts'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'
import {
  getProvisionableAgencyWorkspaceId,
  getValidDefaultAgencyWorkspaceId,
  isStaffAdminRole,
  normalizeAgencyWorkspaceId,
  requireActiveProvisionedAdmin,
  syncAdminUserProvisioning,
  type AdminProfileRole,
  type AdminProvisioningResult,
} from '../_shared/admin-provisioning.ts'

type AdminUserAction = 'edit' | 'status' | 'notes' | 'soft_delete'
type UserStatus = 'active' | 'disabled' | 'banned'

const ALLOWED_ROLES: AdminProfileRole[] = ['customer', 'staff', 'admin']
const ALLOWED_STATUSES: UserStatus[] = ['active', 'disabled', 'banned']

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
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const origin = req.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

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

    const authResult = await requireAuth(req, supabaseAdmin as any, corsHeaders)
    if (authResult instanceof Response) {
      return authResult
    }
    const authenticatedUser = authResult

    let actorProfile
    try {
      actorProfile = await requireActiveProvisionedAdmin(supabaseAdmin, authenticatedUser.id)
    } catch (adminError) {
      console.warn('Admin authorization failed:', adminError)
      return new Response(
        JSON.stringify({ error: 'Forbidden - Active provisioned admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const userId = String(body.userId || '').trim()
    const action = String(body.action || '').trim() as AdminUserAction
    const requestedAgencyWorkspaceId = normalizeAgencyWorkspaceId(body.agencyWorkspaceId)

    if (!userId || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId and action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['edit', 'status', 'notes', 'soft_delete'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid user action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (userId === authenticatedUser.id && ['status', 'soft_delete'].includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Admins cannot disable, ban, or delete their own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, status, deleted_at, is_staff, default_agency_workspace_id')
      .eq('id', userId)
      .single()

    if (currentProfileError) {
      throw currentProfileError
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    let actionDetails: Record<string, unknown> = {}
    let provisioning: AdminProvisioningResult | null = null
    let deprovisionAfterProfileUpdate = false

    if (action === 'edit') {
      const fullName = String(body.fullName || '').trim()
      const role = String(body.role || '').trim() as AdminProfileRole

      if (!fullName || !role) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: fullName and role' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!ALLOWED_ROLES.includes(role)) {
        return new Response(
          JSON.stringify({ error: 'Invalid role selected' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const targetProfileActive = String(currentProfile.status || 'active') === 'active' && !currentProfile.deleted_at

      if (isStaffAdminRole(role) && targetProfileActive) {
        let agencyWorkspaceIdForProvisioning = requestedAgencyWorkspaceId

        if (agencyWorkspaceIdForProvisioning) {
          const provisionableAgencyWorkspaceId = await getProvisionableAgencyWorkspaceId(
            supabaseAdmin,
            agencyWorkspaceIdForProvisioning,
            authenticatedUser.id,
          )
          if (!provisionableAgencyWorkspaceId) {
            return invalidWorkspaceResponse(corsHeaders)
          }
          agencyWorkspaceIdForProvisioning = provisionableAgencyWorkspaceId
        } else {
          agencyWorkspaceIdForProvisioning = await getValidDefaultAgencyWorkspaceId(
            supabaseAdmin,
            userId,
            currentProfile.default_agency_workspace_id,
          )
        }

        if (!agencyWorkspaceIdForProvisioning) {
          return workspaceAssignmentRequiredResponse(corsHeaders)
        }

        provisioning = await syncAdminUserProvisioning(supabaseAdmin, {
          userId,
          role,
          actorId: authenticatedUser.id,
          agencyWorkspaceId: agencyWorkspaceIdForProvisioning,
          active: true,
          requireExplicitAgency: true,
        })
        update.is_staff = true
        update.default_agency_workspace_id = provisioning.agency_workspace_id
      } else {
        update.is_staff = false
        update.default_agency_workspace_id = null
        deprovisionAfterProfileUpdate = true
      }

      update.full_name = fullName
      update.role = role
      actionDetails = { full_name: fullName, role }
    }

    if (action === 'status') {
      const status = String(body.status || '').trim() as UserStatus

      if (!ALLOWED_STATUSES.includes(status)) {
        return new Response(
          JSON.stringify({ error: 'Invalid status selected' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      update.status = status

      if (status === 'active' && currentProfile.deleted_at) {
        return new Response(
          JSON.stringify({ error: 'Cannot reactivate a soft-deleted user via status update' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (status === 'active' && isStaffAdminRole(String(currentProfile.role))) {
        let agencyWorkspaceIdForProvisioning = requestedAgencyWorkspaceId

        if (agencyWorkspaceIdForProvisioning) {
          const provisionableAgencyWorkspaceId = await getProvisionableAgencyWorkspaceId(
            supabaseAdmin,
            agencyWorkspaceIdForProvisioning,
            authenticatedUser.id,
          )
          if (!provisionableAgencyWorkspaceId) {
            return invalidWorkspaceResponse(corsHeaders)
          }
          agencyWorkspaceIdForProvisioning = provisionableAgencyWorkspaceId
        } else {
          agencyWorkspaceIdForProvisioning = await getValidDefaultAgencyWorkspaceId(
            supabaseAdmin,
            userId,
            currentProfile.default_agency_workspace_id,
          )
        }

        if (!agencyWorkspaceIdForProvisioning) {
          return workspaceAssignmentRequiredResponse(corsHeaders)
        }

        provisioning = await syncAdminUserProvisioning(supabaseAdmin, {
          userId,
          role: currentProfile.role as AdminProfileRole,
          actorId: authenticatedUser.id,
          agencyWorkspaceId: agencyWorkspaceIdForProvisioning,
          active: true,
          requireExplicitAgency: true,
        })
        update.is_staff = true
        update.default_agency_workspace_id = provisioning.agency_workspace_id
      }

      if (status !== 'active') {
        update.is_staff = false
        update.default_agency_workspace_id = null
        deprovisionAfterProfileUpdate = true
      }

      actionDetails = { status }
    }

    if (action === 'notes') {
      const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes : ''
      update.admin_notes = adminNotes
      actionDetails = { has_notes: Boolean(adminNotes.trim()) }
    }

    if (action === 'soft_delete') {
      update.deleted_at = new Date().toISOString()
      update.deleted_by = authenticatedUser.id
      update.status = 'disabled'
      update.is_staff = false
      update.default_agency_workspace_id = null
      deprovisionAfterProfileUpdate = true
      actionDetails = { soft_delete: true }
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select('id, email, full_name, role, status, is_staff, default_agency_workspace_id, admin_notes, deleted_at, deleted_by, updated_at')
      .single()

    if (updateError) {
      throw updateError
    }

    if (deprovisionAfterProfileUpdate) {
      provisioning = await syncAdminUserProvisioning(supabaseAdmin, {
        userId,
        role: ALLOWED_ROLES.includes(String(updatedProfile.role) as AdminProfileRole)
          ? updatedProfile.role as AdminProfileRole
          : 'customer',
        actorId: authenticatedUser.id,
        active: false,
      })
    }

    const auditAction = action === 'status'
      ? `user_${String(update.status)}`
      : action === 'soft_delete'
        ? 'user_deleted'
        : action === 'notes'
          ? 'user_notes_updated'
          : 'user_updated'

    const { error: auditError } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: authenticatedUser.id,
      actor_role: actorProfile.role,
      actor_email: actorProfile.email || authenticatedUser.email || null,
      action_type: auditAction,
      resource_type: 'user',
      resource_id: userId,
      action_details: {
        ...actionDetails,
        provisioning: provisioning ?? undefined,
      },
    })

    if (auditError) {
      console.warn('Failed to write admin audit log:', auditError)
    }

    return new Response(
      JSON.stringify({ success: true, user: updatedProfile, provisioning }),
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
