import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RiskFactors {
  no_contact_6_months: boolean;
  price_increase_high: boolean;
  recent_claim: boolean;
  competitor_activity: boolean;
  low_engagement: boolean;
  negative_sentiment: boolean;
  payment_issues: boolean;
}

function calculateRiskScore(renewal: any): { score: number; factors: RiskFactors; level: string } {
  let score = 0;
  const factors: RiskFactors = {
    no_contact_6_months: false,
    price_increase_high: false,
    recent_claim: false,
    competitor_activity: false,
    low_engagement: false,
    negative_sentiment: false,
    payment_issues: false,
  };

  // Calculate days since last contact if we have a date
  let daysSinceContact = 0;
  if (renewal.last_contact_date) {
    const lastContact = new Date(renewal.last_contact_date);
    const now = new Date();
    daysSinceContact = Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Factor 1: No contact in 6+ months (20 points)
  if (daysSinceContact >= 180) {
    score += 20;
    factors.no_contact_6_months = true;
  } else if (daysSinceContact >= 90) {
    score += 10;
  }

  // Factor 2: Price increase >15% (25 points)
  if (renewal.price_increase_pct && renewal.price_increase_pct > 15) {
    score += 25;
    factors.price_increase_high = true;
  } else if (renewal.price_increase_pct && renewal.price_increase_pct > 10) {
    score += 15;
  }

  // Factor 3: Recent claim (15 points)
  if (renewal.has_recent_claim) {
    score += 15;
    factors.recent_claim = true;
  }

  // Factor 4: Competitor activity detected (20 points)
  if (renewal.competitor_activity_detected) {
    score += 20;
    factors.competitor_activity = true;
  }

  // Factor 5: Low engagement (15 points)
  if (renewal.engagement_score && renewal.engagement_score < 30) {
    score += 15;
    factors.low_engagement = true;
  } else if (renewal.engagement_score && renewal.engagement_score < 50) {
    score += 8;
  }

  // Factor 6: Negative sentiment (15 points)
  if (renewal.sentiment_score && renewal.sentiment_score < 30) {
    score += 15;
    factors.negative_sentiment = true;
  } else if (renewal.sentiment_score && renewal.sentiment_score < 50) {
    score += 8;
  }

  // Factor 7: Payment issues (10 points)
  if (renewal.has_payment_issues) {
    score += 10;
    factors.payment_issues = true;
  }

  // Determine risk level
  let level = 'low';
  if (score >= 75) {
    level = 'critical';
  } else if (score >= 50) {
    level = 'high';
  } else if (score >= 25) {
    level = 'medium';
  }

  return { score, factors, level };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }

    console.log('🎯 Calculate Renewal Risk function called');

    const { renewal_id, bulk } = await req.json();

    if (bulk) {
      console.log('📊 Starting bulk calculation for all upcoming renewals');
      
      const { data: renewals, error: fetchError } = await supabase
        .from('renewals')
        .select('*')
        .in('status', ['upcoming', 'in_progress']);

      if (fetchError) {
        console.error('❌ Error fetching renewals:', fetchError);
        throw fetchError;
      }

      console.log(`📋 Found ${renewals?.length || 0} renewals to process`);

      const updates = [];
      const riskFactorInserts = [];

      for (const renewal of renewals || []) {
        const { score, factors, level } = calculateRiskScore(renewal);
        console.log(`  ✅ Calculated risk for renewal ${renewal.id}: ${level} (${score})`);

        updates.push({
          id: renewal.id,
          risk_score: score,
          risk_level: level,
          risk_calculated_at: new Date().toISOString(),
        });

        // Log individual risk factors
        for (const [factorType, isPresent] of Object.entries(factors)) {
          if (isPresent) {
            riskFactorInserts.push({
              renewal_id: renewal.id,
              factor_type: factorType,
              factor_value: 1,
              impact_score: getFactorImpact(factorType),
              detected_at: new Date().toISOString(),
              notes: getFactorDescription(factorType, renewal),
            });
          }
        }
      }

      console.log(`🔄 Updating ${updates.length} renewals...`);

      // Batch update renewals
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('renewals')
          .update({
            risk_score: update.risk_score,
            risk_level: update.risk_level,
            risk_calculated_at: update.risk_calculated_at,
          })
          .eq('id', update.id);
        
        if (updateError) {
          console.error(`❌ Error updating renewal ${update.id}:`, updateError);
        }
      }

      console.log(`📝 Inserting ${riskFactorInserts.length} risk factors...`);

      // Insert risk factors
      if (riskFactorInserts.length > 0) {
        const { error: insertError } = await supabase
          .from('renewal_risk_factors')
          .insert(riskFactorInserts);
        
        if (insertError) {
          console.error('❌ Error inserting risk factors:', insertError);
        }
      }

      console.log('✅ Bulk calculation complete');

      return new Response(
        JSON.stringify({
          success: true,
          processed: updates.length,
          message: `Updated risk scores for ${updates.length} renewals`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    } else {
      // Single renewal calculation
      if (!renewal_id) {
        throw new Error('renewal_id is required');
      }

      console.log(`🎯 Calculating risk for renewal ${renewal_id}`);

      const { data: renewal, error: fetchError } = await supabase
        .from('renewals')
        .select('*')
        .eq('id', renewal_id)
        .single();

      if (fetchError) {
        console.error('❌ Error fetching renewal:', fetchError);
        throw fetchError;
      }

      const { score, factors, level } = calculateRiskScore(renewal);
      console.log(`✅ Risk calculated: ${level} (${score})`);

      // Update renewal with risk score
      const { error: updateError } = await supabase
        .from('renewals')
        .update({
          risk_score: score,
          risk_level: level,
          risk_calculated_at: new Date().toISOString(),
        })
        .eq('id', renewal_id);

      if (updateError) {
        console.error('❌ Error updating renewal:', updateError);
        throw updateError;
      }

      // Log individual risk factors
      const riskFactorInserts = [];
      for (const [factorType, isPresent] of Object.entries(factors)) {
        if (isPresent) {
          riskFactorInserts.push({
            renewal_id: renewal_id,
            factor_type: factorType,
            factor_value: 1,
            impact_score: getFactorImpact(factorType),
            detected_at: new Date().toISOString(),
            notes: getFactorDescription(factorType, renewal),
          });
        }
      }

      if (riskFactorInserts.length > 0) {
        console.log(`📝 Inserting ${riskFactorInserts.length} risk factors...`);
        const { error: insertError } = await supabase
          .from('renewal_risk_factors')
          .insert(riskFactorInserts);
        
        if (insertError) {
          console.error('❌ Error inserting risk factors:', insertError);
        }
      }

      // Auto-create high-risk campaign if needed
      if (level === 'critical' || level === 'high') {
        const daysToRenewal = renewal.renewal_date 
          ? Math.floor((new Date(renewal.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 90;
        await createRenewalCampaign(supabase, renewal, level, daysToRenewal);
      }

      console.log('✅ Single renewal calculation complete');

      return new Response(
        JSON.stringify({
          success: true,
          renewal_id,
          risk_score: score,
          risk_level: level,
          risk_factors: factors,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

  } catch (error: unknown) {
    console.error('❌ Error calculating renewal risk:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

function getFactorImpact(factorType: string): number {
  const impacts: Record<string, number> = {
    no_contact_6_months: 20,
    price_increase_high: 25,
    recent_claim: 15,
    competitor_activity: 20,
    low_engagement: 15,
    negative_sentiment: 15,
    payment_issues: 10,
  };
  return impacts[factorType] || 10;
}

function getFactorDescription(factorType: string, renewal: any): string {
  const daysSinceContact = renewal.last_contact_date 
    ? Math.floor((new Date().getTime() - new Date(renewal.last_contact_date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const descriptions: Record<string, string> = {
    no_contact_6_months: `No contact in ${daysSinceContact} days`,
    price_increase_high: `Price increase of ${renewal.price_increase_pct?.toFixed(1)}%`,
    recent_claim: 'Recent claim activity detected',
    competitor_activity: 'Competitor activity detected',
    low_engagement: `Low engagement score: ${renewal.engagement_score || 0}`,
    negative_sentiment: `Negative sentiment score: ${renewal.sentiment_score || 0}`,
    payment_issues: 'Payment issues detected',
  };
  return descriptions[factorType] || factorType;
}

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
    .maybeSingle();

  if (existing) {
    console.log('✅ Campaign already exists for renewal:', renewal.id);
    return;
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

  const renewalDate = renewal.renewal_date;
  const targetDate = renewalDate ? new Date(renewalDate) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  console.log('📧 Creating renewal campaign:', { renewal_id: renewal.id, touchpoints: touchpoints.length });

  const { error } = await supabase
    .from('renewal_campaigns')
    .insert({
      renewal_id: renewal.id,
      campaign_type: riskLevel === 'critical' ? 'high_risk' : 'standard',
      start_date: new Date().toISOString(),
      target_renewal_date: targetDate.toISOString(),
      touchpoints: touchpoints,
      total_touchpoints: touchpoints.length,
      status: 'active',
      personalization: {
        risk_level: riskLevel,
        policy_type: renewal.policy_type || 'unknown',
        premium: renewal.renewal_premium || 0
      }
    });

  if (error) {
    console.error('❌ Error creating campaign:', error);
  } else {
    console.log('✅ Campaign created successfully');
  }
}
