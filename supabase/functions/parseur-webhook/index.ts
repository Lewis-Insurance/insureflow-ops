import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('========================================');
    console.log('PARSEUR WEBHOOK - START');
    console.log('========================================');
    console.log('Method:', req.method);
    console.log('Headers:', Object.fromEntries(req.headers.entries()));

    // Initialize Supabase client with service role key (for inserting data)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse the incoming webhook payload from Parseur
    const payload = await req.json();
    
    console.log('Received payload:', JSON.stringify(payload, null, 2));

    // Extract key fields from Parseur payload
    // Parseur typically sends: document_id, file_name, parsed_data, etc.
    const {
      document_id,
      file_name,
      document_type,
      source_url,
      account_id,
      ...parsedData
    } = payload;

    console.log('Extracted fields:');
    console.log('- Document ID:', document_id);
    console.log('- File name:', file_name);
    console.log('- Document type:', document_type);
    console.log('- Source URL:', source_url);
    console.log('- Account ID:', account_id);

    // Insert the parsed document into the database
    const { data, error } = await supabase
      .from('parsed_documents')
      .insert({
        parseur_document_id: document_id,
        file_name: file_name || 'unknown',
        document_type: document_type || 'general',
        source_url: source_url,
        account_id: account_id || null,
        parsed_data: parsedData, // Store all remaining fields as JSONB
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw new Error(`Failed to insert document: ${error.message}`);
    }

    console.log('✅ Document stored successfully');
    console.log('Database ID:', data.id);
    console.log('========================================');
    console.log('PARSEUR WEBHOOK - SUCCESS');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Document parsed and stored successfully',
        document_id: data.id,
        parseur_document_id: document_id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('========================================');
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
    console.error('========================================');

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
