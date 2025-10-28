import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseJwtPayload } from "https://esm.sh/@supabase/auth-helpers-shared@0.6.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Extract JWT from the Authorization header
    const authHeader = req.headers.get("authorization")?.split("Bearer ")[1];
    let user_id: string | null = null;

    if (authHeader) {
      try {
        const payload = getSupabaseJwtPayload(authHeader);
        user_id = payload?.sub ?? null;
      } catch (e) {
        console.warn("JWT parse failed:", e);
      }
    }

    // Parse body
    const { title, task_type, client_name, notes, documents } = await req.json();

    if (!task_type || !documents || !Array.isArray(documents) || documents.length === 0) {
      throw new Error("Missing required fields: task_type or documents[]");
    }

    // Init Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create workspace
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .insert({
        name: title || task_type,
        description: notes || null,
        task_type,
        status: "idle",
        created_by: user_id,
        client_name: client_name || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (wsError) throw wsError;

    // Attach uploaded docs
    const docsToInsert = documents.map((d: any) => ({
      workspace_id: workspace.id,
      file_name: d.file_name || null,
      file_url: d.file_url || null,
      role: d.role || null,
    }));

    const { error: docError } = await supabase
      .from("workspace_documents")
      .insert(docsToInsert);

    if (docError) throw docError;

    console.log(`Workspace ${workspace.id} created with ${documents.length} documents.`);

    return new Response(
      JSON.stringify({ success: true, workspace }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    console.error("Create Workspace error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
