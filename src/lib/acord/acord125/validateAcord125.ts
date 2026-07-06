// validateAcord125: the input-level correctness gate for the Phase 1b core.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Returns the { valid, issues } shape of validateAcord25.
//
// Deliberately minimal and honest: exactly two rules, both about what an
// application can never go out without.
//   R1 The named insured name is required.
//   R2 A proposed effective date is required as soon as any line of business
//      is checked (an application for coverage with no start date is not
//      actionable by an underwriter).
// Everything else the blank tolerates blank at this phase. Template-integrity
// checks (field-name resolution, type agreement, overflow, edition pin) follow
// the validateAcord25 V2-V10 pattern and land with the fill pipeline; malformed
// ISO dates already surface as DATE_INVALID errors from the builder.

import type { Acord125Input, Acord125Issue } from './types';

export interface ValidateAcord125Result {
  /** false iff any severity 'error' issue. */
  valid: boolean;
  issues: Acord125Issue[];
}

export function validateAcord125(input: Acord125Input): ValidateAcord125Result {
  const issues: Acord125Issue[] = [];

  // R1: named insured name.
  const insuredName = (input.namedInsured?.name ?? '').trim();
  if (insuredName.length === 0) {
    issues.push({
      code: 'INSURED_NAME_MISSING',
      severity: 'error',
      message: 'Named insured name is required.',
      logicalKeys: ['insuredName'],
    });
  }

  // R2: effective date once any line of business is checked.
  const lob = input.linesOfBusiness;
  const anyLineChecked = !!lob && (lob.gl || lob.property || lob.auto || lob.umbrella);
  const effectiveDate = (input.policy?.effectiveDate ?? '').trim();
  if (anyLineChecked && effectiveDate.length === 0) {
    issues.push({
      code: 'EFFECTIVE_DATE_MISSING',
      severity: 'error',
      message:
        'A proposed effective date is required when a line of business is selected.',
      logicalKeys: ['policyEffectiveDate'],
    });
  }

  const valid = !issues.some((i) => i.severity === 'error');
  return { valid, issues };
}
