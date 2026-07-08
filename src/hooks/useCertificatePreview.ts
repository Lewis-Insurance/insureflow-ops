// ============================================================================
// CERTIFICATE PREVIEW HOOK (blueprint D Section 4, R1 / R9) - LOAD-BEARING
// ============================================================================
// Client-side debounced re-fill of the ACORD 25 blank with the existing
// fillAcordPdf (pdf-lib), rendered by CertificatePreview via an <iframe> blob URL.
// Preview is the ONLY use of the client fill (R1); the server builds the issued
// PDF itself with 05's parity-tested Deno port.
//
// Behavior:
//  - 500ms debounce on `deps`. On fire: run build() (letters come from
//    masterCoi.insurers as builder INPUT, R7 - the client NEVER assigns letters),
//    apply the masking pass (a no-op for form 25 but mandatory so 125/126/140
//    reuse it with no PII regression), fill flattened, create an object URL,
//    revoke the previous one, revoke on unmount. A monotonic build counter guards
//    against stale async responses.
//  - previewSha256: computed by 05's hashFieldValuesForPreview over the UNMASKED
//    build's field values (R9). Recomputed on every rebuild so the hash always
//    describes the on-screen preview. Masking NEVER touches previewSha256.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { fillAcordPdf } from '@/lib/acord/pdfFiller';
import { hashFieldValuesForPreview } from '@/lib/acord/acord25/previewHash';
import { maskTaxId, maskDob, maskDln } from '@/components/cc/mask';
import type { BuildAcord25Result } from '@/lib/acord/acord25/types';
import { logger } from '@/lib/logger';

/**
 * The template field schema, used by the masking pass to know which fields carry
 * PII. ACORD 25 has NO such fields (129-field inventory), so this is empty for
 * form 25 and the masking pass is a no-op; the pipeline is kept so 125/126/140
 * can supply a real schema later.
 */
export interface PreviewFieldSchemaEntry {
  name: string;
  /** PII kind, when the field carries protected data. */
  piiKind?: 'ssn' | 'ein' | 'dob' | 'dln';
}

/**
 * Replace any PII-typed field value with its masked form (constitution.md:57).
 * Only applied to the PREVIEWED bytes, NEVER to previewSha256 and never to
 * anything issued. Returns a shallow copy so the caller's build is untouched.
 */
export function maskPreviewFieldValues(
  fieldValues: Record<string, string | boolean>,
  fieldSchema: PreviewFieldSchemaEntry[] | undefined,
): Record<string, string | boolean> {
  if (!fieldSchema || fieldSchema.length === 0) return fieldValues;
  const piiByName = new Map<string, NonNullable<PreviewFieldSchemaEntry['piiKind']>>();
  for (const entry of fieldSchema) {
    if (entry.piiKind) piiByName.set(entry.name, entry.piiKind);
  }
  if (piiByName.size === 0) return fieldValues;

  const out: Record<string, string | boolean> = { ...fieldValues };
  for (const [name, kind] of piiByName) {
    const v = out[name];
    if (typeof v !== 'string' || v.length === 0) continue;
    if (kind === 'ssn' || kind === 'ein') out[name] = maskTaxId(v);
    else if (kind === 'dob') out[name] = maskDob(v);
    else if (kind === 'dln') out[name] = maskDln(v);
  }
  return out;
}

export interface UseCertificatePreviewResult {
  /** Object URL of the FLATTENED preview PDF, or null when nothing is renderable. */
  blobUrl: string | null;
  building: boolean;
  error: string | null;
  /** hashFieldValuesForPreview over the previewed (unmasked) build (R9). */
  previewSha256: string | null;
}

export function useCertificatePreview(args: {
  templateBytes: ArrayBuffer | undefined;
  /** null when not ready; input assembled per 05 Section 2.5 (buildAcord25FieldValues). */
  build: () => BuildAcord25Result | null;
  /** State slices; the debounced effect re-runs on change. */
  deps: unknown[];
  /** Field schema for the masking pass; undefined/empty = no-op (form 25). */
  fieldSchema?: PreviewFieldSchemaEntry[];
  /**
   * Appearance-only styling forwarded to the fill (per-field font size / italic).
   * Stable module constants from the caller; NOT a debounce dep. Appearance never
   * affects previewSha256 (that hashes field VALUES).
   */
  fillStyle?: { smallFields?: string[]; smallFontSize?: number; italicFields?: string[] };
}): UseCertificatePreviewResult {
  const { templateBytes, build, deps, fieldSchema, fillStyle } = args;

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewSha256, setPreviewSha256] = useState<string | null>(null);

  // Monotonic counter so a slow async fill cannot overwrite a newer preview.
  const buildIdRef = useRef(0);
  // Track the currently displayed object URL so we can revoke it on replace/unmount.
  const blobUrlRef = useRef<string | null>(null);
  // Keep the latest build() closure without making it a debounce dependency.
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    // No template yet: clear any preview and stop (the empty state renders).
    if (!templateBytes) {
      setBuilding(false);
      setPreviewSha256(null);
      return;
    }

    const myId = buildIdRef.current + 1;
    buildIdRef.current = myId;

    // A pending rebuild invalidates the current hash immediately: null it now so
    // Generate is gated during the 500ms debounce window (doIssue early-returns on
    // a null previewSha256, and the button's disabled expr includes !previewSha256)
    // instead of letting a click fire a stale hash the server would 409. `building`
    // is left to the timeout so the preview bar does not flash on every keystroke.
    setPreviewSha256(null);

    const handle = setTimeout(() => {
      void (async () => {
        const result = buildRef.current();
        if (!result) {
          // Not renderable (no lines / not ready): leave the last preview in place
          // but clear the hash so Generate cannot bind a stale build.
          if (buildIdRef.current === myId) {
            setBuilding(false);
            setPreviewSha256(null);
          }
          return;
        }

        setBuilding(true);
        setError(null);

        try {
          // Hash the UNMASKED field values (R9): must match the server's rebuild.
          const sha = await hashFieldValuesForPreview(result.fieldValues);

          // Masking pass before the fill (no-op for form 25).
          const masked = maskPreviewFieldValues(result.fieldValues, fieldSchema);

          const fill = await fillAcordPdf(templateBytes, {
            fieldValues: masked,
            flatten: true,
            updateAppearances: true,
            smallFields: fillStyle?.smallFields,
            smallFontSize: fillStyle?.smallFontSize,
            italicFields: fillStyle?.italicFields,
          });
          if (!fill.pdfBytes) {
            throw new Error('The preview fill produced no PDF bytes.');
          }

          // Stale-response guard: a newer build superseded this one.
          if (buildIdRef.current !== myId) return;

          const blob = new Blob([fill.pdfBytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          blobUrlRef.current = url;

          setBlobUrl(url);
          setPreviewSha256(sha);
          setBuilding(false);
        } catch (err) {
          if (buildIdRef.current !== myId) return;
          logger.error('certificate preview build failed', err);
          setError('The preview could not be built.');
          setPreviewSha256(null);
          setBuilding(false);
        }
      })();
    }, 500);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateBytes, fieldSchema, ...deps]);

  // Revoke the last object URL when the hook unmounts.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  return { blobUrl, building, error, previewSha256 };
}
