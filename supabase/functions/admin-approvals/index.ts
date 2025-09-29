import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ApprovalRequest {
  action: 'approve' | 'deny'
  request_type: 'email' | 'role'
  request_id: string
  reason?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get user from JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Check if user is admin
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { action, request_type, request_id, reason }: ApprovalRequest = await req.json()

    if (request_type === 'email') {
      return await handleEmailChangeApproval(supabaseClient, user.id, action, request_id, reason)
    } else if (request_type === 'role') {
      return await handleRoleChangeApproval(supabaseClient, user.id, action, request_id, reason)
    } else {
      return new Response(JSON.stringify({ error: 'Invalid request type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } catch (error) {
    console.error('Error in admin-approvals function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function handleEmailChangeApproval(
  supabase: any, 
  adminId: string, 
  action: string, 
  requestId: string, 
  reason?: string
) {
  try {
    // Get the email change request
    const { data: request, error: fetchError } = await supabase
      .from('email_change_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single()

    if (fetchError || !request) {
      return new Response(JSON.stringify({ error: 'Request not found or already processed' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const status = action === 'approve' ? 'approved' : 'denied'
    
    // Update the request
    const { error: updateError } = await supabase
      .from('email_change_requests')
      .update({
        status,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        review_reason: reason
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating email change request:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to update request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'approve') {
      // In production, you would update the user's email in auth.users
      // This requires admin API access or service key
      console.log(`Would update email for user ${request.user_id} to ${request.requested_email}`)
    }

    // Log the action
    await supabase.rpc('create_detailed_audit_log', {
      p_entity_type: 'email_change_request',
      p_entity_id: requestId,
      p_action: `${action}_email_change`,
      p_changed_fields: { status, reviewed_by: adminId },
      p_metadata: { reason, target_user: request.user_id }
    })

    return new Response(JSON.stringify({ 
      ok: true, 
      message: `Email change request ${action}d successfully` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error handling email approval:', error)
    return new Response(JSON.stringify({ error: 'Failed to process approval' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}

async function handleRoleChangeApproval(
  supabase: any, 
  adminId: string, 
  action: string, 
  requestId: string, 
  reason?: string
) {
  try {
    // Get the role change request
    const { data: request, error: fetchError } = await supabase
      .from('role_change_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single()

    if (fetchError || !request) {
      return new Response(JSON.stringify({ error: 'Request not found or already processed' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const status = action === 'approve' ? 'approved' : 'denied'
    
    // Update the request
    const { error: updateError } = await supabase
      .from('role_change_requests')
      .update({
        status,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        review_reason: reason
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating role change request:', updateError)
      return new Response(JSON.stringify({ error: 'Failed to update request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'approve') {
      // Update the user's role
      const { error: roleUpdateError } = await supabase
        .from('profiles')
        .update({ role: request.requested_role })
        .eq('id', request.user_id)

      if (roleUpdateError) {
        console.error('Error updating user role:', roleUpdateError)
        return new Response(JSON.stringify({ error: 'Failed to update user role' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Log the action
    await supabase.rpc('create_detailed_audit_log', {
      p_entity_type: 'role_change_request',
      p_entity_id: requestId,
      p_action: `${action}_role_change`,
      p_changed_fields: { status, reviewed_by: adminId },
      p_metadata: { reason, target_user: request.user_id, new_role: request.requested_role }
    })

    return new Response(JSON.stringify({ 
      ok: true, 
      message: `Role change request ${action}d successfully` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error handling role approval:', error)
    return new Response(JSON.stringify({ error: 'Failed to process approval' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}