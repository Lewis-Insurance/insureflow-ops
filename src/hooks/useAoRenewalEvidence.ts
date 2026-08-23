import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AORenewal } from "@/hooks/useAORenewals";
import { supabase } from "@/integrations/supabase/client";
import type { AoRenewalExtractSignal } from "@/lib/aoRenewalExtractSignal";
import {
  buildAoRenewalEvidence,
  type AoRenewalEvidence,
  type AoRenewalEvidenceDocumentRow,
  type AoRenewalEvidenceQuoteRow,
  type AoRenewalEvidenceRollupRow,
  type AoRenewalFallbackQuoteRow,
} from "@/lib/aoRenewalEvidence";

export const AO_RENEWAL_EVIDENCE_CHUNK_SIZE = 50;

export function chunkAoRenewalEvidenceIds<T>(
  items: T[],
  size = AO_RENEWAL_EVIDENCE_CHUNK_SIZE,
): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

async function fetchAccountEvidence(accountIds: string[]) {
  const documents: AoRenewalEvidenceDocumentRow[] = [];
  const quotes: AoRenewalEvidenceQuoteRow[] = [];
  const rollups: AoRenewalEvidenceRollupRow[] = [];

  for (const ids of chunkAoRenewalEvidenceIds(accountIds)) {
    const [documentsResult, quotesResult, rollupResult] = await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, account_id, policy_id, document_type, category, kind, filename, uploaded_at, created_at",
        )
        .in("account_id", ids)
        .is("deleted_at", null),
      supabase
        .from("quotes")
        .select("id, account_id, line_of_business, premium, created_at")
        .in("account_id", ids)
        .eq("status", "open")
        .is("deleted_at", null),
      // The migration intentionally precedes generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)("get_ao_renewal_evidence_rollup", {
        p_account_ids: ids,
      }),
    ]);

    if (documentsResult.error) throw documentsResult.error;
    if (quotesResult.error) throw quotesResult.error;
    if (rollupResult.error) throw rollupResult.error;
    documents.push(
      ...((documentsResult.data ?? []) as AoRenewalEvidenceDocumentRow[]),
    );
    quotes.push(...((quotesResult.data ?? []) as AoRenewalEvidenceQuoteRow[]));
    rollups.push(
      ...((rollupResult.data ?? []) as AoRenewalEvidenceRollupRow[]),
    );
  }

  return { documents, quotes, rollups };
}

async function fetchFallbackQuotes(
  renewalIds: string[],
): Promise<AoRenewalFallbackQuoteRow[]> {
  const rows: AoRenewalFallbackQuoteRow[] = [];
  for (const ids of chunkAoRenewalEvidenceIds(renewalIds)) {
    const { data, error } = await supabase
      .from("ao_renewal_quotes")
      .select("renewal_id, status")
      .in("renewal_id", ids)
      .in("status", ["quoted", "selected"]);
    if (error) throw error;
    rows.push(...((data ?? []) as AoRenewalFallbackQuoteRow[]));
  }
  return rows;
}

function selectRollup(
  renewal: AORenewal,
  rows: AoRenewalEvidenceRollupRow[],
): AoRenewalEvidenceRollupRow | null {
  if (!renewal.account_id) return null;
  return (
    rows.find(
      (row) =>
        row.account_id === renewal.account_id &&
        row.ao_renewal_id === renewal.id,
    ) ??
    rows.find(
      (row) =>
        row.account_id === renewal.account_id && row.ao_renewal_id === null,
    ) ??
    null
  );
}

/** Batched, read-only readiness evidence for the supplied visible AO renewals. */
export function useAoRenewalEvidence(
  renewals: AORenewal[],
  extractSignals?: Map<string, AoRenewalExtractSignal>,
) {
  const renewalIds = renewals.map((renewal) => renewal.id);
  const accountLinkSignature = renewals
    .map((renewal) => `${renewal.id}:${renewal.account_id ?? ""}`)
    .join("|");

  const query = useQuery({
    queryKey: ["ao-renewal-evidence", renewalIds],
    queryFn: async () => {
      const accountIds = [
        ...new Set(
          renewals
            .map((renewal) => renewal.account_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const unlinkedRenewalIds = renewals
        .filter((renewal) => !renewal.account_id)
        .map((renewal) => renewal.id);
      const [accountEvidence, fallbackQuotes] = await Promise.all([
        accountIds.length
          ? fetchAccountEvidence(accountIds)
          : Promise.resolve({ documents: [], quotes: [], rollups: [] }),
        unlinkedRenewalIds.length
          ? fetchFallbackQuotes(unlinkedRenewalIds)
          : Promise.resolve([]),
      ]);
      return { ...accountEvidence, fallbackQuotes, accountLinkSignature };
    },
    enabled: renewals.length > 0,
    staleTime: 30_000,
  });

  const previousAccountLinkSignature = useRef(accountLinkSignature);
  const { refetch } = query;
  useEffect(() => {
    if (previousAccountLinkSignature.current !== accountLinkSignature) {
      previousAccountLinkSignature.current = accountLinkSignature;
      void refetch();
    }
  }, [accountLinkSignature, refetch]);

  // Extract signals have their own query lifecycle. Derive outside the evidence query so a
  // newly arrived signal updates the rail without adding it to the required stable query key.
  const hasCurrentAccountLinks =
    query.data?.accountLinkSignature === accountLinkSignature;
  const evidence = useMemo<Map<string, AoRenewalEvidence> | undefined>(() => {
    if (!query.data || !hasCurrentAccountLinks) return undefined;
    const { documents, quotes, rollups, fallbackQuotes } = query.data;
    const today = new Date();
    return new Map(
      renewals.map((renewal) => {
        const renewalEvidence = buildAoRenewalEvidence({
          renewal,
          documents: documents.filter(
            (document) => document.account_id === renewal.account_id,
          ),
          quotes: quotes.filter(
            (quote) => quote.account_id === renewal.account_id,
          ),
          fallbackQuotes,
          rollup: selectRollup(renewal, rollups),
          extract: extractSignals?.get(renewal.id),
          today,
        });
        return [renewal.id, renewalEvidence];
      }),
    );
  }, [extractSignals, hasCurrentAccountLinks, query.data, renewals]);

  return {
    ...query,
    data: evidence,
    isLoading:
      query.isLoading || (renewals.length > 0 && !hasCurrentAccountLinks),
  };
}
