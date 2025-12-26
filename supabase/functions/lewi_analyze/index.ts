import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Connect to Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
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

    const { mode, doc_ids, question } = await req.json();

    if (!mode || !Array.isArray(doc_ids) || doc_ids.length === 0) {
      throw new Error("Missing or invalid parameters (mode, doc_ids)");
    }

    // Fetch documents
    const { data: docs, error } = await supabase
      .from("parsed_documents")
      .select("id, parsed_data, document_type, file_name, created_at")
      .in("id", doc_ids);

    if (error) throw error;
    if (!docs || docs.length === 0) throw new Error("No documents found for given IDs");

    // Prepare text for AI
    const context = docs
      .map(
        (d) =>
          `Document: ${d.file_name || d.document_type || "Unknown"}\nParsed Data:\n${JSON.stringify(
            d.parsed_data,
            null,
            2
          )}`
      )
      .join("\n\n---\n\n");

    // Build prompt
    let systemPrompt = "";
    let userPrompt = "";

    switch (mode) {
      case "summarize":
        systemPrompt =
          "You are Lewi, an expert insurance data analyst. Summarize the following parsed insurance document clearly and concisely.";
        userPrompt = `Summarize this document:\n${context}`;
        break;

      case "compare":
        systemPrompt =
          "You are Lewi, an expert insurance analyst who compares policies and identifies key differences.";
        userPrompt = `Compare the following documents and return clear differences in coverage, premiums, and key terms:\n${context}`;
        break;

      case "question":
        if (!question) throw new Error("Question text required for mode=question");
        systemPrompt =
          "You are Lewi, an insurance policy assistant who answers questions based on parsed data.";
        userPrompt = `Question: ${question}\n\nContext:\n${context}`;
        break;

      default:
        throw new Error(`Unsupported mode: ${mode}`);
    }

    // Azure OpenAI request
    const AZURE_OPENAI_ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const AZURE_OPENAI_KEY = Deno.env.get("AZURE_OPENAI_KEY");
    const DEPLOYMENT = Deno.env.get("AZURE_OPENAI_DEPLOYMENT_NAME");

    if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY || !DEPLOYMENT)
      throw new Error("Azure OpenAI credentials missing");

    const aiResponse = await fetch(
      `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=2024-02-15-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": AZURE_OPENAI_KEY,
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      throw new Error(`Azure OpenAI error: ${aiResponse.status} - ${errorText}`);
    }

    const result = await aiResponse.json();
    const output = result.choices?.[0]?.message?.content ?? "No response.";

    return new Response(
      JSON.stringify({ success: true, mode, doc_count: docs.length, output }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: unknown) {
    console.error("Lewi error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
