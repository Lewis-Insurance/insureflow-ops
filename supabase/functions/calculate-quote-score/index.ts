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

interface CoverageLimitStandard {
  coverage_type: string;
  line_of_business: string;
  min_recommended: number;
  good_limit: number;
  excellent_limit: number;
  limit_parse_mode: 'single' | 'per_person' | 'per_occurrence' | 'aggregate';
}

interface ScoringWeights {
  price_weight: number;
  coverage_weight: number;
  carrier_weight: number;
  deductible_weight: number;
  value_weight: number;
  profile_id: string | null;
  profile_name: string | null;
}

interface ScoringFactors {
  premium?: number;
  accountAveragePremium?: number;
  coverages: QuoteCoverage[];
  requiredCoverages: string[];
  carrierName: string;
  carrierRating?: CarrierRating;
  deductibles: { type: string; amount: number }[];
  limitStandards?: CoverageLimitStandard[];
}

interface CoverageAdequacyResult {
  completeness_points: number;
  adequacy_points: number;
  total_score: number;
  missing_critical: string[];
  below_minimum_limits: { coverage: string; limit: number; minimum: number }[];
  coverage_tiers: { coverage: string; tier: string; limit: number }[];
}

interface ScoringResult {
  total_score: number;
  price_score: number;
  coverage_completeness_score: number;
  coverage_limit_adequacy_score: number;
  carrier_rating_score: number;
  deductible_score: number;
  value_score: number;
  missing_critical_coverages: string[];
  below_minimum_limits: { coverage: string; limit: number; minimum: number }[];
  recommendation: string;
  scoring_metadata: any;
  weights_used: ScoringWeights;
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
 * Parse limit amount strings like "100/300/50" or "$250,000"
 * Returns numeric value in dollars based on parse mode
 */
function parseLimitAmount(
  limitText: string | undefined,
  parseMode: 'single' | 'per_person' | 'per_occurrence' | 'aggregate' = 'single'
): number {
  if (!limitText) return 0;

  const cleaned = limitText.replace(/[$,]/g, '').trim();

  // Handle split limits like "100/300/50" (per_person/per_occurrence/property_damage)
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/').map(p => parseFloat(p.trim()) || 0);
    switch (parseMode) {
      case 'per_person':
        return parts[0] * 1000; // First number in thousands
      case 'per_occurrence':
        return parts[1] ? parts[1] * 1000 : parts[0] * 1000;
      case 'aggregate':
        return parts.length > 2 ? parts[2] * 1000 : (parts[1] || parts[0]) * 1000;
      default:
        return parts[0] * 1000;
    }
  }

  // Handle "k" and "M" suffixes (e.g., "250k", "1M")
  const suffixMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/);
  if (suffixMatch) {
    const value = parseFloat(suffixMatch[1]);
    const multiplier = suffixMatch[2]?.toLowerCase();
    if (multiplier === 'k') return value * 1000;
    if (multiplier === 'm') return value * 1000000;
    return value;
  }

  // Handle plain numbers (might be in thousands if small)
  const numMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) {
    const value = parseFloat(numMatch[1]);
    // If value < 1000, assume it's in thousands (common in insurance)
    return value < 1000 ? value * 1000 : value;
  }

  return 0;
}

/**
 * Calculate limit adequacy tier and score for a single coverage
 */
function calculateLimitAdequacy(
  parsedLimit: number,
  standard: CoverageLimitStandard
): { score: number; tier: string } {
  // Skip scoring for coverages with 0 thresholds (like COMP/COLL which are ACV-based)
  if (standard.min_recommended === 0 && standard.good_limit === 0) {
    return { score: 10, tier: 'excellent' }; // ACV-based coverages get full score if included
  }

  if (parsedLimit >= standard.excellent_limit) {
    return { score: 10, tier: 'excellent' };
  }
  if (parsedLimit >= standard.good_limit) {
    return { score: 8, tier: 'good' };
  }
  if (parsedLimit >= standard.min_recommended) {
    return { score: 5, tier: 'at_minimum' };
  }
  return { score: 0, tier: 'below_minimum' };
}

/**
 * Calculate comprehensive coverage adequacy score including limit evaluation
 * Returns score breakdown: completeness (0-15) + adequacy (0-10) = 0-25 total
 */
function calculateCoverageAdequacyScore(
  coverages: QuoteCoverage[],
  requiredCoverages: string[],
  limitStandards: CoverageLimitStandard[]
): CoverageAdequacyResult {
  const includedCoverages = coverages.filter(c => c.is_included);

  // Build standards map by coverage type
  const standardsMap = new Map<string, CoverageLimitStandard>();
  limitStandards.forEach(s => standardsMap.set(s.coverage_type.toUpperCase(), s));

  // Part 1: Completeness check (max 15 points)
  const missingCritical = requiredCoverages.filter(
    type => !includedCoverages.some(c =>
      c.coverage_type.toUpperCase().includes(type.toUpperCase()) ||
      type.toUpperCase().includes(c.coverage_type.toUpperCase())
    )
  );

  let completeness_points = 0;
  if (missingCritical.length === 0) completeness_points = 15;
  else if (missingCritical.length === 1) completeness_points = 10;
  else if (missingCritical.length === 2) completeness_points = 5;

  // Part 2: Limit adequacy check (max 10 points)
  let totalAdequacyScore = 0;
  let scoredCoverages = 0;
  const belowMinimumLimits: { coverage: string; limit: number; minimum: number }[] = [];
  const coverageTiers: { coverage: string; tier: string; limit: number }[] = [];

  for (const coverage of includedCoverages) {
    const coverageKey = coverage.coverage_type.toUpperCase();
    const standard = standardsMap.get(coverageKey);
    if (!standard) continue;

    const parsedLimit = parseLimitAmount(coverage.limit_amount, standard.limit_parse_mode);
    const adequacy = calculateLimitAdequacy(parsedLimit, standard);

    totalAdequacyScore += adequacy.score;
    scoredCoverages++;

    coverageTiers.push({
      coverage: coverage.coverage_type,
      tier: adequacy.tier,
      limit: parsedLimit
    });

    if (adequacy.tier === 'below_minimum' && standard.min_recommended > 0) {
      belowMinimumLimits.push({
        coverage: coverage.coverage_type,
        limit: parsedLimit,
        minimum: standard.min_recommended
      });
    }
  }

  // Normalize adequacy to 10 points max
  const adequacy_points = scoredCoverages > 0
    ? Math.round((totalAdequacyScore / (scoredCoverages * 10)) * 10)
    : 5; // Neutral if no standards apply

  return {
    completeness_points,
    adequacy_points,
    total_score: completeness_points + adequacy_points,
    missing_critical: missingCritical,
    below_minimum_limits: belowMinimumLimits,
    coverage_tiers: coverageTiers
  };
}

/**
 * Get effective scoring weights for an account
 * Priority: account override > agency default > system default
 */
async function getScoringWeights(
  supabaseClient: any,
  accountId: string,
  agencyWorkspaceId?: string
): Promise<ScoringWeights> {
  const defaultWeights: ScoringWeights = {
    price_weight: 30,
    coverage_weight: 25,
    carrier_weight: 20,
    deductible_weight: 15,
    value_weight: 10,
    profile_id: null,
    profile_name: 'Hardcoded Default'
  };

  try {
    // Try to use the database function for resolving effective profile
    const { data: profile, error } = await supabaseClient.rpc(
      'get_effective_weight_profile',
      {
        p_account_id: accountId,
        p_agency_workspace_id: agencyWorkspaceId || null
      }
    );

    if (error) {
      logger.warn("Could not fetch weight profile, using defaults", { error: error.message });
      return defaultWeights;
    }

    if (profile) {
      return {
        price_weight: profile.price_weight,
        coverage_weight: profile.coverage_weight,
        carrier_weight: profile.carrier_weight,
        deductible_weight: profile.deductible_weight,
        value_weight: profile.value_weight,
        profile_id: profile.id,
        profile_name: profile.name
      };
    }
  } catch (err) {
    logger.warn("Weight profile fetch failed, using defaults", { error: err });
  }

  return defaultWeights;
}

/**
 * Fetch coverage limit standards for a line of business
 */
async function fetchLimitStandards(
  supabaseClient: any,
  lineOfBusiness: string,
  agencyWorkspaceId?: string
): Promise<CoverageLimitStandard[]> {
  try {
    const { data, error } = await supabaseClient.rpc(
      'get_coverage_limit_standards',
      {
        p_line_of_business: lineOfBusiness.toLowerCase(),
        p_agency_workspace_id: agencyWorkspaceId || null
      }
    );

    if (error) {
      logger.warn("Could not fetch limit standards", { error: error.message });
      return [];
    }

    return data || [];
  } catch (err) {
    logger.warn("Limit standards fetch failed", { error: err });
    return [];
  }
}

/**
 * Calculate multi-dimensional quote score with dynamic weights
 *
 * Scoring uses customizable weights that sum to 100:
 * - Price/Premium: competitiveness vs average
 * - Coverage: completeness (15pts) + limit adequacy (10pts)
 * - Carrier Rating: quality, denial rate, win rate
 * - Deductible Quality: lower is better
 * - Value Score: price per coverage ratio
 *
 * Raw scores are calculated on a 0-100 scale, then weighted
 */
function calculateQuoteScore(
  factors: ScoringFactors,
  weights: ScoringWeights
): ScoringResult {
  const includedCoverages = factors.coverages.filter((c: any) => c.is_included);

  // ==========================================
  // FACTOR 1: Price/Premium (Raw: 0-100)
  // ==========================================
  let rawPriceScore = 0;
  if (factors.premium && factors.accountAveragePremium) {
    const premiumRatio = factors.premium / factors.accountAveragePremium;

    if (premiumRatio <= 0.8) rawPriceScore = 100;      // 20%+ below average
    else if (premiumRatio <= 0.9) rawPriceScore = 83;  // 10-20% below
    else if (premiumRatio <= 1.0) rawPriceScore = 67;  // At or slightly below
    else if (premiumRatio <= 1.1) rawPriceScore = 50;  // Slightly above
    else if (premiumRatio <= 1.2) rawPriceScore = 33;  // 10-20% above
    else rawPriceScore = 17;                           // 20%+ above
  } else if (factors.premium) {
    // No average to compare
    if (factors.premium < 1000) rawPriceScore = 83;
    else if (factors.premium < 2000) rawPriceScore = 67;
    else if (factors.premium < 3000) rawPriceScore = 50;
    else if (factors.premium < 5000) rawPriceScore = 33;
    else rawPriceScore = 17;
  } else {
    rawPriceScore = 50; // No premium info = neutral
  }

  // ==========================================
  // FACTOR 2: Coverage Adequacy (Raw: 0-100)
  // ==========================================
  const coverageAdequacy = calculateCoverageAdequacyScore(
    factors.coverages,
    factors.requiredCoverages || ['BI', 'PD', 'COMP', 'COLL', 'UM'],
    factors.limitStandards || []
  );
  // Convert 0-25 to 0-100 scale
  const rawCoverageScore = (coverageAdequacy.total_score / 25) * 100;

  // ==========================================
  // FACTOR 3: Carrier Rating (Raw: 0-100)
  // ==========================================
  let rawCarrierScore = 50; // Default neutral
  if (factors.carrierRating) {
    const rating = factors.carrierRating.overall_rating || 0;
    const denialRate = factors.carrierRating.denial_rate || 0;
    const winRate = factors.carrierRating.win_rate || 0;

    // Base from rating (0-50)
    let carrierPoints = Math.min(50, rating * 10);

    // Bonus for low denial rate (0-25)
    if (denialRate < 5) carrierPoints += 25;
    else if (denialRate < 10) carrierPoints += 15;
    else if (denialRate < 15) carrierPoints += 5;

    // Bonus for high win rate (0-25)
    if (winRate > 50) carrierPoints += 25;
    else if (winRate > 30) carrierPoints += 15;
    else if (winRate > 10) carrierPoints += 5;

    rawCarrierScore = Math.min(100, carrierPoints);
  }

  // ==========================================
  // FACTOR 4: Deductible Quality (Raw: 0-100)
  // ==========================================
  let rawDeductibleScore = 50; // Default neutral
  if (factors.deductibles.length > 0) {
    const avgDeductible = factors.deductibles.reduce((sum, d) => sum + d.amount, 0) / factors.deductibles.length;

    if (avgDeductible <= 250) rawDeductibleScore = 100;
    else if (avgDeductible <= 500) rawDeductibleScore = 80;
    else if (avgDeductible <= 1000) rawDeductibleScore = 53;
    else if (avgDeductible <= 2500) rawDeductibleScore = 33;
    else rawDeductibleScore = 13;
  }

  // ==========================================
  // FACTOR 5: Value Score (Raw: 0-100)
  // ==========================================
  let rawValueScore = 50; // Default neutral
  if (factors.premium && includedCoverages.length > 0) {
    const pricePerCoverage = factors.premium / includedCoverages.length;

    if (pricePerCoverage < 100) rawValueScore = 100;
    else if (pricePerCoverage < 200) rawValueScore = 80;
    else if (pricePerCoverage < 300) rawValueScore = 60;
    else if (pricePerCoverage < 500) rawValueScore = 40;
    else rawValueScore = 20;
  }

  // ==========================================
  // Apply Weights (weights sum to 100)
  // ==========================================
  const price_score = Math.round((rawPriceScore * weights.price_weight) / 100);
  const coverage_score = Math.round((rawCoverageScore * weights.coverage_weight) / 100);
  const carrier_score = Math.round((rawCarrierScore * weights.carrier_weight) / 100);
  const deductible_score = Math.round((rawDeductibleScore * weights.deductible_weight) / 100);
  const value_score = Math.round((rawValueScore * weights.value_weight) / 100);

  const total_score = Math.min(100, price_score + coverage_score + carrier_score + deductible_score + value_score);

  return {
    total_score,
    price_score,
    coverage_completeness_score: coverage_score,
    coverage_limit_adequacy_score: coverageAdequacy.total_score,
    carrier_rating_score: carrier_score,
    deductible_score,
    value_score,
    missing_critical_coverages: coverageAdequacy.missing_critical,
    below_minimum_limits: coverageAdequacy.below_minimum_limits,
    recommendation: generateRecommendation(total_score, coverageAdequacy.missing_critical, factors, coverageAdequacy.below_minimum_limits),
    scoring_metadata: {
      premium: factors.premium,
      account_average_premium: factors.accountAveragePremium,
      coverage_count: includedCoverages.length,
      missing_critical_count: coverageAdequacy.missing_critical.length,
      below_minimum_count: coverageAdequacy.below_minimum_limits.length,
      coverage_tiers: coverageAdequacy.coverage_tiers,
      completeness_points: coverageAdequacy.completeness_points,
      adequacy_points: coverageAdequacy.adequacy_points,
      avg_deductible: factors.deductibles.length > 0
        ? factors.deductibles.reduce((sum, d) => sum + d.amount, 0) / factors.deductibles.length
        : null,
      carrier_name: factors.carrierName,
      raw_scores: {
        price: rawPriceScore,
        coverage: rawCoverageScore,
        carrier: rawCarrierScore,
        deductible: rawDeductibleScore,
        value: rawValueScore
      }
    },
    weights_used: weights
  };
}

/**
 * Generate AI recommendation based on score and factors
 */
function generateRecommendation(
  score: number,
  missingCritical: string[],
  factors: ScoringFactors,
  belowMinimumLimits: { coverage: string; limit: number; minimum: number }[] = []
): string {
  const hasLimitIssues = belowMinimumLimits.length > 0;
  const hasCoverageIssues = missingCritical.length > 0;

  if (score >= 85) {
    return "🌟 EXCELLENT QUOTE - This quote offers outstanding value with comprehensive coverage and competitive pricing. Highly recommended for presentation to the client.";
  } else if (score >= 70) {
    let msg = "✅ STRONG QUOTE - Good balance of price and coverage. ";
    if (hasLimitIssues) {
      msg += `Note: ${belowMinimumLimits.length} coverage(s) have limits below recommended minimums. `;
    }
    msg += "This is a solid option worth presenting to the client.";
    return msg;
  } else if (score >= 55) {
    let msg = "⚠️ ACCEPTABLE QUOTE - Meets basic requirements but has areas for improvement. ";
    if (hasCoverageIssues) {
      msg += `Missing critical coverages: ${missingCritical.join(', ')}. `;
    }
    if (hasLimitIssues) {
      const limitWarnings = belowMinimumLimits.map(l =>
        `${l.coverage} ($${l.limit.toLocaleString()} vs min $${l.minimum.toLocaleString()})`
      ).join(', ');
      msg += `Below-minimum limits: ${limitWarnings}. `;
    }
    msg += "Consider negotiating better terms before presenting.";
    return msg;
  } else if (score >= 40) {
    let msg = "❌ BELOW STANDARD - Significant concerns with this quote. ";
    if (hasCoverageIssues) {
      msg += `Critical gaps in coverage: ${missingCritical.join(', ')}. `;
    }
    if (hasLimitIssues) {
      msg += `${belowMinimumLimits.length} coverage limit(s) below minimum recommendations. `;
    }
    msg += "Review carrier rating and premium competitiveness before presenting to client.";
    return msg;
  } else {
    let msg = "🚫 NOT RECOMMENDED - This quote has major issues including ";
    const issues: string[] = [];
    if (hasCoverageIssues) {
      issues.push(`missing critical coverages (${missingCritical.join(', ')})`);
    }
    if (hasLimitIssues) {
      issues.push(`inadequate limits on ${belowMinimumLimits.length} coverage(s)`);
    }
    if (issues.length === 0) {
      issues.push("poor value and high premium");
    }
    msg += issues.join(' and ');
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

    // Cache for weights and limit standards (by account and LOB)
    const weightsCache = new Map<string, ScoringWeights>();
    const limitStandardsCache = new Map<string, CoverageLimitStandard[]>();

    // Score each quote
    const updates = [];
    for (const quote of quotes) {
      // Fetch or get cached weights for this account
      let weights = weightsCache.get(quote.account_id);
      if (!weights) {
        weights = await getScoringWeights(supabaseClient, quote.account_id);
        weightsCache.set(quote.account_id, weights);
      }

      // Fetch or get cached limit standards for this LOB
      const lobKey = quote.line_of_business?.toLowerCase() || 'auto';
      let limitStandards = limitStandardsCache.get(lobKey);
      if (!limitStandards) {
        limitStandards = await fetchLimitStandards(supabaseClient, lobKey);
        limitStandardsCache.set(lobKey, limitStandards);
      }

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
        limitStandards: limitStandards,
      };

      const scoringResult = calculateQuoteScore(factors, weights);

      await supabaseClient
        .from("quotes")
        .update({
          quote_score: scoringResult.total_score,
          price_score: scoringResult.price_score,
          coverage_completeness_score: scoringResult.coverage_completeness_score,
          coverage_limit_adequacy_score: scoringResult.coverage_limit_adequacy_score,
          carrier_rating_score: scoringResult.carrier_rating_score,
          deductible_score: scoringResult.deductible_score,
          value_score: scoringResult.value_score,
          scoring_weight_profile_id: weights.profile_id,
          ai_recommendation: scoringResult.recommendation,
          scoring_metadata: {
            ...scoringResult.scoring_metadata,
            missing_critical_coverages: scoringResult.missing_critical_coverages,
            below_minimum_limits: scoringResult.below_minimum_limits,
            weights_used: {
              price: weights.price_weight,
              coverage: weights.coverage_weight,
              carrier: weights.carrier_weight,
              deductible: weights.deductible_weight,
              value: weights.value_weight,
              profile_id: weights.profile_id,
              profile_name: weights.profile_name,
            },
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
