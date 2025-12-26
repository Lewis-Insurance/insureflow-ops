import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No file provided' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get API keys
    const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    if (!GOOGLE_VISION_API_KEY) {
      throw new Error("GOOGLE_CLOUD_VISION_API_KEY is not configured");
    }

    const fileName = file.name.toLowerCase();
    const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || 
                    fileName.endsWith('.png') || fileName.endsWith('.webp');
    const isPdf = fileName.endsWith('.pdf');

    if (!isImage && !isPdf) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid file type. Only PDF and images (JPG, PNG, WEBP) are accepted.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing ${isImage ? 'image' : 'PDF'}: ${file.name}`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Step 1: Extract text using Google Vision API
    console.log('Extracting text with Google Vision API...');
    let extractedText = '';

    if (isPdf) {
      // Use files:annotate for PDFs
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/files:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              inputConfig: {
                content: base64,
                mimeType: 'application/pdf'
              },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
            }]
          })
        }
      );

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        console.error('Vision API error:', errorText);
        throw new Error(`Vision API error: ${visionResponse.status}`);
      }

      const visionData = await visionResponse.json();
      
      // Extract text from nested responses (PDF pages)
      if (visionData.responses?.[0]?.responses) {
        extractedText = visionData.responses[0].responses
          .map((r: any, i: number) => {
            const text = r.fullTextAnnotation?.text || '';
            return text ? `=== Page ${i + 1} ===\n${text}` : '';
          })
          .filter((t: string) => t)
          .join('\n\n');
      } else if (visionData.responses?.[0]?.fullTextAnnotation?.text) {
        extractedText = visionData.responses[0].fullTextAnnotation.text;
      }
    } else {
      // Use images:annotate for images
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [
                { type: 'DOCUMENT_TEXT_DETECTION' },
                { type: 'TEXT_DETECTION' }
              ],
              imageContext: {
                languageHints: ['en']
              }
            }]
          })
        }
      );

      if (!visionResponse.ok) {
        const errorText = await visionResponse.text();
        console.error('Vision API error:', errorText);
        throw new Error(`Vision API error: ${visionResponse.status}`);
      }

      const visionData = await visionResponse.json();
      extractedText = visionData.responses[0]?.fullTextAnnotation?.text || '';
    }

    if (!extractedText) {
      throw new Error('No text extracted from document');
    }

    console.log(`Google Vision OCR complete: ${extractedText.length} characters extracted`);

    // Step 2: Use Lovable AI to structure the extracted knowledge
    let entries: any[] = [];
    let metadata: any = {};

    if (OPENAI_API_KEY) {
      console.log('Structuring knowledge with OpenAI...');

      const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          messages: [
            {
              role: "system",
              content: `You are an expert at extracting insurance knowledge from documents. Extract structured knowledge entries that can be used in a knowledge base.

For each distinct piece of information, create a knowledge entry with:
- title: A clear, concise title (question format preferred)
- content: The detailed answer or explanation
- category: One of: policies, claims, products, regulations, procedures, faqs
- tags: Relevant comma-separated tags

Focus on actionable information like:
- Coverage details and limits
- Policy terms and definitions
- Claim procedures
- Premium information
- State requirements
- Exclusions and limitations
- Contact information
- Important dates or deadlines

Return your response as a JSON array of knowledge entries.`
            },
            {
              role: "user",
              content: `Extract all insurance knowledge from this document text:\n\n${extractedText.substring(0, 50000)}`
            }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_knowledge",
                description: "Extract structured knowledge entries from the document",
                parameters: {
                  type: "object",
                  properties: {
                    entries: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { 
                            type: "string",
                            description: "Clear title for the knowledge entry, preferably in question format"
                          },
                          content: { 
                            type: "string",
                            description: "Detailed content, answer, or explanation"
                          },
                          category: { 
                            type: "string",
                            enum: ["policies", "claims", "products", "regulations", "procedures", "faqs"],
                            description: "Category of the knowledge"
                          },
                          tags: { 
                            type: "string",
                            description: "Comma-separated relevant tags"
                          }
                        },
                        required: ["title", "content", "category", "tags"]
                      }
                    },
                    document_metadata: {
                      type: "object",
                      properties: {
                        document_type: { type: "string" },
                        carrier: { type: "string" },
                        policy_number: { type: "string" },
                        effective_date: { type: "string" }
                      }
                    }
                  },
                  required: ["entries"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "extract_knowledge" } }
        }),
      });

      if (aiResponse.ok) {
        const aiResult = await aiResponse.json();
        console.log("AI Response received");
        
        // Extract the tool call result
        const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall && toolCall.function?.arguments) {
          const extractedData = JSON.parse(toolCall.function.arguments);
          entries = extractedData.entries || [];
          metadata = extractedData.document_metadata || {};
          console.log(`Extracted ${entries.length} knowledge entries`);
        }
      } else if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Rate limit exceeded. Please try again later." 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Payment required. Please add credits to your workspace." 
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Add source information to each entry
    const enrichedEntries = entries.map((entry: any) => ({
      ...entry,
      source: `Uploaded: ${file.name}`,
      carrier: metadata.carrier || 'ALL',
      jurisdiction: 'FL'
    }));

    return new Response(
      JSON.stringify({ 
        success: true,
        extracted_text: extractedText,
        text_length: extractedText.length,
        entries: enrichedEntries,
        metadata: {
          fileName: file.name,
          fileType: isImage ? 'image' : 'pdf',
          totalEntries: enrichedEntries.length,
          extractionMethod: 'Google Vision OCR',
          ...metadata
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error("Error processing document:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : "Unknown error occurred"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
