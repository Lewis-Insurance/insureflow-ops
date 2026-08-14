/**
 * ExtractSnapshotV1 - canonical contract for document analysis extraction.
 * Single reader for legacy Azure/simple JSON and versioned V1 snapshots.
 */

import { maskDln, maskDob, maskTaxId } from '@/components/cc/mask';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

/** @deprecated Legacy raw input only - use carriers[] in V1 output */
export interface LegacyExtractRaw {
  carrier?: string;
  property?: { type?: string; address?: string };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Known field keys (consumed during normalization; not placed in overflow)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// PII masking
// ---------------------------------------------------------------------------

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const DLN_PATTERN = /\b(?:DL|D\.?L\.?|LIC(?:ENSE)?#?)\s*[:#]?\s*([A-Z0-9-]{5,15})\b/gi;

export function maskStringForDisplay(value: string): string {
  let result = value.replace(SSN_PATTERN, (match) => maskTaxId(match));
  result = result.replace(DOB_PATTERN, (match) => maskDob(match));
  result = result.replace(DLN_PATTERN, (_match, license: string) => {
    const masked = maskDln(license);
    return `DL ${masked}`;
  });
  return result;
}

function maskNullableString(value: string | null): string | null {
  if (!value) return value;
  return maskStringForDisplay(value);
}

/** Recursively mask PII in unknown overflow values for safe display. */
function maskUnknownForDisplay(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return maskStringForDisplay(value);
  if (Array.isArray(value)) return value.map(maskUnknownForDisplay);
  if (isRecord(value)) {
    const masked: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      masked[key] = maskUnknownForDisplay(val);
    }
    return masked;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps legacy simple/azure JSON into ExtractSnapshotV1.
 * Unknown keys are preserved in overflow, never dropped.
 */
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

/** Validate + normalize entry point for UI and edge persistence. */
export function readExtractSnapshot(raw: unknown): ExtractSnapshotV1 {
  return normalizeExtractSnapshot(raw);
}

/**
 * Guards against treating pathological overflow as a complete book.
 * Returns false when overflow has >= 1000 keys or key_details has >= 1000 items.
 */
export function isExtractSnapshotComplete(snapshot: ExtractSnapshotV1): boolean {
  const overflowCount = snapshot.overflow ? Object.keys(snapshot.overflow).length : 0;
  if (overflowCount >= 1000) return false;
  if (snapshot.key_details.length >= 1000) return false;
  return true;
}

/** Mask SSN/DOB/DLN in all string fields for safe display. */
export function maskSnapshotForDisplay(snapshot: ExtractSnapshotV1): ExtractSnapshotV1 {
  return {
    ...snapshot,
    insured_name: maskNullableString(snapshot.insured_name),
    carriers: snapshot.carriers.map((c) => maskStringForDisplay(c)),
    effective_date: snapshot.effective_date,
    expiration_date: snapshot.expiration_date,
    premium: {
      ...snapshot.premium,
      frequency: maskNullableString(snapshot.premium.frequency),
    },
    fees: snapshot.fees.map((fee) => ({
      ...fee,
      label: fee.label ? maskStringForDisplay(fee.label) : undefined,
    })),
    coverages: snapshot.coverages.map((cov) => ({
      ...cov,
      name: maskStringForDisplay(cov.name),
      limit: maskNullableString(cov.limit),
      deductible: maskNullableString(cov.deductible),
      parent_coverage: maskNullableString(cov.parent_coverage),
      premium:
        typeof cov.premium === 'string'
          ? maskStringForDisplay(cov.premium)
          : cov.premium,
    })),
    locations: snapshot.locations.map((loc) => ({
      address: maskNullableString(loc.address),
      occupancy: maskNullableString(loc.occupancy),
    })),
    vehicles: snapshot.vehicles.map((v) => ({
      ...v,
      make: maskNullableString(v.make ?? null),
      model: maskNullableString(v.model ?? null),
      vin: v.vin ? maskDln(v.vin) : null,
    })),
    drivers: snapshot.drivers.map((d) => ({
      ...d,
      name: maskNullableString(d.name ?? null),
      date_of_birth: d.date_of_birth ? maskDob(d.date_of_birth) : null,
      license_number: d.license_number ? maskDln(d.license_number) : null,
      license_state: maskNullableString(d.license_state ?? null),
    })),
    document_type: maskNullableString(snapshot.document_type),
    policy_number: maskNullableString(snapshot.policy_number),
    key_details: snapshot.key_details.map((d) => maskStringForDisplay(d)),
    ...(snapshot.overflow
      ? { overflow: maskUnknownForDisplay(snapshot.overflow) as Record<string, unknown> }
      : {}),
  };
}
