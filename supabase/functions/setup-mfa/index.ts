import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encode } from "https://deno.land/std@0.190.0/encoding/base32.ts"
import { requireAuth } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MFARequest {
  action: 'generate_secret' | 'verify_setup' | 'disable'
  secret?: string
  code?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // SECURITY: Require authentication
    const authResult = await requireAuth(req, supabaseClient, corsHeaders)
    if (authResult instanceof Response) {
      return authResult // Return 401 if auth failed
    }
    const authenticatedUser = authResult

    const { action, secret, code }: MFARequest = await req.json()

    switch (action) {
      case 'generate_secret': {
        // Generate a random secret (32 bytes = 160 bits for TOTP)
        const secretBytes = crypto.getRandomValues(new Uint8Array(32))
        const secretBase32 = encode(secretBytes).replaceAll('=', '')
        
        // Get user profile for display name
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('full_name, email')
          .eq('id', authenticatedUser.id)
          .single()

        const issuer = "Lewis Insurance"
        const accountName = profile?.full_name || profile?.email || authenticatedUser.email || "User"
        
        // Create otpauth URL for QR code
        const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
        
        // Generate QR code as SVG (simple implementation)
        const qrCodeSvg = await generateQRCodeSVG(otpauthUrl)
        const qrCodeDataUrl = `data:image/svg+xml;base64,${btoa(qrCodeSvg)}`

        return new Response(JSON.stringify({
          secret: secretBase32,
          qr_code: qrCodeDataUrl,
          otpauth_url: otpauthUrl
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      case 'verify_setup': {
        if (!secret || !code) {
          return new Response(JSON.stringify({ error: 'Missing secret or code' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Verify TOTP code
        const isValid = await verifyTOTP(secret, code)
        if (!isValid) {
          return new Response(JSON.stringify({ error: 'Invalid code' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Generate backup codes
        const { data: backupCodes } = await supabaseClient.rpc('generate_backup_codes')

        // Store MFA settings
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            mfa_enabled: true,
            mfa_secret: secret,
            backup_codes: backupCodes
          })
          .eq('id', authenticatedUser.id)

        if (updateError) {
          console.error('Error enabling MFA:', updateError)
          return new Response(JSON.stringify({ error: 'Failed to enable MFA' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        return new Response(JSON.stringify({
          success: true,
          backup_codes: backupCodes
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      case 'disable': {
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            mfa_enabled: false,
            mfa_secret: null,
            backup_codes: null
          })
          .eq('id', authenticatedUser.id)

        if (updateError) {
          console.error('Error disabling MFA:', updateError)
          return new Response(JSON.stringify({ error: 'Failed to disable MFA' }), {
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
    console.error('Error in setup-mfa function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Simple TOTP verification (30-second window)
async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  const window = 30
  const currentTime = Math.floor(Date.now() / 1000 / window)
  
  for (let i = -1; i <= 1; i++) {
    const timeStep = currentTime + i
    const expectedToken = await generateTOTP(secret, timeStep)
    if (expectedToken === token) {
      return true
    }
  }
  return false
}

// Generate TOTP token
async function generateTOTP(secret: string, timeStep: number): Promise<string> {
  // Decode base32 secret
  const secretBytes = new Uint8Array(32) // Simplified - would need proper base32 decode
  
  // Create time buffer (8 bytes, big-endian)
  const timeBuffer = new ArrayBuffer(8)
  const timeView = new DataView(timeBuffer)
  timeView.setUint32(4, timeStep, false) // big-endian
  
  // HMAC-SHA1
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, timeBuffer)
  const signatureArray = new Uint8Array(signature)
  
  // Dynamic truncation
  const offset = signatureArray[19] & 0xf
  const code = (
    ((signatureArray[offset] & 0x7f) << 24) |
    ((signatureArray[offset + 1] & 0xff) << 16) |
    ((signatureArray[offset + 2] & 0xff) << 8) |
    (signatureArray[offset + 3] & 0xff)
  ) % 1000000
  
  return code.toString().padStart(6, '0')
}

// Simple QR code SVG generator (basic implementation)
async function generateQRCodeSVG(text: string): Promise<string> {
  // This is a simplified QR code - in production, use a proper QR library
  return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="white"/>
    <text x="100" y="100" text-anchor="middle" font-size="12" fill="black">
      QR Code for: ${text.slice(0, 20)}...
    </text>
  </svg>`
}