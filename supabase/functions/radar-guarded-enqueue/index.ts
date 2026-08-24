import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { requireAuth } from '../_shared/auth.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { normalizeDestination } from '../_shared/radarCompliance.ts';

interface EnqueueRequest {
  compliance_check_id: string;
  lead_id: string;
  channel: 'email' | 'sms';
  destination: string;
  payload: Record<string, unknown>;
  automation_step_id?: string;
  automation_enrollment_id?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const headers = getCorsHeaders(req.headers.get('origin'));
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);
  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const auth = await requireAuth(req, db, headers);
  if (auth instanceof Response) return auth;

  let body: EnqueueRequest;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400, headers); }
  if (!body.compliance_check_id || !body.lead_id || !body.destination ||
      !['email', 'sms'].includes(body.channel) || !body.payload ||
      JSON.stringify(body.payload).length > 200_000) {
    return json({ error: 'Invalid guarded enqueue request' }, 400, headers);
  }
  const destination = normalizeDestination(body.channel, body.destination);
  if (!destination) return json({ error: 'Destination is invalid' }, 400, headers);

  const { data: receipt, error: receiptError } = await db.from('compliance_checks')
    .select('id, agency_workspace_id, licensed_agent_id, channel, destination, passed, fresh_through')
    .eq('id', body.compliance_check_id).maybeSingle();
  if (receiptError || !receipt || receipt.licensed_agent_id !== auth.id || !receipt.passed ||
      receipt.channel !== body.channel || receipt.destination !== destination ||
      new Date(receipt.fresh_through) < new Date()) {
    return json({ error: 'Guard receipt is missing, stale, or does not match this touch' }, 409, headers);
  }
  const { data: membership } = await db.from('agency_workspace_memberships').select('id')
    .eq('agency_workspace_id', receipt.agency_workspace_id).eq('user_id', auth.id)
    .eq('status', 'active').maybeSingle();
  if (!membership) return json({ error: 'Workspace access denied' }, 403, headers);

  const { data: queueId, error } = await db.rpc('enqueue_guarded_radar_touch', {
    p_compliance_check_id: receipt.id,
    p_lead_id: body.lead_id,
    p_channel: body.channel,
    p_destination: destination,
    p_from_user_id: auth.id,
    p_idempotency_key: `wc_renewal_radar:${receipt.id}`,
    p_payload: body.payload,
    p_automation_step_id: body.automation_step_id || null,
    p_automation_enrollment_id: body.automation_enrollment_id || null,
  });
  if (error) {
    console.error('Guarded Radar enqueue refused', error);
    return json({ error: 'Guarded enqueue refused' }, 409, headers);
  }
  return json({ queue_id: queueId, compliance_check_id: receipt.id }, 201, headers);
});

function json(body: object, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
