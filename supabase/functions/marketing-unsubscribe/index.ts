/**
 * Marketing Unsubscribe Handler - RFC 8058 One-Click & Preference Center
 *
 * This function handles:
 * - RFC 8058 List-Unsubscribe-Post one-click unsubscribe
 * - Traditional unsubscribe link clicks
 * - Preference center updates
 * - SMS STOP keyword handling
 * - Consent ledger recording
 *
 * All unsubscribe actions are recorded in the consent_ledger for compliance.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UnsubscribeToken {
  contact_id: string;
  org_id: string;
  email: string;
  channel: 'email' | 'sms' | 'all';
  purpose?: string;
  expires_at?: string;
  message_id?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Route based on path
    switch (path) {
      case 'one-click':
        return await handleOneClickUnsubscribe(req, supabase);

      case 'link':
        return await handleUnsubscribeLink(req, supabase);

      case 'preferences':
        return await handlePreferenceUpdate(req, supabase);

      case 'sms-stop':
        return await handleSmsStop(req, supabase);

      case 'verify':
        return await verifyToken(req, supabase);

      default:
        // If no path, check for token in query string (legacy format)
        const token = url.searchParams.get('token');
        if (token) {
          return await handleUnsubscribeLink(req, supabase);
        }

        return jsonResponse({ error: 'Invalid endpoint' }, 404);
    }

  } catch (error) {
    console.error('❌ Unsubscribe error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * RFC 8058 One-Click Unsubscribe
 * Handles POST requests with List-Unsubscribe=One-Click
 */
async function handleOneClickUnsubscribe(req: Request, supabase: SupabaseClient) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  console.log('📧 Processing one-click unsubscribe...');

  // Get token from URL or form data
  const url = new URL(req.url);
  let token = url.searchParams.get('token');

  // RFC 8058 may send token in form body
  if (!token) {
    try {
      const formData = await req.formData();
      token = formData.get('List-Unsubscribe') as string;
    } catch {
      // Not form data, try JSON
      try {
        const body = await req.json();
        token = body.token;
      } catch {
        // No token found
      }
    }
  }

  if (!token) {
    return jsonResponse({ error: 'Missing token' }, 400);
  }

  // Decode and validate token
  const tokenData = await decodeToken(supabase, token);
  if (!tokenData) {
    return jsonResponse({ error: 'Invalid or expired token' }, 400);
  }

  // Process unsubscribe
  await processUnsubscribe(supabase, tokenData, 'one_click_unsubscribe', req);

  // Return 200 OK per RFC 8058
  return new Response(null, { status: 200 });
}

/**
 * Traditional Unsubscribe Link
 * Renders a confirmation page or processes unsubscribe
 */
async function handleUnsubscribeLink(req: Request, supabase: SupabaseClient) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const confirmed = url.searchParams.get('confirmed') === 'true';

  if (!token) {
    return htmlResponse(renderErrorPage('Missing unsubscribe token'));
  }

  const tokenData = await decodeToken(supabase, token);
  if (!tokenData) {
    return htmlResponse(renderErrorPage('Invalid or expired unsubscribe link'));
  }

  if (req.method === 'POST' || confirmed) {
    // Process unsubscribe
    await processUnsubscribe(supabase, tokenData, 'unsubscribe_link', req);
    return htmlResponse(renderSuccessPage(tokenData));
  }

  // Show confirmation page
  return htmlResponse(renderConfirmationPage(tokenData, token));
}

/**
 * Preference Center Update
 * Handles granular preference changes
 */
async function handlePreferenceUpdate(req: Request, supabase: SupabaseClient) {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const body = await req.json();
  const { token, preferences } = body;

  if (!token || !preferences) {
    return jsonResponse({ error: 'Missing token or preferences' }, 400);
  }

  const tokenData = await decodeToken(supabase, token);
  if (!tokenData) {
    return jsonResponse({ error: 'Invalid or expired token' }, 400);
  }

  console.log('📝 Updating preferences for contact:', tokenData.contact_id);

  // Update communication preferences
  await supabase
    .from('communication_preferences')
    .upsert({
      org_id: tokenData.org_id,
      contact_id: tokenData.contact_id,
      email_marketing: preferences.email_marketing ?? true,
      email_transactional: preferences.email_transactional ?? true,
      sms_marketing: preferences.sms_marketing ?? true,
      sms_transactional: preferences.sms_transactional ?? true,
      purpose_preferences: preferences.purpose_preferences,
      last_updated_source: 'preference_center',
      last_updated_at: new Date().toISOString(),
    }, {
      onConflict: 'org_id,contact_id',
    });

  // Record in consent ledger
  await supabase.from('consent_ledger').insert({
    org_id: tokenData.org_id,
    contact_id: tokenData.contact_id,
    email: tokenData.email,
    channel: 'all',
    action: 'preference_change',
    source: 'preference_center',
    source_details: { preferences },
    ip_address: getClientIP(req),
    user_agent: req.headers.get('user-agent'),
  });

  return jsonResponse({ success: true, message: 'Preferences updated' });
}

/**
 * SMS STOP Handler
 * Processes STOP keyword from Twilio webhook
 */
async function handleSmsStop(req: Request, supabase: SupabaseClient) {
  if (req.method !== 'POST') {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  const formData = await req.formData();
  const from = formData.get('From') as string;
  const body = (formData.get('Body') as string || '').toLowerCase().trim();

  console.log(`📱 SMS keyword "${body}" from ${from}`);

  // Handle STOP keywords
  const stopKeywords = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit'];
  const startKeywords = ['start', 'yes', 'unstop'];

  if (stopKeywords.includes(body)) {
    await processSmsOptOut(supabase, from, true);
  } else if (startKeywords.includes(body)) {
    await processSmsOptOut(supabase, from, false);
  }

  // Return empty TwiML response
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
}

/**
 * Token Verification
 * Validates a token and returns contact preferences
 */
async function verifyToken(req: Request, supabase: SupabaseClient) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return jsonResponse({ valid: false, error: 'Missing token' }, 400);
  }

  const tokenData = await decodeToken(supabase, token);
  if (!tokenData) {
    return jsonResponse({ valid: false, error: 'Invalid or expired token' }, 400);
  }

  // Get current preferences
  const { data: prefs } = await supabase
    .from('communication_preferences')
    .select('*')
    .eq('org_id', tokenData.org_id)
    .eq('contact_id', tokenData.contact_id)
    .maybeSingle();

  return jsonResponse({
    valid: true,
    email: maskEmail(tokenData.email),
    preferences: prefs || getDefaultPreferences(),
  });
}

// Helper Functions

async function decodeToken(supabase: SupabaseClient, token: string): Promise<UnsubscribeToken | null> {
  try {
    // Token is base64 encoded JSON signed with HMAC
    const secret = Deno.env.get('UNSUBSCRIBE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Simple token format: base64(JSON)
    // In production, add HMAC signature verification
    const decoded = atob(token);
    const data = JSON.parse(decoded) as UnsubscribeToken;

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      console.log('Token expired');
      return null;
    }

    // Verify contact exists
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('id', data.contact_id)
      .eq('org_id', data.org_id)
      .maybeSingle();

    if (!contact) {
      console.log('Contact not found');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Token decode error:', error);
    return null;
  }
}

async function processUnsubscribe(
  supabase: SupabaseClient,
  tokenData: UnsubscribeToken,
  source: string,
  req: Request
) {
  console.log(`🚫 Unsubscribing ${tokenData.email} from ${tokenData.channel}`);

  // Update preferences based on channel
  const updates: Record<string, unknown> = {
    last_updated_source: source,
    last_updated_at: new Date().toISOString(),
  };

  if (tokenData.channel === 'email' || tokenData.channel === 'all') {
    updates.email_marketing = false;
  }
  if (tokenData.channel === 'sms' || tokenData.channel === 'all') {
    updates.sms_marketing = false;
  }

  // If specific purpose, update purpose_preferences
  if (tokenData.purpose) {
    const { data: existing } = await supabase
      .from('communication_preferences')
      .select('purpose_preferences')
      .eq('org_id', tokenData.org_id)
      .eq('contact_id', tokenData.contact_id)
      .maybeSingle();

    const purposePrefs = existing?.purpose_preferences || {};
    purposePrefs[tokenData.purpose] = false;
    updates.purpose_preferences = purposePrefs;
  }

  // Upsert preferences
  await supabase
    .from('communication_preferences')
    .upsert({
      org_id: tokenData.org_id,
      contact_id: tokenData.contact_id,
      ...updates,
    }, {
      onConflict: 'org_id,contact_id',
    });

  // Record in consent ledger (immutable)
  await supabase.from('consent_ledger').insert({
    org_id: tokenData.org_id,
    contact_id: tokenData.contact_id,
    email: tokenData.email,
    channel: tokenData.channel,
    action: 'opt_out',
    purpose: tokenData.purpose || (tokenData.channel === 'all' ? 'all_marketing' : `${tokenData.channel}_marketing`),
    source: source,
    source_details: { message_id: tokenData.message_id },
    ip_address: getClientIP(req),
    user_agent: req.headers.get('user-agent'),
  });

  // Cancel any active automation enrollments
  await supabase
    .from('marketing_automation_enrollments')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: 'unsubscribed',
    })
    .eq('contact_id', tokenData.contact_id)
    .eq('status', 'active');

  console.log(`✅ Unsubscribe processed for ${tokenData.email}`);
}

async function processSmsOptOut(supabase: SupabaseClient, phone: string, optOut: boolean) {
  // Find contacts with this phone number
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, org_id')
    .or(`phone.eq.${phone},mobile_phone.eq.${phone}`);

  if (!contacts || contacts.length === 0) {
    console.log(`No contacts found for phone ${phone}`);
    return;
  }

  for (const contact of contacts) {
    // Update preferences
    await supabase
      .from('communication_preferences')
      .upsert({
        org_id: contact.org_id,
        contact_id: contact.id,
        sms_marketing: !optOut,
        sms_transactional: !optOut,
        last_updated_source: optOut ? 'sms_stop' : 'sms_start',
        last_updated_at: new Date().toISOString(),
      }, {
        onConflict: 'org_id,contact_id',
      });

    // Record in consent ledger
    await supabase.from('consent_ledger').insert({
      org_id: contact.org_id,
      contact_id: contact.id,
      phone: phone,
      channel: 'sms',
      action: optOut ? 'opt_out' : 'opt_in',
      source: optOut ? 'sms_stop' : 'sms_start',
    });
  }

  console.log(`✅ SMS ${optOut ? 'opt-out' : 'opt-in'} processed for ${phone}`);
}

function getClientIP(req: Request): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('x-real-ip') ||
         null;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
  return `${maskedLocal}@${domain}`;
}

function getDefaultPreferences() {
  return {
    email_marketing: true,
    email_transactional: true,
    sms_marketing: true,
    sms_transactional: true,
    purpose_preferences: {
      newsletters: true,
      renewal_reminders: true,
      cross_sell: true,
      surveys: true,
      birthday_greetings: true,
      holiday_greetings: true,
      educational_content: true,
      referral_requests: true,
      policy_updates: true,
      claim_updates: true,
    },
  };
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html' },
  });
}

// HTML Templates

function renderConfirmationPage(tokenData: UnsubscribeToken, token: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 450px;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 24px; color: #333; margin-bottom: 12px; }
    p { color: #666; margin-bottom: 24px; line-height: 1.6; }
    .email { font-weight: 600; color: #333; }
    .buttons { display: flex; gap: 12px; justify-content: center; }
    .btn {
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #dc2626;
      color: white;
      border: none;
    }
    .btn-primary:hover { background: #b91c1c; }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
      border: none;
    }
    .btn-secondary:hover { background: #e5e7eb; }
    .link { color: #6366f1; text-decoration: underline; font-size: 14px; margin-top: 20px; display: inline-block; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📧</div>
    <h1>Unsubscribe from emails?</h1>
    <p>
      You're about to unsubscribe<br>
      <span class="email">${maskEmail(tokenData.email)}</span><br>
      from marketing emails.
    </p>
    <div class="buttons">
      <form method="POST" style="display: inline;">
        <button type="submit" class="btn btn-primary">Yes, Unsubscribe</button>
      </form>
      <a href="javascript:window.close();" class="btn btn-secondary">Cancel</a>
    </div>
    <a href="?token=${token}&preferences=true" class="link">Manage all preferences instead</a>
  </div>
</body>
</html>`;
}

function renderSuccessPage(tokenData: UnsubscribeToken): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 450px;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 24px; color: #333; margin-bottom: 12px; }
    p { color: #666; margin-bottom: 24px; line-height: 1.6; }
    .email { font-weight: 600; color: #333; }
    .note { font-size: 14px; color: #9ca3af; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>You've been unsubscribed</h1>
    <p>
      <span class="email">${maskEmail(tokenData.email)}</span><br>
      has been removed from our marketing list.
    </p>
    <p class="note">
      You may still receive important policy-related communications.
    </p>
  </div>
</body>
</html>`;
}

function renderErrorPage(message: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 40px;
      max-width: 450px;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 24px; color: #333; margin-bottom: 12px; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Something went wrong</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

/**
 * Generate an unsubscribe token (utility function)
 * Call this when creating emails to generate the token
 */
export function generateUnsubscribeToken(data: UnsubscribeToken): string {
  // Set expiry to 90 days from now
  const tokenData: UnsubscribeToken = {
    ...data,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };

  // Base64 encode the JSON
  // In production, add HMAC signature for security
  return btoa(JSON.stringify(tokenData));
}
