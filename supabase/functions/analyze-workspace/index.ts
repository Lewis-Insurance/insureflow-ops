import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      throw new Error("Missing required field: workspace_id");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch workspace and documents
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("*, workspace_documents(*)")
      .eq("id", workspace_id)
      .single();

    if (workspaceError) throw workspaceError;
    if (!workspace) throw new Error("Workspace not found");

    // Update status to processing
    await supabase
      .from("workspaces")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", workspace_id);

    console.log(`Processing workspace ${workspace_id} with ${workspace.workspace_documents?.length || 0} documents`);

    // Download and extract text from each document
    const documentContents: Array<{ filename: string; content: string }> = [];

    for (const doc of workspace.workspace_documents || []) {
      if (!doc.file_url) continue;

      try {
        console.log(`Fetching document: ${doc.file_name}`);
        const docResponse = await fetch(doc.file_url);
        
        if (!docResponse.ok) {
          console.error(`Failed to fetch ${doc.file_name}: ${docResponse.status}`);
          continue;
        }

        const blob = await docResponse.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        // For now, we'll just note that we have the file
        // In a production system, you'd use a PDF parsing library here
        documentContents.push({
          filename: doc.file_name || "unknown",
          content: `Document: ${doc.file_name} (${blob.size} bytes)`,
        });
        
        console.log(`✓ Loaded ${doc.file_name}: ${blob.size} bytes`);
      } catch (err) {
        console.error(`Error processing ${doc.file_name}:`, err);
      }
    }

    // Build analysis prompt based on task type
    let systemPrompt = "";
    let userPrompt = "";

    if (workspace.task_type === "policy_explore") {
      systemPrompt = `You are an expert insurance policy analyst. Analyze the provided policy documents and extract key information.

Focus on:
- Policy holder information
- Coverage types and limits
- Premium amounts
- Deductibles
- Key terms and conditions
- Important dates (effective date, expiration, renewal)
- Any notable exclusions or special provisions

Provide a comprehensive summary in a clear, structured format.`;

      userPrompt = `Analyze the following insurance policy document(s):\n\n${documentContents.map(d => `File: ${d.filename}\n${d.content}`).join("\n\n")}`;
    } else if (workspace.task_type === "coverage_comparison") {
      systemPrompt = `You are an expert at comparing insurance policies. Analyze multiple policy documents and provide a detailed comparison.

Focus on:
- Coverage differences between policies
- Premium comparisons
- Deductible variations
- Coverage limits
- Strengths and weaknesses of each policy
- Recommendations for the best option

Present the comparison in a clear, easy-to-understand format.`;

      userPrompt = `Compare the following insurance policy documents:\n\n${documentContents.map(d => `File: ${d.filename}\n${d.content}`).join("\n\n")}`;
    } else {
      systemPrompt = "You are a helpful AI assistant analyzing documents.";
      userPrompt = `Analyze these documents:\n\n${documentContents.map(d => `File: ${d.filename}\n${d.content}`).join("\n\n")}`;
    }

    // Call Lovable AI for analysis
    console.log("Calling Lovable AI for analysis...");
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log("✓ AI analysis complete");

    // Store the analysis result
    const analysisOutput = {
      task_type: workspace.task_type,
      analyzed_at: new Date().toISOString(),
      documents: documentContents.map(d => d.filename),
      summary: analysis,
      model: "google/gemini-2.5-flash",
    };

    await supabase
      .from("workspaces")
      .update({
        status: "completed",
        analysis_output: analysisOutput,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workspace_id);

    console.log(`✓ Workspace ${workspace_id} analysis complete`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        workspace_id,
        analysis: analysisOutput 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error("Analysis error:", err);
    
    // Try to update workspace status to failed
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { workspace_id } = await req.json().catch(() => ({}));
      if (workspace_id) {
        await supabase
          .from("workspaces")
          .update({ 
            status: "failed",
            updated_at: new Date().toISOString() 
          })
          .eq("id", workspace_id);
      }
    } catch (updateErr) {
      console.error("Failed to update workspace status:", updateErr);
    }

    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
