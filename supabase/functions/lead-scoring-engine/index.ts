import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

interface LeadScoringFactors {
  // Insurance needs complexity (0-25 points)
  insuranceNeeds: string[];
  
  // Premium potential (0-20 points)
  currentPremium: number | null;
  
  // Decision timeline (0-20 points)
  decisionTimeframe: 'immediate' | '30_days' | '60_days' | '90_days' | 'no_rush' | null;
  
  // Contact completeness (0-15 points)
  hasEmail: boolean;
  hasPhone: boolean;
  
  // Engagement signals (0-10 points)
  source: string | null;
  
  // Current carrier dissatisfaction (0-10 points)
  hasCurrentCarrier: boolean;
}

function calculateLeadScore(factors: LeadScoringFactors): number {
  let score = 0;
  
  // 1. Insurance Needs Complexity (0-25 points)
  const needs = factors.insuranceNeeds || [];
  if (needs.includes('commercial')) {
    score += 25; // Commercial = highest value
  } else if (needs.length >= 3) {
    score += 20; // Multiple lines = high value
  } else if (needs.length === 2) {
    score += 15; // Two lines = good value
  } else if (needs.length === 1) {
    score += 10; // Single line = moderate value
  }
  
  // 2. Premium Potential (0-20 points)
  if (factors.currentPremium) {
    if (factors.currentPremium >= 5000) {
      score += 20; // High premium = high value
    } else if (factors.currentPremium >= 2500) {
      score += 15;
    } else if (factors.currentPremium >= 1000) {
      score += 10;
    } else {
      score += 5;
    }
  } else {
    score += 8; // Unknown premium = assume moderate
  }
  
  // 3. Decision Timeline (0-20 points)
  switch (factors.decisionTimeframe) {
    case 'immediate':
      score += 20; // Ready to buy now
      break;
    case '30_days':
      score += 15; // Very soon
      break;
    case '60_days':
      score += 10; // Soon
      break;
    case '90_days':
      score += 5; // Later
      break;
    case 'no_rush':
      score += 2; // Just shopping
      break;
    default:
      score += 8; // Unknown = assume moderate urgency
  }
  
  // 4. Contact Completeness (0-15 points)
  if (factors.hasEmail && factors.hasPhone) {
    score += 15; // Both = excellent
  } else if (factors.hasEmail || factors.hasPhone) {
    score += 10; // One = good
  } else {
    score += 0; // Neither = poor
  }
  
  // 5. Lead Source Quality (0-10 points)
  const highQualitySources = ['referral', 'website', 'event'];
  const mediumQualitySources = ['social_media', 'email', 'advertising'];
  
  if (factors.source && highQualitySources.includes(factors.source)) {
    score += 10;
  } else if (factors.source && mediumQualitySources.includes(factors.source)) {
    score += 6;
  } else {
    score += 3;
  }
  
  // 6. Current Carrier (Shopping Signal) (0-10 points)
  if (factors.hasCurrentCarrier) {
    score += 10; // Already has insurance = ready to switch
  } else {
    score += 5; // New to insurance = moderate
  }
  
  // Ensure score is between 0 and 100
  return Math.min(Math.max(score, 0), 100);
}

async function scoreLeads(supabaseClient: any, leadIds?: string[]) {
  try {
    // Build query
    let query = supabaseClient
      .from('leads')
      .select(`
        id,
        insurance_needs,
        current_premium,
        decision_timeframe,
        email,
        phone,
        current_carrier,
        source_id,
        lead_sources (type)
      `);
    
    // Filter by specific lead IDs if provided
    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds);
    }
    
    const { data: leads, error: fetchError } = await query;
    
    if (fetchError) throw fetchError;
    if (!leads || leads.length === 0) {
      return { success: true, message: 'No leads to score', scored: 0 };
    }
    
    // Calculate scores for all leads
    const updates = leads.map((lead: any) => {
      const factors: LeadScoringFactors = {
        insuranceNeeds: lead.insurance_needs || [],
        currentPremium: lead.current_premium,
        decisionTimeframe: lead.decision_timeframe,
        hasEmail: !!lead.email,
        hasPhone: !!lead.phone,
        source: lead.lead_sources?.type || null,
        hasCurrentCarrier: !!lead.current_carrier,
      };
      
      const newScore = calculateLeadScore(factors);
      
      return {
        id: lead.id,
        lead_score: newScore,
      };
    });
    
    // Batch update all lead scores
    const { error: updateError } = await supabaseClient
      .from('leads')
      .upsert(
        updates.map(u => ({
          id: u.id,
          lead_score: u.lead_score,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'id' }
      );
    
    if (updateError) throw updateError;
    
    return {
      success: true,
      message: `Successfully scored ${updates.length} lead(s)`,
      scored: updates.length,
      scores: updates,
    };
  } catch (error) {
    console.error('Error in scoreLeads:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    // Parse request body
    const { leadIds, rescore_all } = await req.json();
    
    // Validate request
    if (!leadIds && !rescore_all) {
      return new Response(
        JSON.stringify({
          error: 'Either leadIds array or rescore_all flag must be provided',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Score leads
    const result = await scoreLeads(
      supabaseClient,
      rescore_all ? undefined : leadIds
    );
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in lead-scoring-engine:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
