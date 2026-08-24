import {
  maskStringForDisplay,
  type ExtractSnapshotFee,
  type ExtractSnapshotV1,
} from '@/lib/extractSnapshot';
import type { QuoteIncumbentDiffResult } from '@/lib/quoteIncumbent/diffQuoteIncumbent';

export const CLIENT_ENGLISH_PACK_VERSION = 1 as const;

export interface ClientEnglishPackMeta {
  insuredName?: string | null;
  agencyName: string;
  agencyPhone: string | null;
}

export interface ClientEnglishPackCoverage {
  name: string;
  limit: string | null;
  deductible: string | null;
  premium: string | null;
  includedWith: string | null;
}

export interface ClientEnglishPackFee {
  label: string;
  amount: number | null;
}

export interface ClientEnglishPackChange {
  label: string;
  oldValue: string;
  newValue: string;
}

export interface ClientEnglishPackVehicle {
  year: string | null;
  make: string | null;
  model: string | null;
}

export interface ClientEnglishPackV1 {
  schemaVersion: typeof CLIENT_ENGLISH_PACK_VERSION;
  insuredName: string | null;
  carriers: string[];
  policyNumber: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  coverages: ClientEnglishPackCoverage[];
  vehicles: ClientEnglishPackVehicle[];
  premium: { total: number | null; frequency: string | null };
  fees: ClientEnglishPackFee[];
  computedTotal: number | null;
  flags: string[];
  changes: ClientEnglishPackChange[];
  keyDetails: string[];
  agency: { name: string; phone: string | null };
  disclaimer: string;
}

export const CLIENT_ENGLISH_PACK_DISCLAIMER =
  'Based on the documents on file with your agency. For current billing and claims status, contact your carrier.';

const SENSITIVE_DETAIL_PATTERNS = [
  /\b(?:ssn|social\s+security)\b/i,
  /\b(?:account|acct)\b/i,
  /\b(?:vin|vehicle\s+identification\s+number)\b/i,
  /\b(?:dob|date\s+of\s+birth|birth\s*date)\b/i,
  /\b(?:dln|driver'?s?\s+license|licen[cs]e\s*(?:number|no\.?|#))\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/,
  /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/,
  /\b[A-HJ-NPR-Z0-9]{17}\b/i,
];

function safe(value: string | null | undefined): string | null {
  return value ? maskStringForDisplay(value) : null;
}

function feeLabel(type: ExtractSnapshotFee): string {
  switch (type.type) {
    case 'tax': return 'Tax';
    case 'broker': return 'Broker fee';
    case 'surplus_lines': return 'Surplus lines tax';
    case 'nima': return 'NIMA fee';
    case 'other': return safe(type.label) ?? 'Fee';
  }
}

function premiumText(value: number | string | null): string | null {
  if (value === null) return null;
  return typeof value === 'number' ? String(value) : safe(value);
}

function buildFlags(snapshot: ExtractSnapshotV1): string[] {
  const flags: string[] = [];
  if (snapshot.claims_made === true) {
    flags.push('This policy is claims made. It covers claims filed while the policy is active.');
  } else if (snapshot.claims_made === false) {
    flags.push('This policy is occurrence based. It covers incidents that happen during the policy period, even if the claim comes later.');
  }
  if (snapshot.defense_inside_limits === true) {
    flags.push('Defense costs come out of your coverage limit.');
  } else if (snapshot.defense_inside_limits === false) {
    flags.push('Defense costs are paid in addition to your coverage limit.');
  }
  return flags;
}

function buildChanges(delta?: QuoteIncumbentDiffResult): ClientEnglishPackChange[] {
  if (!delta) return [];
  return [...delta.materialDifferences]
    .sort((a, b) => {
      const aPremium = a.category === 'premium' || /premium/i.test(a.fieldPath) ? 0 : 1;
      const bPremium = b.category === 'premium' || /premium/i.test(b.fieldPath) ? 0 : 1;
      return aPremium - bPremium;
    })
    .slice(0, 6)
    .map((difference) => ({
      label: safe(difference.label) ?? 'Coverage detail',
      oldValue: safe(difference.leftValueDisplay) ?? 'Not listed',
      newValue: safe(difference.rightValueDisplay) ?? 'Not listed',
    }));
}

function buildCoverages(snapshot: ExtractSnapshotV1): ClientEnglishPackCoverage[] {
  const mapped = snapshot.coverages.map((coverage) => ({
    name: safe(coverage.name) ?? 'Coverage',
    limit: safe(coverage.limit),
    deductible: safe(coverage.deductible),
    premium: premiumText(coverage.premium),
    includedWith: safe(coverage.parent_coverage),
  }));
  const parents = mapped.filter((coverage) => coverage.includedWith === null);
  const matchedChildren = new Set<ClientEnglishPackCoverage>();
  const ordered: ClientEnglishPackCoverage[] = [];

  for (const parent of parents) {
    ordered.push(parent);
    for (const child of mapped) {
      if (!matchedChildren.has(child) && child.includedWith === parent.name) {
        ordered.push(child);
        matchedChildren.add(child);
      }
    }
  }
  for (const coverage of mapped) {
    if (coverage.includedWith !== null && !matchedChildren.has(coverage)) ordered.push(coverage);
  }
  return ordered;
}

export function buildClientEnglishPack(
  snapshot: ExtractSnapshotV1,
  delta: QuoteIncumbentDiffResult | undefined,
  meta: ClientEnglishPackMeta,
): ClientEnglishPackV1 {
  const fees = snapshot.fees.map((fee) => ({ label: feeLabel(fee), amount: fee.amount }));
  const canComputeTotal = snapshot.premium.total !== null && fees.every((fee) => fee.amount !== null);

  return {
    schemaVersion: CLIENT_ENGLISH_PACK_VERSION,
    insuredName: safe(meta.insuredName ?? snapshot.insured_name),
    carriers: snapshot.carriers.map((carrier) => safe(carrier)).filter((carrier): carrier is string => carrier !== null),
    policyNumber: safe(snapshot.policy_number),
    effectiveDate: safe(snapshot.effective_date),
    expirationDate: safe(snapshot.expiration_date),
    coverages: buildCoverages(snapshot),
    vehicles: snapshot.vehicles.map((vehicle) => ({
      year: vehicle.year === null || vehicle.year === undefined ? null : safe(String(vehicle.year)),
      make: safe(vehicle.make),
      model: safe(vehicle.model),
    })),
    premium: { total: snapshot.premium.total, frequency: safe(snapshot.premium.frequency) },
    fees,
    computedTotal: canComputeTotal
      ? snapshot.premium.total! + fees.reduce((total, fee) => total + fee.amount!, 0)
      : null,
    flags: buildFlags(snapshot),
    changes: buildChanges(delta),
    keyDetails: snapshot.key_details
      .filter((detail) => !SENSITIVE_DETAIL_PATTERNS.some((pattern) => pattern.test(detail)))
      .map(maskStringForDisplay),
    agency: { name: safe(meta.agencyName) ?? 'Your agency', phone: safe(meta.agencyPhone) },
    disclaimer: CLIENT_ENGLISH_PACK_DISCLAIMER,
  };
}
