import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { extractTextFromBlob, validateExtraction } from './pdf-extractor.ts';
import { requireAuth } from '../_shared/auth.ts';
import { getAIApiKey, getAIProvider } from '../_shared/ai-client.ts';
import { redactPII } from '../_shared/floorSafety.ts';
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Performance configuration
const BATCH_CONCURRENCY = 3; // Process up to 3 documents in parallel
const CACHE_TTL_DAYS = 7; // Cache OCR results for 7 days

// Hash function for document caching
async function hashDocument(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b: any) => b.toString(16).padStart(2, '0')).join('');
}

// Cache management functions
async function getCachedOCR(supabase: any, documentHash: string, path: string): Promise<string | null> {
  try {
    const cacheKey = `ocr:${path}:${documentHash}`;
    const { data, error } = await supabase
      .from('ocr_cache')
      .select('ocr_text, expires_at')
      .eq('key', cacheKey)
      .maybeSingle();
    
    if (error) {
      console.warn('Cache lookup error:', error);
      return null;
    }
    
    if (data) {
      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        console.log('Cache entry expired, removing...');
        await supabase.from('ocr_cache').delete().eq('key', cacheKey);
        return null;
      }
      console.log('✓ Cache hit for:', path);
      return data.ocr_text;
    }
    
    return null;
  } catch (err: unknown) {
    console.warn('Cache retrieval failed:', err);
    return null;
  }
}

async function cacheOCR(supabase: any, documentHash: string, path: string, ocrText: string): Promise<void> {
  try {
    const cacheKey = `ocr:${path}:${documentHash}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);
    
    await supabase.from('ocr_cache').upsert({
      key: cacheKey,
      document_hash: documentHash,
      ocr_text: ocrText,
      metadata: { path, cached_at: new Date().toISOString() },
      expires_at: expiresAt.toISOString()
    }, {
      onConflict: 'key'
    });
    
    console.log('✓ Cached OCR result for:', path);
  } catch (err: unknown) {
    console.warn('Cache save failed (non-critical):', err);
  }
}

// Batch processing with concurrency control
async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = BATCH_CONCURRENCY
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((item, batchIndex) => processor(item, i + batchIndex))
    );
    results.push(...batchResults);
    
    // Small delay between batches to prevent overwhelming resources
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

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

type ModelMessage = Record<string, unknown> & { content?: unknown };

function redactModelMessagesForAI(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (typeof message.content !== 'string') return message;
    const { redacted, redactions } = redactPII(message.content);
    if (redactions.length > 0) {
      console.info('[AI Document Analysis] Redacted regulated fields before model call', { redactions });
    }
    return { ...message, content: redacted };
  });
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
      const response = await modelBoundaryFetch(url, options);
      
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      
      lastError = new Error(
        `HTTP ${response.status}: ${response.statusText} (attempt ${attempt + 1}/${maxRetries + 1})`
      );
    } catch (err: unknown) {
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
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');

    if (!SUPABASE_URL) {
      throw new ConfigurationError('SUPABASE_URL not configured');
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      throw new ConfigurationError('SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    if (!GOOGLE_VISION_API_KEY) {
      console.warn('GOOGLE_CLOUD_VISION_API_KEY not configured - OCR may fail');
    }

    // Get AI API key (validates internally)
    const AI_PROVIDER = getAIProvider();
    const AI_API_KEY = getAIApiKey(AI_PROVIDER);
    console.log(`Using AI provider: ${AI_PROVIDER}`);
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (err: unknown) {
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
      console.log(`Fetching ${documentPaths.length} documents from storage with batch processing (concurrency: ${BATCH_CONCURRENCY})`);
      
      // Use batch processing with concurrency control
      const documentResults = await processBatch(
        documentPaths,
        async (path: string, idx: number) => {
          try {
            if (!path || typeof path !== 'string') {
              throw new DocumentFetchError(`Invalid document path at index ${idx}`);
            }

            console.log(`Processing document ${idx + 1}/${documentPaths.length}: ${path}`);

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
            
            if (fileData.size === 0) {
              throw new DocumentFetchError(`Empty file: ${fileName}`, path);
            }

            if (fileData.size > 50 * 1024 * 1024) {
              throw new DocumentFetchError(`File too large (${fileData.size} bytes): ${fileName}`, path);
            }

            console.log(`Document ${fileName}: ${mimeType}, ${fileData.size} bytes`);

            // Generate document hash for caching
            const documentHash = await hashDocument(fileData);
            console.log(`Document hash: ${documentHash.substring(0, 16)}...`);

            // Try to get cached OCR result
            const cachedText = await getCachedOCR(supabase, documentHash, path);
            let fullText: string;
            let warnings: string[] = [];

            if (cachedText) {
              fullText = cachedText;
              console.log(`✓ Using cached OCR for ${fileName} (${fullText.length} chars)`);
            } else {
              console.log(`Extracting text from ${fileName}...`);
              
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

              warnings = extractResult.warnings;

              if (warnings.length > 0) {
                console.log(`Warnings for ${fileName}:`, warnings);
              }

              fullText = extractResult.pages
                .map((p: any) => `=== Page ${p.page} ===\n${p.text}`)
                .join('\n\n');

              if (!fullText.trim()) {
                console.warn(`⚠ No text extracted from ${fileName}. OCR may have failed or document is blank.`);
                return {
                  name: fileName,
                  type: mimeType,
                  content: `[No text could be extracted from ${fileName}]`,
                  path: path,
                  warnings: [...warnings, 'No text extracted - document may be blank or OCR failed']
                };
              }

              // Cache the OCR result for future use
              await cacheOCR(supabase, documentHash, path, fullText);
            }

            // Validate meaningful content
            const meaningfulContent = fullText.replace(/\s+/g, ' ').trim();
            if (meaningfulContent.length < 100) {
              console.warn(`⚠ Very little text extracted from ${fileName} (${meaningfulContent.length} chars)`);
            }

            console.log(`✓ Successfully processed ${fileName}: ${fullText.length} characters`);

            return {
              name: fileName,
              type: mimeType,
              content: fullText,
              path: path,
              warnings: warnings
            };
          } catch (err: unknown) {
            console.error(`✗ Error processing document at index ${idx}:`, err);
            throw err;
          }
        },
        BATCH_CONCURRENCY
      );

      // Check for failures
      const failures = documentResults.filter((r: any) => r.status === 'rejected');
      const successes = documentResults
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map((r: any) => r.value);

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
        .select('id, name, kind, category, mime_type, storage_path, storage_bucket, google_drive_id')
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

      let fileData: Blob;
      
      // Check if document is stored in Google Drive
      if (docData.storage_path?.startsWith('google-drive://') || docData.google_drive_id) {
        console.log('Fetching document from Google Drive...');
        const driveId = docData.google_drive_id || docData.storage_path.replace('google-drive://', '');
        const GOOGLE_DRIVE_API_KEY = Deno.env.get('GOOGLE_DRIVE_API_KEY');
        
        if (!GOOGLE_DRIVE_API_KEY) {
          throw new ConfigurationError('GOOGLE_DRIVE_API_KEY not configured');
        }

        // Fetch file from Google Drive
        const driveResponse = await modelBoundaryFetch(
          `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media&key=${GOOGLE_DRIVE_API_KEY}`,
          {
            method: 'GET',
          }
        );

        if (!driveResponse.ok) {
          const errorText = await driveResponse.text();
          console.error('Google Drive fetch error:', errorText);
          throw new DocumentFetchError(
            `Failed to fetch from Google Drive: ${driveResponse.status}`,
            driveId
          );
        }

        fileData = await driveResponse.blob();
        console.log(`✓ Fetched ${docData.name} from Google Drive (${fileData.size} bytes)`);
        
      } else {
        // Fetch from Supabase Storage
        const bucket = docData.storage_bucket || 'documents';
        const { data: storageFileData, error: storageError } = await supabase.storage
          .from(bucket)
          .download(docData.storage_path);

        if (storageError) {
          console.error('Storage error:', storageError);
          throw new DocumentFetchError(
            `Failed to download document: ${storageError.message}`,
            docData.storage_path
          );
        }

        if (!storageFileData) {
          throw new DocumentFetchError(
            `No file data returned for: ${docData.storage_path}`,
            docData.storage_path
          );
        }

        fileData = storageFileData;
        console.log(`✓ Fetched ${docData.name} from Supabase Storage (${fileData.size} bytes)`);
      }

      // Process the document content
      let docContent = `[Document: ${docData.name}, Type: ${docData.mime_type || 'unknown'}]`;
      
      if (fileData) {
        if (docData.mime_type?.includes('text/') || docData.mime_type?.includes('json')) {
          docContent = await fileData.text();
        } else if (docData.mime_type?.includes('pdf') || docData.mime_type?.includes('image')) {
          // Extract text using OCR
          console.log('Extracting text from binary document...');
          const extractResult = await extractTextFromBlob(fileData, docData.mime_type, {
            maxPages: 60,
            headerFooterFilter: true
          });
          
          docContent = extractResult.pages
            .map((p: any) => `=== Page ${p.page} ===\n${p.text}`)
            .join('\n\n');
          
          console.log(`✓ Extracted ${docContent.length} characters from ${docData.name}`);
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
      const { documentType, extractionType } = requestBody;
      
      systemPrompt = `You are an expert insurance document analyzer specializing in extracting data from insurance declarations pages and policy documents.

CRITICAL INSTRUCTIONS:
- Look for ALL variations of field names (e.g., "BUILT:", "Year Built:", "Construction Year:")
- Extract numeric values from coverage tables and premium summaries
- Convert all dollar amounts to numbers (remove $, commas)
- For boolean fields (alarm_system, etc.), default to false unless explicitly stated
- Always extract the complete property address if present
- Return data in the EXACT nested structure specified below

INSURANCE TYPE EXTRACTION RULES:

AUTO INSURANCE - Extract and return this JSON structure:
{
  "vehicle": { 
    "year": <number>,
    "make": <string>,
    "model": <string>,
    "vin": <string>,
    "usage": <string>
  },
  "driver": { 
    "name": <string>,
    "dob": <string>,
    "license_number": <string>
  },
  "coverage": { 
    "liability_limits": <string>,
    "collision_deductible": <number>,
    "comprehensive_deductible": <number>,
    "uninsured_motorist": <string>,
    "rental_reimbursement": <boolean>
  },
  "accidents_last_3_years": <number>,
  "violations_last_3_years": <number>
}

HOME INSURANCE - Extract and return this JSON structure (look for fields like "DWELLING", "Coverage A", "BUILT:", "ROOF AGE:", "CONST:", etc.):
{
  "carrier": <string - look for carrier/company name at the top of the document>,
  "expiration_date": <string YYYY-MM-DD format - look for "EXP:", "Expiration Date:", "Policy Period Ends:">,
  "property": { 
    "address": <string - complete address from "NAMED INSURED AND ADDRESS" or property location>,
    "type": <string - e.g., "Single Family", "Condo" - look for "OCC:" field or property type>,
    "year_built": <number - look for "BUILT:", "Year Built:", or similar>,
    "square_footage": <number - if available>,
    "construction_type": <string - look for "CONST:", "Construction:", "Construction Type:">,
    "roof_type": <string - look for "ROOF SURFACE:", "Roof Type:", etc.>,
    "roof_age": <number - look for "ROOF AGE:", "Roof Age:">,
    "stories": <number - look for "# FAMILIES:", "Number of Stories:">
  },
  "coverage": { 
    "dwelling": <number - look for "A. DWELLING", "Coverage A", "Dwelling Coverage">,
    "personal_property": <number - look for "C. PERSONAL PROPERTY", "Coverage C", "Personal Property">,
    "liability": <number - look for "E. PERSONAL LIABILITY", "Personal Liability", "Liability Coverage">,
    "deductible": <number - look for "ALL OTHER PERILS DEDUCTIBLE", "Deductible", etc.>,
    "loss_of_use": <number - look for "D. LOSS OF USE", "Loss of Use", "Additional Living Expense">
  },
  "features": { 
    "alarm_system": <boolean>,
    "sprinkler_system": <boolean>,
    "swimming_pool": <boolean>,
    "trampoline": <boolean>,
    "dogs": <boolean>,
    "dog_breed": <string if dogs present>
  },
  "claims_last_5_years": <number - if mentioned>
}

COMMERCIAL INSURANCE - Extract and return this JSON structure:
{
  "business": { 
    "name": <string>,
    "type": <string>,
    "industry": <string>,
    "years_in_business": <number>,
    "revenue": <number>,
    "employees": <number>
  },
  "coverage_types": { 
    "general_liability": <boolean>,
    "property_coverage": <boolean>,
    "workers_comp": <boolean>,
    "commercial_auto": <boolean>,
    "professional_liability": <boolean>,
    "cyber_liability": <boolean>
  },
  "coverage": { 
    "liability_limit": <number>,
    "property_value": <number>,
    "payroll_amount": <number>
  },
  "business_description": <string>,
  "number_of_vehicles": <number>
}

LIFE INSURANCE - Extract and return this JSON structure:
{
  "insured": { 
    "name": <string>,
    "dob": <string>,
    "age": <number>,
    "gender": <string>,
    "tobacco_use": <boolean>,
    "height_inches": <number>,
    "weight_lbs": <number>
  },
  "coverage": { 
    "type": <string>,
    "amount": <number>,
    "term_length": <number>
  },
  "health": { 
    "conditions": <array of strings>,
    "medications": <array of strings>,
    "family_history": <string>
  },
  "beneficiary": { 
    "name": <string>,
    "relationship": <string>
  }
}

UMBRELLA INSURANCE - Extract and return this JSON structure:
{
  "coverage": { 
    "amount": <number>,
    "auto_liability_limits": <string>,
    "home_liability_limits": <string>
  },
  "underlying": { 
    "vehicles": <number>,
    "properties": <number>,
    "watercraft": <number>,
    "recreational_vehicles": <number>,
    "rental_property": <number>
  },
  "drivers": { 
    "number_of_drivers": <number>,
    "teen_drivers": <number>
  }
}

RENTERS INSURANCE - Extract and return this JSON structure:
{
  "carrier": <string - carrier/company name>,
  "expiration_date": <string YYYY-MM-DD format>,
  "property": { 
    "address": <string>,
    "type": <string>,
    "square_footage": <number>
  },
  "coverage": { 
    "personal_property": <number>,
    "liability": <number>,
    "deductible": <number>,
    "loss_of_use": <number>
  },
  "features": { 
    "alarm_system": <boolean>,
    "pets": <boolean>,
    "pet_type": <string>,
    "valuable_items": <boolean>,
    "valuable_items_description": <string>
  }
}

BOAT INSURANCE - Extract and return this JSON structure:
{
  "carrier": <string - carrier/company name>,
  "expiration_date": <string YYYY-MM-DD format>,
  "vessel": { 
    "type": <string - e.g., "Sailboat", "Powerboat">,
    "year": <number>,
    "make": <string>,
    "model": <string>,
    "length_feet": <number>,
    "hull_id": <string>,
    "engine_type": <string>,
    "horsepower": <number>,
    "number_of_engines": <number>,
    "value": <number>,
    "agreed_value": <boolean>,
    "primary_use": <string>,
    "navigation_area": <string>,
    "storage_location": <string>,
    "trailer_included": <boolean>
  },
  "operator": { 
    "name": <string>,
    "experience_years": <number>,
    "safety_course": <boolean>
  },
  "claims_last_5_years": <number>
}

MOTORCYCLE INSURANCE - Extract and return this JSON structure:
{
  "carrier": <string - carrier/company name>,
  "expiration_date": <string YYYY-MM-DD format>,
  "motorcycle": { 
    "year": <number>,
    "make": <string>,
    "model": <string>,
    "vin": <string>,
    "type": <string - e.g., "Sport", "Cruiser", "Touring">,
    "engine_size_cc": <number>,
    "custom_parts_value": <number>,
    "anti_theft_device": <boolean>,
    "storage_location": <string>,
    "annual_mileage": <number>,
    "primary_use": <string>
  },
  "rider": { 
    "name": <string>,
    "dob": <string>,
    "license_number": <string>,
    "years_experience": <number>,
    "msf_course": <boolean>,
    "accidents_last_3_years": <number>,
    "violations_last_3_years": <number>
  }
}

RV INSURANCE - Extract and return this JSON structure:
{
  "carrier": <string - carrier/company name>,
  "expiration_date": <string YYYY-MM-DD format>,
  "rv": { 
    "type": <string - e.g., "Class A", "Class B", "Class C", "Fifth Wheel">,
    "year": <number>,
    "make": <string>,
    "model": <string>,
    "vin": <string>,
    "length_feet": <number>,
    "value": <number>,
    "agreed_value": <boolean>,
    "primary_use": <string>,
    "full_timer": <boolean>,
    "towing_vehicle": <string>,
    "storage_location": <string>,
    "total_mileage": <number>,
    "annual_mileage": <number>,
    "slide_outs": <number>,
    "awnings": <number>,
    "solar_panels": <boolean>,
    "satellite_dish": <boolean>
  },
  "claims_last_5_years": <number>
}

IMPORTANT: Return ONLY the JSON object for the specific insurance type - no markdown, no code blocks, no explanatory text. Just pure JSON.`;

      userPrompt = message || `Extract ${documentType || 'insurance'} information from the document. Return your response as a JSON object with this structure: { "extracted": { <the extracted data in the format specified for ${documentType} insurance> } }`;
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
          const preview = doc.content ? redactPII(String(doc.content).slice(0, 200)).redacted : '[No content]';
          console.log(`Document ${idx + 1} content preview:`, preview);
          
          // Include warnings if present
          let warningText = '';
          if (doc.warnings && doc.warnings.length > 0) {
            warningText = `\n[Extraction Warnings: ${doc.warnings.join(', ')}]`;
          }
          
          return `Document ${idx + 1}:${warningText}\n${doc.content || '[No content]'}`;
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

    const redactedMessages = redactModelMessagesForAI(messages);

    console.log(`Calling ${AI_PROVIDER} AI with ${redactedMessages.length} messages`);

    const AI_URL = 'https://api.openai.com/v1/chat/completions';
    const headers = {
      'Authorization': `Bearer ${AI_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // Handle JSON extraction (non-streaming)
    if (type === 'insurance_extraction' || analysisType === 'insurance_extraction') {
      const response = await fetchWithRetry(AI_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: redactedMessages,
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
          throw new AIServiceError('AI credits exhausted. Please check your OpenAI billing.', 402);
        }
        if (response.status === 401) {
          throw new AIServiceError('Invalid API key.', 401);
        }
        
        throw new AIServiceError(`AI service returned error: ${response.status}`, response.status);
      }

      let result;
      try {
        result = JSON.parse(errorText);
      } catch (err: unknown) {
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

        // Post-process: resolve "YES" placeholders and normalize limits
        try {
          const docsText = Array.isArray(contextualDocuments)
            ? contextualDocuments.map((d: any) => d?.content || '').join('\n')
            : '';

          function findNearby(text: string, re: RegExp): string | undefined {
            const m = text.match(re);
            if (!m) return undefined;
            // Prefer the first capturing group if present
            return m[1] || m[0];
          }

          const refineCoverage = (cov: any) => {
            if (!cov || typeof cov.type !== 'string') return cov;
            const typeLower = cov.type.toLowerCase();
            const rawLimit = (cov.limit ?? '').toString().trim().toUpperCase();
            if (rawLimit === 'YES' || rawLimit === 'Y' || rawLimit === 'CHECKED' || rawLimit === 'TRUE') {
              let extracted: string | undefined;

              // Common patterns available across carriers
              const triSplit = docsText.match(/(\$?\d{1,3}(?:,\d{3})?)\s*\/\s*(\$?\d{1,3}(?:,\d{3})?)\s*\/\s*(\$?\d{1,3}(?:,\d{3})?)/);

              const isBI = typeLower.includes('bodily injury') || /\bbi\b/i.test(typeLower);
              const isPD = typeLower.includes('property damage') || /\bpd\b/i.test(typeLower);
              const isPIP = typeLower.includes('personal injury protection') || /\bpip\b/i.test(typeLower);

              if (isBI) {
                extracted = findNearby(
                  docsText,
                  /(bodily\s+injury|\bBI\b)[^\n]{0,200}?((?:\$?\d{1,3}(?:,\d{3})?)\s*\/\s*(?:\$?\d{1,3}(?:,\d{3})?))/i
                );
                if (!extracted && triSplit) {
                  extracted = `${triSplit[1]}/${triSplit[2]}`;
                }
              } else if (isPD) {
                extracted = findNearby(
                  docsText,
                  /(property\s+damage|\bPD\b)[^\n]{0,200}?(\$?\d{1,3}(?:,\d{3})+)/i
                );
                if (!extracted && triSplit) {
                  extracted = triSplit[3];
                }
              } else if (isPIP) {
                extracted = findNearby(
                  docsText,
                  /(personal\s+injury\s+protection|\bPIP\b)[^\n]{0,200}?(\$?\d{1,3}(?:,\d{3})+)/i
                );
              }

              if (extracted) {
                cov.limit = extracted.replace(/Limit:?\s*/i, '').trim();
              } else {
                // Could not find numeric value; treat as Included without numeric limit
                delete cov.limit;
                cov.notes = (cov.notes ? cov.notes + ' ' : '') + 'Included (numeric limit not specified)';
              }
            }
            return cov;
          };

          if (Array.isArray(parsed.extracted.coverages)) {
            parsed.extracted.coverages = parsed.extracted.coverages.map(refineCoverage);
          }

          // Heuristic: if no coverages extracted, infer from OCR text signals
          if (!parsed.extracted.coverages || parsed.extracted.coverages.length === 0) {
            try {
              const docsText = Array.isArray(contextualDocuments)
                ? contextualDocuments.map((d: any) => d?.content || '').join('\n')
                : '';

              const inferred: any[] = [];
              const has = (re: RegExp) => re.test(docsText);
              const nearYes = (re: RegExp) => new RegExp(re.source + '[^\n]{0,120}\\b(YES|Y)\\b', 'i').test(docsText);

              // Split limits (BI/PD) near liability indicators
              const splitMatch = docsText.match(/(BI\s*\/\s*PD|BI\/PD|Liability)[^\n]{0,120}?((\$?\d{1,3}(?:,\d{3})?)\s*\/\s*(\$?\d{1,3}(?:,\d{3})?)(?:\s*\/\s*(\$?\d{1,3}(?:,\d{3})?))?)/i);
              if (splitMatch) {
                const part1 = splitMatch[3];
                const part2 = splitMatch[4];
                const part3 = splitMatch[5];
                if (part1 && part2) inferred.push({ type: 'Bodily Injury Liability', limit: `${part1}/${part2}` });
                if (part3) inferred.push({ type: 'Property Damage Liability', limit: part3 });
              }

              // Bodily Injury (by words or BI)
              if (!inferred.find((c: any) => /Bodily Injury/i.test(c.type)) && (has(/bodily\s+injury/i) || has(/\bBI\b/i) || nearYes(/bodily\s+injury|\bBI\b/i))) {
                const biNum = docsText.match(/(bodily\s+injury|\bBI\b)[^\n]{0,160}?((\$?\d{1,3}(?:,\d{3})?)\s*\/\s*(\$?\d{1,3}(?:,\d{3})?))/i)?.[2];
                inferred.push({ type: 'Bodily Injury Liability', limit: biNum || undefined, notes: biNum ? undefined : 'Included (numeric limit not specified)' });
              }

              // Property Damage (by words or PD)
              if (!inferred.find((c: any) => /Property Damage/i.test(c.type)) && (has(/property\s+damage/i) || has(/\bPD\b/i) || nearYes(/property\s+damage|\bPD\b/i))) {
                const pdNum = docsText.match(/(property\s+damage|\bPD\b)[^\n]{0,160}?(\$?\d{1,3}(?:,\d{3})+)/i)?.[2];
                inferred.push({ type: 'Property Damage Liability', limit: pdNum || undefined, notes: pdNum ? undefined : 'Included (numeric limit not specified)' });
              }

              // CSL (Combined Single Limit)
              const csl = docsText.match(/(combined\s+single\s+limit|\bCSL\b)[^\n]{0,120}?(\$?\d{1,3}(?:,\d{3})+)/i)?.[2];
              if (csl) inferred.push({ type: 'Liability CSL', limit: csl });

              // PIP
              if (has(/personal\s+injury\s+protection|\bPIP\b/i) || nearYes(/personal\s+injury\s+protection|\bPIP\b/i)) {
                const pipAmt = docsText.match(/(personal\s+injury\s+protection|\bPIP\b)[^\n]{0,160}?(\$?\d{1,3}(?:,\d{3})+)/i)?.[2];
                inferred.push({ type: 'Personal Injury Protection', limit: pipAmt || undefined, notes: pipAmt ? undefined : 'Included (numeric limit not specified)' });
              }

              if (inferred.length > 0) parsed.extracted.coverages = inferred;
            } catch (inferErr) {
              console.warn('Coverage inference failed:', inferErr);
            }
          }
        } catch (postProcessErr) {
          console.warn('Post-processing failed:', postProcessErr);
        }
      } catch (parseErr) {
          console.warn('JSON parse failed, attempting repair:', parseErr);
          
          try {
            const repairResponse = await fetchWithRetry(AI_URL, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model: "gpt-5-mini",
                messages: [
                  { 
                    role: "system", 
                    content: "Convert the following into valid JSON matching the extraction schema. Return only valid JSON." 
                  },
                  { role: "user", content: redactPII(content).redacted }
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
        model: 'gpt-5-mini',
        messages: redactedMessages,
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
        throw new AIServiceError('AI credits exhausted. Please check your OpenAI billing.', 402);
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

  } catch (error: unknown) {
    console.error('Error in ai-document-analysis:', error);
    
    let statusCode = 500;
    let errorMessage = 'An unexpected error occurred';
    
    if (error instanceof ConfigurationError) {
      statusCode = 500;
      errorMessage = `Configuration error: ${(error instanceof Error ? error.message : String(error))}`;
    } else if (error instanceof DocumentFetchError) {
      statusCode = 404;
      errorMessage = `Document error: ${(error instanceof Error ? error.message : String(error))}`;
    } else if (error instanceof AIServiceError) {
      statusCode = error.statusCode || 500;
      errorMessage = (error instanceof Error ? error.message : String(error));
    } else if (error instanceof Error) {
      errorMessage = (error instanceof Error ? error.message : String(error));
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
