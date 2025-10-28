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

    // Find the corresponding workspace_document
    // Parseur should send parseur_document_id or file_name in the payload
    const parseurDocId = body.parseur_document_id || body.document_id;
    const fileName = body.file_name;

    console.log("Looking for workspace_document with parseur_document_id:", parseurDocId, "or file_name:", fileName);

    // Try to find by parseur_document_id first, then by file_name
    let workspaceDocQuery = supabase
      .from("workspace_documents")
      .select("id, workspace_id, file_name");

    if (parseurDocId) {
      workspaceDocQuery = workspaceDocQuery.eq("parseur_document_id", parseurDocId);
    } else if (fileName) {
      workspaceDocQuery = workspaceDocQuery.eq("file_name", fileName);
    } else {
      throw new Error("Missing parseur_document_id and file_name in webhook payload");
    }

    const { data: workspaceDoc, error: docError } = await workspaceDocQuery.maybeSingle();

    if (docError) {
      console.error("Error finding workspace_document:", docError);
      throw docError;
    }

    if (!workspaceDoc) {
      console.error("No workspace_document found for parseur_document_id:", parseurDocId, "or file_name:", fileName);
      throw new Error("Workspace document not found");
    }

    console.log("Found workspace_document:", workspaceDoc.id);

    // Insert the parsed document with proper linkage
    const { data, error } = await supabase
      .from("parsed_documents")
      .insert({
        workspace_document_id: workspaceDoc.id,
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

    console.log("✅ Parseur payload stored and linked to workspace_document:", workspaceDoc.id, "parsed_documents id:", data.id);

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
