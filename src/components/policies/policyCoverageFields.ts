// Per-line ACORD-25 coverage-field spec for the policy detail coverage panel.
//
// One pure helper. Given a line key and the matching line object from the Master
// COI read-model (src/types/master-coi.ts), it returns the ordered coverage
// fields to render for that line, labeled with the EXACT ACORD 25 (2016/03) form
// wording (e.g. "DAMAGE TO RENTED PREMISES (Ea occurrence)", "E.L. DISEASE - EA
// EMPLOYEE"). Cells are read directly off the read-model line so this file owns
// the labels independently of the Master COI panel's own display helpers.
//
// Each field is editable IFF its `cell.path` is non-null (the registry write
// path); enum `enumOptions` are consumed only in edit mode. Renames nothing from
// the read-model. No runtime UI here, no currency formatting (the panel formats).

import type {
  COICell,
  COILineAuto,
  COILineGL,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
} from '@/types/master-coi';

// ---------------------------------------------------------------------------
// The coverage-field shape the panel renders
// ---------------------------------------------------------------------------

/** How a coverage field is displayed and edited. */
export type CoverageFieldKind = 'money' | 'enum' | 'text' | 'bool';

/** One coverage-field option for an enum field (edit mode only). */
export interface CoverageFieldOption {
  value: string;
  label: string;
}

/**
 * One ordered coverage field for a line, labeled with exact ACORD 25 wording.
 * `cell` is the read-model cell (undefined when the underlying line-specific cell
 * is absent, e.g. a line that returns only its base fields while present:false).
 * A field is editable IFF `cell?.path` is non-null. `enumOptions` are used only
 * when `kind === 'enum'`.
 */
export interface CoverageField {
  label: string;
  cell: COICell | undefined;
  kind: CoverageFieldKind;
  enumOptions?: CoverageFieldOption[];
}

// The line union this helper accepts (the five ACORD lines, never `other`).
type AnyCoverageLine =
  | COILineGL
  | COILineAuto
  | COILineUmbrella
  | COILineWC
  | COILineProperty;

// The canonical line-key set this helper handles (excludes `other`).
type CoverageLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property';

// ---------------------------------------------------------------------------
// Per-line enum vocabularies, option labels in exact ACORD 25 form wording
// ---------------------------------------------------------------------------

const OCCUR_OR_CLAIMS_MADE: CoverageFieldOption[] = [
  { value: 'occurrence', label: 'OCCUR' },
  { value: 'claims_made', label: 'CLAIMS-MADE' },
];

const AGGREGATE_APPLIES_PER: CoverageFieldOption[] = [
  { value: 'policy', label: 'POLICY' },
  { value: 'project', label: 'PROJECT' },
  { value: 'location', label: 'LOC' },
];

const AUTO_LIMIT_TYPE: CoverageFieldOption[] = [
  { value: 'csl', label: 'Combined Single Limit' },
  { value: 'split', label: 'Split Limits' },
];

const UMBRELLA_OR_EXCESS: CoverageFieldOption[] = [
  { value: 'umbrella', label: 'UMBRELLA LIAB' },
  { value: 'excess', label: 'EXCESS LIAB' },
];

const DED_OR_RETENTION_KIND: CoverageFieldOption[] = [
  { value: 'deductible', label: 'DED' },
  { value: 'retention', label: 'RETENTION' },
];

// ---------------------------------------------------------------------------
// The helper
// ---------------------------------------------------------------------------

/**
 * The ordered ACORD-25 coverage fields for one line, keyed off the line key.
 * Labels are the exact ACORD 25 (2016/03) form wording; ordering mirrors the
 * form top-to-bottom per section.
 */
export function policyCoverageFields(
  lineKey: CoverageLineKey,
  line: AnyCoverageLine | undefined,
): CoverageField[] {
  if (!line) return [];

  switch (lineKey) {
    case 'gl': {
      const gl = line as COILineGL;
      const limits = gl.limits;
      return [
        {
          label: 'Occurrence / Claims-Made',
          cell: gl.occurrence_or_claims_made,
          kind: 'enum',
          enumOptions: OCCUR_OR_CLAIMS_MADE,
        },
        {
          label: "Gen'l Aggregate Limit Applies Per",
          cell: gl.aggregate_applies_per,
          kind: 'enum',
          enumOptions: AGGREGATE_APPLIES_PER,
        },
        { label: 'EACH OCCURRENCE', cell: limits?.each_occurrence, kind: 'money' },
        {
          label: 'DAMAGE TO RENTED PREMISES (Ea occurrence)',
          cell: limits?.damage_to_rented_premises,
          kind: 'money',
        },
        {
          label: 'MED EXP (Any one person)',
          cell: limits?.medical_expense,
          kind: 'money',
        },
        {
          label: 'PERSONAL & ADV INJURY',
          cell: limits?.personal_advertising_injury,
          kind: 'money',
        },
        {
          label: 'GENERAL AGGREGATE',
          cell: limits?.general_aggregate,
          kind: 'money',
        },
        {
          label: 'PRODUCTS - COMP/OP AGG',
          cell: limits?.products_completed_ops_aggregate,
          kind: 'money',
        },
      ];
    }

    case 'auto': {
      const auto = line as COILineAuto;
      const isCsl = auto.limit_type?.v === 'csl';
      const limitRows: CoverageField[] = isCsl
        ? [
            {
              label: 'COMBINED SINGLE LIMIT (Ea accident)',
              cell: auto.csl,
              kind: 'money',
            },
          ]
        : [
            {
              label: 'BODILY INJURY (Per person)',
              cell: auto.bi_per_person,
              kind: 'money',
            },
            {
              label: 'BODILY INJURY (Per accident)',
              cell: auto.bi_per_accident,
              kind: 'money',
            },
            {
              label: 'PROPERTY DAMAGE (Per accident)',
              cell: auto.pd_per_accident,
              kind: 'money',
            },
          ];
      return [
        {
          label: 'Limit Type',
          cell: auto.limit_type,
          kind: 'enum',
          enumOptions: AUTO_LIMIT_TYPE,
        },
        ...limitRows,
      ];
    }

    case 'umbrella': {
      const umb = line as COILineUmbrella;
      return [
        {
          label: 'Umbrella / Excess',
          cell: umb.umbrella_or_excess,
          kind: 'enum',
          enumOptions: UMBRELLA_OR_EXCESS,
        },
        {
          label: 'Occurrence / Claims-Made',
          cell: umb.occurrence_or_claims_made,
          kind: 'enum',
          enumOptions: OCCUR_OR_CLAIMS_MADE,
        },
        { label: 'EACH OCCURRENCE', cell: umb.each_occurrence, kind: 'money' },
        { label: 'AGGREGATE', cell: umb.aggregate, kind: 'money' },
        {
          label: 'DED / RETENTION',
          cell: umb.ded_or_retention?.kind,
          kind: 'enum',
          enumOptions: DED_OR_RETENTION_KIND,
        },
        {
          label: 'DED / RETENTION $',
          cell: umb.ded_or_retention?.amount,
          kind: 'money',
        },
      ];
    }

    case 'wc': {
      const wc = line as COILineWC;
      return [
        { label: 'Per Statute', cell: wc.per_statute, kind: 'bool' },
        {
          label: 'E.L. EACH ACCIDENT',
          cell: wc.el_each_accident,
          kind: 'money',
        },
        {
          label: 'E.L. DISEASE - EA EMPLOYEE',
          cell: wc.el_disease_each_employee,
          kind: 'money',
        },
        {
          label: 'E.L. DISEASE - POLICY LIMIT',
          cell: wc.el_disease_policy_limit,
          kind: 'money',
        },
      ];
    }

    case 'property': {
      const prop = line as COILineProperty;
      return [
        { label: 'Coverage', cell: prop.label, kind: 'text' },
        { label: 'Limit', cell: prop.limit_amount, kind: 'money' },
        { label: 'Description', cell: prop.limit_description, kind: 'text' },
      ];
    }

    default:
      return [];
  }
}
