// validateAcord25: the primary correctness gate (D10).
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Carries a LOCAL overflow helper so the Deno port stays dependency-free (its
// semantics match detectOverflowFields in pdfFiller.ts; a parity test asserts
// identical results over a shared case table). Acord25TemplateInfo is structural
// and imported from ./types, never from src/types/acord.ts.
// Ported verbatim to supabase/functions/_shared/acord25/validateAcord25.ts.
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Section 5.2;
// blueprint B Section 5.

import { ACORD25_FIELD_MAP, ACORD25_TEMPLATE_SHA256, type Acord25LogicalKey } from './fieldMap';
import type { Acord25Issue, Acord25TemplateInfo, BuildAcord25Result } from './types';

export interface ValidateAcord25Options {
  mode: 'preview' | 'issue';
  template: Acord25TemplateInfo;
  /** Hash of fetched template bytes, computed by the caller. */
  templateSha256?: string;
}

// ---------------------------------------------------------------------------
// Local overflow helper (semantics of detectOverflowFields, pdfFiller.ts).
// Effective limit per field = min(inventory.maxLength if present,
// fieldMap.softCharLimit if present). Returns the fields that exceed it.
// ---------------------------------------------------------------------------

interface OverflowHit {
  pdfField: string;
  length: number;
  limit: number;
}

function effectiveLimit(
  maxLength: number | undefined,
  softCharLimit: number | undefined,
): number | null {
  const candidates: number[] = [];
  if (typeof maxLength === 'number' && maxLength > 0) {
    candidates.push(maxLength);
  }
  if (typeof softCharLimit === 'number' && softCharLimit > 0) {
    candidates.push(softCharLimit);
  }
  if (candidates.length === 0) {
    return null;
  }
  return Math.min(...candidates);
}

function detectOverflow(
  fieldValues: Record<string, string | boolean>,
  template: Acord25TemplateInfo,
): OverflowHit[] {
  const invByName = new Map<string, { maxLength?: number }>();
  for (const item of template.field_inventory) {
    invByName.set(item.name, { maxLength: item.maxLength });
  }

  const hits: OverflowHit[] = [];
  for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
    const entry = ACORD25_FIELD_MAP[key];
    if (entry.kind === 'checkbox') {
      continue;
    }
    const value = fieldValues[entry.pdfField];
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }
    const inv = invByName.get(entry.pdfField);
    const limit = effectiveLimit(inv?.maxLength ?? entry.maxLength, entry.softCharLimit);
    if (limit !== null && value.length > limit) {
      hits.push({ pdfField: entry.pdfField, length: value.length, limit });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------

export function validateAcord25(
  build: BuildAcord25Result,
  opts: ValidateAcord25Options,
): { valid: boolean; issues: Acord25Issue[] } {
  const issues: Acord25Issue[] = [];

  // Carry the build's own issues forward (deduped at the end).
  for (const i of build.issues) {
    issues.push(i);
  }

  const template = opts.template;
  const inventoryNames = new Set(template.field_inventory.map((f) => f.name));
  const inventoryTypeByName = new Map<string, string>();
  const inventoryOptionsByName = new Map<string, string[] | undefined>();
  for (const f of template.field_inventory) {
    inventoryTypeByName.set(f.name, f.type);
    inventoryOptionsByName.set(f.name, f.options);
  }

  const descField = ACORD25_FIELD_MAP.descriptionOfOperations?.pdfField;

  // Build a reverse map: pdfField -> logical entry for kind checks.
  const entryByPdfField = new Map<string, { kind: string }>();
  for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
    const e = ACORD25_FIELD_MAP[key];
    entryByPdfField.set(e.pdfField, { kind: e.kind });
  }

  // V1: build.ok passthrough. Any build error blocks (incl. NOT_PERMITTED). No
  // extra issue needed; build.issues already carried. Validity computed at end.

  // V2: field-name resolution. Every key of build.fieldValues must exist in the
  // inventory.
  for (const pdfField of Object.keys(build.fieldValues)) {
    if (!inventoryNames.has(pdfField)) {
      issues.push({
        code: 'FIELD_NOT_IN_TEMPLATE',
        severity: 'error',
        message: `The field "${pdfField}" is not present in the ACORD 25 template inventory. The template may be the wrong edition.`,
      });
    }
  }

  // V3: type agreement. ynText/date/limit/text/multilineText require inventory
  // type 'text' (PDFTextField); checkbox requires 'checkbox' (PDFCheckBox).
  for (const [pdfField, entry] of entryByPdfField) {
    const invType = inventoryTypeByName.get(pdfField);
    if (invType === undefined) {
      continue; // already flagged by V2 if in fieldValues
    }
    const wantsCheckbox = entry.kind === 'checkbox';
    const isCheckbox = isCheckboxType(invType);
    if (wantsCheckbox && !isCheckbox) {
      issues.push({
        code: 'FIELD_TYPE_MISMATCH',
        severity: 'error',
        message: `The field "${pdfField}" is mapped as a checkbox but the template exposes it as ${invType}. Re-run template onboarding.`,
      });
    } else if (!wantsCheckbox && isCheckbox) {
      issues.push({
        code: 'FIELD_TYPE_MISMATCH',
        severity: 'error',
        message: `The field "${pdfField}" is mapped as text but the template exposes it as a checkbox. Re-run template onboarding.`,
      });
    }
  }

  // V4: Y/N literals. Every ynText value must be exactly 'Y', 'N', or ''.
  for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
    const e = ACORD25_FIELD_MAP[key];
    if (e.kind !== 'ynText') {
      continue;
    }
    const value = build.fieldValues[e.pdfField];
    if (value !== 'Y' && value !== 'N' && value !== '') {
      issues.push({
        code: 'YN_LITERAL_INVALID',
        severity: 'error',
        message: `The field "${e.pdfField}" must be Y, N, or blank but was "${String(value)}".`,
        logicalKeys: [key],
      });
    }
  }

  // V5: dropdown/radio membership. If inventory type is dropdown/radio, the value
  // must be an exact member of options. (None expected on this blank.)
  for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
    const e = ACORD25_FIELD_MAP[key];
    const invType = inventoryTypeByName.get(e.pdfField);
    if (invType === undefined || !isChoiceType(invType)) {
      continue;
    }
    const value = build.fieldValues[e.pdfField];
    if (typeof value === 'string' && value.length > 0) {
      const options = inventoryOptionsByName.get(e.pdfField) ?? [];
      if (!options.includes(value)) {
        issues.push({
          code: 'FIELD_TYPE_MISMATCH',
          severity: 'error',
          message: `The value "${value}" for "${e.pdfField}" is not an allowed option on the template.`,
          logicalKeys: [key],
        });
      }
    }
  }

  // V6: insurer letter resolution (belt+suspenders over get_master_coi). For each
  // non-empty <row>_insrLtr value L, insurerName_L must be non-empty; and each
  // distinct non-empty insurerName_A..F must be referenced by at least one row
  // letter (no orphan insurer rows).
  const rowLetterKeys: Acord25LogicalKey[] = [
    'gl_insrLtr',
    'auto_insrLtr',
    'umb_insrLtr',
    'wc_insrLtr',
    'other_insrLtr',
  ];
  const referencedLetters = new Set<string>();
  for (const rk of rowLetterKeys) {
    const e = ACORD25_FIELD_MAP[rk];
    if (!e) {
      continue;
    }
    const letter = build.fieldValues[e.pdfField];
    if (typeof letter === 'string' && letter.length > 0) {
      referencedLetters.add(letter);
      const nameKey = `insurerName_${letter}` as Acord25LogicalKey;
      const nameEntry = ACORD25_FIELD_MAP[nameKey];
      const nameVal = nameEntry ? build.fieldValues[nameEntry.pdfField] : '';
      if (typeof nameVal !== 'string' || nameVal.length === 0) {
        issues.push({
          code: 'LETTER_UNASSIGNED',
          severity: 'error',
          message: `A coverage row references insurer letter ${letter} but insurer ${letter} has no name in the payload.`,
          logicalKeys: [rk],
        });
      }
    }
  }
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    const nameKey = `insurerName_${letter}` as Acord25LogicalKey;
    const nameEntry = ACORD25_FIELD_MAP[nameKey];
    const nameVal = nameEntry ? build.fieldValues[nameEntry.pdfField] : '';
    if (typeof nameVal === 'string' && nameVal.length > 0 && !referencedLetters.has(letter)) {
      issues.push({
        code: 'LETTER_CONFLICT',
        severity: 'error',
        message: `Insurer ${letter} (${nameVal}) is on the certificate but no coverage row uses letter ${letter}.`,
        logicalKeys: [nameKey],
      });
    }
  }

  // V7: overflow.
  for (const hit of detectOverflow(build.fieldValues, template)) {
    const overflow = hit.length - hit.limit;
    if (descField && hit.pdfField === descField) {
      issues.push({
        code: 'OVERFLOW',
        severity: 'error',
        message: `Description of operations is ${hit.length} characters; the box fits about ${hit.limit}. Shorten it by ${overflow} characters. (Support for the ACORD 101 continuation form is planned.)`,
        logicalKeys: ['descriptionOfOperations'],
      });
    } else {
      issues.push({
        code: 'OVERFLOW',
        severity: 'error',
        message: `The field "${hit.pdfField}" is ${hit.length} characters; the box fits about ${hit.limit}. Shorten it by ${overflow} characters.`,
      });
    }
  }

  // V8: holder. In issue mode, holderName must be non-empty; escalate
  // HOLDER_MISSING to error.
  if (opts.mode === 'issue') {
    const holderEntry = ACORD25_FIELD_MAP.holderName;
    const holderVal = holderEntry ? build.fieldValues[holderEntry.pdfField] : '';
    if (typeof holderVal !== 'string' || holderVal.length === 0) {
      issues.push({
        code: 'HOLDER_MISSING',
        severity: 'error',
        message: 'A certificate holder is required to issue this certificate.',
        logicalKeys: ['holderName'],
      });
    }
  }

  // V9: edition pin. If a fetched-template hash is provided and the pin is set,
  // they must match.
  if (opts.templateSha256 && ACORD25_TEMPLATE_SHA256) {
    if (opts.templateSha256 !== ACORD25_TEMPLATE_SHA256) {
      issues.push({
        code: 'TEMPLATE_PIN_MISMATCH',
        severity: 'error',
        message: `The stored ACORD 25 template does not match the pinned edition (${template.version}). Re-run template onboarding verification before issuing certificates.`,
      });
    }
  }

  // V10: dates. Two assertions per Section 5.2: (1) every non-empty emitted date
  // field matches M/D/YYYY (month and day may be 1 or 2 digits; the builder emits
  // them without a leading zero so the narrow date columns fit); (2) per selected
  // line, expiration >= effective, compared over the raw ISO inputs the builder
  // carries in build.lineDates.
  for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
    const e = ACORD25_FIELD_MAP[key];
    if (e.kind !== 'date') {
      continue;
    }
    const value = build.fieldValues[e.pdfField];
    if (typeof value === 'string' && value.length > 0 && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) {
      issues.push({
        code: 'DATE_INVALID',
        severity: 'error',
        message: `The date field "${e.pdfField}" is not formatted as M/D/YYYY (got "${value}").`,
        logicalKeys: [key],
      });
    }
  }

  // V10 ordering: expiration must not precede effective on any selected line. The
  // ISO strings are zero-padded 'YYYY-MM-DD', so lexicographic comparison is a
  // correct chronological comparison and needs no Date runtime. Malformed ISO
  // inputs already surface as DATE_INVALID from the builder, so skip anything that
  // is not a well-formed ISO date here to avoid a spurious inversion error.
  for (const ld of build.lineDates ?? []) {
    const eff = ld.effectiveDate;
    const exp = ld.expirationDate;
    if (!isIsoDate(eff) || !isIsoDate(exp)) {
      continue;
    }
    if (exp < eff) {
      issues.push({
        code: 'DATE_INVALID',
        severity: 'error',
        message: `The ${ld.lineKey} policy expiration date (${exp}) is earlier than its effective date (${eff}).`,
        lineKey: ld.lineKey,
      });
    }
  }

  const deduped = dedupeIssues(issues);
  const valid = !deduped.some((i) => i.severity === 'error');
  return { valid, issues: deduped };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCheckboxType(invType: string): boolean {
  const t = invType.toLowerCase();
  return t === 'checkbox' || t === 'pdfcheckbox';
}

// Strict 'YYYY-MM-DD' shape check. Ordering comparison relies only on this shape
// (zero-padded, fixed width), so lexicographic order equals chronological order.
function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isChoiceType(invType: string): boolean {
  const t = invType.toLowerCase();
  return (
    t === 'dropdown' ||
    t === 'radio' ||
    t === 'pdfdropdown' ||
    t === 'pdfradiogroup' ||
    t === 'radiogroup'
  );
}

function dedupeIssues(issues: Acord25Issue[]): Acord25Issue[] {
  const seen = new Set<string>();
  const out: Acord25Issue[] = [];
  for (const i of issues) {
    const sig = `${i.code}|${i.severity}|${i.message}|${i.lineKey ?? ''}|${(i.logicalKeys ?? []).join(',')}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      out.push(i);
    }
  }
  return out;
}
