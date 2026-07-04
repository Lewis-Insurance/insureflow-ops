// templateIngestionXfa.test.ts
//
// XFA honesty of the ingestion path (blueprint B Section 1, 8; doc 05 Section 1).
// Builds synthetic PDFs and asserts:
//   - a hybrid (AcroForm fields + an XFA packet) is detected by hasXfaPacket,
//     ingests successfully, warns once about XFA, reports pdf_type
//     'acroform_hybrid', and its sanitizedBytes no longer carry an XFA packet;
//   - a plain AcroForm PDF has no XFA warning and pdf_type 'acroform';
//   - XFA detection happens BEFORE getForm() strips the entry (order matters).

import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString } from 'pdf-lib';
import {
  hasXfaPacket,
  ingestAcordTemplate,
  validatePdfForAcord,
} from '@/lib/acord/templateIngestion';

// Build a plain AcroForm PDF with two named fields.
async function buildPlainAcroForm(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const tf = form.createTextField('NamedInsured_FullName_A');
  tf.addToPage(page, { x: 20, y: 700, width: 200, height: 18 });
  const cb = form.createCheckBox('GeneralLiability_OccurrenceIndicator_A');
  cb.addToPage(page, { x: 20, y: 670, width: 12, height: 12 });
  return await doc.save();
}

// Inject an XFA packet into an existing AcroForm dictionary. The presence of the
// /XFA key is what hasXfaPacket looks for; the packet content is a minimal stub.
async function injectXfa(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const acroForm = doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict);
  if (!acroForm) {
    throw new Error('expected an AcroForm dictionary to attach XFA to');
  }
  const xfaXml = '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template/></xdp:xdp>';
  const xfaStream = doc.context.stream(xfaXml);
  const xfaRef = doc.context.register(xfaStream);
  // XFA can be a single stream ref or a name/stream array; use the array form
  // ["template", <ref>] so the entry is unambiguous.
  const arr = PDFArray.withContext(doc.context);
  arr.push(PDFHexString.fromText('template'));
  arr.push(xfaRef);
  acroForm.set(PDFName.of('XFA'), arr);
  // save WITHOUT updating field appearances so we do not accidentally strip XFA.
  return await doc.save();
}

describe('hasXfaPacket detection', () => {
  it('is true for a hybrid PDF and false for a plain AcroForm', async () => {
    const plain = await buildPlainAcroForm();
    const plainDoc = await PDFDocument.load(plain, { ignoreEncryption: true });
    expect(hasXfaPacket(plainDoc)).toBe(false);

    const hybrid = await injectXfa(plain);
    const hybridDoc = await PDFDocument.load(hybrid, { ignoreEncryption: true });
    expect(hasXfaPacket(hybridDoc)).toBe(true);
  });
});

describe('ingestAcordTemplate on a hybrid PDF', () => {
  it('succeeds, warns once about XFA, and reports pdf_type acroform_hybrid', async () => {
    const hybrid = await injectXfa(await buildPlainAcroForm());
    const result = await ingestAcordTemplate(hybrid, {
      formNumber: '25',
      formName: 'Certificate of Liability Insurance',
      version: '2016-03',
      licenseNotes: 'ACORD portal license (test)',
    });
    expect(result.success).toBe(true);
    expect(result.template?.pdf_type).toBe('acroform_hybrid');
    const xfaWarnings = result.warnings.filter((w) => /xfa/i.test(w));
    expect(xfaWarnings.length).toBe(1);
    // The AcroForm fields survived.
    expect(result.fieldInventory.length).toBe(2);
    // sanitizedBytes are produced.
    expect(result.sanitizedBytes).toBeInstanceOf(Uint8Array);
  });

  it('sanitizedBytes reload no longer carries an XFA packet (D2 strip)', async () => {
    const hybrid = await injectXfa(await buildPlainAcroForm());
    const result = await ingestAcordTemplate(hybrid, {
      formNumber: '25',
      formName: 'Certificate of Liability Insurance',
      version: '2016-03',
      licenseNotes: 'ACORD portal license (test)',
    });
    const reloaded = await PDFDocument.load(result.sanitizedBytes!, { ignoreEncryption: true });
    expect(hasXfaPacket(reloaded)).toBe(false);
  });
});

describe('ingestAcordTemplate on a plain AcroForm PDF', () => {
  it('reports pdf_type acroform and emits no XFA warning', async () => {
    const plain = await buildPlainAcroForm();
    const result = await ingestAcordTemplate(plain, {
      formNumber: '25',
      formName: 'Certificate of Liability Insurance',
      version: '2016-03',
      licenseNotes: 'ACORD portal license (test)',
    });
    expect(result.success).toBe(true);
    expect(result.template?.pdf_type).toBe('acroform');
    expect(result.warnings.some((w) => /xfa/i.test(w))).toBe(false);
  });
});

describe('validatePdfForAcord', () => {
  it('is valid with one warning for a hybrid PDF that has fields', async () => {
    const hybrid = await injectXfa(await buildPlainAcroForm());
    const res = await validatePdfForAcord(hybrid);
    expect(res.valid).toBe(true);
    expect(res.isAcroForm).toBe(true);
    expect(res.isXfaHybrid).toBe(true);
    expect(res.fieldCount).toBe(2);
    expect(res.warnings.length).toBe(1);
  });

  it('is valid with no warnings for a plain AcroForm PDF', async () => {
    const plain = await buildPlainAcroForm();
    const res = await validatePdfForAcord(plain);
    expect(res.valid).toBe(true);
    expect(res.isXfaHybrid).toBe(false);
    expect(res.warnings).toEqual([]);
  });
});
