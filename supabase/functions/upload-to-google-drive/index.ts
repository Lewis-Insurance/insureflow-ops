import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY');
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
    const fileBlob = new Blob([fileBuffer], { type: file.type });

    // Upload to Google Drive using resumable upload
    const metadata = {
      name: fileName,
      mimeType: file.type,
    };

    // Step 1: Initiate resumable upload session
    const initiateResponse = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&key=${GOOGLE_DRIVE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      console.error('Google Drive initiate error:', errorText);
      throw new Error(`Failed to initiate upload: ${initiateResponse.status}`);
    }

    const uploadUrl = initiateResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('No upload URL received from Google Drive');
    }

    // Step 2: Upload the file content
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: fileBlob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Google Drive upload error:', errorText);
      throw new Error(`Failed to upload file: ${uploadResponse.status}`);
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
        google_drive_id: driveId,
        mime_type: file.type,
        file_size: file.size,
        account_id: accountId || null,
        policy_id: policyId || null,
        storage_path: `google-drive://${driveId}`,
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
        googleDriveId: driveId,
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
        googleDriveId: driveId,
        fileName: fileName,
        analysisTriggered: !analysisResponse.error,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
