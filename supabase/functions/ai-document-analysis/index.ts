import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { extractTextFromBlob, validateExtraction } from './pdf-extractor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Custom error types
class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

class DocumentFetchError extends Error {
  constructor(message: string, public documentPath?: string) {
    super(message);
    this.name = 'DocumentFetchError';
  }
}

class AIServiceError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'AIServiceError';
  }
}

// Retry helper with improved error context
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      
      lastError = new Error(
        `HTTP ${response.status}: ${response.statusText} (attempt ${attempt + 1}/${maxRetries + 1})`
      );
    } catch (err) {
      lastError = err as Error;
      console.error(`Fetch attempt ${attempt + 1} failed:`, err);
      
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new AIServiceError(
    `Fetch failed after ${maxRetries + 1} attempts: ${lastError?.message}`,
    500
  );
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
    // Validate environment variables
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new ConfigurationError('LOVABLE_API_KEY not configured');
    }
    if (!SUPABASE_URL) {
      throw new ConfigurationError('SUPABASE_URL not configured');
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new ConfigurationError('SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    if (!GOOGLE_VISION_API_KEY) {
      console.warn('GOOGLE_CLOUD_VISION_API_KEY not configured - OCR may fail');
    }
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (err) {
      throw new Error('Invalid JSON in request body');
    }

    const { 
      action, 
      documents, 
      message, 
      conversationHistory, 
      context, 
      type, 
      documentPaths, 
      analysisType 
    } = requestBody;

    console.log('AI Document Analysis Request:', { 
      action, 
      type,
      analysisType,
      documentsCount: documents?.length,
      documentPathsCount: documentPaths?.length,
      hasContext: !!context,
    });

    let contextualDocuments = documents || [];
    
    // Handle documentPaths (critical for insurance comparison)
    if (documentPaths && Array.isArray(documentPaths) && documentPaths.length > 0) {
      console.log('Fetching documents from storage paths:', documentPaths);
      
      const documentResults = await Promise.allSettled(
        documentPaths.map(async (path: string, idx: number) => {
          try {
            if (!path || typeof path !== 'string') {
              throw new DocumentFetchError(`Invalid document path at index ${idx}`);
            }

            console.log(`Fetching document ${idx + 1}: ${path}`);

            const { data: fileData, error: storageError } = await supabase.storage
              .from('documents')
              .download(path);

            if (storageError) {
              throw new DocumentFetchError(
                `Storage error: ${storageError.message}`,
                path
              );
            }

            if (!fileData) {
              throw new DocumentFetchError(`No file data returned for path: ${path}`, path);
            }

            const fileName = path.split('/').pop() || `Document ${idx + 1}`;
            const mimeType = fileData.type || 'application/pdf';
            
            console.log(`Extracting text from ${fileName} (${mimeType}, ${fileData.size} bytes)`);
            
            if (fileData.size === 0) {
              throw new DocumentFetchError(`Empty file: ${fileName}`, path);
            }

            if (fileData.size > 50 * 1024 * 1024) {
              throw new DocumentFetchError(`File too large (${fileData.size} bytes): ${fileName}`, path);
            }

            // Extract text using Google Vision OCR
            const extractResult = await extractTextFromBlob(fileData, mimeType, {
              maxPages: 60,
              headerFooterFilter: true
            });

            // Validate extraction quality
            const validation = validateExtraction(extractResult);
            if (!validation.isValid) {
              console.warn(`⚠ Quality issues with ${fileName}:`, validation.issues);
              extractResult.warnings.push(...validation.issues);
            }

            if (extractResult.warnings.length > 0) {
              console.log(`Warnings for ${fileName}:`, extractResult.warnings);
            }

            const fullText = extractResult.pages
              .map(p => `=== Page ${p.page} ===\n${p.text}`)
              .join('\n\n');

            if (!fullText.trim()) {
              throw new DocumentFetchError(
                `No text extracted from ${fileName}. OCR may have failed.`,
                path
              );
            }

            // Validate meaningful content
            const meaningfulContent = fullText.replace(/\s+/g, ' ').trim();
            if (meaningfulContent.length < 100) {
              console.warn(`⚠ Very little text extracted from ${fileName} (${meaningfulContent.length} chars)`);
            }

            console.log(`✓ Successfully extracted ${fullText.length} characters from ${fileName}`);

            return {
              name: fileName,
              type: mimeType,
              content: fullText,
              path: path,
              warnings: extractResult.warnings
            };
          } catch (err) {
            console.error(`✗ Error processing document at index ${idx}:`, err);
            throw err;
          }
        })
      );

      // Check for failures
      const failures = documentResults.filter(r => r.status === 'rejected');
      const successes = documentResults
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);

      if (failures.length === documentPaths.length) {
        throw new DocumentFetchError(
          `Failed to fetch all ${documentPaths.length} documents. Please check that the files exist and are accessible.`
        );
      }

      if (failures.length > 0) {
        console.warn(
          `Warning: ${failures.length} of ${documentPaths.length} documents failed to load`
        );
        failures.forEach((failure, idx) => {
          console.error(`Failed document ${idx}:`, (failure as PromiseRejectedResult).reason);
        });
      }

      if (successes.length === 0) {
        throw new DocumentFetchError('No documents could be successfully processed');
      }

      contextualDocuments = successes;
      console.log(`✓ Successfully processed ${successes.length}/${documentPaths.length} documents`);
    }
    
    // Handle context-based document fetching
    if (context?.metadata?.documentId) {
      console.log('Fetching document from context:', context.metadata.documentId);
      
      let inferredAction = action;
      if (!inferredAction || inferredAction === 'chat') {
        inferredAction = 'analyze_policy';
      }
      
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('id, name, kind, category, mime_type, storage_path, storage_bucket')
        .eq('id', context.metadata.documentId)
        .single();

      if (docError) {
        throw new DocumentFetchError(
          `Failed to fetch document metadata: ${docError.message}`,
          context.metadata.documentId
        );
      }

      if (!docData) {
        throw new DocumentFetchError(
          `Document not found: ${context.metadata.documentId}`,
          context.metadata.documentId
        );
      }

      const bucket = docData.storage_bucket || 'documents';
      const { data: fileData, error: storageError } = await supabase.storage
        .from(bucket)
        .download(docData.storage_path);

      let docContent = `[Document: ${docData.name}, Type: ${docData.mime_type || 'unknown'}]`;
      
      if (storageError) {
        console.error('Storage error:', storageError);
        throw new DocumentFetchError(
          `Failed to download document: ${storageError.message}`,
          docData.storage_path
        );
      }

      if (fileData) {
        if (docData.mime_type?.includes('text/') || docData.mime_type?.includes('json')) {
          docContent = await fileData.text();
        } else {
          docContent += '\n[Binary file - visual analysis would be needed]';
        }
      }

      contextualDocuments = [{
        name: docData.name,
        type: docData.mime_type,
        category: docData.category,
        content: docContent
      }];
    }

    // Validate we have documents when required
    if ((type === 'insurance_extraction' || analysisType === 'insurance_extraction') && 
        contextualDocuments.length === 0) {
      throw new Error('No documents provided for insurance extraction');
    }

    let systemPrompt = '';
    let userPrompt = '';

    // Build prompts based on action/type
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
      userPrompt = message || 'Extract all key information from these insurance documents and return as structured JSON.';
    } else if (type === 'business_insights') {
      systemPrompt = `You are an AI business analyst for insurance agencies. Analyze metrics and generate actionable insights.`;
      userPrompt = message || 'Analyze the business metrics and provide actionable insights.';
    } else {
      const actionPrompts: Record<string, { system: string; user: string }> = {
        compare_quotes: {
          system: `You are an expert insurance analyst. Compare quotes/contracts, identify differences, and provide recommendations. Be thorough and detailed.`,
          user: 'Please analyze and compare these insurance documents in detail.'
        },
        analyze_policy: {
          system: `You are an expert insurance policy analyst. Summarize coverage, terms, and key details.`,
          user: 'Please analyze this policy document and provide a comprehensive summary.'
        },
        extract_info: {
          system: `You are a document information extraction specialist. Extract structured data from insurance documents.`,
          user: 'Please extract all key information from these documents.'
        },
        chat: {
          system: `You are an AI assistant for insurance agents. Keep responses brief and direct unless detailed analysis is needed.`,
          user: 'How can I help you today?'
        }
      };

      const selectedAction = action || 'chat';
      const prompts = actionPrompts[selectedAction] || actionPrompts.chat;
      systemPrompt = prompts.system;
      userPrompt = message || prompts.user;
    }

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    if (conversationHistory && Array.isArray(conversationHistory)) {
      messages.push(...conversationHistory);
    }

    // Add documents to message with validation
    if (contextualDocuments.length > 0) {
      const docContext = contextualDocuments
        .map((doc: any, idx: number) => {
          const preview = doc.content ? doc.content.slice(0, 200) : '[No content]';
          console.log(`Document ${idx + 1} content preview:`, preview);
          
          // Include warnings if present
          let warningText = '';
          if (doc.warnings && doc.warnings.length > 0) {
            warningText = `\n[Extraction Warnings: ${doc.warnings.join(', ')}]`;
          }
          
          return `Document ${idx + 1} (${doc.name}):${warningText}\n${doc.content || '[No content]'}`;
        })
        .join('\n\n---\n\n');

      const totalContentLength = contextualDocuments.reduce(
        (sum: number, doc: any) => sum + (doc.content?.length || 0), 
        0
      );
      
      if (totalContentLength < 500) {
        console.error('WARNING: Very little document content available for analysis');
        // Do not fail hard on low content; proceed with available text and let AI handle sparsity
        // This prevents background jobs from failing with non-2xx
      }

      console.log(`Sending ${totalContentLength} total characters of document content to AI`);

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

    console.log(`Calling Lovable AI with ${messages.length} messages`);

    const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    const headers = {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // Handle JSON extraction (non-streaming)
    if (type === 'insurance_extraction' || analysisType === 'insurance_extraction') {
      const response = await fetchWithRetry(AI_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'google/gemini-2.5-pro',
          messages,
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      });

      const errorText = await response.clone().text();
      
      if (!response.ok) {
        console.error('AI API error:', response.status, errorText);
        
        if (response.status === 429) {
          throw new AIServiceError('Rate limit exceeded. Please try again in a moment.', 429);
        }
        if (response.status === 402) {
          throw new AIServiceError('AI credits exhausted. Please add credits to your Lovable workspace.', 402);
        }
        if (response.status === 401) {
          throw new AIServiceError('Invalid API key.', 401);
        }
        
        throw new AIServiceError(`AI service returned error: ${response.status}`, response.status);
      }

      let result;
      try {
        result = JSON.parse(errorText);
      } catch (err) {
        throw new AIServiceError('AI service returned invalid JSON response');
      }

      const content = result.choices?.[0]?.message?.content;
      
      console.log('AI Response content length:', content?.length || 0);
      console.log('AI Response preview:', content?.slice(0, 300));
      
      if (!content) {
        console.warn('Empty AI response, returning fallback structure');
        return new Response(
          JSON.stringify({
            extracted: {
              type: 'unknown',
              coverages: [],
              premiums: [],
              vehicles: [],
              properties: []
            },
            warnings: ["AI returned empty response"],
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
          }
        );
      }

      let parsed: { extracted?: AnalysisExtracted } = {};
      try {
        parsed = JSON.parse(content);
        
        if (!parsed?.extracted) {
          throw new Error("Missing 'extracted' field");
        }
        
        const hasData = parsed.extracted.carrier || 
                       parsed.extracted.insuredName || 
                       parsed.extracted.policyNumber ||
                       (parsed.extracted.coverages && parsed.extracted.coverages.length > 0) ||
                       (parsed.extracted.premiums && parsed.extracted.premiums.length > 0);
        
        if (!hasData) {
          console.warn('Extraction succeeded but contains no meaningful data');
          throw new Error("Extraction contains no policy data");
        }
        
        console.log('✓ Successfully extracted policy data:', {
          carrier: parsed.extracted.carrier,
          hasInsuredName: !!parsed.extracted.insuredName,
          coverageCount: parsed.extracted.coverages?.length || 0,
          premiumCount: parsed.extracted.premiums?.length || 0
        });
      } catch (parseErr) {
        console.warn('JSON parse failed, attempting repair:', parseErr);
        
        try {
          const repairResponse = await fetchWithRetry(AI_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages: [
                { 
                  role: "system", 
                  content: "Convert the following into valid JSON matching the extraction schema. Return only valid JSON." 
                },
                { role: "user", content: content }
              ],
              temperature: 0,
              response_format: { type: "json_object" },
              max_tokens: 2000
            })
          });
          
          if (repairResponse.ok) {
            const repairResult = await repairResponse.json();
            const repairedContent = repairResult?.choices?.[0]?.message?.content;
            if (repairedContent) {
              parsed = JSON.parse(repairedContent);
              console.log('✓ JSON repair succeeded');
            }
          }
        } catch (repairErr) {
          console.error('JSON repair failed:', repairErr);
        }
      }

      if (!parsed?.extracted) {
        console.warn('Returning fallback extraction structure');
        return new Response(
          JSON.stringify({
            extracted: {
              type: 'unknown',
              coverages: [],
              premiums: [],
              vehicles: [],
              properties: []
            },
            warnings: ["Could not parse AI response into expected format"],
            raw: typeof content === 'string' ? content.slice(0, 1000) : undefined
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
            status: 200 
          }
        );
      }

      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle streaming responses
    const streamResponse = await fetchWithRetry(AI_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages,
        temperature: 0.3,
        max_tokens: 4000,
        stream: true,
      }),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      console.error('AI streaming error:', streamResponse.status, errorText);
      
      if (streamResponse.status === 429) {
        throw new AIServiceError('Rate limit exceeded. Please try again in a moment.', 429);
      }
      if (streamResponse.status === 402) {
        throw new AIServiceError('AI credits exhausted. Please add credits to your Lovable workspace.', 402);
      }
      
      throw new AIServiceError(`AI service error: ${streamResponse.status}`, streamResponse.status);
    }

    return new Response(streamResponse.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (error) {
    console.error('Error in ai-document-analysis:', error);
    
    let statusCode = 500;
    let errorMessage = 'An unexpected error occurred';
    
    if (error instanceof ConfigurationError) {
      statusCode = 500;
      errorMessage = `Configuration error: ${error.message}`;
    } else if (error instanceof DocumentFetchError) {
      statusCode = 404;
      errorMessage = `Document error: ${error.message}`;
    } else if (error instanceof AIServiceError) {
      statusCode = error.statusCode || 500;
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        type: error instanceof Error ? error.name : 'UnknownError'
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: statusCode 
      }
    );
  }
});
