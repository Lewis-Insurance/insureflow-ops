import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Campaign {
  id: string;
  name: string;
  trigger_conditions: {
    lead_status?: string[];
    lead_score_min?: number;
    lead_score_max?: number;
    tags?: string[];
    insurance_types?: string[];
  };
  account_id: string;
}

interface Lead {
  id: string;
  status: string;
  lead_score: number;
  insurance_types: string[];
  account_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('🚀 Starting nurture campaign auto-enrollment processor...');

    // Fetch all active campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('nurture_campaigns')
      .select('id, name, trigger_conditions, account_id')
      .eq('active', true);

    if (campaignsError) {
      console.error('❌ Error fetching campaigns:', campaignsError);
      throw campaignsError;
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('ℹ️ No active campaigns found');
      return new Response(
        JSON.stringify({ success: true, message: 'No active campaigns', enrolled: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 Found ${campaigns.length} active campaigns`);

    let totalEnrolled = 0;
    const results = [];

    // Process each campaign
    for (const campaign of campaigns as Campaign[]) {
      console.log(`\n🎯 Processing campaign: ${campaign.name} (${campaign.id})`);

      try {
        // Build lead query based on trigger conditions
        let leadQuery = supabase
          .from('leads')
          .select('id, status, lead_score, insurance_types, account_id')
          .eq('account_id', campaign.account_id);

        const conditions = campaign.trigger_conditions || {};

        // Apply filters
        if (conditions.lead_status && conditions.lead_status.length > 0) {
          leadQuery = leadQuery.in('status', conditions.lead_status);
        }

        if (conditions.lead_score_min !== undefined) {
          leadQuery = leadQuery.gte('lead_score', conditions.lead_score_min);
        }

        if (conditions.lead_score_max !== undefined) {
          leadQuery = leadQuery.lte('lead_score', conditions.lead_score_max);
        }

        const { data: matchingLeads, error: leadsError } = await leadQuery;

        if (leadsError) {
          console.error(`❌ Error fetching leads for campaign ${campaign.id}:`, leadsError);
          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            success: false,
            error: leadsError.message,
          });
          continue;
        }

        if (!matchingLeads || matchingLeads.length === 0) {
          console.log(`ℹ️ No matching leads found for ${campaign.name}`);
          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            success: true,
            enrolled: 0,
            skipped: 0,
          });
          continue;
        }

        console.log(`📊 Found ${matchingLeads.length} potential leads`);

        // Additional filtering for insurance types and tags
        let filteredLeads = matchingLeads as Lead[];

        if (conditions.insurance_types && conditions.insurance_types.length > 0) {
          filteredLeads = filteredLeads.filter((lead) => {
            const leadTypes = lead.insurance_types || [];
            return conditions.insurance_types!.some((type) => leadTypes.includes(type));
          });
        }

        // Check which leads are already enrolled
        const { data: existingEnrollments } = await supabase
          .from('campaign_enrollments')
          .select('lead_id')
          .eq('campaign_id', campaign.id)
          .in('lead_id', filteredLeads.map(l => l.id));

        const enrolledLeadIds = new Set(
          (existingEnrollments || []).map((e: any) => e.lead_id)
        );

        // Filter out already enrolled leads
        const leadsToEnroll = filteredLeads.filter(
          (lead) => !enrolledLeadIds.has(lead.id)
        );

        if (leadsToEnroll.length === 0) {
          console.log(`✅ All matching leads already enrolled in ${campaign.name}`);
          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            success: true,
            enrolled: 0,
            skipped: filteredLeads.length,
          });
          continue;
        }

        console.log(`➕ Enrolling ${leadsToEnroll.length} new leads...`);

        // Calculate next execution time based on first step
        const { data: campaignData } = await supabase
          .from('nurture_campaigns')
          .select('steps')
          .eq('id', campaign.id)
          .single();

        const steps = (campaignData?.steps as any[]) || [];
        const firstStep = steps[0];
        
        let nextExecutionDate = new Date();
        if (firstStep) {
          const delayMs = firstStep.delay_value * (
            firstStep.delay_unit === 'minutes' ? 60 * 1000 :
            firstStep.delay_unit === 'hours' ? 60 * 60 * 1000 :
            firstStep.delay_unit === 'days' ? 24 * 60 * 60 * 1000 :
            7 * 24 * 60 * 60 * 1000 // weeks
          );
          nextExecutionDate = new Date(Date.now() + delayMs);
        }

        // Batch enroll leads
        const enrollments = leadsToEnroll.map((lead) => ({
          campaign_id: campaign.id,
          lead_id: lead.id,
          account_id: campaign.account_id,
          status: 'active',
          current_step: 0,
          next_execution_at: nextExecutionDate.toISOString(),
        }));

        const { error: enrollError } = await supabase
          .from('campaign_enrollments')
          .insert(enrollments);

        if (enrollError) {
          console.error(`❌ Error enrolling leads for ${campaign.name}:`, enrollError);
          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            success: false,
            error: enrollError.message,
          });
          continue;
        }

        // Update campaign enrollment count
        const { data: currentCampaign } = await supabase
          .from('nurture_campaigns')
          .select('enrollment_count')
          .eq('id', campaign.id)
          .single();

        const newCount = (currentCampaign?.enrollment_count || 0) + leadsToEnroll.length;

        await supabase
          .from('nurture_campaigns')
          .update({ enrollment_count: newCount })
          .eq('id', campaign.id);

        console.log(`✅ Successfully enrolled ${leadsToEnroll.length} leads in ${campaign.name}`);

        totalEnrolled += leadsToEnroll.length;

        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          success: true,
          enrolled: leadsToEnroll.length,
          skipped: enrolledLeadIds.size,
        });
      } catch (error) {
        console.error(`❌ Error processing campaign ${campaign.id}:`, error);
        results.push({
          campaign_id: campaign.id,
          campaign_name: campaign.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`\n🎉 Processor complete! Total enrolled: ${totalEnrolled}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_enrolled: totalEnrolled,
        campaigns_processed: campaigns.length,
        results,
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
