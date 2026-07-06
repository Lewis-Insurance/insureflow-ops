// sync-deno-port.ts
//
// Copies the pure client-side ACORD form modules (acord25, acord125, acord126;
// see PORTED_FORMS) to their Deno port directories under
// supabase/functions/_shared/, applying the deterministic `.ts`-specifier
// transform (see deno-port-transform). Also mirrors src/types/master-coi.ts to
// the Deno master-coi-types.ts.
//
// Operator tool: run via `npx tsx scripts/acord25/sync-deno-port.ts`. Excluded
// from Vite/vitest. Run at onboarding (Section 2.2 step 7) and after any edit to
// a ported module.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PORTED_FORMS,
  MASTER_COI_SRC,
  MASTER_COI_DENO,
  srcDirFor,
  denoDirFor,
  transformModule,
  appendTsToRelativeImports,
} from './deno-port-transform';

function main(): void {
  for (const form of PORTED_FORMS) {
    const srcDir = srcDirFor(form);
    const denoDir = denoDirFor(form);
    fs.mkdirSync(denoDir, { recursive: true });

    for (const basename of form.modules) {
      const srcPath = path.join(srcDir, basename);
      if (!fs.existsSync(srcPath)) {
        console.error(`Missing source module: ${srcPath}`);
        process.exit(1);
      }
      const source = fs.readFileSync(srcPath, 'utf8');
      const out = transformModule(form, basename, source);
      const denoPath = path.join(denoDir, basename);
      fs.writeFileSync(denoPath, out, 'utf8');
      console.log(`synced ${form.dir}/${basename} -> ${path.relative(process.cwd(), denoPath)}`);
    }
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
