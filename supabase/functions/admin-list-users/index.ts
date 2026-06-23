import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2'
import { requireAuth } from '../_shared/auth.ts'
import { getCorsHeaders, handleCors } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Create a Supabase client with the service role key
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
    const authResult = await requireAuth(req, supabaseAdmin, corsHeaders)
    if (authResult instanceof Response) {
      return authResult // Return 401 if auth failed
    }
    const authenticatedUser = authResult

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', authenticatedUser.id)
      .single()

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // List all Auth users. Auth is canonical for identity/email/existence.
    const authUsers: any[] = []
    const perPage = 1000
    let page = 1

    while (true) {
      const { data: authData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      })

      if (listError) {
        throw listError
      }

      const users = authData.users || []
      authUsers.push(...users)

      if (users.length < perPage) break
      page += 1
    }

    // Get profile/admin metadata. profiles is canonical for app/admin metadata.
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, status, last_seen_at, created_at, updated_at, admin_notes, deleted_at, deleted_by')

    if (profilesError) {
      throw profilesError
    }

    const profileById = new Map((profiles || []).map((p: any) => [p.id, p]))

    // Combine Auth and profile data into the single admin list shape used by the UI.
    const combinedUsers = authUsers.map((authUser: any) => {
      const profile = profileById.get(authUser.id)
      const email = authUser.email || profile?.email || ''

      return {
        id: authUser.id,
        email,
        full_name: profile?.full_name || authUser.user_metadata?.full_name || email || 'No Name',
        role: profile?.role || 'customer',
        status: profile?.status || 'active',
        last_seen_at: profile?.last_seen_at || authUser.last_sign_in_at || null,
        created_at: profile?.created_at || authUser.created_at,
        updated_at: profile?.updated_at || authUser.updated_at || null,
        admin_notes: profile?.admin_notes || null,
        deleted_at: profile?.deleted_at || null,
        deleted_by: profile?.deleted_by || null,
        auth_created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at || null,
        email_confirmed_at: authUser.email_confirmed_at || null,
      }
    })

    return new Response(
      JSON.stringify({ users: combinedUsers }),
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
