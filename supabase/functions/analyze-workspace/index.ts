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
    const azureOpenAIEndpoint = Deno.env.get("AZURE_OPENAI_ENDPOINT");
    const azureOpenAIKey = Deno.env.get("AZURE_OPENAI_KEY");
    const azureDeployment = Deno.env.get("AZURE_OPENAI_DEPLOYMENT") || "gpt-4o";

    if (!azureOpenAIEndpoint || !azureOpenAIKey) {
      throw new Error("Azure OpenAI credentials not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch workspace and documents with parsed data
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select(`
        *,
        workspace_documents (
          id,
          file_name,
          file_url,
          role,
          parseur_document_id,
          parsed_doc_id,
          parsed_documents (
            id,
            parsed_data,
            document_type
          )
        )
      `)
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

    // Check if all documents have been parsed by Parseur
    const unparsedDocs = workspace.workspace_documents?.filter(doc => !doc.parsed_documents) || [];
    
    if (unparsedDocs.length > 0) {
      console.log(`Waiting for Parseur to parse ${unparsedDocs.length} documents...`);
      
      // Update status back to idle and add helpful message
      await supabase
        .from("workspaces")
        .update({ 
          status: "idle",
          updated_at: new Date().toISOString() 
        })
        .eq("id", workspace_id);
      
      throw new Error(`Still waiting for Parseur to parse ${unparsedDocs.length} document(s). The analysis will automatically start when parsing completes.`);
    }

    // Collect parsed data from all documents
    const documentData = workspace.workspace_documents?.map(doc => ({
      filename: doc.file_name,
      role: doc.role,
      document_type: doc.parsed_documents?.document_type,
      parsed_data: doc.parsed_documents?.parsed_data,
    })) || [];

    if (documentData.length === 0) {
      throw new Error("No documents with parsed data found");
    }

    console.log(`All ${documentData.length} documents have been parsed. Starting Azure OpenAI analysis...`);

    // Build analysis prompt based on task type
    let systemPrompt = "";
    let userPrompt = "";

    if (workspace.task_type === "policy_explore") {
      systemPrompt = `You are an expert insurance policy analyst. Analyze the provided parsed policy data and provide comprehensive insights.

Focus on:
- Policy holder information
- Coverage types and limits
- Premium amounts and payment terms
- Deductibles
- Key terms and conditions
- Important dates (effective date, expiration, renewal)
- Any notable exclusions or special provisions
- Risk assessment and recommendations

Provide a clear, structured summary with specific details and actionable insights.`;

      userPrompt = `Analyze the following insurance policy data:\n\n${documentData.map(d => `=== ${d.filename} (${d.role || 'document'}) ===\nDocument Type: ${d.document_type || 'unknown'}\n${JSON.stringify(d.parsed_data, null, 2)}\n`).join("\n\n")}`;

    } else if (workspace.task_type === "coverage_comparison") {
      systemPrompt = `You are an expert at comparing insurance policies. Analyze multiple parsed policy documents and provide a detailed comparison.

Focus on:
- Side-by-side coverage comparison (be specific about limits and types)
- Premium comparisons (show exact amounts from each policy)
- Deductible variations
- Coverage gaps (what one policy has that others don't)
- Value analysis (which policy provides better coverage for the price)
- Clear recommendations for the customer

Present the comparison in a structured format with tables where appropriate.`;

      userPrompt = `Compare the following insurance policy documents:\n\n${documentData.map(d => `=== ${d.filename} (${d.role || 'Option'}) ===\nDocument Type: ${d.document_type || 'unknown'}\n${JSON.stringify(d.parsed_data, null, 2)}\n`).join("\n\n")}\n\nProvide a comprehensive comparison highlighting key differences in coverage, premiums, and value. Make a clear recommendation.`;

    } else if (workspace.task_type === "contract_review") {
      systemPrompt = `You are an expert at reviewing insurance contracts and certificates. Cross-reference the provided documents and identify any discrepancies, compliance issues, or areas of concern.

Focus on:
- Accuracy of certificate information vs. underlying policies
- Coverage compliance with contract requirements
- Missing or inadequate coverages
- Policy limits matching requirements
- Named insured and additional insured accuracy
- Dates and renewal alignment
- Any red flags or concerns that need attention

Provide clear findings with specific references to the documents.`;

      userPrompt = `Review and cross-reference the following insurance documents:\n\n${documentData.map(d => `=== ${d.filename} (${d.role || 'document'}) ===\nDocument Type: ${d.document_type || 'unknown'}\n${JSON.stringify(d.parsed_data, null, 2)}\n`).join("\n\n")}\n\nProvide detailed findings on accuracy, compliance, and any concerns.`;

    } else {
      systemPrompt = "You are an expert insurance document analyst. Provide detailed insights and analysis of the provided insurance data.";
      userPrompt = `Analyze these insurance documents:\n\n${documentData.map(d => `=== ${d.filename} ===\nDocument Type: ${d.document_type || 'unknown'}\n${JSON.stringify(d.parsed_data, null, 2)}\n`).join("\n\n")}`;
    }

    // Call Azure OpenAI for analysis
    console.log("Calling Azure OpenAI for analysis...");
    
    const cleanEndpoint = azureOpenAIEndpoint.replace(/\/$/, "");
    const azureUrl = `${cleanEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=2024-02-15-preview`;

    const aiResponse = await fetch(azureUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": azureOpenAIKey,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("Azure OpenAI error:", aiResponse.status, errorText);
      throw new Error(`Azure OpenAI analysis failed: ${aiResponse.status} - ${errorText}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log("✓ Azure OpenAI analysis complete");
    console.log(`Analysis length: ${analysis.length} characters`);

    // Store the analysis result
    const analysisOutput = {
      task_type: workspace.task_type,
      analyzed_at: new Date().toISOString(),
      documents: documentData.map(d => ({
        filename: d.filename,
        role: d.role,
        document_type: d.document_type,
        has_parsed_data: !!d.parsed_data,
      })),
      summary: analysis,
      model: `azure/${azureDeployment}`,
      source: "parseur + azure_openai",
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
        analysis: analysisOutput,
        documents_processed: documentData.length,
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
      
      const body = await req.clone().json().catch(() => ({}));
      const workspace_id = body.workspace_id;
      
      if (workspace_id) {
        await supabase
          .from("workspaces")
          .update({ 
            status: "failed",
            error_message: err.message,
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
