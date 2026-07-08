// Holder requirements evaluator: the single shared pure evaluation used by both
// the generator client (advisory compliance strip) and the generate-certificate
// server (snapshot record). 07-supplemental-enhancements.md Section 4.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib. It imports ONLY type-only symbols
// from src/types/master-coi.ts (mirrored to _shared/master-coi-types.ts) and from
// ./types, so the Deno port mirrors it as
// supabase/functions/_shared/acord25/requirements.ts with rewritten specifiers.
//
// Authority: docs/COI Module/coi-module/07-supplemental-enhancements.md
//   - Section 4.2 (closed requirements schema, stored in
//     additional_insureds.requirements jsonb)
//   - Section 4.4 (evaluation semantics: ADVISORY, never a hard block; the
//     server re-runs THIS function so the snapshot records the server result)
//   - Section 4.5 (acceptance criteria).
//
// Semantics recorded so they are not "improved" later:
//   - Failures are business advisories (severity 'fail'); they never disable
//     Generate and the server never 422s on them.
//   - required_lines: each listed line must be in the selected line set.
//   - min_limits: only meaningful for a SELECTED line; a min_limit on a
//     non-selected line fails (the coverage the holder requires is not being
//     certified).
//   - flags: requires_additional_insured passes only when that line's
//     addl_insd_resolved === 'endorsed'; requires_waiver passes only when
//     subr_wvd_resolved === 'endorsed' (downgrade-only three-state, never a
//     boolean).
//   - required_endorsement_forms: best-effort substring match against any line's
//     basis text (case-insensitive); with no endorsement data the result is a
//     failure with a clear "cannot confirm" message.
//   - notice_days: informational only, never pass/fail.

import type { COICell, MasterCOI } from '../master-coi-types.ts';
import { formatLimit } from './format.ts';
import type { Acord25LineKey } from './types.ts';

// ---------------------------------------------------------------------------
// The closed requirements schema (07 Section 4.2).
// ---------------------------------------------------------------------------

/** One minimum-limit requirement (07 Section 4.2). */
export interface HolderRequirementsMinLimit {
  /** Canonical line key (02 Section 2.3). */
  line_key: Acord25LineKey;
  /** A key in the get_master_coi line cell contract for that line. */
  field: string;
  /** The minimum acceptable numeric value. */
  min: number;
}

/** One per-line endorsement flag requirement (07 Section 4.2). */
export interface HolderRequirementsFlag {
  line_key: Acord25LineKey;
  requires_additional_insured?: boolean;
  requires_waiver?: boolean;
}

/** The whole closed requirements object stored on the holder (07 Section 4.2). */
export interface HolderRequirements {
  min_limits: HolderRequirementsMinLimit[];
  flags: HolderRequirementsFlag[];
  required_endorsement_forms: string[];
  notice_days: number | null;
  required_lines: Acord25LineKey[];
}

// ---------------------------------------------------------------------------
// Evaluation result contract.
// ---------------------------------------------------------------------------

/** One evaluated requirement row. severity 'fail' contributes to !all_pass. */
export interface RequirementResult {
  kind:
    | 'min_limit'
    | 'flag_ai'
    | 'flag_waiver'
    | 'endorsement_form'
    | 'required_line'
    | 'notice_days';
  line_key?: Acord25LineKey;
  field?: string;
  /** Human label for the rule, no em or en dashes. */
  label: string;
  pass: boolean;
  /** 'fail' rows drive !all_pass; 'info' rows never do (notice_days). */
  severity: 'fail' | 'info';
  expected: string;
  actual: string;
  /** Human copy, no em or en dashes. */
  message: string;
}

/** The full evaluation, embedded into the snapshot on the server. */
export interface RequirementsEvaluation {
  has_requirements: boolean;
  results: RequirementResult[];
  all_pass: boolean;
  failure_count: number;
  /** Set on the server when the user proceeds through the override dialog. */
  overridden?: boolean;
  /** The user id who overrode, when known. */
  overridden_by?: string | null;
}

// ---------------------------------------------------------------------------
// Canonical line-key set + labels.
// ---------------------------------------------------------------------------

const LINE_KEYS: readonly Acord25LineKey[] = [
  'gl',
  'auto',
  'umbrella',
  'wc',
  'property',
  'other',
];

const LINE_LABELS: Record<Acord25LineKey, string> = {
  gl: 'General Liability',
  auto: 'Automobile Liability',
  umbrella: 'Umbrella / Excess',
  wc: 'Workers Compensation',
  property: 'Property',
  other: 'Other',
};

function isLineKey(x: unknown): x is Acord25LineKey {
  return typeof x === 'string' && (LINE_KEYS as readonly string[]).includes(x);
}

function lineLabel(line: Acord25LineKey): string {
  return LINE_LABELS[line];
}

/** Turn a field key like 'general_aggregate' into 'general aggregate'. */
function fieldLabel(field: string): string {
  return field.replace(/_/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Defensive parse (07 Section 4.2: validated on write, read defensively).
// ---------------------------------------------------------------------------

function asNumber(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function asBool(x: unknown): boolean {
  return x === true;
}

function asString(x: unknown): string | null {
  return typeof x === 'string' ? x : null;
}

function parseMinLimits(raw: unknown): HolderRequirementsMinLimit[] {
  if (!Array.isArray(raw)) return [];
  const out: HolderRequirementsMinLimit[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const lineKey = rec.line_key;
    const field = asString(rec.field);
    const min = asNumber(rec.min);
    if (!isLineKey(lineKey) || field == null || field.length === 0 || min == null) continue;
    out.push({ line_key: lineKey, field, min });
  }
  return out;
}

function parseFlags(raw: unknown): HolderRequirementsFlag[] {
  if (!Array.isArray(raw)) return [];
  const out: HolderRequirementsFlag[] = [];
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const lineKey = rec.line_key;
    if (!isLineKey(lineKey)) continue;
    const requiresAi = asBool(rec.requires_additional_insured);
    const requiresWaiver = asBool(rec.requires_waiver);
    if (!requiresAi && !requiresWaiver) continue;
    out.push({
      line_key: lineKey,
      requires_additional_insured: requiresAi,
      requires_waiver: requiresWaiver,
    });
  }
  return out;
}

function parseForms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    const s = asString(entry);
    if (s != null && s.trim().length > 0) out.push(s.trim());
  }
  return out;
}

function parseRequiredLines(raw: unknown): Acord25LineKey[] {
  if (!Array.isArray(raw)) return [];
  const out: Acord25LineKey[] = [];
  for (const entry of raw) {
    if (isLineKey(entry) && !out.includes(entry)) out.push(entry);
  }
  return out;
}

/**
 * Defensive read of the requirements jsonb. Returns null when the payload is
 * empty, absent, or carries no evaluable rule (so a holder with no requirements
 * behaves exactly as today).
 */
export function parseHolderRequirements(raw: unknown): HolderRequirements | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;

  const parsed: HolderRequirements = {
    min_limits: parseMinLimits(rec.min_limits),
    flags: parseFlags(rec.flags),
    required_endorsement_forms: parseForms(rec.required_endorsement_forms),
    notice_days: asNumber(rec.notice_days),
    required_lines: parseRequiredLines(rec.required_lines),
  };

  const hasAnything =
    parsed.min_limits.length > 0 ||
    parsed.flags.length > 0 ||
    parsed.required_endorsement_forms.length > 0 ||
    parsed.required_lines.length > 0 ||
    parsed.notice_days != null;

  return hasAnything ? parsed : null;
}

// ---------------------------------------------------------------------------
// Master COI cell resolution.
// ---------------------------------------------------------------------------

function isCell(x: unknown): x is COICell {
  return x != null && typeof x === 'object' && 'v' in (x as Record<string, unknown>);
}

/**
 * Resolve a (line_key, field) pair against the REAL per-line master COI shapes.
 * The lines differ: GL nests its numeric limits under `limits.{field}` while the
 * other lines carry them directly (umbrella.each_occurrence, wc.el_*,
 * property.limit_amount, auto.csl, ...). Try `line[field]` first, then
 * `line.limits?.[field]`, returning whichever is a COICell. Returns null when
 * neither resolves to a cell (unknown field or absent line).
 */
function resolveNumberCell(masterCoi: MasterCOI, lineKey: Acord25LineKey, field: string): number | null {
  const lines = masterCoi.lines as unknown as Record<string, unknown>;
  const line = lines[lineKey];
  if (line == null || typeof line !== 'object') return null;
  const lineRec = line as Record<string, unknown>;

  const direct = lineRec[field];
  if (isCell(direct)) {
    return asNumber(direct.v);
  }

  const limits = lineRec.limits;
  if (limits != null && typeof limits === 'object') {
    const nested = (limits as Record<string, unknown>)[field];
    if (isCell(nested)) {
      return asNumber(nested.v);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Evaluation.
// ---------------------------------------------------------------------------

export interface EvaluateHolderRequirementsArgs {
  requirements: HolderRequirements | null;
  masterCoi: MasterCOI;
  selectedLineKeys: Acord25LineKey[];
  /** resolve_holder_endorsements output, one row per line (may be empty). */
  holderResolution: Array<{
    line_key: string;
    addl_insd_resolved: string;
    subr_wvd_resolved: string;
    basis: string | null;
  }>;
  /**
   * What the certificate being generated will actually PRINT per line (the staff
   * toggle choices). When supplied, the additional-insured / waiver flag checks
   * evaluate against THIS - so a manual Y satisfies the holder's requirement even
   * with no confirmed endorsement (the manual assertion is warned about
   * elsewhere). Omitted (older callers) -> fall back to the policy resolution.
   */
  printedFlags?: Partial<Record<Acord25LineKey, { addlInsd: boolean; subrWvd: boolean }>>;
}

function emptyEvaluation(): RequirementsEvaluation {
  return {
    has_requirements: false,
    results: [],
    all_pass: true,
    failure_count: 0,
  };
}

function evaluateRequiredLines(
  required: Acord25LineKey[],
  selected: Set<Acord25LineKey>,
): RequirementResult[] {
  return required.map((line): RequirementResult => {
    const pass = selected.has(line);
    return {
      kind: 'required_line',
      line_key: line,
      label: `${lineLabel(line)} required`,
      pass,
      severity: 'fail',
      expected: 'line certified',
      actual: pass ? 'line certified' : 'line not selected',
      message: pass
        ? `${lineLabel(line)} is included on this certificate.`
        : `Holder requires ${lineLabel(line)} but it is not selected on this certificate.`,
    };
  });
}

function evaluateMinLimits(
  minLimits: HolderRequirementsMinLimit[],
  masterCoi: MasterCOI,
  selected: Set<Acord25LineKey>,
): RequirementResult[] {
  return minLimits.map((req): RequirementResult => {
    const label = `${lineLabel(req.line_key)} ${fieldLabel(req.field)}`;
    const expected = formatLimit(req.min);

    if (!selected.has(req.line_key)) {
      return {
        kind: 'min_limit',
        line_key: req.line_key,
        field: req.field,
        label,
        pass: false,
        severity: 'fail',
        expected,
        actual: 'line not selected',
        message: `Holder requires ${label} of at least ${expected} but ${lineLabel(req.line_key)} is not selected on this certificate.`,
      };
    }

    const actualValue = resolveNumberCell(masterCoi, req.line_key, req.field);
    if (actualValue == null) {
      return {
        kind: 'min_limit',
        line_key: req.line_key,
        field: req.field,
        label,
        pass: false,
        severity: 'fail',
        expected,
        actual: 'no value',
        message: `Holder requires ${label} of at least ${expected} but no value is available on this line.`,
      };
    }

    const actual = formatLimit(actualValue);
    const pass = actualValue >= req.min;
    return {
      kind: 'min_limit',
      line_key: req.line_key,
      field: req.field,
      label,
      pass,
      severity: 'fail',
      expected,
      actual,
      message: pass
        ? `${label} ${actual} meets the holder minimum of ${expected}.`
        : `${label} ${actual}, holder requires ${expected}.`,
    };
  });
}

function findResolution(
  holderResolution: EvaluateHolderRequirementsArgs['holderResolution'],
  line: Acord25LineKey,
): { addl: string; subr: string; basis: string | null } | null {
  const row = holderResolution.find((r) => r.line_key === (line as string));
  if (!row) return null;
  return {
    addl: row.addl_insd_resolved,
    subr: row.subr_wvd_resolved,
    basis: row.basis,
  };
}

function evaluateFlags(
  flags: HolderRequirementsFlag[],
  holderResolution: EvaluateHolderRequirementsArgs['holderResolution'],
  printedFlags: EvaluateHolderRequirementsArgs['printedFlags'],
): RequirementResult[] {
  const out: RequirementResult[] = [];
  for (const flag of flags) {
    const res = findResolution(holderResolution, flag.line_key);
    const printed = printedFlags?.[flag.line_key];

    if (flag.requires_additional_insured) {
      // Pass when the CERTIFICATE lists the holder as additional insured on this
      // line (the staff print choice), whether that Y is a confirmed endorsement
      // or a manual assertion. Fall back to the policy resolution when no print
      // choice is supplied.
      const willPrint = printed ? printed.addlInsd : (res ? res.addl === 'endorsed' : false);
      out.push({
        kind: 'flag_ai',
        line_key: flag.line_key,
        label: `${lineLabel(flag.line_key)} additional insured`,
        pass: willPrint,
        severity: 'fail',
        expected: 'listed',
        actual: willPrint ? 'listed' : 'not listed',
        message: willPrint
          ? `${lineLabel(flag.line_key)} additional insured is listed on this certificate.`
          : `Holder requires additional insured on ${lineLabel(flag.line_key)} but this certificate does not list it.`,
      });
    }

    if (flag.requires_waiver) {
      const willPrint = printed ? printed.subrWvd : (res ? res.subr === 'endorsed' : false);
      out.push({
        kind: 'flag_waiver',
        line_key: flag.line_key,
        label: `${lineLabel(flag.line_key)} waiver of subrogation`,
        pass: willPrint,
        severity: 'fail',
        expected: 'listed',
        actual: willPrint ? 'listed' : 'not listed',
        message: willPrint
          ? `${lineLabel(flag.line_key)} waiver of subrogation is listed on this certificate.`
          : `Holder requires waiver of subrogation on ${lineLabel(flag.line_key)} but this certificate does not list it.`,
      });
    }
  }
  return out;
}

function evaluateEndorsementForms(
  forms: string[],
  holderResolution: EvaluateHolderRequirementsArgs['holderResolution'],
): RequirementResult[] {
  // Collect all basis text across every resolution row for best-effort matching.
  const bases = holderResolution
    .map((r) => (typeof r.basis === 'string' ? r.basis : ''))
    .filter((b) => b.length > 0)
    .map((b) => b.toLowerCase());
  const haveEndorsementData = bases.length > 0;

  return forms.map((form): RequirementResult => {
    const needle = form.toLowerCase();
    const found = haveEndorsementData && bases.some((b) => b.includes(needle));

    if (!haveEndorsementData) {
      return {
        kind: 'endorsement_form',
        label: `Endorsement form ${form}`,
        pass: false,
        severity: 'fail',
        expected: form,
        actual: 'no endorsement data',
        message: `Holder requires endorsement form ${form} but no endorsement data is available to confirm it.`,
      };
    }

    return {
      kind: 'endorsement_form',
      label: `Endorsement form ${form}`,
      pass: found,
      severity: 'fail',
      expected: form,
      actual: found ? 'present' : 'not found',
      message: found
        ? `Endorsement form ${form} appears in the resolved endorsement basis.`
        : `Holder requires endorsement form ${form} but it does not appear in the resolved endorsement basis.`,
    };
  });
}

function evaluateNoticeDays(noticeDays: number | null): RequirementResult[] {
  if (noticeDays == null) return [];
  return [
    {
      kind: 'notice_days',
      label: 'Notice of cancellation',
      pass: true,
      severity: 'info',
      expected: `${noticeDays} days`,
      actual: `${noticeDays} days`,
      message: `Holder expects ${noticeDays} days notice of cancellation.`,
    },
  ];
}

/**
 * Evaluate a holder's requirements against the selected lines' master COI values
 * and the holder-resolved endorsement results. ADVISORY: severity 'fail' rows
 * make all_pass false, but the result never blocks generation (07 Section 4.4).
 * Pure given its args; both the client strip and the server snapshot call it.
 */
export function evaluateHolderRequirements(
  args: EvaluateHolderRequirementsArgs,
): RequirementsEvaluation {
  const { requirements, masterCoi, selectedLineKeys, holderResolution, printedFlags } = args;

  if (requirements == null) {
    return emptyEvaluation();
  }

  const selected = new Set<Acord25LineKey>(selectedLineKeys);

  const results: RequirementResult[] = [
    ...evaluateRequiredLines(requirements.required_lines, selected),
    ...evaluateMinLimits(requirements.min_limits, masterCoi, selected),
    ...evaluateFlags(requirements.flags, holderResolution, printedFlags),
    ...evaluateEndorsementForms(requirements.required_endorsement_forms, holderResolution),
    ...evaluateNoticeDays(requirements.notice_days),
  ];

  const failure_count = results.filter((r) => r.severity === 'fail' && !r.pass).length;
  const all_pass = failure_count === 0;

  return {
    has_requirements: true,
    results,
    all_pass,
    failure_count,
  };
}
