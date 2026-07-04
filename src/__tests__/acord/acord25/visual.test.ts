// visual.test.ts
//
// Local-only visual smoke test (blueprint B Section 8). Env-gated on
// ACORD25_TEMPLATE_PATH so CI (which never holds the licensed blank) skips the
// whole suite. When the env var points at the real ACORD 25 PDF, it fills the
// form over buildSampleInput() and rasterizes page 1 to test-output/ (gitignored)
// for a human to eyeball. pdfjs-dist and @napi-rs/canvas are OPTIONAL dev deps
// imported dynamically inside the gated block, so a machine without them still
// runs the rest of the suite.

import { describe, it, expect } from 'vitest';
import { buildAcord25FieldValues } from '@/lib/acord/acord25/buildAcord25FieldValues';
import { validateAcord25 } from '@/lib/acord/acord25/validateAcord25';
import { fillAcordPdf } from '@/lib/acord/pdfFiller';
import { ingestAcordTemplate } from '@/lib/acord/templateIngestion';
import { buildSampleInput } from '@/test/fixtures/acord25Fixture';

const TEMPLATE_PATH = process.env.ACORD25_TEMPLATE_PATH;

// describe.skipIf keeps this out of CI while allowing a local run when the env
// var is set to the path of the licensed blank.
describe.skipIf(!TEMPLATE_PATH)('ACORD 25 visual fill (local, licensed blank)', () => {
  it('fills the real form over the sample input and writes a page-1 PNG', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const templateBytes = new Uint8Array(await fs.readFile(TEMPLATE_PATH!));

    // Derive a real template inventory from the licensed blank so the validator
    // runs against genuine field metadata.
    const ingest = await ingestAcordTemplate(templateBytes, {
      formNumber: '25',
      formName: 'Certificate of Liability Insurance',
      version: '2016-03',
      licenseNotes: 'local licensed blank (ACORD25_TEMPLATE_PATH)',
    });
    expect(ingest.success).toBe(true);

    const build = buildAcord25FieldValues(buildSampleInput());
    const templateInfo = {
      version: '2016-03',
      field_inventory: (ingest.fieldInventory ?? []).map((f) => ({
        name: f.name,
        type: String(f.type),
        maxLength: (f as { maxLength?: number }).maxLength,
      })),
    };
    const validation = validateAcord25(build, { mode: 'preview', template: templateInfo });
    expect(validation.issues.filter((i) => i.severity === 'error')).toHaveLength(0);

    const filled = await fillAcordPdf(ingest.sanitizedBytes ?? templateBytes, {
      fieldValues: build.fieldValues,
      flatten: true,
      updateAppearances: true,
    });
    expect(filled.success).toBe(true);
    expect(filled.skippedFields).toEqual([]);

    const outDir = path.resolve(process.cwd(), 'test-output');
    await fs.mkdir(outDir, { recursive: true });

    // Rasterize page 1 if pdfjs-dist + a canvas backend are available. If they
    // are not installed, still emit the flattened PDF so a human can open it.
    await fs.writeFile(path.join(outDir, 'acord25-sample-filled.pdf'), filled.pdfBytes!);

    try {
      // Computed specifiers + @vite-ignore so Vite does not try to resolve these
      // OPTIONAL dev deps at transform time (they are absent in CI, where this
      // whole suite is skipped anyway).
      const pdfjsSpecifier = ['pdfjs-dist', 'legacy/build/pdf.mjs'].join('/');
      const canvasSpecifier = ['@napi-rs', 'canvas'].join('/');
      const pdfjs = await import(/* @vite-ignore */ pdfjsSpecifier);
      const canvasMod = await import(/* @vite-ignore */ canvasSpecifier);
      const loadingTask = pdfjs.getDocument({ data: filled.pdfBytes! });
      const pdf = await loadingTask.promise;
      const pageObj = await pdf.getPage(1);
      const viewport = pageObj.getViewport({ scale: 2 });
      const canvas = canvasMod.createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      await pageObj.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      const png = canvas.toBuffer('image/png');
      await fs.writeFile(path.join(outDir, 'acord25-sample-filled.png'), png);
    } catch {
      // pdfjs-dist / @napi-rs/canvas not installed: the flattened PDF above is the
      // human-review artifact. Not a failure.
    }

    expect(build.ok).toBe(true);
  });
});
