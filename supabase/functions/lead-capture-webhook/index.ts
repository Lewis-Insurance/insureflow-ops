import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LeadSubmission {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  insurance_types?: string[];
  current_carrier?: string;
  current_premium?: number;
  decision_timeframe?: string;
  source_name?: string;
  source_details?: Record<string, any>;
  notes?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const submission: LeadSubmission = await req.json();

    // Validate required fields
    if (!submission.first_name || !submission.last_name) {
      return new Response(
        JSON.stringify({ error: 'first_name and last_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!submission.email && !submission.phone) {
      return new Response(
        JSON.stringify({ error: 'Either email or phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for duplicates
    const duplicateQuery = supabase.from('leads').select('id, status, email, phone');
    
    if (submission.email && submission.phone) {
      duplicateQuery.or(`email.eq.${submission.email},phone.eq.${submission.phone}`);
    } else if (submission.email) {
      duplicateQuery.eq('email', submission.email);
    } else if (submission.phone) {
      duplicateQuery.eq('phone', submission.phone);
    }

    const { data: duplicates } = await duplicateQuery;

    if (duplicates && duplicates.length > 0) {
      return new Response(
        JSON.stringify({
          message: 'Duplicate lead found',
          duplicate: true,
          lead_id: duplicates[0].id,
          existing_status: duplicates[0].status,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find or create lead source
    let sourceId: string | null = null;
    if (submission.source_name) {
      const { data: existingSource } = await supabase
        .from('lead_sources')
        .select('id')
        .eq('name', submission.source_name)
        .single();

      if (existingSource) {
        sourceId = existingSource.id;
      } else {
        const { data: newSource } = await supabase
          .from('lead_sources')
          .insert({
            name: submission.source_name,
            type: 'other',
            description: 'Auto-created from webhook',
          })
          .select('id')
          .single();

        sourceId = newSource?.id || null;
      }
    }

    // Create lead
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        first_name: submission.first_name,
        last_name: submission.last_name,
        email: submission.email,
        phone: submission.phone,
        address_line1: submission.address_line1,
        address_line2: submission.address_line2,
        city: submission.city,
        state: submission.state,
        zip_code: submission.zip_code,
        insurance_types: submission.insurance_types || [],
        current_carrier: submission.current_carrier,
        current_premium: submission.current_premium,
        decision_timeframe: submission.decision_timeframe || 'future',
        source_id: sourceId,
        source_details: submission.source_details || {},
        notes: submission.notes,
        tags: submission.tags || [],
        custom_fields: submission.custom_fields || {},
        status: 'new',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting lead:', insertError);
      throw insertError;
    }

    console.log('Lead created:', lead.id);

    // Log activity
    await supabase.from('lead_activities').insert({
      lead_id: lead.id,
      activity_type: 'note',
      title: 'Lead captured',
      description: `Lead captured via webhook from ${submission.source_name || 'unknown source'}`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        message: 'Lead captured successfully',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in lead-capture-webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
