// Master COI endorsement StatusPill override maps (blueprint Section 2.12).
//
// Keyed by the closed three-state endorsement vocabulary (COIEndorsementStatus:
// 'endorsed' | 'requested' | 'none'). ADDL_PILL drives additional-insured rows
// (GL / umbrella / auto / property); SUBR_PILL drives WC subrogation-waiver
// rows. `tone` is a StatusPill Tone; the `as const` narrows each entry to the
// StatusPill override shape.

export const ADDL_PILL = {
  endorsed: { label: 'AI endorsed', tone: 'success' as const },
  requested: { label: 'AI requested', tone: 'warning' as const },
  none: { label: 'No AI endorsement', tone: 'neutral' as const },
};

export const SUBR_PILL = {
  endorsed: { label: 'Waiver on file', tone: 'success' as const },
  requested: { label: 'Waiver requested', tone: 'warning' as const },
  none: { label: 'No waiver', tone: 'neutral' as const },
};
