// ============================================================================
// CANOPY DOCUMENT PROXY
// ============================================================================
// Proxies document downloads from Canopy API with proper authentication
// This is needed because Canopy document URLs require API auth headers
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
    if (!documentId && req.method === 'POST') {
      try {
        const body = await req.json();
        documentId = body.documentId;
        documentDbId = body.id;
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

    // If we have a database document ID, fetch the document URL from our database
    if (documentDbId && !documentId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: doc } = await supabase
          .from('canopy_documents')
          .select('file_url')
          .eq('id', documentDbId)
          .single();

        if (doc?.file_url) {
          // Extract document ID from URL if it's a Canopy URL
          const match = doc.file_url.match(/documents\/([a-f0-9-]+)\/download/);
          if (match) {
            documentId = match[1];
          }
        }
      }
    }

    if (!documentId) {
      return new Response(JSON.stringify({ error: 'Document ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Canopy Document Proxy] Fetching document: ${documentId}`);

    // Try multiple URL patterns - Canopy API might use different formats
    const urlPatterns = [
      // Pattern 1: teams/{teamId}/documents/{docId}/download
      `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${documentId}/download`,
      // Pattern 2: documents/{docId}/download (no team)
      `https://app.usecanopy.com/api/v1.0.0/documents/${documentId}/download`,
      // Pattern 3: teams/{teamId}/documents/{docId} (no /download suffix)
      `https://app.usecanopy.com/api/v1.0.0/teams/${canopyTeamId}/documents/${documentId}`,
    ];

    let canopyResponse: Response | null = null;
    let lastError = '';

    for (const canopyUrl of urlPatterns) {
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

        console.log(`[Canopy Document Proxy] Response status: ${response.status}, content-type: ${response.headers.get('Content-Type')}`);

        if (response.ok) {
          canopyResponse = response;
          console.log(`[Canopy Document Proxy] Success with URL: ${canopyUrl}`);
          break;
        } else {
          lastError = await response.text();
          console.log(`[Canopy Document Proxy] Failed (${response.status}): ${lastError.substring(0, 200)}`);
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
        details: lastError.substring(0, 500),
        documentId: documentId,
        teamId: canopyTeamId,
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get content type from response
    const contentType = canopyResponse.headers.get('Content-Type') || 'application/pdf';
    const contentDisposition = canopyResponse.headers.get('Content-Disposition');

    console.log(`[Canopy Document Proxy] Success - Content-Type: ${contentType}`);

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
