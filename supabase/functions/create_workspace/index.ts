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
            const fileName = d.file_name || "document.pdf";
            console.log(`Processing file: ${fileName} from URL: ${d.file_url}`);

            let fileBlob: Blob;

            // Step 1: Determine if this is a Supabase Storage URL or external URL
            const isSupabaseStorage = d.file_url.includes(supabaseUrl) || 
                                     d.file_url.includes('/storage/v1/object/');

            if (isSupabaseStorage) {
              // Option A: Extract bucket and path, then download via Supabase SDK
              console.log("Detected Supabase Storage URL, using authenticated download");

              // Parse the storage URL to extract bucket and path
              // URL format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
              // or: https://{project}.supabase.co/storage/v1/object/authenticated/{bucket}/{path}
              
              const storageMatch = d.file_url.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)/);
              
              if (storageMatch) {
                const bucket = storageMatch[1];
                const path = storageMatch[2];
                
                console.log(`Downloading from bucket: ${bucket}, path: ${path}`);

                // Download using Supabase client (with proper auth)
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from(bucket)
                  .download(path);

                if (downloadError) {
                  throw new Error(`Failed to download from Supabase Storage: ${downloadError.message}`);
                }

                fileBlob = fileData;
                console.log(`File downloaded from Supabase Storage: ${fileBlob.size} bytes`);
              } else {
                // Fallback: Try creating a signed URL and downloading
                console.log("Could not parse storage path, attempting signed URL method");
                
                // Try to extract bucket/path another way or use signed URL
                const urlParts = d.file_url.split('/storage/v1/object/');
                if (urlParts.length > 1) {
                  const pathPart = urlParts[1].replace(/^(public|authenticated|sign)\//, '');
                  const [bucket, ...pathSegments] = pathPart.split('/');
                  const path = pathSegments.join('/');

                  // Create a signed URL (valid for 60 seconds)
                  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
                    .from(bucket)
                    .createSignedUrl(path, 60);

                  if (signedUrlError) {
                    throw new Error(`Failed to create signed URL: ${signedUrlError.message}`);
                  }

                  console.log("Fetching via signed URL");
                  const fileResponse = await fetch(signedUrlData.signedUrl);
                  
                  if (!fileResponse.ok) {
                    throw new Error(`Failed to fetch via signed URL: ${fileResponse.statusText}`);
                  }

                  fileBlob = await fileResponse.blob();
                } else {
                  throw new Error("Could not parse Supabase Storage URL");
                }
              }
            } else {
              // Option B: External URL - fetch directly
              console.log("Detected external URL, fetching directly");
              
              const fileResponse = await fetch(d.file_url);
              
              if (!fileResponse.ok) {
                throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
              }

              fileBlob = await fileResponse.blob();
              console.log(`File fetched: ${fileName}, size: ${fileBlob.size} bytes`);
            }

            // Step 2: Create FormData with the file
            const formData = new FormData();
            formData.append("file", fileBlob, fileName);

            // Optional: Add custom metadata as query params
            const metadata = {
              workspace_id: workspace.id,
              task_type: task_type,
              client_name: client_name || null,
            };

            const queryParams = new URLSearchParams();
            Object.entries(metadata).forEach(([key, value]) => {
              if (value !== null) {
                queryParams.append(key, String(value));
              }
            });

            // Step 3: Upload to Parseur
            const parseurUrl = `https://api.parseur.com/parser/${PARSEUR_MAILBOX_ID}/upload?${queryParams.toString()}`;
            
            console.log(`Uploading to Parseur: ${parseurUrl}`);

            const parseurResp = await fetch(parseurUrl, {
              method: "POST",
              headers: {
                "Authorization": `Token ${PARSEUR_API_KEY}`,
              },
              body: formData,
            });

            const responseText = await parseurResp.text();
            
            if (!parseurResp.ok) {
              console.error("Parseur API error:", {
                status: parseurResp.status,
                statusText: parseurResp.statusText,
                body: responseText,
                file: fileName,
              });
            } else {
              try {
                const parseurData = JSON.parse(responseText);
                console.log(`✓ Sent ${fileName} to Parseur successfully:`, {
                  message: parseurData.message,
                  attachments: parseurData.attachments,
                });

                // Store DocumentID for later correlation
                if (parseurData.attachments && parseurData.attachments.length > 0) {
                  const documentId = parseurData.attachments[0].DocumentID;
                  console.log(`DocumentID for tracking: ${documentId}`);
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
