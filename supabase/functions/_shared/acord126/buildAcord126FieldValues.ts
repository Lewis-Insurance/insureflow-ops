// The pure ACORD 126 payload builder.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib. The only import from outside this
// directory is ../acord25/format, which is itself import-free (checked at
// authoring), so the runtime surface stays zero. Clones the
// acord125/buildAcord125FieldValues.ts pattern.
//
// Guarantees:
// - Pure and deterministic: same input -> byte-identical output. No Date.now(),
//   no locale formatting, no randomness, no I/O.
// - Total over the field map: every ACORD126_FIELD_MAP entry appears in
//   fieldValues. Unused text/date/limit/wholeNumber/rate -> '' ; unused
//   checkbox -> false.
// - Never throws on bad input; returns ok:false with issues.
// - Output vocabulary is the snapshot schema: boolean for checkbox kinds,
//   formatted strings otherwise. No '/1' or '/Off' export-value strings ever.
//
// Placement rules specific to this form:
// - The six LIMITS boxes and the two deductible amounts have a preprinted $
//   on the blank, so they print bare grouped digits; the hazard PREMIUM
//   column has no preprinted $, so it prints '$' + grouped digits (the
//   acord25 setLimit convention). null prints blank, never '0'.
// - Hazard EXPOSURE prints bare grouped digits with no currency symbol ever
//   (payroll dollars, square feet, units... the basis code carries the unit).
// - Hazard RATE prints via String(n): decimals pass through unrounded.
// - Hazard rows print in input order onto rows 1-9; rows 10 and up are
//   dropped with a HAZARDS_OVERFLOW warning (the blank has 9 schedule rows;
//   overflow belongs on an additional schedule page).
// - coverage.claimsMade / coverage.occurrence print exactly as given; their
//   mutual exclusivity is validateAcord126's rule, not the builder's.
// - aggregateAppliesPer is one-hot over POLICY / PROJECT / LOCATION; null
//   checks nothing.
// - Mapped fields with no Phase 1b input backing (formDate, the agency
//   customer id boxes, the deductibles block; see fieldMap.ts) keep their
//   totality defaults.

import {
  ACORD126_FIELD_MAP,
  type Acord126LogicalKey,
  type HazardRowNumber,
} from './fieldMap.ts';
import type {
  Acord126Input,
  Acord126Issue,
  BuildAcord126Result,
} from './types.ts';
// Reused by import per the module boundary rule: acord25/format.ts carries no
// imports of its own, so pulling it here keeps acord126 runtime-free.
import { formatAcordDate, formatLimit } from '../acord25/format.ts';

/** The blank carries 9 schedule-of-hazards rows (page 1). */
const HAZARD_ROW_COUNT = 9;

const HAZARD_ROW_NUMBERS: HazardRowNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildAcord126FieldValues(input: Acord126Input): BuildAcord126Result {
  const issues: Acord126Issue[] = [];
  const logicalValues = {} as Record<Acord126LogicalKey, string | boolean>;

  const mapKeys = Object.keys(ACORD126_FIELD_MAP) as Acord126LogicalKey[];

  // Pre-onboarding guard: empty map -> single FIELD_MAP_UNPOPULATED error.
  if (mapKeys.length === 0) {
    return {
      ok: false,
      fieldValues: {},
      logicalValues,
      issues: [
        {
          code: 'FIELD_MAP_UNPOPULATED',
          severity: 'error',
          message:
            'The ACORD 126 field map is not populated yet. Complete template onboarding before generating applications.',
        },
      ],
    };
  }

  // Initialize logicalValues to the totality defaults.
  for (const key of mapKeys) {
    const entry = ACORD126_FIELD_MAP[key];
    logicalValues[key] = entry.kind === 'checkbox' ? false : '';
  }

  // Local setters that also track that a key exists in the map (defensive).
  const setText = (key: Acord126LogicalKey, value: string): void => {
    if (key in ACORD126_FIELD_MAP) {
      logicalValues[key] = value;
    }
  };
  const setBool = (key: Acord126LogicalKey, value: boolean): void => {
    if (key in ACORD126_FIELD_MAP) {
      logicalValues[key] = value;
    }
  };

  // Emit a date field, catching malformed ISO input.
  const setDate = (key: Acord126LogicalKey, iso: string): void => {
    if (!iso) {
      setText(key, '');
      return;
    }
    try {
      setText(key, formatAcordDate(iso));
    } catch {
      setText(key, '');
      issues.push({
        code: 'DATE_INVALID',
        severity: 'error',
        message: `The date "${iso}" is not a valid YYYY-MM-DD date.`,
        logicalKeys: [key],
      });
    }
  };

  // Emit a limit field (null -> '', never '0'). $ prefix only when the box
  // lacks a preprinted dollar sign.
  const setLimit = (key: Acord126LogicalKey, value: number | null): void => {
    if (value === null || value === undefined) {
      setText(key, '');
      return;
    }
    const entry = ACORD126_FIELD_MAP[key];
    const formatted = formatLimit(value);
    setText(key, entry?.dollarPrefixOnForm ? formatted : `$${formatted}`);
  };

  // Emit a whole-number field: bare grouped digits, no currency symbol ever
  // (the hazard exposure column; units come from the basis code).
  const setWholeNumber = (key: Acord126LogicalKey, value: number | null): void => {
    if (value === null || value === undefined) {
      setText(key, '');
      return;
    }
    setText(key, formatLimit(value));
  };

  // Emit a decimal rate: String(n) passes decimals through unrounded and is
  // deterministic; non-finite input prints blank.
  const setRate = (key: Acord126LogicalKey, value: number | null): void => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      setText(key, '');
      return;
    }
    setText(key, String(value));
  };

  // ----- header strip -----
  // formDate and the agency customer id boxes have no Phase 1b input backing
  // (fieldMap.ts) and keep their totality defaults.
  const header = input.header;
  setText('producerName', header?.producerName ?? '');
  setText('insuredName', header?.namedInsured ?? '');
  setDate('effectiveDate', header?.effectiveDate ?? '');

  // ----- coverage form -----
  const coverage = input.coverage;
  setBool('coverageClaimsMadeCheckbox', coverage?.claimsMade ?? false);
  setBool('coverageOccurrenceCheckbox', coverage?.occurrence ?? false);

  // ----- general aggregate limit applies per (one-hot) -----
  const appliesPer = input.aggregateAppliesPer ?? null;
  setBool('aggregatePolicyCheckbox', appliesPer === 'policy');
  setBool('aggregateProjectCheckbox', appliesPer === 'project');
  setBool('aggregateLocationCheckbox', appliesPer === 'location');

  // ----- limits column -----
  const limits = input.limits;
  setLimit('limitEachOccurrence', limits?.eachOccurrence ?? null);
  setLimit('limitDamageToRentedPremises', limits?.damageToRentedPremises ?? null);
  setLimit('limitMedicalExpense', limits?.medicalExpense ?? null);
  setLimit('limitPersonalAdvInjury', limits?.personalAdvInjury ?? null);
  setLimit('limitGeneralAggregate', limits?.generalAggregate ?? null);
  setLimit('limitProductsCompOpsAggregate', limits?.productsCompOpsAggregate ?? null);

  // ----- deductibles -----
  // No input backing in the Phase 1b model (fieldMap.ts); the block keeps its
  // totality defaults (unchecked boxes, blank amounts).

  // ----- schedule of hazards rows 1-9 -----
  const hazards = input.hazards ?? [];
  if (hazards.length > HAZARD_ROW_COUNT) {
    issues.push({
      code: 'HAZARDS_OVERFLOW',
      severity: 'warning',
      message: `This risk has ${hazards.length} hazard rows but the ACORD 126 schedule carries ${HAZARD_ROW_COUNT}. Rows past ${HAZARD_ROW_COUNT} will not print; attach an additional schedule.`,
    });
  }
  for (const row of HAZARD_ROW_NUMBERS) {
    const h = hazards[row - 1];
    if (!h) {
      continue; // totality defaults already hold
    }
    setText(`hazard${row}ClassCode`, h.classCode ?? '');
    setText(`hazard${row}PremiumBasis`, h.premiumBasis ?? '');
    setWholeNumber(`hazard${row}Exposure`, h.exposure ?? null);
    setText(`hazard${row}Territory`, h.territory ?? '');
    setRate(`hazard${row}Rate`, h.rate ?? null);
    setLimit(`hazard${row}Premium`, h.premium ?? null);
  }

  // ----- map logicalValues -> exact PDF field names (total) -----
  const fieldValues: Record<string, string | boolean> = {};
  for (const key of mapKeys) {
    const entry = ACORD126_FIELD_MAP[key];
    fieldValues[entry.pdfField] = logicalValues[key];
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, fieldValues, logicalValues, issues };
}
