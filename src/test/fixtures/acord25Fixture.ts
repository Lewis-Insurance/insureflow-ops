// Test fixtures for the ACORD 25 pipeline.
//
// This file lives under src/test/fixtures (NOT under __tests__) so it is not
// itself collected as a test. It exports two helpers:
//
//   buildSyntheticAcord25(map?) -> a 1-page pdf-lib PDF with a REAL AcroForm
//     field per field-map entry (createTextField + setMaxLength for text kinds,
//     createCheckBox for checkbox kinds), using the EXACT committed PDF field
//     names. This stands in for the licensed blank in round-trip tests so the
//     licensed PDF never has to enter CI.
//
//   buildSampleInput() -> a fully-populated two-carrier Acord25BuildInput
//     (GL + Umbrella on letter A, Auto + WC on letter B), with letterAssignments
//     inline exactly as get_master_coi would return them, and endorsement flags
//     spanning endorsed / requested / none.
//
// The synthetic doc is intentionally NOT the real form: it has no visual layout,
// just the fields, so pdf-lib fill and read-back round-trips prove the payload
// vocabulary survives a fill without needing the copyrighted artifact.

import { PDFDocument } from 'pdf-lib';
import {
  ACORD25_FIELD_MAP,
  type Acord25FieldMapEntry,
  type Acord25LogicalKey,
} from '@/lib/acord/acord25/fieldMap';
import type { Acord25BuildInput, Acord25TemplateInfo } from '@/lib/acord/acord25/types';

// ---------------------------------------------------------------------------
// Synthetic PDF builder
// ---------------------------------------------------------------------------

/**
 * Build a single-page PDF whose AcroForm carries one real field per map entry,
 * named with the EXACT committed pdfField. Text-like kinds become PDFTextField
 * (with the map's maxLength applied when present); checkbox kinds become
 * PDFCheckBox. A tiny grid of widget rectangles is laid out so pdf-lib has a
 * page annotation per field; positions are irrelevant to fill/extract.
 */
export async function buildSyntheticAcord25(
  map: Record<Acord25LogicalKey, Acord25FieldMapEntry> = ACORD25_FIELD_MAP,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter, matches the real 1-page form
  const form = doc.getForm();

  const entries = Object.values(map);

  // Guard against duplicate pdfField names (would throw inside pdf-lib): the map
  // is 1:1 logical-key -> pdfField, but be defensive so a bad map surfaces here.
  const seen = new Set<string>();

  let index = 0;
  const cols = 6;
  const cellW = 90;
  const cellH = 18;
  const originX = 10;
  const originY = 760;

  for (const entry of entries) {
    if (seen.has(entry.pdfField)) {
      continue;
    }
    seen.add(entry.pdfField);

    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = originX + col * (cellW + 2);
    const y = originY - row * (cellH + 2);
    index += 1;

    if (entry.kind === 'checkbox') {
      const cb = form.createCheckBox(entry.pdfField);
      cb.addToPage(page, { x, y, width: 12, height: 12 });
    } else {
      const tf = form.createTextField(entry.pdfField);
      if (typeof entry.maxLength === 'number' && entry.maxLength > 0) {
        tf.setMaxLength(entry.maxLength);
      }
      // Multiline for the boxes the real form multilines.
      if (entry.kind === 'multilineText') {
        tf.enableMultiline();
      }
      tf.addToPage(page, { x, y, width: cellW, height: cellH });
    }
  }

  return await doc.save();
}

// ---------------------------------------------------------------------------
// Synthetic template info (for the validator, which needs a field_inventory)
// ---------------------------------------------------------------------------

/**
 * A structural Acord25TemplateInfo derived from ACORD25_FIELD_MAP: every mapped
 * pdfField appears once, with inventory type 'checkbox' for checkbox kinds and
 * 'text' for everything else (ynText/date/limit/text/multilineText all live in
 * PDFTextField on the real form). Multiline boxes carry no maxLength; single
 * text boxes get a generous maxLength so overflow tests can opt in explicitly.
 *
 * Options let a test override a single field's type/maxLength/options to drive
 * V2/V3/V5/V7 negative paths without hand-writing a whole inventory.
 */
export function buildTemplateInfo(overrides?: {
  version?: string;
  patch?: Array<{ name: string; type?: string; maxLength?: number; options?: string[] }>;
  extraFields?: Array<{ name: string; type: string; maxLength?: number; options?: string[] }>;
}): Acord25TemplateInfo {
  const byName = new Map<string, { name: string; type: string; maxLength?: number; options?: string[] }>();

  for (const key of Object.keys(ACORD25_FIELD_MAP) as Acord25LogicalKey[]) {
    const entry = ACORD25_FIELD_MAP[key];
    const isCheckbox = entry.kind === 'checkbox';
    byName.set(entry.pdfField, {
      name: entry.pdfField,
      type: isCheckbox ? 'checkbox' : 'text',
      // Multiline boxes have no AcroForm maxLength; give single-line text a wide
      // ceiling so it never trips overflow unless a test asks for it.
      maxLength: isCheckbox || entry.kind === 'multilineText' ? undefined : 200,
    });
  }

  for (const extra of overrides?.extraFields ?? []) {
    byName.set(extra.name, extra);
  }

  for (const p of overrides?.patch ?? []) {
    const cur = byName.get(p.name);
    if (cur) {
      byName.set(p.name, {
        name: p.name,
        type: p.type ?? cur.type,
        maxLength: p.maxLength !== undefined ? p.maxLength : cur.maxLength,
        options: p.options !== undefined ? p.options : cur.options,
      });
    } else {
      byName.set(p.name, { name: p.name, type: p.type ?? 'text', maxLength: p.maxLength, options: p.options });
    }
  }

  return {
    version: overrides?.version ?? '2016-03',
    field_inventory: Array.from(byName.values()),
  };
}

// ---------------------------------------------------------------------------
// Sample build input
// ---------------------------------------------------------------------------

/**
 * A fully-populated two-carrier build input. Carrier A writes GL + Umbrella;
 * carrier B writes Auto + WC. Endorsement flags deliberately span the matrix:
 *   - GL ADDL INSD  endorsed + printIntent true   -> prints Y
 *   - GL SUBR WVD   endorsed + printIntent false  -> deliberate downgrade to N
 *   - Auto ADDL INSD requested + printIntent false -> pending warning, prints N
 *   - Auto SUBR WVD  none + printIntent false      -> prints N, no issue
 *   - Umbrella both  endorsed + true               -> prints Y
 *   - WC SUBR WVD    endorsed + true               -> prints Y (WC has no ADDL)
 *
 * Deterministic: no Date.now(), no randomness. Callers that need issue-mode
 * validity pass a holder (present here) so V8 is satisfied.
 */
export function buildSampleInput(): Acord25BuildInput {
  return {
    certificateDate: '2026-07-01',
    certificateNumber: null,
    revisionNumber: null,
    producer: {
      agencyName: 'Lewis Insurance Agency',
      addressLines: ['123 Main Street', 'Suite 400', 'Springfield, IL 62704'],
      contactName: 'Dana Producer',
      phone: '(217) 555-0100',
      fax: '(217) 555-0101',
      email: 'certs@lewisinsurance.com',
    },
    insured: {
      name: 'Acme Manufacturing LLC',
      addressLines: ['500 Industrial Park Road', 'Peoria, IL 61602'],
    },
    lines: [
      {
        line: 'gl',
        policyId: 'pol-gl-1',
        policyNumber: 'GL-0099123',
        effectiveDate: '2026-01-01',
        expirationDate: '2027-01-01',
        additionalInsured: { resolved: 'endorsed', printIntent: true },
        waiverOfSubrogation: { resolved: 'endorsed', printIntent: false },
        gl: {
          occurrence: true,
          claimsMade: false,
          aggregateAppliesPer: 'policy',
          eachOccurrence: 1000000,
          damageToRented: 100000,
          medExp: 5000,
          personalAdvInjury: 1000000,
          generalAggregate: 2000000,
          productsCompOpAgg: 2000000,
        },
      },
      {
        line: 'umbrella',
        policyId: 'pol-umb-1',
        policyNumber: 'UMB-0044777',
        effectiveDate: '2026-01-01',
        expirationDate: '2027-01-01',
        additionalInsured: { resolved: 'endorsed', printIntent: true },
        waiverOfSubrogation: { resolved: 'endorsed', printIntent: true },
        umbrella: {
          type: 'umbrella',
          basis: 'occurrence',
          dedOrRetention: { kind: 'retention', amount: 10000 },
          eachOccurrence: 5000000,
          aggregate: 5000000,
        },
      },
      {
        line: 'auto',
        policyId: 'pol-auto-1',
        policyNumber: 'AUTO-0077321',
        effectiveDate: '2026-02-15',
        expirationDate: '2027-02-15',
        additionalInsured: { resolved: 'requested', printIntent: false },
        waiverOfSubrogation: { resolved: 'none', printIntent: false },
        auto: {
          anyAuto: true,
          ownedOnly: false,
          scheduled: false,
          hired: true,
          nonOwned: true,
          combinedSingleLimit: 1000000,
          biPerPerson: null,
          biPerAccident: null,
          propertyDamage: null,
        },
      },
      {
        line: 'wc',
        policyId: 'pol-wc-1',
        policyNumber: 'WC-0011900',
        effectiveDate: '2026-03-01',
        expirationDate: '2027-03-01',
        additionalInsured: null,
        waiverOfSubrogation: { resolved: 'endorsed', printIntent: true },
        wc: {
          perStatute: true,
          other: false,
          proprietorExcluded: 'N',
          elEachAccident: 1000000,
          elDiseaseEachEmployee: 1000000,
          elDiseasePolicyLimit: 1000000,
        },
      },
    ],
    letterAssignments: [
      { letter: 'A', name: 'Acme National Insurance Co', naic: '12345', lines: ['gl', 'umbrella'] },
      { letter: 'B', name: 'Great Plains Casualty', naic: '67890', lines: ['auto', 'wc'] },
    ],
    descriptionOfOperations:
      'Certificate holder is named as additional insured with respect to general liability per the attached endorsement.',
    remarks: 'Waiver of subrogation applies where required by written contract.',
    holder: {
      name: 'City of Peoria Public Works',
      addressLines: ['419 Fulton Street', 'Peoria, IL 61602'],
    },
    authorizedRepName: 'Dana Producer',
  };
}
