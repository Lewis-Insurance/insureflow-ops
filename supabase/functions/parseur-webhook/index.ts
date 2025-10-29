import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    console.log("Received Parseur webhook:", JSON.stringify(payload, null, 2));

    const doc = payload?.document;
    if (!doc) throw new Error("Missing document data in Parseur webhook");

    const parseurId = doc.id;
    const parsedData = doc.data || {};
    const documentType = doc.document_type || doc.name || "unknown";

    if (!parseurId) throw new Error("Missing Parseur document ID");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Look up the correct workspace_document
    const { data: workspaceDoc, error: docError } = await supabase
      .from("workspace_documents")
      .select("id, workspace_id")
      .eq("parseur_document_id", parseurId)
      .single();

    if (docError || !workspaceDoc) {
      console.error("No workspace_document found for Parseur ID:", parseurId);
      throw new Error("No matching document found in workspace_documents");
    }

    // Insert parsed data and link it
    const { error: insertError } = await supabase
      .from("parsed_documents")
      .insert({
        workspace_document_id: workspaceDoc.id,
        parseur_document_id: parseurId,
        parsed_data: parsedData,
        document_type: documentType || "unknown",
        source: "parseur_webhook",
      });

    if (insertError) throw insertError;

    console.log(`✓ Parsed data linked to workspace_document ${workspaceDoc.id}`);

    // Update workspace status to trigger analysis pipeline
    await supabase
      .from("workspaces")
      .update({
        status: "ready_for_analysis",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceDoc.workspace_id);

    console.log(`Workspace ${workspaceDoc.workspace_id} marked ready_for_analysis`);

    return new Response(JSON.stringify({ success: true, workspace_id: workspaceDoc.workspace_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
