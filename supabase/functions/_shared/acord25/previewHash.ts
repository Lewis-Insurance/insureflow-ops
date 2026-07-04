// Canonical preview_sha256 serialization (D15, R9).
//
// RUNTIME-FREE. Only globals used: TextEncoder, crypto.subtle (both present in
// browser and Deno). Ported verbatim to
// supabase/functions/_shared/acord25/previewHash.ts.
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Section 4.10;
// blueprint B Section 4.10. This module OWNS the preview_sha256 definition; docs
// 04 and 06 cite it and never redefine it.
//
// The client hashes its rendered build and sends preview_sha256; the server
// hashes its rebuild and returns 409 on mismatch. Header fields (cert number,
// revision number, form date) are excluded from the hash so a server-assigned
// certificate number or the issue-day form date do not spuriously 409.

import { ACORD25_FIELD_MAP } from './fieldMap.ts';

export const PREVIEW_HASH_EXCLUDED_KEYS = ['certificateNumber', 'revisionNumber', 'certificateDate'] as const;

export const PREVIEW_HASH_EXCLUDED_FIELDS: ReadonlySet<string> = new Set(
  PREVIEW_HASH_EXCLUDED_KEYS.map((k) => ACORD25_FIELD_MAP[k]?.pdfField).filter(
    (n): n is string => !!n,
  ),
);

export async function hashFieldValuesForPreview(
  fieldValues: Record<string, string | boolean>,
): Promise<string> {
  const entries = Object.keys(fieldValues)
    .filter((k) => !PREVIEW_HASH_EXCLUDED_FIELDS.has(k))
    .sort() // default UTF-16 code-unit ascending
    .map((k) => [k, fieldValues[k]]);
  const bytes = new TextEncoder().encode(JSON.stringify(entries));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
