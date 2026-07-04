// The single adapter from the Master COI read-model contract to the ACORD 25
// builder input (D16, R21).
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib. It DOES import types from
// src/types/master-coi.ts, which is a types-only module (no runtime code), so the
// Deno port mirrors it as supabase/functions/_shared/master-coi-types.ts and
// rewrites the import specifier there. This is the one permitted cross-directory
// import, and it is type-only.
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Sections 4.9, 4.7,
// 0.1; blueprint B Section 4.9.
//
// Rules:
// - Scalar extraction is ALWAYS cell.v; src/conf/flag never influence the printed
//   value.
// - letterAssignments are copied verbatim from the contract's insurer letter map;
//   the adapter never reorders or reassigns.
// - Endorsement flags: resolved comes from holderResolution; printIntent from
//   printIntents, defaulted to (resolved === 'endorsed'). holder null forces
//   { resolved: 'none', printIntent: false } everywhere.
// - Pure given its args; both call sites use it (client preview + Deno port).

import type {
  COICell,
  COIInsurer,
  COILineAuto,
  COILineGL,
  COILineProperty,
  COILineUmbrella,
  COILineWC,
  HolderEndorsementResolution,
  MasterCOI,
} from '../master-coi-types.ts';
import { formatLimit } from './format.ts';
import type {
  Acord25BuildInput,
  Acord25CoverageLine,
  Acord25LineKey,
  Acord25PrintFlag,
  HolderResolvedStatus,
  InsurerAssignment,
} from './types.ts';
import type { InsurerLetter } from './fieldMap.ts';

export interface FromMasterCoiArgs {
  /** From get_master_coi (src/types/master-coi.ts). */
  masterCoi: MasterCOI;
  /** The user's checkbox selection. */
  selectedLines: Acord25LineKey[];
  holder: { name: string; addressLines: string[] } | null;
  /**
   * resolve_holder_endorsements output, one row PER line (Section 4.9); null iff
   * holder null. Each row is matched to its line by line_key.
   */
  holderResolution: HolderEndorsementResolution[] | null;
  /** UI per-line toggles. */
  printIntents: Partial<Record<Acord25LineKey, { addlInsd: boolean; subrWvd: boolean }>>;
  descriptionOfOperations: string;
  remarks: string;
  certificateDate: string;
  certificateNumber?: string | null;
  authorizedRepName: string;
}

// ---------------------------------------------------------------------------
// Cell / value helpers. Scalar extraction is always cell.v.
// ---------------------------------------------------------------------------

function str(cell: COICell<string> | undefined | null): string {
  const v = cell?.v;
  return typeof v === 'string' ? v : '';
}

function num(cell: COICell<number> | undefined | null): number | null {
  const v = cell?.v;
  return typeof v === 'number' ? v : null;
}

function bool(cell: COICell<boolean> | undefined | null): boolean {
  return cell?.v === true;
}

// Display names for the OTHER row (property/other), from the 02 mapping table.
function otherDisplayLabel(line: Acord25LineKey, fallback: string): string {
  switch (line) {
    case 'property':
      return fallback && fallback.length > 0 ? fallback : 'Property';
    case 'other':
      return fallback && fallback.length > 0 ? fallback : 'Other';
    default:
      return fallback;
  }
}

// ---------------------------------------------------------------------------
// Endorsement flag resolution (Section 4.7 / 4.4).
// ---------------------------------------------------------------------------

/**
 * Build the ADDL INSD / SUBR WVD print flags for one line. `resolved` is taken
 * from the holderResolution row whose line_key matches this line; otherwise
 * 'none'. printIntent comes from printIntents, defaulted to (resolved ===
 * 'endorsed'). A null holder forces { resolved: 'none', printIntent: false }
 * everywhere. resolve_holder_endorsements returns one row PER line, so a
 * multi-line certificate resolves each line independently (Section 4.9).
 */
function resolveFlags(
  line: Acord25LineKey,
  holder: FromMasterCoiArgs['holder'],
  holderResolution: HolderEndorsementResolution[] | null,
  printIntents: FromMasterCoiArgs['printIntents'],
): { additionalInsured: Acord25PrintFlag; waiverOfSubrogation: Acord25PrintFlag } {
  if (!holder) {
    return {
      additionalInsured: { resolved: 'none', printIntent: false },
      waiverOfSubrogation: { resolved: 'none', printIntent: false },
    };
  }

  const matches =
    holderResolution?.find((r) => (r.line_key as string) === (line as string)) ?? null;

  const addlResolved: HolderResolvedStatus = matches ? matches.addl_insd_resolved : 'none';
  const subrResolved: HolderResolvedStatus = matches ? matches.subr_wvd_resolved : 'none';

  const intent = printIntents[line];
  const addlIntent = intent ? intent.addlInsd : addlResolved === 'endorsed';
  const subrIntent = intent ? intent.subrWvd : subrResolved === 'endorsed';

  return {
    additionalInsured: { resolved: addlResolved, printIntent: addlIntent },
    waiverOfSubrogation: { resolved: subrResolved, printIntent: subrIntent },
  };
}

// ---------------------------------------------------------------------------
// Per-line builders.
// ---------------------------------------------------------------------------

function buildGL(
  gl: COILineGL,
  flags: ReturnType<typeof resolveFlags>,
): Acord25CoverageLine {
  const occ = str(gl.occurrence_or_claims_made).toLowerCase();
  const agg = str(gl.aggregate_applies_per).toLowerCase();
  const aggregateAppliesPer =
    agg === 'policy' || agg === 'project' || agg === 'location'
      ? (agg as 'policy' | 'project' | 'location')
      : null;
  return {
    line: 'gl',
    policyId: gl.policy_id ?? '',
    policyNumber: str(gl.policy_number),
    effectiveDate: str(gl.effective_date),
    expirationDate: str(gl.expiration_date),
    additionalInsured: flags.additionalInsured,
    waiverOfSubrogation: flags.waiverOfSubrogation,
    gl: {
      occurrence: occ === 'occurrence' || occ === 'occur',
      claimsMade: occ === 'claims_made' || occ === 'claims-made' || occ === 'claimsmade',
      aggregateAppliesPer,
      eachOccurrence: num(gl.limits.each_occurrence),
      damageToRented: num(gl.limits.damage_to_rented_premises),
      medExp: num(gl.limits.medical_expense),
      personalAdvInjury: num(gl.limits.personal_advertising_injury),
      generalAggregate: num(gl.limits.general_aggregate),
      productsCompOpAgg: num(gl.limits.products_completed_ops_aggregate),
    },
  };
}

function buildAuto(
  auto: COILineAuto,
  flags: ReturnType<typeof resolveFlags>,
): Acord25CoverageLine {
  return {
    line: 'auto',
    policyId: auto.policy_id ?? '',
    policyNumber: str(auto.policy_number),
    effectiveDate: str(auto.effective_date),
    expirationDate: str(auto.expiration_date),
    additionalInsured: flags.additionalInsured,
    waiverOfSubrogation: flags.waiverOfSubrogation,
    auto: {
      anyAuto: bool(auto.checkboxes.any_auto),
      ownedOnly: bool(auto.checkboxes.owned_autos),
      scheduled: bool(auto.checkboxes.scheduled_autos),
      hired: bool(auto.checkboxes.hired_autos),
      nonOwned: bool(auto.checkboxes.non_owned_autos),
      combinedSingleLimit: num(auto.csl),
      biPerPerson: num(auto.bi_per_person),
      biPerAccident: num(auto.bi_per_accident),
      propertyDamage: num(auto.pd_per_accident),
    },
  };
}

function buildUmbrella(
  umb: COILineUmbrella,
  flags: ReturnType<typeof resolveFlags>,
): Acord25CoverageLine {
  const kindStr = str(umb.umbrella_or_excess).toLowerCase();
  const type: 'umbrella' | 'excess' = kindStr === 'excess' ? 'excess' : 'umbrella';
  const basisStr = str(umb.occurrence_or_claims_made).toLowerCase();
  const basis: 'occurrence' | 'claims_made' =
    basisStr === 'claims_made' || basisStr === 'claims-made' || basisStr === 'claimsmade'
      ? 'claims_made'
      : 'occurrence';
  const drKind = str(umb.ded_or_retention.kind).toLowerCase();
  const drAmount = num(umb.ded_or_retention.amount);
  const dedOrRetention =
    drAmount !== null && (drKind === 'ded' || drKind === 'deductible' || drKind === 'retention')
      ? {
          kind: (drKind === 'retention' ? 'retention' : 'ded') as 'ded' | 'retention',
          amount: drAmount,
        }
      : null;
  return {
    line: 'umbrella',
    policyId: umb.policy_id ?? '',
    policyNumber: str(umb.policy_number),
    effectiveDate: str(umb.effective_date),
    expirationDate: str(umb.expiration_date),
    additionalInsured: flags.additionalInsured,
    waiverOfSubrogation: flags.waiverOfSubrogation,
    umbrella: {
      type,
      basis,
      dedOrRetention,
      eachOccurrence: num(umb.each_occurrence),
      aggregate: num(umb.aggregate),
    },
  };
}

function buildWC(wc: COILineWC, flags: ReturnType<typeof resolveFlags>): Acord25CoverageLine {
  const excluded = wc.proprietor_excluded?.v;
  const proprietorExcluded: 'Y' | 'N' | null =
    excluded === true ? 'Y' : excluded === false ? 'N' : null;
  return {
    line: 'wc',
    policyId: wc.policy_id ?? '',
    policyNumber: str(wc.policy_number),
    effectiveDate: str(wc.effective_date),
    expirationDate: str(wc.expiration_date),
    // WC has no ADDL INSD column on the 25.
    additionalInsured: null,
    waiverOfSubrogation: flags.waiverOfSubrogation,
    wc: {
      perStatute: bool(wc.per_statute),
      other: false,
      proprietorExcluded,
      elEachAccident: num(wc.el_each_accident),
      elDiseaseEachEmployee: num(wc.el_disease_each_employee),
      elDiseasePolicyLimit: num(wc.el_disease_policy_limit),
    },
  };
}

function buildProperty(
  prop: COILineProperty,
  flags: ReturnType<typeof resolveFlags>,
): Acord25CoverageLine {
  const label = otherDisplayLabel('property', str(prop.label));
  const limitAmount = num(prop.limit_amount);
  const limitDesc = str(prop.limit_description);
  const parts: string[] = [];
  if (limitDesc.length > 0 && limitAmount !== null) {
    parts.push(`${limitDesc} $${formatLimit(limitAmount)}`);
  } else if (limitAmount !== null) {
    parts.push(`$${formatLimit(limitAmount)}`);
  } else if (limitDesc.length > 0) {
    parts.push(limitDesc);
  }
  return {
    line: 'property',
    policyId: prop.policy_id ?? '',
    policyNumber: str(prop.policy_number),
    effectiveDate: str(prop.effective_date),
    expirationDate: str(prop.expiration_date),
    additionalInsured: flags.additionalInsured,
    waiverOfSubrogation: flags.waiverOfSubrogation,
    otherRow: { typeLabel: label, limitsText: parts.join('; ') },
  };
}

// ---------------------------------------------------------------------------
// Letter assignment mapping (verbatim from the contract insurer letter map).
// ---------------------------------------------------------------------------

function toLetterAssignments(insurers: COIInsurer[]): InsurerAssignment[] {
  const out: InsurerAssignment[] = [];
  for (const ins of insurers) {
    out.push({
      letter: ins.letter as InsurerLetter,
      name: str(ins.name),
      naic: ins.naic?.v !== null && ins.naic?.v !== undefined ? String(ins.naic.v) : null,
      lines: (ins.lines ?? []).filter((l): l is Acord25LineKey =>
        l === 'gl' ||
        l === 'auto' ||
        l === 'umbrella' ||
        l === 'wc' ||
        l === 'property' ||
        l === 'other',
      ),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The adapter.
// ---------------------------------------------------------------------------

export function toAcord25BuildInput(args: FromMasterCoiArgs): Acord25BuildInput {
  const mc = args.masterCoi;

  // Producer block from the contract's producer projection.
  const producer = {
    agencyName: str(mc.producer.name),
    addressLines: composeAddress(
      str(mc.producer.address_line1),
      str(mc.producer.address_line2),
      str(mc.producer.city),
      str(mc.producer.state),
      str(mc.producer.zip),
    ),
    contactName: str(mc.producer.contact_name),
    phone: str(mc.producer.phone),
    fax: str(mc.producer.fax),
    email: str(mc.producer.email),
  };

  // Insured block from the contract's named-insured projection.
  const insured = {
    name: str(mc.named_insured.name),
    addressLines: composeAddress(
      str(mc.named_insured.address_line1),
      str(mc.named_insured.address_line2),
      str(mc.named_insured.city),
      str(mc.named_insured.state),
      str(mc.named_insured.zip),
    ),
  };

  // `other` is the 02 data layer's informational bucket, not a printable line.
  // get_master_coi surfaces unclassified policies under lines.other[] (a
  // COILineOtherEntry[] with no printable limit or label) solely so staff can
  // reclassify them; 02 Section 2.6 declares `other` "not printed by default" and
  // the letter algorithm excludes it from the insurer table
  // (20260702172000_master_coi_rpcs.sql:1001 "other excluded from the insurer
  // table"), so a real MasterCOI never carries `other` in insurers[].lines. The
  // ACORD 25 OTHER row is filled only by `property` (buildProperty) here.
  //
  // The public Acord25LineKey[] contract still admits 'other', so drop it from the
  // working selection up front: this makes the letterAssignments reduction below
  // provably unable to retain an `other`-only (orphan) assignment even against a
  // hand-built caller or a future data-source regression, and it keeps the
  // "no coverage line for 'other'" behavior explicit rather than incidental. If a
  // later data-layer change ever makes `other` a printable singular line, add a
  // buildOther() beside buildProperty and stop deleting it here.
  const selected = new Set(args.selectedLines);
  selected.delete('other');
  const lines: Acord25CoverageLine[] = [];

  // Canonical line order gl, auto, umbrella, wc, property, other.
  if (selected.has('gl') && mc.lines.gl.present) {
    lines.push(buildGL(mc.lines.gl, resolveFlags('gl', args.holder, args.holderResolution, args.printIntents)));
  }
  if (selected.has('auto') && mc.lines.auto.present) {
    lines.push(buildAuto(mc.lines.auto, resolveFlags('auto', args.holder, args.holderResolution, args.printIntents)));
  }
  if (selected.has('umbrella') && mc.lines.umbrella.present) {
    lines.push(
      buildUmbrella(mc.lines.umbrella, resolveFlags('umbrella', args.holder, args.holderResolution, args.printIntents)),
    );
  }
  if (selected.has('wc') && mc.lines.wc.present) {
    lines.push(buildWC(mc.lines.wc, resolveFlags('wc', args.holder, args.holderResolution, args.printIntents)));
  }
  if (selected.has('property') && mc.lines.property.present) {
    lines.push(
      buildProperty(mc.lines.property, resolveFlags('property', args.holder, args.holderResolution, args.printIntents)),
    );
  }

  // letterAssignments copied verbatim from the contract, reduced to selected lines.
  const letterAssignments = toLetterAssignments(mc.insurers)
    .map((a) => ({ ...a, lines: a.lines.filter((l) => selected.has(l)) }))
    .filter((a) => a.lines.length > 0);

  return {
    certificateDate: args.certificateDate,
    certificateNumber: args.certificateNumber ?? null,
    revisionNumber: null,
    producer,
    insured,
    lines,
    letterAssignments,
    descriptionOfOperations: args.descriptionOfOperations,
    remarks: args.remarks,
    holder: args.holder,
    authorizedRepName: args.authorizedRepName,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compose split producer/insured address fields into the addressLines[] array the
 * builder redistributes. Emits [line1, (line2), "City, ST ZIP"] with empty pieces
 * dropped, so the builder's parseCityStateZip re-splits it deterministically.
 */
function composeAddress(
  line1: string,
  line2: string,
  city: string,
  state: string,
  zip: string,
): string[] {
  const out: string[] = [];
  if (line1.trim().length > 0) {
    out.push(line1.trim());
  }
  if (line2.trim().length > 0) {
    out.push(line2.trim());
  }
  const cityState = [city.trim(), state.trim()].filter((s) => s.length > 0).join(', ');
  const tail = [cityState, zip.trim()].filter((s) => s.length > 0).join(' ');
  if (tail.length > 0) {
    out.push(tail);
  }
  return out;
}
