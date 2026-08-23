/**
 * Deno mirror of src/lib/extractWritebackProposal.ts (plus classifyLineCategory from
 * src/lib/extractAccountMatch.ts). Keep byte-identical; guarded by
 * src/__tests__/lib/extractWritebackProposal.parity.test.ts.
 *
 * Used by document-collection to write pending write-back proposals server-side after
 * Phase 0 extract. Never applies a proposal; applying is a staff-only client action.
 */

import { readExtractSnapshot, type ExtractSnapshotV1 } from './extractSnapshot.ts';

export type LineCategory = 'personal' | 'commercial';

export type LineOfBusiness =
  | 'auto'
  | 'home'
  | 'renters'
  | 'umbrella'
  | 'life'
  | 'health'
  | 'commercial_auto'
  | 'bop'
  | 'gl'
  | 'workers_comp'
  | 'property'
  | 'other';

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

/** commercial_* document types map to commercial; everything else is personal. */
export function classifyLineCategory(snapshot: ExtractSnapshotV1): LineCategory {
  const docType = (snapshot.document_type ?? '').toLowerCase().trim();
  if (docType.startsWith('commercial_') || docType === 'commercial') {
    return 'commercial';
  }
  return 'personal';
}

// ---------------------------------------------------------------------------
// Server-only: ensure pending proposals after Phase 0 extract
// ---------------------------------------------------------------------------

/**
 * Emptiness guard. isExtractSnapshotComplete checks overflow size, not emptiness.
 * An empty snapshot would yield an "Unknown carrier" proposal, which is worse than none.
 */
export function isSnapshotEmpty(snapshot: ExtractSnapshotV1): boolean {
  return (
    snapshot.carriers.length === 0 &&
    !snapshot.policy_number &&
    snapshot.premium.total == null &&
    snapshot.coverages.length === 0
  );
}

export interface EnsureExtractWritebackProposalsParams {
  analysisId: string;
  accountId: string;
  /** Raw analysis_result; normalized with readExtractSnapshot so the hash matches the client. */
  snapshot: unknown;
  createdBy: string | null;
}

export interface EnsureExtractWritebackProposalsResult {
  rowCount: number;
  snapshotHash: string | null;
  skipped: 'empty' | null;
}

/**
 * Upsert-ignore pending proposals for an analysis. Never supersedes (client concern),
 * never applies. Logs ids and counts only.
 */
export async function ensureExtractWritebackProposals(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  params: EnsureExtractWritebackProposalsParams,
): Promise<EnsureExtractWritebackProposalsResult> {
  const { analysisId, accountId, createdBy } = params;
  const snapshot = readExtractSnapshot(params.snapshot);

  if (isSnapshotEmpty(snapshot)) {
    return { rowCount: 0, snapshotHash: null, skipped: 'empty' };
  }

  const lineCategory = classifyLineCategory(snapshot);
  const snapshotHash = await hashExtractSnapshot(snapshot);
  const rows = buildProposedQuotesFromSnapshot(snapshot, accountId, lineCategory).map((payload) => ({
    document_analysis_id: analysisId,
    account_id: accountId,
    snapshot_hash: snapshotHash,
    carrier_name: payload.quote.options.carrier_name,
    line_class: lineCategory,
    status: 'pending' as const,
    proposed_quote: payload,
    created_by: createdBy,
  }));

  if (rows.length === 0) {
    return { rowCount: 0, snapshotHash, skipped: null };
  }

  const { error } = await supabase
    .from('extract_writeback_proposals')
    .upsert(rows, {
      onConflict: 'document_analysis_id,account_id,snapshot_hash,carrier_name',
      ignoreDuplicates: true,
    });

  if (error) {
    throw new Error(error.message ?? 'upsert failed');
  }

  return { rowCount: rows.length, snapshotHash, skipped: null };
}
