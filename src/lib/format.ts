/**
 * Shared display formatters (DATA-REALITY.md: never render a raw enum or a
 * literal object in the UI). One place so every surface humanizes the same way.
 */

/** snake_case / kebab enum -> Title Case. `commercial_business` -> Commercial Business. */
export function humanizeEnum(value?: string | null): string {
  if (value == null) return '';
  const s = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Policy / renewal status label. `non_renewed` -> Non Renewed, `moved` -> Moved. */
export function humanizeStatus(value?: string | null): string {
  return humanizeEnum(value);
}

/** Line of business. Prefer the already-humanized line_canonical; humanize raw enums. */
export function humanizeLine(value?: string | null): string {
  if (!value) return '';
  // line_canonical values already read like "Boat / Watercraft" or "Commercial Auto".
  if (/[A-Z]/.test(value) || value.includes(' ') || value.includes('/')) return value.trim();
  return humanizeEnum(value);
}

// Carriers are free text and messy. Collapse known carriers to a clean canonical
// name and strip integration suffixes like "_custsearch". Carriers are name chips,
// never colors (constitution).
const CARRIER_CANON: Array<[RegExp, string]> = [
  [/auto[\s_-]?owners/i, 'Auto-Owners'],
  [/southern[\s_-]?owners/i, 'Southern-Owners'],
  [/progressive/i, 'Progressive'],
  [/nationwide/i, 'Nationwide'],
  [/universal\s+property/i, 'Universal Property'],
  [/american\s+integrity/i, 'American Integrity'],
  [/safe\s+harbor/i, 'Safe Harbor'],
  [/foremost/i, 'Foremost'],
  [/heritage/i, 'Heritage'],
  [/geico/i, 'GEICO'],
];

export function humanizeCarrier(value?: string | null): string {
  if (!value) return '';
  let v = String(value).trim();
  // strip integration suffix tokens (Progressive_custsearch -> Progressive)
  v = v.replace(/[_\s-]+(custsearch|quote|api|integration|feed)$/i, '');
  for (const [re, name] of CARRIER_CANON) {
    if (re.test(v)) return name;
  }
  // generic cleanup: underscores to spaces, trim trailing corporate suffix noise
  return v.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}
