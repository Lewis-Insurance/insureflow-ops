import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { title, task_type, client_name, notes, documents, customer_id, policy_id } = await req.json();

    // Log what we received
    console.log("Received payload:", {
      title,
      task_type,
      client_name,
      customer_id,
      policy_id,
      documents: documents?.length,
    });

    if (!task_type || !documents || !Array.isArray(documents) || documents.length === 0) {
      throw new Error("Missing required fields: task_type or documents[]");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("User not authenticated");
    }

    // Validate customer_id exists in database if provided
    let validatedCustomerId = null;
    if (customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('account_id')
        .eq('account_id', customer_id)
        .single();
      
      if (!customerError && customer) {
        validatedCustomerId = customer_id;
        console.log("✓ Valid customer_id:", customer_id);
      } else {
        console.log("⚠ Invalid customer_id, will be omitted:", customer_id);
      }
    }

    // Validate policy_id exists in database if provided
    let validatedPolicyId = null;
    if (policy_id) {
      const { data: policy, error: policyError } = await supabase
        .from('policies')
        .select('policy_id')
        .eq('policy_id', policy_id)
        .single();
      
      if (!policyError && policy) {
        validatedPolicyId = policy_id;
        console.log("✓ Valid policy_id:", policy_id);
      } else {
        console.log("⚠ Invalid policy_id, will be omitted:", policy_id);
      }
    }

    // Create workspace with better naming
    const workspaceName = title 
      ? title 
      : task_type
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

    // Build workspace data with only validated foreign keys
    const workspaceData: any = {
      name: workspaceName,
      description: notes || null,
      task_type,
      status: "idle",
      created_by: user.id,
      client_name: client_name || null,
      notes: notes || null,
    };

    // Only include validated foreign keys
    if (validatedCustomerId) {
      workspaceData.customer_id = validatedCustomerId;
    }

    if (validatedPolicyId) {
      workspaceData.policy_id = validatedPolicyId;
    }

    console.log("Creating workspace with data:", workspaceData);

    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .insert(workspaceData)
      .select()
      .single();

    if (wsError) throw wsError;

    const docsToInsert = documents.map((d: any) => ({
      workspace_id: workspace.id,
      file_name: d.file_name || null,
      file_url: d.file_url || null,
      role: d.role || null,
    }));

    const { error: docError } = await supabase.from("workspace_documents").insert(docsToInsert);
    if (docError) throw docError;

    const PARSEUR_API_KEY = Deno.env.get("PARSEUR_API_KEY");
    const PARSEUR_MAILBOX_ID = Deno.env.get("PARSEUR_MAILBOX_ID");

    console.log("Parseur config:", {
      apiKeyPresent: !!PARSEUR_API_KEY,
      mailboxId: PARSEUR_MAILBOX_ID,
    });

    if (PARSEUR_API_KEY && PARSEUR_MAILBOX_ID) {
      for (const d of documents) {
        if (!d.file_url) {
          console.log(`Skipping document without file_url: ${d.file_name}`);
          continue;
        }

        const fileName = d.file_name || "document.pdf";
        console.log(`\n=== Processing: ${fileName} ===`);
        console.log(`File URL: ${d.file_url}`);
        console.log(`URL Type: ${typeof d.file_url}`);

        try {
          let fileBlob: Blob;

          // Check if this is a Supabase Storage URL
          const isSupabaseStorage = 
            d.file_url.includes('/storage/v1/object/') ||
            d.file_url.includes(supabaseUrl);

          console.log(`Is Supabase Storage: ${isSupabaseStorage}`);

          if (isSupabaseStorage) {
            // Parse Supabase Storage URL
            // Format: https://{project}.supabase.co/storage/v1/object/public/{bucket}/{path}
            // or: https://{project}.supabase.co/storage/v1/object/authenticated/{bucket}/{path}
            // or: https://{project}.supabase.co/storage/v1/object/sign/{bucket}/{path}
            
            const urlObj = new URL(d.file_url);
            const pathParts = urlObj.pathname.split('/');
            
            console.log(`URL pathname: ${urlObj.pathname}`);
            console.log(`Path parts:`, pathParts);

            // Find where 'object' appears in the path
            const objectIndex = pathParts.indexOf('object');
            
            if (objectIndex !== -1 && pathParts.length > objectIndex + 2) {
              // After 'object' comes the access type (public/authenticated/sign)
              // Then bucket name, then file path
              const bucket = pathParts[objectIndex + 2];
              const filePath = pathParts.slice(objectIndex + 3).join('/');
              
              // Decode URL-encoded characters
              const decodedPath = decodeURIComponent(filePath);
              
              console.log(`Extracted - Bucket: ${bucket}, Path: ${decodedPath}`);

              try {
                // Method 1: Try direct download via SDK
                console.log(`Attempting SDK download...`);
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from(bucket)
                  .download(decodedPath);

                if (downloadError) {
                  console.log(`SDK download failed: ${downloadError.message}`);
                  console.log(`Attempting signed URL method...`);
                  
                  // Method 2: Create signed URL and fetch
                  const { data: signedUrlData, error: signUrlError } = await supabase.storage
                    .from(bucket)
                    .createSignedUrl(decodedPath, 60);

                  if (signUrlError) {
                    throw new Error(`Failed to create signed URL: ${signUrlError.message}`);
                  }

                  console.log(`Signed URL created, fetching...`);
                  const response = await fetch(signedUrlData.signedUrl);
                  
                  if (!response.ok) {
                    throw new Error(`Signed URL fetch failed: ${response.status} ${response.statusText}`);
                  }

                  fileBlob = await response.blob();
                } else {
                  fileBlob = fileData;
                }

                console.log(`✓ File downloaded: ${fileBlob.size} bytes`);
              } catch (storageError) {
                console.error(`Storage download error:`, storageError);
                throw storageError;
              }
            } else {
              throw new Error(`Could not parse Supabase Storage URL structure`);
            }
          } else {
            // External URL - fetch directly
            console.log(`Fetching external URL...`);
            const response = await fetch(d.file_url);
            
            if (!response.ok) {
              throw new Error(`External fetch failed: ${response.status} ${response.statusText}`);
            }

            fileBlob = await response.blob();
            console.log(`✓ External file fetched: ${fileBlob.size} bytes`);
          }

          // Upload to Parseur
          console.log(`Creating FormData...`);
          const formData = new FormData();
          formData.append("file", fileBlob, fileName);

          const metadata = {
            workspace_id: workspace.id,
            task_type: task_type,
          };

          const queryParams = new URLSearchParams();
          Object.entries(metadata).forEach(([key, value]) => {
            if (value !== null) queryParams.append(key, String(value));
          });

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
            console.error(`Parseur upload failed:`, {
              status: parseurResp.status,
              statusText: parseurResp.statusText,
              body: responseText.substring(0, 500),
            });
          } else {
            try {
              const parseurData = JSON.parse(responseText);
              console.log(`✓ Parseur upload successful:`, parseurData);
            } catch {
              console.log(`✓ Parseur upload successful (raw):`, responseText.substring(0, 200));
            }
          }
        } catch (err) {
          console.error(`Failed to process ${fileName}:`, {
            error: err.message,
            stack: err.stack,
          });
        }
      }
    } else {
      console.warn("Parseur not configured - skipping");
    }

    console.log(`\n✓ Workspace ${workspace.id} created with ${documents.length} documents`);

    // Trigger analysis in the background
    console.log("Triggering background analysis...");
    fetch(`${supabaseUrl}/functions/v1/analyze-workspace`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspace_id: workspace.id }),
    }).catch(err => {
      console.error("Failed to trigger analysis:", err);
    });

    return new Response(JSON.stringify({ success: true, workspace }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Create workspace error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
