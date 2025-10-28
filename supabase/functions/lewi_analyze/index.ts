import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentIds, action, question } = await req.json();

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "documentIds array is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Get Azure OpenAI config
    const azureEndpoint = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const azureKey = Deno.env.get("AZURE_OPENAI_KEY");
    const deploymentName = Deno.env.get("AZURE_OPENAI_DEPLOYMENT_NAME");

    if (!azureEndpoint || !azureKey || !deploymentName) {
      console.error("Azure OpenAI credentials not configured");
      return new Response(
        JSON.stringify({ error: "Azure OpenAI not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Fetch documents from parsed_documents
    const { data: documents, error: fetchError } = await supabaseClient
      .from("parsed_documents")
      .select("*")
      .in("id", documentIds);

    if (fetchError) {
      console.error("Error fetching documents:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch documents", details: fetchError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Build prompt based on action
    let systemPrompt = "You are an insurance document analysis expert. Provide clear, structured analysis.";
    let userPrompt = "";

    switch (action) {
      case "summarize":
        if (documents.length === 1) {
          userPrompt = `Summarize this insurance document:\n\n${JSON.stringify(documents[0].parsed_data, null, 2)}`;
        } else {
          userPrompt = `Summarize these ${documents.length} insurance documents:\n\n${documents.map((doc, i) => 
            `Document ${i + 1}:\n${JSON.stringify(doc.parsed_data, null, 2)}`
          ).join("\n\n")}`;
        }
        break;

      case "compare":
        if (documents.length < 2) {
          return new Response(
            JSON.stringify({ error: "At least 2 documents required for comparison" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        userPrompt = `Compare these insurance documents and highlight key differences in coverage, premiums, and terms:\n\n${documents.map((doc, i) => 
          `Document ${i + 1}:\n${JSON.stringify(doc.parsed_data, null, 2)}`
        ).join("\n\n")}`;
        break;

      case "question":
        if (!question) {
          return new Response(
            JSON.stringify({ error: "Question is required for Q&A action" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }
        userPrompt = `Answer this question about the insurance document(s):\n\nQuestion: ${question}\n\nDocuments:\n${documents.map((doc, i) => 
          `Document ${i + 1}:\n${JSON.stringify(doc.parsed_data, null, 2)}`
        ).join("\n\n")}`;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: summarize, compare, or question" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }

    // Call Azure OpenAI
    console.log("Calling Azure OpenAI...");
    const apiUrl = `${azureEndpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-08-01-preview`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": azureKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Azure OpenAI error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Azure OpenAI request failed", details: errorText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const aiResult = await response.json();
    const analysis = aiResult.choices?.[0]?.message?.content || "No analysis returned";

    console.log("✅ Analysis complete");

    return new Response(
      JSON.stringify({
        success: true,
        action,
        documentCount: documents.length,
        analysis,
        documents: documents.map(d => ({
          id: d.id,
          file_name: d.file_name,
          file_type: d.file_type
        }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error in lewi_analyze:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
