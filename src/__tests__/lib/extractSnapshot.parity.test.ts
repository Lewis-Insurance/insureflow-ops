import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * extractSnapshot + ocrChunks client<->server parity.
 * Guards against drift between src/lib and supabase/functions/_shared copies.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CLIENT_EXTRACT = join(ROOT, 'src', 'lib', 'extractSnapshot.ts');
const SERVER_EXTRACT = join(ROOT, 'supabase', 'functions', '_shared', 'extractSnapshot.ts');
const CLIENT_OCR = join(ROOT, 'src', 'lib', 'ocrChunks.ts');
const SERVER_OCR = join(ROOT, 'supabase', 'functions', '_shared', 'ocrChunks.ts');

const stripImportLines = (source: string): string =>
  source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line) && !/\bfrom\s*['"]/.test(line))
    .join('\n')
    .trim();

const stripBlockComments = (source: string): string =>
  source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function extractMergeSection(source: string): string {
  const start = source.indexOf('function isNonemptyScalar');
  const end = source.indexOf('return normalizeExtractSnapshot(merged);');
  if (start === -1 || end === -1) return '';
  return source
    .slice(start, end + 'return normalizeExtractSnapshot(merged);'.length + 2)
    .trim();
}

describe('extractSnapshot client/server parity', () => {
  it('mergeExtractSnapshots is exported on both sides', () => {
    const client = readFileSync(CLIENT_EXTRACT, 'utf8');
    const server = readFileSync(SERVER_EXTRACT, 'utf8');
    expect(client).toMatch(/export function mergeExtractSnapshots/);
    expect(server).toMatch(/export function mergeExtractSnapshots/);
  });

  it('merge logic is identical between client and server extractSnapshot', () => {
    const client = stripBlockComments(stripImportLines(readFileSync(CLIENT_EXTRACT, 'utf8')));
    const server = stripBlockComments(stripImportLines(readFileSync(SERVER_EXTRACT, 'utf8')));

    expect(extractMergeSection(server)).toBe(extractMergeSection(client));
  });
});

describe('ocrChunks client/server parity', () => {
  it('buildOcrChunks is exported on both sides', () => {
    const client = readFileSync(CLIENT_OCR, 'utf8');
    const server = readFileSync(SERVER_OCR, 'utf8');
    expect(client).toMatch(/export function buildOcrChunks/);
    expect(server).toMatch(/export function buildOcrChunks/);
  });

  it('ocrChunks logic is identical between client and server', () => {
    const client = stripBlockComments(stripImportLines(readFileSync(CLIENT_OCR, 'utf8')));
    const server = stripBlockComments(stripImportLines(readFileSync(SERVER_OCR, 'utf8')));
    expect(server).toBe(client);
  });
});
