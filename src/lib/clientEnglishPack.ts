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

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/;
const LABELED_SSN_PATTERN = /\b(?:ssn|social\s+security(?:\s+number)?)\b\s*[:#-]?\s*(?:\d{9}|\d{3}[ -]\d{2}[ -]\d{4})\b/i;
const LABELED_DOB_PATTERN = /\b(?:dob|date\s+of\s+birth|birth\s*date)\b\s*[:#-]?\s*(?:(?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+(?:19|20)\d{2})\b/i;
const LABELED_DLN_PATTERN = /\b(?:dln|d\.?l\.?|driver'?s?\s+licen[cs]e|licen[cs]e\s*(?:number|no\.?|#))(?=\s|[:#-])(?:\s+(?:number|no\.?))?\s*[:#-]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,19}\b/i;
const LABELED_VIN_PATTERN = /\b(?:vin|vehicle\s+identification\s+number)\b\s*[:#-]?\s*[A-HJ-NPR-Z0-9]{17}\b/i;
const LABELED_ACCOUNT_NUMBER_PATTERN = /\b(?:(?:(?:bank|agency)\s+)?(?:account|acct)\s+(?:number|no\.?|#)\s*[:#-]?\s*|(?:account|acct)\s*[:#]\s*|(?:bank|agency)\s+(?:account|acct)\s+)(?!(?:19|20)\d{2}-\d{2}-\d{2}\b)(?:(?:\d[ -]?){4,20}|(?=[A-Z0-9-]{4,25}\b)(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,24})\b/i;
const VIN_TOKEN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const ISO_DATE_PATTERN = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g;

const VIN_TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function isValidVin(value: string): boolean {
  const normalized = value.toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) return false;
  const sum = [...normalized].reduce((total, character, index) => {
    const numericValue = /\d/.test(character) ? Number(character) : VIN_TRANSLITERATION[character];
    return total + numericValue * VIN_WEIGHTS[index];
  }, 0);
  const checkDigit = sum % 11 === 10 ? 'X' : String(sum % 11);
  return normalized[8] === checkDigit;
}

function containsSensitiveDetail(value: string): boolean {
  if (
    SSN_PATTERN.test(value)
    || LABELED_SSN_PATTERN.test(value)
    || LABELED_DOB_PATTERN.test(value)
    || LABELED_DLN_PATTERN.test(value)
    || LABELED_VIN_PATTERN.test(value)
    || LABELED_ACCOUNT_NUMBER_PATTERN.test(value)
  ) return true;
  return [...value.matchAll(VIN_TOKEN_PATTERN)].some((match) => isValidVin(match[0]));
}

function maskKeyDetailForDisplay(value: string): string {
  const protectedSegments: string[] = [];
  let marker = '\uE000';
  while (value.includes(marker)) marker += '\uE000';
  const protectedValue = value
    .replace(ISO_DATE_PATTERN, (date) => `${marker}${protectedSegments.push(date) - 1}${marker}`)
    .replace(/\blicen[cs]e\b/gi, (license) => `${marker}${protectedSegments.push(license) - 1}${marker}`);
  return protectedSegments.reduce(
    (result, segment, index) => result.split(`${marker}${index}${marker}`).join(segment),
    maskStringForDisplay(protectedValue),
  );
}

function formatPolicyDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

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
    effectiveDate: formatPolicyDate(snapshot.effective_date),
    expirationDate: formatPolicyDate(snapshot.expiration_date),
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
      .filter((detail) => !containsSensitiveDetail(detail))
      .map(maskKeyDetailForDisplay),
    agency: { name: safe(meta.agencyName) ?? 'Your agency', phone: safe(meta.agencyPhone) },
    disclaimer: CLIENT_ENGLISH_PACK_DISCLAIMER,
  };
}
