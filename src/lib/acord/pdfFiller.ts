// ============================================
// ACORD PDF Filler
// Uses pdf-lib to fill official ACORD PDFs
// ============================================

import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFRadioGroup,
  StandardFonts,
  rgb,
  PDFFont,
  PDFPage,
} from 'pdf-lib';
import type { PdfFillOptions, PdfFillResult, FieldTypeMap, TransformConfig } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface FillFieldValue {
  value: string | boolean | number | null | undefined;
  transform?: TransformConfig;
}

export interface FillFormOptions extends Partial<PdfFillOptions> {
  fieldValues: Record<string, FillFieldValue | string | boolean | number | null | undefined>;
  addAddendum?: boolean;
  addendumContent?: string[];
  /**
   * PDF field names to render at {@link smallFontSize} instead of the global
   * fontSize (e.g. the ACORD 25 POLICY EFF / POLICY EXP date columns, which are
   * narrow). Opt-in: forms that omit it are unaffected.
   */
  smallFields?: string[];
  /** Font size for {@link smallFields}. Default 8. */
  smallFontSize?: number;
  /**
   * PDF field names to render in an italic font (e.g. the ACORD 25 authorized
   * representative, styled as a signature). Applied after the global appearance
   * pass and before flatten. Opt-in.
   */
  italicFields?: string[];
}

// ============================================
// MAIN FILL FUNCTION
// ============================================

export async function fillAcordPdf(
  templateBytes: Uint8Array | ArrayBuffer,
  options: FillFormOptions
): Promise<PdfFillResult> {
  const {
    fieldValues,
    flatten = true,
    updateAppearances = true,
    preserveEmptyFields = false,
    fontName,
    fontSize = 10,
    addAddendum = false,
    addendumContent = [],
    smallFields = [],
    smallFontSize = 8,
    italicFields = [],
  } = options;

  const smallFieldSet = new Set(smallFields);

  const errors: string[] = [];
  const skippedFields: string[] = [];
  let filledFieldCount = 0;

  try {
    // Load the template PDF
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();

    // Embed font for text fields
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    // Italic standard font for signature-styled fields (no fontkit / no asset).
    const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    // Get all form fields
    const fields = form.getFields();
    const fieldTypeMap: FieldTypeMap = {};

    // Build field type map
    for (const field of fields) {
      const name = field.getName();
      if (field instanceof PDFTextField) {
        fieldTypeMap[name] = 'text';
      } else if (field instanceof PDFCheckBox) {
        fieldTypeMap[name] = 'checkbox';
      } else if (field instanceof PDFDropdown) {
        fieldTypeMap[name] = 'dropdown';
      } else if (field instanceof PDFRadioGroup) {
        fieldTypeMap[name] = 'radio';
      }
    }

    // Fill each field
    for (const [fieldName, rawValue] of Object.entries(fieldValues)) {
      try {
        const field = form.getFieldMaybe(fieldName);

        if (!field) {
          skippedFields.push(fieldName);
          continue;
        }

        // Extract value and transform config
        const { value, transform } = normalizeFieldValue(rawValue);

        // Skip null/undefined unless preserving empty fields
        if (value === null || value === undefined) {
          if (!preserveEmptyFields) {
            skippedFields.push(fieldName);
          }
          continue;
        }

        // Apply transformation
        const transformedValue = applyTransform(value, transform);

        // Fill based on field type
        if (field instanceof PDFTextField) {
          const sizeForField = smallFieldSet.has(fieldName) ? smallFontSize : fontSize;
          await fillTextField(field, transformedValue, font, sizeForField);
          filledFieldCount++;
        } else if (field instanceof PDFCheckBox) {
          fillCheckboxField(field, transformedValue);
          filledFieldCount++;
        } else if (field instanceof PDFDropdown) {
          fillDropdownField(field, transformedValue);
          filledFieldCount++;
        } else if (field instanceof PDFRadioGroup) {
          fillRadioField(field, transformedValue);
          filledFieldCount++;
        }
      } catch (fieldError) {
        const errorMsg = fieldError instanceof Error ? fieldError.message : 'Unknown error';
        errors.push(`Field "${fieldName}": ${errorMsg}`);
        skippedFields.push(fieldName);
      }
    }

    // Add addendum page if needed
    if (addAddendum && addendumContent.length > 0) {
      await addAddendumPage(pdfDoc, addendumContent, font);
    }

    // Update appearances for consistent rendering
    if (updateAppearances) {
      form.updateFieldAppearances(font);
    }

    // Signature-style pass: re-render the italic fields (e.g. the authorized
    // representative) with the italic font. Done AFTER the global appearance pass
    // (which uses one font for every field) and BEFORE flatten so the italic look
    // is baked into the flattened content.
    for (const italicName of italicFields) {
      const italicField = form.getFieldMaybe(italicName);
      if (italicField instanceof PDFTextField) {
        italicField.updateAppearances(italicFont);
      }
    }

    // Flatten the form (removes editability, ensures field values render correctly)
    if (flatten) {
      form.flatten();
    }

    // Save the PDF
    const pdfBytes = await pdfDoc.save();

    return {
      success: true,
      pdfBytes: new Uint8Array(pdfBytes),
      filledFieldCount,
      skippedFields,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`PDF fill failed: ${errorMsg}`);

    return {
      success: false,
      filledFieldCount: 0,
      skippedFields: [],
      errors,
    };
  }
}

// ============================================
// FIELD FILLING HELPERS
// ============================================

async function fillTextField(
  field: PDFTextField,
  value: string,
  font: PDFFont,
  fontSize: number
): Promise<void> {
  const maxLength = field.getMaxLength();
  let finalValue = String(value);

  // Truncate if exceeds max length
  if (maxLength && finalValue.length > maxLength) {
    finalValue = finalValue.substring(0, maxLength);
  }

  field.setText(finalValue);
  field.setFontSize(fontSize);
}

function fillCheckboxField(field: PDFCheckBox, value: string | boolean): void {
  const boolValue = toBooleanValue(value);
  if (boolValue) {
    field.check();
  } else {
    field.uncheck();
  }
}

function fillDropdownField(field: PDFDropdown, value: string): void {
  const options = field.getOptions();
  const stringValue = String(value);

  // Try exact match first
  if (options.includes(stringValue)) {
    field.select(stringValue);
    return;
  }

  // Try case-insensitive match
  const lowerValue = stringValue.toLowerCase();
  const match = options.find(opt => opt.toLowerCase() === lowerValue);
  if (match) {
    field.select(match);
    return;
  }

  // Try partial match
  const partialMatch = options.find(opt => opt.toLowerCase().includes(lowerValue));
  if (partialMatch) {
    field.select(partialMatch);
  }
}

function fillRadioField(field: PDFRadioGroup, value: string): void {
  const options = field.getOptions();
  const stringValue = String(value);

  // Try exact match first
  if (options.includes(stringValue)) {
    field.select(stringValue);
    return;
  }

  // Try case-insensitive match
  const lowerValue = stringValue.toLowerCase();
  const match = options.find(opt => opt.toLowerCase() === lowerValue);
  if (match) {
    field.select(match);
  }
}

// ============================================
// TRANSFORM FUNCTIONS
// ============================================

function normalizeFieldValue(rawValue: FillFieldValue | string | boolean | number | null | undefined): {
  value: string | boolean | number | null | undefined;
  transform?: TransformConfig;
} {
  if (rawValue === null || rawValue === undefined) {
    return { value: rawValue };
  }

  if (typeof rawValue === 'object' && 'value' in rawValue) {
    return { value: rawValue.value, transform: rawValue.transform };
  }

  return { value: rawValue };
}

function applyTransform(
  value: string | boolean | number | null | undefined,
  transform?: TransformConfig
): string {
  if (value === null || value === undefined) return '';
  if (!transform) return String(value);

  let result = String(value);

  // Apply transformations in order
  if (transform.trim !== false) {
    result = result.trim();
  }

  if (transform.uppercase) {
    result = result.toUpperCase();
  } else if (transform.lowercase) {
    result = result.toLowerCase();
  }

  if (transform.dateFormat && isDateValue(result)) {
    result = formatDate(result, transform.dateFormat);
  }

  if (transform.phoneFormat && isPhoneValue(result)) {
    result = formatPhone(result, transform.phoneFormat);
  }

  // Handle max length with overflow behavior
  if (transform.maxLength && result.length > transform.maxLength) {
    switch (transform.overflowBehavior) {
      case 'truncate':
        result = result.substring(0, transform.maxLength);
        break;
      case 'addendum':
        // Caller should handle this
        result = result.substring(0, transform.maxLength - 3) + '...';
        break;
      case 'fail':
        throw new Error(`Value exceeds max length of ${transform.maxLength}`);
      default:
        result = result.substring(0, transform.maxLength);
    }
  }

  return result;
}

// ============================================
// EXPORTED HELPER FUNCTIONS (for testing)
// ============================================

/**
 * Determine field type based on naming patterns
 */
export function getFieldTypeFromName(fieldName: string): 'text' | 'checkbox' | 'date' | 'dropdown' | 'radio' {
  const lowerName = fieldName.toLowerCase();

  // Checkbox patterns
  if (lowerName.startsWith('has_') ||
      lowerName.startsWith('is_') ||
      lowerName.startsWith('include_') ||
      lowerName.startsWith('coverage_') ||
      lowerName.includes('_yn') ||
      lowerName.includes('_checkbox')) {
    return 'checkbox';
  }

  // Date patterns
  if (lowerName.includes('_date') ||
      lowerName.endsWith('date') ||
      lowerName.includes('dob') ||
      lowerName.includes('effective') ||
      lowerName.includes('expiration')) {
    return 'text'; // Dates are filled as text
  }

  return 'text';
}

/**
 * Format a field value based on type and options
 */
export function formatFieldValue(
  value: any,
  fieldType: string,
  options: {
    dateFormat?: string;
    phoneFormat?: string;
    uppercase?: boolean;
    trim?: boolean;
  }
): any {
  if (value === null || value === undefined) return '';

  // Handle checkbox/boolean values
  if (fieldType === 'checkbox') {
    if (typeof value === 'boolean') return value;
    const trueValues = ['true', '1', 'yes', 'y', 'on', 'checked', 'x'];
    return trueValues.includes(String(value).toLowerCase());
  }

  let result = String(value);

  // Apply trim
  if (options.trim) {
    result = result.trim();
  }

  // Apply uppercase
  if (options.uppercase) {
    result = result.toUpperCase();
  }

  // Format date
  if (options.dateFormat && isDateValue(result)) {
    result = formatDate(result, options.dateFormat);
  }

  // Format phone
  if (options.phoneFormat && isPhoneValue(result)) {
    result = formatPhone(result, options.phoneFormat);
  }

  return result;
}

/**
 * Fill a PDF form with field values (alias for fillAcordPdf)
 */
export async function fillPdfForm(
  templateBytes: Uint8Array | ArrayBuffer,
  fieldValues: Record<string, any>,
  fieldTypeMap: FieldTypeMap,
  options: Partial<PdfFillOptions>
): Promise<PdfFillResult> {
  return fillAcordPdf(templateBytes, {
    ...options,
    fieldValues,
  });
}

function toBooleanValue(value: string | boolean): boolean {
  if (typeof value === 'boolean') return value;

  const trueValues = ['true', '1', 'yes', 'y', 'on', 'checked', 'x'];
  return trueValues.includes(String(value).toLowerCase());
}

function isDateValue(value: string): boolean {
  // Check common date patterns
  return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value);
}

function formatDate(value: string, format: string): string {
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;

    // Use UTC methods to avoid timezone issues
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    const year = date.getUTCFullYear();
    const shortYear = year.toString().slice(-2);

    // Common format patterns
    const patterns: Record<string, string> = {
      'MM/DD/YYYY': `${month}/${day}/${year}`,
      'MM/DD/YY': `${month}/${day}/${shortYear}`,
      'YYYY-MM-DD': `${year}-${month}-${day}`,
      'MM-DD-YYYY': `${month}-${day}-${year}`,
    };

    return patterns[format] || patterns['MM/DD/YYYY'];
  } catch {
    return value;
  }
}

function isPhoneValue(value: string): boolean {
  // Check if it looks like a phone number
  return /^[\d\s\-\(\)\+]+$/.test(value) && value.replace(/\D/g, '').length >= 10;
}

function formatPhone(value: string, format: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length < 10) return value;

  // Take last 10 digits (ignore country code)
  const phone = digits.slice(-10);
  const area = phone.substring(0, 3);
  const prefix = phone.substring(3, 6);
  const line = phone.substring(6, 10);

  // Common format patterns
  const patterns: Record<string, string> = {
    '(###) ###-####': `(${area}) ${prefix}-${line}`,
    '###-###-####': `${area}-${prefix}-${line}`,
    '### ### ####': `${area} ${prefix} ${line}`,
    '##########': phone,
  };

  return patterns[format] || patterns['(###) ###-####'];
}

// ============================================
// ADDENDUM FUNCTIONS
// ============================================

async function addAddendumPage(
  pdfDoc: PDFDocument,
  content: string[],
  font: PDFFont
): Promise<void> {
  const page = pdfDoc.addPage([612, 792]); // Letter size

  // Header
  const headerText = 'ADDENDUM';
  const headerSize = 16;
  const headerWidth = font.widthOfTextAtSize(headerText, headerSize);
  page.drawText(headerText, {
    x: (612 - headerWidth) / 2,
    y: 750,
    size: headerSize,
    font,
    color: rgb(0, 0, 0),
  });

  // Content
  let yPosition = 710;
  const lineHeight = 14;
  const margin = 72; // 1 inch margins
  const maxWidth = 612 - margin * 2;

  for (const item of content) {
    const lines = wrapText(item, font, 10, maxWidth);

    for (const line of lines) {
      if (yPosition < 72) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = 750;
        drawAddendumContent(newPage, line, margin, yPosition, font);
      } else {
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }
      yPosition -= lineHeight;
    }

    yPosition -= lineHeight / 2; // Extra space between items
  }
}

function drawAddendumContent(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont
): void {
  page.drawText(text, {
    x,
    y,
    size: 10,
    font,
    color: rgb(0, 0, 0),
  });
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// ============================================
// BATCH FILLING
// ============================================

export async function fillMultipleForms(
  templates: Array<{ templateBytes: Uint8Array; fieldValues: Record<string, any> }>,
  options: Partial<PdfFillOptions> = {}
): Promise<Array<PdfFillResult & { templateIndex: number }>> {
  const results: Array<PdfFillResult & { templateIndex: number }> = [];

  for (let i = 0; i < templates.length; i++) {
    const { templateBytes, fieldValues } = templates[i];
    const result = await fillAcordPdf(templateBytes, {
      ...options,
      fieldValues,
    });
    results.push({ ...result, templateIndex: i });
  }

  return results;
}

// ============================================
// PDF MERGING
// ============================================

export async function mergePdfs(pdfBytesArray: Uint8Array[]): Promise<Uint8Array> {
  const mergedDoc = await PDFDocument.create();

  for (const pdfBytes of pdfBytesArray) {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = await mergedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
    pages.forEach(page => mergedDoc.addPage(page));
  }

  const mergedBytes = await mergedDoc.save();
  return new Uint8Array(mergedBytes);
}

// ============================================
// FIELD OVERFLOW DETECTION
// ============================================

export function detectOverflowFields(
  fieldValues: Record<string, any>,
  fieldTypeMap: FieldTypeMap,
  maxLengths: Record<string, number>
): Array<{ fieldName: string; valueLength: number; maxLength: number; overflow: number }> {
  const overflows: Array<{ fieldName: string; valueLength: number; maxLength: number; overflow: number }> = [];

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (fieldTypeMap[fieldName] !== 'text') continue;

    const stringValue = String(value || '');
    const maxLength = maxLengths[fieldName];

    if (maxLength && stringValue.length > maxLength) {
      overflows.push({
        fieldName,
        valueLength: stringValue.length,
        maxLength,
        overflow: stringValue.length - maxLength,
      });
    }
  }

  return overflows;
}

// ============================================
// FIELD VALUE EXTRACTION
// ============================================

export async function extractFieldValues(
  pdfBytes: Uint8Array | ArrayBuffer
): Promise<Record<string, string | boolean | null>> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  const values: Record<string, string | boolean | null> = {};

  for (const field of fields) {
    const name = field.getName();

    if (field instanceof PDFTextField) {
      values[name] = field.getText() || null;
    } else if (field instanceof PDFCheckBox) {
      values[name] = field.isChecked();
    } else if (field instanceof PDFDropdown) {
      const selected = field.getSelected();
      values[name] = selected.length > 0 ? selected[0] : null;
    } else if (field instanceof PDFRadioGroup) {
      values[name] = field.getSelected() || null;
    }
  }

  return values;
}
