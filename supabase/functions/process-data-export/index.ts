import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DataExportRequest {
  request_type: 'profile' | 'activity' | 'full'
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

    const { request_type }: DataExportRequest = await req.json()

    // Check for existing recent request (24h throttle)
    const { data: recentRequest } = await supabaseClient
      .from('data_export_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('request_type', request_type)
      .gte('requested_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentRequest) {
      return new Response(JSON.stringify({ error: 'Export request limit reached. Please wait 24 hours.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create export request
    const { data: exportRequest, error: createError } = await supabaseClient
      .from('data_export_requests')
      .insert({
        user_id: user.id,
        request_type,
        status: 'processing'
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating export request:', createError)
      return new Response(JSON.stringify({ error: 'Failed to create export request' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Process export in background - Deno will handle this asynchronously
    processExport(supabaseClient, user.id, exportRequest.id, request_type).catch(console.error)

    return new Response(JSON.stringify({ success: true, request_id: exportRequest.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Error in process-data-export function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function processExport(supabase: any, userId: string, requestId: string, requestType: string) {
  try {
    let exportData: any = {}

    // Gather data based on request type
    if (requestType === 'profile' || requestType === 'full') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      exportData.profile = profile
    }

    if (requestType === 'activity' || requestType === 'full') {
      const { data: accessLogs } = await supabase
        .from('profile_access_logs')
        .select('*')
        .eq('target_user_id', userId)
        .order('created_at', { ascending: false })

      const { data: sessions } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      exportData.activity = {
        access_logs: accessLogs,
        sessions: sessions
      }
    }

    if (requestType === 'full') {
      // Add other related data for full export
      const { data: emailRequests } = await supabase
        .from('email_change_requests')
        .select('*')
        .eq('user_id', userId)

      const { data: roleRequests } = await supabase
        .from('role_change_requests')
        .select('*')
        .eq('user_id', userId)

      const { data: phoneVerifications } = await supabase
        .from('phone_verification_codes')
        .select('phone_number, verified, created_at')
        .eq('user_id', userId)

      exportData.change_requests = {
        email_changes: emailRequests,
        role_changes: roleRequests
      }
      exportData.phone_verifications = phoneVerifications
    }

    // Add metadata
    exportData.metadata = {
      exported_at: new Date().toISOString(),
      request_type: requestType,
      user_id: userId,
      format: 'json'
    }

    // Convert to JSON
    const jsonData = JSON.stringify(exportData, null, 2)
    const fileName = `${userId}-${requestType}-export-${Date.now()}.json`

    // Upload to storage (in production, you'd use a proper cloud storage service)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('exports')
      .upload(fileName, new Blob([jsonData], { type: 'application/json' }), {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Error uploading export:', uploadError)
      throw uploadError
    }

    // Generate signed URL (24 hour expiry)
    const { data: signedUrl } = await supabase.storage
      .from('exports')
      .createSignedUrl(fileName, 24 * 60 * 60) // 24 hours

    // Update export request with completion
    await supabase
      .from('data_export_requests')
      .update({
        status: 'completed',
        export_url: signedUrl?.signedUrl,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        completed_at: new Date().toISOString()
      })
      .eq('id', requestId)

    console.log(`Export completed for user ${userId}, request ${requestId}`)
  } catch (error) {
    console.error('Error processing export:', error)
    
    // Mark as failed
    await supabase
      .from('data_export_requests')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString()
      })
      .eq('id', requestId)
  }
}