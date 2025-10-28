import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- MAIN HANDLER ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify API key from Authorization header
    const authHeader = req.headers.get("Authorization");
    const expectedSecret = Deno.env.get("PARSEUR_WEBHOOK_SECRET");

    if (!expectedSecret) {
      console.error("PARSEUR_WEBHOOK_SECRET not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Webhook not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Extract token from "Bearer <token>" format
    const providedToken = authHeader?.replace(/^Bearer\s+/i, "");

    if (!providedToken || providedToken !== expectedSecret) {
      console.error("Invalid or missing API key");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    console.log("✅ API key verified");

    // Parseur sends JSON payloads by default
    const body = await req.json();

    // Connect to Supabase with service key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert the parsed document
    const { data, error } = await supabase
      .from("parsed_documents")
      .insert({
        source: "parseur",
        document_type: body.document_type ?? "unknown",
        file_name: body.file_name ?? null,
        parsed_data: body,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    console.log("Parseur payload stored:", data.id);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
