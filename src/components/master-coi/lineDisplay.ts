// Master COI line-display helpers (blueprint Section 2.13).
//
// One source of truth for: the ACORD-25 line labels, the currency format, and
// the per-line ordered limit-cell list. Imported by CoverageLineRow, the drawer,
// and Cell so no label map or currency format is re-derived per call site.
//
// Consumes the read-model contract in src/types/master-coi.ts verbatim; renames
// nothing. Every value passed to Cell here is a COICell (or undefined for a
// line-specific cell that is absent when present:false), matching the
// undefined-safe Cell contract.

import type {
  COICell,
  COILineAuto,
  COILineGL,
  COILineKey,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
} from '@/types/master-coi';

// ---------------------------------------------------------------------------
// Line labels (ACORD 25 coverage rows)
// ---------------------------------------------------------------------------

/** Full ACORD-25 line label for each of the five certificate lines. */
export const LINE_LABEL: Record<Exclude<COILineKey, 'other'>, string> = {
  gl: 'Commercial General Liability',
  auto: 'Automobile Liability',
  umbrella: 'Umbrella/Excess Liability',
  wc: 'Workers Compensation and Employers Liability',
  property: 'Property',
};

/** Label for any line key, including the unclassified `other` bucket. */
export function lineLabel(line: COILineKey): string {
  return line === 'other' ? 'Other' : LINE_LABEL[line];
}

// ---------------------------------------------------------------------------
// Currency formatting (tabular, no cents)
// ---------------------------------------------------------------------------

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Whole-dollar currency, no cents. Empty string for null/undefined. */
export function formatCurrency(v: number | null | undefined): string {
  return v == null ? '' : CURRENCY.format(v);
}

// ---------------------------------------------------------------------------
// Per-line ordered limit cells
// ---------------------------------------------------------------------------

/**
 * One labeled cell for the limits strip / drawer limits section. `cell` is
 * undefined when the underlying line-specific cell is absent (a line can return
 * only its COILineBase fields while present:false, per the read-model binding
 * note 3) — Cell renders undefined as "Missing", so callers pass it straight
 * through.
 */
export interface LimitCell {
  label: string;
  cell: COICell<string | number | boolean> | undefined;
  format: 'currency' | 'text';
}

type AnyPresentLine =
  | COILineGL
  | COILineAuto
  | COILineUmbrella
  | COILineWC
  | COILineProperty;

/**
 * The ordered limit cells for one line, keyed off the line type. Line-specific
 * cells are read defensively (they may be omitted when the line is absent), so
 * every access is optional-chained and defaults to undefined.
 *
 * Ordering mirrors the ACORD 25 form order per line:
 *  - GL: each occurrence, damage to rented premises, medical expense,
 *    personal and advertising injury, general aggregate, products/completed ops.
 *  - Auto: combined single limit when `limit_type.v === 'csl'`, otherwise the
 *    split BI-per-person / BI-per-accident / PD-per-accident set.
 *  - Umbrella: each occurrence, aggregate, then the deductible-or-retention
 *    amount labeled by its kind.
 *  - WC: "Per statute" flag, then the three Employers Liability limits.
 *  - Property: label, limit amount, limit description.
 */
export function limitCellsFor(line: COILineKey, data: AnyPresentLine): LimitCell[] {
  switch (line) {
    case 'gl': {
      const gl = data as COILineGL;
      const limits = gl.limits;
      return [
        { label: 'Each occurrence', cell: limits?.each_occurrence, format: 'currency' },
        { label: 'Damage to rented premises', cell: limits?.damage_to_rented_premises, format: 'currency' },
        { label: 'Medical expense', cell: limits?.medical_expense, format: 'currency' },
        { label: 'Personal and advertising injury', cell: limits?.personal_advertising_injury, format: 'currency' },
        { label: 'General aggregate', cell: limits?.general_aggregate, format: 'currency' },
        { label: 'Products and completed operations aggregate', cell: limits?.products_completed_ops_aggregate, format: 'currency' },
      ];
    }
    case 'auto': {
      const auto = data as COILineAuto;
      const isCsl = auto.limit_type?.v === 'csl';
      if (isCsl) {
        return [
          { label: 'Combined single limit', cell: auto.csl, format: 'currency' },
        ];
      }
      return [
        { label: 'Bodily injury (per person)', cell: auto.bi_per_person, format: 'currency' },
        { label: 'Bodily injury (per accident)', cell: auto.bi_per_accident, format: 'currency' },
        { label: 'Property damage (per accident)', cell: auto.pd_per_accident, format: 'currency' },
      ];
    }
    case 'umbrella': {
      const umb = data as COILineUmbrella;
      const dedKind = umb.ded_or_retention?.kind?.v;
      const dedLabel =
        dedKind === 'retention'
          ? 'Retention'
          : dedKind === 'deductible'
            ? 'Deductible'
            : 'Deductible or retention';
      return [
        { label: 'Each occurrence', cell: umb.each_occurrence, format: 'currency' },
        { label: 'Aggregate', cell: umb.aggregate, format: 'currency' },
        { label: dedLabel, cell: umb.ded_or_retention?.amount, format: 'currency' },
      ];
    }
    case 'wc': {
      const wc = data as COILineWC;
      return [
        { label: 'Per statute', cell: wc.per_statute, format: 'text' },
        { label: 'E.L. each accident', cell: wc.el_each_accident, format: 'currency' },
        { label: 'E.L. disease (each employee)', cell: wc.el_disease_each_employee, format: 'currency' },
        { label: 'E.L. disease (policy limit)', cell: wc.el_disease_policy_limit, format: 'currency' },
      ];
    }
    case 'property': {
      const prop = data as COILineProperty;
      return [
        { label: 'Coverage', cell: prop.label, format: 'text' },
        { label: 'Limit', cell: prop.limit_amount, format: 'currency' },
        { label: 'Limit description', cell: prop.limit_description, format: 'text' },
      ];
    }
    default:
      return [];
  }
}
