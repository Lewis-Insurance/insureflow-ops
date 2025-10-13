import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { extractTextFromBlob } from './pdf-extractor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry helper for transient failures
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error('Fetch failed after retries');
}

type AnalysisExtracted = {
  type?: string;
  carrier?: string;
  policyNumber?: string;
  insuredName?: string;
  effectiveDate?: string;
  expirationDate?: string;
  term?: string;
  coverages?: any[];
  premiums?: any[];
  totalPremium?: number;
  vehicles?: any[];
  properties?: any[];
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { action, documents, message, conversationHistory, context, type, documentPaths, analysisType } = await req.json();

    console.log('AI Document Analysis Request:', { 
      action, 
      type,
      analysisType,
      documentsCount: documents?.length,
      documentPathsCount: documentPaths?.length,
      hasContext: !!context,
      contextType: context?.type,
      contextDocumentId: context?.metadata?.documentId
    });

    // Handle documentPaths (for insurance comparison)
    let contextualDocuments = documents || [];
    
    if (documentPaths && Array.isArray(documentPaths) && documentPaths.length > 0) {
      console.log('Fetching documents from storage paths:', documentPaths);
      
      const fetchedDocs = await Promise.all(
        documentPaths.map(async (path: string, idx: number) => {
          try {
            const { data: fileData, error: storageError } = await supabase.storage
              .from('documents')
              .download(path);

            if (storageError || !fileData) {
              console.error('Storage error for path', path, storageError);
              return {
                name: `Document ${idx + 1}`,
                type: 'unknown',
                content: '[Error: Could not retrieve document]'
              };
            }

            // Extract text from PDF or image
            const fileName = path.split('/').pop() || `Document ${idx + 1}`;
            const mimeType = fileData.type || 'application/pdf';
            
            console.log(`Extracting text from ${fileName} (${mimeType})`);
            
            const extractResult = await extractTextFromBlob(fileData, mimeType, {
              maxPages: 60,
              headerFooterFilter: true
            });

            if (extractResult.warnings.length > 0) {
              console.log('Extraction warnings:', extractResult.warnings);
            }

            // Merge all pages into single text
            const fullText = extractResult.pages
              .map(p => `=== Page ${p.page} ===\n${p.text}`)
              .join('\n\n');

            if (!fullText.trim()) {
              console.warn('No text extracted from', fileName);
              return {
                name: fileName,
                type: mimeType,
                content: '[Warning: No text could be extracted from this document. It may be an image-only PDF or empty file.]'
              };
            }

            console.log(`Extracted ${fullText.length} characters from ${fileName}`);

            return {
              name: fileName,
              type: mimeType,
              content: fullText
            };
          } catch (err) {
            console.error('Error processing document:', err);
            return {
              name: `Document ${idx + 1}`,
              type: 'unknown',
              content: `[Error: Failed to process document - ${err instanceof Error ? err.message : 'Unknown error'}]`
            };
          }
        })
      );
      
      contextualDocuments = fetchedDocs;
    }
    
    // If context includes a documentId, fetch and analyze that specific document
    let inferredAction = action;
    if (context?.metadata?.documentId) {
      console.log('Fetching document from context:', context.metadata.documentId);
      
      // Auto-detect action for document context
      if (!inferredAction || inferredAction === 'chat') {
        inferredAction = 'analyze_policy';
      }
      
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('id, name, kind, category, mime_type, storage_path, storage_bucket')
        .eq('id', context.metadata.documentId)
        .single();

      if (docError) {
        console.error('Error fetching document:', docError);
      } else if (docData) {
        // Try to fetch document content from storage
        const bucket = docData.storage_bucket || 'documents';
        const { data: fileData, error: storageError } = await supabase.storage
          .from(bucket)
          .download(docData.storage_path);

        let docContent = `[Document: ${docData.name}, Type: ${docData.mime_type || 'unknown'}]`;
        
        if (!storageError && fileData) {
          // For text-based documents, try to extract text
          if (docData.mime_type?.includes('text/') || docData.mime_type?.includes('json')) {
            docContent = await fileData.text();
          } else {
            docContent += '\n[Binary file - visual analysis would be needed]';
          }
        } else {
          console.error('Storage error:', storageError);
          docContent += '\n[Note: File content could not be retrieved from storage]';
        }

        contextualDocuments = [{
          name: docData.name,
          type: docData.mime_type,
          category: docData.category,
          content: docContent
        }];
      }
    }

    let systemPrompt = '';
    let userPrompt = '';

    // Handle analysisType (for insurance comparison)
    if (type === 'insurance_extraction' || analysisType === 'insurance_extraction') {
      systemPrompt = `You are an expert insurance document analyzer. Extract and structure key information from insurance documents.

Return the extracted data in valid JSON format with this exact structure:
{
  "extracted": {
    "type": "quote" or "policy" or "declaration",
    "carrier": "Carrier name",
    "policyNumber": "Policy number if available",
    "insuredName": "Name of insured",
    "effectiveDate": "YYYY-MM-DD",
    "expirationDate": "YYYY-MM-DD",
    "term": "12 months" or similar,
    "coverages": [
      { "type": "Coverage name", "limit": "Amount", "deductible": "Amount", "premium": number }
    ],
    "premiums": [
      { "type": "Premium type", "amount": number, "frequency": "annual" }
    ],
    "totalPremium": number,
    "vehicles": [],
    "properties": []
  }
}

CRITICAL: You must return ONLY the JSON object above. No markdown formatting, no code blocks, no explanations - just pure JSON.`;
      userPrompt = message || 'Extract all key information from these insurance documents and return as structured JSON. Be thorough in extracting coverage details, limits, deductibles, and premium information.';
    } else if (type === 'business_insights') {
      systemPrompt = `You are an AI business analyst for insurance agencies. Analyze the provided business metrics and generate 3-4 actionable insights. Focus on:
- Revenue opportunities (policies expiring soon, underinsured accounts)
- Risk factors (pending tasks, coverage gaps)
- Action items (follow-ups needed, renewals to prioritize)

Return insights as a JSON array with objects containing: type (opportunity|risk|action), title, description.`;
      userPrompt = message || 'Analyze the business metrics and provide actionable insights.';
    } else {
      // Use action-based prompts
      switch (inferredAction) {
        case 'compare_quotes':
          systemPrompt = `You are an expert insurance analyst. Your role is to:
1. Compare insurance quotes and contracts
2. Identify key differences in coverage, premiums, deductibles, and terms
3. Highlight coverage gaps or exclusions
4. Summarize pros and cons of each option
5. Provide clear, actionable recommendations

Be concise but thorough. Use tables when comparing numerical data.
IMPORTANT: When answering questions without verified document data, keep responses brief, direct, and to the point - no more than 2-3 sentences unless specifically asked for detail.`;
          userPrompt = message || 'Please analyze and compare these insurance documents.';
          break;

        case 'analyze_policy':
          systemPrompt = `You are an expert insurance policy analyst. Your role is to:
1. Summarize policy coverage details
2. Identify key terms, conditions, and exclusions
3. Highlight important dates (effective, expiration, renewal)
4. Extract coverage limits and deductibles
5. Flag any unusual clauses or restrictions

Present information in a clear, organized format.
IMPORTANT: When answering questions without verified document data, keep responses brief, direct, and to the point - no more than 2-3 sentences unless specifically asked for detail.`;
          userPrompt = message || 'Please analyze this policy document and provide a comprehensive summary.';
          break;

        case 'extract_info':
          systemPrompt = `You are a document information extraction specialist. Extract and structure key information from insurance documents including:
- Policy numbers
- Effective and expiration dates
- Coverage types and limits
- Premiums and deductibles
- Insured parties
- Contact information

Format as JSON where possible.`;
          userPrompt = message || 'Please extract all key information from these documents.';
          break;

        case 'chat':
        default:
          systemPrompt = `You are an AI assistant for insurance agents. You help with:
- Answering questions about policies, quotes, and insurance concepts
- Providing guidance on insurance workflows
- Helping draft communications
- Analyzing documents when provided

CRITICAL INSTRUCTIONS:
- When answering from verified knowledge base sources, provide the full answer with source attribution
- When answering general questions WITHOUT verified sources, be BRIEF and DIRECT - use 2-3 sentences maximum
- Avoid verbose explanations unless specifically requested
- Get straight to the point - no preambles or unnecessary context`;
          userPrompt = message || 'How can I help you today?';
          break;
      }
    }

    // Build messages array
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory);
    }

    // Add current message with document context
    if (contextualDocuments && contextualDocuments.length > 0) {
      const docContext = contextualDocuments.map((doc: any, idx: number) => 
        `Document ${idx + 1} (${doc.name}):\n${doc.content || 'Content not provided'}`
      ).join('\n\n---\n\n');

      messages.push({
        role: 'user',
        content: `${userPrompt}\n\nDocuments:\n${docContext}`
      });
    } else {
      messages.push({
        role: 'user',
        content: userPrompt
      });
    }

    console.log('Calling OpenAI with', messages.length, 'messages');

    const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
    const headers = {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // For insurance extraction, we need JSON response, not streaming
    if (type === 'insurance_extraction' || analysisType === 'insurance_extraction') {
      const response = await fetchWithRetry(OPENAI_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      
      if (!content) {
        return new Response(
          JSON.stringify({ error: "BAD_JSON", detail: "Empty model response" }), 
          { headers: corsHeaders, status: 502 }
        );
      }

      let parsed: { extracted?: AnalysisExtracted } = {};
      try {
        parsed = JSON.parse(content);
        const ok = parsed?.extracted && 
          ["carrier", "insuredName", "effectiveDate", "expirationDate"].every(
            (k) => k in (parsed.extracted as any)
          );
        if (!ok) throw new Error("Missing required fields");
      } catch (parseErr) {
        console.warn('Initial JSON parse failed, attempting repair:', parseErr);
        // One repair attempt
        try {
          const repair = await fetchWithRetry(OPENAI_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { 
                  role: "system", 
                  content: "Fix the following into STRICT JSON matching the earlier schema. No prose, just valid JSON." 
                },
                { role: "user", content: content }
              ],
              temperature: 0,
              response_format: { type: "json_object" },
              max_tokens: 800
            })
          });
          const rj = await repair.json();
          const repaired = rj?.choices?.[0]?.message?.content || "{}";
          parsed = JSON.parse(repaired);
          console.log('JSON repair succeeded');
        } catch (repairErr) {
          console.error('JSON repair failed:', repairErr);
        }
      }

      if (!parsed?.extracted) {
        return new Response(
          JSON.stringify({ 
            error: "BAD_JSON", 
            detail: "Model returned invalid or incomplete JSON" 
          }), 
          { headers: corsHeaders, status: 502 }
        );
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Non-extraction: stream through
    const streamRes = await fetchWithRetry(OPENAI_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!streamRes.ok) {
      const errorText = await streamRes.text();
      console.error('OpenAI API error:', streamRes.status, errorText);
      throw new Error(`OpenAI API error: ${streamRes.status}`);
    }

    return new Response(streamRes.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Vary': '*',
      },
    });

  } catch (error) {
    console.error('ai-document-analysis error:', error);
    const msg = (error as any)?.message || 'Unknown error';
    return new Response(
      JSON.stringify({ error: msg }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 500 
      }
    );
  }
});
