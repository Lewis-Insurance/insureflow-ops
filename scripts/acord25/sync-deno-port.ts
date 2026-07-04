// sync-deno-port.ts
//
// Copies the pure client-side ACORD 25 modules to the Deno port directory,
// applying the deterministic `.ts`-specifier transform (see deno-port-transform).
// Also mirrors src/types/master-coi.ts to the Deno master-coi-types.ts.
//
// Operator tool: run via `npx tsx scripts/acord25/sync-deno-port.ts`. Excluded
// from Vite/vitest. Run at onboarding (Section 2.2 step 7) and after any edit to
// a ported module.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PORTED_MODULES,
  SRC_DIR,
  DENO_DIR,
  MASTER_COI_SRC,
  MASTER_COI_DENO,
  transformModule,
  appendTsToRelativeImports,
} from './deno-port-transform';

function main(): void {
  fs.mkdirSync(DENO_DIR, { recursive: true });

  for (const basename of PORTED_MODULES) {
    const srcPath = path.join(SRC_DIR, basename);
    if (!fs.existsSync(srcPath)) {
      console.error(`Missing source module: ${srcPath}`);
      process.exit(1);
    }
    const source = fs.readFileSync(srcPath, 'utf8');
    const out = transformModule(basename, source);
    const denoPath = path.join(DENO_DIR, basename);
    fs.writeFileSync(denoPath, out, 'utf8');
    console.log(`synced ${basename} -> ${path.relative(process.cwd(), denoPath)}`);
  }

  // Mirror the master-coi types (type-only module).
  if (fs.existsSync(MASTER_COI_SRC)) {
    const mc = fs.readFileSync(MASTER_COI_SRC, 'utf8');
    fs.writeFileSync(MASTER_COI_DENO, appendTsToRelativeImports(mc), 'utf8');
    console.log(`synced master-coi.ts -> ${path.relative(process.cwd(), MASTER_COI_DENO)}`);
  } else {
    console.warn(`master-coi types not found at ${MASTER_COI_SRC}; skipping mirror`);
  }

  console.log('Deno port sync complete.');
}

main();
