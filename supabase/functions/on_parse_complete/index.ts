// @ts-nocheck
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

    const { record } = await req.json();
    const parsedId = record?.id;
    if (!parsedId) throw new Error("Missing parsed document ID.");

    // Find workspace that references this parsed document
    const { data: docLinks, error: linkErr } = await supabase
      .from("workspace_documents")
      .select("workspace_id")
      .eq("parsed_doc_id", parsedId);

    if (linkErr) throw linkErr;
    if (!docLinks || docLinks.length === 0) {
      console.log("No workspace linked to parsed document:", parsedId);
      return new Response("No workspace match", { status: 200 });
    }

    const workspaceId = docLinks[0].workspace_id;

    // Get workspace details
    const { data: workspace, error: wsErr } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (wsErr) throw wsErr;

    // Find all docs under this workspace that are parsed
    const { data: allDocs, error: allErr } = await supabase
      .from("workspace_documents")
      .select("parsed_doc_id")
      .eq("workspace_id", workspaceId)
      .not("parsed_doc_id", "is", null);

    if (allErr) throw allErr;
    const parsedIds = allDocs.map((d) => d.parsed_doc_id);

    if (parsedIds.length === 0) {
      console.log("Workspace has no parsed docs yet.");
      return new Response("Waiting for more docs", { status: 200 });
    }

    // Trigger Lewi's analysis
    const analyzeUrl = `${supabaseUrl}/functions/v1/lewi_analyze`;

    const aiResponse = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        mode:
          workspace.task_type === "coverage_comparison"
            ? "compare"
            : "summarize",
        doc_ids: parsedIds,
      }),
    });

    const aiResult = await aiResponse.json();

    // Save results
    await supabase
      .from("workspaces")
      .update({
        status: "completed",
        analysis_output: aiResult,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspaceId);

    console.log("Lewi auto-analysis complete for workspace:", workspaceId);

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
      status: 200,
    });
  } catch (err: unknown) {
    console.error("on_parse_complete error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: corsHeaders,
      status: 500,
    });
  }
});
