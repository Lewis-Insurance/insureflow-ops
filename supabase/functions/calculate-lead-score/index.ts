import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  insurance_types?: string[];
  current_premium?: number;
  decision_timeframe?: string;
  status: string;
  source_id?: string;
  created_at: string;
  last_contact_at?: string;
  lead_score?: number;
}

interface ScoringFactors {
  contactInfo: number;
  insuranceNeeds: number;
  premiumPotential: number;
  timeline: number;
  engagement: number;
  source: number;
}

interface ScoringResult {
  score: number;
  factors: ScoringFactors;
  recommendation: string;
}

/**
 * Calculate lead score based on multiple factors
 */
function calculateLeadScore(lead: Lead): ScoringResult {
  const factors: ScoringFactors = {
    contactInfo: 0,
    insuranceNeeds: 0,
    premiumPotential: 0,
    timeline: 0,
    engagement: 0,
    source: 0,
  };

  // FACTOR 1: Contact Information Completeness (0-15 points)
  let contactScore = 0;
  if (lead.email) contactScore += 7;
  if (lead.phone) contactScore += 8;
  factors.contactInfo = contactScore;

  // FACTOR 2: Insurance Needs Complexity (0-25 points)
  let needsScore = 0;
  const insuranceTypes = lead.insurance_types || [];
  
  if (insuranceTypes.length === 0) {
    needsScore = 5; // Unknown needs
  } else if (insuranceTypes.includes("commercial")) {
    needsScore = 25; // Commercial is highest value
  } else if (insuranceTypes.length >= 3) {
    needsScore = 20; // Multiple lines
  } else if (insuranceTypes.length === 2) {
    needsScore = 15; // Two lines
  } else {
    needsScore = 10; // Single line
  }
  factors.insuranceNeeds = needsScore;

  // FACTOR 3: Premium Potential (0-25 points)
  let premiumScore = 0;
  if (lead.current_premium) {
    if (lead.current_premium >= 10000) {
      premiumScore = 25; // $10K+ annual premium
    } else if (lead.current_premium >= 5000) {
      premiumScore = 20; // $5K-$10K
    } else if (lead.current_premium >= 2500) {
      premiumScore = 15; // $2.5K-$5K
    } else if (lead.current_premium >= 1000) {
      premiumScore = 10; // $1K-$2.5K
    } else {
      premiumScore = 5; // Under $1K
    }
  } else {
    premiumScore = 10; // Unknown premium (middle ground)
  }
  factors.premiumPotential = premiumScore;

  // FACTOR 4: Decision Timeline (0-20 points)
  let timelineScore = 0;
  switch (lead.decision_timeframe) {
    case "immediate":
      timelineScore = 20;
      break;
    case "within_30_days":
      timelineScore = 15;
      break;
    case "within_90_days":
      timelineScore = 10;
      break;
    case "exploring_options":
      timelineScore = 5;
      break;
    default:
      timelineScore = 8; // Unknown
  }
  factors.timeline = timelineScore;

  // FACTOR 5: Engagement Level (0-10 points)
  let engagementScore = 5; // Default baseline
  
  // Recent contact bonus
  if (lead.last_contact_at) {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceContact <= 1) engagementScore = 10;
    else if (daysSinceContact <= 7) engagementScore = 8;
    else if (daysSinceContact <= 30) engagementScore = 6;
    else engagementScore = 3;
  }
  
  // Status-based engagement
  if (lead.status === "contacted" || lead.status === "qualified") {
    engagementScore = Math.max(engagementScore, 8);
  } else if (lead.status === "quoted") {
    engagementScore = 10;
  }
  
  factors.engagement = engagementScore;

  // FACTOR 6: Lead Source Quality (0-5 points)
  // This would ideally come from lead_sources table with ROI data
  // For now, we'll use a simple baseline
  factors.source = 5; // Default source score

  // Calculate total score
  const totalScore = Object.values(factors).reduce((sum, score) => sum + score, 0);

  // Determine recommendation
  let recommendation = "";
  if (totalScore >= 80) {
    recommendation = "High Priority - Assign to top producer immediately";
  } else if (totalScore >= 60) {
    recommendation = "Standard Pipeline - Follow up within 24 hours";
  } else if (totalScore >= 40) {
    recommendation = "Nurturing - Add to drip campaign";
  } else {
    recommendation = "Low Priority - Long-term nurture or disqualify";
  }

  return {
    score: Math.min(100, totalScore), // Cap at 100
    factors,
    recommendation,
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { leadId, leadData } = await req.json();

    // Fetch lead data if only ID provided
    let lead: Lead;
    if (leadData) {
      lead = leadData;
    } else if (leadId) {
      const { data, error } = await supabaseClient
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (error) throw error;
      lead = data;
    } else {
      throw new Error("Either leadId or leadData must be provided");
    }

    // Calculate score
    const result = calculateLeadScore(lead);

    // Update lead with new score
    const { error: updateError } = await supabaseClient
      .from("leads")
      .update({
        lead_score: result.score,
        scoring_factors: result.factors,
        scoring_recommendation: result.recommendation,
        last_scored_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    if (updateError) throw updateError;

    // Log the scoring event
    await supabaseClient.from("audit_logs").insert({
      entity: "lead",
      entity_id: lead.id,
      action: "score_updated",
      details: {
        old_score: lead.lead_score || 0,
        new_score: result.score,
        factors: result.factors,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        leadId: lead.id,
        score: result.score,
        factors: result.factors,
        recommendation: result.recommendation,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Lead scoring error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
