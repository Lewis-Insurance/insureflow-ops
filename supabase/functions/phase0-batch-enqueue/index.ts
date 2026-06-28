/**
 * Phase-0 Batch Enqueue — the dry-run / fire enqueuer with the human fire-gate.
 *
 * Implements PLAN-INT-B §4.2 (the enqueuer) and §6 (the fire-gate).
 *
 * WHAT THIS DOES
 * --------------
 * Resolves the Phase-0 cross-sell audience (one recipient per household), renders
 * the per-play marketing template with merge fields, and runs every gate a send
 * must pass — canopy invite presence, marketing-compliance-engine (CAN-SPAM / state),
 * suppression (communication_preferences), and the frequency cap. It NEVER sends:
 * it only enqueues into marketing_send_queue (status='pending'). The actual send is
 * a separate concern owned by marketing-send-governor, which honors the GLOBAL
 * sender_pause_state kill switch (default-ON until human go-live, per §6.1).
 *
 * TWO MODES
 * ---------
 *   mode='dry_run' (DEFAULT) — inserts NOTHING. Returns a per-recipient preview plus
 *     totals and a deterministic `preview_id` hash of the exact audience+template.
 *   mode='fire' — requires BOTH a valid `arm_token` (== BATCH_ARM_SECRET, constant-time)
 *     AND a `preview_id` that matches a freshly recomputed hash of the SAME audience.
 *     This is the human fire-gate: a human reviews a dry-run, copies its preview_id,
 *     supplies the arm token, and only an unchanged audience can be fired.
 *
 * DEFAULT-SAFE / FAIL-CLOSED
 * --------------------------
 * - mode defaults to 'dry_run' — you cannot send by forgetting a flag.
 * - Missing COMPLIANCE_INTERNAL_SECRET  -> recipient marked blocked (compliance_unavailable).
 * - Missing UNSUBSCRIBE_SECRET          -> recipient marked blocked (no_unsubscribe_secret).
 * - Compliance can_send=false           -> recipient blocked.
 * - Any of: no canopy invite, suppressed, frequency-capped -> would_send=false.
 * In every degraded case the dry-run still reports; fire enqueues only the would_send set.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { generateUnsubscribeToken } from '../marketing-unsubscribe/index.ts';

const WORKSPACE_ID = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb';
const PROJECTION_SOURCE = 'phase0_account_projection';

const logger = createLogger('phase0-batch-enqueue');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'dry_run' | 'fire';

interface RequestBody {
  mode?: Mode;
  campaign_key?: string;
  account_ids?: string[];
  template_id?: string;
  from_user_id: string;
  agency_postal_address: string;
  agency_name?: string;
  producer_name?: string;
  scheduled_for?: string;
  limit?: number;
  arm_token?: string;
  preview_id?: string;
}

interface TemplateRecord {
  template_id: string;
  template_version_id: string;
  subject: string;
  body_html: string;
  body_text: string | null;
}

interface RecipientPreview {
  account_id: string;
  household_key: string;
  email: string; // masked
  state: string | null;
  has_invite: boolean;
  compliance_pass: boolean;
  compliance_issues: unknown[];
  suppressed: boolean;
  suppressed_reason: string | null;
  freq_ok: boolean;
  would_send: boolean;
  skip_reason: string | null;
}

// Fully-resolved recipient carried internally so FIRE can insert without re-resolving.
interface ResolvedRecipient extends RecipientPreview {
  to_account_id: string;
  to_contact_id: string;
  to_email: string; // unmasked
  household_id: string | null;
  public_url: string | null;
  template: TemplateRecord;
  rendered_subject: string;
  rendered_html: string;
  rendered_text: string;
  unsubscribe_url: string;
  compliance_classification: string;
  merge_context: Record<string, unknown>;
}

interface BatchError {
  account_id: string | null;
  household_key: string | null;
  error: string;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** Constant-time string comparison (mirrors _shared/cron-auth.ts timingSafeEqual). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `*@${domain}`;
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

/** Deterministic SHA-256 hex of an arbitrary string. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic preview hash over the *audience identity* (NOT per-run state).
 * Segment label + template id + sorted household keys + count. Identical inputs
 * always yield the same hash, so FIRE can prove the audience is unchanged.
 */
async function computePreviewId(
  segmentLabel: string,
  templateId: string | null,
  householdKeys: string[],
): Promise<string> {
  const sorted = [...householdKeys].sort();
  const canonical = JSON.stringify({
    segment: segmentLabel,
    template: templateId ?? '',
    households: sorted,
    count: sorted.length,
  });
  return 'pv_' + (await sha256Hex(canonical));
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');
  const cors = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors, status: 204 });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  // --- AUTH: x-batch-secret == BATCH_TRIGGER_SECRET (constant-time) ---
  const triggerSecret = Deno.env.get('BATCH_TRIGGER_SECRET');
  const providedTrigger = req.headers.get('x-batch-secret');
  if (
    !triggerSecret ||
    !providedTrigger ||
    !timingSafeEqual(providedTrigger, triggerSecret)
  ) {
    logger.warn('Unauthorized batch enqueue attempt (bad or missing x-batch-secret)');
    return json({ error: 'Unauthorized' }, 401, cors);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }

  const mode: Mode = body.mode === 'fire' ? 'fire' : 'dry_run';

  // Required inputs
  if (!body.from_user_id) {
    return json({ error: 'from_user_id is required' }, 400, cors);
  }
  if (!body.agency_postal_address) {
    return json({ error: 'agency_postal_address is required' }, 400, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    logger.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500, cors);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const errors: BatchError[] = [];

  try {
    // -----------------------------------------------------------------------
    // 1. Resolve audience (deduped to one recipient per household_key).
    // -----------------------------------------------------------------------
    const audience = await resolveAudience(supabase, body, errors);
    const segmentLabel = body.campaign_key
      ? `campaign:${body.campaign_key}`
      : `view:reachable_email${body.account_ids ? `:accts=${body.account_ids.length}` : ''}`;

    if (audience.rows.length === 0) {
      return json(
        {
          mode,
          ok: true,
          message: 'No recipients resolved for the requested audience.',
          campaign_key: body.campaign_key ?? null,
          campaign_id: audience.campaignId,
          totals: emptyTotals(),
          preview_id: await computePreviewId(segmentLabel, resolveTemplateIdHint(body, audience), []),
          recipients: [],
          errors,
        },
        200,
        cors,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Resolve & evaluate every recipient (read-only; no inserts here).
    // -----------------------------------------------------------------------
    const resolved: ResolvedRecipient[] = [];
    for (const row of audience.rows) {
      try {
        const r = await resolveRecipient(supabase, body, audience, row);
        if (r) resolved.push(r);
      } catch (e) {
        errors.push({
          account_id: row.contact_account_id ?? null,
          household_key: row.household_key ?? null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const householdKeys = resolved.map((r) => r.household_key);
    // The template id that defines the audience hash. Prefer an explicit
    // template_id; otherwise use the campaign's resolved template id (stable
    // for a campaign-key segment); fall back to '' for the heterogeneous
    // view-segment case.
    const hashTemplateId = resolveTemplateIdHint(body, audience);
    const previewId = await computePreviewId(segmentLabel, hashTemplateId, householdKeys);

    const totals = computeTotals(resolved);

    // -----------------------------------------------------------------------
    // 3a. DRY-RUN — report only, insert nothing.
    // -----------------------------------------------------------------------
    if (mode === 'dry_run') {
      return json(
        {
          mode,
          ok: true,
          campaign_key: body.campaign_key ?? null,
          campaign_id: audience.campaignId,
          preview_id: previewId,
          totals,
          recipients: resolved.map(toPreview),
          errors,
        },
        200,
        cors,
      );
    }

    // -----------------------------------------------------------------------
    // 3b. FIRE — human fire-gate (PLAN-INT-B §6).
    //     Require BOTH a valid arm token AND a matching, freshly-recomputed
    //     preview_id. Either failure => 400, insert nothing.
    // -----------------------------------------------------------------------
    const armSecret = Deno.env.get('BATCH_ARM_SECRET');
    const providedArm = body.arm_token ?? '';
    const armOk = !!armSecret && !!providedArm && timingSafeEqual(providedArm, armSecret);
    if (!armOk) {
      logger.warn('FIRE rejected: bad or missing arm_token');
      return json(
        { mode, ok: false, error: 'fire_gate_failed', reason: 'invalid_arm_token' },
        400,
        cors,
      );
    }

    if (!body.preview_id || body.preview_id !== previewId) {
      logger.warn('FIRE rejected: preview_id mismatch (audience changed since preview)', {
        supplied: body.preview_id ?? null,
        recomputed: previewId,
      });
      return json(
        {
          mode,
          ok: false,
          error: 'fire_gate_failed',
          reason: 'preview_id_mismatch',
          recomputed_preview_id: previewId,
        },
        400,
        cors,
      );
    }

    // Gate passed. Enqueue ONLY the would_send set.
    const toSend = resolved.filter((r) => r.would_send);
    let enqueued = 0;
    for (const r of toSend) {
      try {
        const inserted = await enqueueRecipient(supabase, body, audience, r);
        if (inserted) enqueued += 1;
      } catch (e) {
        errors.push({
          account_id: r.to_account_id,
          household_key: r.household_key,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json(
      {
        mode,
        ok: true,
        campaign_key: body.campaign_key ?? null,
        campaign_id: audience.campaignId,
        preview_id: previewId,
        totals,
        enqueued,
        // would_send that did not insert (e.g. idempotency conflict => already queued).
        skipped_changed_since_preview: toSend.length - enqueued,
        errors,
      },
      200,
      cors,
    );
  } catch (e) {
    logger.error('Batch enqueue failed', e instanceof Error ? e : undefined);
    return json(
      { error: e instanceof Error ? e.message : 'Unknown error', errors },
      500,
      cors,
    );
  }
});

// ---------------------------------------------------------------------------
// Audience resolution
// ---------------------------------------------------------------------------

interface AudienceRow {
  household_key: string;
  household_id: string | null;
  play: string;
  contact_account_id: string;
  contact_email: string | null;
  contact_name: string | null;
}

interface Campaign {
  id: string;
  key: string;
  name: string;
  play: string;
  email_template_key: string;
}

interface Audience {
  rows: AudienceRow[];
  campaign: Campaign | null;
  campaignId: string | null;
  // Pre-resolved template when the whole segment uses one template
  // (campaign-key segment, or an explicit template_id).
  fixedTemplate: TemplateRecord | null;
  // Per-request template cache (by play template key). Request-scoped — NOT
  // module-level — so a deployed template-version bump is picked up on the next
  // request rather than being pinned by a long-lived isolate.
  templateCache: Map<string, TemplateRecord>;
}

async function resolveAudience(
  supabase: SupabaseClient,
  body: RequestBody,
  errors: BatchError[],
): Promise<Audience> {
  let campaign: Campaign | null = null;
  let rows: AudienceRow[] = [];

  if (body.campaign_key) {
    // Campaign path: the campaign's enrolled households joined to the view.
    const { data: camp, error: campErr } = await supabase
      .from('phase0_campaign')
      .select('id, key, name, play, email_template_key')
      .eq('agency_workspace_id', WORKSPACE_ID)
      .eq('key', body.campaign_key)
      .maybeSingle();

    if (campErr) throw new Error(`campaign lookup failed: ${campErr.message}`);
    if (!camp) throw new Error(`campaign not found: ${body.campaign_key}`);
    campaign = camp as Campaign;

    // Enrolled households that are still actionable (not already sent/cancelled/
    // converted/suppressed). The view supplies the canonical contact + play.
    const { data: enrollments, error: enrErr } = await supabase
      .from('phase0_enrollment')
      .select('household_key, household_id, play, contact_account_id, contact_email, contact_name, status')
      .eq('campaign_id', camp.id)
      .in('status', ['enrolled', 'minting', 'ready_to_send']);

    if (enrErr) throw new Error(`enrollment lookup failed: ${enrErr.message}`);

    rows = (enrollments ?? []).map((e: Record<string, unknown>) => ({
      household_key: e.household_key as string,
      household_id: (e.household_id as string | null) ?? null,
      play: e.play as string,
      contact_account_id: e.contact_account_id as string,
      contact_email: (e.contact_email as string | null) ?? null,
      contact_name: (e.contact_name as string | null) ?? null,
    }));
  } else {
    // View path: reachable_email targets, optional account_ids / limit filters.
    let query = supabase
      .from('v_phase0_crosssell_targets')
      .select('household_key, household_id, play, contact_account_id, contact_email, contact_name, reachable_email')
      .eq('agency_workspace_id', WORKSPACE_ID)
      .eq('reachable_email', true);

    if (body.account_ids && body.account_ids.length > 0) {
      query = query.in('contact_account_id', body.account_ids);
    }
    if (typeof body.limit === 'number' && body.limit > 0) {
      query = query.limit(body.limit);
    }

    const { data: viewRows, error: viewErr } = await query;
    if (viewErr) throw new Error(`audience view lookup failed: ${viewErr.message}`);

    rows = (viewRows ?? []).map((v: Record<string, unknown>) => ({
      household_key: v.household_key as string,
      household_id: (v.household_id as string | null) ?? null,
      play: v.play as string,
      contact_account_id: v.contact_account_id as string,
      contact_email: (v.contact_email as string | null) ?? null,
      contact_name: (v.contact_name as string | null) ?? null,
    }));
  }

  // DEDUPE to one recipient per household_key (first occurrence wins; rows are
  // already one-per-household from the view, but enrollment + filters could,
  // in theory, double up — be defensive).
  const seen = new Set<string>();
  const deduped: AudienceRow[] = [];
  for (const r of rows) {
    if (!r.household_key) {
      errors.push({ account_id: r.contact_account_id ?? null, household_key: null, error: 'missing_household_key' });
      continue;
    }
    if (seen.has(r.household_key)) continue;
    seen.add(r.household_key);
    deduped.push(r);
  }

  // Pre-resolve a single template if the whole segment shares one.
  let fixedTemplate: TemplateRecord | null = null;
  if (body.template_id) {
    fixedTemplate = await loadTemplateById(supabase, body.template_id);
  } else if (campaign?.email_template_key) {
    fixedTemplate = await loadTemplateByName(supabase, campaign.email_template_key);
  }

  return {
    rows: deduped,
    campaign,
    campaignId: campaign?.id ?? null,
    fixedTemplate,
    templateCache: new Map<string, TemplateRecord>(),
  };
}

/**
 * The template id used in the audience hash. Stable for single-template segments.
 * For a heterogeneous view segment with no explicit template, returns null so the
 * hash does not depend on per-play template resolution.
 */
function resolveTemplateIdHint(body: RequestBody, audience: Audience): string | null {
  if (body.template_id) return body.template_id;
  if (audience.fixedTemplate) return audience.fixedTemplate.template_id;
  return null;
}

// ---------------------------------------------------------------------------
// Template loading
// ---------------------------------------------------------------------------

const PLAY_TEMPLATE_KEY: Record<string, string> = {
  home_only_sell_auto: 'phase0_home_only_sell_auto',
  auto_only_sell_home: 'phase0_auto_only_sell_home',
  umbrella_add: 'phase0_umbrella_add',
  rec_sell_auto: 'phase0_rec_sell_auto',
};

async function loadTemplateById(
  supabase: SupabaseClient,
  templateId: string,
): Promise<TemplateRecord> {
  const { data: tpl, error } = await supabase
    .from('marketing_email_templates')
    .select('id, current_version_id')
    .eq('org_id', WORKSPACE_ID)
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw new Error(`template lookup failed: ${error.message}`);
  if (!tpl || !tpl.current_version_id) throw new Error(`template not found or has no current version: ${templateId}`);
  return loadVersion(supabase, tpl.id as string, tpl.current_version_id as string);
}

async function loadTemplateByName(
  supabase: SupabaseClient,
  name: string,
): Promise<TemplateRecord> {
  const { data: tpl, error } = await supabase
    .from('marketing_email_templates')
    .select('id, current_version_id')
    .eq('org_id', WORKSPACE_ID)
    .eq('name', name)
    .maybeSingle();
  if (error) throw new Error(`template lookup failed: ${error.message}`);
  if (!tpl || !tpl.current_version_id) throw new Error(`template not found or has no current version: ${name}`);
  return loadVersion(supabase, tpl.id as string, tpl.current_version_id as string);
}

async function loadVersion(
  supabase: SupabaseClient,
  templateId: string,
  versionId: string,
): Promise<TemplateRecord> {
  const { data: ver, error } = await supabase
    .from('marketing_email_template_versions')
    .select('id, subject, body_html, body_text')
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw new Error(`template version lookup failed: ${error.message}`);
  if (!ver) throw new Error(`template version not found: ${versionId}`);
  return {
    template_id: templateId,
    template_version_id: ver.id as string,
    subject: (ver.subject as string) ?? '',
    body_html: (ver.body_html as string) ?? '',
    body_text: (ver.body_text as string | null) ?? null,
  };
}

async function templateForRecipient(
  supabase: SupabaseClient,
  audience: Audience,
  play: string,
): Promise<TemplateRecord> {
  if (audience.fixedTemplate) return audience.fixedTemplate;
  const key = PLAY_TEMPLATE_KEY[play];
  if (!key) throw new Error(`no template mapping for play: ${play}`);
  // Heterogeneous view segment: load each play's template once per request.
  const cached = audience.templateCache.get(key);
  if (cached) return cached;
  const tpl = await loadTemplateByName(supabase, key);
  audience.templateCache.set(key, tpl);
  return tpl;
}

// ---------------------------------------------------------------------------
// Merge rendering
// ---------------------------------------------------------------------------

function renderMerge(template: string, ctx: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name: string) => {
    const v = ctx[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

// ---------------------------------------------------------------------------
// Per-recipient resolution + gating (read-only)
// ---------------------------------------------------------------------------

async function resolveRecipient(
  supabase: SupabaseClient,
  body: RequestBody,
  audience: Audience,
  row: AudienceRow,
): Promise<ResolvedRecipient> {
  const toAccountId = row.contact_account_id;
  const orgId = WORKSPACE_ID;

  // -- Bridge: projection contact for this account (gives to_contact_id, first_name, state) --
  const { data: contact, error: contactErr } = await supabase
    .from('contacts')
    .select('id, first_name, email, state_code')
    .eq('account_id', toAccountId)
    .eq('source', PROJECTION_SOURCE)
    .is('deleted_at', null)
    .maybeSingle();

  if (contactErr) throw new Error(`contact projection lookup failed: ${contactErr.message}`);
  if (!contact) throw new Error('no_contact_projection');

  const toContactId = contact.id as string;
  const toEmail = (contact.email as string | null) || row.contact_email || '';
  if (!toEmail) throw new Error('no_email');

  const firstName = (contact.first_name as string | null) || '';

  // -- accounts.state (authoritative recipient state for compliance) --
  let state: string | null = (contact.state_code as string | null) ?? null;
  {
    const { data: acct } = await supabase
      .from('accounts')
      .select('state')
      .eq('id', toAccountId)
      .maybeSingle();
    if (acct && acct.state) state = acct.state as string;
  }

  // -- household_id (real or null) --
  const householdId = row.household_id ?? null;

  // -- Canopy invite link (skip reason 'no_invite' if absent) --
  const { data: invite } = await supabase
    .from('canopy_invites')
    .select('public_url, status')
    .eq('account_id', toAccountId)
    .not('public_url', 'is', null)
    .in('status', ['invite_minted', 'sent'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const publicUrl = (invite?.public_url as string | null) ?? null;
  const hasInvite = !!publicUrl;

  // -- Template (by play or fixed) --
  const template = await templateForRecipient(supabase, audience, row.play);

  // -- Unsubscribe URL: mint token; absence of UNSUBSCRIBE_SECRET => compliance-blocked --
  let unsubscribeUrl = '';
  let unsubBlocked = false;
  try {
    const token = await generateUnsubscribeToken({
      contact_id: toContactId,
      org_id: orgId,
      email: toEmail,
      channel: 'email',
      purpose: 'cross_sell',
    });
    unsubscribeUrl =
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/marketing-unsubscribe/one-click?token=` +
      encodeURIComponent(token);
  } catch {
    // UNSUBSCRIBE_SECRET unset (or mint failed) — DO NOT crash the batch.
    unsubBlocked = true;
  }

  // -- Merge context --
  const merge: Record<string, string> = {
    first_name: firstName,
    canopy_link: publicUrl ?? '',
    agency_name: body.agency_name ?? '',
    producer_name: body.producer_name ?? '',
    agency_postal_address: body.agency_postal_address,
    current_carrier: '', // best-effort: unknown
    rec_item: '',
    unsubscribe_url: unsubscribeUrl,
  };

  const renderedSubject = renderMerge(template.subject, merge);
  const renderedHtml = renderMerge(template.body_html, merge);
  const renderedText = renderMerge(template.body_text ?? '', merge);

  // -----------------------------------------------------------------------
  // COMPLIANCE — call marketing-compliance-engine. Fail-closed.
  // -----------------------------------------------------------------------
  let compliancePass = false;
  let complianceIssues: unknown[] = [];
  let complianceClassification = 'marketing';

  if (unsubBlocked) {
    // No unsubscribe URL => cannot be CAN-SPAM compliant. Block without calling out.
    compliancePass = false;
    complianceIssues = [{ field: 'unsubscribe_url', issue: 'no_unsubscribe_secret', severity: 'error' }];
  } else {
    const complianceSecret = Deno.env.get('COMPLIANCE_INTERNAL_SECRET');
    if (!complianceSecret) {
      // Compliance engine unavailable to us — never send uncompliant.
      compliancePass = false;
      complianceIssues = [{ field: 'compliance', issue: 'compliance_unavailable', severity: 'error' }];
    } else {
      try {
        const resp = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/marketing-compliance-engine`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': complianceSecret,
            },
            body: JSON.stringify({
              content_type: 'email',
              subject: renderedSubject,
              body_html: renderedHtml,
              body_text: renderedText,
              recipient_state: state,
              classification: 'marketing',
            }),
          },
        );
        if (!resp.ok) {
          compliancePass = false;
          complianceIssues = [
            { field: 'compliance', issue: 'compliance_unavailable', severity: 'error', http_status: resp.status },
          ];
        } else {
          const result = (await resp.json()) as {
            can_send?: boolean;
            issues?: unknown[];
            classification?: string;
          };
          compliancePass = result.can_send === true;
          complianceIssues = Array.isArray(result.issues) ? result.issues : [];
          if (result.classification) complianceClassification = result.classification;
        }
      } catch (e) {
        // Network/engine error — fail closed.
        compliancePass = false;
        complianceIssues = [
          {
            field: 'compliance',
            issue: 'compliance_unavailable',
            severity: 'error',
            detail: e instanceof Error ? e.message : String(e),
          },
        ];
      }
    }
  }

  // -----------------------------------------------------------------------
  // SUPPRESSION — communication_preferences (by contact_id OR email).
  // -----------------------------------------------------------------------
  const { suppressed, suppressedReason } = await evaluateSuppression(
    supabase,
    orgId,
    toContactId,
    toEmail,
  );

  // -----------------------------------------------------------------------
  // FREQUENCY — check_frequency_cap RPC (read-only here).
  // -----------------------------------------------------------------------
  let freqOk = true;
  {
    const { data: freq, error: freqErr } = await supabase.rpc('check_frequency_cap', {
      p_org_id: orgId,
      p_contact_id: toContactId,
      p_household_id: householdId,
      p_classification: 'marketing',
      p_channel: 'email',
    });
    if (freqErr) {
      // Treat an RPC failure as a block (fail-closed for sending).
      freqOk = false;
      logger.warn('check_frequency_cap failed; treating as frequency-blocked', {
        contact_id: toContactId,
        error: freqErr.message,
      });
    } else {
      // RETURNS TABLE(...) => array of rows.
      const firstRow = Array.isArray(freq) ? freq[0] : freq;
      freqOk = !!firstRow?.allowed;
    }
  }

  // -----------------------------------------------------------------------
  // would_send = has_invite AND compliance_pass AND NOT suppressed AND freq_ok
  // -----------------------------------------------------------------------
  const wouldSend = hasInvite && compliancePass && !suppressed && freqOk;

  // First failing reason (for the preview); order mirrors the gate sequence.
  let skipReason: string | null = null;
  if (!hasInvite) skipReason = 'no_invite';
  else if (!compliancePass) skipReason = unsubBlocked ? 'no_unsubscribe_secret' : 'blocked_compliance';
  else if (suppressed) skipReason = `suppressed:${suppressedReason}`;
  else if (!freqOk) skipReason = 'frequency_blocked';

  return {
    account_id: toAccountId,
    household_key: row.household_key,
    email: maskEmail(toEmail),
    state,
    has_invite: hasInvite,
    compliance_pass: compliancePass,
    compliance_issues: complianceIssues,
    suppressed,
    suppressed_reason: suppressedReason,
    freq_ok: freqOk,
    would_send: wouldSend,
    skip_reason: skipReason,
    // internal carry-through
    to_account_id: toAccountId,
    to_contact_id: toContactId,
    to_email: toEmail,
    household_id: householdId,
    public_url: publicUrl,
    template,
    rendered_subject: renderedSubject,
    rendered_html: renderedHtml,
    rendered_text: renderedText,
    unsubscribe_url: unsubscribeUrl,
    compliance_classification: complianceClassification,
    merge_context: merge,
  };
}

async function evaluateSuppression(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string,
  email: string,
): Promise<{ suppressed: boolean; suppressedReason: string | null }> {
  // Collect the set of contact_ids to check prefs against. Start with the
  // canonical projection contact (by contact_id), then add any OTHER contacts
  // sharing this email — opt-outs may have been recorded against a sibling
  // contact row keyed to the same address. (communication_preferences has no
  // email column, so email-keyed suppression is resolved via contacts.email.)
  // NOTE: contacts is NOT filtered by org_id here. The phase-0 projection insert
  // does not set contacts.org_id (single-tenant; org_id lives on the Levitate
  // tables, per the identity-bridge decision), so a stray contacts.org_id default
  // must never gate this lookup. account_id + source + email are the real keys.
  const contactIds = new Set<string>([contactId]);
  if (email) {
    const { data: emailContacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', email)
      .is('deleted_at', null);
    for (const c of emailContacts ?? []) {
      if (c?.id) contactIds.add(c.id as string);
    }
  }

  const { data: prefRows } = await supabase
    .from('communication_preferences')
    .select(
      'do_not_contact, do_not_market, deceased, email_marketing, temporary_suppression_until',
    )
    .eq('org_id', orgId)
    .in('contact_id', Array.from(contactIds));

  const rows: Record<string, unknown>[] = prefRows ?? [];

  for (const p of rows) {
    if (p.do_not_contact === true) return { suppressed: true, suppressedReason: 'do_not_contact' };
    if (p.do_not_market === true) return { suppressed: true, suppressedReason: 'do_not_market' };
    if (p.deceased === true) return { suppressed: true, suppressedReason: 'deceased' };
    if (p.email_marketing === false) return { suppressed: true, suppressedReason: 'email_marketing_off' };
    const until = p.temporary_suppression_until as string | null;
    if (until && new Date(until) > new Date()) {
      return { suppressed: true, suppressedReason: 'temporary_suppression' };
    }
  }

  return { suppressed: false, suppressedReason: null };
}

// ---------------------------------------------------------------------------
// FIRE: enqueue a single would_send recipient.
// ---------------------------------------------------------------------------

async function enqueueRecipient(
  supabase: SupabaseClient,
  body: RequestBody,
  audience: Audience,
  r: ResolvedRecipient,
): Promise<boolean> {
  const orgId = WORKSPACE_ID;
  const scheduledFor = body.scheduled_for ?? new Date().toISOString();
  // idempotency_key = 'phase0:'||household_key||':'||template_id
  const idempotencyKey = `phase0:${r.household_key}:${r.template.template_id}`;

  // Insert into the queue with ON CONFLICT (idempotency_key) DO NOTHING semantics.
  // PostgREST: upsert with ignoreDuplicates so a re-fire enqueues 0 dups.
  const { data: queued, error: qErr } = await supabase
    .from('marketing_send_queue')
    .upsert(
      {
        org_id: orgId,
        idempotency_key: idempotencyKey,
        scheduled_for: scheduledFor,
        channel: 'email',
        classification: 'marketing',
        from_user_id: body.from_user_id,
        to_contact_id: r.to_contact_id,
        to_account_id: r.to_account_id,
        to_email: r.to_email,
        household_id: r.household_id,
        household_dedupe_key: r.household_key,
        source_type: 'campaign',
        source_id: audience.campaignId,
        status: 'pending',
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (qErr) throw new Error(`queue insert failed: ${qErr.message}`);

  // ignoreDuplicates => conflict yields no returned row: already enqueued.
  if (!queued) return false;

  const queueId = queued.id as string;

  // Payload (1:1, PK = queue_id). If this fails, surface the error; the queue row
  // exists but has no payload — better to report than to silently drop.
  const { error: pErr } = await supabase.from('marketing_send_queue_payloads').insert({
    queue_id: queueId,
    org_id: orgId,
    channel: 'email',
    email_subject: r.rendered_subject,
    email_body_html: r.rendered_html,
    email_body_text: r.rendered_text,
    unsubscribe_url: r.unsubscribe_url,
    postal_address: body.agency_postal_address,
    compliance_validated: true,
    compliance_classification: r.compliance_classification,
    template_id: r.template.template_id,
    template_version_id: r.template.template_version_id,
    merge_context: r.merge_context,
  });

  if (pErr) throw new Error(`payload insert failed (queue_id=${queueId}): ${pErr.message}`);

  return true;
}

// ---------------------------------------------------------------------------
// Totals / preview shaping
// ---------------------------------------------------------------------------

function toPreview(r: ResolvedRecipient): RecipientPreview {
  return {
    account_id: r.account_id,
    household_key: r.household_key,
    email: r.email,
    state: r.state,
    has_invite: r.has_invite,
    compliance_pass: r.compliance_pass,
    compliance_issues: r.compliance_issues,
    suppressed: r.suppressed,
    suppressed_reason: r.suppressed_reason,
    freq_ok: r.freq_ok,
    would_send: r.would_send,
    skip_reason: r.skip_reason,
  };
}

interface Totals {
  requested: number;
  would_send: number;
  blocked_compliance: number;
  suppressed: number;
  no_invite: number;
  frequency_blocked: number;
}

function emptyTotals(): Totals {
  return {
    requested: 0,
    would_send: 0,
    blocked_compliance: 0,
    suppressed: 0,
    no_invite: 0,
    frequency_blocked: 0,
  };
}

function computeTotals(resolved: ResolvedRecipient[]): Totals {
  const t = emptyTotals();
  t.requested = resolved.length;
  for (const r of resolved) {
    if (r.would_send) t.would_send += 1;
    // Independent counters (a recipient can fail multiple gates).
    if (!r.has_invite) t.no_invite += 1;
    if (!r.compliance_pass) t.blocked_compliance += 1;
    if (r.suppressed) t.suppressed += 1;
    if (!r.freq_ok) t.frequency_blocked += 1;
  }
  return t;
}
