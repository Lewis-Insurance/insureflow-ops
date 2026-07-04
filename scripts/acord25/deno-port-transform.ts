// Shared transform used by sync-deno-port.ts (writes the Deno copies) and
// check-deno-port-sync.ts (verifies they are in sync). Operator tooling: run via
// `npx tsx`. NOT part of the Vite build or vitest (scripts/ is outside src/**).
//
// The ONE deterministic transform that turns a browser-side pure module into its
// Deno counterpart is: append `.ts` to every RELATIVE import/export specifier
// (`from './format'` -> `from './format.ts'`). Node/Deno both resolve the source
// verbatim otherwise because the acord25 modules are runtime-free.

import * as path from 'node:path';

// The pure modules copied verbatim (Section 2.2). validationRules.ts is NOT
// ported (client/onboarding only).
export const PORTED_MODULES = [
  'fieldMap.ts',
  'types.ts',
  'format.ts',
  'buildAcord25FieldValues.ts',
  'validateAcord25.ts',
  'fromMasterCoi.ts',
  'previewHash.ts',
] as const;

export const SRC_DIR = path.resolve('src/lib/acord/acord25');
export const DENO_DIR = path.resolve('supabase/functions/_shared/acord25');

// src/types/master-coi.ts mirrors to supabase/functions/_shared/master-coi-types.ts
// (doc 02 declares it, fromMasterCoi consumes it).
export const MASTER_COI_SRC = path.resolve('src/types/master-coi.ts');
export const MASTER_COI_DENO = path.resolve('supabase/functions/_shared/master-coi-types.ts');

/**
 * Append `.ts` to relative import/export specifiers that do not already end in
 * `.ts`. Handles:
 *   import ... from './x'         -> from './x.ts'
 *   export ... from './x'        -> from './x.ts'
 *   import type ... from './x'    -> from './x.ts'
 *   import('./x')                 -> import('./x.ts')
 * Only relative specifiers (./ or ../) are touched; bare specifiers are left as
 * is. A specifier already ending in .ts, .json, or .js is left untouched.
 */
export function appendTsToRelativeImports(source: string): string {
  const specifierRe = /(from\s+|import\s*\(\s*)(['"])(\.\.?\/[^'"]+?)\2/g;
  return source.replace(specifierRe, (_match, prefix: string, quote: string, spec: string) => {
    if (/\.(ts|json|js|mjs|cjs)$/.test(spec)) {
      return `${prefix}${quote}${spec}${quote}`;
    }
    return `${prefix}${quote}${spec}.ts${quote}`;
  });
}

/**
 * The fromMasterCoi module imports `@/types/master-coi`; in Deno that becomes the
 * mirror `../master-coi-types.ts`. The mirror lives in _shared/ (one level up from
 * _shared/acord25/, where fromMasterCoi.ts sits), so the specifier is '../'.
 * Applied only to fromMasterCoi.ts.
 */
export function rewriteMasterCoiImport(source: string): string {
  return source.replace(
    /(['"])@\/types\/master-coi\1/g,
    (_m, q: string) => `${q}../master-coi-types.ts${q}`,
  );
}

/** Full transform for a given source basename. */
export function transformModule(basename: string, source: string): string {
  let out = source;
  if (basename === 'fromMasterCoi.ts') {
    out = rewriteMasterCoiImport(out);
  }
  out = appendTsToRelativeImports(out);
  return out;
}
