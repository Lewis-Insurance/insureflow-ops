import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ComparisonEngine implementation (inlined for edge function)
class ComparisonEngine {
  private normalizeTerms: Record<string, string[]> = {
    'BI': ['Bodily Injury', 'BI Liability', 'Bodily Injury Liability', 'Liability - BI'],
    'PD': ['Property Damage', 'PD Liability', 'Property Damage Liability', 'Liability - PD'],
    'COMP': ['Comprehensive', 'Other Than Collision', 'OTC', 'Comprehensive Coverage'],
    'COLL': ['Collision', 'Collision Coverage', 'Collision Damage'],
    'UM': ['Uninsured Motorist', 'UM/UIM', 'Uninsured/Underinsured', 'UM Coverage'],
    'UMPD': ['Uninsured Motorist Property Damage', 'UMPD', 'UM Property Damage'],
    'MED': ['Medical Payments', 'Med Pay', 'Medical', 'Medical Coverage'],
    'PIP': ['Personal Injury Protection', 'PIP', 'No-Fault'],
    'RENTAL': ['Rental Reimbursement', 'Rental Car', 'Transportation Expense'],
    'TOWING': ['Towing and Labor', 'Roadside Assistance', 'Emergency Road Service'],
  };

  private termToCanonical: Map<string, string>;

  constructor() {
    this.termToCanonical = new Map();
    Object.entries(this.normalizeTerms).forEach(([canonical, variations]) => {
      variations.forEach((variation: any) => {
        this.termToCanonical.set(variation.toLowerCase(), canonical);
      });
    });
  }

  getCanonicalType(type: string): string {
    const lowerType = type.toLowerCase();
    if (this.termToCanonical.has(lowerType)) {
      return this.termToCanonical.get(lowerType)!;
    }
    for (const [canonical, variations] of Object.entries(this.normalizeTerms)) {
      if (variations.some(v => lowerType.includes(v.toLowerCase()) || v.toLowerCase().includes(lowerType))) {
        return canonical;
      }
    }
    return type;
  }

  normalizeCoverages(coverages: any[]): Map<string, any> {
    const normalized = new Map();
    coverages.forEach((coverage: any) => {
      const canonicalType = this.getCanonicalType(coverage.type);
      normalized.set(canonicalType, { ...coverage, type: canonicalType });
    });
    return normalized;
  }

  identifyGaps(coverages1: Map<string, any>, coverages2: Map<string, any>) {
    const gaps: any[] = [];
    const criticalCoverages = ['COLL', 'COMP', 'BI', 'PD', 'UM'];
    
    criticalCoverages.forEach((type: any) => {
      const readableName = this.getReadableName(type);
      
      if (!coverages1.has(type) && coverages2.has(type)) {
        gaps.push({
          coverageType: readableName,
          missingIn: 'option1',
          severity: 'critical',
          description: `Option 1 is missing ${readableName} coverage`,
          recommendation: `Add ${readableName} coverage to Option 1 or select Option 2`
        });
      }
      
      if (coverages1.has(type) && !coverages2.has(type)) {
        gaps.push({
          coverageType: readableName,
          missingIn: 'option2',
          severity: 'critical',
          description: `Option 2 is missing ${readableName} coverage`,
          recommendation: `Add ${readableName} coverage to Option 2 or select Option 1`
        });
      }
    });

    return gaps;
  }

  getReadableName(canonicalType: string): string {
    const names: Record<string, string> = {
      'BI': 'Bodily Injury',
      'PD': 'Property Damage',
      'COMP': 'Comprehensive',
      'COLL': 'Collision',
      'UM': 'Uninsured Motorist',
      'UMPD': 'Uninsured Motorist Property Damage',
      'MED': 'Medical Payments',
      'PIP': 'Personal Injury Protection',
      'RENTAL': 'Rental Reimbursement',
      'TOWING': 'Towing and Labor'
    };
    return names[canonicalType] || canonicalType;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { option1, option2 } = await req.json();
    const o1 = option1 ?? {};
    const o2 = option2 ?? {};
    
    // Initialize comparison engine
    const engine = new ComparisonEngine();
    const normalizedCoverages1 = engine.normalizeCoverages(Array.isArray(o1.coverages) ? o1.coverages : []);
    const normalizedCoverages2 = engine.normalizeCoverages(Array.isArray(o2.coverages) ? o2.coverages : []);
    
    // Identify gaps using the engine
    const gaps = engine.identifyGaps(normalizedCoverages1, normalizedCoverages2);
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build enhanced comparison prompt with gap analysis
    const gapSummary = gaps.length > 0 
      ? `\n\nCRITICAL GAPS IDENTIFIED:\n${gaps.map((g: any) => `- ${g.description}`).join('\n')}`
      : '\n\nNo critical coverage gaps identified.';

    const prompt = `You are an expert insurance analyst. Compare these two insurance options and provide a detailed analysis.

OPTION 1:
- Carrier: ${o1.carrier || 'Unknown'}
- Policy/Quote: ${o1.policyNumber || 'Quote'}
- Term: ${o1.term || 'N/A'}
- Total Premium: $${o1.totalPremium ?? 0}
- Coverages: ${JSON.stringify(Array.from(normalizedCoverages1.entries()), null, 2)}

OPTION 2:
- Carrier: ${o2.carrier || 'Unknown'}
- Policy/Quote: ${o2.policyNumber || 'Quote'}
- Term: ${o2.term || 'N/A'}
- Total Premium: $${o2.totalPremium ?? 0}
- Coverages: ${JSON.stringify(Array.from(normalizedCoverages2.entries()), null, 2)}
${gapSummary}

IMPORTANT: Coverage types have been normalized (e.g., "Collision", "Collision Coverage" → "COLL").

Provide a comprehensive comparison including:
1. Coverage differences (better, worse, or equivalent for each NORMALIZED coverage type)
2. Premium analysis (percentage difference and value assessment)
3. Gap analysis (highlight any missing critical coverages like Collision, Comprehensive, etc.)
4. Overall recommendation with reasoning

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

    // Build final comparison result with gaps
    const result = {
      option1,
      option2,
      differences: {
        ...comparisonData,
        gaps: gaps  // Include identified gaps
      },
      recommendation: comparisonData.recommendation,
      analysisDate: new Date().toISOString(),
      metadata: {
        normalizedCoverageCount: {
          option1: normalizedCoverages1.size,
          option2: normalizedCoverages2.size
        },
        criticalGapsFound: gaps.filter((g: any) => g.severity === 'critical').length
      }
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Comparison error:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
