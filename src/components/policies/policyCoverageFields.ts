// Per-line ACORD-25 coverage-field spec for the policy detail coverage panel.
//
// One pure helper. Given a line key and the matching line object from the Master
// COI read-model (src/types/master-coi.ts), it returns the ordered coverage
// fields to render for that line, labeled with the EXACT ACORD 25 (2016/03) form
// wording (e.g. "DAMAGE TO RENTED PREMISES (Ea occurrence)", "E.L. DISEASE - EA
// EMPLOYEE"). Cells are read directly off the read-model line so this file owns
// the labels independently of the Master COI panel's own display helpers.
//
// Each field carries its own STATIC `path` (the coi_field_registry write path).
// Editability is driven by that static path, NOT by the read-model cell's `path`:
// get_master_coi nulls the cell path (and omits the limit cells entirely) when a
// policy lands on the "absent line skeleton" - which happens for empty-blob
// commercial policies and line-of-business values its crosswalk does not classify.
// Sourcing the path here keeps every registry-backed field editable regardless of
// how the read-model classified the policy; save_master_coi_fields validates the
// path and writes the viewed policy's blob, which then self-classifies. Every field
// returned here is editable (its static `path` is non-null). `zone` groups fields
// into the panel's two sections: 'basis' (coverage form / type toggles) and 'limit'
// (the money amounts).

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

/** Which of the panel's two zones a field belongs to. */
export type CoverageFieldZone = 'basis' | 'limit';

/** One coverage-field option for an enum field (edit mode only). */
export interface CoverageFieldOption {
  value: string;
  label: string;
}

/**
 * One ordered coverage field for a line, labeled with exact ACORD 25 wording.
 * `cell` is the read-model cell for the current value (undefined when the line's
 * cell is absent, e.g. an empty/absent line that returns only its base fields).
 * `path` is the STATIC registry write path and the source of truth for editability
 * and for the save payload; null only for fields with no registry row (WC "Per
 * Statute"). `enumOptions` are used only when `kind === 'enum'`.
 */
export interface CoverageField {
  label: string;
  cell: COICell | undefined;
  kind: CoverageFieldKind;
  path: string | null;
  zone: CoverageFieldZone;
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
// Registry write paths (coi_field_registry.path), grouped by line for legibility.
// These are the exact whitelisted paths save_master_coi_fields accepts.
// ---------------------------------------------------------------------------

const GL = {
  occurrence_or_claims_made: 'cgl_details.coverage_options.policy_form',
  aggregate_applies_per: 'cgl_details.limits.aggregate_applies_per',
  each_occurrence: 'cgl_details.limits.each_occurrence',
  damage_to_rented_premises: 'cgl_details.limits.damage_to_rented_premises',
  medical_expense: 'cgl_details.limits.medical_expense',
  personal_advertising_injury: 'cgl_details.limits.personal_advertising_injury',
  general_aggregate: 'cgl_details.limits.general_aggregate',
  products_completed_ops_aggregate:
    'cgl_details.limits.products_completed_ops_aggregate',
} as const;

const AUTO = {
  limit_type: 'bap_details.coverage.liability.limit_type',
  csl_limit: 'bap_details.coverage.liability.csl_limit',
  bi_per_person: 'bap_details.coverage.liability.bodily_injury_per_person',
  bi_per_accident: 'bap_details.coverage.liability.bodily_injury_per_accident',
  property_damage: 'bap_details.coverage.liability.property_damage',
} as const;

const UMB = {
  policy_type: 'umbrella_details.policy_type',
  occurrence_or_claims_made: 'umbrella_details.coi_summary.occurrence_or_claims_made',
  ded_or_retention_kind: 'umbrella_details.coi_summary.ded_or_retention_kind',
  per_occurrence: 'umbrella_details.limits.per_occurrence',
  aggregate: 'umbrella_details.limits.aggregate',
  retention_amount: 'umbrella_details.retention.amount',
} as const;

const WC = {
  el_each_accident:
    'wc_details.coverage.part_two_employers_liability.each_accident',
  el_disease_each_employee:
    'wc_details.coverage.part_two_employers_liability.disease_each_employee',
  el_disease_policy_limit:
    'wc_details.coverage.part_two_employers_liability.disease_policy_limit',
} as const;

const PROP = {
  label: 'property_details.coi_summary.label',
  limit_amount: 'property_details.coi_summary.limit_amount',
  limit_description: 'property_details.coi_summary.limit_description',
} as const;

// ---------------------------------------------------------------------------
// The helper
// ---------------------------------------------------------------------------

/**
 * The ordered ACORD-25 coverage fields for one line, keyed off the line key.
 * Labels are the exact ACORD 25 (2016/03) form wording; ordering mirrors the
 * form top-to-bottom per section. Tolerates a missing/absent `line` (returns the
 * full field skeleton with undefined cells) so a not-yet-populated policy is still
 * fully editable. `overrides` (the panel's in-flight edit map, keyed by registry
 * path) is consulted for fields whose visible set depends on another field - today
 * only the Auto CSL/Split toggle - so switching the toggle swaps the limit rows
 * immediately, before a save round-trip.
 */
export function policyCoverageFields(
  lineKey: CoverageLineKey,
  line: AnyCoverageLine | undefined,
  overrides?: Record<string, unknown>,
): CoverageField[] {
  switch (lineKey) {
    case 'gl': {
      const gl = (line ?? {}) as COILineGL;
      const limits = gl.limits;
      return [
        {
          label: 'Occurrence / Claims-Made',
          cell: gl.occurrence_or_claims_made,
          kind: 'enum',
          enumOptions: OCCUR_OR_CLAIMS_MADE,
          path: GL.occurrence_or_claims_made,
          zone: 'basis',
        },
        {
          label: "Gen'l Aggregate Limit Applies Per",
          cell: gl.aggregate_applies_per,
          kind: 'enum',
          enumOptions: AGGREGATE_APPLIES_PER,
          path: GL.aggregate_applies_per,
          zone: 'basis',
        },
        {
          label: 'EACH OCCURRENCE',
          cell: limits?.each_occurrence,
          kind: 'money',
          path: GL.each_occurrence,
          zone: 'limit',
        },
        {
          label: 'DAMAGE TO RENTED PREMISES (Ea occurrence)',
          cell: limits?.damage_to_rented_premises,
          kind: 'money',
          path: GL.damage_to_rented_premises,
          zone: 'limit',
        },
        {
          label: 'MED EXP (Any one person)',
          cell: limits?.medical_expense,
          kind: 'money',
          path: GL.medical_expense,
          zone: 'limit',
        },
        {
          label: 'PERSONAL & ADV INJURY',
          cell: limits?.personal_advertising_injury,
          kind: 'money',
          path: GL.personal_advertising_injury,
          zone: 'limit',
        },
        {
          label: 'GENERAL AGGREGATE',
          cell: limits?.general_aggregate,
          kind: 'money',
          path: GL.general_aggregate,
          zone: 'limit',
        },
        {
          label: 'PRODUCTS - COMP/OP AGG',
          cell: limits?.products_completed_ops_aggregate,
          kind: 'money',
          path: GL.products_completed_ops_aggregate,
          zone: 'limit',
        },
      ];
    }

    case 'auto': {
      const auto = (line ?? {}) as COILineAuto;
      // Effective limit type: a live edit wins, else the stored value. When neither
      // is set, default to CSL unless the policy already carries split limits (so
      // existing split data is never hidden behind a CSL default).
      const editedType = overrides?.[AUTO.limit_type];
      const storedType = auto.limit_type?.v ?? null;
      const effectiveType =
        (typeof editedType === 'string' ? editedType : null) ?? storedType;
      const hasSplit =
        auto.bi_per_person?.v != null ||
        auto.bi_per_accident?.v != null ||
        auto.pd_per_accident?.v != null;
      const isCsl = effectiveType ? effectiveType === 'csl' : !hasSplit;
      const limitRows: CoverageField[] = isCsl
        ? [
            {
              label: 'COMBINED SINGLE LIMIT (Ea accident)',
              cell: auto.csl,
              kind: 'money',
              path: AUTO.csl_limit,
              zone: 'limit',
            },
          ]
        : [
            {
              label: 'BODILY INJURY (Per person)',
              cell: auto.bi_per_person,
              kind: 'money',
              path: AUTO.bi_per_person,
              zone: 'limit',
            },
            {
              label: 'BODILY INJURY (Per accident)',
              cell: auto.bi_per_accident,
              kind: 'money',
              path: AUTO.bi_per_accident,
              zone: 'limit',
            },
            {
              label: 'PROPERTY DAMAGE (Per accident)',
              cell: auto.pd_per_accident,
              kind: 'money',
              path: AUTO.property_damage,
              zone: 'limit',
            },
          ];
      return [
        {
          label: 'Limit Type',
          cell: auto.limit_type,
          kind: 'enum',
          enumOptions: AUTO_LIMIT_TYPE,
          path: AUTO.limit_type,
          zone: 'basis',
        },
        ...limitRows,
      ];
    }

    case 'umbrella': {
      const umb = (line ?? {}) as COILineUmbrella;
      return [
        {
          label: 'Umbrella / Excess',
          cell: umb.umbrella_or_excess,
          kind: 'enum',
          enumOptions: UMBRELLA_OR_EXCESS,
          path: UMB.policy_type,
          zone: 'basis',
        },
        {
          label: 'Occurrence / Claims-Made',
          cell: umb.occurrence_or_claims_made,
          kind: 'enum',
          enumOptions: OCCUR_OR_CLAIMS_MADE,
          path: UMB.occurrence_or_claims_made,
          zone: 'basis',
        },
        {
          label: 'DED / RETENTION',
          cell: umb.ded_or_retention?.kind,
          kind: 'enum',
          enumOptions: DED_OR_RETENTION_KIND,
          path: UMB.ded_or_retention_kind,
          zone: 'basis',
        },
        {
          label: 'EACH OCCURRENCE',
          cell: umb.each_occurrence,
          kind: 'money',
          path: UMB.per_occurrence,
          zone: 'limit',
        },
        {
          label: 'AGGREGATE',
          cell: umb.aggregate,
          kind: 'money',
          path: UMB.aggregate,
          zone: 'limit',
        },
        {
          label: 'DED / RETENTION $',
          cell: umb.ded_or_retention?.amount,
          kind: 'money',
          path: UMB.retention_amount,
          zone: 'limit',
        },
      ];
    }

    case 'wc': {
      const wc = (line ?? {}) as COILineWC;
      // "Per Statute" is intentionally NOT shown here: it has no registry row (so
      // it was never editable) and the ACORD 25 PER STATUTE box is now always
      // checked on every certificate (see fromMasterCoi). WC is just its 3 E.L.
      // limits.
      return [
        {
          label: 'E.L. EACH ACCIDENT',
          cell: wc.el_each_accident,
          kind: 'money',
          path: WC.el_each_accident,
          zone: 'limit',
        },
        {
          label: 'E.L. DISEASE - EA EMPLOYEE',
          cell: wc.el_disease_each_employee,
          kind: 'money',
          path: WC.el_disease_each_employee,
          zone: 'limit',
        },
        {
          label: 'E.L. DISEASE - POLICY LIMIT',
          cell: wc.el_disease_policy_limit,
          kind: 'money',
          path: WC.el_disease_policy_limit,
          zone: 'limit',
        },
      ];
    }

    case 'property': {
      const prop = (line ?? {}) as COILineProperty;
      return [
        { label: 'Coverage', cell: prop.label, kind: 'text', path: PROP.label, zone: 'basis' },
        {
          label: 'Limit',
          cell: prop.limit_amount,
          kind: 'money',
          path: PROP.limit_amount,
          zone: 'limit',
        },
        {
          label: 'Description',
          cell: prop.limit_description,
          kind: 'text',
          path: PROP.limit_description,
          zone: 'limit',
        },
      ];
    }

    default:
      return [];
  }
}
