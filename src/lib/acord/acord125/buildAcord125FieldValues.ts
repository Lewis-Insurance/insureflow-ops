// The pure ACORD 125 payload builder.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib. The only import from outside this
// directory is ../acord25/format, which is itself import-free (checked at
// authoring), so the runtime surface stays zero. Clones the
// acord25/buildAcord25FieldValues.ts pattern.
//
// Guarantees:
// - Pure and deterministic: same input -> byte-identical output. No Date.now(),
//   no locale formatting, no randomness, no I/O.
// - Total over the field map: every ACORD125_FIELD_MAP entry appears in
//   fieldValues. Unused text/date/limit -> '' ; unused checkbox -> false.
// - Never throws on bad input; returns ok:false with issues.
// - Output vocabulary is the snapshot schema: boolean for checkbox kinds,
//   formatted strings otherwise. No '/1' or '/Off' export-value strings ever.
//
// Placement rules specific to this form:
// - The GL premium prints only while the GL line is checked; null prints blank,
//   never '0'.
// - Premises rows print in input order onto rows 1-4; rows 5 and up are dropped
//   with a PREMISES_OVERFLOW warning (the blank has 4 location rows; overflow
//   belongs on an additional premises schedule).
// - producer.authorizedRepName prints on BOTH page 4 boxes (typed signature
//   line and the printed-name box); both are plain text fields on this blank.
// - The nature-of-business and legal-entity checkbox groups are total over the
//   map: boxes with no input backing (see fieldMap.ts) always emit false.

import {
  ACORD125_FIELD_MAP,
  type Acord125LogicalKey,
  type PremisesRowNumber,
} from './fieldMap';
import type {
  Acord125Input,
  Acord125Issue,
  BuildAcord125Result,
} from './types';
// Reused by import per the module boundary rule: acord25/format.ts carries no
// imports of its own, so pulling it here keeps acord125 runtime-free.
import { formatAcordDate, formatLimit } from '../acord25/format';

/** The blank carries 4 premises/location rows (page 2, suffixes _A.._D). */
const PREMISES_ROW_COUNT = 4;

const PREMISES_ROW_NUMBERS: PremisesRowNumber[] = [1, 2, 3, 4];

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildAcord125FieldValues(input: Acord125Input): BuildAcord125Result {
  const issues: Acord125Issue[] = [];
  const logicalValues = {} as Record<Acord125LogicalKey, string | boolean>;

  const mapKeys = Object.keys(ACORD125_FIELD_MAP) as Acord125LogicalKey[];

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
            'The ACORD 125 field map is not populated yet. Complete template onboarding before generating applications.',
        },
      ],
    };
  }

  // Initialize logicalValues to the totality defaults.
  for (const key of mapKeys) {
    const entry = ACORD125_FIELD_MAP[key];
    logicalValues[key] = entry.kind === 'checkbox' ? false : '';
  }

  // Local setters that also track that a key exists in the map (defensive).
  const setText = (key: Acord125LogicalKey, value: string): void => {
    if (key in ACORD125_FIELD_MAP) {
      logicalValues[key] = value;
    }
  };
  const setBool = (key: Acord125LogicalKey, value: boolean): void => {
    if (key in ACORD125_FIELD_MAP) {
      logicalValues[key] = value;
    }
  };

  // Emit a date field, catching malformed ISO input.
  const setDate = (key: Acord125LogicalKey, iso: string): void => {
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
  const setLimit = (key: Acord125LogicalKey, value: number | null): void => {
    if (value === null || value === undefined) {
      setText(key, '');
      return;
    }
    const entry = ACORD125_FIELD_MAP[key];
    const formatted = formatLimit(value);
    setText(key, entry?.dollarPrefixOnForm ? formatted : `$${formatted}`);
  };

  // ----- header -----
  setDate('completionDate', input.completionDate);

  // ----- producer block -----
  const producer = input.producer;
  setText('producerName', producer?.name ?? '');
  setText('producerAddress', producer?.addressLine1 ?? '');
  setText('producerAddress2', producer?.addressLine2 ?? '');
  setText('producerCity', producer?.city ?? '');
  setText('producerState', producer?.state ?? '');
  setText('producerZip', producer?.zip ?? '');
  setText('producerContactName', producer?.contactName ?? '');
  setText('producerPhone', producer?.phone ?? '');
  setText('producerFax', producer?.fax ?? '');
  setText('producerEmail', producer?.email ?? '');

  // Agency customer id repeats in the header of every page.
  const customerId = producer?.customerId ?? '';
  setText('producerCustomerId', customerId);
  setText('producerCustomerIdP2', customerId);
  setText('producerCustomerIdP3', customerId);
  setText('producerCustomerIdP4', customerId);

  // ----- named insured #1 -----
  const namedInsured = input.namedInsured;
  setText('insuredName', namedInsured?.name ?? '');
  setText('insuredAddress', namedInsured?.addressLine1 ?? '');
  setText('insuredAddress2', namedInsured?.addressLine2 ?? '');
  setText('insuredCity', namedInsured?.city ?? '');
  setText('insuredState', namedInsured?.state ?? '');
  setText('insuredZip', namedInsured?.zip ?? '');
  setText('insuredFein', namedInsured?.fein ?? '');
  setText('insuredSic', namedInsured?.sic ?? '');
  setText('insuredNaics', namedInsured?.naics ?? '');
  setText('insuredPhone', namedInsured?.phone ?? '');
  setText('insuredWebsite', namedInsured?.website ?? '');

  // Legal entity: at most one box per the closed input vocabulary. The
  // notForProfit and subchapterSCorp boxes have no input value yet and keep
  // their totality default (false).
  const entityType = namedInsured?.entityType ?? null;
  setBool('insuredEntityCorporationCheckbox', entityType === 'corporation');
  setBool('insuredEntityLlcCheckbox', entityType === 'llc');
  setBool('insuredEntityIndividualCheckbox', entityType === 'individual');
  setBool('insuredEntityPartnershipCheckbox', entityType === 'partnership');
  setBool('insuredEntityJointVentureCheckbox', entityType === 'joint_venture');
  setBool('insuredEntityTrustCheckbox', entityType === 'trust');
  setBool('insuredEntityOtherCheckbox', entityType === 'other');

  // ----- policy block -----
  setText('policyNumber', input.policy?.policyNumber ?? '');
  setDate('policyEffectiveDate', input.policy?.effectiveDate ?? '');
  setDate('policyExpirationDate', input.policy?.expirationDate ?? '');

  // ----- lines of business -----
  const lob = input.linesOfBusiness;
  setBool('lobGlCheckbox', lob?.gl ?? false);
  // Premium prints only while the line is checked, so an unchecked GL row can
  // never carry a stray amount.
  setLimit('lobGlPremium', lob?.gl ? lob.glPremium : null);
  setBool('lobPropertyCheckbox', lob?.property ?? false);
  setBool('lobAutoCheckbox', lob?.auto ?? false);
  setBool('lobUmbrellaCheckbox', lob?.umbrella ?? false);

  // ----- premises rows 1-4 -----
  const premises = input.premises ?? [];
  if (premises.length > PREMISES_ROW_COUNT) {
    issues.push({
      code: 'PREMISES_OVERFLOW',
      severity: 'warning',
      message: `This risk has ${premises.length} premises but the ACORD 125 carries ${PREMISES_ROW_COUNT} location rows. Rows past ${PREMISES_ROW_COUNT} will not print; attach an additional premises schedule.`,
    });
  }
  for (const row of PREMISES_ROW_NUMBERS) {
    const p = premises[row - 1];
    if (!p) {
      continue; // totality defaults already hold
    }
    setText(`premises${row}Street`, p.street ?? '');
    setText(`premises${row}City`, p.city ?? '');
    setText(`premises${row}State`, p.state ?? '');
    setText(`premises${row}Zip`, p.zip ?? '');
    setText(`premises${row}County`, p.county ?? '');
    setBool(`premises${row}OwnCheckbox`, p.interest === 'own');
    setBool(`premises${row}LeaseCheckbox`, p.interest === 'lease');
  }

  // ----- nature of business -----
  // The business-type checkbox group has no input backing yet (fieldMap.ts);
  // only the free-text description prints.
  setText('natureOfBusinessDescription', (input.natureOfBusiness?.description ?? '').trim());

  // ----- page 4 producer signature line -----
  const repName = producer?.authorizedRepName ?? '';
  setText('producerSignature', repName);
  setText('producerPrintedName', repName);

  // ----- map logicalValues -> exact PDF field names (total) -----
  const fieldValues: Record<string, string | boolean> = {};
  for (const key of mapKeys) {
    const entry = ACORD125_FIELD_MAP[key];
    fieldValues[entry.pdfField] = logicalValues[key];
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, fieldValues, logicalValues, issues };
}
