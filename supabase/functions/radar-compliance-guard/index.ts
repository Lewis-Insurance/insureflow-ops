import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  isWithinRecipientHours,
  isLeadContactBindingValid,
  deriveFloridaRecipientTimezone,
  isWrittenMarketingPewc,
  normalizeDestination,
  normalizePhone,
  RADAR_GUARD_MAX_AGE_MS,
} from '../_shared/radarCompliance.ts';

interface GuardRequest {
  opportunity_id: string;
  contact_id?: string | null;
  channel: 'email' | 'sms';
  destination: string;
  dnc_phone?: string;
  licensed_agent_id: string;
  license_number: string;
}

interface DncResult {
  listed: boolean;
  checked_at?: string;
}

interface LicenseResult {
  valid: boolean;
  appointed: boolean;
  state: string;
  license_number: string;
  licensed_agent_id: string;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const auth = await requireAuth(req, supabase, corsHeaders);
  if (auth instanceof Response) return auth;

  let body: GuardRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  if (!body.opportunity_id || !body.licensed_agent_id || !body.license_number?.trim() ||
      !body.destination || !['email', 'sms'].includes(body.channel)) {
    return json({ error: 'Missing required Guard fields' }, 400, corsHeaders);
  }
  if (auth.id !== body.licensed_agent_id) {
    return json({ error: 'licensed_agent_id must be the authenticated sender' }, 403, corsHeaders);
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from('renewal_opportunities')
    .select('id, agency_workspace_id, kind, stage, lead_id, source, county')
    .eq('id', body.opportunity_id)
    .maybeSingle();
  if (opportunityError || !opportunity || !['cancel', 'swo'].includes(opportunity.kind)) {
    return json({ error: 'Eligible Radar opportunity not found' }, 404, corsHeaders);
  }
  if (opportunity.stage !== 'handed_off') {
    return json({ error: 'Radar outreach requires CRM handoff' }, 409, corsHeaders);
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, agency_workspace_id, account_id, email, phone')
    .eq('id', opportunity.lead_id)
    .maybeSingle();
  if (leadError || !lead || lead.agency_workspace_id !== opportunity.agency_workspace_id ||
      !isLeadContactBindingValid(lead.account_id, body.contact_id)) {
    return json({ error: 'Contact is not bound to the handed-off Radar lead' }, 409, corsHeaders);
  }

  const { data: membership } = await supabase
    .from('agency_workspace_memberships')
    .select('id')
    .eq('agency_workspace_id', opportunity.agency_workspace_id)
    .eq('user_id', auth.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return json({ error: 'Workspace access denied' }, 403, corsHeaders);

  const destination = normalizeDestination(body.channel, body.destination);
  const dncPhone = normalizePhone(body.channel === 'sms' ? destination : body.dnc_phone);
  if (!destination || !/^\+1\d{10}$/.test(dncPhone)) {
    return json({ error: 'A canonical US E.164 DNC phone is required' }, 400, corsHeaders);
  }
  if (lead.account_id) {
    const { data: boundPhone, error: phoneError } = await supabase.from('insured_phones')
      .select('e164').eq('account_id', lead.account_id).eq('e164', dncPhone).limit(1).maybeSingle();
    if (phoneError || !boundPhone) {
      return json({ error: 'DNC phone is not bound to the handed-off account' }, 409, corsHeaders);
    }
    if (body.channel === 'email') {
      const { data: boundEmail, error: emailError } = await supabase.from('insured_emails')
        .select('email').eq('account_id', lead.account_id).eq('email', destination).limit(1).maybeSingle();
      if (emailError || !boundEmail) {
        return json({ error: 'Email destination is not bound to the handed-off account' }, 409, corsHeaders);
      }
    }
  } else {
    if (normalizePhone(lead.phone) !== dncPhone ||
        (body.channel === 'sms' && normalizePhone(lead.phone) !== normalizePhone(destination)) ||
        (body.channel === 'email' && (lead.email || '').trim().toLowerCase() !== destination)) {
      return json({ error: 'Destination is not bound to the handed-off lead' }, 409, corsHeaders);
    }
  }
  const { data: legacyMaps, error: legacyMapError } = await supabase
    .from('agency_workspace_legacy_org_map').select('legacy_org_id')
    .eq('agency_workspace_id', opportunity.agency_workspace_id);
  const legacyOrgIds = (legacyMaps || []).map((row) => row.legacy_org_id);
  if (legacyMapError || !legacyOrgIds.length) {
    return json({ error: 'Workspace consent namespace is not configured' }, 409, corsHeaders);
  }
  const now = new Date();
  const reasons: string[] = [];
  const recipientTimezone = deriveFloridaRecipientTimezone(opportunity.source, opportunity.county);
  if (!recipientTimezone) reasons.push('recipient_timezone_unverifiable');
  const hoursOk = recipientTimezone ? isWithinRecipientHours(now, recipientTimezone) : false;
  if (!hoursOk) reasons.push('outside_recipient_hours');

  const optedOut = await hasAllChannelOptOut(
    supabase, body.contact_id || null, destination, dncPhone, legacyOrgIds,
  );
  if (optedOut) reasons.push('all_channel_opt_out');

  const license = await queryLicenseService(body.licensed_agent_id, body.license_number.trim());
  if (!license) reasons.push('fl_license_check_unavailable');
  else if (!license.valid || !license.appointed || typeof license.state !== 'string' ||
      license.state.toUpperCase() !== 'FL' || typeof license.license_number !== 'string' ||
      typeof license.licensed_agent_id !== 'string' ||
      license.license_number !== body.license_number.trim() ||
      license.licensed_agent_id !== body.licensed_agent_id) {
    reasons.push('fl_license_or_appointment_invalid');
  }

  let pewc = false;
  let pewcPhone: string | null = null;
  if (body.channel === 'sms') {
    pewcPhone = normalizePhone(destination);
    pewc = await hasExactNumberPewc(supabase, body.contact_id || null, pewcPhone, legacyOrgIds);
    if (!pewc) reasons.push('pewc_missing_for_number');

    const { data: config } = await supabase
      .from('radar_config')
      .select('sms_enabled')
      .eq('agency_workspace_id', opportunity.agency_workspace_id)
      .maybeSingle();
    if (config?.sms_enabled !== true) reasons.push('radar_sms_disabled');
  }

  const [national, fdacs] = await Promise.all([
    queryDncService('NATIONAL_DNC_CHECK_URL', dncPhone, opportunity.agency_workspace_id),
    queryDncService('FDACS_DNC_CHECK_URL', dncPhone, opportunity.agency_workspace_id),
  ]);
  if (!national) reasons.push('national_dnc_unavailable');
  else if (national.listed) reasons.push('national_dnc_listed');
  if (!fdacs) reasons.push('fdacs_dnc_unavailable');
  else if (fdacs.listed) reasons.push('fdacs_dnc_listed');

  const checkedAt = now.toISOString();
  const nationalCheckedAt = validDncTimestamp(national?.checked_at, now) ? national?.checked_at || checkedAt : null;
  const fdacsCheckedAt = validDncTimestamp(fdacs?.checked_at, now) ? fdacs?.checked_at || checkedAt : null;
  if (national && !nationalCheckedAt) reasons.push('national_dnc_timestamp_invalid');
  if (fdacs && !fdacsCheckedAt) reasons.push('fdacs_dnc_timestamp_invalid');
  const passed = reasons.length === 0;
  const { data: receipt, error: insertError } = await supabase
    .from('compliance_checks')
    .insert({
      agency_workspace_id: opportunity.agency_workspace_id,
      opportunity_id: opportunity.id,
      contact_id: body.contact_id || null,
      channel: body.channel,
      destination,
      dnc_phone: dncPhone,
      recipient_timezone: recipientTimezone || 'UNVERIFIED',
      licensed_agent_id: body.licensed_agent_id,
      license_number: body.license_number.trim(),
      pewc,
      pewc_phone: pewcPhone,
      dnc_national_at: nationalCheckedAt,
      dnc_fdacs_at: fdacsCheckedAt,
      hours_ok: hoursOk,
      fresh_through: passed
        ? new Date(now.getTime() + RADAR_GUARD_MAX_AGE_MS).toISOString()
        : new Date(now.getTime() + 60_000).toISOString(),
      passed,
      status: passed ? 'passed' : 'failed',
      failure_reasons: reasons,
    })
    .select('id, passed, status, fresh_through, failure_reasons')
    .single();

  if (insertError) {
    console.error('Radar Guard receipt insert failed', insertError);
    return json({ error: 'Unable to record compliance receipt' }, 500, corsHeaders);
  }
  return json({ compliance_check_id: receipt.id, ...receipt }, passed ? 200 : 422, corsHeaders);
});

async function hasAllChannelOptOut(
  supabase: SupabaseClient,
  contactId: string | null,
  email: string,
  phone: string,
  legacyOrgIds: string[],
): Promise<boolean> {
  const channels = ['all', 'email', 'sms', 'mail', 'phone'];
  const results = await Promise.all(channels.map((channel) => {
    let query = supabase.from('consent_ledger').select('action')
      .in('org_id', legacyOrgIds).eq('channel', channel)
      .order('recorded_at', { ascending: false }).limit(1);
    if (contactId) query = query.eq('contact_id', contactId);
    else if (channel === 'email') query = query.eq('email', email);
    else query = query.eq('phone', phone);
    return query.maybeSingle();
  }));
  if (!contactId && email) {
    results.push(await supabase.from('consent_ledger').select('action')
      .in('org_id', legacyOrgIds).eq('channel', 'all').eq('email', email)
      .order('recorded_at', { ascending: false }).limit(1).maybeSingle());
  }
  return results.some(({ data, error }) => !!error || data?.action === 'opt_out');
}

async function hasExactNumberPewc(
  supabase: SupabaseClient,
  contactId: string | null,
  phone: string,
  legacyOrgIds: string[],
): Promise<boolean> {
  let query = supabase.from('consent_ledger')
    .select('action, phone, purpose, source, source_details, consent_text_shown, recorded_at')
    .eq('channel', 'sms')
    .eq('phone', phone)
    .in('org_id', legacyOrgIds)
    .order('recorded_at', { ascending: false })
    .limit(1);
  if (contactId) query = query.eq('contact_id', contactId);
  const { data, error } = await query.maybeSingle();
  return !error && isWrittenMarketingPewc(data, phone);
}

async function queryDncService(envName: string, destination: string, workspaceId: string): Promise<DncResult | null> {
  const url = Deno.env.get(envName);
  const token = Deno.env.get('RADAR_DNC_API_TOKEN');
  if (!url || !token) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination, agency_workspace_id: workspaceId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const result = await response.json() as DncResult;
    return typeof result.listed === 'boolean' ? result : null;
  } catch (error) {
    console.error(`${envName} failed`, error);
    return null;
  }
}

async function queryLicenseService(licensedAgentId: string, licenseNumber: string): Promise<LicenseResult | null> {
  const url = Deno.env.get('FL_LICENSE_CHECK_URL');
  const token = Deno.env.get('RADAR_LICENSE_API_TOKEN');
  if (!url || !token) return null;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ licensed_agent_id: licensedAgentId, license_number: licenseNumber, state: 'FL' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const result = await response.json() as LicenseResult;
    return typeof result.valid === 'boolean' && typeof result.appointed === 'boolean' ? result : null;
  } catch (error) {
    console.error('FL_LICENSE_CHECK_URL failed', error);
    return null;
  }
}

function json(body: object, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function validDncTimestamp(value: string | undefined, now: Date): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime() &&
    timestamp >= now.getTime() - 31 * 24 * 60 * 60 * 1000;
}
