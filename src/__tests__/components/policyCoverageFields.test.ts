// Contract test for the policy coverage-field spec.
//
// The panel drives editability and the save payload off each field's STATIC
// `path`. If a path here does not match a coi_field_registry row, save_master_coi_fields
// silently rejects it (unknown_path) and the limit never reaches the COI - a
// wrong path is invisible in the UI but breaks certificate issuance. This test
// pins every path to the registry seed (20260702171000_master_coi_profiles_and_provenance.sql),
// the zone split, and the Auto CSL/Split reactivity.

import { describe, it, expect } from 'vitest';
import {
  policyCoverageFields,
  type CoverageField,
} from '@/components/policies/policyCoverageFields';

// The line-level editable registry paths, verbatim from the migration seed. The 4
// policy-level rows (carrier_naic / named_insured / dba / named_insured_dba) are
// edited elsewhere and are intentionally not in the coverage panel.
const REGISTRY_LINE_PATHS = new Set<string>([
  // gl
  'cgl_details.coverage_options.policy_form',
  'cgl_details.limits.aggregate_applies_per',
  'cgl_details.limits.each_occurrence',
  'cgl_details.limits.damage_to_rented_premises',
  'cgl_details.limits.medical_expense',
  'cgl_details.limits.personal_advertising_injury',
  'cgl_details.limits.general_aggregate',
  'cgl_details.limits.products_completed_ops_aggregate',
  // auto
  'bap_details.coverage.liability.limit_type',
  'bap_details.coverage.liability.csl_limit',
  'bap_details.coverage.liability.bodily_injury_per_person',
  'bap_details.coverage.liability.bodily_injury_per_accident',
  'bap_details.coverage.liability.property_damage',
  // umbrella
  'umbrella_details.policy_type',
  'umbrella_details.coi_summary.occurrence_or_claims_made',
  'umbrella_details.coi_summary.ded_or_retention_kind',
  'umbrella_details.limits.per_occurrence',
  'umbrella_details.limits.aggregate',
  'umbrella_details.retention.amount',
  // wc
  'wc_details.coverage.part_two_employers_liability.each_accident',
  'wc_details.coverage.part_two_employers_liability.disease_each_employee',
  'wc_details.coverage.part_two_employers_liability.disease_policy_limit',
  // property
  'property_details.coi_summary.label',
  'property_details.coi_summary.limit_amount',
  'property_details.coi_summary.limit_description',
]);

const LINES = ['gl', 'auto', 'umbrella', 'wc', 'property'] as const;

const paths = (fields: CoverageField[]) => fields.map((f) => f.path);
const moneyPaths = (fields: CoverageField[]) =>
  fields.filter((f) => f.kind === 'money').map((f) => f.path);

describe('policyCoverageFields - registry path contract', () => {
  it('never invents a write path outside the registry', () => {
    for (const line of LINES) {
      for (const field of policyCoverageFields(line, undefined, { limit_type: 'x' })) {
        if (field.path !== null) {
          expect(REGISTRY_LINE_PATHS.has(field.path)).toBe(true);
        }
      }
    }
  });

  it('returns the full field skeleton even with no line data (fully editable from scratch)', () => {
    for (const line of LINES) {
      const fields = policyCoverageFields(line, undefined);
      expect(fields.length).toBeGreaterThan(0);
      // Every field is now editable - no read-only (null-path) fields remain.
      const nullPaths = fields.filter((f) => f.path === null);
      expect(nullPaths.length).toBe(0);
    }
  });
});

describe('policyCoverageFields - per-line mapping + zones', () => {
  it('GL: 2 basis toggles + 6 money limits', () => {
    const fields = policyCoverageFields('gl', undefined);
    expect(fields.filter((f) => f.zone === 'basis').map((f) => f.path)).toEqual([
      'cgl_details.coverage_options.policy_form',
      'cgl_details.limits.aggregate_applies_per',
    ]);
    expect(moneyPaths(fields)).toEqual([
      'cgl_details.limits.each_occurrence',
      'cgl_details.limits.damage_to_rented_premises',
      'cgl_details.limits.medical_expense',
      'cgl_details.limits.personal_advertising_injury',
      'cgl_details.limits.general_aggregate',
      'cgl_details.limits.products_completed_ops_aggregate',
    ]);
  });

  it('Umbrella: basis has the 3 toggles, limits has the 3 amounts', () => {
    const fields = policyCoverageFields('umbrella', undefined);
    expect(fields.filter((f) => f.zone === 'basis').map((f) => f.path)).toEqual([
      'umbrella_details.policy_type',
      'umbrella_details.coi_summary.occurrence_or_claims_made',
      'umbrella_details.coi_summary.ded_or_retention_kind',
    ]);
    expect(moneyPaths(fields)).toEqual([
      'umbrella_details.limits.per_occurrence',
      'umbrella_details.limits.aggregate',
      'umbrella_details.retention.amount',
    ]);
  });

  it('WC: just the 3 E.L. limits, no Per Statute field (always issued PER STATUTE)', () => {
    const fields = policyCoverageFields('wc', undefined);
    expect(fields.filter((f) => f.zone === 'basis')).toHaveLength(0);
    expect(fields.every((f) => f.kind === 'money')).toBe(true);
    expect(moneyPaths(fields)).toEqual([
      'wc_details.coverage.part_two_employers_liability.each_accident',
      'wc_details.coverage.part_two_employers_liability.disease_each_employee',
      'wc_details.coverage.part_two_employers_liability.disease_policy_limit',
    ]);
  });
});

describe('policyCoverageFields - Auto CSL vs Split reactivity', () => {
  it('defaults to a single CSL row when nothing is set', () => {
    expect(moneyPaths(policyCoverageFields('auto', undefined))).toEqual([
      'bap_details.coverage.liability.csl_limit',
    ]);
  });

  it('shows the 3 split rows when the edited limit type is split', () => {
    expect(
      moneyPaths(policyCoverageFields('auto', undefined, { 'bap_details.coverage.liability.limit_type': 'split' })),
    ).toEqual([
      'bap_details.coverage.liability.bodily_injury_per_person',
      'bap_details.coverage.liability.bodily_injury_per_accident',
      'bap_details.coverage.liability.property_damage',
    ]);
  });

  it('an in-flight csl override collapses back to the single CSL row', () => {
    expect(
      moneyPaths(policyCoverageFields('auto', undefined, { 'bap_details.coverage.liability.limit_type': 'csl' })),
    ).toEqual(['bap_details.coverage.liability.csl_limit']);
  });
});
