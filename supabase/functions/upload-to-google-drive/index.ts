import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const GOOGLE_DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY');
    const GOOGLE_DRIVE_FOLDER_ID = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID');

    if (!GOOGLE_DRIVE_API_KEY) {
      throw new Error('GOOGLE_DRIVE_API_KEY not configured');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string || file?.name;
    const accountId = formData.get('accountId') as string;
    const policyId = formData.get('policyId') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    console.log(`Uploading ${fileName} to Google Drive...`);

    // Convert file to ArrayBuffer
    const fileBuffer = await file.arrayBuffer();

    // Create metadata
    const metadata = {
      name: fileName,
      mimeType: file.type,
      ...(GOOGLE_DRIVE_FOLDER_ID && { parents: [GOOGLE_DRIVE_FOLDER_ID] })
    };

    // Create form data for Google Drive
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${file.type}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      btoa(String.fromCharCode(...new Uint8Array(fileBuffer))) +
      closeDelimiter;

    // Upload to Google Drive
    const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GOOGLE_DRIVE_API_KEY}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Google Drive upload error:', errorText);
      throw new Error(`Google Drive upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const driveFile = await uploadResponse.json();
    const driveId = driveFile.id;

    console.log(`File uploaded to Google Drive with ID: ${driveId}`);

    // Store metadata in Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: document, error: dbError } = await supabaseClient
      .from('documents')
      .insert({
        name: fileName,
        filename: fileName,
        kind: 'uploaded',
        google_drive_id: driveId,
        mime_type: file.type,
        file_size: file.size,
        account_id: accountId || null,
        policy_id: policyId || null,
        storage_path: `drive://${driveId}`,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to store metadata: ${dbError.message}`);
    }

    console.log(`Metadata stored in database with ID: ${document.id}`);

    // Trigger AI analysis
    console.log('Triggering AI analysis...');
    
    const analysisResponse = await supabaseClient.functions.invoke('ai-document-analysis', {
      body: {
        documentId: document.id,
        driveId: driveId,
        fileName: fileName,
        accountId: accountId || null,
      }
    });

    if (analysisResponse.error) {
      console.error('Analysis trigger error:', analysisResponse.error);
      // Don't fail the upload if analysis fails - it can be retried
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId: document.id,
        driveId: driveId,
        fileName: fileName,
        analysisTriggered: !analysisResponse.error,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
