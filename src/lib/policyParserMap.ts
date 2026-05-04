/**
 * Maps fuzzy/messy parser outputs (e.g. from ai-document-analysis-azure) to
 * canonical form values that match the lookup tables and DB-side analytics
 * expectations. The parser may return things like:
 *
 *   document_type: "home_homeowners" | "auto_policy" | "homeowners" | "ho3"
 *   line_of_business: "Personal Auto" | "Workers Compensation" | "WC"
 *
 * The form must save a value that exists in `public.lines_of_business.name`
 * so downstream analytics (quote ranking, retention scoring, coverage gap
 * detection) correctly bucket the policy.
 */

export interface MapResult<T = string> {
  /** Cleanly mapped canonical value, or "" if no confident match. */
  value: T | '';
  /** True when the parser returned something but we couldn't pick a canonical option. */
  needsConfirmation: boolean;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Match a parsed string to one of `options` by:
 * 1. exact (normalized) name match
 * 2. parsed string contains a known synonym keyword
 * 3. option name appears as a substring of the parsed string
 *
 * Returns the option's `name` if confident, '' otherwise.
 */
export function fuzzyMatchOption<T extends { name: string }>(
  parsed: string | null | undefined,
  options: T[],
  synonyms: Record<string, string[]> = {},
): MapResult {
  if (!parsed || !options.length) {
    return { value: '', needsConfirmation: false };
  }

  const p = norm(parsed);
  if (!p) return { value: '', needsConfirmation: false };

  // 1. Exact normalized match
  const exact = options.find((o) => norm(o.name) === p);
  if (exact) return { value: exact.name, needsConfirmation: false };

  // 2. Synonym keyword match — check globally in length-descending order so
  //    a more specific synonym ("business auto" → Commercial Auto) wins over
  //    a shorter one ("auto" → Auto) when both are substrings of the input.
  const allSynonyms: { keyword: string; optionName: string }[] = [];
  for (const opt of options) {
    const keys = synonyms[opt.name] ?? [];
    for (const k of keys) {
      const n = norm(k);
      if (n) allSynonyms.push({ keyword: n, optionName: opt.name });
    }
  }
  allSynonyms.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const { keyword, optionName } of allSynonyms) {
    if (p.includes(keyword)) {
      return { value: optionName, needsConfirmation: false };
    }
  }

  // 3. Substring match (option name inside parsed string), longer names first
  const byLen = [...options].sort(
    (a, b) => norm(b.name).length - norm(a.name).length,
  );
  const sub = byLen.find((o) => p.includes(norm(o.name)));
  if (sub) return { value: sub.name, needsConfirmation: false };

  // No clean match — keep empty, ask user to confirm
  return { value: '', needsConfirmation: true };
}

/**
 * Synonyms keyed by the canonical lookup-table name for `lines_of_business`.
 * Values are common parser outputs, document type strings, and shorthand the
 * extraction edge function tends to produce.
 */
export const LOB_SYNONYMS: Record<string, string[]> = {
  Auto: [
    'auto',
    'auto_policy',
    'auto policy',
    'personal auto',
    'pap',
    'private passenger',
    'vehicle',
    'car',
    'motor',
  ],
  Home: [
    'home',
    'homeowners',
    'homeowner',
    'home_homeowners',
    'home_policy',
    'ho-3',
    'ho3',
    'ho 3',
    'ho 6',
    'dwelling',
  ],
  Life: ['life', 'life_policy', 'term life', 'whole life'],
  'Commercial Auto': [
    'commercial auto',
    'commercial_auto',
    'business auto',
    'bap',
    'fleet',
  ],
  'General Liability': [
    'general liability',
    'gl',
    'cgl',
    'commercial general liability',
  ],
  'Professional Liability': [
    'professional liability',
    'pl',
    'errors omissions',
    'e o',
    'e and o',
    'malpractice',
  ],
  'Workers Compensation': [
    'workers compensation',
    'workers comp',
    'workmans comp',
    'wc',
    'workers_comp',
  ],
  Property: [
    'property',
    'commercial property',
    'building',
    'inland marine',
  ],
  Umbrella: ['umbrella', 'excess liability', 'umb'],
  'Cyber Liability': ['cyber', 'cyber liability', 'data breach'],
};

/**
 * Map a parser-extracted line of business or document type to the canonical
 * lookup-table name. Tries `line_of_business` first, falls back to
 * `document_type` when the former is missing.
 */
export function mapLineOfBusiness(
  parsed: { line_of_business?: string; document_type?: string },
  options: { id: string; name: string }[],
): MapResult {
  const candidate = parsed.line_of_business || parsed.document_type;
  if (!candidate) return { value: '', needsConfirmation: false };

  // The parser sometimes emits "application" for generic forms — that's not a LOB
  if (norm(candidate) === 'application') {
    return { value: '', needsConfirmation: false };
  }

  return fuzzyMatchOption(candidate, options, LOB_SYNONYMS);
}

/**
 * Map a parser carrier name to a canonical carrier from the lookup table.
 * Carriers are free-text on the policies table, so we tolerate unknown names
 * and pass them through unchanged. We only normalize when there's a confident
 * lookup match.
 */
export function mapCarrier(
  parsed: string | null | undefined,
  options: { id: string; name: string }[],
): MapResult {
  if (!parsed) return { value: '', needsConfirmation: false };
  const match = fuzzyMatchOption(parsed, options);
  if (match.value) return match;
  // Unknown carrier — keep parser's value so the user can confirm or edit
  return { value: parsed.trim(), needsConfirmation: false };
}
