import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CoverageGapRequest {
  account_id: string;
  customer_profile?: {
    industry?: string;
    employees?: number;
    revenue?: number;
    vehicles?: number;
    handles_client_data?: boolean;
    [key: string]: any;
  };
  current_policies?: Array<{
    coverage_type: string;
    limits?: string;
    deductible?: string;
    premium?: number;
  }>;
  analysis_type?: 'automatic' | 'manual' | 'scheduled';
}

interface CoverageGap {
  coverage_type: string;
  coverage_name: string;
  gap_severity: 'low' | 'medium' | 'high' | 'critical';
  gap_description: string;
  recommendation_reason: string;
  risk_if_not_covered: string;
  recommended_limits: string;
  estimated_premium: number;
  priority: number;
}

interface AnalysisResult {
  account_id: string;
  customer_profile: any;
  current_policies: any[];
  identified_gaps: any[];
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_factors: string[];
  recommended_coverages: any[];
  estimated_premium_increase: number;
  estimated_annual_premium: number;
  ai_summary: string;
  ai_recommendations: string;
  analysis_type: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const requestData: CoverageGapRequest = await req.json();
    const {
      account_id,
      customer_profile = {},
      current_policies = [],
      analysis_type = 'automatic',
    } = requestData;

    if (!account_id) {
      throw new Error('account_id is required');
    }

    // Fetch account details if customer_profile not provided
    let profile = customer_profile;
    let customerName = '';

    if (!profile.industry) {
      const { data: accountData, error: accountError } = await supabaseClient
        .from('accounts')
        .select('name, industry, custom_fields')
        .eq('id', account_id)
        .single();

      if (accountError) throw accountError;

      customerName = accountData.name;
      profile = {
        industry: accountData.industry,
        ...accountData.custom_fields,
        ...profile,
      };
    }

    // Fetch current policies if not provided
    let policies = current_policies;
    if (policies.length === 0) {
      const { data: policyData } = await supabaseClient
        .from('policies')
        .select('coverage_type, policy_number, premium, status')
        .eq('account_id', account_id)
        .eq('status', 'active');

      if (policyData) {
        policies = policyData.map(p => ({
          coverage_type: p.coverage_type,
          premium: p.premium,
        }));
      }
    }

    // Fetch matching templates based on industry
    const { data: templates } = await supabaseClient
      .from('coverage_gap_templates')
      .select('*')
      .eq('is_active', true)
      .or(`industry.eq.${profile.industry},industry.is.null`)
      .order('priority', { ascending: false });

    // Analyze coverage gaps
    const gaps: CoverageGap[] = [];
    const riskFactors: string[] = [];
    let riskScore = 0;

    // Get current coverage types
    const currentCoverageTypes = new Set(policies.map(p => p.coverage_type));

    // Analyze each template
    for (const template of templates || []) {
      const { required_coverages, recommended_coverages, risk_indicators } = template;

      // Check required coverages
      for (const requiredCoverage of required_coverages || []) {
        if (!currentCoverageTypes.has(requiredCoverage)) {
          gaps.push(await generateGapRecommendation(
            requiredCoverage,
            'critical',
            profile,
            template,
            supabaseClient
          ));
          riskFactors.push(`Missing required coverage: ${requiredCoverage}`);
          riskScore += 25;
        }
      }

      // Check recommended coverages based on risk indicators
      const meetsRiskIndicators = evaluateRiskIndicators(profile, risk_indicators);
      if (meetsRiskIndicators) {
        for (const recommendedCoverage of recommended_coverages || []) {
          if (!currentCoverageTypes.has(recommendedCoverage)) {
            const severity = calculateGapSeverity(profile, recommendedCoverage);
            gaps.push(await generateGapRecommendation(
              recommendedCoverage,
              severity,
              profile,
              template,
              supabaseClient
            ));

            if (severity === 'high' || severity === 'critical') {
              riskFactors.push(`Recommended coverage gap: ${recommendedCoverage}`);
              riskScore += severity === 'critical' ? 20 : 10;
            }
          }
        }
      }
    }

    // Cap risk score at 100
    riskScore = Math.min(riskScore, 100);

    // Determine risk level
    const riskLevel =
      riskScore >= 75 ? 'critical' :
      riskScore >= 50 ? 'high' :
      riskScore >= 25 ? 'medium' : 'low';

    // Calculate premium estimates
    const estimatedPremiumIncrease = gaps.reduce((sum, gap) => sum + gap.estimated_premium, 0);
    const currentAnnualPremium = policies.reduce((sum, p) => sum + (p.premium || 0), 0);
    const estimatedAnnualPremium = currentAnnualPremium + estimatedPremiumIncrease;

    // Generate AI summary
    const aiSummary = generateAISummary(gaps, riskScore, riskLevel, profile);
    const aiRecommendations = generateAIRecommendations(gaps, profile);

    // Prepare recommended coverages
    const recommendedCoverages = gaps.map(gap => ({
      coverage_type: gap.coverage_type,
      coverage_name: gap.coverage_name,
      severity: gap.gap_severity,
      estimated_premium: gap.estimated_premium,
      priority: gap.priority,
    }));

    // Create analysis record
    const analysisResult: AnalysisResult = {
      account_id,
      customer_profile: profile,
      current_policies: policies,
      identified_gaps: gaps,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_factors: riskFactors,
      recommended_coverages: recommendedCoverages,
      estimated_premium_increase: estimatedPremiumIncrease,
      estimated_annual_premium: estimatedAnnualPremium,
      ai_summary: aiSummary,
      ai_recommendations: aiRecommendations,
      analysis_type,
    };

    // Insert analysis into database
    const { data: analysisData, error: insertError } = await supabaseClient
      .from('coverage_gap_analysis')
      .insert({
        ...analysisResult,
        customer_name: customerName,
        analyzed_by: user.id,
        analysis_date: new Date().toISOString(),
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Insert individual recommendations
    if (gaps.length > 0) {
      const recommendations = gaps.map(gap => ({
        gap_analysis_id: analysisData.id,
        ...gap,
      }));

      const { error: recsError } = await supabaseClient
        .from('coverage_recommendations')
        .insert(recommendations);

      if (recsError) console.error('Error inserting recommendations:', recsError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysisData,
        gaps_found: gaps.length,
        risk_level: riskLevel,
        estimated_premium_increase: estimatedPremiumIncrease,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in analyze-coverage-gaps:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

async function generateGapRecommendation(
  coverageType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  profile: any,
  template: any,
  supabaseClient: any
): Promise<CoverageGap> {
  // Coverage type to name mapping
  const coverageNames: Record<string, string> = {
    general_liability: 'General Liability Insurance',
    workers_comp: "Workers' Compensation",
    commercial_auto: 'Commercial Auto Insurance',
    professional_liability: 'Professional Liability (E&O)',
    cyber_liability: 'Cyber Liability Insurance',
    umbrella: 'Umbrella/Excess Liability',
    builders_risk: "Builders Risk Insurance",
    equipment: 'Equipment Insurance',
    pollution_liability: 'Pollution Liability',
    employment_practices: 'Employment Practices Liability (EPLI)',
  };

  const coverageName = coverageNames[coverageType] || coverageType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // Generate recommendations based on coverage type and profile
  const recommendations = generateCoverageRecommendation(coverageType, severity, profile);

  return {
    coverage_type: coverageType,
    coverage_name: coverageName,
    gap_severity: severity,
    ...recommendations,
  };
}

function generateCoverageRecommendation(
  coverageType: string,
  severity: string,
  profile: any
): Omit<CoverageGap, 'coverage_type' | 'coverage_name' | 'gap_severity'> {
  const industry = profile.industry || 'general';
  const employees = profile.employees || 0;
  const revenue = profile.revenue || 0;

  // Coverage-specific recommendations
  const recommendations: Record<string, any> = {
    general_liability: {
      gap_description: 'General Liability insurance is missing from your coverage portfolio.',
      recommendation_reason: 'Protects against third-party bodily injury and property damage claims, which are common risks for all businesses.',
      risk_if_not_covered: 'Without GL coverage, your business is exposed to potentially catastrophic lawsuits from customers, vendors, or visitors. A single slip-and-fall incident could result in six-figure legal costs.',
      recommended_limits: '$1,000,000 per occurrence / $2,000,000 aggregate',
      estimated_premium: 1200,
      priority: 10,
    },
    workers_comp: {
      gap_description: "Workers' Compensation insurance is not currently in place.",
      recommendation_reason: `With ${employees} employees, you are legally required to carry Workers' Comp in most states. This coverage protects both your employees and your business.`,
      risk_if_not_covered: 'Operating without Workers Comp is illegal in most jurisdictions and exposes you to unlimited liability for employee injuries. Fines can reach $10,000+ per violation.',
      recommended_limits: 'Statutory limits per state requirements',
      estimated_premium: employees * 150,
      priority: 10,
    },
    commercial_auto: {
      gap_description: 'Commercial Auto insurance is not included in your current policies.',
      recommendation_reason: 'If you or your employees use vehicles for business purposes, personal auto policies will not provide coverage.',
      risk_if_not_covered: 'Accidents involving business use of vehicles could leave you personally liable for damages, medical bills, and legal costs. Personal auto policies typically exclude business use.',
      recommended_limits: '$1,000,000 Combined Single Limit',
      estimated_premium: 1500,
      priority: 9,
    },
    professional_liability: {
      gap_description: 'Professional Liability (Errors & Omissions) coverage is absent.',
      recommendation_reason: `${industry === 'professional_services' ? 'As a professional services firm' : 'Your business'} provides advice or services to clients, creating exposure to professional negligence claims.`,
      risk_if_not_covered: 'Claims alleging professional errors, negligence, or failure to deliver services can result in costly lawsuits and damage to reputation. Defense costs alone can exceed $50,000.',
      recommended_limits: '$1,000,000 per claim / $2,000,000 aggregate',
      estimated_premium: 2000,
      priority: 9,
    },
    cyber_liability: {
      gap_description: 'Cyber Liability insurance is not currently part of your coverage.',
      recommendation_reason: `${profile.handles_client_data ? 'Since you handle client data' : 'With increasing cyber threats'}, cyber insurance is essential to protect against data breaches, ransomware, and business interruption.`,
      risk_if_not_covered: 'A single data breach can cost $150,000+ in notification costs, credit monitoring, legal fees, and regulatory fines. Ransomware attacks can shut down operations for weeks.',
      recommended_limits: '$1,000,000 coverage with $50,000 sublimit for ransomware',
      estimated_premium: 1800,
      priority: 8,
    },
    umbrella: {
      gap_description: 'Umbrella/Excess Liability coverage is missing.',
      recommendation_reason: `With annual revenue of $${revenue.toLocaleString()}, an umbrella policy provides additional protection beyond your primary policies' limits.`,
      risk_if_not_covered: 'Catastrophic claims can quickly exhaust primary policy limits, leaving your business assets vulnerable. Umbrella coverage is relatively inexpensive for the protection it provides.',
      recommended_limits: '$5,000,000 excess liability',
      estimated_premium: 800,
      priority: 7,
    },
    builders_risk: {
      gap_description: 'Builders Risk insurance is not in place for construction projects.',
      recommendation_reason: 'Construction businesses need specialized coverage for projects under construction, materials, and equipment at job sites.',
      risk_if_not_covered: 'Fire, theft, vandalism, or weather damage to construction projects and materials would be entirely out-of-pocket. Average construction claims exceed $75,000.',
      recommended_limits: 'Project value up to $2,000,000 per project',
      estimated_premium: 2500,
      priority: industry === 'construction' ? 9 : 6,
    },
    equipment: {
      gap_description: 'Equipment/Inland Marine insurance is absent from your policies.',
      recommendation_reason: 'Specialized tools, equipment, and machinery need dedicated coverage beyond general property insurance.',
      risk_if_not_covered: 'Theft, damage, or breakdown of essential equipment could halt operations. Equipment replacement costs can easily exceed $50,000.',
      recommended_limits: 'Scheduled equipment up to $500,000',
      estimated_premium: 1200,
      priority: industry === 'construction' ? 8 : 5,
    },
    pollution_liability: {
      gap_description: 'Pollution Liability coverage is not included.',
      recommendation_reason: 'Construction and industrial businesses face pollution exposure from fuel spills, chemical releases, and environmental damage.',
      risk_if_not_covered: 'Environmental cleanup costs average $200,000+ and are typically excluded from General Liability policies. EPA fines can reach millions.',
      recommended_limits: '$1,000,000 per incident',
      estimated_premium: 1500,
      priority: industry === 'construction' ? 7 : 4,
    },
    employment_practices: {
      gap_description: 'Employment Practices Liability Insurance (EPLI) is missing.',
      recommendation_reason: `With ${employees} employees, you face exposure to wrongful termination, discrimination, and harassment claims.`,
      risk_if_not_covered: 'Employment lawsuits cost an average of $160,000 to defend and settle. Even baseless claims require expensive legal representation.',
      recommended_limits: '$1,000,000 per claim',
      estimated_premium: employees * 75,
      priority: employees >= 5 ? 8 : 5,
    },
  };

  return recommendations[coverageType] || {
    gap_description: `${coverageType} coverage is not currently in place.`,
    recommendation_reason: 'This coverage would provide important protection for your business operations.',
    risk_if_not_covered: 'Without this coverage, you may be exposed to uninsured losses and liabilities.',
    recommended_limits: 'Limits to be determined based on specific needs',
    estimated_premium: 1000,
    priority: 5,
  };
}

function evaluateRiskIndicators(profile: any, indicators: any): boolean {
  if (!indicators || typeof indicators !== 'object') return true;

  for (const [key, value] of Object.entries(indicators)) {
    if (key.endsWith('_gt')) {
      const field = key.replace('_gt', '');
      if (!(profile[field] > value)) return false;
    } else if (key.endsWith('_lt')) {
      const field = key.replace('_lt', '');
      if (!(profile[field] < value)) return false;
    } else {
      if (profile[key] !== value) return false;
    }
  }

  return true;
}

function calculateGapSeverity(
  profile: any,
  coverageType: string
): 'low' | 'medium' | 'high' | 'critical' {
  const { industry, employees = 0, revenue = 0 } = profile;

  // Critical coverages
  const criticalCoverages = ['general_liability', 'workers_comp'];
  if (criticalCoverages.includes(coverageType)) return 'critical';

  // High severity based on industry
  if (industry === 'construction') {
    if (['commercial_auto', 'builders_risk', 'umbrella'].includes(coverageType)) {
      return 'high';
    }
  }

  if (industry === 'professional_services') {
    if (['professional_liability', 'cyber_liability'].includes(coverageType)) {
      return 'high';
    }
  }

  // Medium severity based on size
  if (employees >= 10 || revenue >= 1000000) {
    if (['umbrella', 'employment_practices'].includes(coverageType)) {
      return 'medium';
    }
  }

  return 'low';
}

function generateAISummary(
  gaps: CoverageGap[],
  riskScore: number,
  riskLevel: string,
  profile: any
): string {
  const gapCount = gaps.length;
  const criticalCount = gaps.filter(g => g.gap_severity === 'critical').length;
  const highCount = gaps.filter(g => g.gap_severity === 'high').length;

  if (gapCount === 0) {
    return `✅ Excellent coverage portfolio! Your current insurance coverage appears comprehensive for a ${profile.industry || 'business'} with ${profile.employees || 'several'} employees. No critical gaps identified. Risk Score: ${riskScore}/100 (${riskLevel.toUpperCase()})`;
  }

  let summary = `⚠️ Coverage Gap Analysis identified ${gapCount} gap${gapCount > 1 ? 's' : ''} in your insurance portfolio. `;

  if (criticalCount > 0) {
    summary += `${criticalCount} CRITICAL gap${criticalCount > 1 ? 's' : ''} require${criticalCount === 1 ? 's' : ''} immediate attention. `;
  }

  if (highCount > 0) {
    summary += `${highCount} HIGH priority gap${highCount > 1 ? 's' : ''} should be addressed soon. `;
  }

  summary += `\n\nRisk Score: ${riskScore}/100 (${riskLevel.toUpperCase()} RISK)\n\n`;

  summary += `Your ${profile.industry || 'business'} with ${profile.employees || 0} employees and $${(profile.revenue || 0).toLocaleString()} in revenue would benefit significantly from addressing these coverage gaps.`;

  return summary;
}

function generateAIRecommendations(gaps: CoverageGap[], profile: any): string {
  if (gaps.length === 0) {
    return 'Continue to review your coverage annually and update as your business grows. Consider umbrella coverage if revenue increases significantly.';
  }

  let recommendations = '📋 Recommended Action Plan:\n\n';

  // Critical gaps first
  const criticalGaps = gaps.filter(g => g.gap_severity === 'critical');
  if (criticalGaps.length > 0) {
    recommendations += '🚨 IMMEDIATE PRIORITIES:\n';
    criticalGaps.forEach((gap, idx) => {
      recommendations += `${idx + 1}. ${gap.coverage_name} - ${gap.recommendation_reason.split('.')[0]}.\n`;
    });
    recommendations += '\n';
  }

  // High priority gaps
  const highGaps = gaps.filter(g => g.gap_severity === 'high');
  if (highGaps.length > 0) {
    recommendations += '⚠️ HIGH PRIORITY (Address within 30 days):\n';
    highGaps.forEach((gap, idx) => {
      recommendations += `${idx + 1}. ${gap.coverage_name} - Estimated: $${gap.estimated_premium.toLocaleString()}/year\n`;
    });
    recommendations += '\n';
  }

  // Medium/Low gaps
  const otherGaps = gaps.filter(g => !['critical', 'high'].includes(g.gap_severity));
  if (otherGaps.length > 0) {
    recommendations += '📌 CONSIDER FOR COMPREHENSIVE PROTECTION:\n';
    otherGaps.forEach((gap, idx) => {
      recommendations += `${idx + 1}. ${gap.coverage_name}\n`;
    });
    recommendations += '\n';
  }

  recommendations += '\n💡 Next Steps:\n';
  recommendations += '1. Review the detailed gap analysis and recommendations\n';
  recommendations += '2. Request quotes for priority coverages\n';
  recommendations += '3. Schedule a consultation to discuss coverage options\n';
  recommendations += '4. Implement critical coverages immediately to reduce risk exposure';

  return recommendations;
}
