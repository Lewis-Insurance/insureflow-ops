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

/**
 * Customer account-type label. The stored enum is household / commercial_business
 * (account_type_v2), but staff read the book as Personal vs Commercial lines.
 * Anything business / commercial-shaped reads Commercial; everything else Personal.
 * Display only - never write this string back; the stored enum is unchanged.
 */
export function humanizeAccountType(value?: string | null): string {
  return /business|commercial|organization|org/i.test(value ?? '') ? 'Commercial' : 'Personal';
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

/**
 * US phone number for display. Every number in the book is American, so the +1
 * country code is noise: strip it and render as `386-755-0050`. Handles E.164
 * (`+13867550050`), 11-digit (`13867550050`), bare 10-digit (`3867550050`), and
 * already-punctuated (`(386) 755-0050`) inputs, and preserves a trailing
 * extension (`x123`). Genuinely non-US or malformed numbers are returned as-is
 * rather than mangled. Display only - never write this back; stored values and
 * `tel:` dial links keep their raw/E.164 form so dialing stays reliable.
 */
export function formatPhoneForDisplay(value?: string | null): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  // Peel off a trailing extension first (x123, ext. 123, extension 123).
  const extMatch = raw.match(/\s*(?:x|ext\.?|extension)\s*(\d+)\s*$/i);
  const ext = extMatch?.[1] ?? '';
  const base = extMatch ? raw.slice(0, extMatch.index).trim() : raw;

  let digits = base.replace(/\D/g, '');
  // Drop a leading US country code: 1XXXXXXXXXX -> XXXXXXXXXX.
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }

  // Only reformat a clean 10-digit US number; leave anything else untouched.
  if (digits.length !== 10) return raw;

  const formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return ext ? `${formatted} x${ext}` : formatted;
}
