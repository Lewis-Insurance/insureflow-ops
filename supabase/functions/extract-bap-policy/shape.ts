/**
 * Commercial Auto (BAP) extraction shaping — PURE module (no Deno/Node, no DB,
 * no network, no remote imports).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `index.ts` (the edge entry point) imports Deno-only `https://` URLs and so
 * cannot be loaded by Vitest. Every decision that turns the model's structured
 * output into the exact JSONB the COI read model reads lives here, where it is
 * unit-testable from Node AND importable from the Deno runtime.
 *
 * THE CONTRACT (do not drift these paths)
 * ---------------------------------------
 * `get_master_coi` / `coi_build_line`
 * (supabase/migrations/20260702172000_master_coi_rpcs.sql, auto cells L847-867)
 * read FIXED paths out of `policies.bap_details` and treat a cell as
 * "extracted" when the flat `policies.bap_field_evidence` map has the matching
 * dotted key. The RPC literally does `v_ev ? 'coverage.liability.csl_limit'`,
 * so the evidence-map KEY FORMAT is load-bearing. The paths this module writes:
 *
 *   bap_details.coverage.liability.limit_type                 ("csl" | "split")
 *   bap_details.coverage.liability.csl_limit                  (number)
 *   bap_details.coverage.liability.bodily_injury_per_person   (number)
 *   bap_details.coverage.liability.bodily_injury_per_accident (number)
 *   bap_details.coverage.liability.property_damage            (number)
 *   bap_details.coverage.symbols.any_auto                     (boolean|null)
 *   bap_details.coverage.symbols.owned_autos                  (boolean|null)
 *   bap_details.coverage.symbols.scheduled_autos              (boolean|null)
 *   bap_details.coverage.symbols.hired_autos                  (boolean|null)
 *   bap_details.coverage.symbols.non_owned_autos              (boolean|null)
 *   bap_details.identity.{carrier_name,carrier_naic,policy_number,named_insured,dba,fein}
 *   bap_details.identity.mailing_address.{street,city,state,zip}
 *   bap_details.dates.{effective_date,expiration_date}
 *
 * identity/dates follow the GL house standard (extract-cgl-policy identity/dates)
 * so the Verify feature and the COI named-insured mismatch check read
 * `*_details.identity.*` / `.dates.*` uniformly across every line.
 *
 * `bap_field_evidence` keys are these same paths RELATIVE to the blob column
 * (no `bap_details.` prefix), e.g. "coverage.liability.csl_limit".
 *
 * This is the TEMPLATE for WC / Property / Umbrella. Keep it clean.
 */

// ---------------------------------------------------------------------------
// Raw model output types (what the tool_use block returns)
// ---------------------------------------------------------------------------

/**
 * Every scalar the model extracts is returned as a leaf so it can cite the
 * evidence catalog IDs alongside the value. This mirrors the GL extractor's
 * `{ value, evidence_ids }` field shape and lets `buildFlatDottedEvidence`
 * emit the flat map the COI RPC reads.
 */
export interface EvidenceLeaf<T = unknown> {
  value?: T | null;
  evidence_ids?: string[] | null;
  confidence?: number | null;
  status?: string | null;
}

export interface RawBlanketEvidence {
  present?: boolean | null;
  basis?: 'blanket' | 'scheduled' | null;
  form_numbers?: string[] | null;
  source_span?: string | null;
}

export interface RawBapExtraction {
  identity?: {
    carrier_name?: EvidenceLeaf<string>;
    carrier_naic?: EvidenceLeaf<string>;
    policy_number?: EvidenceLeaf<string>;
    transaction_type?: EvidenceLeaf<string>;
    named_insured?: EvidenceLeaf<string>;
    dba?: EvidenceLeaf<string>;
    mailing_address?: {
      street?: EvidenceLeaf<string>;
      city?: EvidenceLeaf<string>;
      state?: EvidenceLeaf<string>;
      zip?: EvidenceLeaf<string>;
    };
    fein?: EvidenceLeaf<string>;
  };
  dates?: {
    effective_date?: EvidenceLeaf<string>;
    expiration_date?: EvidenceLeaf<string>;
  };
  coverage?: {
    liability?: {
      limit_type?: EvidenceLeaf<string>;
      csl_limit?: EvidenceLeaf<number>;
      bodily_injury_per_person?: EvidenceLeaf<number>;
      bodily_injury_per_accident?: EvidenceLeaf<number>;
      property_damage?: EvidenceLeaf<number>;
    };
    /** Covered-auto symbol CODES the model reads off the coverage grid (1,2,7,8,9,...). */
    covered_auto_symbols?: EvidenceLeaf<Array<number | string>>;
  };
  vehicles?: unknown[];
  drivers?: unknown[];
  coverages?: unknown[];
  additional_interests?: unknown[];
  additional_insured_evidence?: RawBlanketEvidence;
  waiver_of_subrogation_evidence?: RawBlanketEvidence;
  extraction_confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Shaped output types (what lands in policies.bap_details)
// ---------------------------------------------------------------------------

export interface AutoSymbolFlags {
  any_auto: boolean | null;
  owned_autos: boolean | null;
  scheduled_autos: boolean | null;
  hired_autos: boolean | null;
  non_owned_autos: boolean | null;
}

export interface BapDetails {
  identity: {
    carrier_name: string | null;
    carrier_naic: string | null;
    policy_number: string | null;
    transaction_type: string | null;
    named_insured: string | null;
    dba: string | null;
    mailing_address: {
      street: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
    };
    fein: string | null;
  };
  dates: {
    effective_date: string | null;
    expiration_date: string | null;
  };
  coverage: {
    liability: {
      limit_type: 'csl' | 'split' | null;
      csl_limit: number | null;
      bodily_injury_per_person: number | null;
      bodily_injury_per_accident: number | null;
      property_damage: number | null;
      /** Symbol code strings, for the frontend BAPLiabilityCoverage.symbols type. */
      symbols: string[];
    };
    /** Named booleans the COI RPC reads for the ACORD 25 auto checkboxes. */
    symbols: AutoSymbolFlags;
  };
  extraction_source: string;
  extraction_confidence: number | null;
  extracted_at: string;
}

export interface ShapedBap {
  bapDetails: BapDetails;
  fieldEvidence: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Covered-auto symbol legend -> ACORD 25 checkbox booleans
//
// VERIFIED against this function's own prompt legend and src/types/
// commercial-auto.ts COVERAGE_SYMBOL_LABELS:
//   1  Any Auto
//   2  Owned Autos Only         3-6 owned subsets
//   7  Specifically Described Autos  == "SCHEDULED AUTOS"
//   8  Hired Autos Only
//   9  Non-Owned Autos Only
//   19 Mobile Equipment (no ACORD 25 checkbox -> ignored)
//
// NOTE: the task brief's inline hint said "7->hired, 8->scheduled", which is
// INVERTED from the ISO/ACORD legend; the brief also said to verify against the
// legend, which is done here. Symbol 7 is Specifically Described == scheduled;
// symbol 8 is Hired. Getting these backwards mis-checks the ACORD 25 boxes.
// ---------------------------------------------------------------------------

const SYMBOL_TO_FLAG: Record<number, keyof AutoSymbolFlags> = {
  1: 'any_auto',
  2: 'owned_autos',
  3: 'owned_autos',
  4: 'owned_autos',
  5: 'owned_autos',
  6: 'owned_autos',
  7: 'scheduled_autos',
  8: 'hired_autos',
  9: 'non_owned_autos',
};

// ---------------------------------------------------------------------------
// Scalar coercion helpers
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

export function normalizeLimitType(v: unknown): 'csl' | 'split' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s === 'csl' || s.includes('combined')) return 'csl';
  if (s === 'split') return 'split';
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

export function normalizeSymbolCodes(v: unknown): number[] {
  if (v === null || v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: number[] = [];
  for (const item of arr) {
    const n = typeof item === 'number' ? item : parseInt(String(item).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Symbol codes -> the five ACORD 25 auto booleans.
 * Empty codes => all null (unknown), so the COI shows "missing" rather than
 * asserting a definitive "no". Non-empty codes => explicit true/false.
 */
export function mapSymbolCodesToBooleans(codes: number[]): AutoSymbolFlags {
  if (!codes || codes.length === 0) {
    return {
      any_auto: null,
      owned_autos: null,
      scheduled_autos: null,
      hired_autos: null,
      non_owned_autos: null,
    };
  }
  const flags: AutoSymbolFlags = {
    any_auto: false,
    owned_autos: false,
    scheduled_autos: false,
    hired_autos: false,
    non_owned_autos: false,
  };
  for (const code of codes) {
    const key = SYMBOL_TO_FLAG[code];
    if (key) flags[key] = true;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// Flat-dotted evidence builder (adapted from the GL extractor's
// buildFieldEvidenceMapping). Walks a nested tree of `{ value, evidence_ids }`
// leaves and emits { "<dotted.path>": evidence_ids } for every leaf that cited
// evidence. Arrays are NOT descended (child rows carry their own evidence_ids
// columns), so passing a curated identity/dates/coverage subtree yields exactly
// the relative in-blob paths the COI RPC tests.
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
// Core: raw model extraction -> { bap_details, bap_field_evidence }
// ---------------------------------------------------------------------------

export function shapeBapDetails(raw: RawBapExtraction, nowIso: string): ShapedBap {
  const liab = raw.coverage?.liability ?? {};
  const symLeaf = raw.coverage?.covered_auto_symbols;
  const symCodes = normalizeSymbolCodes(symLeaf?.value);
  const symbols = mapSymbolCodesToBooleans(symCodes);

  const bapDetails: BapDetails = {
    identity: {
      carrier_name: toStringOrNull(raw.identity?.carrier_name?.value),
      carrier_naic: normalizeNaic(raw.identity?.carrier_naic?.value),
      policy_number: toStringOrNull(raw.identity?.policy_number?.value),
      transaction_type: toStringOrNull(raw.identity?.transaction_type?.value),
      named_insured: toStringOrNull(raw.identity?.named_insured?.value),
      dba: toStringOrNull(raw.identity?.dba?.value),
      mailing_address: {
        street: toStringOrNull(raw.identity?.mailing_address?.street?.value),
        city: toStringOrNull(raw.identity?.mailing_address?.city?.value),
        state: toStringOrNull(raw.identity?.mailing_address?.state?.value),
        zip: toStringOrNull(raw.identity?.mailing_address?.zip?.value),
      },
      fein: toStringOrNull(raw.identity?.fein?.value),
    },
    dates: {
      effective_date: toStringOrNull(raw.dates?.effective_date?.value),
      expiration_date: toStringOrNull(raw.dates?.expiration_date?.value),
    },
    coverage: {
      liability: {
        limit_type: normalizeLimitType(liab.limit_type?.value),
        csl_limit: toNumberOrNull(liab.csl_limit?.value),
        bodily_injury_per_person: toNumberOrNull(liab.bodily_injury_per_person?.value),
        bodily_injury_per_accident: toNumberOrNull(liab.bodily_injury_per_accident?.value),
        property_damage: toNumberOrNull(liab.property_damage?.value),
        symbols: symCodes.map(String),
      },
      symbols,
    },
    extraction_source: 'azure_di_claude',
    extraction_confidence: toNumberOrNull(raw.extraction_confidence),
    extracted_at: nowIso,
  };

  // Evidence map: reuse the recursive builder over a CURATED subtree so the
  // emitted keys are exactly the relative in-blob paths (no vehicles/drivers
  // arrays, and covered_auto_symbols is handled separately below because the
  // blob path is coverage.symbols.<name>, not coverage.covered_auto_symbols).
  // policy_number/fein live UNDER identity (GL house standard), so the walker
  // emits identity.policy_number / identity.fein automatically.
  const fieldEvidence = buildFlatDottedEvidence({
    identity: raw.identity,
    dates: raw.dates,
    coverage: { liability: raw.coverage?.liability },
  });

  // Attribute each TRUE symbol boolean to the covered-auto-symbols evidence.
  const symEv = symLeaf?.evidence_ids;
  if (Array.isArray(symEv) && symEv.length > 0) {
    for (const [name, on] of Object.entries(symbols)) {
      if (on === true) fieldEvidence[`coverage.symbols.${name}`] = symEv;
    }
  }

  return { bapDetails, fieldEvidence };
}

// ---------------------------------------------------------------------------
// Child-table row shapers (return rows WITHOUT policy_id; index.ts adds it).
// All defend the DB CHECK constraints and NOT NULL columns so a DELETE-then-
// INSERT batch cannot crash on one bad row.
// ---------------------------------------------------------------------------

const VEHICLE_USE_TYPES = ['service', 'retail', 'artisan', 'trucking', 'commercial', 'pleasure'];
const DRIVER_RELATIONSHIPS = ['employee', 'owner', 'family', 'other'];
const DRIVER_TYPES = ['rated', 'excluded', 'occasional'];
const MVR_STATUSES = ['clean', 'minor', 'major'];
const COVERAGE_TYPES = [
  'liability', 'comprehensive', 'collision', 'medical_payments', 'um', 'uim',
  'pip', 'hired_auto', 'non_owned_auto', 'towing_labor', 'rental_reimbursement', 'gap', 'other',
];
const COVERAGE_LIMIT_TYPES = ['csl', 'split', 'per_accident', 'per_person', 'per_day', 'per_occurrence'];
const INTEREST_TYPES = ['additional_insured', 'loss_payee', 'lienholder', 'lessor', 'additional_interest'];
const EXTRACTION_STATUSES = ['AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL'];

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
 * VIN is NOT NULL with a UNIQUE(policy_id, vin) index, but full VINs are masked
 * before they reach the model (agency PII policy — NO VIN exemption in
 * redaction). Store the partial VIN if one survived; otherwise a per-row
 * placeholder that keeps NOT NULL + uniqueness satisfied.
 */
export function vinForRow(vin: unknown, index: number): string {
  const v = toStringOrNull(vin);
  if (v && !/redacted/i.test(v)) return v.toUpperCase();
  return `UNKNOWN-${index + 1}`;
}

export function shapeVehicleRows(raw: RawBapExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.vehicles) ? raw.vehicles : [];
  const rows: Array<Record<string, unknown>> = [];
  list.forEach((item, index) => {
    const v = item as Record<string, unknown>;
    const make = toStringOrNull(v.make);
    const model = toStringOrNull(v.model);
    const year = toNumberOrNull(v.year);
    // NOT NULL: vin, year, make, model. Skip rows that cannot satisfy them.
    if (!make || !model || year === null) return;
    rows.push({
      unit_number: toStringOrNull(v.unit_number),
      vin: vinForRow(v.vin, index),
      year,
      make,
      model,
      body_type: toStringOrNull(v.body_type),
      gvw: toNumberOrNull(v.gvw),
      use_type: pickEnum(v.use_type, VEHICLE_USE_TYPES),
      garaging_zip: toStringOrNull(v.garaging_zip),
      garaging_state: toStringOrNull(v.garaging_state),
      cost_new: toNumberOrNull(v.cost_new),
      stated_amount: toNumberOrNull(v.stated_amount),
      comprehensive_deductible: toNumberOrNull((v.comprehensive_deductible ?? v.comp_deductible)),
      collision_deductible: toNumberOrNull((v.collision_deductible ?? v.coll_deductible)),
      special_equipment_coverage: toNumberOrNull(v.special_equipment_coverage),
      primary_driver_name: toStringOrNull(v.primary_driver_name),
      evidence_ids: evidenceIds(v.evidence_ids),
      extraction_confidence: toNumberOrNull(v.confidence),
      extraction_status: sanitizeStatus(v.status),
    });
  });
  return dedupeBy(rows, (r) => String(r.vin));
}

export function shapeDriverRows(raw: RawBapExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.drivers) ? raw.drivers : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const d = item as Record<string, unknown>;
    const name = toStringOrNull(d.name);
    if (!name) continue; // name is NOT NULL
    rows.push({
      name,
      date_of_birth: toDateOrNull(d.date_of_birth ?? d.dob),
      license_number: toStringOrNull(d.license_number),
      license_state: toStringOrNull(d.license_state),
      relationship: pickEnum(d.relationship, DRIVER_RELATIONSHIPS),
      driver_type: pickEnum(d.driver_type, DRIVER_TYPES),
      violations_points: toNumberOrNull(d.violations_points),
      accidents_count: toNumberOrNull(d.accidents_count),
      mvr_status: pickEnum(d.mvr_status, MVR_STATUSES),
      sr22_required: toBool(d.sr22_required),
      evidence_ids: evidenceIds(d.evidence_ids),
      extraction_confidence: toNumberOrNull(d.confidence),
      extraction_status: sanitizeStatus(d.status),
    });
  }
  return rows;
}

export function shapeCoverageRows(raw: RawBapExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.coverages) ? raw.coverages : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const c = item as Record<string, unknown>;
    const name = toStringOrNull(c.coverage_name);
    if (!name) continue; // coverage_name is NOT NULL
    rows.push({
      coverage_name: name,
      coverage_type: pickEnum(c.coverage_type, COVERAGE_TYPES, 'other'),
      symbols: normalizeSymbolCodes(c.symbols).map(String),
      limit_amount: toNumberOrNull((c.limit ?? c.limit_amount)),
      limit_type: pickEnum(c.limit_type, COVERAGE_LIMIT_TYPES),
      bi_per_person: toNumberOrNull(c.bi_per_person),
      bi_per_accident: toNumberOrNull(c.bi_per_accident),
      pd_per_accident: toNumberOrNull((c.pd_per_accident ?? c.property_damage)),
      deductible: toNumberOrNull(c.deductible),
      is_stacked: c.is_stacked === undefined ? null : toBool(c.is_stacked),
      is_rejected: c.is_rejected === undefined ? null : toBool(c.is_rejected),
      evidence_ids: evidenceIds(c.evidence_ids),
      extraction_confidence: toNumberOrNull(c.confidence),
      extraction_status: sanitizeStatus(c.status),
    });
  }
  // UNIQUE(policy_id, coverage_type) — collapse duplicates (last wins).
  return dedupeBy(rows, (r) => String(r.coverage_type));
}

/**
 * Additional interests + blanket AI/Waiver evidence -> policy_bap_interests rows.
 *
 * §4 (Blanket-as-evidence, never fabricate a "Y"): extraction records EVIDENCE,
 * never a confirmed endorsement. AI rows are written `endorsement_status =
 * 'requested'` (visible to resolve_holder_endorsements as a pending/requested
 * endorsement), NEVER 'endorsed' (which is the confirmed "Y" a human must
 * promote). A blanket endorsement is captured as a single synthetic row with
 * blanket=true so resolve_holder_endorsements matches any holder.
 *
 * Constraint bap_interests_ai_status_scope: non-AI rows MUST stay
 * endorsement_status='none'.
 */
export function shapeInterestRows(raw: RawBapExtraction): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  const named = Array.isArray(raw.additional_interests) ? raw.additional_interests : [];
  for (const item of named) {
    const i = item as Record<string, unknown>;
    const name = toStringOrNull(i.name);
    if (!name) continue; // name is NOT NULL
    const interestType = pickEnum(i.interest_type ?? i.coverage_type, INTEREST_TYPES, 'additional_interest')!;
    const isAI = interestType === 'additional_insured';
    const address = (i.address ?? {}) as Record<string, unknown>;
    rows.push({
      name,
      address_street: toStringOrNull(address.street ?? address.line1),
      address_city: toStringOrNull(address.city),
      address_state: toStringOrNull(address.state),
      address_zip: toStringOrNull(address.zip),
      relationship: toStringOrNull(i.relationship),
      interest_type: interestType,
      vehicle_vins: evidenceIds(i.vehicle_vins),
      vehicle_unit_numbers: evidenceIds(i.vehicle_unit_numbers),
      waiver_of_subrogation: isAI ? toBool(i.waiver_of_subrogation) : false,
      primary_noncontributory: isAI ? toBool(i.primary_noncontributory) : false,
      blanket: false,
      endorsement_status: isAI ? 'requested' : 'none',
      endorsement_form: toStringOrNull(i.endorsement_form),
      evidence_ids: evidenceIds(i.evidence_ids),
      extraction_confidence: toNumberOrNull(i.confidence),
      extraction_status: sanitizeStatus(i.status),
    });
  }

  // Blanket AI / blanket Waiver of Subrogation -> one synthetic blanket row.
  const aiEv = raw.additional_insured_evidence;
  const wvEv = raw.waiver_of_subrogation_evidence;
  const aiBlanket = !!(aiEv?.present && aiEv?.basis === 'blanket');
  const wvBlanket = !!(wvEv?.present && wvEv?.basis === 'blanket');
  if (aiBlanket || wvBlanket) {
    const forms = [...(aiEv?.form_numbers ?? []), ...(wvEv?.form_numbers ?? [])]
      .map((f) => toStringOrNull(f))
      .filter((f): f is string => !!f);
    rows.push({
      name: 'Blanket where required by written contract',
      address_street: null,
      address_city: null,
      address_state: null,
      address_zip: null,
      relationship: null,
      interest_type: 'additional_insured',
      vehicle_vins: [],
      vehicle_unit_numbers: [],
      waiver_of_subrogation: wvBlanket,
      primary_noncontributory: false,
      blanket: true,
      endorsement_status: 'requested', // evidence only — never a fabricated 'endorsed'
      endorsement_form: forms.length ? [...new Set(forms)].join(', ') : null,
      evidence_ids: [],
      extraction_confidence: null,
      extraction_status: 'NEEDS_REVIEW',
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Claude tool-use schema (single source of truth for index.ts)
// ---------------------------------------------------------------------------

export const BAP_EXTRACTION_TOOL_NAME = 'emit_bap_extraction';

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
 * Strict JSON Schema handed to Claude via `tools` + `tool_choice`. No premium
 * field anywhere (§2 agency rule). carrier_naic is explicitly the 5-digit
 * INSURER NAIC, never an industry NAICS/SIC (§3).
 */
export const BAP_EXTRACTION_TOOL_SCHEMA: Record<string, unknown> = {
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
        mailing_address: {
          type: 'object',
          properties: {
            street: leaf(STR),
            city: leaf(STR),
            state: leaf(STR),
            zip: leaf(STR),
          },
        },
        fein: leaf(STR, 'Federal Employer ID Number (EIN) of the named insured; used for customer matching. Business tax ID, not an SSN.'),
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
        liability: {
          type: 'object',
          properties: {
            limit_type: leaf({ type: ['string', 'null'], enum: ['csl', 'split', null] }, '"csl" for a Combined Single Limit, "split" for BI/PD split limits.'),
            csl_limit: leaf(NUM, 'Combined Single Limit amount when limit_type=csl.'),
            bodily_injury_per_person: leaf(NUM),
            bodily_injury_per_accident: leaf(NUM),
            property_damage: leaf(NUM),
          },
        },
        covered_auto_symbols: leaf(
          { type: 'array', items: { type: 'integer' } },
          'Covered-auto symbol CODES from the coverage grid: 1=Any Auto, 2=Owned Autos, 7=Specifically Described (Scheduled) Autos, 8=Hired Autos, 9=Non-Owned Autos.',
        ),
      },
    },
    vehicles: {
      type: 'array',
      description: 'Vehicle schedule. Full VINs are masked before you see them; store whatever VIN fragment is present, do not invent one.',
      items: {
        type: 'object',
        properties: {
          unit_number: STR,
          vin: STR,
          year: NUM,
          make: STR,
          model: STR,
          body_type: STR,
          gvw: NUM,
          use_type: { type: ['string', 'null'], enum: ['service', 'retail', 'artisan', 'trucking', 'commercial', 'pleasure', null] },
          garaging_zip: STR,
          garaging_state: STR,
          cost_new: NUM,
          stated_amount: NUM,
          comprehensive_deductible: NUM,
          collision_deductible: NUM,
          special_equipment_coverage: NUM,
          primary_driver_name: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    drivers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: STR,
          date_of_birth: STR,
          license_number: STR,
          license_state: STR,
          relationship: { type: ['string', 'null'], enum: ['employee', 'owner', 'family', 'other', null] },
          driver_type: { type: ['string', 'null'], enum: ['rated', 'excluded', 'occasional', null] },
          violations_points: NUM,
          accidents_count: NUM,
          mvr_status: { type: ['string', 'null'], enum: ['clean', 'minor', 'major', null] },
          sr22_required: { type: ['boolean', 'null'] },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    coverages: {
      type: 'array',
      description: 'Non-liability coverage lines (physical damage, UM/UIM, med pay, PIP, hired/non-owned, etc.).',
      items: {
        type: 'object',
        properties: {
          coverage_name: STR,
          coverage_type: { type: ['string', 'null'], enum: [...COVERAGE_TYPES, null] },
          symbols: { type: 'array', items: { type: 'integer' } },
          limit: NUM,
          limit_type: { type: ['string', 'null'], enum: [...COVERAGE_LIMIT_TYPES, null] },
          bi_per_person: NUM,
          bi_per_accident: NUM,
          pd_per_accident: NUM,
          deductible: NUM,
          is_stacked: { type: ['boolean', 'null'] },
          is_rejected: { type: ['boolean', 'null'] },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    additional_interests: {
      type: 'array',
      description: 'Named additional insureds, loss payees, lienholders, lessors listed by name.',
      items: {
        type: 'object',
        properties: {
          name: STR,
          interest_type: { type: ['string', 'null'], enum: [...INTEREST_TYPES, null] },
          address: {
            type: 'object',
            properties: { street: STR, city: STR, state: STR, zip: STR },
          },
          relationship: STR,
          vehicle_vins: { type: 'array', items: { type: 'string' } },
          vehicle_unit_numbers: { type: 'array', items: { type: 'string' } },
          waiver_of_subrogation: { type: ['boolean', 'null'] },
          primary_noncontributory: { type: ['boolean', 'null'] },
          endorsement_form: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    additional_insured_evidence: {
      type: 'object',
      description: 'Evidence of a BLANKET additional-insured endorsement (applies to anyone the insured has agreed to add by written contract). Do NOT assert a specific holder "Y".',
      properties: {
        present: { type: 'boolean' },
        basis: { type: ['string', 'null'], enum: ['blanket', 'scheduled', null] },
        form_numbers: { type: 'array', items: { type: 'string' } },
        source_span: STR,
      },
    },
    waiver_of_subrogation_evidence: {
      type: 'object',
      description: 'Evidence of a BLANKET waiver of subrogation endorsement. Do NOT assert a specific holder "Y".',
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
