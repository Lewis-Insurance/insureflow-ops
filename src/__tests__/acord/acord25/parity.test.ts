import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * ACORD 25 client<->server parity.
 *
 * The certificate has a "hash bind": the browser preview (src/lib/acord/acord25)
 * and the server rebuild (supabase/functions/_shared/acord25) must compute
 * BYTE-IDENTICAL field values, or issuing a cert returns a 409. The two copies
 * are hand-mirrored and are allowed to differ ONLY in their import lines
 * (relative-path `.ts` extensions and the master-coi type import path).
 *
 * This test replaces the manual `diff -w` a reviewer used to run by hand: if the
 * real logic of any mirrored file drifts, this goes red on the PR instead of
 * 409-ing in production. See NEW-PC-SETUP-WINDOWS.md section 8 and
 * Merge-Process-And-Workflow-Handoff-2026-07-09.md item #4.
 */

// repo root = up four from src/__tests__/acord/acord25/
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CLIENT_DIR = join(ROOT, 'src', 'lib', 'acord', 'acord25');
const SERVER_DIR = join(ROOT, 'supabase', 'functions', '_shared', 'acord25');

// Drop every import/re-export line so only real logic is compared. Members of a
// multi-line import survive but are identical on both sides, so they don't matter.
// Line endings are normalized first: CRLF vs LF never affects the compiled
// hash-bind output, and the Windows PC checks files out with mixed endings.
const stripImportLines = (source: string): string =>
  source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line) && !/\bfrom\s*['"]/.test(line))
    .join('\n')
    .trim();

const tsFiles = (dir: string): Set<string> =>
  new Set(readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')));

// The mirrored set = files present in BOTH dirs. client-only files
// (e.g. validationRules.ts) are intentionally not server-ported and excluded.
const clientFiles = tsFiles(CLIENT_DIR);
const serverFiles = tsFiles(SERVER_DIR);
const mirrored = [...clientFiles].filter((f) => serverFiles.has(f)).sort();

describe('acord25 client/server parity', () => {
  it('discovers the known mirrored file set (guards against a moved/empty dir)', () => {
    // If someone relocates these dirs, the intersection would silently go empty
    // and every parity assertion would vacuously pass. Fail loudly instead.
    expect(mirrored).toEqual(
      expect.arrayContaining([
        'buildAcord25FieldValues.ts',
        'fieldMap.ts',
        'format.ts',
        'fromMasterCoi.ts',
        'previewHash.ts',
        'requirements.ts',
        'types.ts',
        'validateAcord25.ts',
      ]),
    );
  });

  it.each(mirrored)('%s has identical logic on client and server', (file) => {
    const client = stripImportLines(readFileSync(join(CLIENT_DIR, file), 'utf8'));
    const server = stripImportLines(readFileSync(join(SERVER_DIR, file), 'utf8'));
    expect(server).toBe(client);
  });
});
