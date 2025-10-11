// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-parse-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PARSE_SECRET = Deno.env.get('INBOUND_PARSE_SECRET');

const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

async function putAndSign(path: string, bytes: Uint8Array, type: string) {
  const { error: upErr } = await sb.storage.from('ticket-attachments').upload(path, bytes, { contentType: type, upsert: true });
  if (upErr) throw upErr;
  const { data: signed } = await sb.storage.from('ticket-attachments').createSignedUrl(path, 60 * 60);
  return signed?.signedUrl || '';
}

async function jsonOrForm(req: Request) {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) return await req.json();
  if (ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData();
    const obj: Record<string, any> = {};
    form.forEach((v, k) => (obj[k] = v));
    return obj;
  }
  try { return await req.json(); } catch { return {}; }
}

async function ensureProfileByEmail(email: string) {
  const lower = email.toLowerCase();
  const { data: idMap } = await sb.from('customer_identities').select('profile_id').eq('email', lower).maybeSingle();
  if (idMap?.profile_id) return idMap.profile_id;
  const { data: prof } = await sb.from('profiles').insert({ email: lower, role: 'customer', full_name: lower.split('@')[0] }).select('id').single();
  if (prof?.id) await sb.from('customer_identities').insert({ profile_id: prof.id, email: lower });
  return prof?.id || null;
}

async function allowedSender(email: string) {
  const lower = email.toLowerCase();
  const domain = lower.split('@')[1] || '';
  const { data: exact } = await sb.from('inbound_allowlist').select('id').eq('channel','email').eq('value', lower).maybeSingle();
  if (exact) return true;
  const { data: dom } = await sb.from('inbound_allowlist').select('id').eq('channel','email').eq('value', domain).maybeSingle();
  return !!dom;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const provided = req.headers.get('x-parse-secret') || req.headers.get('authorization')?.replace('Bearer ','');
    if (PARSE_SECRET && provided !== PARSE_SECRET) return new Response('Unauthorized', { status: 401, headers: corsHeaders });

    const body = await jsonOrForm(req);
    const from = String(body.from || '').trim();
    const to = String(body.to || '').trim();
    const subject = String(body.subject || 'Email inquiry');
    const text = typeof body.text === 'string' ? body.text : '';
    const html = typeof body.html === 'string' ? body.html : '';
    const messageId = String(body.messageId || body['Message-Id'] || '');
    const inReplyTo = String(body.inReplyTo || body['In-Reply-To'] || '');

    if (!from) return new Response('Bad Request', { status: 400, headers: corsHeaders });

    if (!(await allowedSender(from))) {
      console.log('Inbound not allowed:', from);
      return new Response('Not allowed', { status: 403, headers: corsHeaders });
    }

    if (messageId) {
      const { data: dup } = await sb.from('ticket_messages').select('id').eq('email_message_id', messageId).limit(1);
      if (dup && dup.length) return new Response(JSON.stringify({ success: true, ticketId: null, duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    let ticketId: string | null = null;
    if (inReplyTo) {
      const { data: parent } = await sb.from('ticket_messages').select('ticket_id').eq('email_message_id', inReplyTo).maybeSingle();
      ticketId = parent?.ticket_id ?? null;
    }

    const requesterId = await ensureProfileByEmail(from);

    if (!ticketId) {
      const { data: recent } = await sb.rpc('find_recent_ticket_by_sender', { p_sender: from });
      ticketId = recent?.id ?? null;
    }

    if (!ticketId) {
      const { data: t, error: terr } = await sb.from('tickets').insert({
        title: subject || `Email from ${from}`,
        status: 'open',
        priority: 'normal',
        channel: 'email',
        requester_id: requesterId,
      }).select('id').single();
      if (terr) throw terr;
      ticketId = t?.id ?? null;
    }

    const content = html?.trim() || text?.trim() || '(no content)';
    const recipients = to ? [to] : [];

    // Parse attachments
    let attachments: any[] = [];
    // JSON with base64 items: { attachments: [{ name, type, contentBase64 }] }
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments) {
        const b64 = String(a.contentBase64 || '');
        if (!b64) continue;
        try {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const key = `email/${crypto.randomUUID()}-${a.name || 'file'}`;
          const url = await putAndSign(key, bytes, a.type || 'application/octet-stream');
          attachments.push({ name: a.name, type: a.type, size: bytes.byteLength, url, expiresIn: 3600 });
        } catch (e) {
          console.error('Failed to process attachment:', e);
        }
      }
    }
    
    // Multipart form: iterate File entries
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const files = [...form.entries()].filter(([k,v]) => v instanceof File) as [string, File][];
      for (const [name, file] of files) {
        try {
          const buf = new Uint8Array(await file.arrayBuffer());
          const key = `email/${crypto.randomUUID()}-${file.name || name}`;
          const url = await putAndSign(key, buf, file.type || 'application/octet-stream');
          attachments.push({ name: file.name || name, type: file.type, size: buf.byteLength, url, expiresIn: 3600 });
        } catch (e) {
          console.error('Failed to process attachment:', e);
        }
      }
    }

    const metadata: any = {};
    if (messageId) metadata.email_message_id = messageId;
    if (inReplyTo) metadata.email_in_reply_to = inReplyTo;
    if (from) metadata.external_sender = from;
    if (recipients.length) metadata.external_recipients = recipients;

    const { error: merr } = await sb.from('ticket_messages').insert({
      ticket_id: ticketId,
      author_id: requesterId,
      author_type: 'customer',
      message_type: 'email',
      content,
      is_internal: false,
      attachments,
      metadata,
    });
    if (merr) throw merr;

    return new Response(JSON.stringify({ success: true, ticketId }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('email-inbound-lite error', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
