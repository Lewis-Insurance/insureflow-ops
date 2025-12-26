import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { AuthenticationError, ValidationError, NotFoundError, createErrorResponse } from "../_shared/error-handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logger = createLogger("parseur-webhook");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  logger.logRequest(req);

  try {
    // SECURITY: Validate API key from header
    const apiKey = req.headers.get("x-make-apikey");
    const expectedApiKey = Deno.env.get("PARSEUR_WEBHOOK_API_KEY");

    // Fail closed: if env var not set, reject all requests
    if (!expectedApiKey) {
      logger.error("PARSEUR_WEBHOOK_API_KEY not configured - rejecting request");
      throw new AuthenticationError("Server configuration error");
    }

    if (apiKey !== expectedApiKey) {
      logger.warn("Invalid API key attempt");
      throw new AuthenticationError("Invalid API key");
    }

    const payload = await req.json();
    logger.info("Received Parseur webhook", { documentId: payload?.document?.id });

    const doc = payload?.document;
    if (!doc) {
      throw new ValidationError("Missing document data in Parseur webhook");
    }

    const parseurId = doc.id;
    const workspaceId = doc.metadata?.workspace_id;
    const fileName = doc.metadata?.file_name || doc.file_name;
    const parsedData = doc.data || doc.parsed_data || {};
    const documentType = doc.document_type || doc.name || "unknown";
    const sourceUrl = doc.source_url || null;
    const accountId = doc.account_id || doc.metadata?.account_id || null;

    if (!parseurId) {
      throw new ValidationError("Missing Parseur document ID");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    logger.debug("Looking up workspace_document", { parseurId, workspaceId, fileName });

    // Find the matching workspace_document either by parseurId or by workspace + file_name
    const { data: workspaceDoc, error: docError } = await supabase
      .from("workspace_documents")
      .select("id, workspace_id")
      .or(`parseur_document_id.eq.${parseurId},and(workspace_id.eq.${workspaceId},file_name.eq.${fileName})`)
      .maybeSingle();

    if (docError || !workspaceDoc) {
      logger.warn("No matching workspace_document found", { error: docError?.message });
      throw new NotFoundError("No matching workspace document");
    }

    logger.info("Found workspace_document", { documentId: workspaceDoc.id });

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

    logger.info("Parsed data linked to workspace_document", { documentId: workspaceDoc.id });

    // Trigger the analyzer automatically
    await fetch(`${supabaseUrl}/functions/v1/analyze-workspace`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ workspace_id: workspaceDoc.workspace_id }),
    });

    logger.info("Triggered analysis for workspace", { workspaceId: workspaceDoc.workspace_id });

    const response = { success: true, workspace_id: workspaceDoc.workspace_id };
    logger.logResponse(200);
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: unknown) {
    logger.error("Webhook error", { error: err instanceof Error ? err.message : String(err) });
    return createErrorResponse(err, corsHeaders);
  }
});
