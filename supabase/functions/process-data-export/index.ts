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

    // Process export in background
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
    console.log(`Starting export process for user ${userId}, request ${requestId}, type ${requestType}`);
    
    let exportData: any = {}

    // Gather data based on request type
    if (requestType === 'profile' || requestType === 'full') {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

        exportData.profile = profile
        console.log('Profile data gathered:', !!profile);
      } catch (profileError) {
        console.error('Error fetching profile:', profileError);
        exportData.profile = null;
      }
    }

    if (requestType === 'accounts' || requestType === 'full') {
      try {
        // Get accounts the user has access to via memberships
        const { data: accounts } = await supabase
          .from('accounts')
          .select(`
            *,
            account_memberships!inner(
              user_id,
              role
            )
          `)
          .eq('account_memberships.user_id', userId)
          .order('created_at', { ascending: false })

        exportData.accounts = accounts || [];
        console.log('Accounts data gathered:', accounts?.length || 0);
      } catch (accountsError) {
        console.error('Error fetching accounts:', accountsError);
        exportData.accounts = [];
      }
    }

    if (requestType === 'contacts' || requestType === 'full') {
      try {
        // Get contacts from accounts the user has access to
        const { data: contacts } = await supabase
          .from('contacts')
          .select(`
            *,
            account:accounts!inner(
              id,
              name,
              account_memberships!inner(
                user_id,
                role
              )
            )
          `)
          .eq('account.account_memberships.user_id', userId)
          .order('created_at', { ascending: false })

        exportData.contacts = contacts || [];
        console.log('Contacts data gathered:', contacts?.length || 0);
      } catch (contactsError) {
        console.error('Error fetching contacts:', contactsError);
        exportData.contacts = [];
      }
    }

    if (requestType === 'policies' || requestType === 'full') {
      try {
        // Get policies from accounts the user has access to
        const { data: policies } = await supabase
          .from('policies')
          .select(`
            *,
            account:accounts!inner(
              id,
              name,
              account_memberships!inner(
                user_id,
                role
              )
            ),
            carrier:carriers(id, name)
          `)
          .eq('account.account_memberships.user_id', userId)
          .order('created_at', { ascending: false })

        exportData.policies = policies || [];
        console.log('Policies data gathered:', policies?.length || 0);
      } catch (policiesError) {
        console.error('Error fetching policies:', policiesError);
        exportData.policies = [];
      }
    }

    if (requestType === 'audit_logs' || requestType === 'full') {
      try {
        // Get audit logs - only if user is staff/admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, is_staff')
          .eq('id', userId)
          .single()

        if (profile?.is_staff || profile?.role === 'admin' || profile?.role === 'staff') {
          const { data: auditLogs } = await supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000) // Limit for performance

          exportData.audit_logs = auditLogs || [];
          console.log('Audit logs data gathered:', auditLogs?.length || 0);
        } else {
          exportData.audit_logs = [];
          console.log('User not authorized for audit logs');
        }
      } catch (auditError) {
        console.error('Error fetching audit logs:', auditError);
        exportData.audit_logs = [];
      }
    }

    // Add metadata
    exportData.metadata = {
      exported_at: new Date().toISOString(),
      request_type: requestType,
      user_id: userId,
      format: 'json',
      total_records: Object.values(exportData).filter(Array.isArray).reduce((sum: number, arr: any) => sum + arr.length, 0)
    }

    console.log('Export data prepared, total records:', exportData.metadata.total_records);

    // Convert to JSON
    const jsonData = JSON.stringify(exportData, null, 2)
    const fileName = `${userId}-${requestType}-export-${Date.now()}.json`

    console.log('Uploading to storage:', fileName);

    // Upload to storage
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

    console.log('Upload successful, creating signed URL');

    // Generate signed URL (24 hour expiry)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('exports')
      .createSignedUrl(fileName, 24 * 60 * 60) // 24 hours

    if (urlError) {
      console.error('Error creating signed URL:', urlError);
      throw urlError;
    }

    console.log('Signed URL created, updating request status');

    // Update export request with completion
    const { error: updateError } = await supabase
      .from('data_export_requests')
      .update({
        status: 'completed',
        export_url: signedUrlData?.signedUrl,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        completed_at: new Date().toISOString()
      })
      .eq('id', requestId)

    if (updateError) {
      console.error('Error updating request status:', updateError);
      throw updateError;
    }

    console.log(`Export completed successfully for user ${userId}, request ${requestId}`)
  } catch (error) {
    console.error('Error processing export:', error)
    
    // Mark as failed
    try {
      await supabase
        .from('data_export_requests')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString()
        })
        .eq('id', requestId)
    } catch (updateError) {
      console.error('Error updating failed status:', updateError);
    }
  }
}