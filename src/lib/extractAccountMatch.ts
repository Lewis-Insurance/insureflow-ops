/**
 * Account match helpers for extract-to-book Phase 1a.
 * Classifies line category from snapshot and ranks match candidates.
 */

import type { ExtractSnapshotV1 } from '@/lib/extractSnapshot';
import type { DuplicateAccount } from '@/hooks/useDuplicateAccounts';

export type LineCategory = 'personal' | 'commercial';
export type LineCategorySource = 'snapshot' | 'override';
export type AccountTypeForDuplicate = 'household' | 'commercial_business';
export type MatchConfidence = 'high' | 'medium' | 'low';
export type MatchSource = 'duplicate' | 'search_name' | 'search_policy';

export interface ExtractBookingMeta {
  line_category: LineCategory;
  line_category_source: LineCategorySource;
}

export interface AccountMatchCandidate {
  accountId: string;
  name: string;
  matchReason: string;
  confidence: MatchConfidence;
  source: MatchSource;
  score: number;
}

export interface GlobalSearchRow {
  entity_type: string;
  id: string;
  label: string;
  subtitle?: string | null;
  email?: string | null;
  phone?: string | null;
}

const DUPLICATE_BASE_SCORE = 1000;
const POLICY_SEARCH_BASE_SCORE = 800;
const NAME_SEARCH_BASE_SCORE = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** commercial_* document types map to commercial; everything else is personal. */
export function classifyLineCategory(snapshot: ExtractSnapshotV1): LineCategory {
  const docType = (snapshot.document_type ?? '').toLowerCase().trim();
  if (docType.startsWith('commercial_') || docType === 'commercial') {
    return 'commercial';
  }
  return 'personal';
}

/** Maps line category to find_duplicate_accounts p_type. */
export function inferAccountType(snapshot: ExtractSnapshotV1): AccountTypeForDuplicate {
  return classifyLineCategory(snapshot) === 'commercial' ? 'commercial_business' : 'household';
}

export function lineCategoryLabel(category: LineCategory): string {
  return category === 'commercial' ? 'Commercial' : 'Personal';
}

export function readBookingFromExtractedData(
  extractedData: unknown,
  snapshot: ExtractSnapshotV1,
): ExtractBookingMeta {
  if (isRecord(extractedData) && isRecord(extractedData.booking)) {
    const lineCategory = extractedData.booking.line_category;
    const lineCategorySource = extractedData.booking.line_category_source;
    if (lineCategory === 'personal' || lineCategory === 'commercial') {
      return {
        line_category: lineCategory,
        line_category_source: lineCategorySource === 'override' ? 'override' : 'snapshot',
      };
    }
  }

  return {
    line_category: classifyLineCategory(snapshot),
    line_category_source: 'snapshot',
  };
}

export function mergeBookingIntoExtractedData(
  existing: unknown,
  booking: ExtractBookingMeta,
): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  const prevBooking = isRecord(base.booking) ? { ...base.booking } : {};
  return {
    ...base,
    booking: {
      ...prevBooking,
      line_category: booking.line_category,
      line_category_source: booking.line_category_source,
    },
  };
}

export function confidenceLabel(confidence: MatchConfidence): string {
  if (confidence === 'high') return 'High confidence';
  if (confidence === 'medium') return 'Medium confidence';
  return 'Low confidence';
}

export function mapDuplicateToCandidate(
  duplicate: DuplicateAccount,
  index: number,
): AccountMatchCandidate {
  return {
    accountId: duplicate.account_id,
    name: duplicate.name,
    matchReason: formatDuplicateMatchReason(duplicate.match_basis),
    confidence: 'high',
    source: 'duplicate',
    score: DUPLICATE_BASE_SCORE - index,
  };
}

function formatDuplicateMatchReason(matchBasis: string): string {
  const basis = matchBasis?.trim();
  if (!basis) return 'Name match';
  if (basis.toLowerCase() === 'name') return 'Exact name match';
  return basis.replace(/_/g, ' ');
}

export function mapNameSearchToCandidate(
  row: GlobalSearchRow,
  index: number,
): AccountMatchCandidate | null {
  if (row.entity_type !== 'account') return null;

  return {
    accountId: row.id,
    name: row.label,
    matchReason: 'Name search match',
    confidence: index === 0 ? 'medium' : 'low',
    source: 'search_name',
    score: NAME_SEARCH_BASE_SCORE - index,
  };
}

export function mapPolicySearchToCandidate(
  accountId: string,
  accountName: string,
  policyLabel: string,
  index: number,
): AccountMatchCandidate {
  return {
    accountId,
    name: accountName,
    matchReason: `Policy number match (${policyLabel})`,
    confidence: 'medium',
    source: 'search_policy',
    score: POLICY_SEARCH_BASE_SCORE - index,
  };
}

/** Dedupe by account id, keep highest score, sort descending. */
export function rankAccountMatches(candidates: AccountMatchCandidate[]): AccountMatchCandidate[] {
  const bestByAccount = new Map<string, AccountMatchCandidate>();

  for (const candidate of candidates) {
    const existing = bestByAccount.get(candidate.accountId);
    if (!existing || candidate.score > existing.score) {
      bestByAccount.set(candidate.accountId, candidate);
    }
  }

  return Array.from(bestByAccount.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}
