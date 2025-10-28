import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRRequest {
  document_url: string;
  document_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_url, document_id }: OCRRequest = await req.json();
    
    console.log('[OCR] Processing document:', document_url);

    // Get Google Vision API key
    const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    if (!apiKey) {
      throw new Error('GOOGLE_CLOUD_VISION_API_KEY not configured');
    }

    // Download the document
    const docResponse = await fetch(document_url);
    if (!docResponse.ok) {
      throw new Error(`Failed to download document: ${docResponse.statusText}`);
    }

    const docBuffer = await docResponse.arrayBuffer();
    const base64Doc = btoa(String.fromCharCode(...new Uint8Array(docBuffer)));

    console.log('[OCR] Calling Google Vision API...');

    // Call Google Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Doc },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }]
        })
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('[OCR] Vision API error:', errorText);
      throw new Error(`Vision API error: ${errorText}`);
    }

    const visionData = await visionResponse.json();
    
    // Extract text
    const fullText = visionData.responses[0]?.fullTextAnnotation?.text || '';
    
    if (!fullText) {
      throw new Error('No text extracted from document');
    }

    console.log('[OCR] Extracted text length:', fullText.length);

    // Store in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error: dbError } = await supabase
      .from('ocr_results')
      .insert({
        document_id,
        document_url,
        extracted_text: fullText,
        confidence: visionData.responses[0]?.fullTextAnnotation?.pages?.[0]?.confidence || 0,
        processed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      console.error('[OCR] Database error:', dbError);
      throw dbError;
    }

    console.log('[OCR] Successfully stored OCR result:', data.id);

    return new Response(
      JSON.stringify({ 
        success: true,
        text: fullText,
        text_length: fullText.length,
        result_id: data.id
      }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[OCR] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
