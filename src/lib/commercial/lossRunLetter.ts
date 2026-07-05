// ============================================================================
// LOSS RUN REQUEST LETTER (Commercial Lines SOW v3, feeder #8 - Phase 2)
// ============================================================================
// Pure composition of the loss-run request letter with its authorization
// (LOA) block. Deterministic: the date is an input, never read from the
// clock here. Plain text so it can be copied into email, printed, or pasted
// into a carrier portal. No em or en dashes.
// ============================================================================

export interface LossRunLetterInput {
  /** Prior/incumbent carrier the runs are requested from. */
  carrierName: string;
  /** The insured's legal/business name as it appears on the policy. */
  insuredName: string;
  /** Known policy numbers with this carrier (optional). */
  policyNumbers?: string[];
  /** How many years of currently valued loss runs to request. */
  yearsBack: number;
  /** MM/DD/YYYY display date for the letterhead. */
  dateUs: string;
  agencyName?: string;
  agencyContactLine?: string;
}

export function composeLossRunLetter(input: LossRunLetterInput): string {
  const agency = input.agencyName?.trim() || 'Lewis Insurance';
  const contact = input.agencyContactLine?.trim() || 'brian@lewisinsurance.ai';
  const policies =
    input.policyNumbers && input.policyNumbers.filter((p) => p.trim()).length > 0
      ? input.policyNumbers.filter((p) => p.trim()).join(', ')
      : 'all policies held by the named insured';
  // 0 clamps to 1 (the || idiom would silently turn 0 into the default).
  const years = Math.max(1, Math.min(Number.isFinite(input.yearsBack) ? input.yearsBack : 5, 10));

  return [
    `${agency}`,
    `${contact}`,
    ``,
    `${input.dateUs}`,
    ``,
    `To: ${input.carrierName.trim()}`,
    `Re: Loss run request - ${input.insuredName.trim()}`,
    `Policies: ${policies}`,
    ``,
    `To whom it may concern,`,
    ``,
    `Please provide currently valued loss runs for the above named insured for the`,
    `past ${years} policy ${years === 1 ? 'year' : 'years'}, including open and closed claims with paid and`,
    `reserved amounts and valuation date. Please send them to the contact above.`,
    ``,
    `The insured's authorization appears below. Thank you for your prompt handling;`,
    `carriers are customarily expected to provide loss runs within 10 business days.`,
    ``,
    `Sincerely,`,
    `${agency}`,
    ``,
    `--------------------------------------------------------------------------`,
    `AUTHORIZATION TO RELEASE LOSS INFORMATION`,
    ``,
    `I authorize ${input.carrierName.trim()} to release loss history information for`,
    `${input.insuredName.trim()} to ${agency}.`,
    ``,
    `Name: _______________________________  Title: ______________________`,
    ``,
    `Signature: __________________________  Date: _______________________`,
  ].join('\n');
}
