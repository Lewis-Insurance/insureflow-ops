import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  let documentId: string | null = null;

  try {
    const { 
      document_url, 
      document_id, 
      file_name,
      account_id,
      user_id 
    } = await req.json();
    documentId = document_id;

    console.log('[Document Analysis] Starting:', file_name);

    // Initialize Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create initial record
    const normalizedAccountId = account_id && String(account_id).trim() !== '' ? account_id : null;
    const { data: analysisRecord, error: insertError } = await supabase
      .from('document_analysis')
      .insert({
        document_id,
        file_name,
        account_id: normalizedAccountId,
        created_by: user_id,
        processing_status: 'pending'
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Document Analysis] Insert error:', insertError);
      throw insertError;
    }

    // Step 1: OCR with Google Vision
    console.log('[OCR] Starting Google Vision OCR...');
    
    const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    if (!GOOGLE_VISION_API_KEY) {
      throw new Error('GOOGLE_CLOUD_VISION_API_KEY not configured');
    }

    // Extract path from URL (remove the base URL part)
    const urlPath = document_url.split('/storage/v1/object/public/')[1];
    if (!urlPath) {
      throw new Error('Invalid document URL format');
    }

    // Download document using Supabase client
    const { data: docData, error: downloadError } = await supabase.storage
      .from(urlPath.split('/')[0]) // bucket name
      .download(urlPath.split('/').slice(1).join('/')); // file path

    if (downloadError || !docData) {
      console.error('[Download] Error:', downloadError);
      throw new Error(`Failed to download document: ${downloadError?.message || 'Unknown error'}`);
    }

    const docBuffer = await docData.arrayBuffer();
    
    // Convert to base64 in chunks to avoid stack overflow on large files
    const uint8Array = new Uint8Array(docBuffer);
    const chunkSize = 8192;
    let binaryString = '';
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64Doc = btoa(binaryString);

    // Call Google Vision API (use files:annotate for PDFs)
    const isPdf = file_name?.toLowerCase().endsWith('.pdf');
    const visionEndpoint = isPdf
      ? `https://vision.googleapis.com/v1/files:annotate?key=${GOOGLE_VISION_API_KEY}`
      : `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;

    const visionBody = isPdf
      ? {
          requests: [{
            inputConfig: { content: base64Doc, mimeType: 'application/pdf' },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }]
        }
      : {
          requests: [{
            image: { content: base64Doc },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: { languageHints: ['en'] }
          }]
        };

    const visionResponse = await fetch(visionEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visionBody)
    });

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      throw new Error(`Vision API error: ${visionResponse.status} - ${errorText}`);
    }

    const visionData = await visionResponse.json();
    const ocrText = visionData.responses[0]?.fullTextAnnotation?.text || '';
    
    if (!ocrText || ocrText.length < 50) {
      throw new Error('OCR extracted insufficient text from document');
    }

    console.log(`[OCR] Extracted ${ocrText.length} characters`);

    // Step 2: Parse with Gemini AI
    console.log('[AI] Parsing with Gemini...');
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an insurance document parser. Extract structured data from insurance policies and quotes.

Return ONLY valid JSON with this exact structure:
{
  "carrier_name": "string or null",
  "policy_number": "string or null",
  "policy_type": "auto|home|commercial|life|umbrella|other or null",
  "insured_name": "string or null",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "total_premium": number or null,
  "payment_frequency": "annual|semi-annual|quarterly|monthly or null",
  "coverages": [
    {
      "type": "string",
      "limit": "string",
      "deductible": "string or null",
      "premium": number or null
    }
  ],
  "insured_items": [
    {
      "type": "vehicle|property|business",
      "year": number or null,
      "make": "string or null",
      "model": "string or null",
      "vin": "string or null",
      "address": "string or null"
    }
  ],
  "confidence_score": number (0-100)
}`
          },
          {
            role: 'user',
            content: `Parse this insurance document and extract all information. Be thorough and accurate.

DOCUMENT TEXT:
${ocrText}

Return ONLY the JSON object, no other text.`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Rate limit exceeded. Please try again later.' 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'AI credits exhausted. Please add credits to continue.' 
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      throw new Error(`AI API error: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const parsedData = JSON.parse(aiData.choices[0].message.content);

    console.log('[AI] Parsing complete:', parsedData.carrier_name || 'Unknown carrier');

    // Step 3: Update database with parsed data
    const { data: updatedRecord, error: updateError } = await supabase
      .from('document_analysis')
      .update({
        carrier_name: parsedData.carrier_name,
        policy_number: parsedData.policy_number,
        policy_type: parsedData.policy_type,
        insured_name: parsedData.insured_name,
        effective_date: parsedData.effective_date,
        expiration_date: parsedData.expiration_date,
        total_premium: parsedData.total_premium,
        payment_frequency: parsedData.payment_frequency,
        coverages: parsedData.coverages || [],
        insured_items: parsedData.insured_items || [],
        raw_ocr_text: ocrText,
        confidence_score: parsedData.confidence_score || 85,
        processing_status: 'complete',
        updated_at: new Date().toISOString()
      })
      .eq('id', analysisRecord.id)
      .select()
      .single();

    if (updateError) {
      console.error('[Database] Update error:', updateError);
      throw updateError;
    }

    console.log('[Document Analysis] Complete:', updatedRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: updatedRecord.id,
        data: updatedRecord
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Document Analysis] Error:', error);
    
    // Try to update record with error using the documentId captured earlier
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      if (documentId) {
        await supabase
          .from('document_analysis')
          .update({
            processing_status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date().toISOString()
          })
          .eq('document_id', documentId);
      }
    } catch (dbError) {
      console.error('[Database] Failed to log error:', dbError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
