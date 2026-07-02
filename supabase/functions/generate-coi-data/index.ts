import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { modelBoundaryFetch } from '../_shared/modelBoundaryFetch.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const { ticketData, accountData, policyData } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const prompt = `Generate Certificate of Insurance data based on the following information:

Ticket Details:
${JSON.stringify(ticketData, null, 2)}

Account Information:
${JSON.stringify(accountData, null, 2)}

Policy Information:
${JSON.stringify(policyData, null, 2)}

Generate appropriate COI data including:
- Certificate holder information (if mentioned in ticket)
- Coverage details based on policy information
- Effective and expiration dates from policy
- Special provisions if applicable

Respond with structured data that matches these fields:
- certificate_holder_name
- certificate_holder_address
- effective_date
- expiration_date
- coverage_details (general_liability, auto_liability, workers_comp, umbrella)
- special_provisions`;

    const response = await modelBoundaryFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: "You are an insurance document assistant. Extract and generate COI data from ticket and policy information. Return valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        tools: [
          {
            type: "function",
            name: "generate_coi_data",
            description: "Generate Certificate of Insurance data",
            parameters: {
              type: "object",
              properties: {
                certificate_holder_name: { type: "string" },
                certificate_holder_address: { type: "string" },
                effective_date: { type: "string" },
                expiration_date: { type: "string" },
                coverage_details: {
                  type: "object",
                  properties: {
                    general_liability: { type: "string" },
                    auto_liability: { type: "string" },
                    workers_comp: { type: "string" },
                    umbrella: { type: "string" },
                  },
                },
                special_provisions: { type: "string" },
              },
              required: ["certificate_holder_name", "effective_date", "expiration_date"],
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_coi_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Response:", JSON.stringify(data, null, 2));

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const coiData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ data: coiData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in generate-coi-data function:", error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
