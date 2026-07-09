/**
 * Workers' Compensation (WC) extraction shaping — PURE module (no Deno/Node, no
 * DB, no network, no remote imports).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `index.ts` (the edge entry point) imports Deno-only `https://` URLs and so
 * cannot be loaded by Vitest. Every decision that turns the model's structured
 * output into the exact JSONB the COI read model reads lives here, where it is
 * unit-testable from Node AND importable from the Deno runtime. This mirrors the
 * BAP template at ../extract-bap-policy/shape.ts.
 *
 * THE CONTRACT (do not drift these paths)
 * ---------------------------------------
 * `get_master_coi` / `coi_build_line`
 * (supabase/migrations/20260702172000_master_coi_rpcs.sql, WC cells L914-936)
 * read FIXED paths out of `policies.wc_details` and treat a cell as "extracted"
 * when the flat `policies.wc_field_evidence` map has the matching dotted key.
 * The RPC literally does `v_ev ? 'coverage.part_two_employers_liability.each_accident'`,
 * so the evidence-map KEY FORMAT is load-bearing. The paths this module writes:
 *
 *   wc_details.coverage.part_one_wc                                    ("statutory" | "other")
 *   wc_details.coverage.part_two_employers_liability.each_accident     (number, required_for_ready)
 *   wc_details.coverage.part_two_employers_liability.disease_each_employee (number, required_for_ready)
 *   wc_details.coverage.part_two_employers_liability.disease_policy_limit  (number, required_for_ready)
 *   wc_details.identity.{carrier_name,carrier_naic,policy_number,transaction_type,named_insured,dba,fein}
 *   wc_details.identity.mailing_address.{street,city,state,zip}
 *   wc_details.dates.{effective_date,expiration_date}
 *
 * The RPC derives the ACORD "PER STATUTE" box from
 * `wc_details.coverage.part_one_wc == 'statutory'` (L920-923) and derives
 * "ANY PROPRIETOR EXCLUDED" from `NOT bool_or(policy_wc_officers.is_included)`
 * (L930-935), so the officer child rows carry the real election.
 *
 * identity/dates follow the GL house standard (extract-cgl-policy identity/dates)
 * so the Verify feature and the COI named-insured mismatch check read
 * `*_details.identity.*` / `.dates.*` uniformly across every line.
 *
 * `wc_field_evidence` keys are these same paths RELATIVE to the blob column
 * (no `wc_details.` prefix), e.g. "coverage.part_two_employers_liability.each_accident".
 *
 * §NO-PREMIUM: WC has no premium field anywhere (unrepresentable in the COI
 * contract). Mirroring BAP, neither the blob nor any child row carries premium,
 * rate, or state_premium — only exposure basis (payroll/remuneration) survives.
 */

// ---------------------------------------------------------------------------
// Raw model output types (what the tool_use block returns)
// ---------------------------------------------------------------------------

/**
 * Every scalar the model extracts is returned as a leaf so it can cite the
 * evidence catalog IDs alongside the value. Mirrors the GL/BAP extractor's
 * `{ value, evidence_ids }` field shape and lets `buildFlatDottedEvidence`
 * emit the flat map the COI RPC reads.
 */
export interface EvidenceLeaf<T = unknown> {
  value?: T | null;
  evidence_ids?: string[] | null;
  confidence?: number | null;
  status?: string | null;
}

/**
 * Blanket-endorsement evidence, NOT a confirmed "Y". Note the WC waiver child
 * table (policy_wc_subrogation_waivers) has NO column for `form_numbers` (plural
 * array) or `source_span`; the shaper collapses form_numbers into the singular
 * `endorsement_form` and drops source_span (see FLAG in shapeSubrogationWaiverRows).
 */
export interface RawBlanketEvidence {
  present?: boolean | null;
  basis?: 'blanket' | 'scheduled' | null;
  form_numbers?: string[] | null;
  source_span?: string | null;
}

export interface RawWcExtraction {
  identity?: {
    carrier_name?: EvidenceLeaf<string>;
    carrier_naic?: EvidenceLeaf<string>;
    policy_number?: EvidenceLeaf<string>;
    transaction_type?: EvidenceLeaf<string>;
    named_insured?: EvidenceLeaf<string>;
    dba?: EvidenceLeaf<string>;
    fein?: EvidenceLeaf<string>;
    mailing_address?: {
      street?: EvidenceLeaf<string>;
      city?: EvidenceLeaf<string>;
      state?: EvidenceLeaf<string>;
      zip?: EvidenceLeaf<string>;
    };
  };
  dates?: {
    effective_date?: EvidenceLeaf<string>;
    expiration_date?: EvidenceLeaf<string>;
  };
  coverage?: {
    /** WC Part One basis: "statutory" (the ACORD PER STATUTE box) or "other". */
    part_one_wc?: EvidenceLeaf<string>;
    part_two_employers_liability?: {
      each_accident?: EvidenceLeaf<number>;
      disease_each_employee?: EvidenceLeaf<number>;
      disease_policy_limit?: EvidenceLeaf<number>;
    };
  };
  classifications?: unknown[];
  officers?: unknown[];
  covered_states?: unknown[];
  experience_mods?: unknown[];
  /** Named/scheduled subrogation waivers (holder-matched at COI build). */
  subrogation_waivers?: unknown[];
  /** Blanket waiver of subrogation endorsement evidence (WC 00 03 13, etc.). */
  waiver_of_subrogation_evidence?: RawBlanketEvidence;
  extraction_confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Shaped output types (what lands in policies.wc_details)
// ---------------------------------------------------------------------------

export interface WcDetails {
  identity: {
    carrier_name: string | null;
    carrier_naic: string | null;
    policy_number: string | null;
    transaction_type: string | null;
    named_insured: string | null;
    dba: string | null;
    fein: string | null;
    mailing_address: {
      street: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    };
  };
  dates: {
    effective_date: string | null;
    expiration_date: string | null;
  };
  coverage: {
    part_one_wc: 'statutory' | 'other' | null;
    part_two_employers_liability: {
      each_accident: number | null;
      disease_each_employee: number | null;
      disease_policy_limit: number | null;
    };
  };
  extraction_source: string;
  extraction_confidence: number | null;
  extracted_at: string;
}

export interface ShapedWc {
  wcDetails: WcDetails;
  fieldEvidence: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Scalar coercion helpers (copied from BAP shape.ts — this module is standalone)
// ---------------------------------------------------------------------------

export function toStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'boolean') return String(v);
  return null;
}

export function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return /^(y|yes|true|1)$/i.test(v.trim());
  return false;
}

/** Postgres DATE columns need a clean ISO date; anything else must be null. */
export function toDateOrNull(v: unknown): string | null {
  const s = toStringOrNull(v);
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

/**
 * Insurer NAIC is a 3-5 digit company code. An industry NAICS/SIC is 6 digits
 * (§ agency rule: insurer NAIC != industry NAICS/SIC) — reject those rather
 * than mislabel one as a carrier NAIC. Absent -> null (name->NAIC lookup is
 * downstream); never guess.
 */
export function normalizeNaic(v: unknown): string | null {
  const s = toStringOrNull(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length <= 5) return digits;
  return null;
}

/**
 * WC Part One basis -> the ACORD 25 "PER STATUTE" box. The RPC checks
 * `part_one_wc == 'statutory'` verbatim, so we normalize to exactly
 * 'statutory' | 'other' | null. Statute-worded text collapses to 'statutory';
 * anything else that is present but not statutory is 'other'; absent is null
 * (never guess a box state).
 */
export function normalizePartOne(v: unknown): 'statutory' | 'other' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s === 'statutory' || s.includes('statut')) return 'statutory';
  if (s === 'other') return 'other';
  return null;
}

// ---------------------------------------------------------------------------
// Flat-dotted evidence builder (copied verbatim from the BAP/GL extractor).
// Walks a nested tree of `{ value, evidence_ids }` leaves and emits
// { "<dotted.path>": evidence_ids } for every leaf that cited evidence. Arrays
// are NOT descended (child rows carry their own evidence_ids columns), so
// passing a curated identity/dates/coverage subtree yields exactly the relative
// in-blob paths the COI RPC tests.
// ---------------------------------------------------------------------------

export function buildFlatDottedEvidence(root: unknown): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.evidence_ids) && (obj.evidence_ids as unknown[]).length > 0) {
      map[path] = obj.evidence_ids as string[];
    }
    for (const key of Object.keys(obj)) {
      const child = obj[key];
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    }
  };
  walk(root, '');
  return map;
}

// ---------------------------------------------------------------------------
// Core: raw model extraction -> { wc_details, wc_field_evidence }
// ---------------------------------------------------------------------------

export function shapeWcDetails(raw: RawWcExtraction, nowIso: string): ShapedWc {
  const el = raw.coverage?.part_two_employers_liability ?? {};

  const wcDetails: WcDetails = {
    identity: {
      carrier_name: toStringOrNull(raw.identity?.carrier_name?.value),
      carrier_naic: normalizeNaic(raw.identity?.carrier_naic?.value),
      policy_number: toStringOrNull(raw.identity?.policy_number?.value),
      transaction_type: toStringOrNull(raw.identity?.transaction_type?.value),
      named_insured: toStringOrNull(raw.identity?.named_insured?.value),
      dba: toStringOrNull(raw.identity?.dba?.value),
      fein: toStringOrNull(raw.identity?.fein?.value),
      mailing_address: {
        street: toStringOrNull(raw.identity?.mailing_address?.street?.value),
        city: toStringOrNull(raw.identity?.mailing_address?.city?.value),
        state: toStringOrNull(raw.identity?.mailing_address?.state?.value),
        zip: toStringOrNull(raw.identity?.mailing_address?.zip?.value),
      },
    },
    dates: {
      effective_date: toStringOrNull(raw.dates?.effective_date?.value),
      expiration_date: toStringOrNull(raw.dates?.expiration_date?.value),
    },
    coverage: {
      part_one_wc: normalizePartOne(raw.coverage?.part_one_wc?.value),
      part_two_employers_liability: {
        each_accident: toNumberOrNull(el.each_accident?.value),
        disease_each_employee: toNumberOrNull(el.disease_each_employee?.value),
        disease_policy_limit: toNumberOrNull(el.disease_policy_limit?.value),
      },
    },
    extraction_source: 'azure_di_claude',
    extraction_confidence: toNumberOrNull(raw.extraction_confidence),
    extracted_at: nowIso,
  };

  // Evidence map: reuse the recursive builder over a CURATED subtree so the
  // emitted keys are exactly the relative in-blob paths the COI RPC tests
  // (identity.*, dates.*, coverage.part_one_wc,
  // coverage.part_two_employers_liability.*). Arrays (child rows) are excluded.
  const fieldEvidence = buildFlatDottedEvidence({
    identity: raw.identity,
    dates: raw.dates,
    coverage: {
      part_one_wc: raw.coverage?.part_one_wc,
      part_two_employers_liability: raw.coverage?.part_two_employers_liability,
    },
  });

  return { wcDetails, fieldEvidence };
}

// ---------------------------------------------------------------------------
// Child-table row shapers (return rows WITHOUT policy_id; index.ts adds it).
// All defend the DB CHECK constraints and NOT NULL columns so a DELETE-then-
// INSERT batch cannot crash on one bad row.
// ---------------------------------------------------------------------------

const EXPOSURE_BASES = ['payroll', 'per_capita', 'other'];
const OFFICER_TYPES = ['officer', 'partner', 'llc_member', 'sole_proprietor'];
const STATE_COVERAGE_TYPES = ['item_3a', 'item_3c', 'monopolistic'];
const SCHEDULE_RATING_TYPES = ['credit', 'debit'];
const EXTRACTION_STATUSES = [
  'AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL',
];

function pickEnum(v: unknown, allowed: string[], fallback: string | null = null): string | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (s && allowed.includes(s)) return s;
  return fallback;
}

function sanitizeStatus(v: unknown): string {
  const s = toStringOrNull(v)?.toUpperCase();
  if (s && EXTRACTION_STATUSES.includes(s)) return s;
  return 'AUTO_APPLIED';
}

function evidenceIds(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
}

function dedupeBy<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyFn(row), row); // last wins
  return [...byKey.values()];
}

/**
 * WC officer inclusion election. is_included=false is the notable case
 * ("ANY PROPRIETOR EXCLUDED" derives from NOT bool_or(is_included)). Only assert
 * FALSE on explicit exclusion evidence; unknown defaults to TRUE (included) so
 * we UNDER-claim rather than fabricate an exclusion the RPC would print.
 */
export function officerIncluded(v: unknown): boolean {
  if (v === false) return false;
  if (typeof v === 'string' && /^(n|no|false|0|excluded)$/i.test(v.trim())) return false;
  return true;
}

/** Classifications -> policy_wc_classifications rows (§NO-PREMIUM: no rate/premium). */
export function shapeClassificationRows(raw: RawWcExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.classifications) ? raw.classifications : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const c = item as Record<string, unknown>;
    const state = toStringOrNull(c.state);
    const classCode = toStringOrNull(c.class_code);
    if (!state || !classCode) continue; // both NOT NULL
    rows.push({
      state,
      class_code: classCode,
      description: toStringOrNull(c.description),
      exposure_basis: pickEnum(c.exposure_basis, EXPOSURE_BASES, 'payroll'),
      estimated_payroll: toNumberOrNull(c.estimated_payroll),
      // §NO-PREMIUM: rate + premium columns are pricing, never extracted.
      is_governing_class: toBool(c.is_governing_class),
      is_standard_exception: toBool(c.is_standard_exception),
      evidence_ids: evidenceIds(c.evidence_ids),
      extraction_confidence: toNumberOrNull(c.confidence),
      extraction_status: sanitizeStatus(c.status),
    });
  }
  return rows;
}

/** Officers -> policy_wc_officers rows. is_included drives proprietor_excluded. */
export function shapeOfficerRows(raw: RawWcExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.officers) ? raw.officers : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const o = item as Record<string, unknown>;
    const name = toStringOrNull(o.name);
    if (!name) continue; // name is NOT NULL
    rows.push({
      name,
      title: toStringOrNull(o.title),
      ownership_percent: toNumberOrNull(o.ownership_percent),
      is_included: officerIncluded(o.included), // NOT NULL default true
      annual_remuneration: toNumberOrNull(o.annual_remuneration), // exposure basis, not premium
      duties: toStringOrNull(o.duties),
      officer_type: pickEnum(o.type ?? o.officer_type, OFFICER_TYPES, 'officer'),
      evidence_ids: evidenceIds(o.evidence_ids),
      extraction_confidence: toNumberOrNull(o.confidence),
      extraction_status: sanitizeStatus(o.status),
    });
  }
  return rows;
}

/** Covered states -> policy_wc_states rows (§NO-PREMIUM: no state_premium). */
export function shapeStateRows(raw: RawWcExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.covered_states) ? raw.covered_states : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const s = item as Record<string, unknown>;
    const state = toStringOrNull(s.state);
    if (!state) continue; // NOT NULL
    rows.push({
      state,
      coverage_type: pickEnum(s.type ?? s.coverage_type, STATE_COVERAGE_TYPES, 'item_3a'), // NOT NULL
      is_monopolistic: toBool(s.is_monopolistic),
      // §NO-PREMIUM: state_premium column is pricing, never extracted.
      evidence_ids: evidenceIds(s.evidence_ids),
      extraction_confidence: toNumberOrNull(s.confidence),
      extraction_status: sanitizeStatus(s.status),
    });
  }
  // UNIQUE(policy_id, state) — collapse duplicates (last wins).
  return dedupeBy(rows, (r) => String(r.state));
}

/**
 * Experience mods -> policy_wc_experience_mods rows. experience_mod AND
 * effective_date are BOTH NOT NULL, so drop any row that cannot satisfy them
 * (defends the DELETE-then-INSERT batch from crashing on one bad row).
 */
export function shapeExperienceModRows(raw: RawWcExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.experience_mods) ? raw.experience_mods : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const e = item as Record<string, unknown>;
    const mod = toNumberOrNull(e.experience_mod);
    const effective = toDateOrNull(e.effective_date ?? e.experience_mod_effective_date);
    if (mod === null || effective === null) continue; // both NOT NULL
    rows.push({
      experience_mod: mod,
      effective_date: effective,
      rating_bureau: toStringOrNull(e.rating_bureau) ?? 'NCCI',
      schedule_rating_percent: toNumberOrNull(e.schedule_rating_percent),
      schedule_rating_type: pickEnum(e.schedule_rating_type, SCHEDULE_RATING_TYPES),
      notes: toStringOrNull(e.notes),
      evidence_ids: evidenceIds(e.evidence_ids),
      extraction_confidence: toNumberOrNull(e.confidence),
      extraction_status: sanitizeStatus(e.status),
    });
  }
  return rows;
}

/**
 * Subrogation waivers -> policy_wc_subrogation_waivers rows.
 *
 * WC has NO Additional Insured column; SUBR WVD (waiver of subrogation) is the
 * ONLY holder flag. resolve_holder_endorsements treats waiver_scope='blanket'
 * as blanket and waiver_scope='specific' as holder-matched (by name). The row
 * IS the waiver — there is no separate waiver_of_subrogation boolean.
 *
 * §4 (never fabricate a "Y"): every row is written endorsement_status='requested'
 * (visible as the amber carrier-asked state), NEVER 'endorsed' (the confirmed Y
 * a human must promote).
 *
 * FLAG — missing columns: the table has NO `form_numbers` (plural array) column
 * and NO `source_span` column. Blanket evidence's form_numbers[] is COLLAPSED
 * into the singular `endorsement_form` text; source_span is DROPPED (there is
 * nowhere to store it). The table also has no evidence_ids / extraction_* columns.
 */
export function shapeSubrogationWaiverRows(raw: RawWcExtraction): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  // Named / scheduled waivers (holder-matched at COI build). name is required
  // for waiver_scope='specific' (constraint wc_waiver_name_when_specific).
  const named = Array.isArray(raw.subrogation_waivers) ? raw.subrogation_waivers : [];
  for (const item of named) {
    const w = item as Record<string, unknown>;
    const name = toStringOrNull(w.name);
    if (!name) continue; // specific waiver MUST carry a name
    const address = (w.address ?? {}) as Record<string, unknown>;
    rows.push({
      waiver_scope: 'specific',
      name,
      street: toStringOrNull(address.street ?? address.line1),
      city: toStringOrNull(address.city),
      state: toStringOrNull(address.state),
      zip: toStringOrNull(address.zip),
      endorsement_status: 'requested', // evidence only — never a fabricated 'endorsed'
      endorsement_form: toStringOrNull(w.endorsement_form ?? w.form_number),
      endorsement_effective_date: toDateOrNull(w.endorsement_effective_date ?? w.effective_date),
    });
  }

  // Blanket waiver of subrogation -> one synthetic blanket row (name may be null).
  const wvEv = raw.waiver_of_subrogation_evidence;
  if (wvEv?.present && wvEv?.basis === 'blanket') {
    const forms = (wvEv.form_numbers ?? [])
      .map((f) => toStringOrNull(f))
      .filter((f): f is string => !!f);
    rows.push({
      waiver_scope: 'blanket',
      name: null, // constraint allows null name when blanket
      street: null,
      city: null,
      state: null,
      zip: null,
      endorsement_status: 'requested', // evidence only — never a fabricated 'endorsed'
      // FLAG: form_numbers[] collapsed to singular endorsement_form; source_span dropped.
      endorsement_form: forms.length ? [...new Set(forms)].join(', ') : null,
      endorsement_effective_date: null,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Claude tool-use schema (single source of truth for index.ts)
// ---------------------------------------------------------------------------

export const WC_EXTRACTION_TOOL_NAME = 'emit_wc_extraction';

const leaf = (valueSchema: Record<string, unknown>, desc?: string) => ({
  type: 'object',
  ...(desc ? { description: desc } : {}),
  properties: {
    value: valueSchema,
    evidence_ids: { type: 'array', items: { type: 'string' }, description: 'Evidence catalog IDs (E####) that support this value.' },
  },
});

const STR = { type: ['string', 'null'] };
const NUM = { type: ['number', 'null'] };

/**
 * Strict JSON Schema handed to Claude via `tools` + `tool_choice`. §NO-PREMIUM:
 * no premium / rate / state_premium field anywhere. carrier_naic is explicitly
 * the 5-digit INSURER NAIC, never an industry NAICS/SIC.
 */
export const WC_EXTRACTION_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    identity: {
      type: 'object',
      properties: {
        carrier_name: leaf(STR),
        carrier_naic: leaf(STR, '5-digit INSURER NAIC company code only. NOT an industry NAICS/SIC code. Return null if absent — never guess.'),
        policy_number: leaf(STR),
        transaction_type: leaf(STR),
        named_insured: leaf(STR),
        dba: leaf(STR),
        fein: leaf(STR, 'Federal Employer ID Number (EIN) of the named insured; used for customer matching. Business tax ID, not an SSN.'),
        mailing_address: {
          type: 'object',
          properties: {
            street: leaf(STR),
            city: leaf(STR),
            state: leaf(STR),
            zip: leaf(STR),
          },
        },
      },
    },
    dates: {
      type: 'object',
      properties: {
        effective_date: leaf(STR, 'Policy effective date, YYYY-MM-DD.'),
        expiration_date: leaf(STR, 'Policy expiration date, YYYY-MM-DD.'),
      },
    },
    coverage: {
      type: 'object',
      properties: {
        part_one_wc: leaf(
          { type: ['string', 'null'], enum: ['statutory', 'other', null] },
          'WC Part One (Workers Compensation) basis. "statutory" when Part One provides statutory benefits (the ACORD 25 PER STATUTE box); "other" otherwise. Return null if not shown.',
        ),
        part_two_employers_liability: {
          type: 'object',
          description: 'Part Two Employers Liability limits (the three EL limits printed on the ACORD 25 WC row).',
          properties: {
            each_accident: leaf(NUM, 'E.L. EACH ACCIDENT limit.'),
            disease_each_employee: leaf(NUM, 'E.L. DISEASE - EA EMPLOYEE limit.'),
            disease_policy_limit: leaf(NUM, 'E.L. DISEASE - POLICY LIMIT.'),
          },
        },
      },
    },
    classifications: {
      type: 'array',
      description: 'Classification rows from the WC rating schedule. Do NOT extract rate or premium.',
      items: {
        type: 'object',
        properties: {
          state: STR,
          class_code: STR,
          description: STR,
          exposure_basis: { type: ['string', 'null'], enum: ['payroll', 'per_capita', 'other', null] },
          estimated_payroll: NUM,
          is_governing_class: { type: ['boolean', 'null'] },
          is_standard_exception: { type: ['boolean', 'null'] },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    officers: {
      type: 'array',
      description: 'Officer / owner inclusion elections. included=false means the officer/owner is EXCLUDED from coverage.',
      items: {
        type: 'object',
        properties: {
          name: STR,
          title: STR,
          ownership_percent: NUM,
          included: { type: ['boolean', 'null'] },
          annual_remuneration: NUM,
          duties: STR,
          type: { type: ['string', 'null'], enum: ['officer', 'partner', 'llc_member', 'sole_proprietor', null] },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    covered_states: {
      type: 'array',
      description: 'States of operation. Item 3.A. states => item_3a; Item 3.C. other states => item_3c; monopolistic states => monopolistic. Do NOT extract state premium.',
      items: {
        type: 'object',
        properties: {
          state: STR,
          type: { type: ['string', 'null'], enum: ['item_3a', 'item_3c', 'monopolistic', null] },
          is_monopolistic: { type: ['boolean', 'null'] },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    experience_mods: {
      type: 'array',
      description: 'Experience modification factor(s). experience_mod is a decimal (0.850 = 15% credit, 1.150 = 15% debit) and effective_date (YYYY-MM-DD) are both required for a row to be stored.',
      items: {
        type: 'object',
        properties: {
          experience_mod: NUM,
          effective_date: STR,
          rating_bureau: STR,
          schedule_rating_percent: NUM,
          schedule_rating_type: { type: ['string', 'null'], enum: ['credit', 'debit', null] },
          notes: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    subrogation_waivers: {
      type: 'array',
      description: 'Named / scheduled waivers of subrogation (a specific organization or person waived in favor of). Blanket waivers go in waiver_of_subrogation_evidence instead.',
      items: {
        type: 'object',
        properties: {
          name: STR,
          address: {
            type: 'object',
            properties: { street: STR, city: STR, state: STR, zip: STR },
          },
          endorsement_form: STR,
          endorsement_effective_date: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    waiver_of_subrogation_evidence: {
      type: 'object',
      description: 'Evidence of a BLANKET waiver of subrogation endorsement (e.g. WC 00 03 13, applies to anyone the insured has agreed to waive against by written contract). Do NOT assert a specific holder "Y".',
      properties: {
        present: { type: 'boolean' },
        basis: { type: ['string', 'null'], enum: ['blanket', 'scheduled', null] },
        form_numbers: { type: 'array', items: { type: 'string' } },
        source_span: STR,
      },
    },
    extraction_confidence: { type: ['number', 'null'], description: 'Overall extraction confidence, 0-1.' },
  },
  required: ['coverage'],
};
