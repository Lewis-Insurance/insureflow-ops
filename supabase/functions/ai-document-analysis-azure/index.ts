import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Smart page selection for insurance documents
const IMPORTANT_KEYWORDS = [
  'DECLARATIONS', 'DECLARATION', 'DEC PAGE',
  'COVERAGE', 'COVERAGES', 'LIMITS', 'PREMIUM', 'DEDUCTIBLE',
  'SCHEDULE', 'POLICY SCHEDULE', 'SUMMARY',
  'INSURED', 'VEHICLE', 'PROPERTY', 'LIABILITY'
];

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
      user_id,
      focus_region = 'smart',
      page_range
    } = await req.json();
    
    documentId = document_id;

    console.log('[Azure Document Analysis] Starting:', file_name);

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

    // Step 1: Get document from storage
    console.log('[Azure OCR] Fetching document from storage...');
    
    const { data: downloadData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(document_url.split('/documents/')[1]);

    if (downloadError) throw downloadError;

    const fileBuffer = await downloadData.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);
    const base64File = base64Encode(uint8Array);

    // Step 2: Start OCR with Azure Document Intelligence
    console.log('[Azure OCR] Starting Document Intelligence...');
    
    const AZURE_ENDPOINT = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT');
    const AZURE_API_KEY = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY');
    
    if (!AZURE_ENDPOINT || !AZURE_API_KEY) {
      throw new Error('Azure Document Intelligence credentials not configured');
    }

    // Start analysis
    const analyzeResponse = await fetch(
      `${AZURE_ENDPOINT}/formrecognizer/documentModels/prebuilt-layout:analyze?api-version=2024-02-29-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        },
        body: JSON.stringify({
          base64Source: base64File
        })
      }
    );

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`Azure OCR failed: ${analyzeResponse.status} - ${errorText}`);
    }

    const operationLocation = analyzeResponse.headers.get('Operation-Location');
    if (!operationLocation) {
      throw new Error('No operation location returned from Azure');
    }

    // Poll for results
    console.log('[Azure OCR] Polling for results...');
    let ocrResult;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const resultResponse = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_API_KEY,
        }
      });

      const result = await resultResponse.json();
      
      if (result.status === 'succeeded') {
        ocrResult = result;
        break;
      } else if (result.status === 'failed') {
        throw new Error('Azure OCR failed: ' + JSON.stringify(result.error));
      }
      
      attempts++;
    }

    if (!ocrResult) {
      throw new Error('Azure OCR timed out after 2 minutes');
    }

    console.log(`[Azure OCR] Success! Extracted ${ocrResult.analyzeResult.pages?.length || 0} pages`);

    // Step 3: ENHANCED PAGE SELECTION
    const allPages = ocrResult.analyzeResult.pages || [];
    const totalPages = allPages.length;
    console.log(`[Page Selection] Document has ${totalPages} pages, focus_region: ${focus_region}`);

    let selectedPageText = '';
    let importantPageIndices: number[] = [];
    let selectionMethod = '';
    
    if (totalPages <= 10) {
      // Small doc: use all pages
      console.log('[Page Selection] Small document, using all pages');
      selectedPageText = ocrResult.analyzeResult.content || '';
      selectionMethod = 'all_pages';
    } else {
      // Large doc: apply focus region logic
      console.log(`[Page Selection] Large document (${totalPages} pages), using focus region: ${focus_region}`);
      
      let pagesToProcess: any[] = [];
      
      switch (focus_region) {
        case 'smart':
          // Smart keyword detection
          const scanPages = allPages.slice(0, Math.min(20, totalPages));
          scanPages.forEach((page: any, index: number) => {
            const pageText = (page.lines || [])
              .map((line: any) => line.content || '')
              .join(' ')
              .toUpperCase();
            
            const hasKeyword = IMPORTANT_KEYWORDS.some(keyword => 
              pageText.includes(keyword)
            );
            
            if (hasKeyword) {
              importantPageIndices.push(index);
            }
          });
          
          if (importantPageIndices.length > 0) {
            pagesToProcess = importantPageIndices
              .slice(0, 10)
              .map(index => allPages[index]);
            selectionMethod = `smart_${importantPageIndices.length}_keywords`;
          } else {
            pagesToProcess = allPages.slice(0, 10);
            selectionMethod = 'smart_fallback_first_10';
          }
          break;
          
        case 'front':
          pagesToProcess = allPages.slice(0, 10);
          selectionMethod = 'front_10_pages';
          break;
          
        case 'middle':
          const middleStart = Math.floor(totalPages / 2) - 5;
          pagesToProcess = allPages.slice(middleStart, middleStart + 10);
          selectionMethod = 'middle_10_pages';
          break;
          
        case 'end':
          pagesToProcess = allPages.slice(-10);
          selectionMethod = 'end_10_pages';
          break;
          
        case 'first_third':
          const firstThirdEnd = Math.ceil(totalPages / 3);
          pagesToProcess = allPages.slice(0, Math.min(firstThirdEnd, 10));
          selectionMethod = `first_third_${pagesToProcess.length}_pages`;
          break;
          
        case 'middle_third':
          const thirdSize = Math.ceil(totalPages / 3);
          const middleThirdStart = thirdSize;
          pagesToProcess = allPages.slice(middleThirdStart, Math.min(middleThirdStart + 10, middleThirdStart + thirdSize));
          selectionMethod = `middle_third_${pagesToProcess.length}_pages`;
          break;
          
        case 'last_third':
          const lastThirdStart = Math.floor(totalPages * 2 / 3);
          pagesToProcess = allPages.slice(lastThirdStart, Math.min(lastThirdStart + 10, totalPages));
          selectionMethod = `last_third_${pagesToProcess.length}_pages`;
          break;
          
        case 'custom':
          if (page_range && typeof page_range === 'string') {
            // Parse custom range like "5-15" or "1,3,5,7"
            if (page_range.includes('-')) {
              const [start, end] = page_range.split('-').map((n: string) => parseInt(n.trim()));
              const startIdx = Math.max(0, start - 1);
              const endIdx = Math.min(totalPages, end);
              pagesToProcess = allPages.slice(startIdx, endIdx);
              selectionMethod = `custom_${startIdx + 1}_to_${endIdx}`;
            } else {
              const pageNumbers = page_range.split(',').map((n: string) => parseInt(n.trim()));
              pagesToProcess = pageNumbers
                .filter((n: number) => n > 0 && n <= totalPages)
                .map((n: number) => allPages[n - 1]);
              selectionMethod = `custom_pages_${pageNumbers.join('_')}`;
            }
          } else {
            // Fallback to first 10 if custom range invalid
            pagesToProcess = allPages.slice(0, 10);
            selectionMethod = 'custom_fallback_first_10';
          }
          break;
          
        default:
          pagesToProcess = allPages.slice(0, 10);
          selectionMethod = 'default_first_10';
      }
      
      selectedPageText = pagesToProcess
        .map((page: any) => 
          (page.lines || []).map((line: any) => line.content || '').join('\n')
        )
        .join('\n\n');
        
      console.log(`[Page Selection] Method: ${selectionMethod}, Pages: ${pagesToProcess.length}`);
    }

    const charCount = selectedPageText.length;
    console.log(`[Page Selection] Selected text: ${charCount} characters`);

    await supabase
      .from('document_analysis')
      .update({ 
        ocr_text: selectedPageText,
        ocr_char_count: charCount,
        total_pages: totalPages,
        processing_status: 'ocr_complete'
      })
      .eq('id', analysisRecord.id);

    // Step 4: AI Analysis with Azure OpenAI
    console.log('[Azure OpenAI] Starting structured data extraction...');
    
    const AZURE_OPENAI_ENDPOINT = Deno.env.get('AZURE_OPENAI_ENDPOINT');
    const AZURE_OPENAI_KEY = Deno.env.get('AZURE_OPENAI_KEY');
    const AZURE_OPENAI_DEPLOYMENT = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');
    
    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !AZURE_OPENAI_DEPLOYMENT) {
      throw new Error('Azure OpenAI credentials not configured');
    }

    const aiResponse = await fetch(
      `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are an expert at extracting structured data from insurance documents. 
Extract ALL coverage information, premium amounts, vehicle/property details, and policy information.

For AUTO INSURANCE, look for:
- Bodily Injury (BI): often shown as split limits like "50/100" or CSL like "$300,000"
- Property Damage (PD): like "$50,000" or "$100,000"
- Personal Injury Protection (PIP): like "$10,000"
- Uninsured Motorist (UM/UIM): split limits or CSL
- Comprehensive (COMP): deductible like "$500"
- Collision (COLL): deductible like "$500"

For HOME INSURANCE, look for:
- Dwelling Coverage (Coverage A)
- Personal Property (Coverage C)
- Liability (Coverage E)
- Medical Payments (Coverage F)

Return valid JSON only with this EXACT structure:
{
  "document_type": "auto_policy" | "home_policy" | "commercial_policy" | "unknown",
  "carrier": "string",
  "policy_number": "string",
  "insured_name": "string",
  "effective_date": "YYYY-MM-DD",
  "expiration_date": "YYYY-MM-DD",
  "premium": {
    "total": number,
    "frequency": "annual" | "semi-annual" | "quarterly" | "monthly"
  },
  "coverages": [
    {
      "type": "string",
      "limit": "string",
      "deductible": "string",
      "premium": number
    }
  ],
  "vehicles": [
    {
      "year": number,
      "make": "string",
      "model": "string",
      "vin": "string"
    }
  ],
  "property": {
    "type": "string",
    "address": "string"
  },
  "key_details": ["string"]
}`
            },
            {
              role: 'user',
              content: `Extract ALL insurance information from this document. Focus on coverages, premiums, and policy details:\n\n${selectedPageText.slice(0, 50000)}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.1
        })
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Azure OpenAI failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();
    const aiContent = aiResult.choices?.[0]?.message?.content || '{}';
    
    // Parse JSON
    let structuredData;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      structuredData = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
    } catch (e) {
      console.error('[AI Parse Error]:', e);
      structuredData = { error: 'Failed to parse AI response' };
    }

    console.log('[AI Extraction] Complete:', JSON.stringify(structuredData, null, 2));

    // Step 5: Save results
    await supabase
      .from('document_analysis')
      .update({ 
        structured_data: structuredData,
        processing_status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', analysisRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysisRecord.id,
        ocr_text: selectedPageText,
        structured_data: structuredData,
        pages_processed: totalPages,
        selection_method: selectionMethod,
        pages_analyzed: importantPageIndices.length > 0 ? importantPageIndices.length : Math.min(10, totalPages)
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[Document Analysis] Error:', error);
    
    // Update status to failed
    if (documentId) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        
        await supabase
          .from('document_analysis')
          .update({ 
            processing_status: 'failed',
            error_message: error.message
          })
          .eq('document_id', documentId);
      } catch (updateError) {
        console.error('[Status Update Error]:', updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
