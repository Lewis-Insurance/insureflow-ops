/**
 * OCR text chunking for long-document LLM extraction.
 * Prefer page boundaries; fall back to overlapping char windows for oversized pages.
 * Keep in sync with src/lib/ocrChunks.ts
 */

export const PAGE_BREAK_MARKER = '\n\n--- PAGE BREAK ---\n\n';
export const DEFAULT_OCR_CHUNK_MAX_CHARS = 28_000;
export const CHAR_WINDOW_OVERLAP = 500;

export interface OcrPageText {
  page: number;
  text: string;
}

export interface OcrChunk {
  text: string;
  startPage: number;
  endPage: number;
}

export interface BuildOcrChunksOptions {
  maxChars?: number;
}

export interface BuildOcrChunksResult {
  chunks: OcrChunk[];
  totalChars: number;
}

/** Build per-page text from Azure Document Intelligence pages array. */
export function pageTextsFromAzurePages(
  pages: Array<{ pageNumber?: number; lines?: Array<{ content?: string }> }>,
): OcrPageText[] {
  return pages.map((page, idx) => {
    const pageNum = page.pageNumber ?? idx + 1;
    const text = page.lines
      ? page.lines.map((line) => line.content || '').join('\n')
      : '';
    return { page: pageNum, text };
  });
}

/** Split full OCR text on PAGE BREAK markers into per-page entries. */
export function pageTextsFromFullText(fullText: string): OcrPageText[] {
  const parts = fullText.split(PAGE_BREAK_MARKER);
  if (parts.length <= 1 && !fullText.includes('--- PAGE BREAK ---')) {
    return [{ page: 1, text: fullText }];
  }
  return parts
    .map((text, idx) => ({ page: idx + 1, text }))
    .filter((p) => p.text.length > 0 || parts.length > 1);
}

function groupPageSize(pages: OcrPageText[]): number {
  if (pages.length === 0) return 0;
  return pages.reduce((sum, p) => sum + p.text.length, 0)
    + (pages.length - 1) * PAGE_BREAK_MARKER.length;
}

function splitOversizedPage(
  page: OcrPageText,
  maxChars: number,
  overlap: number,
): OcrChunk[] {
  const { text, page: pageNum } = page;
  if (text.length <= maxChars) {
    return [{ text, startPage: pageNum, endPage: pageNum }];
  }

  const chunks: OcrChunk[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push({
      text: text.slice(start, end),
      startPage: pageNum,
      endPage: pageNum,
    });
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
    if (start >= text.length - 1) break;
  }
  return chunks;
}

/**
 * Group pages into chunks targeting ~25k-30k chars each.
 * Oversized single pages are split with overlapping char windows.
 */
export function buildOcrChunks(
  pageTexts: OcrPageText[],
  options?: BuildOcrChunksOptions,
): BuildOcrChunksResult {
  const maxChars = options?.maxChars ?? DEFAULT_OCR_CHUNK_MAX_CHARS;
  const totalChars = pageTexts.reduce((sum, p) => sum + p.text.length, 0);
  const chunks: OcrChunk[] = [];
  let currentPages: OcrPageText[] = [];

  const flushGroup = () => {
    if (currentPages.length === 0) return;
    chunks.push({
      text: currentPages.map((p) => p.text).join(PAGE_BREAK_MARKER),
      startPage: currentPages[0].page,
      endPage: currentPages[currentPages.length - 1].page,
    });
    currentPages = [];
  };

  for (const page of pageTexts) {
    if (page.text.length > maxChars) {
      flushGroup();
      chunks.push(...splitOversizedPage(page, maxChars, CHAR_WINDOW_OVERLAP));
      continue;
    }

    const projected = [...currentPages, page];
    if (currentPages.length > 0 && groupPageSize(projected) > maxChars) {
      flushGroup();
    }

    currentPages.push(page);
  }

  flushGroup();

  return { chunks, totalChars };
}

/** Convenience: build chunks from full OCR text using PAGE BREAK markers. */
export function buildOcrChunksFromFullText(
  fullText: string,
  options?: BuildOcrChunksOptions,
): BuildOcrChunksResult {
  return buildOcrChunks(pageTextsFromFullText(fullText), options);
}
