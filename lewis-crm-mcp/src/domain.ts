// Binding Lewis Insurance domain rules (from Brian). These are encoded so even a
// locked-down rep agent applies them automatically — they are not optional guidance.

export const SPECIALTY_KEYWORDS = [
  "trailer", "rv", "motorhome", "motor home", "motorcycle", "fifth wheel",
  "5th wheel", "fifth-wheel", "camper", "boat", "atv", "utv", "golf cart", "jet ski",
];

/** Trailers/RVs/motorcycles/fifth-wheels belong on separate specialty policies. */
export function isSpecialtyVehicle(desc: string): boolean {
  const d = (desc || "").toLowerCase();
  return SPECIALTY_KEYWORDS.some((k) => d.includes(k));
}

export const DOMAIN_RULES = {
  specialtyOnSeparatePolicy:
    "Trailers, RVs, motorcycles, and fifth-wheels always go on separate specialty policies. Never flag them as an auto coverage gap.",
  aoPaidInFull:
    "Auto-Owners 'paid in full' on a dec page is a marketing prompt, not payment confirmation. Never set paid_in_full or record a payment from a dec-page line.",
  smartRide: "Always audit SmartRide on Nationwide auto policies.",
  bundle: "A bundle = Progressive Auto + any Florida HO carrier.",
  flProperty: "Florida property is a closed-market runoff, not a failure. Limited FL HO options are normal, not a problem.",
} as const;

export const EMAIL_VOICE = {
  rules: [
    "No em dashes or en dashes.",
    "Short sentences.",
    "Use contractions.",
    "Plain, direct, friendly — not corporate.",
  ],
  signature: "Thanks,\nBrian Lewis\nLewis Insurance\n(386) 755-0050",
} as const;

/**
 * Apply dec-page domain rules to a proposed policy record (mutates + returns warnings).
 * Hard rule: a dec page NEVER confirms payment.
 */
export function applyDecPageRules(proposal: {
  carrier?: string | null;
  line_of_business?: string | null;
  vehicles?: string[];
  paid_in_full?: boolean;
}): string[] {
  const warnings: string[] = [];
  proposal.paid_in_full = false; // never inferred from a dec page

  const carrier = (proposal.carrier || "").toLowerCase();
  const lob = (proposal.line_of_business || "").toLowerCase();

  if (/auto.?owners/.test(carrier)) {
    warnings.push("Auto-Owners: 'paid in full' on the dec page is marketing, not payment. Confirm payment separately before recording it.");
  }
  if (/nationwide/.test(carrier) && /auto/.test(lob)) {
    warnings.push("Nationwide auto: audit SmartRide.");
  }
  for (const v of proposal.vehicles ?? []) {
    if (isSpecialtyVehicle(v)) {
      warnings.push(`Specialty unit detected ("${v}"). It belongs on a separate specialty policy — do not flag as an auto coverage gap.`);
    }
  }
  return warnings;
}
