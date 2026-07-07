// Per-line ACORD-25 coverage-field spec for the policy detail coverage panel.
//
// One pure helper. Given a line key and the matching line object from the Master
// COI read-model (src/types/master-coi.ts), it returns the ordered ACORD-25
// coverage fields to render for that line: the coverage-attribute cells
// (occurrence/claims-made, aggregate basis, limit type, umbrella-or-excess, the
// ded/retention kind, WC per-statute, Property label/description) plus the money
// limit rows. The money limit rows REUSE limitCellsFor from lineDisplay.ts so
// there is one source of truth for limit ordering and labels; this helper only
// adds the coverage-attribute cells that limitCellsFor omits.
//
// Each field is editable IFF its `cell.path` is non-null (the registry write
// path); enum `enumOptions` are consumed only in edit mode. Renames nothing from
// the read-model. No runtime UI here, no currency formatting (the panel formats).

import { limitCellsFor } from '@/components/master-coi/lineDisplay';
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
 * One ordered ACORD-25 coverage field for a line. `cell` is the read-model cell
 * (undefined when the underlying line-specific cell is absent, e.g. a line that
 * returns only its base fields while present:false). A field is editable IFF
 * `cell?.path` is non-null. `enumOptions` are used only when `kind === 'enum'`.
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
// Per-line enum vocabularies (ACORD 25)
// ---------------------------------------------------------------------------

const OCCURRENCE_OR_CLAIMS_MADE: CoverageFieldOption[] = [
  { value: 'occurrence', label: 'Occurrence' },
  { value: 'claims_made', label: 'Claims-Made' },
];

const AGGREGATE_APPLIES_PER: CoverageFieldOption[] = [
  { value: 'policy', label: 'Policy' },
  { value: 'project', label: 'Project' },
  { value: 'location', label: 'Loc' },
];

const AUTO_LIMIT_TYPE: CoverageFieldOption[] = [
  { value: 'csl', label: 'Combined Single Limit' },
  { value: 'split', label: 'Split Limits' },
];

const UMBRELLA_OR_EXCESS: CoverageFieldOption[] = [
  { value: 'umbrella', label: 'Umbrella' },
  { value: 'excess', label: 'Excess' },
];

const DED_OR_RETENTION_KIND: CoverageFieldOption[] = [
  { value: 'deductible', label: 'Deductible' },
  { value: 'retention', label: 'Retention' },
];

// ---------------------------------------------------------------------------
// The helper
// ---------------------------------------------------------------------------

/**
 * The ordered ACORD-25 coverage fields for one line, keyed off the line key.
 * Money limit rows come from `limitCellsFor`; the coverage-attribute cells that
 * `limitCellsFor` omits are added here in ACORD 25 form order.
 *
 * Ordering per line:
 *  - GL: occurrence/claims-made, aggregate-applies-per, then the 6 GL limits.
 *  - Auto: limit type, then the CSL or split BI/PD limits (limitCellsFor already
 *    returns the correct set for the current limit_type).
 *  - Umbrella: umbrella-or-excess, occurrence/claims-made, then each-occurrence
 *    and aggregate, then the ded/retention kind immediately before its amount.
 *  - WC: per-statute (bool), then the three Employers Liability money limits
 *    (the duplicate per-statute row that limitCellsFor emits is dropped here).
 *  - Property: label (text), limit amount (money), limit description (text).
 */
export function policyCoverageFields(
  lineKey: CoverageLineKey,
  line: AnyCoverageLine | undefined,
): CoverageField[] {
  if (!line) return [];

  switch (lineKey) {
    case 'gl': {
      const gl = line as COILineGL;
      const limits = limitCellsFor('gl', gl).map(toMoneyField);
      return [
        {
          label: 'Coverage form',
          cell: gl.occurrence_or_claims_made,
          kind: 'enum',
          enumOptions: OCCURRENCE_OR_CLAIMS_MADE,
        },
        {
          label: 'General aggregate applies per',
          cell: gl.aggregate_applies_per,
          kind: 'enum',
          enumOptions: AGGREGATE_APPLIES_PER,
        },
        ...limits,
      ];
    }

    case 'auto': {
      const auto = line as COILineAuto;
      // limitCellsFor('auto') already returns CSL when limit_type.v === 'csl',
      // else the split BI-per-person / BI-per-accident / PD-per-accident rows.
      const limits = limitCellsFor('auto', auto).map(toMoneyField);
      return [
        {
          label: 'Limit type',
          cell: auto.limit_type,
          kind: 'enum',
          enumOptions: AUTO_LIMIT_TYPE,
        },
        ...limits,
      ];
    }

    case 'umbrella': {
      const umb = line as COILineUmbrella;
      // limitCellsFor('umbrella') returns each-occurrence, aggregate, then the
      // ded/retention amount (labeled by its kind). Split it so the ded/retention
      // KIND enum sits immediately before the ded/retention amount row.
      const limits = limitCellsFor('umbrella', umb).map(toMoneyField);
      const amountRow = limits[limits.length - 1];
      const leadingLimits = limits.slice(0, Math.max(0, limits.length - 1));
      return [
        {
          label: 'Umbrella or excess',
          cell: umb.umbrella_or_excess,
          kind: 'enum',
          enumOptions: UMBRELLA_OR_EXCESS,
        },
        {
          label: 'Coverage form',
          cell: umb.occurrence_or_claims_made,
          kind: 'enum',
          enumOptions: OCCURRENCE_OR_CLAIMS_MADE,
        },
        ...leadingLimits,
        {
          label: 'Deductible or retention',
          cell: umb.ded_or_retention?.kind,
          kind: 'enum',
          enumOptions: DED_OR_RETENTION_KIND,
        },
        ...(amountRow ? [amountRow] : []),
      ];
    }

    case 'wc': {
      const wc = line as COILineWC;
      // limitCellsFor('wc') leads with a per-statute row then the three EL
      // limits; render per-statute as a bool here and the three EL cells as
      // money directly, so the per-statute row is not duplicated.
      return [
        { label: 'Per statute', cell: wc.per_statute, kind: 'bool' },
        {
          label: 'E.L. each accident',
          cell: wc.el_each_accident,
          kind: 'money',
        },
        {
          label: 'E.L. disease (each employee)',
          cell: wc.el_disease_each_employee,
          kind: 'money',
        },
        {
          label: 'E.L. disease (policy limit)',
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
        {
          label: 'Limit description',
          cell: prop.limit_description,
          kind: 'text',
        },
      ];
    }

    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Internal: adapt a limitCellsFor LimitCell into a CoverageField
// ---------------------------------------------------------------------------

/**
 * A limitCellsFor row is a labeled cell with a 'currency' | 'text' format. Money
 * rows become 'money' coverage fields; the rare 'text' limit rows (Property's
 * label / description) become 'text' fields. Property is handled explicitly
 * above, so in practice every limit row routed through here is currency, but the
 * mapping stays honest for either format.
 */
function toMoneyField(limit: {
  label: string;
  cell: COICell | undefined;
  format: 'currency' | 'text';
}): CoverageField {
  return {
    label: limit.label,
    cell: limit.cell,
    kind: limit.format === 'currency' ? 'money' : 'text',
  };
}
