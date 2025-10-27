import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    // Convert file to base64 for AI processing
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    // Determine media type
    let mediaType = 'image/jpeg';
    if (fileName.endsWith('.png')) mediaType = 'image/png';
    else if (fileName.endsWith('.webp')) mediaType = 'image/webp';
    else if (fileName.endsWith('.pdf')) mediaType = 'application/pdf';

    console.log(`Processing ${isImage ? 'image' : 'PDF'}: ${file.name}`);

    // Use Lovable AI to extract knowledge from the document
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
            content: [
              {
                type: "text",
                text: isImage 
                  ? "Extract all insurance knowledge from this document screenshot. Include policy details, coverage information, procedures, and any other relevant information."
                  : "Extract all insurance knowledge from this PDF document. Parse all pages and extract policy details, coverage information, procedures, and any other relevant information."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mediaType};base64,${base64}`
                }
              }
            ]
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

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Rate limit exceeded. Please try again later." 
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: "Payment required. Please add credits to your workspace." 
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error("AI processing failed");
    }

    const aiResult = await aiResponse.json();
    console.log("AI Response:", JSON.stringify(aiResult, null, 2));
    
    // Extract the tool call result
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || !toolCall.function?.arguments) {
      throw new Error("No structured data returned from AI");
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    const entries = extractedData.entries || [];
    const metadata = extractedData.document_metadata || {};

    console.log(`Extracted ${entries.length} knowledge entries`);

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
        entries: enrichedEntries,
        metadata: {
          fileName: file.name,
          fileType: isImage ? 'image' : 'pdf',
          totalEntries: enrichedEntries.length,
          ...metadata
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error processing document:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
