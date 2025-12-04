import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentRecord {
  id: string;
  account_id: string;
  storage_path: string;
  storage_bucket?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { account_id } = await req.json();

    if (!account_id) {
      return new Response(
        JSON.stringify({ error: 'account_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Checking document integrity for account:', account_id);

    // Fetch all documents for this account
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, account_id, storage_path, storage_bucket')
      .eq('account_id', account_id);

    if (fetchError) {
      console.error('Error fetching documents:', fetchError);
      throw fetchError;
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No documents to check', checked: 0, missing: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Checking ${documents.length} documents...`);

    const buckets = ['customer-docs', 'documents'];
    const results: Array<{ id: string; missing: boolean; bucket?: string }> = [];

    for (const doc of documents as DocumentRecord[]) {
      let found = false;
      let foundBucket: string | undefined;

      // Try each bucket
      for (const bucket of buckets) {
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .list(doc.account_id, {
              search: doc.storage_path.split('/').pop() || '',
            });

          if (!error && data && data.length > 0) {
            // File exists in this bucket
            found = true;
            foundBucket = bucket;
            console.log(`✓ Found: ${doc.storage_path} in ${bucket}`);
            break;
          }
        } catch (err: unknown) {
          console.error(`Error checking ${bucket}:`, err);
        }
      }

      results.push({
        id: doc.id,
        missing: !found,
        bucket: foundBucket,
      });

      // Update document record
      await supabase
        .from('documents')
        .update({
          file_missing: !found,
          last_checked_at: new Date().toISOString(),
          storage_bucket: foundBucket || null,
        })
        .eq('id', doc.id);
    }

    const missingCount = results.filter((r) => r.missing).length;

    console.log(`Integrity check complete. ${missingCount} of ${documents.length} files missing.`);

    return new Response(
      JSON.stringify({
        message: 'Integrity check complete',
        checked: documents.length,
        missing: missingCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in check-document-integrity:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
