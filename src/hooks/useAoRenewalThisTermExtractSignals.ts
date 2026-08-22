import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AORenewal } from '@/hooks/useAORenewals';
import {
  buildAoRenewalExtractSignalMap,
  pickThisTermExtractForRenewal,
  type AoRenewalExtractSignal,
  type DocumentAnalysisExtractRow,
} from '@/lib/aoRenewalExtractSignal';

const CHUNK_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchAnalysesByAccountIds(accountIds: string[]): Promise<DocumentAnalysisExtractRow[]> {
  const rows: DocumentAnalysisExtractRow[] = [];
  for (const ids of chunk(accountIds, CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('document_analysis')
      .select(
        'id, account_id, policy_number, effective_date, expiration_date, processing_status, analysis_result, extracted_data, created_at',
      )
      .in('account_id', ids)
      .order('created_at', { ascending: false });

    if (error) throw error;
    rows.push(...((data ?? []) as DocumentAnalysisExtractRow[]));
  }
  return rows;
}

async function fetchAnalysesByPolicyNumbers(
  policyNumbers: string[],
): Promise<DocumentAnalysisExtractRow[]> {
  const rows: DocumentAnalysisExtractRow[] = [];
  for (const numbers of chunk(policyNumbers, CHUNK_SIZE)) {
    const orFilter = [
      `policy_number.in.(${numbers.join(',')})`,
      ...numbers.map((n) => `analysis_result->>policy_number.eq.${n}`),
    ].join(',');

    const { data, error } = await supabase
      .from('document_analysis')
      .select(
        'id, account_id, policy_number, effective_date, expiration_date, processing_status, analysis_result, extracted_data, created_at',
      )
      .or(orFilter)
      .order('created_at', { ascending: false });

    if (error) throw error;
    rows.push(...((data ?? []) as DocumentAnalysisExtractRow[]));
  }
  return rows;
}

async function fetchPendingProposalAnalysisIds(analysisIds: string[]): Promise<Set<string>> {
  const pending = new Set<string>();
  if (analysisIds.length === 0) return pending;

  for (const ids of chunk(analysisIds, CHUNK_SIZE)) {
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('extract_writeback_proposals' as any)
      .select('document_analysis_id')
      .eq('status', 'pending')
      .in('document_analysis_id', ids);

    if (error) throw error;
    for (const row of data ?? []) {
      const id = (row as { document_analysis_id?: string }).document_analysis_id;
      if (id) pending.add(id);
    }
  }

  return pending;
}

function dedupeAnalyses(rows: DocumentAnalysisExtractRow[]): DocumentAnalysisExtractRow[] {
  const byId = new Map<string, DocumentAnalysisExtractRow>();
  for (const row of rows) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

/**
 * Batch lookup: this-term completed document_analysis extracts for visible AO renewals.
 * Staff-only via RLS. Never auto-applies write-back.
 */
export function useAoRenewalThisTermExtractSignals(renewals: AORenewal[]) {
  const renewalIds = renewals.map((r) => r.id);

  return useQuery({
    queryKey: ['ao-renewal-this-term-extract-signals', renewalIds],
    queryFn: async (): Promise<Map<string, AoRenewalExtractSignal>> => {
      if (renewals.length === 0) return new Map();

      const accountIds = [
        ...new Set(renewals.map((r) => r.account_id).filter((id): id is string => !!id)),
      ];
      const policyNumbers = [
        ...new Set(
          renewals
            .map((r) => r.policy_number?.trim())
            .filter((value): value is string => !!value),
        ),
      ];

      const [byAccount, byPolicy] = await Promise.all([
        accountIds.length > 0 ? fetchAnalysesByAccountIds(accountIds) : Promise.resolve([]),
        policyNumbers.length > 0 ? fetchAnalysesByPolicyNumbers(policyNumbers) : Promise.resolve([]),
      ]);

      const analyses = dedupeAnalyses([...byAccount, ...byPolicy]);
      const matchedIds = new Set<string>();

      for (const renewal of renewals) {
        const match = pickThisTermExtractForRenewal(renewal, analyses);
        if (match) matchedIds.add(match.id);
      }

      const pendingAnalysisIds = await fetchPendingProposalAnalysisIds([...matchedIds]);
      return buildAoRenewalExtractSignalMap(renewals, analyses, pendingAnalysisIds);
    },
    enabled: renewals.length > 0,
    staleTime: 30 * 1000,
  });
}

export function getAoRenewalExtractSignal(
  signals: Map<string, AoRenewalExtractSignal> | undefined,
  renewalId: string,
): AoRenewalExtractSignal | undefined {
  return signals?.get(renewalId);
}
