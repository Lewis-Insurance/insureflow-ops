/**
 * Upload Explore Document Edge Function
 * 
 * ALIGNED WITH EXISTING SCHEMA:
 * - Creates/updates document_extractions record
 * - Triggers process-explore-document for embedding generation
 * - Works with existing upload flows (upload-to-google-drive or direct storage)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';

interface UploadRequest {
  // Option A: Create new extraction from URL
  document_url?: string;
  document_name?: string;
  
  // Option B: Reference existing document_extractions record
  extraction_id?: string;
  
  // Option C: Upload file directly
  file_base64?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  
  // Common fields
  account_id?: string;
  document_type?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    // Parse request
    const body: UploadRequest = await req.json();
    const {
      document_url,
      document_name,
      extraction_id: existingExtractionId,
      file_base64,
      file_name,
      file_type,
      file_size,
      account_id,
      document_type,
    } = body;

    let extractionId = existingExtractionId;
    let documentUrl = document_url;
    let docName = document_name || file_name || 'Unknown';

    console.log(`[upload-explore-document] User ${user.id} - processing ${docName}`);

    // Option A: Use existing extraction_id - just trigger processing
    if (extractionId) {
      console.log(`[upload-explore-document] Using existing extraction: ${extractionId}`);
    }
    // Option B: Upload file directly and create extraction
    else if (file_base64) {
      // Upload to storage
      const fileName = file_name || `document-${Date.now()}.pdf`;
      const storagePath = `explore/${user.id}/${Date.now()}-${fileName}`;
      
      const fileBuffer = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, fileBuffer, {
          contentType: file_type || 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        return new Response(
          JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      documentUrl = publicUrl;
      docName = fileName;
      
      console.log(`[upload-explore-document] Uploaded to: ${storagePath}`);
    }

    // Create document_extractions record if we don't have one
    if (!extractionId && documentUrl) {
      const { data: extraction, error: extractionError } = await supabase
        .from('document_extractions')
        .insert({
          document_url: documentUrl,
          document_name: docName,
          document_type: document_type || 'unknown',
          file_size_bytes: file_size || null,
          account_id: account_id || null,
          status: 'pending',
          created_by: user.id,
          embedding_status: 'pending',
        })
        .select()
        .single();

      if (extractionError) {
        return new Response(
          JSON.stringify({ error: `Failed to create extraction: ${extractionError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      extractionId = extraction.id;
      console.log(`[upload-explore-document] Created extraction: ${extractionId}`);
    }

    if (!extractionId) {
      return new Response(
        JSON.stringify({ error: 'Must provide extraction_id, document_url, or file_base64' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trigger async processing
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
            extraction_id: extractionId,
          }),
        }
      );

      if (!processResponse.ok) {
        console.warn('[upload-explore-document] Processing trigger failed, client will poll');
      }
    } catch (processError) {
      console.warn('[upload-explore-document] Processing trigger error:', processError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        extraction_id: extractionId,
        document_url: documentUrl,
        document_name: docName,
        status: 'processing',
        message: 'Document uploaded and embedding generation started',
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

