// deno-lint-ignore-file no-explicit-any
// Robust text extraction for Supabase Edge Functions (Deno)
// - Extracts structured text from PDFs using pdfjs-dist (via ESM)
// - Falls back to OCR for image-only PDFs or images (PNG/JPG)
// - Layout-aware line grouping, basic header/footer filtering
// - Pluggable OCR provider (Google Vision example included)

import "https://deno.land/x/xhr@0.1.0/mod.ts"; // fetch/XHR polyfill

// Pull a Deno-compatible ES module build of pdf.js
// Tip: pin the exact version you validate in prod
import * as pdfjsLib from "https://esm.sh/pdfjs-dist@4.6.82/build/pdf.mjs";

// Ensure pdf.js works in Edge runtime without external worker config
try {
  // deno-lint-ignore no-explicit-any
  (pdfjsLib as any).GlobalWorkerOptions = (pdfjsLib as any).GlobalWorkerOptions || {};
  // deno-lint-ignore no-explicit-any
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = (pdfjsLib as any).GlobalWorkerOptions.workerSrc ||
    'https://esm.sh/pdfjs-dist@4.6.82/build/pdf.worker.min.js';
} catch (_) { /* ignore */ }

/** TYPES **/
export type ExtractOptions = {
  ocr?: {
    provider: 'google-vision';
    apiKey?: string; // If omitted, uses Deno.env('GOOGLE_VISION_API_KEY')
    languageHints?: string[]; // e.g., ['en', 'es']
  };
  maxPages?: number; // page cap to protect runtime
  headerFooterFilter?: boolean; // attempt to strip repeated headers/footers
};

export type PageText = {
  page: number;
  text: string; // reconstructed with line grouping
  rawItems: { str: string; x: number; y: number; fontName?: string; fontSize?: number }[];
  width: number; height: number;
};

export type ExtractResult = {
  mimeType: string;
  pageCount?: number;
  pages: PageText[];
  usedOCR: boolean;
  warnings: string[];
};

/** PUBLIC API **/
export async function extractTextFromBlob(blob: Blob, mimeType: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
  if (mimeType.includes('pdf')) {
    return extractFromPdf(await blob.arrayBuffer(), opts);
  }
  if (mimeType.includes('png') || mimeType.includes('jpeg') || mimeType.includes('jpg') || mimeType.includes('tiff')) {
    const text = await ocrImage(blob, opts);
    return { mimeType, pages: [{ page: 1, text, rawItems: [], width: 0, height: 0 }], usedOCR: true, warnings: [] };
  }
  // Try text as fallback
  try {
    const t = await blob.text();
    return { mimeType, pages: [{ page: 1, text: t, rawItems: [], width: 0, height: 0 }], usedOCR: false, warnings: [] };
  } catch {
    return { mimeType, pages: [], usedOCR: false, warnings: ['Unsupported mime type and not readable as text'] };
  }
}

/** PDF TEXT EXTRACTION **/
async function extractFromPdf(buffer: ArrayBuffer, opts: ExtractOptions): Promise<ExtractResult> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, useSystemFonts: true, disableWorker: true });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const maxPages = Math.min(opts.maxPages ?? 150, pageCount);

  const pages: PageText[] = [];
  let textItemsTotal = 0;

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();

    const items = content.items as any[];
    const transforms = content.styles as any; // pdf.js exposes font metrics in styles

    const rawItems = items
      .filter((it) => typeof it.str === 'string' && it.str.trim().length > 0)
      .map((it: any) => {
        const [a, b, c, d, e, f] = it.transform as number[]; // transform matrix
        // e, f is translation; f is y from bottom-left origin
        const font = transforms[it.fontName] || {};
        return {
          str: it.str as string,
          x: e as number,
          y: f as number,
          fontName: it.fontName as string | undefined,
          fontSize: (font.ascent ? Math.abs(font.ascent - font.descent) : it.height) as number | undefined,
        };
      });

    textItemsTotal += rawItems.length;

    const grouped = groupLines(rawItems);
    const text = grouped.map((ln) => ln.map((t) => t.str).join('')).join('\n');

    pages.push({ page: i, text, rawItems, width: viewport.width, height: viewport.height });
  }

  // If there is suspiciously no text, try OCR for page images
  const usedOCR = textItemsTotal === 0;
  if (usedOCR) {
    // Heuristic: run OCR on first N rasterized pages (N small to control runtime)
    const ocrFirst = Math.min(3, pages.length);
    const texts: string[] = [];
    for (let i = 1; i <= ocrFirst; i++) {
      const img = await rasterizePdfPage(buffer, i, 2.0); // scale 2x
      const t = await ocrImage(img, opts);
      texts.push(t);
    }
    const merged = texts.join('\n\n');
    return { mimeType: 'application/pdf', pageCount, pages: [{ page: 1, text: merged, rawItems: [], width: 0, height: 0 }], usedOCR: true, warnings: ['Raster OCR limited to first pages for performance'] };
  }

  let filtered = pages;
  const warnings: string[] = [];

  if (opts.headerFooterFilter) {
    const { pages: p2, removed } = stripHeadersAndFooters(pages);
    filtered = p2;
    if (removed > 0) warnings.push(`Header/footer lines removed: ~${removed}`);
  }

  return { mimeType: 'application/pdf', pageCount, pages: filtered, usedOCR: false, warnings };
}

/** Line grouping by Y coordinate with tolerance, then X sort */
function groupLines(items: { str: string; x: number; y: number }[]): { str: string; x: number; y: number }[][] {
  const tolY = 2.0; // points tolerance for line grouping
  const sorted = [...items].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines: { str: string; x: number; y: number }[][] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (!last) { lines.push([it]); continue; }
    const sameLine = Math.abs(last[0].y - it.y) <= tolY;
    if (sameLine) {
      // insert in X order with a small space if far apart
      const prev = last[last.length - 1];
      const gap = it.x - prev.x;
      if (gap > 3) last.push({ ...it, str: ' ' + it.str }); else last.push(it);
    } else {
      lines.push([it]);
    }
  }
  return lines;
}

/** Simple header/footer removal by frequency across pages */
function stripHeadersAndFooters(pages: PageText[]): { pages: PageText[]; removed: number } {
  const freq = new Map<string, number>();
  for (const p of pages) {
    const lines = p.text.split('\n');
    const top = lines[0]?.trim();
    const bottom = lines[lines.length - 1]?.trim();
    if (top) freq.set(top, (freq.get(top) ?? 0) + 1);
    if (bottom) freq.set(bottom, (freq.get(bottom) ?? 0) + 1);
  }
  const repeated = new Set([...freq.entries()].filter(([_, c]) => c >= Math.max(2, Math.floor(pages.length * 0.6))).map(([k]) => k));
  let removed = 0;
  const cleaned = pages.map((p) => {
    const lines = p.text.split('\n');
    if (repeated.has(lines[0]?.trim())) { lines.shift(); removed++; }
    if (repeated.has(lines[lines.length - 1]?.trim())) { lines.pop(); removed++; }
    return { ...p, text: lines.join('\n') };
  });
  return { pages: cleaned, removed };
}

/** Rasterize specific PDF page to Blob (PNG) for OCR fallback */
async function rasterizePdfPage(pdfBuffer: ArrayBuffer, pageNum: number, scale = 2.0): Promise<Blob> {
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer, disableWorker: true }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvasFactory = new CanvasFactory();
  const canvasAndCtx = canvasFactory.create(viewport.width, viewport.height);
  const renderContext = { canvasContext: canvasAndCtx.ctx as any, viewport } as any;
  await (page as any).render(renderContext).promise;
  const blob = await canvasAndCtx.canvas.convertToBlob({ type: 'image/png' });
  canvasFactory.destroy(canvasAndCtx.canvas);
  return blob;
}

/** Minimal OffscreenCanvas factory for Deno */
class CanvasFactory {
  create(width: number, height: number) {
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not available');
    return { canvas, ctx };
  }
  destroy(canvas: OffscreenCanvas) {
    // GC handles it
  }
}

/** OCR (Google Vision example) */
async function ocrImage(img: Blob, opts: ExtractOptions): Promise<string> {
  if (!opts.ocr) return '';
  if (opts.ocr.provider !== 'google-vision') return '';
  const key = opts.ocr.apiKey || Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!key) throw new Error('OCR requested but GOOGLE_VISION_API_KEY not set');

  const base64 = await blobToBase64(img);
  const body = {
    requests: [{
      image: { content: base64 },
      features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      imageContext: { languageHints: opts.ocr.languageHints ?? ['en'] }
    }]
  };

  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`Vision OCR error ${res.status}`);
  const json = await res.json();
  const text = json?.responses?.[0]?.fullTextAnnotation?.text || '';
  return text;
}

async function blobToBase64(b: Blob): Promise<string> {
  const ab = await b.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // deno-lint-ignore no-deprecated-deno-api
  return btoa(binary);
}
