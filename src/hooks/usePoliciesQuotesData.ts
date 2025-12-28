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

export function usePoliciesQuotesData() {
  return useQuery({
    queryKey: ['policies-quotes-data'],
    queryFn: async (): Promise<PoliciesQuotesData> => {
      // Fetch policies data
      const { data: policiesData, error: policiesError } = await supabase
        .from('policies')
        .select(`
          line_of_business,
          carrier,
          account:accounts!policies_account_id_fkey(state)
        `)
        .is('deleted_at', null);

      if (policiesError) {
        throw new Error(`Failed to fetch policies: ${policiesError.message}`);
      }

      const policies = policiesData || [];

      // Policies by Line of Business
      const lobCounts: Record<string, number> = {};
      policies.forEach(policy => {
        if (policy.line_of_business) {
          lobCounts[policy.line_of_business] = (lobCounts[policy.line_of_business] || 0) + 1;
        }
      });

      const policiesByLineOfBusiness = Object.entries(lobCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      // Policies by Line of Business Class (categorize into Personal/Commercial)
      const personalLines = ['Auto', 'Home', 'Life', 'Personal Auto', 'Homeowners', 'Renters', 'Umbrella'];
      const commercialLines = ['Commercial Auto', 'General Liability', 'Professional Liability', 'Workers Compensation', 'Property', 'Commercial Package', 'BOP'];

      let personalCount = 0;
      let commercialCount = 0;
      let lifeHealthCount = 0;

      policies.forEach(policy => {
        if (policy.line_of_business) {
          if (personalLines.some(line => policy.line_of_business?.toLowerCase().includes(line.toLowerCase()))) {
            personalCount++;
          } else if (commercialLines.some(line => policy.line_of_business?.toLowerCase().includes(line.toLowerCase()))) {
            commercialCount++;
          } else if (policy.line_of_business.toLowerCase().includes('life') || policy.line_of_business.toLowerCase().includes('health')) {
            lifeHealthCount++;
          }
        }
      });

      const policiesByLineOfBusinessClass = [
        { label: 'Personal', count: personalCount },
        { label: 'Commercial', count: commercialCount },
        { label: 'Life-Health', count: lifeHealthCount },
      ].filter(item => item.count > 0);

      // Policies by Carrier
      const carrierCounts: Record<string, number> = {};
      policies.forEach(policy => {
        if (policy.carrier) {
          carrierCounts[policy.carrier] = (carrierCounts[policy.carrier] || 0) + 1;
        }
      });

      const policiesByCarrier = Object.entries(carrierCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      // Policies by State
      const stateCounts: Record<string, number> = {};
      policies.forEach(policy => {
        const state = (policy.account as any)?.state || '[Not Assigned]';
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      });

      const policiesByState = Object.entries(stateCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      // Fetch quotes data from the quotes table
      const { data: quotesData, error: quotesError } = await supabase
        .from('quotes')
        .select(`
          id,
          status,
          carrier:carriers(name)
        `)
        .is('deleted_at', null);

      if (quotesError) {
        logger.error('Error fetching quotes:', quotesError);
        // Continue with empty quotes data
      }

      const quotes = quotesData || [];

      // Quotes by Stage/Status
      const stageCounts: Record<string, number> = {};
      quotes.forEach(quote => {
        const status = quote.status || '[Not Assigned]';
        // Map quote_status enum to display labels
        const statusLabel = mapQuoteStatus(status);
        stageCounts[statusLabel] = (stageCounts[statusLabel] || 0) + 1;
      });

      const quotesByStage = Object.entries(stageCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      // Quotes by Carrier
      const quoteCarrierCounts: Record<string, number> = {};
      quotes.forEach(quote => {
        const carrierName = (quote.carrier as any)?.name || '[Unknown Carrier]';
        quoteCarrierCounts[carrierName] = (quoteCarrierCounts[carrierName] || 0) + 1;
      });

      const quotesByCarrier = Object.entries(quoteCarrierCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      return {
        policiesByLineOfBusiness,
        policiesByLineOfBusinessClass,
        policiesByCarrier,
        policiesByState,
        quotesByStage,
        quotesByCarrier,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Map quote status enum values to user-friendly labels
function mapQuoteStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'open': 'Open',
    'pending': 'Pending Review',
    'quoted': 'Quote Delivered',
    'won': 'Won',
    'lost': 'Lost',
    'expired': 'Expired',
    'declined': 'Declined',
    'draft': 'Draft',
    'sent': 'Sent to Client',
    'accepted': 'Accepted',
  };
  return statusMap[status.toLowerCase()] || status;
}
