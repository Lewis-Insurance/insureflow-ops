import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
      // Get policies data
      const { data: policiesData, error: policiesError } = await supabase
        .from('policies')
        .select(`
          line_of_business,
          carrier,
          account:accounts!policies_account_id_fkey(state)
        `);

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
      const personalLines = ['Auto', 'Home', 'Life', 'Personal Auto', 'Homeowners'];
      const commercialLines = ['Commercial Auto', 'General Liability', 'Professional Liability', 'Workers Compensation', 'Property', 'Commercial Package'];
      
      let personalCount = 0;
      let commercialCount = 0;
      let lifeHealthCount = 0;

      policies.forEach(policy => {
        if (policy.line_of_business) {
          if (personalLines.some(line => policy.line_of_business?.includes(line))) {
            personalCount++;
          } else if (commercialLines.some(line => policy.line_of_business?.includes(line))) {
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
        const state = policy.account?.state || '[Not Assigned]';
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      });

      const policiesByState = Object.entries(stateCounts)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      // For quotes, we'll use placeholder data since we don't have a quotes table yet
      // In a real implementation, you'd query a quotes/opportunities table
      const quotesByStage = [
        { label: '[Not Assigned]', count: 0 },
        { label: 'Prospect', count: 0 },
        { label: 'Quote Requested', count: 0 },
        { label: 'Quote Delivered', count: 0 },
        { label: 'Follow Up', count: 0 },
      ];

      const quotesByCarrier = [
        { label: 'Progressive American Ins Co', count: 0 },
        { label: 'Safe Harbor Ins Co', count: 0 },
        { label: 'Universal Prop & Cas Ins', count: 0 },
      ];

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