/**
 * Phase 1b: build pending quote write-back payloads from ExtractSnapshotV1.
 * Proposals are stored for staff review; apply is a later phase.
 */

import type { Database } from '@/integrations/supabase/types';
import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import type { LineCategory } from '@/lib/extractAccountMatch';

export type LineOfBusiness = Database['public']['Enums']['line_of_business'];

export interface ProposedQuoteFee {
  type: string;
  amount: number | null;
  label?: string;
}

export interface ProposedQuoteOptions {
  carrier_name: string;
  effective_date: string | null;
  premium_frequency: string | null;
  fees: ProposedQuoteFee[];
  commission_pct: number | null;
  commission_amount: number | null;
  claims_made: boolean | null;
  defense_inside_limits: boolean | null;
}

export interface ProposedQuoteCoverage {
  coverage_type: string;
  limit_amount: string | null;
  deductible_amount: string | null;
  premium_amount: number | null;
  is_included: boolean;
  extracted_from_document: boolean;
}

export interface ProposedQuotePayload {
  quote: {
    account_id: string;
    quote_ref: string;
    line_of_business: LineOfBusiness;
    premium: number | null;
    expires_at: string | null;
    status: 'open';
    options: ProposedQuoteOptions;
  };
  quote_coverages: ProposedQuoteCoverage[];
}

const UNKNOWN_CARRIER = 'Unknown carrier';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Recursively sort object keys for stable JSON serialization. */
export function canonicalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(canonicalizeForHash);
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalizeForHash(value[key]);
    }
    return sorted;
  }
  return value;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Stable SHA-256 of canonical JSON for idempotent proposal rows. */
export async function hashExtractSnapshot(snapshot: ExtractSnapshotV1): Promise<string> {
  const canonical = canonicalizeForHash(snapshot);
  return sha256Hex(JSON.stringify(canonical));
}

function slugifyCoverageType(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'coverage';
}

function coverageNames(snapshot: ExtractSnapshotV1): string[] {
  return snapshot.coverages.map((c) => c.name.toLowerCase());
}

function documentType(snapshot: ExtractSnapshotV1): string {
  return (snapshot.document_type ?? '').toLowerCase();
}

function hasCoveragePattern(snapshot: ExtractSnapshotV1, pattern: RegExp): boolean {
  return coverageNames(snapshot).some((name) => pattern.test(name));
}

/**
 * Map document_type, coverages, and booking line category to line_of_business enum.
 */
export function inferLineOfBusiness(
  snapshot: ExtractSnapshotV1,
  lineCategory: LineCategory,
): LineOfBusiness {
  const docType = documentType(snapshot);

  if (/umbrella/.test(docType)) {
    return 'umbrella';
  }
  if (/workers[_\s-]?comp|wc/.test(docType)) {
    return 'workers_comp';
  }
  if (/commercial[_\s-]?auto|business[_\s-]?auto|bap/.test(docType)) {
    return 'commercial_auto';
  }
  if (/commercial[_\s-]?property|^property/.test(docType)) {
    return 'property';
  }
  if (/bop|business owners/.test(docType)) {
    return 'bop';
  }
  if (/^auto|personal[_\s-]?auto|vehicle/.test(docType)) {
    return 'auto';
  }
  if (/home|homeowners|dwelling|renters/.test(docType)) {
    return lineCategory === 'commercial' ? 'property' : 'home';
  }
  if (/life[_\s-]?policy/.test(docType)) {
    return 'life';
  }
  if (/general[_\s-]?liability|^gl[_\s]/.test(docType)) {
    return 'gl';
  }

  if (hasCoveragePattern(snapshot, /umbrella|excess liability/)) {
    return 'umbrella';
  }
  if (hasCoveragePattern(snapshot, /workers.?comp|employers.?liability/)) {
    return 'workers_comp';
  }
  if (hasCoveragePattern(snapshot, /general liability|products.completed|products-completed|^gl /)) {
    return 'gl';
  }
  if (hasCoveragePattern(snapshot, /commercial auto|business auto|fleet/)) {
    return 'commercial_auto';
  }
  if (hasCoveragePattern(snapshot, /^property|building|contents/)) {
    return 'property';
  }
  if (hasCoveragePattern(snapshot, /term life|whole life|death benefit|life insurance/)) {
    return 'life';
  }
  if (/commercial[_\s-]?policy/.test(docType)) {
    return 'gl';
  }
  if (snapshot.vehicles.length > 0) {
    return lineCategory === 'commercial' ? 'commercial_auto' : 'auto';
  }
  if (snapshot.locations.length > 0) {
    return lineCategory === 'commercial' ? 'property' : 'home';
  }
  if (/commercial[_\s-]?quote/.test(docType)) {
    return lineCategory === 'commercial' ? 'gl' : 'auto';
  }

  return lineCategory === 'commercial' ? 'gl' : 'auto';
}

function carriersFromSnapshot(snapshot: ExtractSnapshotV1): string[] {
  const carriers = snapshot.carriers.map((c) => c.trim()).filter(Boolean);
  if (carriers.length > 0) return carriers;
  return [UNKNOWN_CARRIER];
}

function buildQuoteRef(snapshot: ExtractSnapshotV1, carrierName: string): string {
  const policyPart = (snapshot.policy_number ?? 'extract').replace(/\s+/g, '-');
  const carrierPart = carrierName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `extract-${policyPart}-${carrierPart || 'carrier'}`;
}

function mapCoverages(snapshot: ExtractSnapshotV1): ProposedQuoteCoverage[] {
  return snapshot.coverages.map((cov) => ({
    coverage_type: slugifyCoverageType(cov.name),
    limit_amount: cov.limit,
    deductible_amount: cov.deductible,
    premium_amount: parseNumber(cov.premium),
    is_included: true,
    extracted_from_document: true,
  }));
}

function mapFees(snapshot: ExtractSnapshotV1): ProposedQuoteFee[] {
  return snapshot.fees.map((fee) => ({
    type: fee.type,
    amount: fee.amount,
    ...(fee.label ? { label: fee.label } : {}),
  }));
}

function buildPayloadForCarrier(
  snapshot: ExtractSnapshotV1,
  accountId: string,
  lineCategory: LineCategory,
  carrierName: string,
): ProposedQuotePayload {
  const lineOfBusiness = inferLineOfBusiness(snapshot, lineCategory);

  return {
    quote: {
      account_id: accountId,
      quote_ref: buildQuoteRef(snapshot, carrierName),
      line_of_business: lineOfBusiness,
      premium: snapshot.premium.total,
      expires_at: snapshot.expiration_date,
      status: 'open',
      options: {
        carrier_name: carrierName,
        effective_date: snapshot.effective_date,
        premium_frequency: snapshot.premium.frequency,
        fees: mapFees(snapshot),
        commission_pct: snapshot.commission?.percent ?? null,
        commission_amount: snapshot.commission?.amount ?? null,
        claims_made: snapshot.claims_made,
        defense_inside_limits: snapshot.defense_inside_limits,
      },
    },
    quote_coverages: mapCoverages(snapshot),
  };
}

/** One proposed quote payload per carrier (or Unknown carrier when none listed). */
export function buildProposedQuotesFromSnapshot(
  snapshot: ExtractSnapshotV1,
  accountId: string,
  lineCategory: LineCategory,
): ProposedQuotePayload[] {
  return carriersFromSnapshot(snapshot).map((carrierName) =>
    buildPayloadForCarrier(snapshot, accountId, lineCategory, carrierName),
  );
}

export function proposalPremiumFromPayload(payload: ProposedQuotePayload): number | null {
  return payload.quote.premium;
}

export function proposalCoverageCount(payload: ProposedQuotePayload): number {
  return payload.quote_coverages.length;
}
