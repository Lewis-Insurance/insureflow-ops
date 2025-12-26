import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../_shared/cors.ts'

interface LeadCapturePayload {
  // Required fields
  first_name: string
  last_name: string
  email?: string
  phone?: string
  
  // Source information
  source_id?: string
  source_name?: string
  source_details?: Record<string, any>
  
  // Insurance needs
  insurance_needs?: string[]
  coverage_type?: string
  
  // Additional info
  current_carrier?: string
  current_premium?: number
  decision_timeframe?: string
  notes?: string
  
  // Address
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  zip_code?: string
  
  // Custom fields
  custom_fields?: Record<string, any>
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // SECURITY: Validate API key from header
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const expectedApiKey = Deno.env.get('LEAD_CAPTURE_API_KEY')

    // Fail closed: if env var not set, reject all requests
    if (!expectedApiKey) {
      console.error('LEAD_CAPTURE_API_KEY not configured - rejecting request')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (apiKey !== expectedApiKey) {
      console.error('Invalid API key for lead capture webhook')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const payload: LeadCapturePayload = await req.json()

    // Validate required fields
    if (!payload.first_name || !payload.last_name) {
      return new Response(
        JSON.stringify({ error: 'first_name and last_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payload.email && !payload.phone) {
      return new Response(
        JSON.stringify({ error: 'Either email or phone is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get or create lead source
    let sourceId = payload.source_id
    
    if (!sourceId && payload.source_name) {
      const { data: existingSource } = await supabase
        .from('lead_sources')
        .select('id')
        .eq('name', payload.source_name)
        .single()

      if (existingSource) {
        sourceId = existingSource.id
      } else {
        const { data: newSource, error: sourceError } = await supabase
          .from('lead_sources')
          .insert({
            name: payload.source_name,
            type: 'other',
            is_active: true
          })
          .select('id')
          .single()

        if (sourceError) throw sourceError
        sourceId = newSource.id
      }
    }

    // Create lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        phone: payload.phone,
        source_id: sourceId,
        source_details: payload.source_details,
        insurance_needs: payload.insurance_needs,
        coverage_type: payload.coverage_type,
        current_carrier: payload.current_carrier,
        current_premium: payload.current_premium,
        decision_timeframe: payload.decision_timeframe,
        notes: payload.notes,
        address_line1: payload.address_line1,
        address_line2: payload.address_line2,
        city: payload.city,
        state: payload.state,
        zip_code: payload.zip_code,
        custom_fields: payload.custom_fields,
        status: 'new'
      })
      .select(`
        *,
        source:lead_sources(*),
        assigned_to:profiles!leads_assigned_to_fkey(id, full_name, email)
      `)
      .single()

    if (leadError) throw leadError

    return new Response(
      JSON.stringify({ 
        success: true, 
        lead_id: lead.id,
        message: 'Lead captured successfully',
        data: lead
      }),
      { 
        status: 201, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: unknown) {
    console.error('Lead capture error:', error)
    return new Response(
      JSON.stringify({ 
        error: (error instanceof Error ? error.message : String(error)),
        details: 'Failed to capture lead'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
