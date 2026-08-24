import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

interface PoliciesQuotesData {
  policiesByLineOfBusiness: Array<{ label: string; count: number }>;
  policiesByLineOfBusinessClass: Array<{ label: string; count: number }>;
  policiesByCarrier: Array<{ label: string; count: number }>;
  policiesByState: Array<{ label: string; count: number }>;
  quotesByStage: Array<{ label: string; count: number }>;
  quotesByCarrier: Array<{ label: string; count: number }>;
}

interface AggregateRow {
  count: number;
  [key: string]: unknown;
}

const personalLines = ['Auto', 'Home', 'Life', 'Personal Auto', 'Homeowners', 'Renters', 'Umbrella'];
const commercialLines = ['Commercial Auto', 'General Liability', 'Professional Liability', 'Workers Compensation', 'Property', 'Commercial Package', 'BOP'];

function toSortedCounts(rows: AggregateRow[], getLabel: (row: AggregateRow) => string | null) {
  return rows
    .map((row) => ({ label: getLabel(row), count: Number(row.count) || 0 }))
    .filter((item): item is { label: string; count: number } => Boolean(item.label) && item.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function usePoliciesQuotesData() {
  return useQuery({
    queryKey: ['policies-quotes-data'],
    queryFn: async (): Promise<PoliciesQuotesData> => {
      // Count in Postgres and return one row per group, avoiding the 1,000-row response cap.
      const [lobResult, policyCarrierResult, policyStateResult] = await Promise.all([
        supabase
          .from('policies')
          .select('line_of_business, count:id.count()')
          .is('deleted_at', null)
          .not('line_of_business', 'is', null),
        supabase
          .from('policies')
          .select('carrier, count:id.count()')
          .is('deleted_at', null)
          .not('carrier', 'is', null),
        supabase
          .from('policies')
          .select('account:accounts!policies_account_id_fkey(state), count:id.count()')
          .is('deleted_at', null),
      ]);

      const policyError = lobResult.error || policyCarrierResult.error || policyStateResult.error;
      if (policyError) {
        throw new Error(`Failed to fetch policies: ${policyError.message}`);
      }

      const policiesByLineOfBusiness = toSortedCounts(
        (lobResult.data || []) as unknown as AggregateRow[],
        (row) => row.line_of_business as string | null,
      );

      let personalCount = 0;
      let commercialCount = 0;
      let lifeHealthCount = 0;

      for (const { label, count } of policiesByLineOfBusiness) {
        if (personalLines.some((line) => label.toLowerCase().includes(line.toLowerCase()))) {
          personalCount += count;
        } else if (commercialLines.some((line) => label.toLowerCase().includes(line.toLowerCase()))) {
          commercialCount += count;
        } else if (label.toLowerCase().includes('life') || label.toLowerCase().includes('health')) {
          lifeHealthCount += count;
        }
      }

      const policiesByLineOfBusinessClass = [
        { label: 'Personal', count: personalCount },
        { label: 'Commercial', count: commercialCount },
        { label: 'Life-Health', count: lifeHealthCount },
      ].filter((item) => item.count > 0);

      const policiesByCarrier = toSortedCounts(
        (policyCarrierResult.data || []) as unknown as AggregateRow[],
        (row) => row.carrier as string | null,
      );

      const policiesByState = toSortedCounts(
        (policyStateResult.data || []) as unknown as AggregateRow[],
        (row) => (row.account as { state?: string | null } | null)?.state || '[Not Assigned]',
      );

      const [quoteStageResult, quoteCarrierResult] = await Promise.all([
        supabase.from('quotes').select('status, count:id.count()').is('deleted_at', null),
        supabase
          .from('quotes')
          .select('carrier:carriers(name), count:id.count()')
          .is('deleted_at', null),
      ]);

      if (quoteStageResult.error || quoteCarrierResult.error) {
        logger.error('Error fetching quotes:', quoteStageResult.error || quoteCarrierResult.error);
      }

      const quotesByStage = quoteStageResult.error
        ? []
        : toSortedCounts(
            (quoteStageResult.data || []) as unknown as AggregateRow[],
            (row) => mapQuoteStatus((row.status as string | null) || '[Not Assigned]'),
          );

      const quotesByCarrier = quoteCarrierResult.error
        ? []
        : toSortedCounts(
            (quoteCarrierResult.data || []) as unknown as AggregateRow[],
            (row) => (row.carrier as { name?: string | null } | null)?.name || '[Unknown Carrier]',
          );

      return {
        policiesByLineOfBusiness,
        policiesByLineOfBusinessClass,
        policiesByCarrier,
        policiesByState,
        quotesByStage,
        quotesByCarrier,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function mapQuoteStatus(status: string): string {
  const statusMap: Record<string, string> = {
    open: 'Open',
    pending: 'Pending Review',
    quoted: 'Quote Delivered',
    won: 'Won',
    lost: 'Lost',
    expired: 'Expired',
    declined: 'Declined',
    draft: 'Draft',
    sent: 'Sent to Client',
    accepted: 'Accepted',
  };
  return statusMap[status.toLowerCase()] || status;
}
