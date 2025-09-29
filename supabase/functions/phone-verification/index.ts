import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PhoneVerificationRequest {
  action: 'send_code' | 'verify_code'
  phone_number?: string
  code?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get user from JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { action, phone_number, code }: PhoneVerificationRequest = await req.json()

    switch (action) {
      case 'send_code': {
        if (!phone_number) {
          return new Response(JSON.stringify({ error: 'Phone number required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Rate limiting check (1 SMS per minute per user)
        const { data: recentCodes } = await supabaseClient
          .from('phone_verification_codes')
          .select('id')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 60000).toISOString())

        if (recentCodes && recentCodes.length > 0) {
          return new Response(JSON.stringify({ error: 'Please wait before requesting another code' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Normalize phone number
        const { data: normalizedPhone, error: normalizeError } = await supabaseClient
          .rpc('normalize_phone_number', { phone_input: phone_number })

        if (normalizeError) {
          return new Response(JSON.stringify({ error: 'Invalid phone number' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Generate 6-digit code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

        // Store verification code (in production, hash it)
        const { error: insertError } = await supabaseClient
          .from('phone_verification_codes')
          .insert({
            user_id: user.id,
            phone_number: normalizedPhone,
            verification_code: verificationCode,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
          })

        if (insertError) {
          console.error('Error storing verification code:', insertError)
          return new Response(JSON.stringify({ error: 'Failed to send verification code' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // In production, integrate with Twilio or similar SMS service
        console.log(`SMS would be sent to ${normalizedPhone} with code: ${verificationCode}`)
        
        // For development, we'll just log the code
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Verification code sent',
          // Remove this in production
          debug_code: verificationCode
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      case 'verify_code': {
        if (!phone_number || !code) {
          return new Response(JSON.stringify({ error: 'Phone number and code required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Find valid verification code
        const { data: verification, error: verifyError } = await supabaseClient
          .from('phone_verification_codes')
          .select('*')
          .eq('user_id', user.id)
          .eq('phone_number', phone_number)
          .eq('verification_code', code)
          .eq('verified', false)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (verifyError || !verification) {
          // Get current attempts count and increment
          const { data: currentCode } = await supabaseClient
            .from('phone_verification_codes')
            .select('attempts')
            .eq('user_id', user.id)
            .eq('phone_number', phone_number)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          await supabaseClient
            .from('phone_verification_codes')
            .update({ attempts: (currentCode?.attempts || 0) + 1 })
            .eq('user_id', user.id)
            .eq('phone_number', phone_number)

          return new Response(JSON.stringify({ error: 'Invalid or expired verification code' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Mark as verified
        const { error: markVerifiedError } = await supabaseClient
          .from('phone_verification_codes')
          .update({ verified: true })
          .eq('id', verification.id)

        if (markVerifiedError) {
          console.error('Error marking verification as complete:', markVerifiedError)
        }

        // Update profile
        const { error: updateProfileError } = await supabaseClient
          .from('profiles')
          .update({
            phone: phone_number,
            phone_verified: true,
            phone_verification_sent_at: new Date().toISOString()
          })
          .eq('id', user.id)

        if (updateProfileError) {
          console.error('Error updating profile:', updateProfileError)
          return new Response(JSON.stringify({ error: 'Failed to verify phone number' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
  } catch (error) {
    console.error('Error in phone-verification function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})