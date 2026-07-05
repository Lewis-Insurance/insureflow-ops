// ============================================================================
// VIN DECODE (Commercial Lines SOW v3, Phase 6 Business Auto)
// ============================================================================
// NHTSA vPIC decode for the fleet editor: one click fills year / make /
// model / body type / vehicle type / GVWR from the VIN. Free public API, no
// key, CORS-enabled; only the VIN is sent (no PII). The parse helpers are
// pure and unit-tested; the fetch wrapper is thin.
//
// vPIC returns strings for everything, with '' or 'Not Applicable' for
// unknowns, and GVWR as a CLASS LABEL ("Class 2E: 6,001 - 7,000 lb ...") -
// parseGvwrPounds extracts the upper pound bound (the underwriting-relevant
// number for radius/class rating); no match decodes to null rather than a
// guess.
// ============================================================================

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

/** 17 chars, alphanumeric, never I/O/Q (the VIN alphabet since 1981). */
export function isLikelyVin(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(raw.trim());
}

/** vPIC empty vocabulary -> null; everything else trimmed through. */
export function normalizeVinValue(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || /^not applicable$/i.test(t)) return null;
  return t;
}

/**
 * Extract the upper pound bound from a vPIC GVWR class label.
 * "Class 2E: 6,001 - 7,000 lb (2,722 - 3,175 kg)" -> 7000
 * "Class 8: 33,001 lb and above"                  -> 33001
 */
export function parseGvwrPounds(gvwrClass: string | null | undefined): number | null {
  if (!gvwrClass) return null;
  // All "N lb" figures in the label; the last one before any metric
  // parenthetical is the upper (or only) pound bound.
  const poundsSection = gvwrClass.split('(')[0];
  const matches = poundsSection.match(/[\d,]+(?=\s*lb)/gi);
  if (!matches || matches.length === 0) return null;
  const n = Number(matches[matches.length - 1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface DecodedVinFields {
  year: number | null;
  make: string | null;
  model: string | null;
  body_type: string | null;
  vehicle_type: string | null;
  gvwr: number | null;
}

/** Pure pick + normalize of one vPIC DecodeVinValues result row. */
export function pickVinFields(result: Record<string, unknown>): DecodedVinFields {
  const yearRaw = normalizeVinValue(result['ModelYear']);
  const year = yearRaw ? Number(yearRaw) : null;
  return {
    year: year != null && Number.isFinite(year) && year > 1900 ? year : null,
    make: normalizeVinValue(result['Make']),
    model: normalizeVinValue(result['Model']),
    body_type: normalizeVinValue(result['BodyClass']),
    vehicle_type: normalizeVinValue(result['VehicleType']),
    gvwr: parseGvwrPounds(normalizeVinValue(result['GVWR'])),
  };
}

/** True when the decode produced nothing usable (bad VIN or unknown). */
export function isEmptyDecode(fields: DecodedVinFields): boolean {
  return Object.values(fields).every((v) => v == null);
}

export async function decodeVin(vin: string): Promise<DecodedVinFields> {
  const clean = vin.trim().toUpperCase();
  const res = await fetch(`${VPIC_URL}/${encodeURIComponent(clean)}?format=json`);
  if (!res.ok) throw new Error(`VIN lookup failed (${res.status})`);
  const data = (await res.json()) as { Results?: Record<string, unknown>[] };
  const row = data.Results?.[0];
  if (!row) throw new Error('VIN lookup returned no result');
  return pickVinFields(row);
}
