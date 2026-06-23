import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'
import { requireAuth } from '../_shared/auth.ts'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

type AdminUserAction = 'edit' | 'status' | 'notes' | 'soft_delete'
type UserStatus = 'active' | 'disabled' | 'banned'

const ALLOWED_ROLES = ['customer', 'staff', 'admin']
const ALLOWED_STATUSES: UserStatus[] = ['active', 'disabled', 'banned']

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

    const authResult = await requireAuth(req, supabaseAdmin, corsHeaders)
    if (authResult instanceof Response) {
      return authResult
    }
    const authenticatedUser = authResult

    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, email')
      .eq('id', authenticatedUser.id)
      .single()

    if (actorProfile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const userId = String(body.userId || '').trim()
    const action = String(body.action || '').trim() as AdminUserAction

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

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    let actionDetails: Record<string, unknown> = {}

    if (action === 'edit') {
      const fullName = String(body.fullName || '').trim()
      const role = String(body.role || '').trim()

      if (!fullName || !role) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: fullName and role' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!ALLOWED_ROLES.includes(role)) {
        const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single()

        if (currentProfileError) {
          throw currentProfileError
        }

        if (currentProfile?.role !== role) {
          return new Response(
            JSON.stringify({ error: 'Invalid role selected' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
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
      actionDetails = { soft_delete: true }
    }

    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', userId)
      .select('id, email, full_name, role, status, admin_notes, deleted_at, deleted_by, updated_at')
      .single()

    if (updateError) {
      throw updateError
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
      action_details: actionDetails,
    })

    if (auditError) {
      console.warn('Failed to write admin audit log:', auditError)
    }

    return new Response(
      JSON.stringify({ success: true, user: updatedProfile }),
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
