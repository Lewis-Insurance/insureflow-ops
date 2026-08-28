import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { decidePortalInvitation } from './decision.ts';

interface InvitationRequest {
  account_id: string;
  account_ids?: string[];
  email: string;
  first_name?: string;
  last_name?: string;
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

async function sendPortalInvitation(email: string, actionLink: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return { success: false, error: 'Email delivery is not configured' };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Lewis Insurance <${Deno.env.get('OUTBOUND_FROM') || 'service@lewisinsurance.ai'}>`,
        to: [email],
        subject: 'Your Lewis Insurance client portal invitation',
        html: `<p>You have been invited to the Lewis Insurance client portal.</p><p><a href="${escapeHtml(actionLink)}">Accept invitation</a></p><p>This invitation expires in 30 days.</p>`,
      }),
    });

    return response.ok
      ? { success: true, error: null }
      : { success: false, error: `Email provider returned HTTP ${response.status}` };
  } catch {
    return { success: false, error: 'Email provider request failed' };
  }
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authorization header required' }, 401, corsHeaders);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: 'Invalid or expired token' }, 401, corsHeaders);

    /* eslint-disable local/no-deprecated-domain-terms -- Existing staff-auth schema contract. */
    const { data: profile, error: profileError } = await userClient
      .from('profiles').select('role, is_staff').eq('id', authData.user.id).single();
    const staffRoles = ['admin', 'staff', 'producer', 'csr', 'owner', 'agent'];
    if (profileError || !profile || (!staffRoles.includes(profile.role) && !profile.is_staff)) {
      return json({ error: 'Only staff members can send portal invitations' }, 403, corsHeaders);
    }
    /* eslint-enable local/no-deprecated-domain-terms */

    const parsedBody: unknown = await req.json();
    if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
      return json({ error: 'account_ids must be valid and include the invite-from account' }, 400, corsHeaders);
    }
    const body = parsedBody as InvitationRequest;
    const normalizedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const escapedEmailPattern = normalizedEmail.replace(/[\\%_]/g, '\\$&');
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const requestedAccountIds = body.account_ids === undefined ? [body.account_id] : body.account_ids;
    const requestMalformed =
      !uuidPattern.test(body.account_id ?? '') ||
      !Array.isArray(requestedAccountIds) ||
      requestedAccountIds.length === 0 ||
      requestedAccountIds.some((id) => typeof id !== 'string' || !uuidPattern.test(id));
    const requestedIds = Array.isArray(requestedAccountIds)
      ? [...new Set(requestedAccountIds.filter((id): id is string => typeof id === 'string'))]
      : [];
    const homeIncluded = typeof body.account_id === 'string' && body.account_id.length > 0 && requestedIds.includes(body.account_id);
    if (!homeIncluded || requestMalformed) {
      return json({ error: 'account_ids must be valid and include the invite-from account' }, 400, corsHeaders);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return json({ error: 'Invalid email format' }, 400, corsHeaders);
    }

    // Resolve the caller-authorized cluster allow-list before any write.
    const { data: cluster, error: clusterError } = await userClient.rpc('list_portal_invite_cluster', {
      p_account_id: body.account_id,
    });
    if (clusterError || !Array.isArray(cluster)) {
      return json({ error: 'Account scope could not be validated' }, 403, corsHeaders);
    }
    const allowedIds = new Set(cluster.map((row: { account_id: string }) => row.account_id));
    if (!allowedIds.has(body.account_id)) {
      return json({ error: 'Invite-from account is missing from the validated scope' }, 403, corsHeaders);
    }
    const hasForeignAccount = requestedIds.some((id) => !allowedIds.has(id));

    // Email is the login identity. Ambiguous legacy duplicates fail closed.
    const { data: existingUsers, error: lookupError } = await adminClient
      .from('client_portal_users')
      .select('id, account_id, email, portal_status')
      .ilike('email', escapedEmailPattern)
      .limit(2);

    const { data: invitationCandidates, error: invitationLookupError } = await adminClient
      .from('portal_invitations')
      .select('id, account_id, email, portal_user_id, scope_account_ids, status')
      .ilike('email', escapedEmailPattern)
      .limit(2);
    const resolution = decidePortalInvitation({
      email: normalizedEmail,
      homeAccountId: body.account_id,
      homeIncluded,
      requestMalformed,
      hasForeignAccount,
      portalLookupFailed: !!lookupError,
      invitationLookupFailed: !!invitationLookupError,
      portalUsers: existingUsers ?? [],
      invitations: invitationCandidates ?? [],
    });
    const { decision } = resolution;
    if (decision === 'reject_foreign') return json({ error: 'Account scope could not be validated' }, 400, corsHeaders);
    if (decision === 'reject_disabled') {
      return json({ error: 'This portal login is disabled and cannot be expanded' }, 409, corsHeaders);
    }
    if (decision === 'reject_home_missing') {
      return json({ error: 'account_ids must include the invite-from account' }, 400, corsHeaders);
    }

    let portalUser = resolution.portalUser;
    if (decision === 'create_new') {
      const { data, error } = await adminClient.from('client_portal_users').insert({
        account_id: body.account_id,
        email: normalizedEmail,
        first_name: body.first_name?.trim() || null,
        last_name: body.last_name?.trim() || null,
        portal_status: 'invited',
        can_submit_requests: true,
        can_view_policies: true,
        can_view_documents: true,
        can_view_claims: true,
      }).select('id, account_id, portal_status').single();
      if (error || !data) return json({ error: 'Failed to create portal login' }, 500, corsHeaders);
      portalUser = { ...data, email: normalizedEmail };
    }
    if (!portalUser) return json({ error: 'Portal login could not be resolved' }, 500, corsHeaders);

    const { data: currentScope, error: scopeReadError } = await adminClient
      .from('portal_user_accounts').select('account_id').eq('portal_user_id', portalUser.id);
    if (scopeReadError) return json({ error: 'Portal scope could not be read' }, 500, corsHeaders);
    const currentIds = new Set((currentScope ?? []).map((row: { account_id: string }) => row.account_id));
    const missingIds = requestedIds.filter((id) => !currentIds.has(id));

    const addScope = async (accountId: string) => {
      const { error: rpcError } = await userClient.rpc('add_portal_user_account', {
        p_portal_user_id: portalUser!.id,
        p_account_id: accountId,
      });
      if (!rpcError) return null;
      // Safe fallback: this exact account set passed the staff-only cluster RPC above.
      const { error: insertError } = await adminClient.from('portal_user_accounts').upsert({
        portal_user_id: portalUser!.id,
        account_id: accountId,
        is_home: accountId === portalUser!.account_id,
        created_by: authData.user!.id,
      }, { onConflict: 'portal_user_id,account_id' });
      return insertError;
    };
    for (const accountId of missingIds) {
      if (await addScope(accountId)) return json({ error: 'Failed to expand portal scope' }, 500, corsHeaders);
    }

    if (decision === 'expand_active') {
      return json({
        success: true,
        existing_user: true,
        message: `Added ${missingIds.length} accounts to the existing portal login`,
      }, 200, corsHeaders);
    }

    // Pending refresh stays on the original home and only adds to prior scope.
    const scopeAccountIds = [...new Set([portalUser.account_id, ...currentIds, ...requestedIds])];
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    let invitationId: string;
    if (resolution.invitation) {
      invitationId = resolution.invitation.id;
      const priorScope = Array.isArray(resolution.invitation.scope_account_ids)
        ? resolution.invitation.scope_account_ids
        : [];
      const { error } = await adminClient.from('portal_invitations').update({
        account_id: portalUser.account_id,
        portal_user_id: portalUser.id,
        scope_account_ids: [...new Set([...priorScope, ...scopeAccountIds])],
        status: 'pending',
        expires_at: expiresAt,
        send_attempts: 0,
        last_error: null,
      }).eq('id', invitationId);
      if (error) return json({ error: 'Failed to refresh invitation' }, 500, corsHeaders);
    } else {
      const { data, error } = await adminClient.from('portal_invitations').insert({
        account_id: portalUser.account_id,
        portal_user_id: portalUser.id,
        email: normalizedEmail,
        invitation_type: 'standard',
        status: 'pending',
        scope_account_ids: scopeAccountIds,
        expires_at: expiresAt,
      }).select('id').single();
      if (error || !data) return json({ error: 'Failed to create invitation' }, 500, corsHeaders);
      invitationId = data.id;
    }

    const portalUrl = Deno.env.get('PORTAL_URL') || 'https://www.lewisinsurance.com';
    const { data: magicLinkData, error: magicLinkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: { redirectTo: `${portalUrl}/portal/callback?invitation=${invitationId}` },
    });
    const actionLink = magicLinkData?.properties?.action_link;
    const delivery = !magicLinkError && actionLink
      ? await sendPortalInvitation(normalizedEmail, actionLink)
      : { success: false, error: 'Magic link generation failed' };
    const { error: statusUpdateError } = await adminClient.from('portal_invitations').update(!delivery.success ? {
      status: 'pending', send_attempts: 1, last_error: delivery.error,
    } : {
      status: 'sent', sent_at: new Date().toISOString(), sent_via: 'magic_link', send_attempts: 1, last_error: null,
    }).eq('id', invitationId);
    if (statusUpdateError) return json({ error: 'Failed to persist invitation delivery status' }, 500, corsHeaders);

    return json({
      success: true,
      invitation_id: invitationId,
      action_link: actionLink ?? null,
      message: delivery.success ? 'Portal invitation sent.' : 'Invitation created but email delivery may be delayed.',
    }, 201, corsHeaders);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: 'Invalid JSON in request body' }, 400, corsHeaders);
    console.error('Portal invitation request failed');
    return json({ error: 'Internal server error' }, 500, corsHeaders);
  }
});
