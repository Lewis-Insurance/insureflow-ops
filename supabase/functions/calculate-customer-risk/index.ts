// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RiskFactors {
  noRecentContact: { days: number; weight: number };
  premiumIncrease: { percentage: number; weight: number };
  noClaims: { years: number; weight: number };
  lowEngagement: { score: number; weight: number };
  policyChanges: { count: number; weight: number };
  competitorActivity: { detected: boolean; weight: number };
}

interface ProtectiveFactors {
  longTenure: { years: number; weight: number };
  multiplePolicies: { count: number; weight: number };
  highEngagement: { score: number; weight: number };
  recentClaims: { satisfaction: number; weight: number };
}

interface ChurnPredictionResult {
  accountId: string;
  churnProbability: number;
  churnRiskLevel: string;
  churnConfidence: number;
  renewalRiskProbability: number;
  renewalRiskLevel: string;
  daysUntilRenewal: number | null;
  predictedLtv: number;
  currentLtv: number;
  ltvTrend: string;
  riskFactors: any[];
  protectiveFactors: any[];
  recommendedActions: any[];
  nextProductPredictions: any[];
}

/**
 * Calculate churn probability based on customer behavior patterns
 */
function calculateChurnProbability(
  account: any,
  policies: any[],
  tasks: any[],
  quotes: any[],
  communications: any[]
): ChurnPredictionResult {
  let churnScore = 0;
  let maxScore = 0;
  const riskFactors: any[] = [];
  const protectiveFactors: any[] = [];

  // =============================================================================
  // RISK FACTOR 1: No Recent Contact (0-25 points risk)
  // =============================================================================
  const lastTask = tasks.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];

  const daysSinceContact = lastTask
    ? Math.floor((Date.now() - new Date(lastTask.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (daysSinceContact > 90) {
    const points = 25;
    churnScore += points;
    riskFactors.push({
      factor: `No contact in ${daysSinceContact} days`,
      weight: 0.25,
      severity: "critical",
      points,
    });
  } else if (daysSinceContact > 60) {
    const points = 15;
    churnScore += points;
    riskFactors.push({
      factor: `Limited contact (${daysSinceContact} days since last interaction)`,
      weight: 0.15,
      severity: "high",
      points,
    });
  } else if (daysSinceContact > 30) {
    const points = 8;
    churnScore += points;
    riskFactors.push({
      factor: `Infrequent contact (${daysSinceContact} days)`,
      weight: 0.08,
      severity: "medium",
      points,
    });
  }
  maxScore += 25;

  // =============================================================================
  // RISK FACTOR 2: Premium Changes (0-20 points risk)
  // =============================================================================
  // Check for recent premium increases
  const recentPolicies = policies.filter(p => {
    const monthsOld = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsOld <= 12;
  });

  let avgPremiumChange = 0;
  if (recentPolicies.length > 0) {
    // This is simplified - in production you'd compare to prior year
    const totalPremium = recentPolicies.reduce((sum, p) => sum + (p.premium || 0), 0);
    avgPremiumChange = totalPremium > 0 ? 10 : 0; // Placeholder logic
  }

  if (avgPremiumChange > 15) {
    const points = 20;
    churnScore += points;
    riskFactors.push({
      factor: `Premium increased ${avgPremiumChange.toFixed(1)}%`,
      weight: 0.20,
      severity: "high",
      points,
    });
  } else if (avgPremiumChange > 10) {
    const points = 12;
    churnScore += points;
    riskFactors.push({
      factor: `Moderate premium increase (${avgPremiumChange.toFixed(1)}%)`,
      weight: 0.12,
      severity: "medium",
      points,
    });
  }
  maxScore += 20;

  // =============================================================================
  // RISK FACTOR 3: Low Engagement (0-20 points risk)
  // =============================================================================
  const totalInteractions = tasks.length + communications.length;
  const accountAgeMonths = (Date.now() - new Date(account.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
  const interactionsPerMonth = totalInteractions / Math.max(accountAgeMonths, 1);

  if (interactionsPerMonth < 0.5) {
    const points = 20;
    churnScore += points;
    riskFactors.push({
      factor: `Very low engagement (${interactionsPerMonth.toFixed(1)} interactions/month)`,
      weight: 0.20,
      severity: "high",
      points,
    });
  } else if (interactionsPerMonth < 1) {
    const points = 10;
    churnScore += points;
    riskFactors.push({
      factor: `Low engagement (${interactionsPerMonth.toFixed(1)} interactions/month)`,
      weight: 0.10,
      severity: "medium",
      points,
    });
  }
  maxScore += 20;

  // =============================================================================
  // RISK FACTOR 4: Shopping Behavior (0-15 points risk)
  // =============================================================================
  const recentQuotes = quotes.filter(q => {
    const daysOld = (Date.now() - new Date(q.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld <= 30;
  });

  if (recentQuotes.length >= 3) {
    const points = 15;
    churnScore += points;
    riskFactors.push({
      factor: `Actively shopping (${recentQuotes.length} quotes in 30 days)`,
      weight: 0.15,
      severity: "critical",
      points,
    });
  } else if (recentQuotes.length >= 1) {
    const points = 8;
    churnScore += points;
    riskFactors.push({
      factor: `Considering alternatives (${recentQuotes.length} recent quotes)`,
      weight: 0.08,
      severity: "medium",
      points,
    });
  }
  maxScore += 15;

  // =============================================================================
  // RISK FACTOR 5: Policy Count Decline (0-10 points risk)
  // =============================================================================
  const activePolicies = policies.filter(p => p.status === "active");
  if (activePolicies.length === 1) {
    const points = 10;
    churnScore += points;
    riskFactors.push({
      factor: "Only one active policy (low retention anchor)",
      weight: 0.10,
      severity: "medium",
      points,
    });
  }
  maxScore += 10;

  // =============================================================================
  // RISK FACTOR 6: Upcoming Renewal (0-10 points risk)
  // =============================================================================
  const nextRenewal = policies
    .filter(p => p.renewal_date)
    .sort((a, b) => new Date(a.renewal_date).getTime() - new Date(b.renewal_date).getTime())[0];

  let daysUntilRenewal = null;
  if (nextRenewal?.renewal_date) {
    daysUntilRenewal = Math.floor(
      (new Date(nextRenewal.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilRenewal <= 30 && daysUntilRenewal > 0) {
      const points = 10;
      churnScore += points;
      riskFactors.push({
        factor: `Renewal approaching in ${daysUntilRenewal} days`,
        weight: 0.10,
        severity: "high",
        points,
      });
    }
  }
  maxScore += 10;

  // =============================================================================
  // PROTECTIVE FACTORS (reduce churn score)
  // =============================================================================

  // PROTECTIVE 1: Long Customer Tenure
  const tenureYears = accountAgeMonths / 12;
  if (tenureYears >= 5) {
    const reduction = 15;
    churnScore = Math.max(0, churnScore - reduction);
    protectiveFactors.push({
      factor: `Long-term customer (${tenureYears.toFixed(1)} years)`,
      weight: 0.15,
      points: reduction,
    });
  } else if (tenureYears >= 3) {
    const reduction = 8;
    churnScore = Math.max(0, churnScore - reduction);
    protectiveFactors.push({
      factor: `Established customer (${tenureYears.toFixed(1)} years)`,
      weight: 0.08,
      points: reduction,
    });
  }

  // PROTECTIVE 2: Multiple Policies
  if (activePolicies.length >= 3) {
    const reduction = 12;
    churnScore = Math.max(0, churnScore - reduction);
    protectiveFactors.push({
      factor: `Multiple policies (${activePolicies.length} active)`,
      weight: 0.12,
      points: reduction,
    });
  } else if (activePolicies.length === 2) {
    const reduction = 6;
    churnScore = Math.max(0, churnScore - reduction);
    protectiveFactors.push({
      factor: "Two active policies",
      weight: 0.06,
      points: reduction,
    });
  }

  // PROTECTIVE 3: Recent Positive Engagement
  const recentTasks = tasks.filter(t => {
    const daysOld = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld <= 30;
  });

  if (recentTasks.length >= 3) {
    const reduction = 10;
    churnScore = Math.max(0, churnScore - reduction);
    protectiveFactors.push({
      factor: `Active engagement (${recentTasks.length} interactions in 30 days)`,
      weight: 0.10,
      points: reduction,
    });
  }

  // =============================================================================
  // Calculate Final Churn Probability (0-100%)
  // =============================================================================
  const churnProbability = Math.round((churnScore / maxScore) * 100);
  const churnConfidence = Math.min(95, 60 + (riskFactors.length + protectiveFactors.length) * 5);

  // Determine risk level
  let churnRiskLevel = "low";
  if (churnProbability >= 70) churnRiskLevel = "critical";
  else if (churnProbability >= 50) churnRiskLevel = "high";
  else if (churnProbability >= 30) churnRiskLevel = "medium";

  // =============================================================================
  // Calculate Renewal Risk (slightly different from churn)
  // =============================================================================
  let renewalRiskProbability = churnProbability;
  if (daysUntilRenewal !== null && daysUntilRenewal <= 60) {
    renewalRiskProbability = Math.min(100, churnProbability + 15);
  }

  let renewalRiskLevel = "low";
  if (renewalRiskProbability >= 70) renewalRiskLevel = "critical";
  else if (renewalRiskProbability >= 50) renewalRiskLevel = "high";
  else if (renewalRiskProbability >= 30) renewalRiskLevel = "medium";

  // =============================================================================
  // Calculate Lifetime Value
  // =============================================================================
  const currentLtv = activePolicies.reduce((sum, p) => sum + (p.premium || 0), 0) * tenureYears;
  const predictedLtv = currentLtv * (1 + (1 - churnProbability / 100) * 0.5);

  let ltvTrend = "stable";
  if (predictedLtv > currentLtv * 1.1) ltvTrend = "increasing";
  else if (predictedLtv < currentLtv * 0.9) ltvTrend = "declining";

  // =============================================================================
  // Generate Recommended Actions
  // =============================================================================
  const recommendedActions = generateRecommendedActions(
    churnRiskLevel,
    riskFactors,
    daysUntilRenewal
  );

  // =============================================================================
  // Predict Next Product Purchases
  // =============================================================================
  const nextProductPredictions = predictNextProducts(account, activePolicies, tenureYears);

  return {
    accountId: account.id,
    churnProbability,
    churnRiskLevel,
    churnConfidence,
    renewalRiskProbability,
    renewalRiskLevel,
    daysUntilRenewal,
    predictedLtv: Math.round(predictedLtv),
    currentLtv: Math.round(currentLtv),
    ltvTrend,
    riskFactors,
    protectiveFactors,
    recommendedActions,
    nextProductPredictions,
  };
}

/**
 * Generate AI-powered recommended actions based on risk factors
 */
function generateRecommendedActions(
  riskLevel: string,
  riskFactors: any[],
  daysUntilRenewal: number | null
): any[] {
  const actions: any[] = [];

  // Critical risk actions
  if (riskLevel === "critical") {
    actions.push({
      action: "Urgent: Schedule immediate check-in call",
      priority: "urgent",
      due_days: 3,
      rationale: "High churn risk requires immediate personal outreach",
    });

    actions.push({
      action: "Review pricing and offer retention discount",
      priority: "urgent",
      due_days: 7,
      rationale: "Proactive pricing review can prevent churn",
    });
  }

  // High risk actions
  if (riskLevel === "high" || riskLevel === "critical") {
    actions.push({
      action: "Conduct comprehensive coverage review",
      priority: "high",
      due_days: 14,
      rationale: "Identify gaps and demonstrate value",
    });
  }

  // No recent contact actions
  if (riskFactors.some(f => f.factor.includes("No contact"))) {
    actions.push({
      action: "Schedule quarterly check-in",
      priority: "high",
      due_days: 7,
      rationale: "Re-engage customer with proactive communication",
    });
  }

  // Renewal approaching actions
  if (daysUntilRenewal !== null && daysUntilRenewal <= 45) {
    actions.push({
      action: "Send renewal reminder with policy summary",
      priority: "high",
      due_days: Math.max(1, daysUntilRenewal - 30),
      rationale: "Early renewal engagement improves retention",
    });
  }

  // Shopping behavior actions
  if (riskFactors.some(f => f.factor.includes("shopping") || f.factor.includes("quotes"))) {
    actions.push({
      action: "Competitive quote analysis and response",
      priority: "urgent",
      due_days: 5,
      rationale: "Customer is actively comparing - respond quickly",
    });
  }

  // General medium risk actions
  if (actions.length === 0 && riskLevel === "medium") {
    actions.push({
      action: "Send personalized value reminder email",
      priority: "medium",
      due_days: 14,
      rationale: "Maintain engagement and demonstrate ongoing value",
    });
  }

  return actions.slice(0, 5); // Return top 5 actions
}

/**
 * Predict next product purchases based on customer profile
 */
function predictNextProducts(account: any, policies: any[], tenureYears: number): any[] {
  const predictions: any[] = [];
  const policyTypes = new Set(policies.map(p => p.line_of_business?.toLowerCase() || ""));

  // Auto → Home cross-sell
  if (policyTypes.has("auto") && !policyTypes.has("home")) {
    predictions.push({
      product: "Homeowners Insurance",
      probability: tenureYears >= 2 ? 65 : 45,
      rationale: "Auto customers frequently bundle home insurance",
    });
  }

  // Home → Auto cross-sell
  if (policyTypes.has("home") && !policyTypes.has("auto")) {
    predictions.push({
      product: "Auto Insurance",
      probability: 70,
      rationale: "Homeowners typically need auto coverage",
    });
  }

  // Personal → Umbrella upsell
  if ((policyTypes.has("auto") || policyTypes.has("home")) && !policyTypes.has("umbrella")) {
    const totalPremium = policies.reduce((sum, p) => sum + (p.premium || 0), 0);
    if (totalPremium > 2000) {
      predictions.push({
        product: "Umbrella Policy",
        probability: 55,
        rationale: "High total premium suggests high net worth - umbrella recommended",
      });
    }
  }

  // Life insurance
  if (!policyTypes.has("life")) {
    predictions.push({
      product: "Life Insurance",
      probability: 40,
      rationale: "Foundational coverage for financial protection",
    });
  }

  // Valuable items
  if (policyTypes.has("home")) {
    predictions.push({
      product: "Valuable Items Coverage",
      probability: 35,
      rationale: "Homeowners often have jewelry, art, or collectibles",
    });
  }

  return predictions.sort((a, b) => b.probability - a.probability).slice(0, 3);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabaseClient, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const authenticatedUser = authResult;

    const { accountIds, calculateAll } = await req.json();

    // Validate request
    if (!accountIds && !calculateAll) {
      return new Response(
        JSON.stringify({ error: "Either accountIds or calculateAll must be provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build query for accounts to analyze
    let query = supabaseClient.from("accounts").select("*");

    if (accountIds) {
      query = query.in("id", accountIds);
    }

    const { data: accounts, error: accountsError } = await query;
    if (accountsError) throw accountsError;

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ error: "No accounts found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: ChurnPredictionResult[] = [];

    // Process each account
    for (const account of accounts) {
      // Fetch related data
      const [
        { data: policies },
        { data: tasks },
        { data: quotes },
        { data: communications },
      ] = await Promise.all([
        supabaseClient.from("policies").select("*").eq("account_id", account.id),
        supabaseClient.from("tasks").select("*").eq("account_id", account.id),
        supabaseClient.from("quotes").select("*").eq("account_id", account.id),
        supabaseClient
          .from("communications")
          .select("*")
          .eq("account_id", account.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      // Calculate risk scores
      const prediction = calculateChurnProbability(
        account,
        policies || [],
        tasks || [],
        quotes || [],
        communications || []
      );

      // Store in database
      await supabaseClient.from("customer_risk_scores").upsert({
        account_id: account.id,
        churn_probability: prediction.churnProbability,
        churn_risk_level: prediction.churnRiskLevel,
        churn_confidence: prediction.churnConfidence,
        renewal_risk_probability: prediction.renewalRiskProbability,
        renewal_risk_level: prediction.renewalRiskLevel,
        days_until_renewal: prediction.daysUntilRenewal,
        predicted_lifetime_value: prediction.predictedLtv,
        current_lifetime_value: prediction.currentLtv,
        ltv_trend: prediction.ltvTrend,
        risk_factors: prediction.riskFactors,
        protective_factors: prediction.protectiveFactors,
        recommended_actions: prediction.recommendedActions,
        next_product_predictions: prediction.nextProductPredictions,
        model_version: "v1.0",
        scoring_metadata: {
          calculated_at: new Date().toISOString(),
          risk_factor_count: prediction.riskFactors.length,
          protective_factor_count: prediction.protectiveFactors.length,
        },
        scored_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      }, {
        onConflict: "account_id",
      });

      results.push(prediction);
    }

    // Refresh materialized view
    await supabaseClient.rpc("refresh_churn_predictions");

    return new Response(
      JSON.stringify({
        success: true,
        analyzed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error("Error in calculate-customer-risk:", error);
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
