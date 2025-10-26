import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadData {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  insurance_types?: string[];
  current_carrier?: string;
  current_premium?: number;
  decision_timeframe?: string;
  source_name?: string;
  notes?: string;
  tags?: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const body: LeadData = await req.json();

    // Validate required fields
    if (!body.first_name || !body.last_name) {
      return new Response(
        JSON.stringify({ error: 'first_name and last_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!body.email && !body.phone) {
      return new Response(
        JSON.stringify({ error: 'Either email or phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicate leads by email or phone
    let duplicateQuery = supabase
      .from('leads')
      .select('*')
      .is('deleted_at', null);

    if (body.email && body.phone) {
      duplicateQuery = duplicateQuery.or(`email.eq.${body.email},phone.eq.${body.phone}`);
    } else if (body.email) {
      duplicateQuery = duplicateQuery.eq('email', body.email);
    } else if (body.phone) {
      duplicateQuery = duplicateQuery.eq('phone', body.phone);
    }

    const { data: existingLeads, error: searchError } = await duplicateQuery;

    if (searchError) {
      console.error('Error checking for duplicates:', searchError);
      return new Response(
        JSON.stringify({ error: 'Failed to check for duplicates', details: searchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If duplicate found, return existing lead
    if (existingLeads && existingLeads.length > 0) {
      const existingLead = existingLeads[0];
      console.log('Duplicate lead found:', existingLead.id);

      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          lead_id: existingLead.id,
          message: 'Lead already exists',
          lead: existingLead
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert new lead
    const leadData = {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      insurance_types: body.insurance_types || null,
      current_carrier: body.current_carrier || null,
      current_premium: body.current_premium || null,
      decision_timeframe: body.decision_timeframe || null,
      source_name: body.source_name || 'webhook',
      notes: body.notes || null,
      tags: body.tags || null,
      status: 'new'
    };

    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting lead:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('New lead created:', newLead.id);

    // Log activity for lead capture
    const activityData = {
      entity_type: 'lead',
      entity_id: newLead.id,
      action: 'lead_captured',
      metadata: {
        source: body.source_name || 'webhook',
        method: 'webhook',
        capture_time: new Date().toISOString()
      }
    };

    const { error: activityError } = await supabase
      .from('activities')
      .insert(activityData);

    if (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the request if activity logging fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        duplicate: false,
        lead_id: newLead.id,
        message: 'Lead captured successfully',
        lead: newLead
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
