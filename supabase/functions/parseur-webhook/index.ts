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
    const workspaceId = doc.metadata?.workspace_id; // from upload metadata
    const parsedData = doc.data || {};
    const documentType = doc.document_type || doc.name || "unknown";

    if (!parseurId) throw new Error("Missing Parseur document ID");
    if (!workspaceId) throw new Error("Missing workspace_id metadata from Parseur");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1️⃣ Find the related workspace_document using parseur_document_id or workspace_id
    const { data: workspaceDoc, error: docError } = await supabase
      .from("workspace_documents")
      .select("id, file_name, workspace_id")
      .or(`parseur_document_id.eq.${parseurId},workspace_id.eq.${workspaceId}`)
      .limit(1)
      .single();

    if (docError || !workspaceDoc) {
      console.error("No matching workspace_document found:", docError);
      return new Response(JSON.stringify({ success: false, error: "No matching document" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    console.log(`Matched document: ${workspaceDoc.file_name} → ${workspaceDoc.id}`);

    // 2️⃣ Insert parsed data
    const { data: parsedRow, error: insertError } = await supabase
      .from("parsed_documents")
      .insert({
        workspace_document_id: workspaceDoc.id,
        parseur_document_id: parseurId,
        document_type: documentType,
        parsed_data: parsedData,
        source: "parseur_webhook",
        workspace_id: workspaceDoc.workspace_id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    console.log(`✓ Parsed data inserted: ${parsedRow.id}`);

    // 3️⃣ Optionally update workspace status to trigger analysis pipeline
    await supabase
      .from("workspaces")
      .update({
        status: "ready_for_analysis",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceDoc.workspace_id);

    console.log(`Workspace ${workspaceDoc.workspace_id} marked ready_for_analysis`);

    return new Response(JSON.stringify({ success: true, parsed_id: parsedRow.id }), {
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
