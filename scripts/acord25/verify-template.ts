// verify-template.ts
//
// ACORD 25 template onboarding verifier (doc 05 Section 2.2 steps 2/4/5; blueprint
// B Section 6). Three modes:
//
//   --dump    Print the stored template's field inventory (name, type, page,
//             maxLength, options). Raw material for authoring the field map.
//
//   --check   The FIELD-MAP CORRECTNESS GATE. Loads the stored inventory and
//             ACORD25_FIELD_MAP and hard-asserts: the row exists (form 25,
//             is_current, pdf_type acroform/acroform_hybrid); license_notes set;
//             version matches YYYY-MM; stored PDF is exactly 1 page with >= 80
//             fields; every map entry resolves to an inventory field with a
//             matching pdf-lib type (ynText/date/limit/text/multilineText -> text;
//             checkbox -> checkbox); all 6 insurer rows (name + NAIC A-F) resolve;
//             every per-line INSR LTR / policy / eff / exp / ADDL / SUBR / limit
//             resolves for GL/Auto/Umbrella/WC; ADDL INSD and SUBR WVD are TEXT;
//             and it prints the sha256 of the STORED SANITIZED bytes to paste into
//             ACORD25_TEMPLATE_SHA256. Exits nonzero on any failure.
//
//   --render  Rasterize page 1 of (a) the blank and (b) a sample fill over
//             buildAcord25FieldValues(buildSampleInput()) to test-output/ for a
//             human visual gate. Needs the OPTIONAL dev deps pdfjs-dist and
//             @napi-rs/canvas; falls back to writing the flattened PDF when they
//             are absent.
//
// Operator tool: run via
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/acord25/verify-template.ts --check
// Excluded from Vite/vitest.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import {
  ACORD25_FIELD_MAP,
  ACORD25_TEMPLATE_SHA256,
  ACORD25_TEMPLATE_VERSION,
  type Acord25FieldKind,
  type Acord25LogicalKey,
} from '../../src/lib/acord/acord25/fieldMap';
import { buildAcord25FieldValues } from '../../src/lib/acord/acord25/buildAcord25FieldValues';
import { buildSampleInput } from '../../src/test/fixtures/acord25Fixture';

const FORM_NUMBER = '25';

interface InventoryItem {
  name: string;
  type: string;
  page?: number;
  maxLength?: number;
  options?: string[] | null;
}

interface TemplateRow {
  id: string;
  form_number: string;
  version: string;
  is_current: boolean;
  pdf_type: string;
  license_notes: string | null;
  field_inventory: InventoryItem[] | null;
  file_path?: string | null;
  storage_path?: string | null;
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }
  return createClient(url, key);
}

async function loadTemplateRow(supabase: ReturnType<typeof createClient>): Promise<TemplateRow> {
  const { data, error } = await supabase
    .from('acord_templates')
    .select('*')
    .eq('form_number', FORM_NUMBER)
    .eq('is_current', true)
    .maybeSingle();
  if (error) {
    console.error(`Failed to load acord_templates row: ${error.message}`);
    process.exit(2);
  }
  if (!data) {
    console.error(`No current acord_templates row for form ${FORM_NUMBER}. Upload the blank at /acord-templates first.`);
    process.exit(2);
  }
  return data as unknown as TemplateRow;
}

// Fetch the stored sanitized PDF bytes from the documents bucket.
async function loadStoredBytes(
  supabase: ReturnType<typeof createClient>,
  row: TemplateRow,
): Promise<Uint8Array | null> {
  const storedPath =
    row.file_path ||
    row.storage_path ||
    `acord-templates/${row.form_number}/${row.version}`;
  // If the exact object name is not on the row, list the folder and take the
  // first PDF.
  let objectPath = storedPath;
  if (!/\.pdf$/i.test(objectPath)) {
    const { data: list } = await supabase.storage.from('documents').list(objectPath);
    const pdf = (list ?? []).find((o) => /\.pdf$/i.test(o.name));
    if (!pdf) {
      return null;
    }
    objectPath = `${objectPath}/${pdf.name}`;
  }
  const { data, error } = await supabase.storage.from('documents').download(objectPath);
  if (error || !data) {
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

function isTextKind(kind: Acord25FieldKind): boolean {
  return kind === 'text' || kind === 'multilineText' || kind === 'date' || kind === 'limit' || kind === 'ynText';
}

function invIsCheckbox(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'checkbox' || t === 'pdfcheckbox';
}

function invIsText(type: string): boolean {
  const t = type.toLowerCase();
  return t === 'text' || t === 'pdftextfield';
}

// ---------------------------------------------------------------------------
// --dump
// ---------------------------------------------------------------------------

async function runDump(): Promise<void> {
  const supabase = getSupabase();
  const row = await loadTemplateRow(supabase);
  const inv = row.field_inventory ?? [];
  console.log(`form ${row.form_number} version ${row.version} pdf_type ${row.pdf_type} fields ${inv.length}`);
  console.log('name\ttype\tpage\tmaxLength\toptions');
  for (const f of inv) {
    console.log(
      [f.name, f.type, f.page ?? '', f.maxLength ?? '', (f.options ?? []).join('|')].join('\t'),
    );
  }
}

// ---------------------------------------------------------------------------
// --check
// ---------------------------------------------------------------------------

async function runCheck(): Promise<void> {
  const supabase = getSupabase();
  const row = await loadTemplateRow(supabase);
  const failures: string[] = [];
  const notes: string[] = [];

  // Row-level gates.
  if (row.pdf_type !== 'acroform' && row.pdf_type !== 'acroform_hybrid') {
    failures.push(`pdf_type is "${row.pdf_type}", expected acroform or acroform_hybrid`);
  }
  if (!row.license_notes || row.license_notes.trim().length === 0) {
    failures.push('license_notes is empty (required for form 25)');
  }
  if (!/^\d{4}-\d{2}$/.test(row.version)) {
    failures.push(`version "${row.version}" is not YYYY-MM`);
  }
  if (ACORD25_TEMPLATE_VERSION && ACORD25_TEMPLATE_VERSION !== row.version) {
    failures.push(`ACORD25_TEMPLATE_VERSION ("${ACORD25_TEMPLATE_VERSION}") does not match row version ("${row.version}")`);
  }

  const inv = row.field_inventory ?? [];
  const invByName = new Map<string, InventoryItem>();
  for (const f of inv) {
    invByName.set(f.name, f);
  }
  if (inv.length < 80) {
    failures.push(`field inventory has ${inv.length} fields, expected >= 80`);
  }

  // Stored bytes: 1 page + sha.
  const bytes = await loadStoredBytes(supabase, row);
  if (!bytes) {
    failures.push('could not download the stored PDF bytes from the documents bucket');
  } else {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (doc.getPageCount() !== 1) {
      failures.push(`stored PDF has ${doc.getPageCount()} pages, expected exactly 1`);
    }
    const sha = crypto.createHash('sha256').update(bytes).digest('hex');
    notes.push(`stored-bytes sha256: ${sha}`);
    if (ACORD25_TEMPLATE_SHA256 === '') {
      notes.push('ACORD25_TEMPLATE_SHA256 is empty; paste the sha above into fieldMap.ts');
    } else if (ACORD25_TEMPLATE_SHA256 !== sha) {
      failures.push(`ACORD25_TEMPLATE_SHA256 (${ACORD25_TEMPLATE_SHA256}) does not match stored-bytes sha (${sha})`);
    } else {
      notes.push('ACORD25_TEMPLATE_SHA256 matches stored bytes');
    }
  }

  // Field-map resolution + type agreement.
  const mapKeys = Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[];
  if (mapKeys.length === 0) {
    failures.push('ACORD25_FIELD_MAP is empty; author it before running --check');
  }
  for (const key of mapKeys) {
    const entry = ACORD25_FIELD_MAP[key];
    const item = invByName.get(entry.pdfField);
    if (!item) {
      failures.push(`map key ${key} -> "${entry.pdfField}" not found in inventory`);
      continue;
    }
    if (entry.kind === 'checkbox' && !invIsCheckbox(item.type)) {
      failures.push(`map key ${key} is checkbox but inventory type is ${item.type}`);
    }
    if (isTextKind(entry.kind) && !invIsText(item.type)) {
      failures.push(`map key ${key} is ${entry.kind} (text) but inventory type is ${item.type}`);
    }
  }

  // All 6 insurer rows resolve (name + NAIC A-F).
  for (const letter of ['A', 'B', 'C', 'D', 'E', 'F']) {
    for (const which of ['insurerName', 'insurerNaic']) {
      const key = `${which}_${letter}` as Acord25LogicalKey;
      const entry = ACORD25_FIELD_MAP[key];
      if (!entry || !invByName.has(entry.pdfField)) {
        failures.push(`insurer row field ${key} does not resolve`);
      }
    }
  }

  // Per-line fields for GL / Auto / Umbrella / WC (WC has no ADDL INSD column).
  const perLine: Record<string, Acord25LogicalKey[]> = {
    gl: ['gl_insrLtr', 'gl_policyNumber', 'gl_effDate', 'gl_expDate', 'gl_addlInsd', 'gl_subrWvd', 'gl_eachOccurrence'],
    auto: ['auto_insrLtr', 'auto_policyNumber', 'auto_effDate', 'auto_expDate', 'auto_addlInsd', 'auto_subrWvd', 'auto_combinedSingleLimit'],
    umbrella: ['umb_insrLtr', 'umb_policyNumber', 'umb_effDate', 'umb_expDate', 'umb_addlInsd', 'umb_subrWvd', 'umb_eachOccurrence'],
    wc: ['wc_insrLtr', 'wc_policyNumber', 'wc_effDate', 'wc_expDate', 'wc_subrWvd', 'wc_elEachAccident'],
  };
  for (const [line, keys] of Object.entries(perLine)) {
    for (const key of keys) {
      const entry = ACORD25_FIELD_MAP[key];
      if (!entry || !invByName.has(entry.pdfField)) {
        failures.push(`${line} field ${key} does not resolve`);
      }
    }
  }

  // ADDL INSD / SUBR WVD must be TEXT (ynText) fields on this blank.
  const ynKeys: Acord25LogicalKey[] = [
    'gl_addlInsd', 'gl_subrWvd',
    'auto_addlInsd', 'auto_subrWvd',
    'umb_addlInsd', 'umb_subrWvd',
    'wc_subrWvd', 'wc_anyProprietorExcluded',
    'other_addlInsd', 'other_subrWvd',
  ];
  for (const key of ynKeys) {
    const entry = ACORD25_FIELD_MAP[key];
    if (!entry) {
      continue;
    }
    const item = invByName.get(entry.pdfField);
    if (item && !invIsText(item.type)) {
      failures.push(
        `${key} ("${entry.pdfField}") is ${item.type}, expected a TEXT field. If a future edition made it a checkbox, flip the map entry kind to 'checkbox' (Section 4.5).`,
      );
    }
  }

  // Unmapped inventory fields, informational.
  const mapped = new Set(mapKeys.map((k) => ACORD25_FIELD_MAP[k].pdfField));
  const unmapped = inv.filter((f) => !mapped.has(f.name)).map((f) => f.name);
  notes.push(`${unmapped.length} unmapped inventory fields (informational): ${unmapped.join(', ')}`);

  // Report.
  for (const n of notes) {
    console.log(`note: ${n}`);
  }
  if (failures.length > 0) {
    console.error(`\nverify --check FAILED with ${failures.length} problem(s):`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }
  console.log('\nverify --check PASSED: field map is correct against the stored template.');
}

// ---------------------------------------------------------------------------
// --render
// ---------------------------------------------------------------------------

async function runRender(): Promise<void> {
  const supabase = getSupabase();
  const row = await loadTemplateRow(supabase);
  const bytes = await loadStoredBytes(supabase, row);
  if (!bytes) {
    console.error('could not download the stored PDF bytes; cannot render');
    process.exit(2);
  }

  const { fillAcordPdf } = await import('../../src/lib/acord/pdfFiller');
  const build = buildAcord25FieldValues(buildSampleInput());
  const filled = await fillAcordPdf(bytes, {
    fieldValues: build.fieldValues,
    flatten: true,
    updateAppearances: true,
  });

  const outDir = path.resolve('test-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'acord25-blank.pdf'), bytes);
  if (filled.pdfBytes) {
    fs.writeFileSync(path.join(outDir, 'acord25-sample-filled.pdf'), filled.pdfBytes);
  }

  try {
    const pdfjs = await import(/* @vite-ignore */ ['pdfjs-dist', 'legacy/build/pdf.mjs'].join('/'));
    const canvasMod = await import(/* @vite-ignore */ ['@napi-rs', 'canvas'].join('/'));
    for (const [name, src] of [
      ['acord25-blank', bytes],
      ['acord25-sample-filled', filled.pdfBytes],
    ] as const) {
      if (!src) {
        continue;
      }
      const pdf = await pdfjs.getDocument({ data: src }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = canvasMod.createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      fs.writeFileSync(path.join(outDir, `${name}.png`), canvas.toBuffer('image/png'));
      console.log(`rendered ${name}.png`);
    }
  } catch {
    console.log('pdfjs-dist / @napi-rs/canvas not installed; wrote flattened PDFs to test-output/ for manual review.');
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const mode = process.argv[2];
  switch (mode) {
    case '--dump':
      await runDump();
      break;
    case '--check':
      await runCheck();
      break;
    case '--render':
      await runRender();
      break;
    default:
      console.error('usage: verify-template.ts --dump | --check | --render');
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
