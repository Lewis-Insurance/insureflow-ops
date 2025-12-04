// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Validate API key from header
    const apiKey = req.headers.get("x-make-apikey");
    const expectedApiKey = Deno.env.get("PARSEUR_WEBHOOK_API_KEY");
    
    if (expectedApiKey && apiKey !== expectedApiKey) {
      console.error("Invalid API key");
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const payload = await req.json();
    console.log("Received Parseur webhook:", JSON.stringify(payload, null, 2));

    const doc = payload?.document;
    if (!doc) throw new Error("Missing document data in Parseur webhook");

    const parseurId = doc.id;
    const workspaceId = doc.metadata?.workspace_id;
    const fileName = doc.metadata?.file_name || doc.file_name;
    const parsedData = doc.data || doc.parsed_data || {};
    const documentType = doc.document_type || doc.name || "unknown";
    const sourceUrl = doc.source_url || null;
    const accountId = doc.account_id || doc.metadata?.account_id || null;

    if (!parseurId) throw new Error("Missing Parseur document ID");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Looking up workspace_document for Parseur ID: ${parseurId}, workspace: ${workspaceId}, file: ${fileName}`);

    // Find the matching workspace_document either by parseurId or by workspace + file_name
    const { data: workspaceDoc, error: docError } = await supabase
      .from("workspace_documents")
      .select("id, workspace_id")
      .or(`parseur_document_id.eq.${parseurId},and(workspace_id.eq.${workspaceId},file_name.eq.${fileName})`)
      .maybeSingle();

    if (docError || !workspaceDoc) {
      console.error("No matching workspace_document found:", docError);
      return new Response(JSON.stringify({ success: false, error: "No matching document" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    console.log(`Found workspace_document: ${workspaceDoc.id}`);

    // Insert parsed data and link it
    const { error: insertError } = await supabase
      .from("parsed_documents")
      .insert({
        workspace_document_id: workspaceDoc.id,
        parseur_document_id: parseurId,
        parsed_data: parsedData,
        document_type: documentType || "unknown",
        source: "parseur",
        file_name: fileName || null,
        source_url: sourceUrl,
        account_id: accountId,
      });

    if (insertError) throw insertError;

    console.log(`✓ Parsed data linked to workspace_document ${workspaceDoc.id}`);

    // Trigger the analyzer automatically
    await fetch(`${supabaseUrl}/functions/v1/analyze-workspace`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ workspace_id: workspaceDoc.workspace_id }),
    });

    console.log(`Triggered analysis for workspace ${workspaceDoc.workspace_id}`);

    return new Response(JSON.stringify({ success: true, workspace_id: workspaceDoc.workspace_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: unknown) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
