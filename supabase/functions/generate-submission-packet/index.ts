// generate-submission-packet: the GL submission-packet fill pipeline
// (Commercial Lines SOW v3, Phase 1b).
//
// submission data -> branded cover page + filled ACORD 125 + 126 -> flattened,
// merged (cover, 125, 126), stored, signed URL.
// Clones the generate-certificate issuance conventions: staff auth
// + workspace gate, template download with byte pin, server-side field_values
// build via the _shared Deno ports, fill via _shared/acord-fill.ts, upload with
// retry + compensating cleanup, createSignedUrl(3600).
//
// verify_jwt = true is set at deploy via config.toml. The function still calls
// requireAuth itself for the user object.
//
// The client sends ONLY { submission_id }: everything substantive is re-read
// here from DB truth (commercial_submissions, accounts, commercial_profiles,
// commercial_locations, and the remarket source policy's cgl_details) via the
// service client, after the caller's staff + workspace membership is proven.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import type { PDFFont } from 'https://esm.sh/pdf-lib@1.17.1';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { fillAcord25Pdf } from '../_shared/acord-fill.ts';

import { buildAcord125InputFromRiskStore } from '../_shared/acord125/fromRiskStore.ts';
import { buildAcord125FieldValues } from '../_shared/acord125/buildAcord125FieldValues.ts';
import { validateAcord125 } from '../_shared/acord125/validateAcord125.ts';
import type { RiskStoreGlLimits } from '../_shared/acord126/fromRiskStore.ts';
import { buildAcord126InputFromRiskStore } from '../_shared/acord126/fromRiskStore.ts';
import { buildAcord126FieldValues } from '../_shared/acord126/buildAcord126FieldValues.ts';
import { validateAcord126 } from '../_shared/acord126/validateAcord126.ts';

const logger = createLogger('generate-submission-packet');

const PACKET_BUCKET = 'submission-packets';
const TEMPLATE_BUCKET = 'acord-templates';

/** The pinned blank templates (byte-exact, the V9 / TEMPLATE_PIN pattern). */
const TEMPLATES = {
  '125': {
    path: '125/2016-03/ACORD_125_2016-03.pdf',
    sha256: '6d685e5b13f4bd0d83bc60ed30d214296494e45f5067f30a3158a55021bcab60',
  },
  '126': {
    path: '126/2009-08/ACORD_126_2009-08.pdf',
    sha256: '1c9f49d8fef9647658ec9c3c68eb04d2977f793aa39929109052642e9051039b',
  },
} as const;

/** Closed submission statuses: no packet regeneration on a settled file. */
const CLOSED_STATUSES = ['bound', 'lost', 'abandoned'];

interface GeneratePacketRequest {
  submission_id: string;
}

/** One validation/build issue, tagged with the form it came from. */
interface PacketIssue {
  form: '125' | '126';
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Structured error carrying the HTTP status and optional issue list. */
interface StructuredError {
  status: number;
  code: string;
  message: string;
  issues?: PacketIssue[];
}

function isStructuredError(e: unknown): e is StructuredError {
  return typeof e === 'object' && e !== null && 'status' in e && 'message' in e;
}

function fail(status: number, code: string, message: string, issues?: PacketIssue[]): StructuredError {
  return { status, code, message, issues };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function numOrNull(v: unknown): number | null {
  // cgl_details.limits values arrive as numbers OR numeric strings (manual
  // saves and extraction both write strings sometimes; the Bound-terms diff
  // has the same duality) - coerce, never drop a real limit (review fix).
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[$,\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

async function uploadWithRetry(
  admin: SupabaseClient,
  path: string,
  bytes: Uint8Array,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin.storage.from(PACKET_BUCKET).upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (!error) {
      return true;
    }
    logger.warn('packet upload attempt failed', { path, attempt, error: error.message });
  }
  return false;
}

/** Download a pinned blank and enforce the byte pin (422 on any mismatch). */
async function downloadPinnedTemplate(
  admin: SupabaseClient,
  form: '125' | '126',
): Promise<Uint8Array> {
  const spec = TEMPLATES[form];
  const { data: blob, error } = await admin.storage.from(TEMPLATE_BUCKET).download(spec.path);
  if (error || !blob) {
    throw fail(422, 'NO_TEMPLATE', `ACORD ${form} blank template file is unavailable`);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha = await sha256Hex(bytes);
  if (sha !== spec.sha256) {
    throw fail(
      422,
      'TEMPLATE_PIN_MISMATCH',
      `ACORD ${form} template bytes do not match the pinned edition`,
    );
  }
  return bytes;
}

/** Fill one form and enforce the post-fill assertions (generate-certificate). */
async function fillOrFail(
  form: '125' | '126',
  templateBytes: Uint8Array,
  fieldValues: Record<string, string | boolean>,
): Promise<Uint8Array> {
  const fill = await fillAcord25Pdf(templateBytes, fieldValues);
  if (!fill.success || !fill.pdfBytes) {
    throw fail(422, 'FILL_FAILED', `ACORD ${form} PDF fill failed`, [
      {
        form,
        code: 'FILL_FAILED',
        severity: 'error',
        message: fill.errors.join('; ') || 'fill produced no bytes',
      },
    ]);
  }
  // A template-absent field or any fill error is a hard failure; intentionally
  // empty values (skippedFields but not missingFields) are normal for a
  // totally-mapped field_values.
  if (fill.missingFields.length > 0 || fill.errors.length > 0) {
    throw fail(422, 'FILL_FAILED', `ACORD ${form} fill produced missing fields or errors`, [
      {
        form,
        code: 'FILL_FAILED',
        severity: 'error',
        message: [...fill.errors, ...fill.missingFields.map((f) => `missing: ${f}`)].join('; '),
      },
    ]);
  }
  return fill.pdfBytes;
}

// ---------------------------------------------------------------------------
// Cover page (generated, not template-filled)
// ---------------------------------------------------------------------------
// A branded first page drawn directly with pdf-lib on US Letter. Typography is
// Helvetica + Helvetica-Bold only, black plus ONE gray, sizes 9-22, generous
// whitespace - no other colors, no rules borrowed from the ACORD blanks.

const COVER_BLACK = rgb(0, 0, 0);
const COVER_GRAY = rgb(0.45, 0.45, 0.45);

/** target_lines vocabulary -> the cover page's formal line labels. */
const COVER_LINE_LABELS: Record<string, string> = {
  gl: 'General Liability',
  property: 'Commercial Property',
  wc: 'Workers Compensation',
  umbrella: 'Commercial Umbrella / Excess',
  auto: 'Business Auto',
};

/** 'YYYY-MM-DD' -> 'MM/DD/YYYY' (string slice only; '' when not ISO). */
function isoToUsDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[2]}/${m[3]}/${m[1]}` : '';
}

/**
 * The standard-14 Helvetica encodes WinAnsi (Latin-1) only; drawText throws on
 * anything outside it. DB-sourced names occasionally carry stray unicode, so
 * clamp instead of failing the whole packet.
 */
function winAnsiSafe(text: string): string {
  return text.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');
}

/** Greedy word wrap by measured width (a too-long single word gets its own line). */
function wrapCoverText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

interface CoverPageData {
  /** Header: the agency (producer) name. */
  agencyName: string;
  /** Insured legal name resolved by the built 125 input. */
  applicant: string;
  /** Formal line labels, in target_lines order. */
  linesRequested: string[];
  /** 'MM/DD/YYYY' or '' (prints TBD when empty). */
  effectiveDateUs: string;
  /** Free-text market; the row is omitted when empty. */
  wholesalerName: string;
  /** Producer phone/email for the footer contact line (either may be ''). */
  producerPhone: string;
  producerEmail: string;
  /** 'MM/DD/YYYY' ET business day, same clock as the form completion date. */
  generatedUs: string;
}

/** Prepend the branded cover as the merged packet's first page. */
async function addCoverPage(merged: PDFDocument, data: CoverPageData): Promise<void> {
  const helvetica = await merged.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await merged.embedFont(StandardFonts.HelveticaBold);
  const page = merged.addPage([612, 792]); // US Letter portrait
  const marginX = 72;
  const labelX = marginX;
  const valueX = 216;
  const valueWidth = 612 - marginX - valueX;

  // Header: agency name + a hairline rule.
  page.drawText(winAnsiSafe(data.agencyName), {
    x: marginX, y: 718, size: 11, font: helveticaBold, color: COVER_BLACK,
  });
  page.drawLine({
    start: { x: marginX, y: 708 }, end: { x: 612 - marginX, y: 708 },
    thickness: 0.5, color: COVER_GRAY,
  });

  // Title.
  page.drawText('COMMERCIAL INSURANCE SUBMISSION', {
    x: marginX, y: 632, size: 22, font: helveticaBold, color: COVER_BLACK,
  });

  // Details block: gray uppercase labels, black values, wrapped to the column.
  let y = 572;
  const drawRow = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), {
      x: labelX, y, size: 9, font: helveticaBold, color: COVER_GRAY,
    });
    const lines = wrapCoverText(winAnsiSafe(value), helvetica, 12, valueWidth);
    lines.forEach((line, i) => {
      page.drawText(line, { x: valueX, y: y - i * 16, size: 12, font: helvetica, color: COVER_BLACK });
    });
    y -= Math.max(lines.length, 1) * 16 + 14;
  };

  drawRow('Applicant', data.applicant || '(not set)');
  drawRow('Lines Requested', data.linesRequested.join(', ') || '(none)');
  drawRow('Proposed Effective Date', data.effectiveDateUs || 'TBD');
  if (data.wholesalerName) {
    drawRow('Submitted To', data.wholesalerName);
  }

  // Contents list.
  y -= 12;
  page.drawText('CONTENTS', { x: labelX, y, size: 9, font: helveticaBold, color: COVER_GRAY });
  const contents = [
    'ACORD 125 Commercial Insurance Application (2016/03)',
    'ACORD 126 Commercial General Liability Section (2009/08)',
  ];
  for (const item of contents) {
    const lines = wrapCoverText(item, helvetica, 11, valueWidth);
    lines.forEach((line, i) => {
      page.drawText(line, { x: valueX, y: y - i * 15, size: 11, font: helvetica, color: COVER_BLACK });
    });
    y -= lines.length * 15 + 2;
  }

  // Footer: hairline, producer contact line (phone/email when set), generated date.
  page.drawLine({
    start: { x: marginX, y: 104 }, end: { x: 612 - marginX, y: 104 },
    thickness: 0.5, color: COVER_GRAY,
  });
  const contactParts = [data.agencyName, data.producerPhone, data.producerEmail]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  page.drawText(winAnsiSafe(contactParts.join('  |  ')), {
    x: marginX, y: 90, size: 9, font: helvetica, color: COVER_GRAY,
  });
  page.drawText(`Generated ${data.generatedUs}`, {
    x: marginX, y: 76, size: 9, font: helvetica, color: COVER_GRAY,
  });
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

  // --- Step 1: auth (the extract-fn requireAuth pattern) + staff gate --------
  const authResult = await requireAuth(req, admin, corsHeaders);
  if (authResult instanceof Response) {
    return authResult;
  }
  const user = authResult;

  // JWT-scoped client so is_staff() / is_agency_member() see the caller.
  const caller: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  let body: GeneratePacketRequest;
  try {
    body = (await req.json()) as GeneratePacketRequest;
  } catch {
    return json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } });
  }

  try {
    if (typeof body.submission_id !== 'string' || body.submission_id.length === 0) {
      throw fail(422, 'VALIDATION_ERROR', 'submission_id is required');
    }

    const { data: isStaff, error: staffErr } = await caller.rpc('is_staff');
    if (staffErr || isStaff !== true) {
      throw fail(403, 'FORBIDDEN', 'Staff access required');
    }

    // --- Step 2: load submission + account + profile + locations -------------
    const { data: submission, error: subErr } = await admin
      .from('commercial_submissions')
      .select('id, account_id, status, target_lines, effective_date, remarket_of_policy_id, wholesaler_name')
      .eq('id', body.submission_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (subErr) {
      throw fail(500, 'INTERNAL_ERROR', `submission lookup failed: ${subErr.message}`);
    }
    if (!submission) {
      throw fail(404, 'NOT_FOUND', 'submission not found');
    }

    // --- Step 3: refuse closed submissions ------------------------------------
    if (CLOSED_STATUSES.includes(submission.status)) {
      throw fail(422, 'CLOSED', `submission is ${submission.status}; reopen or start a new one`);
    }

    const { data: account, error: acctErr } = await admin
      .from('accounts')
      .select('id, name, agency_workspace_id, merged_into_id')
      .eq('id', submission.account_id)
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

    const { data: profile, error: profErr } = await admin
      .from('commercial_profiles')
      .select('legal_name, entity_type, fein, sic_code, naics_code, website, description_of_operations')
      .eq('account_id', submission.account_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (profErr) {
      throw fail(500, 'INTERNAL_ERROR', `profile lookup failed: ${profErr.message}`);
    }

    const { data: locations, error: locErr } = await admin
      .from('commercial_locations')
      .select('address_line1, address_line2, city, state, zip, county, interest, location_number, created_at')
      .eq('account_id', submission.account_id)
      .is('deleted_at', null)
      .order('location_number', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    if (locErr) {
      throw fail(500, 'INTERNAL_ERROR', `locations lookup failed: ${locErr.message}`);
    }

    // --- Step 4: remarket source policy -> GL limits ---------------------------
    let glLimits: RiskStoreGlLimits | null = null;
    if (submission.remarket_of_policy_id) {
      const { data: sourcePolicy, error: polErr } = await admin
        .from('policies')
        .select('id, account_id, cgl_details')
        .eq('id', submission.remarket_of_policy_id)
        .maybeSingle();
      if (polErr) {
        throw fail(500, 'INTERNAL_ERROR', `remarket source policy lookup failed: ${polErr.message}`);
      }
      // Tenancy: never read limits across accounts. The service client
      // bypasses RLS, so this check is the guard; the remarket source must
      // belong to the SAME account as the submission.
      if (sourcePolicy && sourcePolicy.account_id !== submission.account_id) {
        throw fail(
          422,
          'REMARKET_POLICY_MISMATCH',
          'remarket source policy belongs to a different account than the submission',
        );
      }
      const rawLimits = ((sourcePolicy?.cgl_details as { limits?: unknown } | null)?.limits ??
        null) as Record<string, unknown> | null;
      if (rawLimits) {
        glLimits = {
          each_occurrence: numOrNull(rawLimits.each_occurrence),
          general_aggregate: numOrNull(rawLimits.general_aggregate),
          damage_to_rented_premises: numOrNull(rawLimits.damage_to_rented_premises),
          medical_expense: numOrNull(rawLimits.medical_expense),
          personal_advertising_injury: numOrNull(rawLimits.personal_advertising_injury),
          products_completed_ops_aggregate: numOrNull(rawLimits.products_completed_ops_aggregate),
          aggregate_applies_per:
            typeof rawLimits.aggregate_applies_per === 'string'
              ? rawLimits.aggregate_applies_per
              : null,
        };
      }
    }

    // --- Step 5: build both inputs via the ported adapters ---------------------
    const producer = {
      name: Deno.env.get('PRODUCER_NAME') ?? 'Lewis Insurance Associates',
      addressLine1: Deno.env.get('PRODUCER_ADDRESS_LINE1') ?? '',
      city: Deno.env.get('PRODUCER_CITY') ?? '',
      state: Deno.env.get('PRODUCER_STATE') ?? '',
      zip: Deno.env.get('PRODUCER_ZIP') ?? '',
      phone: Deno.env.get('PRODUCER_PHONE') ?? '',
      email: Deno.env.get('PRODUCER_EMAIL') ?? '',
    };
    // One clock read: the form completion date and the risk snapshot's
    // captured_at come from the same instant.
    const capturedAt = new Date().toISOString();
    // The printed form date is the BUSINESS day, not the UTC day (review
    // fix): edge functions run in UTC, so an evening generation would date
    // the application tomorrow. Single-state FL agency -> America/New_York
    // (en-CA gives YYYY-MM-DD directly).
    const completionDateIso = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const input125 = buildAcord125InputFromRiskStore({
      submission: {
        effective_date: submission.effective_date ?? null,
        target_lines: (submission.target_lines ?? []) as string[],
      },
      account: { name: account.name ?? null },
      profile: profile ?? null,
      locations: locations ?? [],
      producer,
      completionDateIso,
    });

    const input126 = buildAcord126InputFromRiskStore({
      submission: { effective_date: submission.effective_date ?? null },
      // The RESOLVED display name from the built 125 input, so the two forms
      // can never disagree on the named insured.
      account: { name: input125.namedInsured.name },
      glLimits,
      producerName: producer.name,
      completionDateIso,
    });

    // --- Step 6: validate + build; any error-severity issue is a 422 -----------
    // mode 'packet': a fresh application legitimately has no GL limits (and may
    // have no settled effective date) yet; those rules downgrade to warnings
    // and ride along in the issues list without blocking.
    const v125 = validateAcord125(input125, { mode: 'packet' });
    const v126 = validateAcord126(input126, { mode: 'packet' });
    const build125 = buildAcord125FieldValues(input125);
    const build126 = buildAcord126FieldValues(input126);

    const issues: PacketIssue[] = [
      ...v125.issues.map((i) => ({ form: '125' as const, code: i.code, severity: i.severity, message: i.message })),
      ...build125.issues.map((i) => ({ form: '125' as const, code: i.code, severity: i.severity, message: i.message })),
      ...v126.issues.map((i) => ({ form: '126' as const, code: i.code, severity: i.severity, message: i.message })),
      ...build126.issues.map((i) => ({ form: '126' as const, code: i.code, severity: i.severity, message: i.message })),
    ];
    if (issues.some((i) => i.severity === 'error')) {
      throw fail(422, 'VALIDATION', 'The submission is missing data the packet needs', issues);
    }

    // --- Step 7: download the two pinned blanks --------------------------------
    const template125 = await downloadPinnedTemplate(admin, '125');
    const template126 = await downloadPinnedTemplate(admin, '126');

    // --- Step 8: fill each (flattened by default), then merge cover + 125 + 126
    const filled125 = await fillOrFail('125', template125, build125.fieldValues);
    const filled126 = await fillOrFail('126', template126, build126.fieldValues);

    let packetBytes: Uint8Array;
    try {
      const merged = await PDFDocument.create();
      // The branded cover page leads the packet (drawn, not template-filled).
      // Names resolve from the SAME built 125 input the forms printed from, so
      // the cover can never disagree with the application behind it.
      await addCoverPage(merged, {
        agencyName: producer.name,
        applicant: input125.namedInsured.name,
        linesRequested: ((submission.target_lines ?? []) as string[])
          .map((line) => COVER_LINE_LABELS[line])
          .filter((label): label is string => Boolean(label)),
        effectiveDateUs: isoToUsDate(submission.effective_date),
        wholesalerName: (submission.wholesaler_name ?? '').trim(),
        producerPhone: producer.phone,
        producerEmail: producer.email,
        generatedUs: isoToUsDate(completionDateIso),
      });
      const doc125 = await PDFDocument.load(filled125);
      const doc126 = await PDFDocument.load(filled126);
      const pages125 = await merged.copyPages(doc125, doc125.getPageIndices());
      for (const page of pages125) {
        merged.addPage(page);
      }
      const pages126 = await merged.copyPages(doc126, doc126.getPageIndices());
      for (const page of pages126) {
        merged.addPage(page);
      }
      packetBytes = new Uint8Array(await merged.save());
    } catch (mergeError) {
      const msg = mergeError instanceof Error ? mergeError.message : 'Unknown error';
      throw fail(500, 'MERGE_FAILED', `packet merge failed: ${msg}`);
    }

    // --- Step 9: upload (upsert:false, retry once -> 502) ----------------------
    const storagePath = `${submission.account_id}/${submission.id}/GL-packet-${Date.now()}.pdf`;
    const uploaded = await uploadWithRetry(admin, storagePath, packetBytes);
    if (!uploaded) {
      throw fail(502, 'UPLOAD_FAILED', 'packet storage upload failed');
    }

    // --- Step 9b: closed-race re-check (review fix). The CLOSED gate ran at
    // load; a colleague can bind/lose the submission during the fill. Re-read
    // before the event so a just-closed file does not gain a packet - and
    // compensate the upload we already made.
    const { data: statusNow } = await admin
      .from('commercial_submissions')
      .select('status')
      .eq('id', submission.id)
      .maybeSingle();
    if (statusNow && ['bound', 'lost', 'abandoned'].includes(statusNow.status)) {
      await admin.storage.from(PACKET_BUCKET).remove([storagePath]);
      throw fail(422, 'CLOSED', `submission was closed (${statusNow.status}) while the packet was generating`);
    }

    // The snapshot this packet PRINTED FROM. It rides in two places with two
    // meanings: the append-only event below pairs THIS packet with THIS data
    // permanently (race-immune - review fix round 4: concurrent generations
    // each keep their own pairing), while the row's risk_snapshot holds the
    // latest-while-draft/intake capture the workflow reads.
    const riskSnapshot = {
      captured_at: capturedAt,
      producer,
      profile: profile ?? null,
      // The rows the packet printed from: mailing address (row 1) plus the
      // blank's 4 premises rows (the adapter's truncation boundary).
      locations: (locations ?? []).slice(0, 4),
      gl_limits: glLimits,
      forms: ['125', '126'],
      template_shas: { '125': TEMPLATES['125'].sha256, '126': TEMPLATES['126'].sha256 },
    };

    // --- Step 10: audit event (append-only); compensate the upload on failure --
    const { error: eventErr } = await admin.from('submission_events').insert({
      submission_id: submission.id,
      action: 'packet_generated',
      actor_id: user.id,
      metadata: {
        storage_path: storagePath,
        forms: ['125', '126'],
        cover: true,
        template_shas: { '125': TEMPLATES['125'].sha256, '126': TEMPLATES['126'].sha256 },
        validation: 'passed',
        risk_snapshot: riskSnapshot,
      },
    });
    if (eventErr) {
      const { error: rmErr } = await admin.storage.from(PACKET_BUCKET).remove([storagePath]);
      if (rmErr) {
        logger.error('orphaned packet object after event insert failure', undefined, {
          storage_path: storagePath,
          event_error: eventErr.message,
        });
      }
      throw fail(500, 'EVENT_FAILED', `packet event insert failed: ${eventErr.message}`);
    }

    // --- Step 11: freeze the risk snapshot + advance draft/intake -> ------------
    // packet_ready, one conditional write (Phase 0 spec: risk_snapshot is the
    // immutable capture the packet printed from). Regenerating while still
    // draft/intake refreshes it; once the file has advanced past intake the
    // snapshot (and status) stay untouched, and the .in() guard turns a raced
    // advance into a clean no-op. Warn-only on failure: the packet exists and
    // is event-logged, and because the SAME statement carries freeze + advance
    // a failed write leaves the row in draft/intake so the next generation
    // retries the freeze.
    // The freeze decision comes from the WRITE result, never a read (review
    // fix round 3): any read-then-branch leaves a TOCTOU window where the
    // guarded update silently no-ops and a packet persists with no snapshot.
    // Attempt the freeze+advance; if it touched zero rows (status moved past
    // intake at any point), backfill the snapshot only where none exists -
    // status untouched, immutability preserved, no window left.
    const { data: frozenRows, error: freezeErr } = await admin
      .from('commercial_submissions')
      .update({
        status: 'packet_ready',
        risk_snapshot: riskSnapshot,
        snapshot_frozen_at: capturedAt,
      })
      .eq('id', submission.id)
      .in('status', ['draft', 'intake'])
      .select('id');
    if (freezeErr) {
      logger.warn('risk snapshot freeze + status advance failed', {
        submission_id: submission.id,
        error: freezeErr.message,
      });
    } else if (!frozenRows || frozenRows.length === 0) {
      const { error: backfillErr } = await admin
        .from('commercial_submissions')
        .update({ risk_snapshot: riskSnapshot, snapshot_frozen_at: capturedAt })
        .eq('id', submission.id)
        .is('risk_snapshot', null);
      if (backfillErr) {
        logger.warn('risk snapshot backfill failed', {
          submission_id: submission.id,
          error: backfillErr.message,
        });
      }
    }

    // --- Step 12: signed URL + response ----------------------------------------
    const { data: signed, error: signErr } = await admin.storage
      .from(PACKET_BUCKET)
      .createSignedUrl(storagePath, 3600);
    if (signErr || !signed?.signedUrl) {
      // The packet is fully persisted; a signed-URL hiccup should not 500 the
      // whole run. Return without a URL so the client can refetch.
      logger.warn('signed URL generation failed after packet upload', {
        storage_path: storagePath,
        error: signErr?.message,
      });
    }

    return json(200, {
      success: true,
      storage_path: storagePath,
      signed_url: signed?.signedUrl ?? '',
      forms: ['125', '126'],
    });
  } catch (error) {
    if (isStructuredError(error)) {
      return json(error.status, {
        error: {
          code: error.code,
          message: error.message,
          ...(error.issues && { issues: error.issues }),
        },
      });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('generate-submission-packet failed', error instanceof Error ? error : new Error(message));
    return json(500, { error: { code: 'INTERNAL_ERROR', message } });
  }
}

Deno.serve(handle);
