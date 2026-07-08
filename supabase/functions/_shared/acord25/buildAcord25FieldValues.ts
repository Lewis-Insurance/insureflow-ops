// The pure ACORD 25 payload builder.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Ported verbatim to supabase/functions/_shared/acord25/buildAcord25FieldValues.ts.
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Sections 4.2-4.8,
// 0.1; blueprint B Sections 4.2-4.8.
//
// Guarantees:
// - Pure and deterministic: same input -> byte-identical output. No Date.now(),
//   no locale formatting, no randomness, no I/O.
// - Total over the field map (D5): every ACORD25_FIELD_MAP entry appears in
//   fieldValues. Unused text/ynText/date/limit -> '' ; unused checkbox -> false.
// - Never throws on bad input; returns ok:false with issues.
// - Output vocabulary is the snapshot schema (D14, R8): boolean for checkbox
//   kinds, literal 'Y'/'N'/'' for ynText kinds, formatted strings otherwise.
//   No '/1' or '/Off' export-value strings ever.

import {
  ACORD25_FIELD_MAP,
  type Acord25LogicalKey,
  type InsurerLetter,
} from './fieldMap.ts';
import type {
  Acord25BuildInput,
  Acord25CoverageLine,
  Acord25Issue,
  Acord25LineDateContext,
  Acord25LineKey,
  Acord25PrintFlag,
  BuildAcord25Result,
  InsurerAssignment,
} from './types.ts';
import { formatAcordDateShort, formatLimit } from './format.ts';

// ---------------------------------------------------------------------------
// Row logical-key prefixes per line key (Section 0.1). 'property' and 'other'
// both print on the OTHER row (other_ prefix).
// ---------------------------------------------------------------------------

type RowPrefix = 'gl' | 'auto' | 'umb' | 'wc' | 'other';

function rowPrefixFor(line: Acord25LineKey): RowPrefix {
  switch (line) {
    case 'gl':
      return 'gl';
    case 'auto':
      return 'auto';
    case 'umbrella':
      return 'umb';
    case 'wc':
      return 'wc';
    case 'property':
    case 'other':
      return 'other';
  }
}

const INSURER_LETTERS: InsurerLetter[] = ['A', 'B', 'C', 'D', 'E', 'F'];

// Human display names for lines used in issue messages.
function lineDisplayName(line: Acord25LineKey): string {
  switch (line) {
    case 'gl':
      return 'General Liability';
    case 'auto':
      return 'Automobile Liability';
    case 'umbrella':
      return 'Umbrella/Excess Liability';
    case 'wc':
      return "Workers Compensation and Employers' Liability";
    case 'property':
      return 'Property';
    case 'other':
      return 'Other';
  }
}

// ---------------------------------------------------------------------------
// Y/N print semantics (Section 4.4). Returns the literal to print plus any issue.
//
// The print INTENT is authoritative: the certificate prints Y whenever the staff
// user set the toggle on, and N when off, regardless of the policy endorsement
// resolution. When Y is printed without a confirmed endorsement behind it, a
// NON-BLOCKING advisory is recorded (an honest E&O trail); it never 422s the
// issue, and the per-line UI toggle carries the matching "Manage in Master COI"
// note. Setting the toggle off is always a clean N.
// ---------------------------------------------------------------------------

type YnColumn = 'ADDL_INSD' | 'SUBR_WVD';

function columnLabel(col: YnColumn): string {
  return col === 'ADDL_INSD' ? 'ADDL INSD' : 'SUBR WVD';
}

function resolveYn(
  flag: Acord25PrintFlag,
  col: YnColumn,
  line: Acord25LineKey,
  logicalKey: Acord25LogicalKey,
): { printed: 'Y' | 'N'; issue: Acord25Issue | null } {
  // Off -> clean N, always.
  if (!flag.printIntent) {
    return { printed: 'N', issue: null };
  }

  // On + confirmed endorsement -> Y, no issue.
  if (flag.resolved === 'endorsed') {
    return { printed: 'Y', issue: null };
  }

  // On + no confirmed endorsement -> Y by manual choice, with a non-blocking
  // advisory so the certificate snapshot records the manual assertion.
  const label = columnLabel(col);
  const lineName = lineDisplayName(line);
  const manualCode = col === 'ADDL_INSD' ? 'ADDL_INSD_MANUAL' : 'SUBR_WVD_MANUAL';
  return {
    printed: 'Y',
    issue: {
      code: manualCode,
      severity: 'warning',
      message: `${label} prints Y on ${lineName} by manual choice; no confirmed endorsement backs it for this holder. Confirm the policy carries it or manage it in Master COI.`,
      lineKey: line,
      logicalKeys: [logicalKey],
    },
  };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildAcord25FieldValues(input: Acord25BuildInput): BuildAcord25Result {
  const issues: Acord25Issue[] = [];
  const logicalValues = {} as Record<Acord25LogicalKey, string | boolean>;

  const mapKeys = Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[];

  // Pre-onboarding guard: empty map -> single FIELD_MAP_UNPOPULATED error.
  if (mapKeys.length === 0) {
    return {
      ok: false,
      fieldValues: {},
      logicalValues,
      lineDates: [],
      issues: [
        {
          code: 'FIELD_MAP_UNPOPULATED',
          severity: 'error',
          message:
            'The ACORD 25 field map is not populated yet. Complete template onboarding before generating certificates.',
        },
      ],
    };
  }

  // Initialize logicalValues to the totality defaults (Section 4.2, D5).
  for (const key of mapKeys) {
    const entry = ACORD25_FIELD_MAP[key];
    logicalValues[key] = entry.kind === 'checkbox' ? false : '';
  }

  // Local setters that also track that a key exists in the map (defensive).
  const setText = (key: Acord25LogicalKey, value: string): void => {
    if (key in ACORD25_FIELD_MAP) {
      logicalValues[key] = value;
    }
  };
  const setBool = (key: Acord25LogicalKey, value: boolean): void => {
    if (key in ACORD25_FIELD_MAP) {
      logicalValues[key] = value;
    }
  };

  // Emit a date field, catching malformed ISO input.
  const setDate = (key: Acord25LogicalKey, iso: string, line?: Acord25LineKey): void => {
    if (!iso) {
      setText(key, '');
      return;
    }
    try {
      setText(key, formatAcordDateShort(iso));
    } catch {
      setText(key, '');
      issues.push({
        code: 'DATE_INVALID',
        severity: 'error',
        message: `The date "${iso}" is not a valid YYYY-MM-DD date${
          line ? ` on the ${lineDisplayName(line)} line` : ''
        }.`,
        lineKey: line,
        logicalKeys: [key],
      });
    }
  };

  // Emit a limit field (null -> '', never '0'). $ prefix only when the box lacks
  // a preprinted dollar sign.
  const setLimit = (key: Acord25LogicalKey, value: number | null): void => {
    if (value === null || value === undefined) {
      setText(key, '');
      return;
    }
    const entry = ACORD25_FIELD_MAP[key];
    const formatted = formatLimit(value);
    setText(key, entry?.dollarPrefixOnForm ? formatted : `$${formatted}`);
  };

  // ----- header -----
  setDate('certificateDate', input.certificateDate);
  setText('certificateNumber', input.certificateNumber ?? '');
  setText('revisionNumber', input.revisionNumber ?? '');

  // ----- producer block (split address) -----
  setText('producerName', input.producer.agencyName ?? '');
  distributeAddress(input.producer.addressLines ?? [], {
    line1: 'producerAddress',
    line2: 'producerAddress2',
    city: 'producerCity',
    state: 'producerState',
    zip: 'producerZip',
  }, setText);
  setText('producerContactName', input.producer.contactName ?? '');
  setText('producerPhone', input.producer.phone ?? '');
  setText('producerFax', input.producer.fax ?? '');
  setText('producerEmail', input.producer.email ?? '');

  // ----- insured block (split address) -----
  setText('insuredName', input.insured.name ?? '');
  distributeAddress(input.insured.addressLines ?? [], {
    line1: 'insuredAddress',
    line2: 'insuredAddress2',
    city: 'insuredCity',
    state: 'insuredState',
    zip: 'insuredZip',
  }, setText);

  // ----- lines selection guard -----
  if (!input.lines || input.lines.length === 0) {
    issues.push({
      code: 'NO_LINES_SELECTED',
      severity: 'error',
      message: 'No coverage lines are selected. Select at least one line to generate a certificate.',
    });
  }

  // ----- OTHER row conflict (Section 0.1) -----
  const otherRowLines = (input.lines ?? []).filter(
    (l) => rowPrefixFor(l.line) === 'other',
  );
  if (otherRowLines.length > 1) {
    issues.push({
      code: 'OTHER_ROW_CONFLICT',
      severity: 'error',
      message: `The ACORD 25 has one OTHER coverage row and this selection needs ${otherRowLines.length}. Uncheck lines or issue two certificates.`,
    });
  }

  // ----- letter assignments (consumed, not computed; Section 4.3) -----
  const assignments = input.letterAssignments ?? [];

  // TOO_MANY_CARRIERS backstop.
  if (assignments.length > 6) {
    issues.push({
      code: 'TOO_MANY_CARRIERS',
      severity: 'error',
      message: `This selection needs ${assignments.length} insurers but the ACORD 25 has 6 letter rows (A-F). Issue two certificates.`,
    });
  }

  // Detect two assignments sharing a letter (LETTER_CONFLICT).
  const letterSeen = new Set<string>();
  for (const a of assignments) {
    if (letterSeen.has(a.letter)) {
      issues.push({
        code: 'LETTER_CONFLICT',
        severity: 'error',
        message: `Insurer letter ${a.letter} is assigned to more than one carrier. Refresh the Master COI panel and retry.`,
      });
    }
    letterSeen.add(a.letter);
  }

  // Populate insurer table rows for present letters (only first assignment for a
  // given letter, to keep totality deterministic; conflicts already flagged).
  const assignmentByLetter = new Map<string, InsurerAssignment>();
  for (const a of assignments) {
    if (!assignmentByLetter.has(a.letter)) {
      assignmentByLetter.set(a.letter, a);
    }
  }
  for (const letter of INSURER_LETTERS) {
    const a = assignmentByLetter.get(letter);
    setText(`insurerName_${letter}`, a ? a.name ?? '' : '');
    setText(`insurerNaic_${letter}`, a && a.naic ? a.naic : '');
  }

  // Track which letters are actually referenced by a selected line, so we can
  // emit NAIC_MISSING warnings only for used carriers.
  const usedLetters = new Set<string>();

  // Per-line raw ISO date pairs for V10 (expiration >= effective). Collected from
  // the same lines the builder actually places (a skipped second OTHER row is not
  // recorded, matching what prints).
  const lineDates: Acord25LineDateContext[] = [];

  // ----- per-line placement -----
  for (const cl of input.lines ?? []) {
    const prefix = rowPrefixFor(cl.line);

    // Skip a second OTHER-row line: the conflict is already reported and writing
    // both would overwrite; only the first OTHER-row line prints.
    if (prefix === 'other' && otherRowLines.length > 1 && otherRowLines[0] !== cl) {
      continue;
    }

    lineDates.push({
      lineKey: cl.line,
      effectiveDate: cl.effectiveDate ?? '',
      expirationDate: cl.expirationDate ?? '',
    });

    // Insurer letter placement.
    const assignment = findAssignmentForLine(cl.line, assignments, issues);
    if (assignment) {
      setText(`${prefix}_insrLtr` as Acord25LogicalKey, assignment.letter);
      usedLetters.add(assignment.letter);
      if (assignment.naic === null || assignment.naic === undefined || assignment.naic === '') {
        issues.push({
          code: 'NAIC_MISSING',
          severity: 'warning',
          message: `Insurer ${assignment.letter} (${assignment.name}) has no NAIC code. The NAIC # column will print blank.`,
          lineKey: cl.line,
          logicalKeys: [`insurerNaic_${assignment.letter}` as Acord25LogicalKey],
        });
      }
    }

    // Policy number + dates (shared across all rows).
    setText(`${prefix}_policyNumber` as Acord25LogicalKey, cl.policyNumber ?? '');
    setDate(`${prefix}_effDate` as Acord25LogicalKey, cl.effectiveDate, cl.line);
    setDate(`${prefix}_expDate` as Acord25LogicalKey, cl.expirationDate, cl.line);

    // ADDL INSD (null for wc: no column).
    if (cl.additionalInsured) {
      const addlKey = `${prefix}_addlInsd` as Acord25LogicalKey;
      if (addlKey in ACORD25_FIELD_MAP) {
        const { printed, issue } = resolveYn(cl.additionalInsured, 'ADDL_INSD', cl.line, addlKey);
        setText(addlKey, printed);
        if (issue) {
          issues.push(issue);
        }
      }
    }

    // SUBR WVD (present on every row including wc).
    {
      const subrKey = `${prefix}_subrWvd` as Acord25LogicalKey;
      if (subrKey in ACORD25_FIELD_MAP) {
        const { printed, issue } = resolveYn(cl.waiverOfSubrogation, 'SUBR_WVD', cl.line, subrKey);
        setText(subrKey, printed);
        if (issue) {
          issues.push(issue);
        }
      }
    }

    // Line-specific detail blocks.
    if (cl.line === 'gl' && cl.gl) {
      setBool('gl_occurCheckbox', cl.gl.occurrence);
      setBool('gl_claimsMadeCheckbox', cl.gl.claimsMade);
      setBool('gl_aggPerPolicyCheckbox', cl.gl.aggregateAppliesPer === 'policy');
      setBool('gl_aggPerProjectCheckbox', cl.gl.aggregateAppliesPer === 'project');
      setBool('gl_aggPerLocCheckbox', cl.gl.aggregateAppliesPer === 'location');
      setLimit('gl_eachOccurrence', cl.gl.eachOccurrence);
      setLimit('gl_damageToRented', cl.gl.damageToRented);
      setLimit('gl_medExp', cl.gl.medExp);
      setLimit('gl_personalAdvInjury', cl.gl.personalAdvInjury);
      setLimit('gl_generalAggregate', cl.gl.generalAggregate);
      setLimit('gl_productsCompOpAgg', cl.gl.productsCompOpAgg);
    } else if (cl.line === 'auto' && cl.auto) {
      setBool('auto_anyAutoCheckbox', cl.auto.anyAuto);
      setBool('auto_ownedOnlyCheckbox', cl.auto.ownedOnly);
      setBool('auto_scheduledCheckbox', cl.auto.scheduled);
      setBool('auto_hiredCheckbox', cl.auto.hired);
      setBool('auto_nonOwnedCheckbox', cl.auto.nonOwned);
      setLimit('auto_combinedSingleLimit', cl.auto.combinedSingleLimit);
      setLimit('auto_biPerPerson', cl.auto.biPerPerson);
      setLimit('auto_biPerAccident', cl.auto.biPerAccident);
      setLimit('auto_propertyDamage', cl.auto.propertyDamage);
    } else if (cl.line === 'umbrella' && cl.umbrella) {
      setBool('umb_umbrellaCheckbox', cl.umbrella.type === 'umbrella');
      setBool('umb_excessCheckbox', cl.umbrella.type === 'excess');
      setBool('umb_occurCheckbox', cl.umbrella.basis === 'occurrence');
      setBool('umb_claimsMadeCheckbox', cl.umbrella.basis === 'claims_made');
      const dr = cl.umbrella.dedOrRetention;
      setBool('umb_dedCheckbox', dr?.kind === 'ded');
      setBool('umb_retentionCheckbox', dr?.kind === 'retention');
      setLimit('umb_dedRetAmount', dr ? dr.amount : null);
      setLimit('umb_eachOccurrence', cl.umbrella.eachOccurrence);
      setLimit('umb_aggregate', cl.umbrella.aggregate);
    } else if (cl.line === 'wc' && cl.wc) {
      setBool('wc_perStatuteCheckbox', cl.wc.perStatute);
      setBool('wc_otherCheckbox', cl.wc.other);
      setLimit('wc_elEachAccident', cl.wc.elEachAccident);
      setLimit('wc_elDiseaseEachEmployee', cl.wc.elDiseaseEachEmployee);
      setLimit('wc_elDiseasePolicyLimit', cl.wc.elDiseasePolicyLimit);
      setText('wc_anyProprietorExcluded', cl.wc.proprietorExcluded ?? '');
    } else if (prefix === 'other' && cl.otherRow) {
      setText('other_type', cl.otherRow.typeLabel ?? '');
      setText('other_limitsText', cl.otherRow.limitsText ?? '');
    }
  }

  // NAIC_MISSING for used carriers whose assignment naic is null were already
  // emitted per-line above; usedLetters kept for potential future cross-checks.
  void usedLetters;

  // ----- per-section write-in coverages (Section 0.1 write-in rows) -----
  // gl/auto/umbrella each own a dedicated write-in NAME + LIMIT AMOUNT pair. Emit
  // a line's native write-in only when that line was actually selected/printed
  // (mirror the standard line-field gating), and only when the resolved write-in
  // is present. Deterministic: iterate a fixed key order, skip when absent.
  const selectedWriteInLines = new Set<'gl' | 'auto' | 'umbrella'>();
  for (const cl of input.lines ?? []) {
    if (cl.line === 'gl' || cl.line === 'auto' || cl.line === 'umbrella') {
      selectedWriteInLines.add(cl.line);
    }
  }
  const WRITE_IN_KEYS: Array<{
    line: 'gl' | 'auto' | 'umbrella';
    descKey: Acord25LogicalKey;
    amountKey: Acord25LogicalKey;
  }> = [
    { line: 'gl', descKey: 'gl_writeInDesc', amountKey: 'gl_writeInAmount' },
    { line: 'auto', descKey: 'auto_writeInDesc', amountKey: 'auto_writeInAmount' },
    { line: 'umbrella', descKey: 'umb_writeInDesc', amountKey: 'umb_writeInAmount' },
  ];
  for (const { line, descKey, amountKey } of WRITE_IN_KEYS) {
    if (!selectedWriteInLines.has(line)) {
      continue;
    }
    const writeIn = input.writeInCoverages?.[line];
    if (!writeIn) {
      continue;
    }
    setText(descKey, writeIn.name ?? '');
    setLimit(amountKey, writeIn.amount ?? null);
  }

  // ----- description of operations + remarks join (Section 4.6, D18) -----
  const doo = (input.descriptionOfOperations ?? '').trim();
  const rem = (input.remarks ?? '').trim();
  const printedDoo = rem.length > 0 ? `${doo}\n\n${rem}` : doo;
  setText('descriptionOfOperations', printedDoo);

  // ----- holder block (split address) -----
  if (input.holder) {
    setText('holderName', input.holder.name ?? '');
    distributeAddress(input.holder.addressLines ?? [], {
      line1: 'holderAddress',
      line2: 'holderAddress2',
      city: 'holderCity',
      state: 'holderState',
      zip: 'holderZip',
    }, setText);
  } else {
    // Master preview without holder: leave blank, warn (validator escalates to
    // error in issue mode via V8).
    issues.push({
      code: 'HOLDER_MISSING',
      severity: 'warning',
      message: 'No certificate holder is selected. Add a holder before issuing this certificate.',
      logicalKeys: ['holderName'],
    });
  }

  // ----- authorized representative (text field on this blank) -----
  setText('authorizedRepName', input.authorizedRepName ?? '');

  // ----- map logicalValues -> exact PDF field names (total) -----
  const fieldValues: Record<string, string | boolean> = {};
  for (const key of mapKeys) {
    const entry = ACORD25_FIELD_MAP[key];
    fieldValues[entry.pdfField] = logicalValues[key];
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, fieldValues, logicalValues, lineDates, issues };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the single assignment whose lines[] contains the given line key. Emits
 * LETTER_UNASSIGNED when none, LETTER_CONFLICT when more than one. Returns the
 * first match (or null) so placement is deterministic even in the error case.
 */
function findAssignmentForLine(
  line: Acord25LineKey,
  assignments: InsurerAssignment[],
  issues: Acord25Issue[],
): InsurerAssignment | null {
  const matches = assignments.filter((a) => a.lines?.includes(line));
  if (matches.length === 0) {
    issues.push({
      code: 'LETTER_UNASSIGNED',
      severity: 'error',
      message: `The ${lineDisplayName(line)} line has no insurer letter assignment. Refresh the Master COI panel and retry.`,
      lineKey: line,
    });
    return null;
  }
  if (matches.length > 1) {
    issues.push({
      code: 'LETTER_CONFLICT',
      severity: 'error',
      message: `The ${lineDisplayName(line)} line is assigned to more than one insurer letter. Refresh the Master COI panel and retry.`,
      lineKey: line,
    });
  }
  return matches[0];
}

interface AddressKeySet {
  line1: Acord25LogicalKey;
  line2: Acord25LogicalKey;
  city: Acord25LogicalKey;
  state: Acord25LogicalKey;
  zip: Acord25LogicalKey;
}

/**
 * Distribute an addressLines[] array across the split line1/line2/city/state/zip
 * fields of this blank. Convention (deterministic):
 *   [street]                      -> line1
 *   [street, cityStateZip]        -> line1, then parse trailing "City, ST ZIP"
 *   [street, unit, cityStateZip]  -> line1, line2, then parse cityStateZip
 * When the final line parses as "City, ST 12345" it fills city/state/zip; if it
 * does not parse, it is placed verbatim into line2 (or line1 when alone).
 */
function distributeAddress(
  lines: string[],
  keys: AddressKeySet,
  setText: (key: Acord25LogicalKey, value: string) => void,
): void {
  // Reset all to '' first for totality safety.
  setText(keys.line1, '');
  setText(keys.line2, '');
  setText(keys.city, '');
  setText(keys.state, '');
  setText(keys.zip, '');

  const clean = (lines ?? []).map((l) => (l ?? '').trim()).filter((l) => l.length > 0);
  if (clean.length === 0) {
    return;
  }

  const last = clean[clean.length - 1];
  const parsed = parseCityStateZip(last);

  if (parsed) {
    // Everything before the last line is street/unit.
    const streetLines = clean.slice(0, clean.length - 1);
    if (streetLines.length >= 1) {
      setText(keys.line1, streetLines[0]);
    }
    if (streetLines.length >= 2) {
      setText(keys.line2, streetLines.slice(1).join(', '));
    }
    setText(keys.city, parsed.city);
    setText(keys.state, parsed.state);
    setText(keys.zip, parsed.zip);
  } else {
    // No parseable city/state/zip trailer: place street lines directly.
    setText(keys.line1, clean[0]);
    if (clean.length >= 2) {
      setText(keys.line2, clean.slice(1).join(', '));
    }
  }
}

/**
 * Parse a "City, ST 12345" or "City, ST 12345-6789" trailer. Returns null when
 * the string does not match, so the caller can fall back to line placement.
 */
function parseCityStateZip(s: string): { city: string; state: string; zip: string } | null {
  const m = /^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(s.trim());
  if (!m) {
    return null;
  }
  return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] };
}
