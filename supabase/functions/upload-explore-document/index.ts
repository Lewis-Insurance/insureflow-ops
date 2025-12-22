/**
 * Upload Explore Document Edge Function
 * 
 * Handles document uploads for the Explore Insurance Document module.
 * Creates session if needed, stores file, and triggers async processing.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UploadRequest {
  session_id?: string; // Existing session or create new
  account_id?: string;
  policy_id?: string;
  doc_role?: string; // 'A', 'B', 'policy', 'quote', etc.
  doc_type_hint?: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_base64?: string; // For direct upload
  storage_path?: string; // If already uploaded to storage
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body: UploadRequest = await req.json();
    const {
      session_id,
      account_id,
      policy_id,
      doc_role,
      doc_type_hint,
      file_name,
      file_type,
      file_size,
      file_base64,
      storage_path: existingStoragePath,
    } = body;

    console.log(`[upload-explore-document] User ${user.id} uploading ${file_name}`);

    // Get or create session
    let currentSessionId = session_id;
    
    if (!currentSessionId) {
      // Create new session
      const { data: newSession, error: sessionError } = await supabase
        .from('explore_sessions')
        .insert({
          created_by: user.id,
          account_id: account_id || null,
          policy_id: policy_id || null,
          title: `Explore: ${file_name}`,
          status: 'pending',
        })
        .select()
        .single();

      if (sessionError) {
        console.error('[upload-explore-document] Failed to create session:', sessionError);
        return new Response(
          JSON.stringify({ error: `Failed to create session: ${sessionError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      currentSessionId = newSession.id;
      console.log(`[upload-explore-document] Created new session: ${currentSessionId}`);
    }

    // Handle file storage
    let storagePath = existingStoragePath;
    
    if (!storagePath && file_base64) {
      // Upload file to Supabase Storage
      const fileBuffer = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
      const uniqueFileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${file_name}`;
      storagePath = `explore/${currentSessionId}/${uniqueFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, fileBuffer, {
          contentType: file_type,
          upsert: false,
        });

      if (uploadError) {
        console.error('[upload-explore-document] Storage upload failed:', uploadError);
        return new Response(
          JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[upload-explore-document] File uploaded to storage: ${storagePath}`);
    }

    // Create document record
    const { data: docRecord, error: docError } = await supabase
      .from('explore_documents')
      .insert({
        session_id: currentSessionId,
        storage_provider: 'supabase',
        storage_path: storagePath,
        storage_bucket: 'documents',
        filename: file_name,
        mime_type: file_type,
        file_size: file_size,
        doc_role: doc_role || null,
        doc_type_hint: doc_type_hint || null,
        status: 'uploading',
        attempt_count: 0,
      })
      .select()
      .single();

    if (docError) {
      console.error('[upload-explore-document] Failed to create document record:', docError);
      return new Response(
        JSON.stringify({ error: `Failed to create document record: ${docError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[upload-explore-document] Document record created: ${docRecord.id}`);

    // Update document status to processing
    await supabase
      .from('explore_documents')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', docRecord.id);

    // Trigger async processing (call process-explore-document edge function)
    // For now, we'll let the client poll for status
    // In production, you'd use a queue or background worker
    try {
      const processResponse = await fetch(
        `${supabaseUrl}/functions/v1/process-explore-document`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            document_id: docRecord.id,
            session_id: currentSessionId,
          }),
        }
      );

      if (!processResponse.ok) {
        console.warn('[upload-explore-document] Processing trigger failed, client will retry');
      }
    } catch (processError) {
      console.warn('[upload-explore-document] Processing trigger error:', processError);
      // Processing will be retried by client polling
    }

    return new Response(
      JSON.stringify({
        success: true,
        session_id: currentSessionId,
        document_id: docRecord.id,
        storage_path: storagePath,
        status: 'processing',
        message: 'Document uploaded and processing started',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[upload-explore-document] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

