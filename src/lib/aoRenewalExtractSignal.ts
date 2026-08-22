import { extractLocalDate } from '@/lib/date/localDate';
import { readExtractSnapshot } from '@/lib/extractSnapshot';
import type { AORenewal } from '@/hooks/useAORenewals';

export type AoRenewalExtractSignalLabel = 'Extract ready' | 'Confirm extract';

export interface AoRenewalExtractSignal {
  analysisId: string;
  label: AoRenewalExtractSignalLabel;
}

export interface DocumentAnalysisExtractRow {
  id: string;
  account_id: string | null;
  policy_number: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  processing_status: string | null;
  analysis_result: unknown;
  extracted_data: unknown;
  created_at: string;
}

const COMPLETED_STATUSES = new Set(['completed', 'complete']);

/** AO renewal expiration is renewal_date; effective is derived from term length. */
export function deriveAoRenewalEffectiveDate(
  renewalDate: string | null | undefined,
  termMonths: 6 | 12 | null | undefined,
): string | null {
  const expiration = extractLocalDate(renewalDate);
  if (!expiration) return null;
  const [y, m, d] = expiration.split('-').map(Number);
  if (!y || !m || !d) return null;
  const months = termMonths === 6 ? 6 : 12;
  const base = new Date(Date.UTC(y, m - 1, d));
  if (months === 6) {
    base.setUTCMonth(base.getUTCMonth() - 6);
  } else {
    base.setUTCFullYear(base.getUTCFullYear() - 1);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

export function getAoRenewalTermBounds(renewal: AORenewal): {
  effective: string | null;
  expiration: string | null;
} {
  const expiration = extractLocalDate(renewal.renewal_date);
  const effective = deriveAoRenewalEffectiveDate(renewal.renewal_date, renewal.term_months);
  return { effective, expiration };
}

function normalizePolicyNumber(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

export function getAnalysisTermDates(row: DocumentAnalysisExtractRow): {
  effective: string | null;
  expiration: string | null;
} {
  const snapshot = readExtractSnapshot(row.analysis_result ?? row.extracted_data);
  const effective =
    extractLocalDate(row.effective_date) || extractLocalDate(snapshot?.effective_date);
  const expiration =
    extractLocalDate(row.expiration_date) || extractLocalDate(snapshot?.expiration_date);
  return { effective, expiration };
}

export function isCompletedDocumentAnalysis(row: DocumentAnalysisExtractRow): boolean {
  if (!COMPLETED_STATUSES.has(row.processing_status ?? '')) return false;
  const hasPayload =
    (row.analysis_result !== null && typeof row.analysis_result === 'object') ||
    (row.extracted_data !== null && typeof row.extracted_data === 'object');
  return hasPayload;
}

export function analysisMatchesRenewalTerm(
  renewal: AORenewal,
  row: DocumentAnalysisExtractRow,
): boolean {
  const renewalTerm = getAoRenewalTermBounds(renewal);
  if (!renewalTerm.expiration) return false;

  const analysisTerm = getAnalysisTermDates(row);

  if (analysisTerm.expiration && analysisTerm.expiration === renewalTerm.expiration) {
    return true;
  }

  if (
    renewalTerm.effective &&
    analysisTerm.effective &&
    analysisTerm.effective === renewalTerm.effective
  ) {
    return true;
  }

  return false;
}

export function analysisMatchesRenewalIdentity(
  renewal: AORenewal,
  row: DocumentAnalysisExtractRow,
): boolean {
  if (renewal.account_id && row.account_id && renewal.account_id === row.account_id) {
    return true;
  }

  const renewalPolicy = normalizePolicyNumber(renewal.policy_number);
  const analysisPolicy = normalizePolicyNumber(row.policy_number);
  return renewalPolicy !== '' && analysisPolicy !== '' && renewalPolicy === analysisPolicy;
}

export function pickThisTermExtractForRenewal(
  renewal: AORenewal,
  rows: DocumentAnalysisExtractRow[],
): DocumentAnalysisExtractRow | null {
  const candidates = rows
    .filter(
      (row) =>
        isCompletedDocumentAnalysis(row) &&
        analysisMatchesRenewalIdentity(renewal, row) &&
        analysisMatchesRenewalTerm(renewal, row),
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return candidates[0] ?? null;
}

export function buildAoRenewalExtractSignal(
  renewal: AORenewal,
  row: DocumentAnalysisExtractRow,
  pendingAnalysisIds: Set<string>,
): AoRenewalExtractSignal {
  const label: AoRenewalExtractSignalLabel = pendingAnalysisIds.has(row.id)
    ? 'Confirm extract'
    : 'Extract ready';

  return { analysisId: row.id, label };
}

export function buildAoRenewalExtractSignalMap(
  renewals: AORenewal[],
  rows: DocumentAnalysisExtractRow[],
  pendingAnalysisIds: Set<string>,
): Map<string, AoRenewalExtractSignal> {
  const signals = new Map<string, AoRenewalExtractSignal>();

  for (const renewal of renewals) {
    const match = pickThisTermExtractForRenewal(renewal, rows);
    if (!match) continue;
    signals.set(renewal.id, buildAoRenewalExtractSignal(renewal, match, pendingAnalysisIds));
  }

  return signals;
}
