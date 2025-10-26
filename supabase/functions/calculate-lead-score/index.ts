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
  updated_at?: string;
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
 * 
 * Scoring Breakdown:
 * - Contact Info: 0-15 points (email + phone completeness)
 * - Insurance Needs: 0-25 points (complexity and type)
 * - Premium Potential: 0-25 points (revenue opportunity)
 * - Decision Timeline: 0-20 points (urgency)
 * - Engagement Level: 0-10 points (activity and status)
 * - Lead Source: 0-5 points (source quality)
 * 
 * Total: 0-100 points
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

  // ==========================================
  // FACTOR 1: Contact Information (0-15 points)
  // ==========================================
  let contactScore = 0;
  if (lead.email) contactScore += 7;
  if (lead.phone) contactScore += 8;
  factors.contactInfo = contactScore;

  // ==========================================
  // FACTOR 2: Insurance Needs Complexity (0-25 points)
  // ==========================================
  let needsScore = 0;
  const insuranceTypes = lead.insurance_types || [];
  
  if (insuranceTypes.length === 0) {
    needsScore = 5; // Unknown needs - some potential
  } else if (insuranceTypes.includes("commercial")) {
    needsScore = 25; // Commercial insurance = highest value
  } else if (insuranceTypes.length >= 3) {
    needsScore = 20; // Multiple lines = good bundling opportunity
  } else if (insuranceTypes.length === 2) {
    needsScore = 15; // Two lines = moderate opportunity
  } else {
    needsScore = 10; // Single line = baseline
  }
  factors.insuranceNeeds = needsScore;

  // ==========================================
  // FACTOR 3: Premium Potential (0-25 points)
  // ==========================================
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
    premiumScore = 10; // Unknown premium - assume mid-tier
  }
  factors.premiumPotential = premiumScore;

  // ==========================================
  // FACTOR 4: Decision Timeline (0-20 points)
  // ==========================================
  let timelineScore = 0;
  switch (lead.decision_timeframe) {
    case "immediate":
      timelineScore = 20; // Ready to buy now
      break;
    case "within_30_days":
      timelineScore = 15; // Very soon
      break;
    case "within_90_days":
      timelineScore = 10; // Medium term
      break;
    case "exploring_options":
      timelineScore = 5; // Just looking
      break;
    default:
      timelineScore = 8; // Unknown - assume moderate
  }
  factors.timeline = timelineScore;

  // ==========================================
  // FACTOR 5: Engagement Level (0-10 points)
  // ==========================================
  let engagementScore = 5; // Default baseline
  
  // Recent contact bonus
  if (lead.last_contact_at) {
    const daysSinceContact = Math.floor(
      (Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysSinceContact <= 1) {
      engagementScore = 10; // Very recent contact
    } else if (daysSinceContact <= 7) {
      engagementScore = 8; // Recent contact
    } else if (daysSinceContact <= 30) {
      engagementScore = 6; // Somewhat recent
    } else {
      engagementScore = 3; // Stale
    }
  }
  
  // Status-based engagement boost
  if (lead.status === "contacted" || lead.status === "qualified") {
    engagementScore = Math.max(engagementScore, 8);
  } else if (lead.status === "quoted") {
    engagementScore = 10; // Quoted leads are highly engaged
  } else if (lead.status === "new") {
    engagementScore = Math.max(engagementScore, 6); // New leads get baseline
  }
  
  factors.engagement = engagementScore;

  // ==========================================
  // FACTOR 6: Lead Source Quality (0-5 points)
  // ==========================================
  // This is a baseline score. In the future, you can enhance this
  // by tracking conversion rates per source and scoring accordingly
  factors.source = 5; // Default source score

  // ==========================================
  // CALCULATE TOTAL SCORE
  // ==========================================
  const totalScore = Object.values(factors).reduce((sum, score) => sum + score, 0);
  const finalScore = Math.min(100, Math.max(0, totalScore)); // Clamp to 0-100

  // ==========================================
  // GENERATE RECOMMENDATION
  // ==========================================
  let recommendation = "";
  
  if (finalScore >= 80) {
    recommendation = "🔥 HIGH PRIORITY - Assign to top producer immediately and contact within 1 hour";
  } else if (finalScore >= 60) {
    recommendation = "⭐ STANDARD PIPELINE - Follow up within 24 hours with personalized outreach";
  } else if (finalScore >= 40) {
    recommendation = "📧 NURTURE CAMPAIGN - Add to automated drip campaign for 30-90 day cultivation";
  } else {
    recommendation = "❄️ LOW PRIORITY - Long-term nurture or consider disqualifying if no engagement";
  }

  return {
    score: finalScore,
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
    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Parse request body
    const { leadId, leadData } = await req.json();

    if (!leadId && !leadData) {
      throw new Error("Either leadId or leadData must be provided");
    }

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

      if (error) {
        console.error("Error fetching lead:", error);
        throw new Error(`Failed to fetch lead: ${error.message}`);
      }
      
      if (!data) {
        throw new Error(`Lead not found: ${leadId}`);
      }
      
      lead = data;
    } else {
      throw new Error("Invalid request: missing lead data");
    }

    console.log(`Scoring lead: ${lead.id} (${lead.first_name} ${lead.last_name})`);

    // Calculate the score
    const result = calculateLeadScore(lead);

    console.log(`Score calculated: ${result.score}/100`, result.factors);

    // Update the lead record with the new score
    const { error: updateError } = await supabaseClient
      .from("leads")
      .update({
        lead_score: result.score,
      })
      .eq("id", lead.id);

    if (updateError) {
      console.error("Error updating lead score:", updateError);
      throw new Error(`Failed to update lead score: ${updateError.message}`);
    }

    // Log the scoring event in audit logs
    try {
      await supabaseClient.from("audit_logs").insert({
        entity_type: "lead",
        entity_id: lead.id,
        action: "score_calculated",
        changes: {
          score: result.score,
          factors: result.factors,
          recommendation: result.recommendation,
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      console.error("Failed to create audit log:", auditError);
    }

    // Return success response
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
        error: error.message || "An unknown error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
