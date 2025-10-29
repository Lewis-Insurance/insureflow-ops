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
    const DROPBOX_ACCESS_TOKEN = Deno.env.get('DROPBOX_ACCESS_TOKEN');
    if (!DROPBOX_ACCESS_TOKEN) {
      throw new Error('DROPBOX_ACCESS_TOKEN not configured');
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileName = formData.get('fileName') as string || file?.name;
    const accountId = formData.get('accountId') as string;
    const policyId = formData.get('policyId') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    console.log(`Uploading ${fileName} to Dropbox...`);

    // Convert file to ArrayBuffer
    const fileBuffer = await file.arrayBuffer();
    
    // Upload to Dropbox
    const dropboxPath = `/LEWI AI/${fileName}`;
    const uploadResponse = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DROPBOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: dropboxPath,
          mode: 'add',
          autorename: true,
          mute: false,
        }),
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Dropbox upload error:', errorText);
      throw new Error(`Failed to upload file: ${uploadResponse.status}`);
    }

    const dropboxFile = await uploadResponse.json();
    const dropboxId = dropboxFile.id;

    console.log(`File uploaded to Dropbox with ID: ${dropboxId}`);

    // Store metadata in Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: document, error: dbError } = await supabaseClient
      .from('documents')
      .insert({
        name: fileName,
        dropbox_id: dropboxId,
        mime_type: file.type,
        file_size: file.size,
        account_id: accountId || null,
        policy_id: policyId || null,
        storage_path: `dropbox://${dropboxId}`,
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
        dropboxId: dropboxId,
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
        dropboxId: dropboxId,
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
