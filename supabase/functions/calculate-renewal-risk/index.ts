import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  points: number;
  details: string;
}

interface RenewalData {
  id: string;
  account_id: string;
  renewal_date: string;
  current_premium: number;
  renewal_premium: number;
  policy_type: string;
  last_contact_date: string | null;
  has_recent_claim: boolean;
  has_payment_issues: boolean;
  competitor_activity_detected: boolean;
  sentiment_score: number;
  engagement_score: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { renewal_id } = await req.json();

    if (!renewal_id) {
      throw new Error('renewal_id is required');
    }

    console.log('Calculating risk for renewal:', renewal_id);

    // Fetch renewal data with related information
    const { data: renewal, error: renewalError } = await supabase
      .from('renewals')
      .select(`
        *,
        account:accounts(id, name),
        policy:policies(id, claims_count, premium)
      `)
      .eq('id', renewal_id)
      .single();

    if (renewalError) throw renewalError;
    if (!renewal) throw new Error('Renewal not found');

    // Calculate risk factors
    const riskFactors: RiskFactor[] = [];
    let totalRiskPoints = 0;

    // FACTOR 1: Days since last contact (0-30 points)
    const { data: lastContactResult } = await supabase
      .rpc('calculate_days_since_last_contact', { 
        renewal_account_id: renewal.account_id 
      });
    
    const daysSinceContact = lastContactResult || 999;
    
    if (daysSinceContact >= 180) {
      const points = 30;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'no_contact',
        severity: 'critical',
        points,
        details: `No contact in ${daysSinceContact} days (6+ months)`
      });
    } else if (daysSinceContact >= 90) {
      const points = 20;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'limited_contact',
        severity: 'high',
        points,
        details: `Limited contact: ${daysSinceContact} days since last interaction`
      });
    } else if (daysSinceContact >= 60) {
      const points = 10;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'low_contact',
        severity: 'medium',
        points,
        details: `${daysSinceContact} days since last contact`
      });
    }

    // FACTOR 2: Price increase (0-25 points)
    if (renewal.renewal_premium && renewal.current_premium) {
      const priceChangePct = ((renewal.renewal_premium - renewal.current_premium) / renewal.current_premium) * 100;
      
      if (priceChangePct > 15) {
        const points = Math.min(25, Math.floor(priceChangePct));
        totalRiskPoints += points;
        riskFactors.push({
          factor: 'price_increase',
          severity: priceChangePct > 30 ? 'critical' : 'high',
          points,
          details: `Premium increase of ${priceChangePct.toFixed(1)}%`
        });
      }

      // Update price_change_pct in renewals table
      await supabase
        .from('renewals')
        .update({ price_change_pct: priceChangePct })
        .eq('id', renewal_id);
    }

    // FACTOR 3: Recent claim (0-20 points)
    if (renewal.has_recent_claim) {
      const points = 20;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'recent_claim',
        severity: 'high',
        points,
        details: 'Recent claim may cause dissatisfaction'
      });
    }

    // FACTOR 4: Competitor activity (0-15 points)
    if (renewal.competitor_activity_detected) {
      const points = 15;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'competitor_activity',
        severity: 'high',
        points,
        details: 'Competitor quotes detected or mentioned'
      });
    }

    // FACTOR 5: Low engagement (0-15 points)
    const engagementScore = renewal.engagement_score || 50;
    if (engagementScore < 30) {
      const points = 15;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'low_engagement',
        severity: 'medium',
        points,
        details: `Very low engagement score: ${engagementScore}/100`
      });
    } else if (engagementScore < 50) {
      const points = 10;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'low_engagement',
        severity: 'medium',
        points,
        details: `Low engagement score: ${engagementScore}/100`
      });
    }

    // FACTOR 6: Negative sentiment (0-15 points)
    const sentimentScore = renewal.sentiment_score || 50;
    if (sentimentScore < 30) {
      const points = 15;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'negative_sentiment',
        severity: 'high',
        points,
        details: `Negative sentiment detected: ${sentimentScore}/100`
      });
    } else if (sentimentScore < 50) {
      const points = 8;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'negative_sentiment',
        severity: 'medium',
        points,
        details: `Below-average sentiment: ${sentimentScore}/100`
      });
    }

    // FACTOR 7: Payment issues (0-15 points)
    if (renewal.has_payment_issues) {
      const points = 15;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'payment_issues',
        severity: 'high',
        points,
        details: 'History of payment problems'
      });
    }

    // FACTOR 8: Time to renewal (reduces risk if far out)
    const daysToRenewal = Math.floor(
      (new Date(renewal.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    if (daysToRenewal < 30 && totalRiskPoints > 50) {
      const points = 10;
      totalRiskPoints += points;
      riskFactors.push({
        factor: 'urgent_timeline',
        severity: 'high',
        points,
        details: `Only ${daysToRenewal} days until renewal with high risk factors`
      });
    }

    // Calculate final risk score (0-100)
    const riskScore = Math.min(100, totalRiskPoints);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 75) {
      riskLevel = 'critical';
    } else if (riskScore >= 50) {
      riskLevel = 'high';
    } else if (riskScore >= 25) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    console.log('Risk calculation complete:', { riskScore, riskLevel, factorCount: riskFactors.length });

    // Update renewal with risk score
    const { error: updateError } = await supabase
      .from('renewals')
      .update({
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors,
        last_risk_calculation: new Date().toISOString(),
        last_contact_date: daysSinceContact < 999 
          ? new Date(Date.now() - daysSinceContact * 24 * 60 * 60 * 1000).toISOString()
          : null
      })
      .eq('id', renewal_id);

    if (updateError) throw updateError;

    // Create risk history record
    const { error: historyError } = await supabase
      .from('renewal_risk_history')
      .insert({
        renewal_id: renewal_id,
        account_id: renewal.account_id,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors
      });

    if (historyError) {
      console.error('Failed to create history record:', historyError);
    }

    // Auto-create high-risk campaign if needed
    if (riskLevel === 'critical' || riskLevel === 'high') {
      await createRenewalCampaign(supabase, renewal, riskLevel, daysToRenewal);
    }

    return new Response(
      JSON.stringify({
        success: true,
        renewal_id,
        risk_score: riskScore,
        risk_level: riskLevel,
        risk_factors: riskFactors,
        days_to_renewal: daysToRenewal
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error calculating renewal risk:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// Helper function to create renewal campaign
async function createRenewalCampaign(
  supabase: any,
  renewal: any,
  riskLevel: string,
  daysToRenewal: number
) {
  // Check if campaign already exists
  const { data: existing } = await supabase
    .from('renewal_campaigns')
    .select('id')
    .eq('renewal_id', renewal.id)
    .eq('status', 'active')
    .single();

  if (existing) {
    console.log('Campaign already exists for renewal:', renewal.id);
    return; // Campaign already exists
  }

  // Define touchpoints based on risk level and days to renewal
  const touchpoints = [];
  
  if (riskLevel === 'critical') {
    touchpoints.push(
      { day: 0, type: 'call', template: 'urgent_renewal_call', completed: false },
      { day: 1, type: 'email', template: 'urgent_renewal_email', completed: false },
      { day: 3, type: 'sms', template: 'urgent_renewal_sms', completed: false },
      { day: 7, type: 'call', template: 'followup_call', completed: false }
    );
  } else if (riskLevel === 'high') {
    touchpoints.push(
      { day: 0, type: 'email', template: 'high_risk_renewal_email', completed: false },
      { day: 2, type: 'call', template: 'renewal_check_call', completed: false },
      { day: 7, type: 'sms', template: 'renewal_reminder_sms', completed: false }
    );
  }

  console.log('Creating renewal campaign:', { renewal_id: renewal.id, touchpoints: touchpoints.length });

  await supabase
    .from('renewal_campaigns')
    .insert({
      renewal_id: renewal.id,
      account_id: renewal.account_id,
      campaign_type: riskLevel === 'critical' ? 'high_risk' : 'standard',
      days_before_renewal: daysToRenewal,
      start_date: new Date().toISOString().split('T')[0],
      touchpoints: touchpoints,
      total_touchpoints: touchpoints.length,
      status: 'active',
      personalization: {
        risk_level: riskLevel,
        policy_type: renewal.policy_type,
        premium: renewal.renewal_premium
      }
    });
}
