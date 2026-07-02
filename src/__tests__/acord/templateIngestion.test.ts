// ============================================
// Template Ingestion Tests
// Covers XFA detection, AcroForm validation, and sanitized-bytes output.
// Fixtures are built in-memory with the real pdf-lib (no mocks) so the tests
// exercise the actual catalog/AcroForm code paths.
// ============================================

import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import {
  hasXfaPacket,
  validatePdfForAcord,
  ingestAcordTemplate,
} from '@/lib/acord/templateIngestion';

// ============================================
// FIXTURE BUILDERS
// ============================================

/** Build a plain AcroForm PDF with `fieldCount` text fields; returns saved bytes. */
async function buildAcroFormPdf(fieldCount = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();

  for (let i = 0; i < fieldCount; i++) {
    const field = form.createTextField(`field_${i}`);
    field.addToPage(page, { x: 20, y: 700 - i * 30, width: 200, height: 20 });
  }

  return doc.save();
}

/** Build a PDF with no form fields at all. */
async function buildFieldlessPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return doc.save();
}

const INGEST_OPTIONS = {
  formNumber: '125',
  formName: 'Commercial Insurance Application',
  version: '2023-04',
} as const;

// ============================================
// TESTS
// ============================================

describe('Template Ingestion', () => {
  describe('hasXfaPacket', () => {
    it('returns false for a plain AcroForm PDF', async () => {
      const bytes = await buildAcroFormPdf(1);
      const doc = await PDFDocument.load(bytes);
      expect(hasXfaPacket(doc)).toBe(false);
    });

    it('returns true once an XFA entry is injected into the AcroForm dict', async () => {
      const bytes = await buildAcroFormPdf(1);
      const doc = await PDFDocument.load(bytes);

      // The fixture already has an AcroForm dict; inject an XFA key into it.
      const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
      acro.set(PDFName.of('XFA'), doc.context.obj([]));

      expect(hasXfaPacket(doc)).toBe(true);
    });
  });

  describe('validatePdfForAcord', () => {
    it('accepts an AcroForm PDF with no warnings', async () => {
      const bytes = await buildAcroFormPdf(3);
      const result = await validatePdfForAcord(bytes);

      expect(result.valid).toBe(true);
      expect(result.isAcroForm).toBe(true);
      expect(result.isXfaHybrid).toBe(false);
      expect(result.fieldCount).toBeGreaterThanOrEqual(1);
      expect(result.warnings).toEqual([]);
    });

    it('rejects a PDF with no form fields', async () => {
      const bytes = await buildFieldlessPdf();
      const result = await validatePdfForAcord(bytes);

      expect(result.valid).toBe(false);
      expect(result.fieldCount).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ingestAcordTemplate', () => {
    it('succeeds on an AcroForm PDF and returns sanitized bytes with the same field count', async () => {
      const bytes = await buildAcroFormPdf(4);

      const originalFieldCount = (await PDFDocument.load(bytes)).getForm().getFields().length;
      expect(originalFieldCount).toBe(4);

      const result = await ingestAcordTemplate(bytes, INGEST_OPTIONS);

      expect(result.success).toBe(true);
      expect(result.sanitizedBytes).toBeInstanceOf(Uint8Array);
      expect(result.sanitizedBytes!.length).toBeGreaterThan(0);

      const reloadedFieldCount = (await PDFDocument.load(result.sanitizedBytes!))
        .getForm()
        .getFields().length;
      expect(reloadedFieldCount).toBe(originalFieldCount);
    });

    it('marks an XFA-hybrid template as acroform_hybrid and warns that XFA was removed', async () => {
      // Build an AcroForm PDF, inject an XFA packet, and re-save so the loaded
      // bytes carry both an AcroForm field inventory and an XFA layer.
      // IMPORTANT: do NOT call getForm() before save() here - pdf-lib strips the
      // XFA entry the moment the form is accessed, which would defeat the fixture.
      const base = await buildAcroFormPdf(2);
      const doc = await PDFDocument.load(base);
      const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
      acro.set(PDFName.of('XFA'), doc.context.obj([]));
      const hybridBytes = await doc.save();

      // Sanity: the re-saved bytes still report an XFA packet before ingestion.
      expect(hasXfaPacket(await PDFDocument.load(hybridBytes))).toBe(true);

      const result = await ingestAcordTemplate(hybridBytes, INGEST_OPTIONS);

      expect(result.success).toBe(true);
      expect(result.template?.pdf_type).toBe('acroform_hybrid');
      expect(result.warnings.some(w => /XFA/i.test(w))).toBe(true);

      // The stored copy must be XFA-free.
      expect(hasXfaPacket(await PDFDocument.load(result.sanitizedBytes!))).toBe(false);
    });
  });
});
