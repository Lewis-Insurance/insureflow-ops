// Shared transform used by sync-deno-port.ts (writes the Deno copies) and
// check-deno-port-sync.ts (verifies they are in sync). Operator tooling: run via
// `npx tsx`. NOT part of the Vite build or vitest (scripts/ is outside src/**).
//
// The ONE deterministic transform that turns a browser-side pure module into its
// Deno counterpart is: append `.ts` to every RELATIVE import/export specifier
// (`from './format'` -> `from './format.ts'`). Node/Deno both resolve the source
// verbatim otherwise because the ported modules are runtime-free. Cross-form
// relative imports survive unchanged because the directory layout is mirrored:
// src/lib/acord/acord125/x.ts importing '../acord25/format' becomes
// _shared/acord125/x.ts importing '../acord25/format.ts', which exists.

import * as path from 'node:path';

/** One ported form directory: src/lib/acord/<dir> -> _shared/<dir>. */
export interface PortedForm {
  /** Directory name under BOTH src/lib/acord/ and supabase/functions/_shared/. */
  dir: string;
  /** The pure modules copied verbatim (basenames inside dir). */
  modules: readonly string[];
  /**
   * Basenames that import `@/types/master-coi` and therefore need that
   * specifier rewritten to the Deno mirror (see rewriteMasterCoiImport).
   */
  masterCoiImporters: readonly string[];
}

// The per-form ported sets. acord25 is the original Section 2.2 list
// (validationRules.ts is NOT ported: client/onboarding only). acord125 and
// acord126 are the Phase 1b submission-packet engines plus their risk-store
// adapters; their builders import '../acord25/format', which the mirrored
// layout resolves (see header comment).
export const PORTED_FORMS: readonly PortedForm[] = [
  {
    dir: 'acord25',
    modules: [
      'fieldMap.ts',
      'types.ts',
      'format.ts',
      'buildAcord25FieldValues.ts',
      'validateAcord25.ts',
      'fromMasterCoi.ts',
      'requirements.ts',
      'previewHash.ts',
    ],
    masterCoiImporters: ['fromMasterCoi.ts', 'requirements.ts'],
  },
  {
    dir: 'acord125',
    modules: [
      'fieldMap.ts',
      'types.ts',
      'buildAcord125FieldValues.ts',
      'validateAcord125.ts',
      'fromRiskStore.ts',
    ],
    masterCoiImporters: [],
  },
  {
    dir: 'acord126',
    modules: [
      'fieldMap.ts',
      'types.ts',
      'buildAcord126FieldValues.ts',
      'validateAcord126.ts',
      'fromRiskStore.ts',
    ],
    masterCoiImporters: [],
  },
];

export const ACORD_SRC_ROOT = path.resolve('src/lib/acord');
export const SHARED_DENO_ROOT = path.resolve('supabase/functions/_shared');

export function srcDirFor(form: PortedForm): string {
  return path.join(ACORD_SRC_ROOT, form.dir);
}

export function denoDirFor(form: PortedForm): string {
  return path.join(SHARED_DENO_ROOT, form.dir);
}

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
 * Modules that import `@/types/master-coi` (per-form masterCoiImporters)
 * become the mirror `../master-coi-types.ts` in Deno. The mirror lives in
 * _shared/ (one level up from _shared/<form>/, where those modules sit), so
 * the specifier is '../'.
 */
export function rewriteMasterCoiImport(source: string): string {
  return source.replace(
    /(['"])@\/types\/master-coi\1/g,
    (_m, q: string) => `${q}../master-coi-types.ts${q}`,
  );
}

/** Full transform for a given form + source basename. */
export function transformModule(form: PortedForm, basename: string, source: string): string {
  let out = source;
  if (form.masterCoiImporters.includes(basename)) {
    out = rewriteMasterCoiImport(out);
  }
  out = appendTsToRelativeImports(out);
  return out;
}
