import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import pdfParse from 'npm:pdf-parse@1.1.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id, file_name, account_id, user_id } = await req.json();
    
    console.log('========================================');
    console.log('SIMPLE PDF ANALYSIS - START');
    console.log('========================================');
    console.log('File:', file_name);
    console.log('Document ID:', document_id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Update status to processing
    await supabase
      .from('document_analysis')
      .update({ processing_status: 'processing' })
      .eq('document_id', document_id);

    // STEP 1: Download PDF from Supabase Storage
    console.log('----------------------------------------');
    console.log('STEP 1: Downloading PDF from storage');
    console.log('----------------------------------------');
    console.log('Document ID:', document_id);

    // Get the file path from the documents table
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .select('storage_path, storage_bucket')
      .eq('id', document_id)
      .maybeSingle();

    if (docError || !docData) {
      throw new Error(`Could not find document: ${docError?.message || 'Not found'}`);
    }

    console.log('File path:', docData.storage_path);
    console.log('Bucket:', docData.storage_bucket || 'documents');

    const bucketName = docData.storage_bucket || 'documents';
    
    // Create a signed URL (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(docData.storage_path, 3600);

    if (signedUrlError || !signedUrlData) {
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message || 'Unknown error'}`);
    }

    console.log('Signed URL created');

    const pdfResponse = await fetch(signedUrlData.signedUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status} - ${await pdfResponse.text()}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`✅ Downloaded: ${pdfBuffer.byteLength} bytes`);

    // STEP 2: Extract text from ALL pages
    console.log('----------------------------------------');
    console.log('STEP 2: Extracting text from ALL pages');
    console.log('----------------------------------------');

    const pdfData = await pdfParse(Buffer.from(pdfBuffer));
    
    const fullText = pdfData.text;
    const pageCount = pdfData.numpages;

    console.log(`✅ Extracted ${fullText.length} characters from ${pageCount} pages`);
    console.log(`First 500 chars: ${fullText.substring(0, 500)}...`);

    if (fullText.length === 0) {
      throw new Error('No text could be extracted from PDF');
    }

    // STEP 3: AI Analysis with Lovable AI
    console.log('----------------------------------------');
    console.log('STEP 3: Analyzing with Lovable AI');
    console.log('----------------------------------------');

    const analysisPrompt = `You are an expert insurance document analyzer. Analyze this ${pageCount}-page insurance document and extract ALL relevant information.

CRITICAL INSTRUCTIONS:
- This document has ${pageCount} pages
- Search through the ENTIRE document for coverage information
- Coverage details are often on pages 50-72, NOT just the first few pages
- Look for amendments, endorsements, and schedules throughout

FULL DOCUMENT TEXT (ALL ${pageCount} PAGES):
${fullText}

Extract the following information and return as valid JSON:

{
  "policy_number": "string",
  "insured_name": "string or names separated by comma",
  "carrier": "string",
  "document_type": "auto_policy|home_policy|commercial_policy|life_policy|umbrella_policy",
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "coverages": [
    {
      "name": "Coverage name (e.g., Bodily Injury, Property Damage, Comprehensive)",
      "limit": "Coverage limit amount",
      "deductible": "Deductible amount if applicable",
      "premium": "Premium amount if shown"
    }
  ],
  "vehicles": [
    {
      "year": "string",
      "make": "string",
      "model": "string",
      "vin": "string if available"
    }
  ],
  "property": {
    "type": "string (e.g., Single Family, Condo, etc.)",
    "address": "string"
  },
  "premium": {
    "total": "string (total premium amount)",
    "frequency": "monthly|annual|semi-annual|quarterly or null"
  },
  "key_details": [
    "Array of important facts, notes, or special provisions"
  ]
}

COVERAGES TO SEARCH FOR (check ALL pages):
- Bodily Injury (BI)
- Property Damage (PD)
- Personal Injury Protection (PIP)
- Uninsured/Underinsured Motorist (UM/UIM)
- Comprehensive (COMP)
- Collision (COLL)
- Medical Payments (Med Pay)
- Rental Reimbursement
- Roadside Assistance
- Towing
- Any amendments or endorsements
- Additional coverages listed anywhere in the document

Return ONLY the JSON object, no other text.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert insurance document analyzer. Extract data accurately and return valid JSON only.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Lovable AI failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    console.log('AI Response received, parsing JSON...');

    // Parse JSON response
    let analysisResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(aiContent);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('AI returned invalid JSON');
    }

    console.log('✅ Analysis complete');
    console.log('Extracted data:', JSON.stringify(analysisResult, null, 2));

    // STEP 4: Save results
    console.log('----------------------------------------');
    console.log('STEP 4: Saving results to database');
    console.log('----------------------------------------');

    const { error: updateError } = await supabase
      .from('document_analysis')
      .update({
        processing_status: 'completed',
        ocr_text: fullText,
        analysis_result: analysisResult,
        page_count: pageCount,
        processed_at: new Date().toISOString()
      })
      .eq('document_id', document_id);

    if (updateError) {
      console.error('Database update error:', updateError);
      throw updateError;
    }

    console.log('✅ Results saved');
    console.log('========================================');
    console.log('SUCCESS - Analysis Complete');
    console.log('========================================');

    return new Response(
      JSON.stringify({
        success: true,
        document_id,
        page_count: pageCount,
        text_length: fullText.length,
        ocr_text: fullText,
        analysis: analysisResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('========================================');
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
    console.error('========================================');
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
