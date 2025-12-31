// ============================================================================
// CANOPY DOCUMENT PROXY
// ============================================================================
// Proxies document downloads from Canopy API with proper authentication
// Uses the file_url stored from Canopy's API response
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Get document ID from query params or body
    const url = new URL(req.url);
    let documentId = url.searchParams.get('documentId');
    let documentDbId = url.searchParams.get('id'); // Our internal document ID

    // Also support POST body
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        documentId = body.documentId || documentId;
        documentDbId = body.id || documentDbId;
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Get Canopy API credentials
    const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
    const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
    const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');

    if (!canopyClientId || !canopyClientSecret || !canopyTeamId) {
      console.error('[Canopy Document Proxy] Missing credentials:', {
        hasClientId: !!canopyClientId,
        hasClientSecret: !!canopyClientSecret,
        hasTeamId: !!canopyTeamId,
      });
      return new Response(JSON.stringify({
        error: 'Canopy API not configured',
        missing: {
          clientId: !canopyClientId,
          clientSecret: !canopyClientSecret,
          teamId: !canopyTeamId,
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Canopy Document Proxy] Credentials configured - teamId: ${canopyTeamId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the document from our database to get the Canopy URL
    let storedFileUrl: string | null = null;
    let canopyDocId: string | null = documentId;

    if (documentDbId) {
      console.log(`[Canopy Document Proxy] Looking up document by DB ID: ${documentDbId}`);
      const { data: doc, error } = await supabase
        .from('canopy_documents')
        .select('file_url, canopy_document_id')
        .eq('id', documentDbId)
        .single();

      if (error) {
        console.error('[Canopy Document Proxy] DB lookup error:', error);
      } else if (doc) {
        storedFileUrl = doc.file_url;
        canopyDocId = doc.canopy_document_id || canopyDocId;
        console.log(`[Canopy Document Proxy] Found doc - URL: ${storedFileUrl}, Canopy ID: ${canopyDocId}`);
      }
    }

    if (!storedFileUrl && !canopyDocId) {
      return new Response(JSON.stringify({ error: 'Document not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Canopy Document Proxy] Fetching document: ${canopyDocId || 'via stored URL'}`);

    // Build list of URLs to try
    const urlsToTry: string[] = [];

    // First priority: Use the stored URL from Canopy (most reliable)
    if (storedFileUrl) {
      urlsToTry.push(storedFileUrl);
    }

    // Fallback patterns using document ID
    if (canopyDocId) {
      urlsToTry.push(
        `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${canopyDocId}/download`,
        `https://app.usecanopy.com/api/v1.0.0/documents/${canopyDocId}/download`,
        `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${canopyDocId}`,
      );
    }

    let canopyResponse: Response | null = null;
    let lastError = '';
    let successUrl = '';

    for (const canopyUrl of urlsToTry) {
      console.log(`[Canopy Document Proxy] Trying URL: ${canopyUrl}`);

      try {
        const response = await fetch(canopyUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/pdf, image/*, application/octet-stream, */*',
            'x-canopy-client-id': canopyClientId,
            'x-canopy-client-secret': canopyClientSecret,
          },
        });

        const contentType = response.headers.get('Content-Type') || '';
        console.log(`[Canopy Document Proxy] Response status: ${response.status}, content-type: ${contentType}`);

        // Check if we got HTML instead of a document (Canopy login page redirect)
        if (contentType.includes('text/html')) {
          lastError = 'Received HTML instead of document - authentication may have failed';
          console.log(`[Canopy Document Proxy] Got HTML response, skipping this URL`);
          continue;
        }

        if (response.ok) {
          canopyResponse = response;
          successUrl = canopyUrl;
          console.log(`[Canopy Document Proxy] Success with URL: ${canopyUrl}`);
          break;
        } else {
          const responseText = await response.text();
          // Check if error is JSON
          try {
            const errorJson = JSON.parse(responseText);
            lastError = JSON.stringify(errorJson);
          } catch {
            lastError = responseText.substring(0, 200);
          }
          console.log(`[Canopy Document Proxy] Failed (${response.status}): ${lastError}`);
        }
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError.message : 'Fetch failed';
        console.error(`[Canopy Document Proxy] Fetch error: ${lastError}`);
      }
    }

    if (!canopyResponse || !canopyResponse.ok) {
      console.error(`[Canopy Document Proxy] All URL patterns failed. Last error: ${lastError}`);
      return new Response(JSON.stringify({
        error: 'Failed to fetch document from Canopy',
        details: lastError,
        documentId: canopyDocId,
        teamId: canopyTeamId,
        triedUrls: urlsToTry.length,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get content type from response
    const contentType = canopyResponse.headers.get('Content-Type') || 'application/pdf';
    const contentDisposition = canopyResponse.headers.get('Content-Disposition');

    console.log(`[Canopy Document Proxy] Success - Content-Type: ${contentType}, URL: ${successUrl}`);

    // Stream the document back to the client
    const documentBody = await canopyResponse.arrayBuffer();

    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
    };

    // Preserve content disposition if present
    if (contentDisposition) {
      responseHeaders['Content-Disposition'] = contentDisposition;
    }

    return new Response(documentBody, {
      status: 200,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('[Canopy Document Proxy] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
