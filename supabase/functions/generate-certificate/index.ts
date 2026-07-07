// generate-certificate: the ONLY certificate issuance path (doc 04, R1).
//
// Owned by docs/COI Module/coi-module/04-issuance-and-snapshots.md (Section 7).
// Implements the 12-step server-side golden path (Section 7.3): auth + staff +
// workspace gate; input + template validation; get_master_coi readiness gate
// (R6); insurer-letter cross-check (R7); holder-endorsement resolution
// (downgrade-only, R2/R3); server-side field_values build via the _shared/acord25
// Deno ports (05); preview_sha256 binding (R9); number reservation; fill via
// _shared/acord-fill.ts; hash; upload; finalize_certificate_issue transactional
// tail (Section 7.4); compensating storage cleanup on finalize failure.
//
// verify_jwt = true is set at deploy via config.toml. The function still calls
// requireAuth itself for the user object.
//
// The client NEVER sends limits, dates, carrier names, NAIC, endorsement
// statuses, field values, or pdf bytes: everything substantive is re-read here
// from DB truth (get_master_coi, resolve_holder_endorsements, holder + template
// rows). The client contributes only ids, selections, per-line print intent,
// free text, and the preview hash.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/error-handler.ts';
import { createLogger } from '../_shared/logger.ts';

import { buildAcord25FieldValues } from '../_shared/acord25/buildAcord25FieldValues.ts';
import { validateAcord25 } from '../_shared/acord25/validateAcord25.ts';
import { toAcord25BuildInput } from '../_shared/acord25/fromMasterCoi.ts';
import { hashFieldValuesForPreview } from '../_shared/acord25/previewHash.ts';
import {
  parseHolderRequirements,
  evaluateHolderRequirements,
} from '../_shared/acord25/requirements.ts';
import type { RequirementsEvaluation } from '../_shared/acord25/requirements.ts';
import {
  ACORD25_TEMPLATE_SHA256,
  ACORD25_FIELD_MAP,
} from '../_shared/acord25/fieldMap.ts';
import type {
  Acord25Issue,
  Acord25LineKey,
  Acord25TemplateInfo,
} from '../_shared/acord25/types.ts';
import type {
  COIInsurer,
  COILineAuto,
  COILineGL,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
  HolderEndorsementResolution,
  MasterCOI,
} from '../_shared/master-coi-types.ts';
import { fillAcord25Pdf } from '../_shared/acord-fill.ts';

const logger = createLogger('generate-certificate');

const ACORD_EDITION = 'ACORD 25 (2016/03)';
const CERT_BUCKET = 'coi-certificates';

type InsurerLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type LineKey = Acord25LineKey;

interface RequestLine {
  policy_id: string;
  line_key: LineKey;
  insurer_letter: InsurerLetter;
  per_line: { addl_insd: boolean; subr_wvd: boolean };
}

interface GenerateRequest {
  account_id: string;
  holder_id: string;
  lines: RequestLine[];
  description_of_operations: string;
  remarks?: string;
  preview_sha256: string;
  supersedes_certificate_id?: string;
  source_form_id?: string;
  // 07 §3.4 renewal cascade: mode 'reissue' derives holder/lines/DOO/remarks from the
  // source cert's snapshot (request omits them) and makes preview_sha256 optional.
  mode?: 'interactive' | 'reissue';
  reissue_of?: string;
  // 07 §4.4 holder-requirements override: the client's explicit acknowledgment that the
  // operator confirmed the failing-requirements dialog. The server re-runs the SAME
  // evaluation; this flag only decides whether the server records the override on its own
  // (also-failing) result. Advisory: requirement failures never 422.
  requirements_overridden?: boolean;
}

/** Per-line old-vs-new diff for a reissue (07 §3.4). */
interface DiffSummaryLine {
  line_key: string;
  effective_date: { old: string | null; new: string | null };
  expiration_date: { old: string | null; new: string | null };
  insurer_letter: { old: string | null; new: string | null };
  addl_insd: { old: string | null; new: string | null };
  subr_wvd: { old: string | null; new: string | null };
  limits: Record<string, { old: unknown; new: unknown }>;
  changed: boolean;
}

/** Structured 422 error carrying the per-line/per-code list. */
interface StructuredError {
  status: number;
  code: string;
  message: string;
  errors?: Array<{ line_key?: string; code?: string; message: string }>;
}

function isStructuredError(e: unknown): e is StructuredError {
  return typeof e === 'object' && e !== null && 'status' in e && 'message' in e;
}

function fail(
  status: number,
  code: string,
  message: string,
  errors?: StructuredError['errors'],
): StructuredError {
  return { status, code, message, errors };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function cellStr(cell: { v?: string | number | boolean | null } | null | undefined): string {
  const v = cell?.v;
  return typeof v === 'string' ? v : '';
}

function cellNum(cell: { v?: string | number | boolean | null } | null | undefined): number | null {
  const v = cell?.v;
  return typeof v === 'number' ? v : null;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function composeProducerAddress(mc: MasterCOI): string {
  const p = mc.producer;
  const cityState = [cellStr(p.city), cellStr(p.state)].filter((s) => s.length > 0).join(', ');
  const tail = [cityState, cellStr(p.zip)].filter((s) => s.length > 0).join(' ');
  return [cellStr(p.address_line1), cellStr(p.address_line2), tail]
    .filter((s) => s.trim().length > 0)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Snapshot line builders (04 Section 4). Built from get_master_coi truth.
// ---------------------------------------------------------------------------

interface SnapshotLine {
  line_key: LineKey;
  policy_id: string;
  policy_number: string;
  insurer_letter: InsurerLetter;
  effective_date: string;
  expiration_date: string;
  limits: Record<string, number | string | null>;
  addl_insd: 'Y' | 'N';
  addl_insd_intent: boolean;
  addl_insd_resolved: 'endorsed' | 'requested' | 'none';
  subr_wvd: 'Y' | 'N';
  subr_wvd_intent: boolean;
  subr_wvd_resolved: 'endorsed' | 'requested' | 'none';
  endorsement_basis: string | null;
}

function limitsForLine(mc: MasterCOI, line: LineKey): Record<string, number | string | null> {
  switch (line) {
    case 'gl': {
      const gl = mc.lines.gl as COILineGL;
      return {
        each_occurrence: cellNum(gl.limits.each_occurrence),
        damage_to_rented_premises: cellNum(gl.limits.damage_to_rented_premises),
        medical_expense: cellNum(gl.limits.medical_expense),
        personal_adv_injury: cellNum(gl.limits.personal_advertising_injury),
        general_aggregate: cellNum(gl.limits.general_aggregate),
        products_completed_ops: cellNum(gl.limits.products_completed_ops_aggregate),
      };
    }
    case 'auto': {
      const a = mc.lines.auto as COILineAuto;
      return {
        combined_single_limit: cellNum(a.csl),
        bi_per_person: cellNum(a.bi_per_person),
        bi_per_accident: cellNum(a.bi_per_accident),
        property_damage: cellNum(a.pd_per_accident),
      };
    }
    case 'umbrella': {
      const u = mc.lines.umbrella as COILineUmbrella;
      return {
        umbrella_each_occurrence: cellNum(u.each_occurrence),
        umbrella_aggregate: cellNum(u.aggregate),
      };
    }
    case 'wc': {
      const w = mc.lines.wc as COILineWC;
      return {
        el_each_accident: cellNum(w.el_each_accident),
        el_disease_each_employee: cellNum(w.el_disease_each_employee),
        el_disease_policy_limit: cellNum(w.el_disease_policy_limit),
      };
    }
    case 'property': {
      const p = mc.lines.property as COILineProperty;
      return {
        property_limit: cellNum(p.limit_amount),
        property_limit_description: cellStr(p.limit_description) || null,
      };
    }
    default:
      return {};
  }
}

interface LineCore {
  policy_id: string;
  policy_number: string;
  effective_date: string;
  expiration_date: string;
}

function lineCore(mc: MasterCOI, line: LineKey): LineCore | null {
  const base = (mc.lines as Record<string, unknown>)[line] as
    | {
        present: boolean;
        policy_id: string | null;
        policy_number: { v?: string | null };
        effective_date: { v?: string | null };
        expiration_date: { v?: string | null };
      }
    | undefined;
  if (!base || !base.present) {
    return null;
  }
  return {
    policy_id: base.policy_id ?? '',
    policy_number: cellStr(base.policy_number),
    effective_date: cellStr(base.effective_date),
    expiration_date: cellStr(base.expiration_date),
  };
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

async function handle(req: Request): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) {
    return preflight;
  }
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  // Service-role client for authoritative reads and all writes.
  const admin = createClient(supabaseUrl, serviceKey);

  // --- Step 1: auth + staff + workspace membership (403 on any failure) ------
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  let user: { id: string };
  try {
    user = await requireAuth(req, caller);
  } catch {
    return json(401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }

  try {
    // 07 §3.4 reissue mode: derive the selection from the source cert's snapshot
    // BEFORE validation, so the request may omit holder/lines/DOO/remarks. Every
    // server gate below (readiness 422, letter 422, endorsement 422, fill, finalize,
    // supersede chain) then runs identically to an interactive issue.
    let reissueSourceSnapshot: Record<string, unknown> | null = null;
    if (body.mode === 'reissue') {
      if (!body.reissue_of) {
        throw fail(422, 'VALIDATION_ERROR', 'reissue_of is required in reissue mode');
      }
      const { data: reStaff } = await caller.rpc('is_staff');
      if (reStaff !== true) {
        throw fail(403, 'FORBIDDEN', 'Staff access required');
      }
      const { data: src, error: srcErr } = await admin
        .from('certificates')
        .select('id, account_id, holder_id, status, superseded_by_id, snapshot')
        .eq('id', body.reissue_of)
        .maybeSingle();
      if (srcErr) {
        throw fail(500, 'INTERNAL_ERROR', `reissue source lookup failed: ${srcErr.message}`);
      }
      if (!src) {
        throw fail(404, 'NOT_FOUND', 'reissue source certificate not found');
      }
      if ((src.status !== 'issued' && src.status !== 'sent') || src.superseded_by_id) {
        throw fail(422, 'REISSUE_CONFLICT', `cannot reissue a ${src.status} certificate`);
      }
      const snap = (src.snapshot ?? {}) as Record<string, unknown>;
      reissueSourceSnapshot = snap;
      const snapLines = Array.isArray(snap.lines) ? (snap.lines as Array<Record<string, unknown>>) : [];
      body.account_id = src.account_id as string;
      body.holder_id = src.holder_id as string;
      body.lines = snapLines.map((sl) => ({
        policy_id: sl.policy_id as string,
        line_key: sl.line_key as LineKey,
        insurer_letter: sl.insurer_letter as InsurerLetter,
        per_line: {
          addl_insd: typeof sl.addl_insd_intent === 'boolean' ? sl.addl_insd_intent : sl.addl_insd === 'Y',
          subr_wvd: typeof sl.subr_wvd_intent === 'boolean' ? sl.subr_wvd_intent : sl.subr_wvd === 'Y',
        },
      }));
      body.description_of_operations =
        typeof snap.description_of_operations === 'string' ? snap.description_of_operations : '';
      body.remarks = typeof snap.remarks === 'string' ? snap.remarks : undefined;
      body.supersedes_certificate_id = body.reissue_of;
    }

    if (!body.account_id || !body.holder_id || !Array.isArray(body.lines) || body.lines.length === 0) {
      throw fail(422, 'VALIDATION_ERROR', 'account_id, holder_id, and at least one line are required');
    }
    // preview_sha256 is required in interactive mode (R9); optional in reissue mode
    // (07 §3.4: a reissue is verified by the diff gate, not the preview binding).
    if (body.mode !== 'reissue' && (typeof body.preview_sha256 !== 'string' || body.preview_sha256.length === 0)) {
      throw fail(422, 'VALIDATION_ERROR', 'preview_sha256 is required');
    }

    // Staff check (JWT-scoped so is_staff() sees the caller).
    const { data: isStaff, error: staffErr } = await caller.rpc('is_staff');
    if (staffErr || isStaff !== true) {
      throw fail(403, 'FORBIDDEN', 'Staff access required');
    }

    // --- Step 2: load + validate account, holder, policies, template --------
    const { data: account, error: acctErr } = await admin
      .from('accounts')
      .select('id, agency_workspace_id, merged_into_id')
      .eq('id', body.account_id)
      .maybeSingle();
    if (acctErr) {
      throw fail(500, 'INTERNAL_ERROR', `account lookup failed: ${acctErr.message}`);
    }
    if (!account) {
      throw fail(404, 'NOT_FOUND', 'account not found');
    }
    if (account.merged_into_id) {
      throw fail(422, 'ACCOUNT_MERGED', 'account has been merged; use the surviving account');
    }

    // Workspace membership (against the account's workspace).
    const { data: isMember, error: memberErr } = await caller.rpc('is_agency_member', {
      p_agency_id: account.agency_workspace_id,
    });
    if (memberErr || isMember !== true) {
      throw fail(403, 'FORBIDDEN', 'not a member of the account workspace');
    }

    const { data: holder, error: holderErr } = await admin
      .from('additional_insureds')
      .select('id, name, address_line1, city, state, zip_code, merged_into_id, agency_workspace_id')
      .eq('id', body.holder_id)
      .maybeSingle();
    if (holderErr) {
      throw fail(500, 'INTERNAL_ERROR', `holder lookup failed: ${holderErr.message}`);
    }
    if (!holder) {
      throw fail(404, 'NOT_FOUND', 'holder not found');
    }
    if (holder.merged_into_id) {
      throw fail(422, 'HOLDER_MERGED', 'holder has been merged; use the surviving holder');
    }
    // Tenant integrity: the holder must live in the same workspace as the account.
    // finalize_certificate_issue stamps the certificate workspace from the account,
    // so an out-of-workspace holder would produce a certificate whose holder_id and
    // agency_workspace_id disagree -- the divergence that lets holder-usage reads
    // straddle tenants. The membership check above only proves the account's
    // workspace; the caller (or a directly-crafted request) could still pass a
    // holder_id from another workspace, so reject it here. (Applies to reissue mode
    // too: body.holder_id is resolved from the source snapshot before this point.)
    if (holder.agency_workspace_id !== account.agency_workspace_id) {
      throw fail(422, 'HOLDER_WORKSPACE_MISMATCH',
        'holder belongs to a different workspace than the account');
    }

    const policyIds = body.lines.map((l) => l.policy_id);
    const { data: policyRows, error: polErr } = await admin
      .from('policies')
      .select('id, account_id, deleted_at')
      .in('id', policyIds);
    if (polErr) {
      throw fail(500, 'INTERNAL_ERROR', `policy lookup failed: ${polErr.message}`);
    }
    type PolicyRow = { id: string; account_id: string | null; deleted_at: string | null };
    const policyById = new Map<string, PolicyRow>(
      ((policyRows ?? []) as PolicyRow[]).map((p) => [p.id, p]),
    );
    for (const l of body.lines) {
      const p = policyById.get(l.policy_id);
      if (!p) {
        throw fail(422, 'POLICY_INVALID', `policy ${l.policy_id} not found`, [
          { line_key: l.line_key, message: `policy ${l.policy_id} not found` },
        ]);
      }
      if (p.account_id !== body.account_id) {
        throw fail(422, 'POLICY_INVALID', `policy ${l.policy_id} does not belong to this account`, [
          { line_key: l.line_key, message: 'policy does not belong to this account' },
        ]);
      }
      if (p.deleted_at) {
        throw fail(422, 'POLICY_INVALID', `policy ${l.policy_id} is deleted`, [
          { line_key: l.line_key, message: 'policy is deleted' },
        ]);
      }
    }

    // Current ACORD 25 template.
    const { data: template, error: tplErr } = await admin
      .from('acord_templates')
      .select('id, version, field_inventory')
      .eq('form_number', '25')
      .eq('is_current', true)
      .maybeSingle();
    if (tplErr) {
      throw fail(500, 'INTERNAL_ERROR', `template lookup failed: ${tplErr.message}`);
    }
    if (!template) {
      throw fail(422, 'NO_TEMPLATE', 'no current ACORD 25 template is onboarded');
    }

    // Fetch + hash the pinned blank template bytes (V9 pin, Section 7.3 step 2/6).
    const { data: tplBlob, error: dlErr } = await admin.storage
      .from('acord-templates')
      .download('25/2016-03/ACORD_25_Blank_Fillable.pdf');
    if (dlErr || !tplBlob) {
      throw fail(422, 'NO_TEMPLATE', 'ACORD 25 blank template file is unavailable');
    }
    const templateBytes = new Uint8Array(await tplBlob.arrayBuffer());
    const templateSha256 = await sha256Hex(templateBytes);
    if (templateSha256 !== ACORD25_TEMPLATE_SHA256) {
      throw fail(422, 'TEMPLATE_PIN_MISMATCH', 'ACORD 25 template bytes do not match the pinned edition');
    }

    // Supersede target validation (Section 7.3 step 2).
    let ancestorRevision = 0;
    if (body.supersedes_certificate_id) {
      const { data: ancestor, error: ancErr } = await admin
        .from('certificates')
        .select('id, status, superseded_by_id, revision')
        .eq('id', body.supersedes_certificate_id)
        .maybeSingle();
      if (ancErr) {
        throw fail(500, 'INTERNAL_ERROR', `supersede lookup failed: ${ancErr.message}`);
      }
      if (!ancestor) {
        throw fail(404, 'NOT_FOUND', 'supersede target not found');
      }
      if (ancestor.status !== 'issued' && ancestor.status !== 'sent') {
        throw fail(422, 'SUPERSEDE_CONFLICT', `supersede target is ${ancestor.status}`);
      }
      if (ancestor.superseded_by_id) {
        throw fail(422, 'SUPERSEDE_CONFLICT', 'supersede target is already superseded');
      }
      ancestorRevision = ancestor.revision ?? 0;
    }

    // --- Step 3: readiness gate (R6) via get_master_coi ----------------------
    const { data: masterCoiData, error: mcErr } = await admin.rpc('get_master_coi', {
      p_account_id: body.account_id,
      p_policy_ids: policyIds,
    });
    if (mcErr || !masterCoiData) {
      throw fail(500, 'INTERNAL_ERROR', `get_master_coi failed: ${mcErr?.message ?? 'no data'}`);
    }
    const mc = masterCoiData as unknown as MasterCOI;
    const asOf = new Date().toISOString();
    const selectedLineKeys = new Set(body.lines.map((l) => l.line_key));

    // Blockers scoped to selected lines (or line-less blockers like no_lines /
    // insurer_overflow) are 422. policy_expired is a blocker, never a warning.
    const blockerErrors: StructuredError['errors'] = [];
    for (const b of mc.readiness.blockers) {
      if (!b.line || selectedLineKeys.has(b.line as LineKey)) {
        blockerErrors.push({ line_key: b.line, code: b.code, message: b.message });
      }
    }
    if (blockerErrors.length > 0) {
      throw fail(422, 'NOT_READY', 'Master COI is not ready for issuance', blockerErrors);
    }

    // Collect the ONLY warning: lines expiring within 30 days.
    const warnings: string[] = [];
    for (const w of mc.readiness.warnings) {
      if (w.code === 'policy_expiring_soon' && (!w.line || selectedLineKeys.has(w.line as LineKey))) {
        warnings.push(w.message);
      }
    }

    // --- Step 4: insurer-letter cross-check (R7) -----------------------------
    // Build line -> letter map from get_master_coi (the single letter authority).
    const letterByLine = new Map<LineKey, InsurerLetter>();
    const insurerByLetter = new Map<InsurerLetter, COIInsurer>();
    for (const ins of mc.insurers) {
      insurerByLetter.set(ins.letter as InsurerLetter, ins);
      for (const ln of ins.lines) {
        letterByLine.set(ln as LineKey, ins.letter as InsurerLetter);
      }
    }
    const letterMismatches: StructuredError['errors'] = [];
    for (const l of body.lines) {
      const expected = letterByLine.get(l.line_key);
      if (!expected) {
        letterMismatches.push({
          line_key: l.line_key,
          message: `no insurer letter is assigned to ${l.line_key} in Master COI`,
        });
      } else if (body.mode === 'reissue') {
        // Reissue ADOPTS the current insurer letter: a renewal or policy edit may have
        // regrouped carriers, and there is no client-displayed letter to cross-check
        // against (the line came from the stale source snapshot). The freshly built
        // snapshot must print the CURRENT letter, so overwrite rather than 422.
        l.insurer_letter = expected;
      } else if (expected !== l.insurer_letter) {
        letterMismatches.push({
          line_key: l.line_key,
          message: `insurer letter mismatch on ${l.line_key}: expected ${expected}, got ${l.insurer_letter}`,
        });
      }
    }
    if (letterMismatches.length > 0) {
      throw fail(422, 'LETTER_MISMATCH', 'preview is stale, re-open the generator', letterMismatches);
    }

    // --- Step 5: holder-endorsement resolution (R2, R3) ----------------------
    const { data: resolutionData, error: resErr } = await admin.rpc('resolve_holder_endorsements', {
      p_account_id: body.account_id,
      p_holder_id: body.holder_id,
      p_policy_ids: policyIds,
    });
    if (resErr) {
      throw fail(500, 'INTERNAL_ERROR', `resolve_holder_endorsements failed: ${resErr.message}`);
    }
    const resolutions = (resolutionData ?? []) as unknown as HolderEndorsementResolution[];
    const resByLine = new Map<string, HolderEndorsementResolution>();
    for (const r of resolutions) {
      resByLine.set(r.line_key as string, r);
    }

    const intentErrors: StructuredError['errors'] = [];
    const printFlags = new Map<
      LineKey,
      {
        addl: 'Y' | 'N';
        addlResolved: 'endorsed' | 'requested' | 'none';
        subr: 'Y' | 'N';
        subrResolved: 'endorsed' | 'requested' | 'none';
        basis: string | null;
      }
    >();
    for (const l of body.lines) {
      const r = resByLine.get(l.line_key);
      const addlResolved = (r?.addl_insd_resolved ?? 'none') as 'endorsed' | 'requested' | 'none';
      const subrResolved = (r?.subr_wvd_resolved ?? 'none') as 'endorsed' | 'requested' | 'none';

      let addl: 'Y' | 'N' = 'N';
      if (l.per_line.addl_insd) {
        if (addlResolved === 'endorsed') {
          addl = 'Y';
        } else {
          intentErrors.push({
            line_key: l.line_key,
            message: `holder is not endorsed for additional insured on ${l.line_key}`,
          });
        }
      }

      let subr: 'Y' | 'N' = 'N';
      if (l.per_line.subr_wvd) {
        if (subrResolved === 'endorsed') {
          subr = 'Y';
        } else {
          intentErrors.push({
            line_key: l.line_key,
            message: `holder has no confirmed waiver of subrogation on ${l.line_key}`,
          });
        }
      }

      const basis = r && r.basis ? JSON.stringify(r.basis) : null;
      printFlags.set(l.line_key, { addl, addlResolved, subr, subrResolved, basis });
    }
    if (intentErrors.length > 0) {
      throw fail(422, 'ENDORSEMENT_NOT_PERMITTED', 'cannot print Y for an unconfirmed endorsement', intentErrors);
    }

    // --- Step 5b: holder-requirements re-evaluation (07 §4.4) -----------------
    // Advisory, never a hard block: the server re-runs the SAME shared pure evaluation
    // the client ran (evaluateHolderRequirements) against the SERVER's master COI, the
    // selected line keys, and the holder-resolved endorsement rows, so the snapshot
    // records the SERVER's pass/fail set, not the client's claim. Requirement failures
    // never 422 (only the six correctness blockers do). When the server's own result
    // fails AND the client acknowledged the override, we mark it overridden and, after
    // finalize, log a 'requirements_overridden' event.
    const { data: reqData, error: reqErr } = await admin.rpc('get_additional_insured_requirements', {
      p_id: body.holder_id,
    });
    if (reqErr) {
      throw fail(500, 'INTERNAL_ERROR', `get_additional_insured_requirements failed: ${reqErr.message}`);
    }
    const reqRow = Array.isArray(reqData) ? reqData[0] : reqData;
    const holderRequirements = parseHolderRequirements(
      (reqRow as { requirements?: unknown } | null)?.requirements ?? null,
    );
    const requirementsEvaluation: RequirementsEvaluation = evaluateHolderRequirements({
      requirements: holderRequirements,
      masterCoi: mc,
      selectedLineKeys: [...selectedLineKeys] as LineKey[],
      // Map get_master_coi's resolution rows to the evaluator's row shape; basis is
      // stringified so required_endorsement_forms substring matching can find a form name.
      holderResolution: resolutions.map((r) => ({
        line_key: r.line_key as string,
        addl_insd_resolved: r.addl_insd_resolved as string,
        subr_wvd_resolved: r.subr_wvd_resolved as string,
        basis: r.basis != null ? JSON.stringify(r.basis) : null,
      })),
    });
    const requirementsOverridden =
      requirementsEvaluation.has_requirements &&
      !requirementsEvaluation.all_pass &&
      body.requirements_overridden === true;
    if (requirementsOverridden) {
      requirementsEvaluation.overridden = true;
      requirementsEvaluation.overridden_by = user.id;
    }

    // --- Step 6: build field_values via the 05 Deno ports --------------------
    const holderAddressLines = composeHolderAddress(holder);
    const certDate = formatIssueDate(asOf);

    // Per-line print intents keyed for fromMasterCoi (downgrade-only already
    // enforced above; here we pass the intent booleans through).
    const printIntents: Partial<Record<LineKey, { addlInsd: boolean; subrWvd: boolean }>> = {};
    for (const l of body.lines) {
      const f = printFlags.get(l.line_key)!;
      printIntents[l.line_key] = { addlInsd: f.addl === 'Y', subrWvd: f.subr === 'Y' };
    }

    // Custom write-in coverages for the selected (line, policy) pairs
    // (policy_additional_coverages). Ordered by created_at so this server rebuild
    // matches the client preview byte-for-byte (preview-hash gate R9).
    const selectedLinePolicyPairs = new Set(
      body.lines.map((l) => `${l.line_key}|${l.policy_id}`),
    );
    const additionalCoverages: Array<{
      line: LineKey;
      name: string;
      amount: number | null;
    }> = [];
    {
      const { data: acRows, error: acErr } = await admin
        .from('policy_additional_coverages')
        .select('policy_id, line, name, amount')
        .in('policy_id', policyIds)
        .order('created_at', { ascending: true });
      if (acErr) {
        throw fail(
          500,
          'INTERNAL_ERROR',
          `additional coverages read failed: ${acErr.message}`,
        );
      }
      for (const r of (acRows ?? []) as Array<{
        policy_id: string;
        line: string;
        name: string;
        amount: number | null;
      }>) {
        if (selectedLinePolicyPairs.has(`${r.line}|${r.policy_id}`)) {
          additionalCoverages.push({
            line: r.line as LineKey,
            name: r.name,
            amount: r.amount,
          });
        }
      }
    }

    const buildInput = toAcord25BuildInput({
      masterCoi: mc,
      selectedLines: [...selectedLineKeys] as LineKey[],
      holder: { name: holder.name ?? '', addressLines: holderAddressLines },
      holderResolution: resolutions,
      printIntents,
      descriptionOfOperations: body.description_of_operations ?? '',
      remarks: body.remarks ?? '',
      additionalCoverages,
      certificateDate: certDate,
      certificateNumber: null, // reserved later; header field excluded from preview hash
      authorizedRepName: cellStr(mc.producer.contact_name),
    });

    const build = buildAcord25FieldValues(buildInput);

    const templateInfo: Acord25TemplateInfo = {
      version: template.version ?? '2016-03',
      field_inventory: (template.field_inventory ?? []) as Acord25TemplateInfo['field_inventory'],
    };
    const validation = validateAcord25(build, {
      mode: 'issue',
      template: templateInfo,
      templateSha256,
    });
    if (!validation.valid) {
      throw fail(422, 'VALIDATION_FAILED', 'certificate validation failed', validationIssuesToErrors(validation.issues));
    }

    // --- Step 7: preview binding (R9) ----------------------------------------
    // Skipped in reissue mode: there is no interactive preview to bind to; the reissue
    // is verified by the diff_summary gate the caller confirms (07 §3.4).
    if (body.mode !== 'reissue') {
      const serverPreviewHash = await hashFieldValuesForPreview(build.fieldValues);
      if (serverPreviewHash !== body.preview_sha256) {
        throw fail(409, 'PREVIEW_MISMATCH', 'data changed since preview, re-preview required');
      }
    }

    // --- Step 8: reserve identity --------------------------------------------
    const { data: reservedNumber, error: numErr } = await admin.rpc('next_certificate_number');
    if (numErr || typeof reservedNumber !== 'string') {
      throw fail(500, 'INTERNAL_ERROR', `number reservation failed: ${numErr?.message ?? 'no number'}`);
    }
    const certificateNumber = reservedNumber;
    const certificateId = crypto.randomUUID();
    const revision = body.supersedes_certificate_id ? ancestorRevision + 1 : 0;

    // Inject number + revision into the header fields of field_values (excluded
    // from the preview hash by PREVIEW_HASH_EXCLUDED_FIELDS, so no 409).
    const numberField = ACORD25_FIELD_MAP.certificateNumber?.pdfField;
    const revisionField = ACORD25_FIELD_MAP.revisionNumber?.pdfField;
    const fieldValues: Record<string, string | boolean> = { ...build.fieldValues };
    if (numberField) {
      fieldValues[numberField] = certificateNumber;
    }
    if (revisionField) {
      fieldValues[revisionField] = revision > 0 ? String(revision) : '';
    }

    // --- Build the immutable snapshot (04 Section 4) --------------------------
    const snapshot = buildSnapshot({
      mc,
      certificateNumber,
      revision,
      templateId: template.id,
      templateVersion: template.version ?? '2016-03',
      templatePdfSha256: templateSha256,
      fieldValues,
      body,
      holder,
      printFlags,
      insurerByLetter,
      asOf,
      // 07 §4.4 / E4: embed the SERVER's requirements evaluation ONLY when the holder
      // actually has requirements, so a holder with none produces no snapshot key.
      requirementsEvaluation: requirementsEvaluation.has_requirements ? requirementsEvaluation : null,
    });

    // Reissue diff (07 §3.4): per-line old-vs-new so the batch/inline UI can show
    // and require confirmation of what changed since the superseded certificate.
    const diffSummary = reissueSourceSnapshot
      ? computeDiffSummary(reissueSourceSnapshot, snapshot)
      : undefined;

    // --- Step 9: fill + hash -------------------------------------------------
    const fill = await fillAcord25Pdf(templateBytes, fieldValues);
    if (!fill.success || !fill.pdfBytes) {
      throw fail(422, 'FILL_FAILED', 'PDF fill failed', [
        { message: fill.errors.join('; ') || 'fill produced no bytes' },
      ]);
    }
    // Post-fill assertion (doc 04 Section 7.3): a template-absent field or any
    // fill error is a hard failure. Intentionally-empty values (skippedFields
    // but not missingFields) are normal for a totally-mapped field_values.
    if (fill.missingFields.length > 0 || fill.errors.length > 0) {
      throw fail(422, 'FILL_FAILED', 'PDF fill produced missing fields or errors', [
        { message: [...fill.errors, ...fill.missingFields.map((f) => `missing: ${f}`)].join('; ') },
      ]);
    }

    const pdfBytes = fill.pdfBytes;
    const pdfSha256 = await sha256Hex(pdfBytes);
    const snapshotJson = JSON.stringify(snapshot);
    const snapshotSha256 = await sha256Hex(new TextEncoder().encode(snapshotJson));

    // --- Step 10: upload (upsert:false, retry once -> 502) -------------------
    const storagePath = `${body.account_id}/${certificateId}/${certificateNumber}.pdf`;
    const uploaded = await uploadWithRetry(admin, storagePath, pdfBytes);
    if (!uploaded) {
      throw fail(502, 'UPLOAD_FAILED', 'certificate storage upload failed');
    }

    // --- Documents pointer name/filename (04 Section 6.1) --------------------
    const isoDate = asOf.slice(0, 10);
    const docTitle = `ACORD 25 - ${holder.name ?? 'Holder'} - ${isoDate} - ${certificateNumber}.pdf`;
    const representativePolicyId = pickRepresentativePolicy(body);

    // --- Step 11: finalize (transactional tail), compensate on error ---------
    const { data: finalizeData, error: finalizeErr } = await admin.rpc('finalize_certificate_issue', {
      p_certificate_id: certificateId,
      p_account_id: body.account_id,
      p_holder_id: body.holder_id,
      p_template_id: template.id,
      p_template_version: template.version ?? '2016-03',
      p_acord_edition: ACORD_EDITION,
      p_certificate_number: certificateNumber,
      p_revision: revision,
      p_snapshot: snapshot,
      p_snapshot_sha256: snapshotSha256,
      p_pdf_sha256: pdfSha256,
      p_storage_bucket: CERT_BUCKET,
      p_storage_path: storagePath,
      p_size_bytes: pdfBytes.byteLength,
      p_issued_by: user.id,
      p_lines: body.lines.map((l) => ({
        policy_id: l.policy_id,
        line_key: l.line_key,
        insurer_letter: l.insurer_letter,
      })),
      p_document_name: docTitle,
      p_document_filename: docTitle,
      p_representative_policy_id: representativePolicyId,
      p_source_form_id: body.source_form_id ?? null,
      p_supersedes_id: body.supersedes_certificate_id ?? null,
    });
    if (finalizeErr) {
      // Compensating cleanup: remove the just-uploaded object.
      const { error: rmErr } = await admin.storage.from(CERT_BUCKET).remove([storagePath]);
      if (rmErr) {
        logger.error('orphaned certificate object after finalize failure', undefined, {
          storage_path: storagePath,
          certificate_number: certificateNumber,
          finalize_error: finalizeErr.message,
        });
      }
      throw fail(500, 'FINALIZE_FAILED', `finalize failed: ${finalizeErr.message}`);
    }

    const finalizeRow = Array.isArray(finalizeData) ? finalizeData[0] : finalizeData;
    const documentId = finalizeRow?.document_id ?? null;

    // 07 §4.4: log the override once the certificate row exists (the fill-workspace
    // trigger copies agency_workspace_id from the parent). Advisory: a failure to log
    // must not fail an already-persisted issuance, so we only warn on error.
    if (requirementsOverridden) {
      const { error: overrideEventErr } = await admin.from('certificate_events').insert({
        certificate_id: certificateId,
        action: 'requirements_overridden',
        actor_id: user.id,
        metadata: {
          failure_count: requirementsEvaluation.failure_count,
          failures: requirementsEvaluation.results
            .filter((r) => r.severity === 'fail' && !r.pass)
            .map((r) => ({
              kind: r.kind,
              line_key: r.line_key ?? null,
              field: r.field ?? null,
              label: r.label,
              expected: r.expected,
              actual: r.actual,
              message: r.message,
            })),
        },
      });
      if (overrideEventErr) {
        logger.warn('failed to log requirements_overridden event', {
          certificate_id: certificateId,
          certificate_number: certificateNumber,
          error: overrideEventErr.message,
        });
      }
    }

    // --- Step 12: signed URL + response --------------------------------------
    const { data: signed, error: signErr } = await admin.storage
      .from(CERT_BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (signErr || !signed?.signedUrl) {
      // The certificate is fully persisted; a signed-URL hiccup should not 500
      // the whole issuance. Return without a URL so the client can refetch.
      logger.warn('signed URL generation failed after issuance', {
        storage_path: storagePath,
        error: signErr?.message,
      });
    }

    return json(200, {
      certificate_id: certificateId,
      certificate_number: certificateNumber,
      signed_url: signed?.signedUrl ?? '',
      document_id: documentId,
      warnings,
      ...(diffSummary && { diff_summary: diffSummary }),
    });
  } catch (error) {
    if (isStructuredError(error)) {
      return json(error.status, {
        error: { code: error.code, message: error.message, ...(error.errors && { errors: error.errors }) },
      });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('generate-certificate failed', error instanceof Error ? error : new Error(message));
    return json(500, { error: { code: 'INTERNAL_ERROR', message } });
  }
}

// ---------------------------------------------------------------------------
// Snapshot builder (04 Section 4)
// ---------------------------------------------------------------------------

function buildSnapshot(args: {
  mc: MasterCOI;
  certificateNumber: string;
  revision: number;
  templateId: string;
  templateVersion: string;
  templatePdfSha256: string;
  fieldValues: Record<string, string | boolean>;
  body: GenerateRequest;
  holder: { id: string; name: string | null; address_line1: string | null; city: string | null; state: string | null; zip_code: string | null };
  printFlags: Map<
    LineKey,
    { addl: 'Y' | 'N'; addlResolved: 'endorsed' | 'requested' | 'none'; subr: 'Y' | 'N'; subrResolved: 'endorsed' | 'requested' | 'none'; basis: string | null }
  >;
  insurerByLetter: Map<InsurerLetter, COIInsurer>;
  asOf: string;
  /** 07 §4.4: embedded only when the holder has requirements (E4); null otherwise. */
  requirementsEvaluation: RequirementsEvaluation | null;
}): Record<string, unknown> {
  const { mc, body } = args;

  const lines: SnapshotLine[] = [];
  for (const l of body.lines) {
    const core = lineCore(mc, l.line_key);
    const flags = args.printFlags.get(l.line_key)!;
    lines.push({
      line_key: l.line_key,
      policy_id: l.policy_id,
      policy_number: core?.policy_number ?? '',
      insurer_letter: l.insurer_letter,
      effective_date: core?.effective_date ?? '',
      expiration_date: core?.expiration_date ?? '',
      limits: limitsForLine(mc, l.line_key),
      addl_insd: flags.addl,
      addl_insd_intent: l.per_line.addl_insd,
      addl_insd_resolved: flags.addlResolved,
      subr_wvd: flags.subr,
      subr_wvd_intent: l.per_line.subr_wvd,
      subr_wvd_resolved: flags.subrResolved,
      endorsement_basis: flags.basis,
    });
  }

  const insurers: Record<string, { carrier_id: string | null; name: string; naic: string | null }> = {};
  for (const [letter, ins] of args.insurerByLetter) {
    insurers[letter] = {
      carrier_id: ins.carrier_id ?? null,
      name: cellStr(ins.name),
      naic: cellStr(ins.naic) || null,
    };
  }

  return {
    snapshot_version: 1,
    certificate_number: args.certificateNumber,
    revision: args.revision,
    form: {
      form_number: '25',
      template_id: args.templateId,
      template_version: args.templateVersion,
      acord_edition: ACORD_EDITION,
      template_pdf_sha256: args.templatePdfSha256,
    },
    field_values: args.fieldValues,
    producer: {
      name: cellStr(mc.producer.name),
      address: composeProducerAddress(mc),
      phone: cellStr(mc.producer.phone),
      email: cellStr(mc.producer.email),
    },
    insured: {
      account_id: mc.account_id,
      name: cellStr(mc.named_insured.name),
      dba: cellStr(mc.named_insured.dba) || null,
      address: {
        line1: cellStr(mc.named_insured.address_line1),
        city: cellStr(mc.named_insured.city),
        state: cellStr(mc.named_insured.state),
        zip: cellStr(mc.named_insured.zip),
      },
    },
    insurers,
    lines,
    holder: {
      additional_insured_id: args.holder.id,
      name: args.holder.name ?? '',
      address: {
        line1: args.holder.address_line1 ?? '',
        city: args.holder.city ?? '',
        state: args.holder.state ?? '',
        zip: args.holder.zip_code ?? '',
      },
    },
    description_of_operations: body.description_of_operations ?? '',
    remarks: body.remarks ?? null,
    master_coi: {
      as_of: args.asOf,
      source: 'master_coi',
    },
    // 07 §4.4 / E4: present ONLY when the holder has requirements. Records the SERVER's
    // full pass/fail set plus overridden/overridden_by, inside the hashed snapshot.
    ...(args.requirementsEvaluation
      ? { requirements_evaluation: args.requirementsEvaluation }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function composeHolderAddress(holder: {
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}): string[] {
  const out: string[] = [];
  if (holder.address_line1 && holder.address_line1.trim().length > 0) {
    out.push(holder.address_line1.trim());
  }
  const cityState = [holder.city ?? '', holder.state ?? ''].filter((s) => s.trim().length > 0).join(', ');
  const tail = [cityState, (holder.zip_code ?? '').trim()].filter((s) => s.length > 0).join(' ');
  if (tail.length > 0) {
    out.push(tail);
  }
  return out;
}

/** ISO timestamp -> 'YYYY-MM-DD' (the certificateDate the builder formats). */
function formatIssueDate(iso: string): string {
  return iso.slice(0, 10);
}

function validationIssuesToErrors(issues: Acord25Issue[]): StructuredError['errors'] {
  return issues
    .filter((i) => i.severity === 'error')
    .map((i) => ({ line_key: i.lineKey, code: i.code, message: i.message }));
}

function pickRepresentativePolicy(body: GenerateRequest): string | null {
  const gl = body.lines.find((l) => l.line_key === 'gl');
  if (gl) {
    return gl.policy_id;
  }
  return body.lines[0]?.policy_id ?? null;
}

/**
 * Per-line old-vs-new diff between the superseded cert's snapshot and the freshly
 * built one, for the reissue confirm gate (07 §3.4). Matches lines by line_key and
 * compares printed dates, insurer letter, ADDL INSD / SUBR WVD, and each limit.
 */
function computeDiffSummary(
  oldSnap: Record<string, unknown>,
  newSnap: Record<string, unknown>,
): DiffSummaryLine[] {
  const asLines = (s: Record<string, unknown>): Array<Record<string, unknown>> =>
    Array.isArray(s.lines) ? (s.lines as Array<Record<string, unknown>>) : [];
  const byKey = (ls: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> => {
    const m = new Map<string, Record<string, unknown>>();
    for (const l of ls) m.set(String(l.line_key), l);
    return m;
  };
  const oldMap = byKey(asLines(oldSnap));
  const newMap = byKey(asLines(newSnap));
  const strOrNull = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
  const out: DiffSummaryLine[] = [];
  for (const k of new Set<string>([...oldMap.keys(), ...newMap.keys()])) {
    const o = oldMap.get(k) ?? {};
    const n = newMap.get(k) ?? {};
    const oLimits = (o.limits as Record<string, unknown>) ?? {};
    const nLimits = (n.limits as Record<string, unknown>) ?? {};
    const limits: Record<string, { old: unknown; new: unknown }> = {};
    let limitsChanged = false;
    for (const lk of new Set<string>([...Object.keys(oLimits), ...Object.keys(nLimits)])) {
      const ov = oLimits[lk] ?? null;
      const nv = nLimits[lk] ?? null;
      limits[lk] = { old: ov, new: nv };
      if (JSON.stringify(ov) !== JSON.stringify(nv)) limitsChanged = true;
    }
    const line: DiffSummaryLine = {
      line_key: k,
      effective_date: { old: strOrNull(o.effective_date), new: strOrNull(n.effective_date) },
      expiration_date: { old: strOrNull(o.expiration_date), new: strOrNull(n.expiration_date) },
      insurer_letter: { old: strOrNull(o.insurer_letter), new: strOrNull(n.insurer_letter) },
      addl_insd: { old: strOrNull(o.addl_insd), new: strOrNull(n.addl_insd) },
      subr_wvd: { old: strOrNull(o.subr_wvd), new: strOrNull(n.subr_wvd) },
      limits,
      changed: false,
    };
    line.changed =
      line.effective_date.old !== line.effective_date.new ||
      line.expiration_date.old !== line.expiration_date.new ||
      line.insurer_letter.old !== line.insurer_letter.new ||
      line.addl_insd.old !== line.addl_insd.new ||
      line.subr_wvd.old !== line.subr_wvd.new ||
      limitsChanged;
    out.push(line);
  }
  return out;
}

async function uploadWithRetry(
  admin: SupabaseClient,
  path: string,
  bytes: Uint8Array,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin.storage.from(CERT_BUCKET).upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (!error) {
      return true;
    }
    logger.warn('certificate upload attempt failed', { path, attempt, error: error.message });
  }
  return false;
}

Deno.serve(handle);
