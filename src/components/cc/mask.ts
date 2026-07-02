/**
 * PII masking (constitution.md non-negotiable). SSN, DOB, and DLN render masked
 * in fields, tables, and document previews and exports, even for staff. A reveal
 * is a deliberate, logged, per-field action, never default-on. These helpers are
 * display-only and never widen a value (e.g. a stored last-4 stays last-4).
 */

/** Tax id / SSN -> XXX-XX-1234 from a stored last-4, or mask a full value. */
export function maskTaxId(value?: string | null): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  const last4 = digits.slice(-4);
  if (!last4) return '';
  return `XXX-XX-${last4}`;
}

/** Driver license -> keep last 4, mask the rest. */
export function maskDln(value?: string | null): string {
  if (!value) return '';
  const v = value.trim();
  if (v.length <= 4) return `••••${v}`;
  return `${'•'.repeat(v.length - 4)}${v.slice(-4)}`;
}

/** Date of birth -> year only (age math is allowed, the full DOB is not). */
export function maskDob(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '••/••/••••';
  return `••/••/${d.getFullYear()}`;
}
