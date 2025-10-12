import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { option1, option2 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build detailed comparison prompt
    const prompt = `You are an expert insurance analyst. Compare these two insurance options and provide a detailed analysis.

OPTION 1:
- Carrier: ${option1.carrier}
- Policy/Quote: ${option1.policyNumber || 'Quote'}
- Term: ${option1.term}
- Total Premium: $${option1.totalPremium}
- Coverages: ${JSON.stringify(option1.coverages, null, 2)}

OPTION 2:
- Carrier: ${option2.carrier}
- Policy/Quote: ${option2.policyNumber || 'Quote'}
- Term: ${option2.term}
- Total Premium: $${option2.totalPremium}
- Coverages: ${JSON.stringify(option2.coverages, null, 2)}

Provide a comprehensive comparison including:
1. Coverage differences (better, worse, or equivalent for each coverage type)
2. Premium analysis (percentage difference and value assessment)
3. Overall recommendation with reasoning

Return your analysis as a structured JSON object.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an insurance comparison expert. Analyze policy details and provide clear, actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'generate_comparison',
            description: 'Generate detailed insurance comparison analysis',
            parameters: {
              type: 'object',
              properties: {
                coverageDifferences: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      coverageType: { type: 'string' },
                      option1Value: { type: 'string' },
                      option2Value: { type: 'string' },
                      advantage: { type: 'string', enum: ['option1', 'option2', 'neutral'] },
                      description: { type: 'string' }
                    },
                    required: ['coverageType', 'option1Value', 'option2Value', 'advantage', 'description']
                  }
                },
                premiumDifference: { type: 'number' },
                premiumPercentage: { type: 'number' },
                carrierComparison: { type: 'string' },
                termComparison: { type: 'string' },
                recommendation: { type: 'string' }
              },
              required: ['coverageDifferences', 'premiumDifference', 'premiumPercentage', 'recommendation']
            }
          }
        }],
        tool_choice: { type: 'function', function: { name: 'generate_comparison' } }
      })
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
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      throw new Error('No comparison data generated');
    }

    const comparisonData = JSON.parse(toolCall.function.arguments);

    // Build final comparison result
    const result = {
      option1,
      option2,
      differences: comparisonData,
      recommendation: comparisonData.recommendation,
      analysisDate: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Comparison error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
