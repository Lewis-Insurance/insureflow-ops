// regen-parity-fixture.ts
//
// Rebuilds parity.fixture.json (Section 7.3, R1) from buildSampleInput(). The
// fixture is the SINGLE source both the client parity test (vitest) and the Deno
// parity test (deno test) consume: each asserts deep-equal expectedFieldValues
// and hashFieldValuesForPreview === expectedPreviewSha256. Regenerating it is the
// only sanctioned way to change it.
//
// Operator tool: run via `npx tsx scripts/acord25/regen-parity-fixture.ts`.
// Excluded from Vite/vitest. Writes into the Deno port directory (single copy).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildAcord25FieldValues } from '../../src/lib/acord/acord25/buildAcord25FieldValues';
import { hashFieldValuesForPreview } from '../../src/lib/acord/acord25/previewHash';
import { buildSampleInput } from '../../src/test/fixtures/acord25Fixture';

const DENO_DIR = path.resolve('supabase/functions/_shared/acord25');
const OUT_PATH = path.join(DENO_DIR, 'parity.fixture.json');

async function main(): Promise<void> {
  const input = buildSampleInput();
  const build = buildAcord25FieldValues(input);

  if (!build.ok) {
    console.error('buildSampleInput() did not produce an ok build; refusing to write a parity fixture:');
    for (const issue of build.issues.filter((i) => i.severity === 'error')) {
      console.error(`  - [${issue.code}] ${issue.message}`);
    }
    process.exit(1);
  }

  const expectedPreviewSha256 = await hashFieldValuesForPreview(build.fieldValues);

  const fixture = {
    // The serialized build input (so the Deno side rebuilds from the same source).
    input,
    // The exact emitted payload (pdfField -> string|boolean), TOTAL over the map.
    expectedFieldValues: build.fieldValues,
    // The canonical preview hash of that payload.
    expectedPreviewSha256,
  };

  fs.mkdirSync(DENO_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  console.log(`wrote ${path.relative(process.cwd(), OUT_PATH)}`);
  console.log(`  fields: ${Object.keys(build.fieldValues).length}`);
  console.log(`  previewSha256: ${expectedPreviewSha256}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
