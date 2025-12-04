import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, insuranceType } = await req.json();
    console.log('Generating quote document for:', { leadId, insuranceType });

    if (!leadId || !insuranceType) {
      throw new Error('leadId and insuranceType are required');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Fetch lead details
    const { data: lead, error: leadError } = await supabaseClient
      .from('leads')
      .select('*, profiles!leads_assigned_to_fkey(*)')
      .eq('id', leadId)
      .single();

    if (leadError) throw leadError;

    // Fetch insurance details based on type
    const tableMap: Record<string, string> = {
      auto: 'lead_auto_insurance',
      home: 'lead_home_insurance',
      commercial: 'lead_commercial_insurance',
      life: 'lead_life_insurance',
      umbrella: 'lead_umbrella_insurance',
      renters: 'lead_renters_insurance',
    };

    const tableName = tableMap[insuranceType];
    if (!tableName) {
      throw new Error(`Invalid insurance type: ${insuranceType}`);
    }

    const { data: insuranceDetails, error: insuranceError } = await supabaseClient
      .from(tableName)
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (insuranceError) throw insuranceError;

    if (!insuranceDetails) {
      return new Response(
        JSON.stringify({ 
          error: 'No insurance details found for this type',
          message: 'Please add insurance details before generating a quote document'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch auto vehicles and drivers if auto insurance
    let vehicles = [];
    let drivers = [];
    if (insuranceType === 'auto') {
      const { data: vehicleData } = await supabaseClient
        .from('lead_auto_vehicles')
        .select('*')
        .eq('lead_id', leadId);
      vehicles = vehicleData || [];

      const { data: driverData } = await supabaseClient
        .from('lead_auto_drivers')
        .select('*')
        .eq('lead_id', leadId);
      drivers = driverData || [];
    }

    // Call Lovable AI to generate the document
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const systemPrompt = `You are an expert insurance agent assistant. Your task is to create a comprehensive, professional quote document that agents can use to quickly assess and quote insurance coverage.

Format the document in clear sections with:
1. Client Information Summary
2. Policy Details & Coverage Requirements
3. Risk Assessment Factors
4. Key Underwriting Information
5. Recommended Coverage Options
6. Special Notes & Considerations

Use professional insurance terminology, organize information logically, and highlight critical details that impact quoting. Make it easy to scan and reference during the quoting process.`;

    const userPrompt = `Create a professional quote document for a ${insuranceType} insurance policy based on the following information:

**Client Information:**
- Name: ${lead.first_name} ${lead.last_name}
- Email: ${lead.email || 'Not provided'}
- Phone: ${lead.phone || 'Not provided'}
- Current Carrier: ${lead.current_carrier || 'Not provided'}
- Current Premium: ${lead.current_premium ? `$${lead.current_premium}` : 'Not provided'}
- Decision Timeframe: ${lead.decision_timeframe || 'Not specified'}

**Insurance Details:**
${JSON.stringify(insuranceDetails, null, 2)}

${insuranceType === 'auto' && vehicles.length > 0 ? `
**Vehicles:**
${vehicles.map((v, i) => `
Vehicle ${i + 1}:
${JSON.stringify(v, null, 2)}
`).join('\n')}
` : ''}

${insuranceType === 'auto' && drivers.length > 0 ? `
**Drivers:**
${drivers.map((d, i) => `
Driver ${i + 1}:
${JSON.stringify(d, null, 2)}
`).join('\n')}
` : ''}

Create a well-formatted, professional quote document that our agents can use to provide an accurate quote. Include all relevant details and organize them logically.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add funds to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error('Failed to generate quote document');
    }

    const aiData = await aiResponse.json();
    const quoteDocument = aiData.choices[0].message.content;

    console.log('Successfully generated quote document');

    return new Response(
      JSON.stringify({ 
        quoteDocument,
        leadInfo: {
          name: `${lead.first_name} ${lead.last_name}`,
          email: lead.email,
          phone: lead.phone,
          insuranceType,
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('Error in generate-insurance-quote-doc:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Unknown error occurred',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
