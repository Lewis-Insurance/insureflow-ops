// acord-fill.ts: the server-side (Deno) fill core for issued certificates.
//
// Owned by docs/COI Module/coi-module/04-issuance-and-snapshots.md (Section 7.1).
// This is a TRIMMED Deno port of the client fill core `fillAcordPdf` in
// src/lib/acord/pdfFiller.ts (the branch from line 38 onward): text fields,
// ynText Y/N literals (filled as text), checkboxes with export values resolved
// by pdf-lib check()/uncheck() from the template's AcroForm, then
// updateFieldAppearances(font) and flatten().
//
// DELIBERATE DIFFERENCES vs pdfFiller.ts, per doc 04:
//   - NO addendum-page logic (R16). Overflow is hard-blocked upstream by
//     validateAcord25 before any bytes are filled, so the filler never has to
//     paginate. All addendum helpers from pdfFiller.ts are intentionally absent.
//   - No dropdown/radio handling: the ACORD 25 blank is text + checkbox only.
//   - No transform config: field_values arriving here are already the exact,
//     formatted strings/booleans emitted by buildAcord25FieldValues (05).
//
// PARITY: this port and src/lib/acord/pdfFiller.ts must produce byte-equivalent
// field values for the same input (guarded by the parity fixture, doc 04
// Section 11). If you change filling semantics here, mirror them in pdfFiller.ts.
//
// pdf-lib runs in Deno via esm.sh (precedent: the former pdf-generation-worker
// imported pdf-lib@1.17.1 from esm.sh, cited in doc 04 Section 1.3).

import {
  PDFCheckBox,
  PDFDocument,
  PDFTextField,
  StandardFonts,
} from 'https://esm.sh/pdf-lib@1.17.1';

/** Result of a fill pass. Mirrors the shape of src/lib/acord PdfFillResult. */
export interface AcordFillResult {
  success: boolean;
  /** Present only on success. */
  pdfBytes?: Uint8Array;
  filledFieldCount: number;
  /**
   * Field names not written: either absent from the template OR intentionally
   * empty (matching src/lib/acord/pdfFiller.ts, which lumps both here so the
   * parity fixture compares like for like).
   */
  skippedFields: string[];
  /**
   * The subset of skippedFields that are absent from the template AcroForm (a
   * real template-integrity problem). An intentionally-empty value is NOT here.
   * The issuer's post-fill assertion (doc 04 Section 7.3) checks THIS, not
   * skippedFields, so a totally-mapped field_values with empty defaults does not
   * spuriously fail issuance.
   */
  missingFields: string[];
  /** Per-field or top-level fill errors. */
  errors: string[];
}

/** Options for {@link fillAcord25Pdf}. */
export interface AcordFillOptions {
  /** Flatten the form after filling. Default true (issued certs are flattened). */
  flatten?: boolean;
  /** Regenerate field appearances with the embedded font. Default true. */
  updateAppearances?: boolean;
  /** Font size for text fields. Default 10 (matches pdfFiller.ts). */
  fontSize?: number;
  /**
   * PDF field names rendered at {@link smallFontSize} (the narrow POLICY EFF /
   * POLICY EXP date columns). Mirrors pdfFiller.ts so the issued cert matches
   * the client preview.
   */
  smallFields?: string[];
  /** Font size for {@link smallFields}. Default 8. */
  smallFontSize?: number;
  /** PDF field names rendered italic (authorized representative signature). */
  italicFields?: string[];
}

/**
 * Fill the ACORD 25 template with the exact field-value map from
 * buildAcord25FieldValues.
 *
 * @param templateBytes The pinned blank ACORD 25 PDF bytes.
 * @param fieldValues   Keyed by EXACT AcroForm field name. boolean for checkbox
 *                      fields, string (incl. 'Y' | 'N' | '') for text fields.
 *                      Empty text values are skipped (not written), matching the
 *                      client pdfFiller.ts default so both engines agree.
 */
export async function fillAcord25Pdf(
  templateBytes: Uint8Array | ArrayBuffer,
  fieldValues: Record<string, string | boolean>,
  options: AcordFillOptions = {},
): Promise<AcordFillResult> {
  const {
    flatten = true,
    updateAppearances = true,
    fontSize = 10,
    smallFields = [],
    smallFontSize = 8,
    italicFields = [],
  } = options;

  const smallFieldSet = new Set(smallFields);

  const errors: string[] = [];
  const skippedFields: string[] = [];
  const missingFields: string[] = [];
  let filledFieldCount = 0;

  try {
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();

    // Embed the same standard font pdfFiller.ts uses so appearances match.
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // Italic standard font for signature-styled fields (mirrors pdfFiller.ts).
    const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    for (const [fieldName, rawValue] of Object.entries(fieldValues)) {
      try {
        const field = form.getFieldMaybe(fieldName);
        if (!field) {
          skippedFields.push(fieldName);
          missingFields.push(fieldName);
          continue;
        }

        if (field instanceof PDFTextField) {
          // ynText, date, limit, text, multilineText all arrive as strings.
          const text = rawValue === true
            ? 'Y'
            : rawValue === false
              ? ''
              : String(rawValue);
          // Match src/lib/acord/pdfFiller.ts default (preserveEmptyFields=false):
          // an empty text value is a skip, not a write, so this port and the
          // client engine produce byte-identical output (parity fixture, doc 04
          // Section 11). Empty text renders blank on the flattened form either
          // way; skipping keeps the two implementations aligned.
          if (text.length === 0) {
            skippedFields.push(fieldName);
            continue;
          }
          const maxLength = field.getMaxLength();
          const finalText = maxLength && text.length > maxLength
            ? text.substring(0, maxLength)
            : text;
          field.setText(finalText);
          field.setFontSize(smallFieldSet.has(fieldName) ? smallFontSize : fontSize);
          filledFieldCount++;
        } else if (field instanceof PDFCheckBox) {
          // Export value is resolved by pdf-lib from the template's AcroForm;
          // we never hardcode '/1' or '/Off' (doc 04 Section 4, R8).
          if (toBool(rawValue)) {
            field.check();
          } else {
            field.uncheck();
          }
          filledFieldCount++;
        } else {
          // The ACORD 25 blank is text + checkbox only; anything else is a
          // template-integrity problem the validator should have caught.
          errors.push(`Field "${fieldName}": unsupported field type for ACORD 25`);
          skippedFields.push(fieldName);
        }
      } catch (fieldError) {
        const msg = fieldError instanceof Error ? fieldError.message : 'Unknown error';
        errors.push(`Field "${fieldName}": ${msg}`);
        skippedFields.push(fieldName);
      }
    }

    if (updateAppearances) {
      form.updateFieldAppearances(font);
    }

    // Signature-style pass: re-render italic fields (authorized representative)
    // with the italic font, after the global pass and before flatten. Mirrors
    // pdfFiller.ts so the issued cert matches the client preview.
    for (const italicName of italicFields) {
      const italicField = form.getFieldMaybe(italicName);
      if (italicField instanceof PDFTextField) {
        italicField.updateAppearances(italicFont);
      }
    }

    if (flatten) {
      form.flatten();
    }

    const saved = await pdfDoc.save();

    return {
      success: true,
      pdfBytes: new Uint8Array(saved),
      filledFieldCount,
      skippedFields,
      missingFields,
      errors,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`PDF fill failed: ${msg}`);
    return {
      success: false,
      filledFieldCount: 0,
      skippedFields: [],
      missingFields: [],
      errors,
    };
  }
}

/** Coerce a checkbox field value to a boolean, matching pdfFiller.ts semantics. */
function toBool(value: string | boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const truthy = ['true', '1', 'yes', 'y', 'on', 'checked', 'x'];
  return truthy.includes(String(value).toLowerCase());
}
