import { createHash } from 'node:crypto';
import { decodePDFRawStream, PDFDocument, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildClientEnglishPack } from '@/lib/clientEnglishPack';
import { renderClientEnglishPackPdf } from '@/lib/clientEnglishPackPdf';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';

const snapshot: ExtractSnapshotV1 = {
  schema_version: 1, insured_name: 'Harbor Bakery LLC', carriers: ['Acme Insurance'],
  effective_date: '2026-01-01', expiration_date: '2027-01-01', claims_made: true,
  defense_inside_limits: false, premium: { total: 1200, frequency: 'annual' },
  fees: [], commission: null,
  coverages: Array.from({ length: 18 }, (_, index) => ({
    name: `Coverage ${index + 1}`, limit: '$1,000,000', deductible: '$1,000',
    premium: null, parent_coverage: index % 3 === 0 ? null : 'General liability',
  })),
  locations: [], vehicles: [{ year: 2025, make: 'Ford', model: 'Transit', vin: '1M8GDM9AXKP042788' }],
  drivers: [], document_type: 'quote', policy_number: 'POL-100', key_details: ['Audit applies'],
};

describe('renderClientEnglishPackPdf', () => {
  it('produces deterministic one or two page PDF bytes', async () => {
    const pack = buildClientEnglishPack(snapshot, undefined, {
      agencyName: 'Lewis Insurance', agencyPhone: '555-0100',
    });
    const options = { generatedOn: '2026-08-23T12:00:00.000Z' };
    const first = await renderClientEnglishPackPdf(pack, options);
    const second = await renderClientEnglishPackPdf(pack, options);
    expect(createHash('sha256').update(first).digest('hex')).toBe(
      createHash('sha256').update(second).digest('hex'),
    );
    const pdf = await PDFDocument.load(first);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
  });

  it('rejects an invalid generated date', async () => {
    const pack = buildClientEnglishPack(snapshot, undefined, { agencyName: 'Lewis Insurance', agencyPhone: null });
    await expect(renderClientEnglishPackPdf(pack, { generatedOn: 'not-a-date' })).rejects.toThrow('generatedOn');
  });

  it('caps oversized content at two pages and retains the mandatory disclaimer', async () => {
    const base = buildClientEnglishPack(snapshot, undefined, { agencyName: 'Lewis Insurance', agencyPhone: '555-0100' });
    const oversized = { ...base, keyDetails: Array.from({ length: 400 }, (_, index) => `Important coverage detail ${index + 1}`) };
    const bytes = await renderClientEnglishPackPdf(oversized, { generatedOn: '2026-08-23T12:00:00.000Z' });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const rawStreams = pdf.context.enumerateIndirectObjects()
      .map(([, object]) => object)
      .filter((object): object is PDFRawStream => object instanceof PDFRawStream);
    const decoded = rawStreams
      .map((raw) => Buffer.from(decodePDFRawStream(raw).decode()).toString('latin1'))
      .join('\n');
    expect(decoded).toContain(Buffer.from('Based on the documents on file with your agency.').toString('hex').toUpperCase());
  });
});
