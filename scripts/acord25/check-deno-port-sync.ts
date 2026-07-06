// check-deno-port-sync.ts
//
// CI guard: recompute the deterministic transform over each source module of
// every ported form (acord25, acord125, acord126; see PORTED_FORMS) and
// byte-compare against the committed Deno copy. Exits nonzero on ANY drift (or
// a missing Deno copy), so a change to a pure client module that was not
// re-synced fails the build. Also checks the master-coi types mirror.
//
// Operator/CI tool: run via `npx tsx scripts/acord25/check-deno-port-sync.ts`.
// Excluded from Vite/vitest.

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

function drifted(label: string, expected: string, denoPath: string, problems: string[]): void {
  if (!fs.existsSync(denoPath)) {
    problems.push(`missing Deno copy: ${path.relative(process.cwd(), denoPath)} (run sync-deno-port.ts)`);
    return;
  }
  const actual = fs.readFileSync(denoPath, 'utf8');
  if (actual !== expected) {
    problems.push(`drift in ${label}: ${path.relative(process.cwd(), denoPath)} differs from the transformed source (run sync-deno-port.ts)`);
  }
}

function main(): void {
  const problems: string[] = [];

  for (const form of PORTED_FORMS) {
    const srcDir = srcDirFor(form);
    const denoDir = denoDirFor(form);

    for (const basename of form.modules) {
      const srcPath = path.join(srcDir, basename);
      if (!fs.existsSync(srcPath)) {
        problems.push(`missing source module: ${path.relative(process.cwd(), srcPath)}`);
        continue;
      }
      const expected = transformModule(form, basename, fs.readFileSync(srcPath, 'utf8'));
      drifted(`${form.dir}/${basename}`, expected, path.join(denoDir, basename), problems);
    }
  }

  if (fs.existsSync(MASTER_COI_SRC)) {
    const expected = appendTsToRelativeImports(fs.readFileSync(MASTER_COI_SRC, 'utf8'));
    drifted('master-coi-types.ts', expected, MASTER_COI_DENO, problems);
  }

  if (problems.length > 0) {
    console.error('Deno port is OUT OF SYNC:');
    for (const p of problems) {
      console.error(`  - ${p}`);
    }
    process.exit(1);
  }

  console.log('Deno port is in sync.');
}

main();
