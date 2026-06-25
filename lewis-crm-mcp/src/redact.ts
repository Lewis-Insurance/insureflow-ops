// PII handling. The adapter returns record IDs + structured fields to the agent
// (which may forward them to a model). Raw contact PII is masked by default and only
// revealed when a human action explicitly needs it (e.g. to place a call or send a text).
// Deep PII (DOB, SSN, TIN, FEIN, DLN) is never surfaced to the model at all.

const DEEP_PII_KEYS = [
  "date_of_birth",
  "spouse_date_of_birth",
  "tin_last4",
  "ssn",
  "dln",
  "fein",
  "search_vector",
];

export function maskPhone(p?: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 4 ? `***-***-${d.slice(-4)}` : "***";
}

export function maskEmail(e?: string | null): string | null {
  if (!e) return null;
  const [u, d] = e.split("@");
  if (!d) return "***";
  return `${u.slice(0, 1)}***@${d}`;
}

export function maskPolicyNumber(n?: string | null): string | null {
  if (!n) return null;
  return n.length <= 4 ? "****" : `****${n.slice(-4)}`;
}

/** Remove deep-PII columns from a row before it can reach the model. */
export function stripDeepPII<T extends Record<string, unknown>>(row: T): Partial<T> {
  const clone: Record<string, unknown> = { ...row };
  for (const k of DEEP_PII_KEYS) delete clone[k];
  return clone as Partial<T>;
}

/** Shape an accounts row for the model. reveal=true surfaces raw phone/email for an action. */
export function presentClient(row: Record<string, any>, reveal = false) {
  const base = stripDeepPII(row);
  return {
    ...base,
    email: reveal ? row.email ?? null : maskEmail(row.email),
    phone: reveal ? row.phone ?? null : maskPhone(row.phone),
  };
}
