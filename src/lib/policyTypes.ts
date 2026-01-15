/**
 * Canonical policy type slugs (stored in DB)
 */
export type PolicyTypeSlug = 'auto' | 'home' | 'commercial' | 'life' | 'health' | 'umbrella' | 'flood' | 'renters';

/**
 * Display labels for policy types (shown in UI)
 */
export const POLICY_TYPE_LABELS: Record<PolicyTypeSlug, string> = {
  auto: 'Auto',
  home: 'Home',
  commercial: 'Commercial',
  life: 'Life',
  health: 'Health',
  umbrella: 'Umbrella',
  flood: 'Flood',
  renters: 'Renters',
};

/**
 * Mapping from various input formats to canonical slugs
 */
const POLICY_TYPE_MAPPING: Record<string, PolicyTypeSlug> = {
  // Auto variations
  'auto_policy': 'auto',
  'auto': 'auto',
  'automobile': 'auto',
  'car': 'auto',
  'vehicle': 'auto',
  'personal_auto': 'auto',

  // Home variations
  'home_policy': 'home',
  'home': 'home',
  'homeowners': 'home',
  'homeowner': 'home',
  'ho3': 'home',
  'ho5': 'home',
  'dwelling': 'home',
  'residential': 'home',

  // Commercial variations
  'commercial_policy': 'commercial',
  'commercial': 'commercial',
  'business': 'commercial',
  'bop': 'commercial',
  'gl': 'commercial',
  'general_liability': 'commercial',
  'commercial_auto': 'commercial',
  'workers_comp': 'commercial',
  'professional_liability': 'commercial',

  // Life variations
  'life': 'life',
  'life_policy': 'life',
  'term_life': 'life',
  'whole_life': 'life',

  // Health variations
  'health': 'health',
  'health_policy': 'health',
  'medical': 'health',

  // Umbrella variations
  'umbrella': 'umbrella',
  'excess': 'umbrella',
  'excess_liability': 'umbrella',

  // Flood variations
  'flood': 'flood',
  'flood_policy': 'flood',

  // Renters variations
  'renters': 'renters',
  'renters_policy': 'renters',
  'tenant': 'renters',
};

/**
 * Normalize any policy type input to a canonical slug
 *
 * @param input - The policy type to normalize (e.g., "home_policy", "Home Policy", "HO3")
 * @returns The canonical slug or null if unrecognized
 *
 * @example
 * normalizePolicyType('home_policy') // => 'home'
 * normalizePolicyType('Home Policy') // => 'home'
 * normalizePolicyType('HO3') // => 'home'
 * normalizePolicyType('unknown') // => null
 */
export function normalizePolicyType(input: string | null | undefined): PolicyTypeSlug | null {
  if (!input) return null;

  const normalized = input.toLowerCase().trim().replace(/\s+/g, '_');

  if (POLICY_TYPE_MAPPING[normalized]) {
    return POLICY_TYPE_MAPPING[normalized];
  }

  // Check if it's already a valid slug
  if (Object.keys(POLICY_TYPE_LABELS).includes(normalized as PolicyTypeSlug)) {
    return normalized as PolicyTypeSlug;
  }

  return null;
}

/**
 * Get the display label for a policy type slug
 *
 * @param slug - The canonical policy type slug
 * @returns The display label (e.g., "Auto", "Home") or the slug itself if not found
 */
export function getPolicyTypeLabel(slug: PolicyTypeSlug | string): string {
  if (slug in POLICY_TYPE_LABELS) {
    return POLICY_TYPE_LABELS[slug as PolicyTypeSlug];
  }
  // Return the input with first letter capitalized as fallback
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Check if a string is a valid policy type slug
 */
export function isValidPolicyType(value: string): value is PolicyTypeSlug {
  return value in POLICY_TYPE_LABELS;
}

/**
 * Get all valid policy type slugs
 */
export function getAllPolicyTypes(): PolicyTypeSlug[] {
  return Object.keys(POLICY_TYPE_LABELS) as PolicyTypeSlug[];
}
