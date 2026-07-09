/**
 * Commercial Umbrella / Excess Liability extraction shaping — PURE module (no
 * Deno/Node, no DB, no network, no remote imports).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `index.ts` (the edge entry point) imports Deno-only `https://` URLs and so
 * cannot be loaded by Vitest. Every decision that turns Claude's structured
 * tool-use output into the exact JSONB the COI read model reads lives here,
 * where it is unit-testable from Node AND importable from the Deno runtime.
 * Modeled on extract-bap-policy/shape.ts — keep the two in step.
 *
 * THE CONTRACT (do not drift these paths)
 * ---------------------------------------
 * `get_master_coi` / `coi_build_line`
 * (supabase/migrations/20260702172000_master_coi_rpcs.sql, umbrella cells
 * L883-900) read FIXED paths out of `policies.umbrella_details` and treat a cell
 * as "extracted" when the flat `policies.umbrella_field_evidence` map has the
 * matching dotted key. The RPC literally does `v_ev ? 'limits.per_occurrence'`,
 * so the evidence-map KEY FORMAT is load-bearing. The paths this module writes:
 *
 *   umbrella_details.policy_type                              ("umbrella" | "excess")
 *   umbrella_details.coi_summary.occurrence_or_claims_made    ("occurrence" | "claims_made")
 *   umbrella_details.limits.per_occurrence                    (number, required cell)
 *   umbrella_details.limits.aggregate                         (number)
 *   umbrella_details.coi_summary.ded_or_retention_kind        ("deductible" | "retention")
 *   umbrella_details.retention.amount                         (number — the KIND lives in coi_summary)
 *   umbrella_details.identity.{carrier_name,carrier_naic,policy_number,transaction_type,named_insured,dba,fein}
 *   umbrella_details.identity.mailing_address.{street,city,state,zip}
 *   umbrella_details.dates.{effective_date,expiration_date}
 *
 * identity/dates follow the GL house standard (extract-cgl-policy identity/dates)
 * so the Verify feature and the COI named-insured mismatch check read
 * `*_details.identity.*` / `.dates.*` uniformly across every line. producer is
 * intentionally OUT of the shaped blob (§ house standard). No premium anywhere.
 *
 * `umbrella_field_evidence` keys are these same paths RELATIVE to the blob
 * column (no `umbrella_details.` prefix), e.g. "limits.per_occurrence",
 * "coi_summary.ded_or_retention_kind".
 */

// ---------------------------------------------------------------------------
// Raw model output types (what the tool_use block returns)
// ---------------------------------------------------------------------------

/**
 * Every scalar the model extracts is returned as a leaf so it can cite the
 * evidence catalog IDs alongside the value. This mirrors the GL/BAP extractor
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

export interface RawUmbrellaExtraction {
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
  policy_type?: EvidenceLeaf<string>;
  form_basis?: EvidenceLeaf<string>;
  coi_summary?: {
    occurrence_or_claims_made?: EvidenceLeaf<string>;
    ded_or_retention_kind?: EvidenceLeaf<string>;
  };
  limits?: {
    per_occurrence?: EvidenceLeaf<number>;
    aggregate?: EvidenceLeaf<number>;
    defense_costs?: EvidenceLeaf<string>;
    territory?: EvidenceLeaf<string>;
  };
  retention?: {
    amount?: EvidenceLeaf<number>;
    applicability?: EvidenceLeaf<string>;
    notes?: EvidenceLeaf<string>;
  };
  drop_down?: {
    is_available?: EvidenceLeaf<boolean>;
    conditions?: EvidenceLeaf<string>;
  };
  underlying_requirements?: {
    gl_each_occurrence?: EvidenceLeaf<number>;
    gl_general_aggregate?: EvidenceLeaf<number>;
    auto_liability?: EvidenceLeaf<number>;
    el_per_accident?: EvidenceLeaf<number>;
    el_disease_policy?: EvidenceLeaf<number>;
    el_disease_employee?: EvidenceLeaf<number>;
  };
  underlying_policies?: unknown[];
  additional_insureds?: unknown[];
  additional_insured_evidence?: RawBlanketEvidence;
  waiver_of_subrogation_evidence?: RawBlanketEvidence;
  endorsements?: unknown[];
  extraction_confidence?: number | null;
}

// ---------------------------------------------------------------------------
// Shaped output types (what lands in policies.umbrella_details)
// ---------------------------------------------------------------------------

export interface UmbrellaDetails {
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
  policy_type: 'umbrella' | 'excess' | null;
  form_basis: 'follow_form' | 'standalone' | null;
  /** COI-only summary cells the ACORD 25 umbrella row reads. */
  coi_summary: {
    occurrence_or_claims_made: 'occurrence' | 'claims_made' | null;
    /** The KIND only — deductible vs retention. The AMOUNT stays at retention.amount. */
    ded_or_retention_kind: 'deductible' | 'retention' | null;
  };
  limits: {
    per_occurrence: number | null;
    aggregate: number | null;
    defense_costs: 'inside_limits' | 'outside_limits' | null;
    territory: string | null;
  };
  retention: {
    amount: number | null;
    applicability: string | null;
    notes: string | null;
  };
  drop_down: {
    is_available: boolean | null;
    conditions: string | null;
  };
  extraction_source: string;
  extraction_confidence: number | null;
  extracted_at: string;
}

export interface ShapedUmbrella {
  umbrellaDetails: UmbrellaDetails;
  fieldEvidence: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Scalar coercion helpers (identical semantics to extract-bap-policy/shape.ts)
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

/** null when absent so drop_down.is_available can distinguish "unknown" from "no". */
export function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    if (/^(y|yes|true|1)$/i.test(t)) return true;
    if (/^(n|no|false|0)$/i.test(t)) return false;
    return null;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Umbrella enum normalizers (evidence-only: null when the doc doesn't say)
// ---------------------------------------------------------------------------

export function normalizePolicyType(v: unknown): 'umbrella' | 'excess' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes('umbrella')) return 'umbrella';
  if (s.includes('excess')) return 'excess';
  return null;
}

export function normalizeFormBasis(v: unknown): 'follow_form' | 'standalone' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes('follow')) return 'follow_form';
  if (s.includes('stand')) return 'standalone';
  return null;
}

/** ACORD 25 umbrella has OCCUR / CLAIMS-MADE checkboxes. */
export function normalizeOccurrenceBasis(v: unknown): 'occurrence' | 'claims_made' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes('claim')) return 'claims_made';
  if (s.includes('occur')) return 'occurrence';
  return null;
}

/**
 * ACORD 25 umbrella has DED / RETENTION checkboxes. This is the KIND only;
 * the number lives at retention.amount. SIR / "self-insured" / "retained" all
 * mean retention.
 */
export function normalizeDedRetentionKind(v: unknown): 'deductible' | 'retention' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes('deduct') || /\bded\b/.test(s)) return 'deductible';
  if (s.includes('retention') || s.includes('retained') || s.includes('self-insured') ||
      s.includes('self insured') || /\bsir\b/.test(s)) return 'retention';
  return null;
}

export function normalizeDefenseCosts(v: unknown): 'inside_limits' | 'outside_limits' | null {
  const s = toStringOrNull(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes('inside') || s.includes('within')) return 'inside_limits';
  if (s.includes('outside') || s.includes('addition') || s.includes('excess of')) return 'outside_limits';
  return null;
}

// ---------------------------------------------------------------------------
// Flat-dotted evidence builder (adapted from the GL/BAP extractor). Walks a
// nested tree of `{ value, evidence_ids }` leaves and emits
// { "<dotted.path>": evidence_ids } for every leaf that cited evidence. Arrays
// are NOT descended (child rows carry their own evidence_ids columns), so
// passing the curated identity/dates/coverage subtree yields exactly the
// relative in-blob paths the COI RPC tests with `v_ev ? <path>`.
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
// Core: raw model extraction -> { umbrella_details, umbrella_field_evidence }
// ---------------------------------------------------------------------------

export function shapeUmbrellaDetails(raw: RawUmbrellaExtraction, nowIso: string): ShapedUmbrella {
  const umbrellaDetails: UmbrellaDetails = {
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
    policy_type: normalizePolicyType(raw.policy_type?.value),
    form_basis: normalizeFormBasis(raw.form_basis?.value),
    coi_summary: {
      occurrence_or_claims_made: normalizeOccurrenceBasis(raw.coi_summary?.occurrence_or_claims_made?.value),
      ded_or_retention_kind: normalizeDedRetentionKind(raw.coi_summary?.ded_or_retention_kind?.value),
    },
    limits: {
      per_occurrence: toNumberOrNull(raw.limits?.per_occurrence?.value),
      aggregate: toNumberOrNull(raw.limits?.aggregate?.value),
      defense_costs: normalizeDefenseCosts(raw.limits?.defense_costs?.value),
      territory: toStringOrNull(raw.limits?.territory?.value),
    },
    retention: {
      amount: toNumberOrNull(raw.retention?.amount?.value),
      applicability: toStringOrNull(raw.retention?.applicability?.value),
      notes: toStringOrNull(raw.retention?.notes?.value),
    },
    drop_down: {
      is_available: toBoolOrNull(raw.drop_down?.is_available?.value),
      conditions: toStringOrNull(raw.drop_down?.conditions?.value),
    },
    extraction_source: 'azure_di_claude',
    extraction_confidence: toNumberOrNull(raw.extraction_confidence),
    extracted_at: nowIso,
  };

  // Evidence map: reuse the recursive builder over a CURATED subtree so the
  // emitted keys are exactly the relative in-blob paths (no underlying/AI/
  // endorsement arrays — those child rows carry their own evidence_ids columns,
  // and underlying_requirements is a separate table, not part of the blob).
  // The subtree mirrors umbrella_details 1:1, so the 6 COI keys
  // (policy_type, coi_summary.occurrence_or_claims_made, limits.per_occurrence,
  // limits.aggregate, coi_summary.ded_or_retention_kind, retention.amount) plus
  // identity.* / dates.* all fall out automatically.
  const fieldEvidence = buildFlatDottedEvidence({
    identity: raw.identity,
    dates: raw.dates,
    policy_type: raw.policy_type,
    form_basis: raw.form_basis,
    coi_summary: raw.coi_summary,
    limits: raw.limits,
    retention: raw.retention,
    drop_down: raw.drop_down,
  });

  return { umbrellaDetails, fieldEvidence };
}

// ---------------------------------------------------------------------------
// Child-table row shapers (return rows WITHOUT policy_id; index.ts adds it).
// All defend the DB CHECK constraints and NOT NULL columns so a DELETE-then-
// INSERT batch cannot crash on one bad row.
// ---------------------------------------------------------------------------

const UNDERLYING_TYPES = [
  'general_liability', 'commercial_auto', 'employers_liability', 'workers_compensation',
  'professional_liability', 'hired_non_owned_auto', 'employee_benefits', 'other',
];
const AI_TYPES = ['blanket', 'scheduled', 'follow_underlying'];
const ENDORSEMENT_CATEGORIES = [
  'designated_underlying', 'auto_liability', 'employers_liability', 'professional_liability',
  'pollution', 'abuse_molestation', 'assault_battery', 'communicable_disease', 'residential_work',
  'height_limitation', 'eifs_stucco', 'liquor_liability', 'cyber', 'territory_limitation',
  'aircraft_watercraft', 'other',
];
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
 * Underlying policy schedule -> policy_umbrella_underlying rows.
 * NOT NULL: underlying_type (CHECK enum), carrier. UNIQUE(policy_id,
 * underlying_type, underlying_policy_number) — collapse exact dupes.
 */
export function shapeUnderlyingRows(raw: RawUmbrellaExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.underlying_policies) ? raw.underlying_policies : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const u = item as Record<string, unknown>;
    rows.push({
      underlying_type: pickEnum(u.underlying_type ?? u.type, UNDERLYING_TYPES, 'other'),
      carrier: toStringOrNull(u.carrier) ?? 'Unknown', // NOT NULL
      underlying_policy_number: toStringOrNull(u.policy_number ?? u.underlying_policy_number),
      effective_date: toDateOrNull(u.effective_date),
      expiration_date: toDateOrNull(u.expiration_date),
      each_occurrence: toNumberOrNull(u.each_occurrence),
      general_aggregate: toNumberOrNull(u.general_aggregate),
      auto_csl: toNumberOrNull(u.auto_csl),
      auto_bi_per_person: toNumberOrNull(u.auto_bi_per_person),
      auto_bi_per_accident: toNumberOrNull(u.auto_bi_per_accident),
      auto_pd: toNumberOrNull(u.auto_pd),
      el_per_accident: toNumberOrNull(u.el_per_accident),
      el_disease_policy: toNumberOrNull(u.el_disease_policy),
      el_disease_employee: toNumberOrNull(u.el_disease_employee),
      other_limit: toNumberOrNull(u.other_limit),
      limit_description: toStringOrNull(u.limit_description),
      evidence_ids: evidenceIds(u.evidence_ids),
      extraction_confidence: toNumberOrNull(u.confidence),
      extraction_status: sanitizeStatus(u.status),
    });
  }
  return dedupeBy(rows, (r) => `${r.underlying_type}|${r.underlying_policy_number ?? ''}`);
}

/**
 * Minimum underlying requirements -> a SINGLE policy_umbrella_requirements row
 * (UNIQUE(policy_id) -> upsert). Returns null when the doc carried no
 * requirement values, so index.ts skips the write entirely.
 */
export function shapeRequirementsRow(raw: RawUmbrellaExtraction): Record<string, unknown> | null {
  const req = raw.underlying_requirements;
  if (!req) return null;
  const fields = {
    gl_each_occurrence: toNumberOrNull(req.gl_each_occurrence?.value),
    gl_general_aggregate: toNumberOrNull(req.gl_general_aggregate?.value),
    auto_liability: toNumberOrNull(req.auto_liability?.value),
    el_per_accident: toNumberOrNull(req.el_per_accident?.value),
    el_disease_policy: toNumberOrNull(req.el_disease_policy?.value),
    el_disease_employee: toNumberOrNull(req.el_disease_employee?.value),
  };
  if (Object.values(fields).every((v) => v === null)) return null;

  const ids = new Set<string>();
  for (const leaf of Object.values(req)) {
    for (const id of evidenceIds((leaf as EvidenceLeaf | undefined)?.evidence_ids)) ids.add(id);
  }
  return {
    ...fields,
    evidence_ids: [...ids],
    extraction_confidence: null,
    extraction_status: 'AUTO_APPLIED',
  };
}

/**
 * Additional insureds -> policy_umbrella_additional_insureds rows.
 *
 * §4 (Blanket-as-evidence, never fabricate a "Y"): extraction records EVIDENCE,
 * never a confirmed endorsement. Every row is written endorsement_status =
 * 'requested' (visible to resolve_holder_endorsements as pending), NEVER
 * 'endorsed' (the confirmed "Y" a human must promote via set_line_ai_endorsement).
 * ai_type='blanket' matches any holder in resolve_holder_endorsements;
 * 'follow_underlying' delegates to the GL line result there — pass the model's
 * classification through unchanged, never synthesize one.
 *
 * NOTE (flagged): the table has a SINGULAR endorsement_form (text) column, not
 * form_numbers[]; blanket form numbers are joined into it. There is NO
 * source_span column — that provenance survives only via evidence_ids.
 */
export function shapeAdditionalInsuredRows(raw: RawUmbrellaExtraction): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];

  const named = Array.isArray(raw.additional_insureds) ? raw.additional_insureds : [];
  for (const item of named) {
    const a = item as Record<string, unknown>;
    const name = toStringOrNull(a.name);
    if (!name) continue; // name is NOT NULL
    const address = (a.address ?? {}) as Record<string, unknown>;
    rows.push({
      name,
      street: toStringOrNull(address.street ?? a.street),
      city: toStringOrNull(address.city ?? a.city),
      state: toStringOrNull(address.state ?? a.state),
      zip: toStringOrNull(address.zip ?? a.zip),
      ai_type: pickEnum(a.ai_type, AI_TYPES, 'scheduled')!, // NOT NULL, CHECK enum
      primary_noncontributory: toBool(a.primary_noncontributory),
      waiver_of_subrogation: toBool(a.waiver_of_subrogation),
      project_name: toStringOrNull(a.project_name),
      endorsement_form: toStringOrNull(a.endorsement_form),
      effective_date: toDateOrNull(a.effective_date),
      expiration_date: toDateOrNull(a.expiration_date),
      endorsement_status: 'requested', // evidence only — never a fabricated 'endorsed'
      evidence_ids: evidenceIds(a.evidence_ids),
      extraction_confidence: toNumberOrNull(a.confidence),
      extraction_status: sanitizeStatus(a.status),
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
      street: null,
      city: null,
      state: null,
      zip: null,
      ai_type: 'blanket',
      primary_noncontributory: false,
      waiver_of_subrogation: wvBlanket,
      project_name: null,
      endorsement_form: forms.length ? [...new Set(forms)].join(', ') : null,
      effective_date: null,
      expiration_date: null,
      endorsement_status: 'requested', // evidence only — never a fabricated 'endorsed'
      evidence_ids: [],
      extraction_confidence: null,
      extraction_status: 'NEEDS_REVIEW',
    });
  }

  return rows;
}

/**
 * Endorsements -> policy_umbrella_endorsements rows. NOT NULL: form_number,
 * title. category is a nullable CHECK enum. No premium_impact (§ no-premium).
 */
export function shapeEndorsementRows(raw: RawUmbrellaExtraction): Array<Record<string, unknown>> {
  const list = Array.isArray(raw.endorsements) ? raw.endorsements : [];
  const rows: Array<Record<string, unknown>> = [];
  for (const item of list) {
    const e = item as Record<string, unknown>;
    rows.push({
      form_number: toStringOrNull(e.form_number) ?? 'Unknown', // NOT NULL
      title: toStringOrNull(e.title) ?? 'Endorsement', // NOT NULL
      edition_date: toStringOrNull(e.edition_date),
      effective_date: toDateOrNull(e.effective_date),
      category: pickEnum(e.category, ENDORSEMENT_CATEGORIES),
      is_limitation: toBool(e.is_limitation),
      is_enhancement: toBool(e.is_enhancement),
      impact_description: toStringOrNull(e.impact_description),
      evidence_ids: evidenceIds(e.evidence_ids),
      extraction_confidence: toNumberOrNull(e.confidence),
      extraction_status: sanitizeStatus(e.status),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Claude tool-use schema (single source of truth for index.ts)
// ---------------------------------------------------------------------------

export const UMBRELLA_EXTRACTION_TOOL_NAME = 'emit_umbrella_extraction';

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
const BOOL = { type: ['boolean', 'null'] };

const blanketEvidenceSchema = (kind: string) => ({
  type: 'object',
  description: `Evidence of a BLANKET ${kind} endorsement (applies to anyone the insured has agreed to add by written contract). Do NOT assert a specific holder "Y".`,
  properties: {
    present: { type: 'boolean' },
    basis: { type: ['string', 'null'], enum: ['blanket', 'scheduled', null] },
    form_numbers: { type: 'array', items: { type: 'string' } },
    source_span: STR,
  },
});

/**
 * Strict JSON Schema handed to Claude via `tools` + `tool_choice`. No premium
 * field anywhere (§ agency rule). carrier_naic is explicitly the 5-digit
 * INSURER NAIC, never an industry NAICS/SIC (§3).
 */
export const UMBRELLA_EXTRACTION_TOOL_SCHEMA: Record<string, unknown> = {
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
    policy_type: leaf(
      { type: ['string', 'null'], enum: ['umbrella', 'excess', null] },
      '"umbrella" (broadens coverage, may drop down) or "excess" (follows form of the underlying only). Return null if the document does not say.',
    ),
    form_basis: leaf(
      { type: ['string', 'null'], enum: ['follow_form', 'standalone', null] },
      '"follow_form" if the policy follows the terms of the underlying, "standalone" if it has its own coverage form.',
    ),
    coi_summary: {
      type: 'object',
      description: 'ACORD 25 umbrella-row summary cells.',
      properties: {
        occurrence_or_claims_made: leaf(
          { type: ['string', 'null'], enum: ['occurrence', 'claims_made', null] },
          'Whether the umbrella/excess is written on an OCCURRENCE or CLAIMS-MADE basis (the ACORD 25 checkbox pair).',
        ),
        ded_or_retention_kind: leaf(
          { type: ['string', 'null'], enum: ['deductible', 'retention', null] },
          'The KIND of self-retained amount: "deductible" (DED) or "retention" (RETENTION / SIR / self-insured retention). This is only the kind — put the dollar amount in retention.amount.',
        ),
      },
    },
    limits: {
      type: 'object',
      properties: {
        per_occurrence: leaf(NUM, 'Each-occurrence (headline) limit, e.g. 1000000.'),
        aggregate: leaf(NUM, 'Annual/policy aggregate limit.'),
        defense_costs: leaf(
          { type: ['string', 'null'], enum: ['inside_limits', 'outside_limits', null] },
          'Whether defense costs erode the limit ("inside_limits") or are paid in addition ("outside_limits").',
        ),
        territory: leaf(STR),
      },
    },
    retention: {
      type: 'object',
      properties: {
        amount: leaf(NUM, 'Self-Insured Retention / retained-limit / deductible AMOUNT (the dollar figure).'),
        applicability: leaf(STR),
        notes: leaf(STR),
      },
    },
    drop_down: {
      type: 'object',
      properties: {
        is_available: leaf(BOOL, 'True if the umbrella drops down to cover gaps when the underlying does not respond.'),
        conditions: leaf(STR),
      },
    },
    underlying_requirements: {
      type: 'object',
      description: 'Minimum underlying limits the umbrella requires (schedule of required primary insurance).',
      properties: {
        gl_each_occurrence: leaf(NUM),
        gl_general_aggregate: leaf(NUM),
        auto_liability: leaf(NUM),
        el_per_accident: leaf(NUM),
        el_disease_policy: leaf(NUM),
        el_disease_employee: leaf(NUM),
      },
    },
    underlying_policies: {
      type: 'array',
      description: 'The scheduled underlying policies (GL, auto, EL, etc.). Extract ALL of them.',
      items: {
        type: 'object',
        properties: {
          underlying_type: { type: ['string', 'null'], enum: [...UNDERLYING_TYPES, null] },
          carrier: STR,
          policy_number: STR,
          effective_date: STR,
          expiration_date: STR,
          each_occurrence: NUM,
          general_aggregate: NUM,
          auto_csl: NUM,
          auto_bi_per_person: NUM,
          auto_bi_per_accident: NUM,
          auto_pd: NUM,
          el_per_accident: NUM,
          el_disease_policy: NUM,
          el_disease_employee: NUM,
          other_limit: NUM,
          limit_description: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    additional_insureds: {
      type: 'array',
      description: 'Named or scheduled additional insureds listed by name. Use ai_type "scheduled" for named grants, "follow_underlying" only if the policy says AI status follows the underlying.',
      items: {
        type: 'object',
        properties: {
          name: STR,
          ai_type: { type: ['string', 'null'], enum: [...AI_TYPES, null] },
          address: {
            type: 'object',
            properties: { street: STR, city: STR, state: STR, zip: STR },
          },
          primary_noncontributory: BOOL,
          waiver_of_subrogation: BOOL,
          project_name: STR,
          endorsement_form: STR,
          effective_date: STR,
          expiration_date: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    additional_insured_evidence: blanketEvidenceSchema('additional-insured'),
    waiver_of_subrogation_evidence: blanketEvidenceSchema('waiver of subrogation'),
    endorsements: {
      type: 'array',
      description: 'High-impact endorsements, exclusions and limitations. Flag exclusions/limitations with is_limitation=true.',
      items: {
        type: 'object',
        properties: {
          form_number: STR,
          title: STR,
          edition_date: STR,
          effective_date: STR,
          category: { type: ['string', 'null'], enum: [...ENDORSEMENT_CATEGORIES, null] },
          is_limitation: BOOL,
          is_enhancement: BOOL,
          impact_description: STR,
          evidence_ids: { type: 'array', items: { type: 'string' } },
          confidence: NUM,
          status: STR,
        },
      },
    },
    extraction_confidence: { type: ['number', 'null'], description: 'Overall extraction confidence, 0-1.' },
  },
  required: ['limits'],
};
