import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import {
  calculateLeadScore,
  calculateRadarScore,
  deriveRadarScoreFactors,
  type LeadScoringFactors,
} from './scoring.ts';

interface RadarScoringInput {
  opportunityId: string;
}

class WorkspaceScopeError extends Error {}

async function scoreLeads(supabaseClient: any, workspaceIds: string[], leadIds?: string[]) {
  try {
    // Build query
    let query = supabaseClient
      .from('leads')
      .select(`
        id,
        agency_workspace_id,
        insurance_types,
        current_premium,
        decision_timeframe,
        email,
        phone,
        current_carrier,
        source_id,
        lead_sources (type)
      `);

    // SECURITY: Service-role reads must always be constrained to active staff workspaces.
    query = query.in('agency_workspace_id', workspaceIds);

    // Filter by specific lead IDs if provided
    if (leadIds && leadIds.length > 0) {
      query = query.in('id', leadIds);
    }
    
    const { data: leads, error: fetchError } = await query;
    
    if (fetchError) throw fetchError;
    if (leadIds && new Set(leads?.map((lead: any) => lead.id)).size !== new Set(leadIds).size) {
      throw new WorkspaceScopeError('One or more leads are outside the active workspace scope');
    }
    if (!leads || leads.length === 0) {
      return { success: true, message: 'No leads to score', scored: 0 };
    }
    
    // Calculate scores for all leads
    const updates = leads.map((lead: any) => {
      const factors: LeadScoringFactors = {
        insuranceNeeds: lead.insurance_types || [],
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
    for (const update of updates) {
      const { error: updateError } = await supabaseClient
        .from('leads')
        .update({
          lead_score: update.lead_score,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id)
        .in('agency_workspace_id', workspaceIds);
      
      if (updateError) throw updateError;
    }
    
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

    const { leadIds, rescore_all, radar } = await req.json() as {
      leadIds?: string[];
      rescore_all?: boolean;
      radar?: RadarScoringInput;
    };
    const providedInternal = req.headers.get('X-Radar-Internal-Secret');
    const expectedInternal = Deno.env.get('RADAR_INTERNAL_SECRET');
    const internalRadar = !!radar && !!providedInternal && !!expectedInternal && constantTimeEqual(providedInternal, expectedInternal);
    let workspaceIds: string[] = [];
    if (!internalRadar) {
      const authResult = await requireAuth(req, supabaseClient, corsHeaders);
      if (authResult instanceof Response) return authResult;
      const { data: memberships, error: membershipsError } = await supabaseClient
        .from('agency_workspace_memberships').select('agency_workspace_id')
        .eq('user_id', authResult.id).eq('status', 'active');
      if (membershipsError) throw membershipsError;
      workspaceIds = [...new Set((memberships || []).map((row: { agency_workspace_id: string }) => row.agency_workspace_id))];
      if (workspaceIds.length === 0) return new Response(JSON.stringify({ error: 'Forbidden: active workspace membership required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (radar) {
      if (leadIds || rescore_all) {
        return new Response(JSON.stringify({ error: 'Radar and lead scoring inputs are mutually exclusive' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!radar.opportunityId) {
        return new Response(JSON.stringify({ error: 'radar.opportunityId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let opportunityQuery = supabaseClient
        .from('renewal_opportunities')
        .select('id, agency_workspace_id, kind, class_code, expiration_date, estimated_premium, employer_name, county, policy_number, carrier')
        .eq('id', radar.opportunityId);
      if (!internalRadar) opportunityQuery = opportunityQuery.in('agency_workspace_id', workspaceIds);
      const { data: opportunity, error: opportunityError } = await opportunityQuery.single();
      if (opportunityError || !opportunity) throw opportunityError || new Error('Radar opportunity not found');

      const { data: config, error: configError } = await supabaseClient
        .from('radar_config')
        .select('class_allowlist')
        .eq('agency_workspace_id', opportunity.agency_workspace_id)
        .single();
      if (configError || !config) throw configError || new Error('Radar configuration not found');

      const factors = deriveRadarScoreFactors(opportunity, config.class_allowlist || []);
      const score = calculateRadarScore(factors);
      const scoredAt = new Date().toISOString();
      const { error: updateError } = await supabaseClient
        .from('renewal_opportunities')
        .update({ radar_score: score, score_factors: factors, scored_at: scoredAt })
        .eq('id', radar.opportunityId)
        .eq('agency_workspace_id', opportunity.agency_workspace_id);
      if (updateError) throw updateError;

      return new Response(JSON.stringify({
        success: true,
        opportunityId: radar.opportunityId,
        score,
        factors,
        scoredAt,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }
    
    // Validate request
    if (!rescore_all && (!Array.isArray(leadIds) || leadIds.length === 0)) {
      return new Response(
        JSON.stringify({
          error: 'Either radar, leadIds array, or rescore_all flag must be provided',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    // Score leads only inside the caller's active agency workspaces.
    const result = await scoreLeads(
      supabaseClient,
      workspaceIds,
      rescore_all ? undefined : leadIds
    );
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    console.error('Error in lead-scoring-engine:', error);
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
      }),
      {
        status: error instanceof WorkspaceScopeError ? 403 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function constantTimeEqual(left: string, right: string): boolean {
  const size = Math.max(left.length, right.length); let difference = left.length ^ right.length;
  for (let i = 0; i < size; i++) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}
