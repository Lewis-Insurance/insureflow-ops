// validateAcord126: the input-level correctness gate for the Phase 1b core.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Returns the { valid, issues } shape of validateAcord25 / validateAcord125.
//
// Deliberately minimal and honest: exactly three rules, all about what a GL
// section can never go out without.
//   R1 EACH OCCURRENCE is required (with R2 it is the COI registry's required
//      GL pair; a GL section without it is not certifiable downstream).
//   R2 GENERAL AGGREGATE is required (the other half of the pair).
//   R3 CLAIMS MADE and OCCURRENCE are mutually exclusive coverage forms; the
//      builder prints whatever it is given, so the conflict is flagged here.
// Everything else the blank tolerates blank at this phase. Template-integrity
// checks (field-name resolution, type agreement, overflow, edition pin) follow
// the validateAcord25 V2-V10 pattern and land with the fill pipeline; malformed
// ISO dates already surface as DATE_INVALID errors from the builder.

import type { Acord126Input, Acord126Issue } from './types';

export interface ValidateAcord126Result {
  /** false iff any severity 'error' issue. */
  valid: boolean;
  issues: Acord126Issue[];
}

export function validateAcord126(input: Acord126Input): ValidateAcord126Result {
  const issues: Acord126Issue[] = [];

  // R1: each occurrence limit.
  if (input.limits?.eachOccurrence == null) {
    issues.push({
      code: 'EACH_OCCURRENCE_MISSING',
      severity: 'error',
      message: 'An each occurrence limit is required on the general liability section.',
      logicalKeys: ['limitEachOccurrence'],
    });
  }

  // R2: general aggregate limit.
  if (input.limits?.generalAggregate == null) {
    issues.push({
      code: 'GENERAL_AGGREGATE_MISSING',
      severity: 'error',
      message: 'A general aggregate limit is required on the general liability section.',
      logicalKeys: ['limitGeneralAggregate'],
    });
  }

  // R3: coverage form exclusivity.
  if (input.coverage?.claimsMade && input.coverage?.occurrence) {
    issues.push({
      code: 'COVERAGE_FORM_CONFLICT',
      severity: 'error',
      message:
        'Claims made and occurrence are mutually exclusive coverage forms. Select one.',
      logicalKeys: ['coverageClaimsMadeCheckbox', 'coverageOccurrenceCheckbox'],
    });
  }

  const valid = !issues.some((i) => i.severity === 'error');
  return { valid, issues };
}
