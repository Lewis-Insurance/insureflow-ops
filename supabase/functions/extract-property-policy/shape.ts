/**
 * Commercial Property extraction shaping — PURE module (no Deno/Node, no DB,
 * no network, no remote imports).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `index.ts` (the edge entry point) imports Deno-only `https://` URLs and so
 * cannot be loaded by Vitest. Every decision that turns the model's structured
 * tool-use output into the exact JSONB the COI read model reads lives here,
 * where it is unit-testable from Node AND importable from the Deno runtime.
 * This mirrors the BAP template (extract-bap-policy/shape.ts).
 *
 * THE COI CONTRACT (do not drift these paths)
 * -------------------------------------------
 * Property is NOT a named ACORD 25 section — it prints in the generic "OTHER"
 * row. `coi_build_line` (supabase/migrations/20260702172000_master_coi_rpcs.sql,
 * property cells L951-960) builds that OTHER row ONLY from three fixed paths in
 * `policies.property_details` and treats each cell as "extracted" when the flat
 * `policies.property_field_evidence` map has the matching dotted key. The RPC
 * literally does `v_ev ? 'coi_summary.limit_amount'`, so the evidence-map KEY
 * FORMAT is load-bearing. The COI-critical paths this module writes:
 *
 *   property_details.coi_summary.label              (text)
 *   property_details.coi_summary.limit_amount       (number)
 *   property_details.coi_summary.limit_description  (text)
 *
 *   property_details.identity.{carrier_name,carrier_naic,policy_number,
 *                              transaction_type,named_insured,dba,fein}
 *   property_details.identity.mailing_address.{street,city,state,zip}
 *   property_details.dates.{effective_date,expiration_date}
 *
 * identity/dates follow the GL/BAP house standard so the Verify feature and the
 * COI named-insured mismatch check read `*_details.identity.*` / `.dates.*`
 * uniformly across every line.
 *
 * `property_field_evidence` keys are these same paths RELATIVE to the blob column
 * (no `property_details.` prefix), e.g. "coi_summary.limit_amount".
 *
 * The rich blob (form_details, valuation_summary, business_income,
 * ordinance_or_law) and the child tables (locations/buildings/coverages/
 * deductibles/interests/endorsements) are preserved — but they are NOT what the
 * COI reads. The coi_summary trio is. NO premium anywhere (§2 agency rule).
 */

// ---------------------------------------------------------------------------
// Raw model output types (what the tool_use block returns)
// ---------------------------------------------------------------------------

/**
 * Every scalar the model extracts is returned as a leaf so it can cite the
 * evidence catalog IDs alongside the value. `buildFlatDottedEvidence` walks these
 * leaves to emit the flat map the COI RPC reads.
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

export interface RawPropertyExtraction {
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
  /** COI-critical: the OTHER-row summary the model reads straight off the dec page. */
  coi_summary?: {
    label?: EvidenceLeaf<string>;
    limit_amount?: EvidenceLeaf<number>;
    limit_description?: EvidenceLeaf<string>;
  };
  form_details?: {
    form_type?: EvidenceLeaf<string>;
    is_iso_form?: EvidenceLeaf<boolean>;
    form_number?: EvidenceLeaf<string>;
  };
  valuation_summary?: {
    total_insured_value?: EvidenceLeaf<number>;
    total_building_value?: EvidenceLeaf<number>;
    total_bpp_value?: EvidenceLeaf<number>;
    is_blanket?: EvidenceLeaf<boolean>;
    blanket_limit?: EvidenceLeaf<number>;
    coinsurance_percent?: EvidenceLeaf<number>;
    is_agreed_value?: EvidenceLeaf<boolean>;
    margin_clause_percent?: EvidenceLeaf<number>;
  };
  business_income?: {
    is_included?: EvidenceLeaf<boolean>;
    limit_type?: EvidenceLeaf<string>;
    limit?: EvidenceLeaf<number>;
    waiting_period_hours?: EvidenceLeaf<number>;
    extra_expense_included?: EvidenceLeaf<boolean>;
  };
  ordinance_or_law?: {
    is_included?: EvidenceLeaf<boolean>;
    coverage_a_limit?: EvidenceLeaf<number>;
    coverage_b_limit?: EvidenceLeaf<number>;
    coverage_c_limit?: EvidenceLeaf<number>;
    combined_limit?: EvidenceLeaf<number>;
  };
  locations?: unknown[];
  buildings?: unknown[];
  building_coverages?: unknown[];
  deductibles?: unknown[];
  interests?: unknown[];
  endorsements?: unknown[];
  additional_insured_evidence?: RawBlanketEvidence;
  waiver_of_subrogation_evidence?: RawBlanketEvidence;
  extraction_confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Shaped output types (what lands in policies.property_details)
// ---------------------------------------------------------------------------

export interface PropertyDetails {
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
  /** The three cells the ACORD 25 OTHER row prints for Property. */
  coi_summary: {
    label: string | null;
    limit_amount: number | null;
    limit_description: string | null;
  };
  form_details: {
    form_type: string | null;
    is_iso_form: boolean | null;
    form_number: string | null;
  };
  valuation_summary: {
    total_insured_value: number | null;
    total_building_value: number | null;
    total_bpp_value: number | null;
    is_blanket: boolean;
    blanket_limit: number | null;
    coinsurance_percent: number | null;
    is_agreed_value: boolean;
    margin_clause_percent: number | null;
  };
  business_income?: {
    is_included: true;
    limit_type: string | null;
    limit: number | null;
    waiting_period_hours: number | null;
    extra_expense_included: boolean | null;
  };
  ordinance_or_law?: {
    is_included: true;
    coverage_a_limit: number | null;
    coverage_b_limit: number | null;
    coverage_c_limit: number | null;
    combined_limit: number | null;
  };
  extraction_source: string;
  extraction_confidence: number | null;
  extracted_at: string;
}

export interface ShapedProperty {
  propertyDetails: PropertyDetails;
  fieldEvidence: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Scalar coercion helpers (ported from the BAP template)
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

export function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (/^(y|yes|true|1)$/.test(t)) return true;
    if (/^(n|no|false|0)$/.test(t)) return false;
  }
  return null;
}

/**
 * Insurer NAIC is a 3-5 digit company code. An industry NAICS/SIC is 6 digits
 * (§ agency rule: insurer NAIC != industry NAICS/SIC) — reject those rather than
 * mislabel one as a carrier NAIC. Absent -> null (name->NAIC lookup is
 * downstream); never guess.
 */
export function normalizeNaic(v: unknown): string | null {
  const s = toStringOrNull(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length <= 5) return digits;
  return null;
}

/** A leaf value or the value itself — child items are leaf-shaped ({value,...}). */
export function leafValue(node: unknown): unknown {
  if (node && typeof node === 'object' && !Array.isArray(node) && 'value' in (node as Record<string, unknown>)) {
    return (node as Record<string, unknown>).value;
  }
  return node;
}

export function evidenceIds(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
}

function pickEnum(v: unknown, allowed: string[], fallback: string | null = null): string | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (s && allowed.includes(s)) return s;
  return fallback;
}

function toTextArrayOrNull(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  const arr = Array.isArray(v) ? v : [v];
  const out = arr.map((x) => toStringOrNull(x)).filter((x): x is string => !!x);
  return out.length ? out : null;
}

function dedupeBy<T>(rows: T[], keyFn: (row: T) => string): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(keyFn(row), row); // last wins
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Flat-dotted evidence builder (identical to the BAP template). Walks a nested
// tree of `{ value, evidence_ids }` leaves and emits { "<dotted.path>":
// evidence_ids } for every leaf that cited evidence. Arrays are NOT descended
// (child rows carry their own evidence_ids columns).
// ---------------------------------------------------------------------------

export function buildFlatDottedEvidence(root: unknown): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.evidence_ids) && (obj.evidence_ids as unknown[]).length > 0) {
      map[path] = (obj.evidence_ids as unknown[]).filter((x) => typeof x === 'string') as string[];
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
// coi_summary production — the COI-critical output.
//
// STRATEGY: prefer the model's directly-read coi_summary leaves (most reliable —
// the model reads the OTHER-row label + headline limit straight off the dec
// page). If the model omits limit_amount, DERIVE it from the richest available
// valuation figure and carry that source's evidence so the OTHER row still shows
// as "extracted" (the COI RPC keys "extracted" on the evidence-map key). Label /
// limit_description fall back to a deterministic, heuristic string when absent
// (no evidence attributed — value still prints, provenance shows "missing").
//
// Derivation priority for limit_amount (documented so the fallback is auditable):
//   1. valuation_summary.blanket_limit          (when is_blanket)
//   2. valuation_summary.total_insured_value    (TIV)
//   3. total_building_value + total_bpp_value    (sum of the two)
// ---------------------------------------------------------------------------

export interface CoiSummaryResult {
  label: string | null;
  limit_amount: number | null;
  limit_description: string | null;
  /** Evidence to publish under coi_summary.<leaf> in property_field_evidence. */
  evidence: {
    label?: string[];
    limit_amount?: string[];
    limit_description?: string[];
  };
  /** Which leaves were derived (vs. read from the model) and the limit source. */
  derived: {
    label: boolean;
    limit_amount: boolean;
    limit_description: boolean;
    limit_source: string | null;
  };
}

export function buildCoiSummary(raw: RawPropertyExtraction): CoiSummaryResult {
  const cs = raw.coi_summary ?? {};
  const val = raw.valuation_summary ?? {};
  const evidence: CoiSummaryResult['evidence'] = {};
  const derived: CoiSummaryResult['derived'] = {
    label: false,
    limit_amount: false,
    limit_description: false,
    limit_source: null,
  };

  const isBlanket = toBool(val.is_blanket?.value);

  // --- limit_amount -------------------------------------------------------
  let limit_amount = toNumberOrNull(cs.limit_amount?.value);
  const modelLimitEv = evidenceIds(cs.limit_amount?.evidence_ids);
  if (limit_amount !== null) {
    if (modelLimitEv.length) evidence.limit_amount = modelLimitEv;
  } else {
    const blanketLimit = toNumberOrNull(val.blanket_limit?.value);
    const tiv = toNumberOrNull(val.total_insured_value?.value);
    const bldg = toNumberOrNull(val.total_building_value?.value);
    const bpp = toNumberOrNull(val.total_bpp_value?.value);
    if (isBlanket && blanketLimit !== null) {
      limit_amount = blanketLimit;
      derived.limit_amount = true;
      derived.limit_source = 'valuation_summary.blanket_limit';
      const ev = evidenceIds(val.blanket_limit?.evidence_ids);
      if (ev.length) evidence.limit_amount = ev;
    } else if (tiv !== null) {
      limit_amount = tiv;
      derived.limit_amount = true;
      derived.limit_source = 'valuation_summary.total_insured_value';
      const ev = evidenceIds(val.total_insured_value?.evidence_ids);
      if (ev.length) evidence.limit_amount = ev;
    } else if (bldg !== null || bpp !== null) {
      limit_amount = (bldg ?? 0) + (bpp ?? 0);
      derived.limit_amount = true;
      derived.limit_source = 'valuation_summary.total_building_value+total_bpp_value';
      const ev = [
        ...evidenceIds(val.total_building_value?.evidence_ids),
        ...evidenceIds(val.total_bpp_value?.evidence_ids),
      ];
      if (ev.length) evidence.limit_amount = [...new Set(ev)];
    }
  }

  // --- label --------------------------------------------------------------
  let label = toStringOrNull(cs.label?.value);
  const modelLabelEv = evidenceIds(cs.label?.evidence_ids);
  if (label !== null) {
    if (modelLabelEv.length) evidence.label = modelLabelEv;
  } else {
    label = isBlanket ? 'Blanket Building & Personal Property' : 'Building & Personal Property';
    derived.label = true;
  }

  // --- limit_description --------------------------------------------------
  let limit_description = toStringOrNull(cs.limit_description?.value);
  const modelDescEv = evidenceIds(cs.limit_description?.evidence_ids);
  if (limit_description !== null) {
    if (modelDescEv.length) evidence.limit_description = modelDescEv;
  } else {
    const parts: string[] = [];
    if (isBlanket) parts.push('Blanket');
    parts.push('Bldg & BPP');
    const form = toStringOrNull(raw.form_details?.form_type?.value);
    if (form && /special/i.test(form)) parts.push('Special Form');
    else if (form && /broad/i.test(form)) parts.push('Broad Form');
    else if (form && /basic/i.test(form)) parts.push('Basic Form');
    if (toBool(val.is_agreed_value?.value)) parts.push('Agreed Value');
    limit_description = parts.join(', ');
    derived.limit_description = true;
  }

  return { label, limit_amount, limit_description, evidence, derived };
}

// ---------------------------------------------------------------------------
// Core: raw model extraction -> { property_details, property_field_evidence }
// ---------------------------------------------------------------------------

export function shapePropertyDetails(raw: RawPropertyExtraction, nowIso: string): ShapedProperty {
  const coi = buildCoiSummary(raw);
  const val = raw.valuation_summary ?? {};
  const bi = raw.business_income ?? {};
  const ol = raw.ordinance_or_law ?? {};

  const propertyDetails: PropertyDetails = {
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
    coi_summary: {
      label: coi.label,
      limit_amount: coi.limit_amount,
      limit_description: coi.limit_description,
    },
    form_details: {
      form_type: toStringOrNull(raw.form_details?.form_type?.value),
      is_iso_form: toBoolOrNull(raw.form_details?.is_iso_form?.value),
      form_number: toStringOrNull(raw.form_details?.form_number?.value),
    },
    valuation_summary: {
      total_insured_value: toNumberOrNull(val.total_insured_value?.value),
      total_building_value: toNumberOrNull(val.total_building_value?.value),
      total_bpp_value: toNumberOrNull(val.total_bpp_value?.value),
      is_blanket: toBool(val.is_blanket?.value),
      blanket_limit: toNumberOrNull(val.blanket_limit?.value),
      coinsurance_percent: toNumberOrNull(val.coinsurance_percent?.value),
      is_agreed_value: toBool(val.is_agreed_value?.value),
      margin_clause_percent: toNumberOrNull(val.margin_clause_percent?.value),
    },
    extraction_source: 'azure_di_claude',
    extraction_confidence: toNumberOrNull(raw.extraction_confidence),
    extracted_at: nowIso,
  };

  // Rich optional blocks — kept only when the model flagged them included.
  if (toBool(bi.is_included?.value)) {
    propertyDetails.business_income = {
      is_included: true,
      limit_type: toStringOrNull(bi.limit_type?.value),
      limit: toNumberOrNull(bi.limit?.value),
      waiting_period_hours: toNumberOrNull(bi.waiting_period_hours?.value),
      extra_expense_included: toBoolOrNull(bi.extra_expense_included?.value),
    };
  }
  if (toBool(ol.is_included?.value)) {
    propertyDetails.ordinance_or_law = {
      is_included: true,
      coverage_a_limit: toNumberOrNull(ol.coverage_a_limit?.value),
      coverage_b_limit: toNumberOrNull(ol.coverage_b_limit?.value),
      coverage_c_limit: toNumberOrNull(ol.coverage_c_limit?.value),
      combined_limit: toNumberOrNull(ol.combined_limit?.value),
    };
  }

  // Evidence map: identity + dates via the recursive walker (emits
  // identity.*, dates.*), then the coi_summary leaves EXPLICITLY so a DERIVED
  // limit_amount still carries its valuation-source evidence key.
  const fieldEvidence = buildFlatDottedEvidence({
    identity: raw.identity,
    dates: raw.dates,
  });
  if (coi.evidence.label) fieldEvidence['coi_summary.label'] = coi.evidence.label;
  if (coi.evidence.limit_amount) fieldEvidence['coi_summary.limit_amount'] = coi.evidence.limit_amount;
  if (coi.evidence.limit_description) fieldEvidence['coi_summary.limit_description'] = coi.evidence.limit_description;

  return { propertyDetails, fieldEvidence };
}

// ---------------------------------------------------------------------------
// Child-row helpers + enums (defend the DB CHECK constraints and NOT NULL cols
// so a DELETE-then-INSERT batch cannot crash on one bad row). Rows are returned
// WITHOUT policy_id; index.ts adds it.
// ---------------------------------------------------------------------------

const EXTRACTION_STATUSES = ['AUTO_APPLIED', 'NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'LOW_CONFIDENCE', 'NOT_FOUND', 'CONFLICT', 'MANUAL'];
const CONSTRUCTION_TYPES = ['frame', 'joisted_masonry', 'noncombustible', 'masonry_noncombustible', 'modified_fire_resistive', 'fire_resistive'];
const VALUATION_BASES = ['replacement_cost', 'actual_cash_value', 'functional_replacement', 'stated_amount', 'agreed_value'];
const DEDUCTIBLE_PERILS = ['aop', 'wind_hail', 'named_storm', 'hurricane', 'flood', 'earthquake', 'water_damage', 'theft', 'vandalism', 'freeze'];
const DEDUCTIBLE_TYPES = ['flat', 'percentage_tiv', 'percentage_building', 'percentage_claim'];
const DEDUCTIBLE_APPLIES_TO = ['per_occurrence', 'per_building', 'per_location', 'policy', 'tiv'];
// Property interest CHECK set differs from BAP: mortgagee/lenders_loss_payable
// exist here; lienholder/lessor do NOT (would violate the CHECK).
const PROPERTY_INTEREST_TYPES = ['mortgagee', 'loss_payee', 'lenders_loss_payable', 'additional_insured', 'additional_interest'];
const ENDORSEMENT_CATEGORIES = ['wind_hail', 'water_damage', 'ordinance_or_law', 'protective_safeguards', 'vacancy', 'margin_clause', 'coinsurance', 'acv', 'roof', 'flood_quake', 'named_storm', 'other'];

const ISO_CLASS_BY_CONSTRUCTION: Record<string, number> = {
  frame: 1,
  joisted_masonry: 2,
  noncombustible: 3,
  masonry_noncombustible: 4,
  modified_fire_resistive: 5,
  fire_resistive: 6,
};

function collectEvidenceIds(obj: unknown): string[] {
  const ids: string[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if (Array.isArray(rec.evidence_ids)) {
      for (const x of rec.evidence_ids) if (typeof x === 'string') ids.push(x);
    }
    for (const k of Object.keys(rec)) {
      const c = rec[k];
      if (c && typeof c === 'object') walk(c);
    }
  };
  walk(obj);
  return [...new Set(ids)];
}

function avgConfidence(obj: unknown): number | null {
  const confs: number[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if (typeof rec.confidence === 'number' && Number.isFinite(rec.confidence)) confs.push(rec.confidence);
    for (const k of Object.keys(rec)) {
      const c = rec[k];
      if (c && typeof c === 'object') walk(c);
    }
  };
  walk(obj);
  return confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
}

function rowExtractionStatus(obj: unknown): string {
  const statuses: string[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if (typeof rec.status === 'string') statuses.push(rec.status.toUpperCase());
    for (const k of Object.keys(rec)) {
      const c = rec[k];
      if (c && typeof c === 'object') walk(c);
    }
  };
  walk(obj);
  let result = 'AUTO_APPLIED';
  if (statuses.includes('CONFLICT')) result = 'CONFLICT';
  else if (statuses.includes('LOW_CONFIDENCE')) result = 'LOW_CONFIDENCE';
  else if (statuses.includes('NEEDS_REVIEW')) result = 'NEEDS_REVIEW';
  else if (statuses.length > 0 && statuses.every((s) => s === 'NOT_FOUND')) result = 'NOT_FOUND';
  return EXTRACTION_STATUSES.includes(result) ? result : 'AUTO_APPLIED';
}

export function normalizeConstructionType(v: unknown): string | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (CONSTRUCTION_TYPES.includes(s)) return s;
  if (s.includes('fire') && s.includes('resist')) return 'fire_resistive';
  if (s.includes('modified')) return 'modified_fire_resistive';
  if (s.includes('masonry') && (s.includes('non') || s.includes('nc'))) return 'masonry_noncombustible';
  if (s.includes('joist')) return 'joisted_masonry';
  if (s.includes('non') && s.includes('comb')) return 'noncombustible';
  if (s.includes('frame') || s.includes('wood')) return 'frame';
  return null;
}

export function shapeLocationRows(raw: RawPropertyExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.locations) ? raw.locations : [];
  const rows: Array<Record<string, unknown>> = [];
  list.forEach((item, i) => {
    const loc = item as Record<string, unknown>;
    const locNum = toNumberOrNull(leafValue(loc.location_number)) ?? i + 1; // NOT NULL
    rows.push({
      location_number: locNum,
      street: toStringOrNull(leafValue(loc.street)),
      city: toStringOrNull(leafValue(loc.city)),
      state: toStringOrNull(leafValue(loc.state)),
      zip: toStringOrNull(leafValue(loc.zip)),
      county: toStringOrNull(leafValue(loc.county)),
      territory: toStringOrNull(leafValue(loc.territory)),
      protection_class: toStringOrNull(leafValue(loc.protection_class)),
      occupancy: toStringOrNull(leafValue(loc.occupancy)),
      evidence_ids: collectEvidenceIds(loc),
      extraction_confidence: avgConfidence(loc),
      extraction_status: rowExtractionStatus(loc),
    });
  });
  return dedupeBy(rows, (r) => String(r.location_number)); // UNIQUE(policy_id, location_number)
}

export function shapeBuildingRows(raw: RawPropertyExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.buildings) ? raw.buildings : [];
  const rows: Array<Record<string, unknown>> = [];
  list.forEach((item, i) => {
    const b = item as Record<string, unknown>;
    const bNum = toNumberOrNull(leafValue(b.building_number)) ?? i + 1; // NOT NULL
    const lNum = toNumberOrNull(leafValue(b.location_number)) ?? 1; // NOT NULL
    const constructionType = normalizeConstructionType(leafValue(b.construction_type));
    const isoClass = toNumberOrNull(leafValue(b.iso_construction_class))
      ?? (constructionType ? ISO_CLASS_BY_CONSTRUCTION[constructionType] ?? null : null);
    rows.push({
      building_number: bNum,
      location_number: lNum,
      description: toStringOrNull(leafValue(b.description)),
      construction_type: constructionType,
      iso_construction_class: isoClass,
      occupancy: toStringOrNull(leafValue(b.occupancy)),
      year_built: toNumberOrNull(leafValue(b.year_built)),
      square_footage: toNumberOrNull(leafValue(b.square_footage)),
      stories: toNumberOrNull(leafValue(b.stories)),
      roof_type: toStringOrNull(leafValue(b.roof_type)),
      roof_age: toNumberOrNull(leafValue(b.roof_age)),
      has_sprinklers: toBoolOrNull(leafValue(b.has_sprinklers)),
      valuation_basis: pickEnum(leafValue(b.valuation_basis), VALUATION_BASES, null),
      coinsurance_percent: toNumberOrNull(leafValue(b.coinsurance_percent)),
      is_agreed_value: toBoolOrNull(leafValue(b.is_agreed_value)) ?? false,
      evidence_ids: collectEvidenceIds(b),
      extraction_confidence: avgConfidence(b),
      extraction_status: rowExtractionStatus(b),
    });
  });
  return dedupeBy(rows, (r) => `${r.location_number}:${r.building_number}`); // UNIQUE(policy_id, location, building)
}

export function shapeBuildingCoverageRows(raw: RawPropertyExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.building_coverages) ? raw.building_coverages : [];
  const rows: Array<Record<string, unknown>> = [];
  list.forEach((item) => {
    const c = item as Record<string, unknown>;
    rows.push({
      building_number: toNumberOrNull(leafValue(c.building_number)) ?? 1, // NOT NULL
      location_number: toNumberOrNull(leafValue(c.location_number)) ?? 1, // NOT NULL
      building_limit: toNumberOrNull(leafValue(c.building_limit)),
      bpp_limit: toNumberOrNull(leafValue(c.bpp_limit)),
      tenant_improvements_limit: toNumberOrNull(leafValue(c.tenant_improvements_limit)),
      stock_limit: toNumberOrNull(leafValue(c.stock_limit)),
      evidence_ids: collectEvidenceIds(c),
      extraction_confidence: avgConfidence(c),
      extraction_status: rowExtractionStatus(c),
    });
  });
  return dedupeBy(rows, (r) => `${r.location_number}:${r.building_number}`); // UNIQUE(policy_id, location, building)
}

export function shapeDeductibleRows(raw: RawPropertyExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.deductibles) ? raw.deductibles : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const d = item as Record<string, unknown>;
    const amount = toNumberOrNull(leafValue(d.amount));
    if (amount === null) continue; // amount is NOT NULL — cannot insert a null-amount deductible
    rows.push({
      name: toStringOrNull(leafValue(d.name)) ?? 'Deductible', // NOT NULL
      peril: pickEnum(leafValue(d.peril), DEDUCTIBLE_PERILS, 'aop')!, // NOT NULL enum
      amount,
      deductible_type: pickEnum(leafValue(d.deductible_type), DEDUCTIBLE_TYPES, 'flat')!, // NOT NULL enum
      percentage: toNumberOrNull(leafValue(d.percentage)),
      applies_to: pickEnum(leafValue(d.applies_to), DEDUCTIBLE_APPLIES_TO, 'per_occurrence'),
      state_conditions: toTextArrayOrNull(leafValue(d.state_conditions)),
      evidence_ids: collectEvidenceIds(d),
      extraction_confidence: avgConfidence(d),
      extraction_status: rowExtractionStatus(d),
    });
  }
  return rows;
}

/**
 * Named interests + blanket AI/Waiver evidence -> policy_property_interests rows.
 *
 * §4 (Blanket-as-evidence, never fabricate a "Y"): extraction records EVIDENCE,
 * never a confirmed endorsement. AI rows are written endorsement_status
 * 'requested' (visible to resolve_holder_endorsements as pending/requested),
 * NEVER 'endorsed' (the confirmed "Y" a human must promote). A blanket
 * endorsement is captured as ONE synthetic row with blanket=true.
 *
 * Constraint property_interests_ai_status_scope: non-AI rows MUST keep
 * endorsement_status='none'.
 */
export function shapeInterestRows(raw: RawPropertyExtraction): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  const named = Array.isArray(raw.interests) ? raw.interests : [];
  for (const item of named) {
    const i = item as Record<string, unknown>;
    const name = toStringOrNull(leafValue(i.name));
    if (!name) continue; // name is NOT NULL
    const interestType = pickEnum(leafValue(i.interest_type), PROPERTY_INTEREST_TYPES, 'mortgagee')!;
    const isAI = interestType === 'additional_insured';
    const address = (i.address ?? {}) as Record<string, unknown>;
    rows.push({
      interest_type: interestType,
      name,
      street: toStringOrNull(leafValue(i.street) ?? leafValue(address.street)),
      city: toStringOrNull(leafValue(i.city) ?? leafValue(address.city)),
      state: toStringOrNull(leafValue(i.state) ?? leafValue(address.state)),
      zip: toStringOrNull(leafValue(i.zip) ?? leafValue(address.zip)),
      loan_number: toStringOrNull(leafValue(i.loan_number)),
      location_number: toNumberOrNull(leafValue(i.location_number)),
      building_number: toNumberOrNull(leafValue(i.building_number)),
      waiver_of_subrogation: isAI ? toBool(leafValue(i.waiver_of_subrogation)) : false,
      primary_noncontributory: isAI ? toBool(leafValue(i.primary_noncontributory)) : false,
      blanket: false,
      endorsement_status: isAI ? 'requested' : 'none', // §4 — never 'endorsed'
      endorsement_form: toStringOrNull(leafValue(i.endorsement_form)),
      evidence_ids: collectEvidenceIds(i),
      extraction_confidence: avgConfidence(i),
      extraction_status: rowExtractionStatus(i),
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
      interest_type: 'additional_insured',
      name: 'Blanket per written contract',
      street: null,
      city: null,
      state: null,
      zip: null,
      loan_number: null,
      location_number: null,
      building_number: null,
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

export function shapeEndorsementRows(raw: RawPropertyExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.endorsements) ? raw.endorsements : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const e = item as Record<string, unknown>;
    rows.push({
      form_number: toStringOrNull(leafValue(e.form_number)) ?? 'Unknown', // NOT NULL
      title: toStringOrNull(leafValue(e.title)) ?? 'Endorsement', // NOT NULL
      edition_date: toStringOrNull(leafValue(e.edition_date)),
      category: pickEnum(leafValue(e.category), ENDORSEMENT_CATEGORIES, null),
      is_limitation: toBool(leafValue(e.is_limitation)),
      location_number: toNumberOrNull(leafValue(e.location_number)),
      building_number: toNumberOrNull(leafValue(e.building_number)),
      evidence_ids: collectEvidenceIds(e),
      extraction_confidence: avgConfidence(e),
      extraction_status: rowExtractionStatus(e),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Claude tool-use schema (single source of truth for index.ts)
// ---------------------------------------------------------------------------

export const PROPERTY_EXTRACTION_TOOL_NAME = 'emit_property_extraction';

const leaf = (valueSchema: Record<string, unknown>, desc?: string) => ({
  type: 'object',
  ...(desc ? { description: desc } : {}),
  properties: {
    value: valueSchema,
    evidence_ids: { type: 'array', items: { type: 'string' }, description: 'Evidence catalog IDs (E####) that support this value.' },
    confidence: { type: ['number', 'null'] },
    status: { type: ['string', 'null'] },
  },
});

const STR = { type: ['string', 'null'] };
const NUM = { type: ['number', 'null'] };
const BOOL = { type: ['boolean', 'null'] };

/**
 * Strict JSON Schema handed to Claude via `tools` + `tool_choice`. No premium
 * field anywhere (§2 agency rule). carrier_naic is explicitly the 5-digit
 * INSURER NAIC, never an industry NAICS/SIC (§3). coi_summary is REQUIRED — it
 * is the only thing Property contributes to a certificate.
 */
export const PROPERTY_EXTRACTION_TOOL_SCHEMA: Record<string, unknown> = {
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
    coi_summary: {
      type: 'object',
      description: 'REQUIRED. The single Property line that prints on an ACORD 25 in the generic OTHER row. Read these three directly off the dec/coverage summary — they are the ONLY thing Property contributes to a certificate.',
      properties: {
        label: leaf(STR, 'Short coverage label for the OTHER row, e.g. "Building & Personal Property", "Blanket Building & BPP", "Special Form Property".'),
        limit_amount: leaf(NUM, 'The single headline limit that best represents the coverage: the blanket limit if blanket, else the Total Insured Value, else the Building + BPP total.'),
        limit_description: leaf(STR, 'Short free text describing the limit, e.g. "Blanket Bldg & BPP, Special Form, RC".'),
      },
    },
    form_details: {
      type: 'object',
      properties: {
        form_type: leaf(STR, '"special" (CP 10 30), "broad" (CP 10 20), or "basic" (CP 10 10).'),
        is_iso_form: leaf(BOOL),
        form_number: leaf(STR),
      },
    },
    valuation_summary: {
      type: 'object',
      properties: {
        total_insured_value: leaf(NUM, 'Total Insured Value (TIV) across all buildings/BPP.'),
        total_building_value: leaf(NUM),
        total_bpp_value: leaf(NUM, 'Total Business Personal Property value.'),
        is_blanket: leaf(BOOL, 'True when limits are written blanket across buildings/coverages.'),
        blanket_limit: leaf(NUM, 'The single blanket limit when is_blanket is true.'),
        coinsurance_percent: leaf(NUM),
        is_agreed_value: leaf(BOOL),
        margin_clause_percent: leaf(NUM),
      },
    },
    business_income: {
      type: 'object',
      properties: {
        is_included: leaf(BOOL),
        limit_type: leaf(STR, '"actual_loss_sustained" or "specific_limit".'),
        limit: leaf(NUM),
        waiting_period_hours: leaf(NUM),
        extra_expense_included: leaf(BOOL),
      },
    },
    ordinance_or_law: {
      type: 'object',
      properties: {
        is_included: leaf(BOOL),
        coverage_a_limit: leaf(NUM),
        coverage_b_limit: leaf(NUM),
        coverage_c_limit: leaf(NUM),
        combined_limit: leaf(NUM),
      },
    },
    locations: {
      type: 'array',
      description: 'Schedule of insured locations/premises.',
      items: {
        type: 'object',
        properties: {
          location_number: leaf(NUM),
          street: leaf(STR),
          city: leaf(STR),
          state: leaf(STR),
          zip: leaf(STR),
          county: leaf(STR),
          territory: leaf(STR),
          protection_class: leaf(STR),
          occupancy: leaf(STR),
        },
      },
    },
    buildings: {
      type: 'array',
      description: 'Schedule of buildings/structures.',
      items: {
        type: 'object',
        properties: {
          building_number: leaf(NUM),
          location_number: leaf(NUM),
          description: leaf(STR),
          construction_type: leaf(STR, 'One of: frame, joisted_masonry, noncombustible, masonry_noncombustible, modified_fire_resistive, fire_resistive.'),
          iso_construction_class: leaf(NUM),
          occupancy: leaf(STR),
          year_built: leaf(NUM),
          square_footage: leaf(NUM),
          stories: leaf(NUM),
          roof_type: leaf(STR),
          roof_age: leaf(NUM),
          has_sprinklers: leaf(BOOL),
          valuation_basis: leaf(STR, 'One of: replacement_cost, actual_cash_value, functional_replacement, stated_amount, agreed_value.'),
          coinsurance_percent: leaf(NUM),
          is_agreed_value: leaf(BOOL),
        },
      },
    },
    building_coverages: {
      type: 'array',
      description: 'Per-building coverage limits, keyed by location_number + building_number.',
      items: {
        type: 'object',
        properties: {
          building_number: leaf(NUM),
          location_number: leaf(NUM),
          building_limit: leaf(NUM),
          bpp_limit: leaf(NUM),
          tenant_improvements_limit: leaf(NUM),
          stock_limit: leaf(NUM),
        },
      },
    },
    deductibles: {
      type: 'array',
      description: 'ALL deductible layers (AOP, Wind/Hail, Named Storm, Flood, Earthquake, ...). Only include a row when the deductible AMOUNT is known.',
      items: {
        type: 'object',
        properties: {
          name: leaf(STR),
          peril: leaf(STR, 'One of: aop, wind_hail, named_storm, hurricane, flood, earthquake, water_damage, theft, vandalism, freeze.'),
          amount: leaf(NUM),
          deductible_type: leaf(STR, 'One of: flat, percentage_tiv, percentage_building, percentage_claim.'),
          percentage: leaf(NUM),
          applies_to: leaf(STR, 'One of: per_occurrence, per_building, per_location, policy, tiv.'),
          state_conditions: leaf({ type: ['array', 'null'], items: { type: 'string' } }),
        },
      },
    },
    interests: {
      type: 'array',
      description: 'Named mortgagees, loss payees, lenders loss payable, and specifically-named additional insureds.',
      items: {
        type: 'object',
        properties: {
          interest_type: leaf(STR, 'One of: mortgagee, loss_payee, lenders_loss_payable, additional_insured, additional_interest.'),
          name: leaf(STR),
          street: leaf(STR),
          city: leaf(STR),
          state: leaf(STR),
          zip: leaf(STR),
          loan_number: leaf(STR),
          location_number: leaf(NUM),
          building_number: leaf(NUM),
          waiver_of_subrogation: leaf(BOOL),
          primary_noncontributory: leaf(BOOL),
          endorsement_form: leaf(STR),
        },
      },
    },
    endorsements: {
      type: 'array',
      description: 'Attached forms/endorsements. Flag high-impact ones by category.',
      items: {
        type: 'object',
        properties: {
          form_number: leaf(STR),
          title: leaf(STR),
          edition_date: leaf(STR),
          category: leaf(STR, 'One of: wind_hail, water_damage, ordinance_or_law, protective_safeguards, vacancy, margin_clause, coinsurance, acv, roof, flood_quake, named_storm, other.'),
          is_limitation: leaf(BOOL),
          location_number: leaf(NUM),
          building_number: leaf(NUM),
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
  required: ['coi_summary'],
};
