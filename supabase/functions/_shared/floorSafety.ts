export interface RedactionSummary {
  type: string;
  count: number;
}

const PII_PATTERNS: Array<{ type: string; pattern: RegExp; replacement: string }> = [
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  { type: 'ssn_compact', pattern: /\b\d{9}\b/g, replacement: '[REDACTED_SSN]' },
  { type: 'email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]' },
  { type: 'phone', pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, replacement: '[REDACTED_PHONE]' },
  {
    type: 'dob_or_dln_label',
    pattern: /\b(?:date\s+of\s+birth|dob|driver'?s?\s+license|dln)\b\s*[:#-]?\s*[^\n,;]+/gi,
    replacement: '[REDACTED_REGULATED_FIELD]',
  },
  {
    type: 'signed_storage_url',
    pattern: /https?:\/\/\S*(?:storage\/v1\/object\/(?:sign|public)|supabase\.co\/storage)\S*/gi,
    replacement: '[REDACTED_STORAGE_URL]',
  },
  {
    type: 'storage_path',
    pattern: /\b(?:documents|private|uploads|storage)\/[A-Za-z0-9._/-]+\b/g,
    replacement: '[REDACTED_STORAGE_PATH]',
  },
  {
    type: 'raw_uuid',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    replacement: '[REDACTED_REF]',
  },
];

export function redactPII(text: string): { redacted: string; redactions: RedactionSummary[] } {
  let redacted = text;
  const counts: Record<string, number> = {};

  for (const { type, pattern, replacement } of PII_PATTERNS) {
    const matches = redacted.match(pattern);
    if (!matches) continue;
    counts[type] = (counts[type] ?? 0) + matches.length;
    redacted = redacted.replace(pattern, replacement);
  }

  return {
    redacted,
    redactions: Object.entries(counts).map(([type, count]) => ({ type, count })),
  };
}

export function containsUnsafeBoundaryPayload(value: unknown): boolean {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return redactPII(text).redactions.length > 0;
}
