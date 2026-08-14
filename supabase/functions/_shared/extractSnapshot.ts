/**
 * ExtractSnapshotV1 normalization (Deno port).
 * Keep in sync with src/lib/extractSnapshot.ts normalize logic.
 */

export const EXTRACT_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type ExtractSnapshotFeeType =
  | 'tax'
  | 'broker'
  | 'surplus_lines'
  | 'nima'
  | 'other';

export interface ExtractSnapshotPremium {
  total: number | null;
  frequency: string | null;
}

export interface ExtractSnapshotFee {
  type: ExtractSnapshotFeeType;
  amount: number | null;
  label?: string;
}

export interface ExtractSnapshotCommission {
  percent: number | null;
  amount: number | null;
}

export interface ExtractSnapshotCoverage {
  name: string;
  limit: string | null;
  deductible: string | null;
  premium: number | string | null;
  parent_coverage: string | null;
}

export interface ExtractSnapshotLocation {
  address: string | null;
  occupancy: string | null;
}

export interface ExtractSnapshotVehicle {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
}

export interface ExtractSnapshotDriver {
  name?: string | null;
  date_of_birth?: string | null;
  license_number?: string | null;
  license_state?: string | null;
}

export interface ExtractSnapshotV1 {
  schema_version: typeof EXTRACT_SNAPSHOT_SCHEMA_VERSION;
  insured_name: string | null;
  carriers: string[];
  effective_date: string | null;
  expiration_date: string | null;
  claims_made: boolean | null;
  defense_inside_limits: boolean | null;
  premium: ExtractSnapshotPremium;
  fees: ExtractSnapshotFee[];
  commission: ExtractSnapshotCommission | null;
  coverages: ExtractSnapshotCoverage[];
  locations: ExtractSnapshotLocation[];
  vehicles: ExtractSnapshotVehicle[];
  drivers: ExtractSnapshotDriver[];
  document_type: string | null;
  policy_number: string | null;
  key_details: string[];
  overflow?: Record<string, unknown>;
}

const KNOWN_KEYS = new Set([
  'schema_version',
  'insured_name',
  'carriers',
  'carrier',
  'effective_date',
  'expiration_date',
  'claims_made',
  'defense_inside_limits',
  'premium',
  'fees',
  'commission',
  'coverages',
  'locations',
  'property',
  'vehicles',
  'drivers',
  'document_type',
  'policy_number',
  'key_details',
  'overflow',
  'raw_response',
]);

const FEE_TYPE_ALIASES: Array<{ pattern: RegExp; type: ExtractSnapshotFeeType }> = [
  { pattern: /surplus\s*lines/i, type: 'surplus_lines' },
  { pattern: /\bnima\b/i, type: 'nima' },
  { pattern: /broker/i, type: 'broker' },
  { pattern: /tax/i, type: 'tax' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function asBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (['true', 'yes', 'y', '1'].includes(lower)) return true;
    if (['false', 'no', 'n', '0'].includes(lower)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceFeeType(raw: unknown): ExtractSnapshotFeeType {
  const s = asString(raw) ?? 'other';
  for (const { pattern, type } of FEE_TYPE_ALIASES) {
    if (pattern.test(s)) return type;
  }
  const normalized = s.toLowerCase().replace(/[\s-]+/g, '_');
  if (
    normalized === 'tax' ||
    normalized === 'broker' ||
    normalized === 'surplus_lines' ||
    normalized === 'nima'
  ) {
    return normalized as ExtractSnapshotFeeType;
  }
  return 'other';
}

function detectParentCoverage(
  name: string | null,
  limit: string | null,
  deductible: string | null,
  explicit: unknown,
): string | null {
  const fromExplicit = asString(explicit);
  if (fromExplicit) return fromExplicit;

  const sources = [name, limit, deductible].filter(Boolean) as string[];
  for (const text of sources) {
    const match = /\bincluded\s+in\s+(.+?)(?:\.|$|\)|,)/i.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function stripIncludedNote(text: string | null): string | null {
  if (!text) return text;
  return text.replace(/\s*\(?\s*included\s+in\s+.+?\)?\s*$/i, '').trim() || null;
}

function normalizeCarriers(raw: Record<string, unknown>): string[] {
  const fromArray = Array.isArray(raw.carriers)
    ? raw.carriers.map(asString).filter((c): c is string => c !== null)
    : [];
  if (fromArray.length > 0) return fromArray;

  const legacy = asString(raw.carrier);
  return legacy ? [legacy] : [];
}

function normalizePremium(raw: unknown): ExtractSnapshotPremium {
  if (!isRecord(raw)) {
    return { total: parseNumber(raw), frequency: null };
  }
  return {
    total: parseNumber(raw.total),
    frequency: asString(raw.frequency),
  };
}

function normalizeFees(raw: unknown): ExtractSnapshotFee[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((fee) => ({
      type: coerceFeeType(fee.type ?? fee.label ?? fee.name),
      amount: parseNumber(fee.amount),
      ...(asString(fee.label) ? { label: asString(fee.label)! } : {}),
    }));
}

function normalizeCommission(raw: unknown): ExtractSnapshotCommission | null {
  if (!isRecord(raw)) return null;
  const percent = parseNumber(raw.percent);
  const amount = parseNumber(raw.amount);
  if (percent === null && amount === null) return null;
  return { percent, amount };
}

function normalizeCoverages(raw: unknown): ExtractSnapshotCoverage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((cov) => {
      const name = asString(cov.name) ?? 'Unknown coverage';
      const limit = asString(cov.limit);
      const deductible = asString(cov.deductible);
      const parent = detectParentCoverage(
        name,
        limit,
        deductible,
        cov.parent_coverage,
      );
      return {
        name: stripIncludedNote(name) ?? name,
        limit: stripIncludedNote(limit),
        deductible: stripIncludedNote(deductible),
        premium: cov.premium !== undefined && cov.premium !== null && cov.premium !== ''
          ? (parseNumber(cov.premium) ?? asString(cov.premium))
          : null,
        parent_coverage: parent,
      };
    });
}

function normalizeLocations(raw: Record<string, unknown>): ExtractSnapshotLocation[] {
  if (Array.isArray(raw.locations)) {
    return raw.locations
      .filter(isRecord)
      .map((loc) => ({
        address: asString(loc.address),
        occupancy: asString(loc.occupancy ?? loc.type),
      }));
  }

  if (isRecord(raw.property)) {
    return [
      {
        address: asString(raw.property.address),
        occupancy: asString(raw.property.type ?? raw.property.occupancy),
      },
    ];
  }

  return [];
}

function normalizeVehicles(raw: unknown): ExtractSnapshotVehicle[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((v) => ({
    year: v.year ?? null,
    make: asString(v.make),
    model: asString(v.model),
    vin: asString(v.vin),
  }));
}

function normalizeDrivers(raw: unknown): ExtractSnapshotDriver[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).map((d) => ({
    name: asString(d.name),
    date_of_birth: asString(d.date_of_birth),
    license_number: asString(d.license_number),
    license_state: asString(d.license_state),
  }));
}

function normalizeKeyDetails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d) => String(d)).filter((s) => s.trim().length > 0);
}

function collectOverflow(
  raw: Record<string, unknown>,
  existing?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const overflow: Record<string, unknown> = { ...existing };

  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      overflow[key] = value;
    }
  }

  return Object.keys(overflow).length > 0 ? overflow : undefined;
}

function emptySnapshot(): ExtractSnapshotV1 {
  return {
    schema_version: EXTRACT_SNAPSHOT_SCHEMA_VERSION,
    insured_name: null,
    carriers: [],
    effective_date: null,
    expiration_date: null,
    claims_made: null,
    defense_inside_limits: null,
    premium: { total: null, frequency: null },
    fees: [],
    commission: null,
    coverages: [],
    locations: [],
    vehicles: [],
    drivers: [],
    document_type: null,
    policy_number: null,
    key_details: [],
  };
}

export function normalizeExtractSnapshot(raw: unknown): ExtractSnapshotV1 {
  if (!isRecord(raw)) {
    return emptySnapshot();
  }

  const priorOverflow = isRecord(raw.overflow) ? { ...raw.overflow } : undefined;
  let overflow = collectOverflow(raw, priorOverflow);

  if (raw.raw_response !== undefined && raw.raw_response !== null) {
    overflow = { ...(overflow ?? {}), raw_response: raw.raw_response };
  }

  return {
    schema_version: EXTRACT_SNAPSHOT_SCHEMA_VERSION,
    insured_name: asString(raw.insured_name),
    carriers: normalizeCarriers(raw),
    effective_date: asString(raw.effective_date),
    expiration_date: asString(raw.expiration_date),
    claims_made: asBoolean(raw.claims_made),
    defense_inside_limits: asBoolean(raw.defense_inside_limits),
    premium: normalizePremium(raw.premium),
    fees: normalizeFees(raw.fees),
    commission: normalizeCommission(raw.commission),
    coverages: normalizeCoverages(raw.coverages),
    locations: normalizeLocations(raw),
    vehicles: normalizeVehicles(raw.vehicles),
    drivers: normalizeDrivers(raw.drivers),
    document_type: asString(raw.document_type),
    policy_number: asString(raw.policy_number),
    key_details: normalizeKeyDetails(raw.key_details),
    ...(overflow ? { overflow } : {}),
  };
}

export function readExtractSnapshot(raw: unknown): ExtractSnapshotV1 {
  return normalizeExtractSnapshot(raw);
}
