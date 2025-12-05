import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult; // Return 401 if auth failed
    }
    const authenticatedUser = authResult;

    const { days_ahead = 120 } = await req.json().catch(() => ({}));

    console.log(`Starting batch risk calculation for renewals in next ${days_ahead} days`);

    // Get all upcoming renewals that need risk calculation
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days_ahead);

    const { data: renewals, error: fetchError } = await supabase
      .from('renewals')
      .select('id, renewal_date, account_id, status')
      .in('status', ['upcoming', 'in_progress'])
      .lte('renewal_date', futureDate.toISOString().split('T')[0])
      .order('renewal_date', { ascending: true });

    if (fetchError) throw fetchError;

    if (!renewals || renewals.length === 0) {
      console.log('No renewals found to process');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No renewals to process',
          processed: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    console.log(`Found ${renewals.length} renewals to process`);

    const results = {
      total: renewals.length,
      successful: 0,
      failed: 0,
      errors: [] as any[]
    };

    // Call calculate-renewal-risk for each renewal
    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-renewal-risk`;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    for (const renewal of renewals) {
      try {
        console.log(`Processing renewal ${renewal.id}...`);
        
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ renewal_id: renewal.id })
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to calculate risk: ${errorText}`);
        }

        const result = await response.json();
        results.successful++;
        console.log(`✓ Processed renewal ${renewal.id} - Risk: ${result.risk_level} (${result.risk_score})`);
      } catch (error: unknown) {
        results.failed++;
        results.errors.push({
          renewal_id: renewal.id,
          error: (error instanceof Error ? error.message : String(error))
        });
        console.error(`✗ Failed to process renewal ${renewal.id}:`, (error instanceof Error ? error.message : String(error)));
      }
    }

    console.log('Batch processing complete:', results);

    return new Response(
      JSON.stringify({
        success: true,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: unknown) {
    console.error('Batch processing error:', error);
    return new Response(
      JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
