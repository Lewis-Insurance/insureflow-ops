import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth, verifyResourceAccess } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { ValidationError, NotFoundError, createErrorResponse } from "../_shared/error-handler.ts";

const logger = createLogger("calculate-quote-score");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QuoteCoverage {
  coverage_type: string;
  limit_amount?: string;
  deductible_amount?: string;
  premium_amount?: number;
  is_included: boolean;
}

interface CarrierRating {
  carrier_name: string;
  overall_rating: number;
  denial_rate: number;
  win_rate: number;
  customer_satisfaction_score?: number;
}

interface Quote {
  id: string;
  account_id: string;
  carrier_id?: string;
  premium?: number;
  line_of_business: string;
  quote_coverages?: QuoteCoverage[];
  carrier_info?: { name: string };
}

interface ScoringFactors {
  premium?: number;
  accountAveragePremium?: number;
  coverages: QuoteCoverage[];
  requiredCoverages: string[];
  carrierName: string;
  carrierRating?: CarrierRating;
  deductibles: { type: string; amount: number }[];
}

interface ScoringResult {
  total_score: number;
  price_score: number;
  coverage_completeness_score: number;
  carrier_rating_score: number;
  deductible_score: number;
  value_score: number;
  missing_critical_coverages: string[];
  recommendation: string;
  scoring_metadata: any;
}

/**
 * Get critical coverages based on line of business
 */
function getCriticalCoveragesForLOB(lob: string): string[] {
  const lobLower = lob?.toLowerCase() || '';

  if (lobLower.includes('auto') || lobLower.includes('vehicle')) {
    return ['BI', 'PD', 'COMP', 'COLL', 'UM'];
  } else if (lobLower.includes('home') || lobLower.includes('property')) {
    return ['Dwelling', 'Personal Property', 'Liability'];
  } else if (lobLower.includes('commercial')) {
    return ['GL', 'Property', 'Workers Comp'];
  } else {
    return ['BI', 'PD', 'COMP', 'COLL', 'UM']; // Default to auto
  }
}

/**
 * Parse deductible amount from text
 */
function parseDeductible(deductibleText?: string): number {
  if (!deductibleText) return 0;

  // Remove $ and commas, extract first number
  const match = deductibleText.replace(/[$,]/g, '').match(/\d+/);
  return match ? parseInt(match[0]) : 0;
}

/**
 * Calculate multi-dimensional quote score
 *
 * Scoring Breakdown:
 * - Price/Premium: 0-30 points (competitiveness vs average)
 * - Coverage Completeness: 0-25 points (critical coverages included)
 * - Carrier Rating: 0-20 points (quality, denial rate, win rate)
 * - Deductible Quality: 0-15 points (lower is better)
 * - Value Score: 0-10 points (price per coverage ratio)
 *
 * Total: 0-100 points
 */
function calculateQuoteScore(factors: ScoringFactors): ScoringResult {
  let price_score = 0;
  let coverage_score = 0;
  let carrier_score = 0;
  let deductible_score = 0;
  let value_score = 0;

  // ==========================================
  // FACTOR 1: Price/Premium Score (0-30 points)
  // ==========================================
  if (factors.premium && factors.accountAveragePremium) {
    const premiumRatio = factors.premium / factors.accountAveragePremium;

    if (premiumRatio <= 0.8) {
      price_score = 30; // 20%+ below average
    } else if (premiumRatio <= 0.9) {
      price_score = 25; // 10-20% below average
    } else if (premiumRatio <= 1.0) {
      price_score = 20; // At or slightly below average
    } else if (premiumRatio <= 1.1) {
      price_score = 15; // Slightly above average
    } else if (premiumRatio <= 1.2) {
      price_score = 10; // 10-20% above average
    } else {
      price_score = 5; // More than 20% above average
    }
  } else if (factors.premium) {
    // No average to compare, score based on absolute value
    if (factors.premium < 1000) {
      price_score = 25;
    } else if (factors.premium < 2000) {
      price_score = 20;
    } else if (factors.premium < 3000) {
      price_score = 15;
    } else if (factors.premium < 5000) {
      price_score = 10;
    } else {
      price_score = 5;
    }
  } else {
    price_score = 10; // No premium info = neutral
  }

  // ==========================================
  // FACTOR 2: Coverage Completeness (0-25 points)
  // ==========================================
  const includedCoverages = factors.coverages.filter((c: any) => c.is_included);
  const criticalCoverages = factors.requiredCoverages || ['BI', 'PD', 'COMP', 'COLL', 'UM'];

  const missingCritical = criticalCoverages.filter(
    type => !includedCoverages.some(c =>
      c.coverage_type.toUpperCase().includes(type.toUpperCase()) ||
      type.toUpperCase().includes(c.coverage_type.toUpperCase())
    )
  );

  if (missingCritical.length === 0) {
    coverage_score = 25; // All critical coverages
  } else if (missingCritical.length === 1) {
    coverage_score = 15; // Missing one critical
  } else if (missingCritical.length === 2) {
    coverage_score = 8; // Missing two critical
  } else {
    coverage_score = 0; // Missing 3+ critical
  }

  // ==========================================
  // FACTOR 3: Carrier Rating Score (0-20 points)
  // ==========================================
  if (factors.carrierRating) {
    const rating = factors.carrierRating.overall_rating || 0;
    const denialRate = factors.carrierRating.denial_rate || 0;
    const winRate = factors.carrierRating.win_rate || 0;

    // Base score from rating (0-10)
    carrier_score = Math.min(10, rating * 2);

    // Bonus for low denial rate (0-5)
    if (denialRate < 5) {
      carrier_score += 5;
    } else if (denialRate < 10) {
      carrier_score += 3;
    } else if (denialRate < 15) {
      carrier_score += 1;
    }

    // Bonus for high win rate (0-5)
    if (winRate > 50) {
      carrier_score += 5;
    } else if (winRate > 30) {
      carrier_score += 3;
    } else if (winRate > 10) {
      carrier_score += 1;
    }

    carrier_score = Math.min(20, carrier_score);
  } else {
    carrier_score = 10; // Default neutral score if no data
  }

  // ==========================================
  // FACTOR 4: Deductible Score (0-15 points)
  // ==========================================
  if (factors.deductibles.length > 0) {
    const avgDeductible = factors.deductibles.reduce((sum, d) => sum + d.amount, 0) / factors.deductibles.length;

    if (avgDeductible <= 250) {
      deductible_score = 15; // Very low deductibles
    } else if (avgDeductible <= 500) {
      deductible_score = 12; // Low deductibles
    } else if (avgDeductible <= 1000) {
      deductible_score = 8; // Moderate deductibles
    } else if (avgDeductible <= 2500) {
      deductible_score = 5; // Higher deductibles
    } else {
      deductible_score = 2; // Very high deductibles
    }
  } else {
    deductible_score = 7; // No deductible info = neutral
  }

  // ==========================================
  // FACTOR 5: Value Score (0-10 points)
  // ==========================================
  if (factors.premium && includedCoverages.length > 0) {
    const pricePerCoverage = factors.premium / includedCoverages.length;

    if (pricePerCoverage < 100) {
      value_score = 10; // Excellent value
    } else if (pricePerCoverage < 200) {
      value_score = 8; // Good value
    } else if (pricePerCoverage < 300) {
      value_score = 6; // Fair value
    } else if (pricePerCoverage < 500) {
      value_score = 4; // Below average value
    } else {
      value_score = 2; // Poor value
    }
  } else {
    value_score = 5; // Neutral
  }

  const total_score = Math.min(100, price_score + coverage_score + carrier_score + deductible_score + value_score);

  return {
    total_score,
    price_score,
    coverage_completeness_score: coverage_score,
    carrier_rating_score: carrier_score,
    deductible_score,
    value_score,
    missing_critical_coverages: missingCritical,
    recommendation: generateRecommendation(total_score, missingCritical, factors),
    scoring_metadata: {
      premium: factors.premium,
      account_average_premium: factors.accountAveragePremium,
      coverage_count: includedCoverages.length,
      missing_critical_count: missingCritical.length,
      avg_deductible: factors.deductibles.length > 0
        ? factors.deductibles.reduce((sum, d) => sum + d.amount, 0) / factors.deductibles.length
        : null,
      carrier_name: factors.carrierName,
    },
  };
}

/**
 * Generate AI recommendation based on score and factors
 */
function generateRecommendation(
  score: number,
  missingCritical: string[],
  factors: ScoringFactors
): string {
  if (score >= 85) {
    return "🌟 EXCELLENT QUOTE - This quote offers outstanding value with comprehensive coverage and competitive pricing. Highly recommended for presentation to the client.";
  } else if (score >= 70) {
    return "✅ STRONG QUOTE - Good balance of price and coverage. This is a solid option worth presenting to the client.";
  } else if (score >= 55) {
    let msg = "⚠️ ACCEPTABLE QUOTE - Meets basic requirements but has areas for improvement. ";
    if (missingCritical.length > 0) {
      msg += `Missing critical coverages: ${missingCritical.join(', ')}. `;
    }
    msg += "Consider negotiating better terms before presenting.";
    return msg;
  } else if (score >= 40) {
    let msg = "❌ BELOW STANDARD - Significant concerns with this quote. ";
    if (missingCritical.length > 0) {
      msg += `Critical gaps in coverage: ${missingCritical.join(', ')}. `;
    }
    msg += "Review carrier rating and premium competitiveness before presenting to client.";
    return msg;
  } else {
    let msg = "🚫 NOT RECOMMENDED - This quote has major issues including ";
    if (missingCritical.length > 0) {
      msg += `missing critical coverages (${missingCritical.join(', ')})`;
    } else {
      msg += "poor value and high premium";
    }
    msg += ". Recommend rejecting or requesting significant improvements from carrier.";
    return msg;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  logger.logRequest(req);

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabaseClient, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const { quoteIds, accountId, rescore_all } = await req.json();
    logger.info("Scoring quotes", { quoteIds, accountId, rescore_all });

    // Validate request
    if (!quoteIds && !accountId && !rescore_all) {
      throw new ValidationError("Either quoteIds, accountId, or rescore_all must be provided");
    }

    // Build query for quotes to score
    let query = supabaseClient
      .from("quotes")
      .select(`
        id,
        account_id,
        carrier_id,
        premium,
        line_of_business,
        quote_coverages (
          coverage_type,
          limit_amount,
          deductible_amount,
          premium_amount,
          is_included
        ),
        carrier_info:carriers!quotes_carrier_id_fkey(name)
      `);

    if (quoteIds) {
      query = query.in("id", quoteIds);
    } else if (accountId) {
      query = query.eq("account_id", accountId);
    }
    // If rescore_all, no filter needed

    const { data: quotes, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!quotes || quotes.length === 0) {
      throw new NotFoundError("No quotes found to score");
    }

    logger.info("Found quotes to score", { count: quotes.length });

    // Calculate average premium for each account (for comparison)
    const accountAverages = new Map<string, number>();
    for (const quote of quotes) {
      if (!accountAverages.has(quote.account_id)) {
        const { data: acctQuotes } = await supabaseClient
          .from("quotes")
          .select("premium")
          .eq("account_id", quote.account_id)
          .not("premium", "is", null);

        if (acctQuotes && acctQuotes.length > 0) {
          const avg = acctQuotes.reduce((sum, q) => sum + (q.premium || 0), 0) / acctQuotes.length;
          accountAverages.set(quote.account_id, avg);
        }
      }
    }

    // Fetch carrier ratings
    const carrierNames = [
      ...new Set(
        quotes
          .map((q: any) => q.carrier_info?.name)
          .filter(Boolean) as string[]
      ),
    ];

    const { data: carrierRatings } = await supabaseClient
      .from("carrier_ratings")
      .select("*")
      .in("carrier_name", carrierNames);

    const carrierRatingMap = new Map(
      carrierRatings?.map((cr: any) => [cr.carrier_name, cr]) || []
    );

    // Score each quote
    const updates = [];
    for (const quote of quotes) {
      const factors: ScoringFactors = {
        premium: quote.premium || undefined,
        accountAveragePremium: accountAverages.get(quote.account_id),
        coverages: quote.quote_coverages || [],
        requiredCoverages: getCriticalCoveragesForLOB(quote.line_of_business),
        carrierName: quote.carrier_info?.name || "",
        carrierRating: carrierRatingMap.get(quote.carrier_info?.name || ""),
        deductibles: (quote.quote_coverages || [])
          .filter((c: any) => c.deductible_amount)
          .map((c: any) => ({
            type: c.coverage_type,
            amount: parseDeductible(c.deductible_amount),
          })),
      };

      const scoringResult = calculateQuoteScore(factors);

      await supabaseClient
        .from("quotes")
        .update({
          quote_score: scoringResult.total_score,
          price_score: scoringResult.price_score,
          coverage_completeness_score: scoringResult.coverage_completeness_score,
          carrier_rating_score: scoringResult.carrier_rating_score,
          deductible_score: scoringResult.deductible_score,
          value_score: scoringResult.value_score,
          ai_recommendation: scoringResult.recommendation,
          scoring_metadata: {
            ...scoringResult.scoring_metadata,
            missing_critical_coverages: scoringResult.missing_critical_coverages,
            scored_at: new Date().toISOString(),
          },
          last_scored_at: new Date().toISOString(),
        })
        .eq("id", quote.id);

      updates.push({
        id: quote.id,
        score: scoringResult.total_score,
        ...scoringResult,
      });
    }

    logger.info("Quote scoring complete", { scoredCount: updates.length });
    logger.logResponse(200);

    return new Response(
      JSON.stringify({
        success: true,
        scored: updates.length,
        scores: updates,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    logger.error("Quote scoring failed", { error: error instanceof Error ? error.message : String(error) });
    return createErrorResponse(error, corsHeaders);
  }
});
