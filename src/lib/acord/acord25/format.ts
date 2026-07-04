// Deterministic formatters for the ACORD 25 payload builder.
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// Ported verbatim to supabase/functions/_shared/acord25/format.ts.
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Section 4.6;
// blueprint B Section 4.6. Both use string-slice / explicit grouping (NOT
// new Date() and NOT toLocaleString) so output is byte-identical regardless of
// host timezone or locale.

/**
 * ISO 'YYYY-MM-DD' to ACORD 'MM/DD/YYYY'. Pure string slicing, never new Date(),
 * so there is no timezone drift. Throws RangeError on a non-ISO input; the
 * builder catches it and emits a DATE_INVALID issue naming the field.
 */
export function formatAcordDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    throw new RangeError(`Not an ISO date: ${iso}`);
  }
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/**
 * Non-negative integer to comma-grouped string via an EXPLICIT implementation
 * (NOT toLocaleString, for determinism). No cents, no currency symbol by default
 * (the ACORD boxes have a preprinted $). Examples: 1000000 to '1,000,000',
 * 0 to '0', 250 to '250'.
 *
 * Negative or non-finite input is coerced to its absolute floored magnitude so
 * the function is total; the builder never passes such values (limits are always
 * a non-negative number or null, and null never reaches here).
 */
export function formatLimit(n: number): string {
  const safe = Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
  const digits = String(safe);
  let out = '';
  let count = 0;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out = digits[i] + out;
    count += 1;
    if (count % 3 === 0 && i > 0) {
      out = ',' + out;
    }
  }
  return out;
}
