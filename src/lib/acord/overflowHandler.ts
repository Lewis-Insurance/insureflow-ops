// ============================================
// ACORD Overflow Handler
// Handles text that exceeds field character limits
// Generates addendum pages when needed
// ============================================

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from 'pdf-lib';
import type { FieldInventoryItem } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface OverflowBehavior {
  strategy: 'truncate' | 'addendum' | 'fail';
  truncateIndicator?: string; // e.g., "..." or "[See Addendum]"
  addendumTitle?: string;
}

export interface OverflowItem {
  fieldName: string;
  fieldLabel: string;
  originalValue: string;
  truncatedValue: string;
  overflowText: string;
  maxLength: number;
}

export interface OverflowResult {
  processedValues: Record<string, string>;
  overflowItems: OverflowItem[];
  hasOverflow: boolean;
  addendumNeeded: boolean;
}

export interface AddendumResult {
  pdfBytes: Uint8Array;
  pageCount: number;
  itemsIncluded: number;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_TRUNCATE_INDICATOR = '...';
const ADDENDUM_INDICATOR = ' [See Addendum]';
const ADDENDUM_TITLE = 'ADDENDUM TO ACORD FORM';
const PAGE_MARGIN = 72; // 1 inch in points
const LINE_HEIGHT = 14;
const HEADER_SIZE = 16;
const BODY_SIZE = 10;
const FIELD_LABEL_SIZE = 11;

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Process field values and handle overflow
 */
export function processOverflow(
  fieldValues: Record<string, any>,
  fieldInventory: FieldInventoryItem[],
  behavior: OverflowBehavior = { strategy: 'addendum' }
): OverflowResult {
  const processedValues: Record<string, string> = {};
  const overflowItems: OverflowItem[] = [];

  // Create a map of field max lengths
  const maxLengthMap = new Map<string, number>();
  for (const field of fieldInventory) {
    if (field.maxLength) {
      maxLengthMap.set(field.name, field.maxLength);
    }
  }

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (value === null || value === undefined) {
      continue;
    }

    const stringValue = String(value).trim();
    const maxLength = maxLengthMap.get(fieldName);

    if (!maxLength || stringValue.length <= maxLength) {
      // No overflow
      processedValues[fieldName] = stringValue;
      continue;
    }

    // Handle overflow based on strategy
    switch (behavior.strategy) {
      case 'truncate':
        processedValues[fieldName] = truncateText(
          stringValue,
          maxLength,
          behavior.truncateIndicator || DEFAULT_TRUNCATE_INDICATOR
        );
        break;

      case 'addendum':
        const indicator = ADDENDUM_INDICATOR;
        const availableLength = maxLength - indicator.length;

        if (availableLength > 10) {
          processedValues[fieldName] = stringValue.substring(0, availableLength) + indicator;
        } else {
          processedValues[fieldName] = indicator.trim();
        }

        // Track overflow for addendum
        const fieldInfo = fieldInventory.find(f => f.name === fieldName);
        overflowItems.push({
          fieldName,
          fieldLabel: fieldInfo?.tooltip || formatFieldLabel(fieldName),
          originalValue: stringValue,
          truncatedValue: processedValues[fieldName],
          overflowText: stringValue,
          maxLength,
        });
        break;

      case 'fail':
        throw new Error(
          `Field "${fieldName}" value exceeds maximum length of ${maxLength} characters (got ${stringValue.length})`
        );
    }
  }

  return {
    processedValues,
    overflowItems,
    hasOverflow: overflowItems.length > 0,
    addendumNeeded: behavior.strategy === 'addendum' && overflowItems.length > 0,
  };
}

/**
 * Generate addendum PDF for overflow items
 */
export async function generateAddendum(
  overflowItems: OverflowItem[],
  options: {
    formNumber?: string;
    formName?: string;
    applicantName?: string;
    effectiveDate?: string;
  } = {}
): Promise<AddendumResult> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let currentPage: PDFPage | null = null;
  let yPosition = 0;
  let pageCount = 0;
  let itemsIncluded = 0;

  const addNewPage = () => {
    currentPage = pdfDoc.addPage([612, 792]); // Letter size
    pageCount++;
    yPosition = 792 - PAGE_MARGIN;

    // Add header
    const headerText = ADDENDUM_TITLE;
    const headerWidth = boldFont.widthOfTextAtSize(headerText, HEADER_SIZE);
    currentPage.drawText(headerText, {
      x: (612 - headerWidth) / 2,
      y: yPosition,
      size: HEADER_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= LINE_HEIGHT * 2;

    // Add form reference if provided
    if (options.formNumber) {
      const refText = `Reference: ACORD ${options.formNumber}${options.formName ? ` - ${options.formName}` : ''}`;
      currentPage.drawText(refText, {
        x: PAGE_MARGIN,
        y: yPosition,
        size: BODY_SIZE,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= LINE_HEIGHT;
    }

    // Add applicant name if provided
    if (options.applicantName) {
      currentPage.drawText(`Applicant: ${options.applicantName}`, {
        x: PAGE_MARGIN,
        y: yPosition,
        size: BODY_SIZE,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= LINE_HEIGHT;
    }

    // Add effective date if provided
    if (options.effectiveDate) {
      currentPage.drawText(`Effective Date: ${options.effectiveDate}`, {
        x: PAGE_MARGIN,
        y: yPosition,
        size: BODY_SIZE,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      yPosition -= LINE_HEIGHT;
    }

    yPosition -= LINE_HEIGHT; // Extra space after header

    return currentPage;
  };

  // Start first page
  addNewPage();

  // Add each overflow item
  for (const item of overflowItems) {
    // Check if we need a new page
    const estimatedHeight = estimateItemHeight(item.overflowText, font, BODY_SIZE, 612 - PAGE_MARGIN * 2);
    if (yPosition - estimatedHeight < PAGE_MARGIN) {
      addNewPage();
    }

    // Draw field label
    currentPage!.drawText(`${item.fieldLabel}:`, {
      x: PAGE_MARGIN,
      y: yPosition,
      size: FIELD_LABEL_SIZE,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= LINE_HEIGHT * 1.2;

    // Draw field content (with wrapping)
    const wrappedLines = wrapText(item.overflowText, font, BODY_SIZE, 612 - PAGE_MARGIN * 2 - 20);
    for (const line of wrappedLines) {
      if (yPosition < PAGE_MARGIN) {
        addNewPage();
      }

      currentPage!.drawText(line, {
        x: PAGE_MARGIN + 10,
        y: yPosition,
        size: BODY_SIZE,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      yPosition -= LINE_HEIGHT;
    }

    yPosition -= LINE_HEIGHT; // Space between items
    itemsIncluded++;
  }

  // Add footer with page numbers
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const footerText = `Page ${i + 1} of ${pages.length} - Addendum`;
    const footerWidth = font.widthOfTextAtSize(footerText, 8);
    page.drawText(footerText, {
      x: (612 - footerWidth) / 2,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes: new Uint8Array(pdfBytes),
    pageCount,
    itemsIncluded,
  };
}

/**
 * Append addendum to existing PDF
 */
export async function appendAddendum(
  mainPdfBytes: Uint8Array,
  addendumBytes: Uint8Array
): Promise<Uint8Array> {
  const mainDoc = await PDFDocument.load(mainPdfBytes);
  const addendumDoc = await PDFDocument.load(addendumBytes);

  const addendumPages = await mainDoc.copyPages(addendumDoc, addendumDoc.getPageIndices());
  addendumPages.forEach(page => mainDoc.addPage(page));

  const resultBytes = await mainDoc.save();
  return new Uint8Array(resultBytes);
}

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Detect fields that will overflow
 */
export function detectOverflow(
  fieldValues: Record<string, any>,
  fieldInventory: FieldInventoryItem[]
): Array<{ fieldName: string; currentLength: number; maxLength: number; overflow: number }> {
  const overflowing: Array<{
    fieldName: string;
    currentLength: number;
    maxLength: number;
    overflow: number;
  }> = [];

  const maxLengthMap = new Map<string, number>();
  for (const field of fieldInventory) {
    if (field.maxLength) {
      maxLengthMap.set(field.name, field.maxLength);
    }
  }

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    if (value === null || value === undefined) continue;

    const stringValue = String(value);
    const maxLength = maxLengthMap.get(fieldName);

    if (maxLength && stringValue.length > maxLength) {
      overflowing.push({
        fieldName,
        currentLength: stringValue.length,
        maxLength,
        overflow: stringValue.length - maxLength,
      });
    }
  }

  return overflowing;
}

/**
 * Get recommended strategy based on overflow analysis
 */
export function recommendStrategy(
  overflowingFields: Array<{ fieldName: string; overflow: number }>
): OverflowBehavior {
  if (overflowingFields.length === 0) {
    return { strategy: 'truncate' };
  }

  // If many fields overflow significantly, recommend addendum
  const significantOverflows = overflowingFields.filter(f => f.overflow > 50);

  if (significantOverflows.length >= 3 || overflowingFields.some(f => f.overflow > 200)) {
    return {
      strategy: 'addendum',
      addendumTitle: ADDENDUM_TITLE,
    };
  }

  // For minor overflows, truncation is acceptable
  return {
    strategy: 'truncate',
    truncateIndicator: DEFAULT_TRUNCATE_INDICATOR,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Truncate text with indicator
 */
function truncateText(text: string, maxLength: number, indicator: string): string {
  if (text.length <= maxLength) return text;

  const availableLength = maxLength - indicator.length;
  if (availableLength <= 0) {
    return indicator.substring(0, maxLength);
  }

  // Try to break at word boundary
  let truncated = text.substring(0, availableLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > availableLength * 0.7) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated.trim() + indicator;
}

/**
 * Format field name to readable label
 */
function formatFieldLabel(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);

      // Check if word itself is too long
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        // Break long word
        let remaining = word;
        while (remaining.length > 0) {
          let chunkLength = remaining.length;
          while (chunkLength > 0 && font.widthOfTextAtSize(remaining.substring(0, chunkLength), fontSize) > maxWidth) {
            chunkLength--;
          }
          if (chunkLength === 0) chunkLength = 1;
          lines.push(remaining.substring(0, chunkLength));
          remaining = remaining.substring(chunkLength);
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Estimate height needed for text block
 */
function estimateItemHeight(text: string, font: PDFFont, fontSize: number, maxWidth: number): number {
  const lines = wrapText(text, font, fontSize, maxWidth);
  return (lines.length + 2) * LINE_HEIGHT; // +2 for label and spacing
}

/**
 * Clean and normalize field value before overflow processing
 */
export function normalizeFieldValue(value: any): string {
  if (value === null || value === undefined) return '';

  let stringValue = String(value);

  // Normalize whitespace
  stringValue = stringValue.replace(/\s+/g, ' ').trim();

  // Remove control characters
  stringValue = stringValue.replace(/[\x00-\x1F\x7F]/g, '');

  return stringValue;
}
