import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Get Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Parse body
    const { title, task_type, client_name, notes, documents } = await req.json();

    if (!task_type || !documents || !Array.isArray(documents) || documents.length === 0) {
      throw new Error("Missing required fields: task_type or documents[]");
    }

    // Init Supabase with Authorization header to get user context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    // Create workspace
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .insert({
        name: title || task_type,
        description: notes || null,
        task_type,
        status: "idle",
        created_by: user.id,
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

    const { error: docError } = await supabase.from("workspace_documents").insert(docsToInsert);

    if (docError) throw docError;

    // Send files to Parseur for automatic parsing
    const PARSEUR_API_KEY = Deno.env.get("PARSEUR_API_KEY");
    const PARSEUR_MAILBOX_ID = Deno.env.get("PARSEUR_MAILBOX_ID");

    console.log("ENV CHECK", {
      apiKeyStart: PARSEUR_API_KEY?.substring(0, 6),
      mailboxId: PARSEUR_MAILBOX_ID,
    });

    if (PARSEUR_API_KEY && PARSEUR_MAILBOX_ID) {
      for (const d of documents) {
        if (d.file_url) {
          try {
            const parseurResp = await fetch(`https://api.parseur.com/v2/mailboxes/${PARSEUR_MAILBOX_ID}/documents/`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${PARSEUR_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                file_url: d.file_url,
              }),
            });

            if (!parseurResp.ok) {
              console.error("Parseur API error:", await parseurResp.text());
            } else {
              console.log(`Sent ${d.file_name} to Parseur successfully`);
            }
          } catch (err) {
            console.error(`Failed to send ${d.file_name} to Parseur:`, err);
          }
        }
      }
    }

    console.log(`Workspace ${workspace.id} created with ${documents.length} documents.`);

    return new Response(JSON.stringify({ success: true, workspace }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Create Workspace error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
