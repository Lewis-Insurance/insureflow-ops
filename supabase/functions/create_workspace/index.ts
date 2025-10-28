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

    console.log("Parseur config check", {
      apiKeyPresent: !!PARSEUR_API_KEY,
      mailboxId: PARSEUR_MAILBOX_ID,
    });

    if (PARSEUR_API_KEY && PARSEUR_MAILBOX_ID) {
      for (const d of documents) {
        if (d.file_url) {
          try {
            console.log(`Fetching file from: ${d.file_url}`);

            // Step 1: Fetch the file from Supabase Storage
            const fileResponse = await fetch(d.file_url);
            if (!fileResponse.ok) {
              throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
            }

            const fileBlob = await fileResponse.blob();
            const fileName = d.file_name || "document.pdf";

            console.log(`File fetched: ${fileName}, size: ${fileBlob.size} bytes`);

            // Step 2: Create FormData with the file
            const formData = new FormData();
            formData.append("file", fileBlob, fileName);

            // Optional: Add custom metadata to track this upload
            formData.append("metadata", JSON.stringify({
              workspace_id: workspace.id,
              task_type: task_type,
              client_name: client_name || null,
            }));

            // Step 3: Upload to Parseur
            // Correct endpoint: /parser/{mailbox_id}/upload
            // Correct auth: Just the API key in Authorization header (no "Token" or "Bearer")
            const parseurResp = await fetch(
              `https://api.parseur.com/parser/${PARSEUR_MAILBOX_ID}/upload`,
              {
                method: "POST",
                headers: {
                  "Authorization": PARSEUR_API_KEY,
                  // Don't set Content-Type - FormData sets it automatically with boundary
                },
                body: formData,
              }
            );

            const responseText = await parseurResp.text();
            
            if (!parseurResp.ok) {
              console.error("Parseur API error:", {
                status: parseurResp.status,
                statusText: parseurResp.statusText,
                body: responseText,
                file: fileName,
              });
            } else {
              // Parse the response to get DocumentID
              try {
                const parseurData = JSON.parse(responseText);
                console.log(`✓ Sent ${fileName} to Parseur successfully:`, {
                  message: parseurData.message,
                  attachments: parseurData.attachments,
                });

                // Optional: Store DocumentID for later correlation
                if (parseurData.attachments && parseurData.attachments.length > 0) {
                  const documentId = parseurData.attachments[0].DocumentID;
                  console.log(`DocumentID for tracking: ${documentId}`);
                  
                  // You could update the workspace_documents table with this ID
                  // await supabase.from("workspace_documents")
                  //   .update({ parseur_document_id: documentId })
                  //   .eq("file_url", d.file_url)
                  //   .eq("workspace_id", workspace.id);
                }
              } catch (parseErr) {
                console.log(`✓ Sent ${fileName} to Parseur (raw response):`, responseText);
              }
            }
          } catch (err) {
            console.error(`Failed to send ${d.file_name} to Parseur:`, err);
          }
        }
      }
    } else {
      console.warn("Parseur credentials not configured - skipping document parsing");
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
