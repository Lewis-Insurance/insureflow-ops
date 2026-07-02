import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { sanitizeForILike, sanitizeMultiFieldSearch } from '@/lib/sanitize';

export type Policy = Database['public']['Tables']['policies']['Row'];

export interface PolicyFilters {
  /** Scope the query server-side to one account (customer record) instead of paginating the whole book. */
  accountId?: string;
  search?: string;
  policyNumber?: string;
  effectiveDateFrom?: string;
  effectiveDateTo?: string;
  expirationDateFrom?: string;
  expirationDateTo?: string;
  businessType?: string;
  carrier?: string;
  mga?: string;
  lineOfBusiness?: string;
  zipCode?: string;
  status?: string;
}

export interface PolicyWithAccount extends Policy {
  account?: {
    id: string;
    name: string;
    type: string;
    zip_code?: string;
  };
  carrier_info?: {
    id: string;
    name: string;
  };
  mga_info?: {
    id: string;
    name: string;
    code?: string;
  };
}

export function usePolicies(filters: PolicyFilters = {}) {
  return useQuery({
    queryKey: ['policies', filters],
    queryFn: async () => {
      // Use pagination to handle >1000 policies (Supabase default API limit)
      const allPolicies: PolicyWithAccount[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('policies')
          .select(`
            *,
            account:accounts!policies_account_id_fkey(
              id,
              name,
              type,
              zip_code
            ),
            carrier_info:carriers!policies_carrier_id_fkey(
              id,
              name
            ),
            mga_info:mgas!policies_mga_id_fkey(
              id,
              name,
              code
            )
          `)
          .is('deleted_at', null) // merge-tombstoned duplicates must never render
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        // Apply filters
        if (filters.accountId) {
          query = query.eq('account_id', filters.accountId);
        }

        if (filters.search) {
          // Note: carrier is a FK (carrier_id), not a text field - search by policy_number and line_of_business only
          // Carrier name search is handled client-side after the JOIN
          const searchCondition = sanitizeMultiFieldSearch(filters.search, ['policy_number', 'line_of_business', 'named_insured']);
          query = query.or(searchCondition);
        }

        if (filters.policyNumber) {
          const sanitized = sanitizeForILike(filters.policyNumber);
          query = query.ilike('policy_number', `%${sanitized}%`);
        }

        if (filters.effectiveDateFrom) {
          query = query.gte('effective_date', filters.effectiveDateFrom);
        }

        if (filters.effectiveDateTo) {
          query = query.lte('effective_date', filters.effectiveDateTo);
        }

        if (filters.expirationDateFrom) {
          query = query.gte('expiration_date', filters.expirationDateFrom);
        }

        if (filters.expirationDateTo) {
          query = query.lte('expiration_date', filters.expirationDateTo);
        }

        // Note: Carrier filter is handled client-side since carrier is a FK
        // The carrier_info join provides the carrier name for filtering

        if (filters.mga) {
          query = query.eq('mga_id', filters.mga);
        }

        if (filters.lineOfBusiness) {
          const sanitized = sanitizeForILike(filters.lineOfBusiness);
          query = query.ilike('line_of_business', `%${sanitized}%`);
        }

        if (filters.status) {
          query = query.eq('status', filters.status);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Failed to fetch policies: ${error.message}`);
        }

        if (data && data.length > 0) {
          allPolicies.push(...(data as PolicyWithAccount[]));
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      // Filter by business type and zip code if provided (from related account)
      let filteredData = allPolicies;

      if (filters.businessType) {
        filteredData = filteredData.filter(policy =>
          policy.account?.type?.toLowerCase().includes(filters.businessType!.toLowerCase())
        );
      }

      if (filters.zipCode) {
        filteredData = filteredData.filter(policy =>
          policy.account?.zip_code?.includes(filters.zipCode!)
        );
      }

      // Client-side carrier filter using the joined carrier_info
      if (filters.carrier) {
        const carrierSearch = filters.carrier.toLowerCase();
        filteredData = filteredData.filter(policy =>
          policy.carrier_info?.name?.toLowerCase().includes(carrierSearch)
        );
      }

      return filteredData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function usePolicyStats() {
  return useQuery({
    queryKey: ['policy-stats'],
    queryFn: async () => {
      // Use pagination to handle >1000 policies (Supabase default API limit)
      const allPolicies: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('policies')
          .select(`
            status,
            line_of_business,
            effective_date,
            expiration_date,
            carrier_info:carriers!policies_carrier_id_fkey(
              id,
              name
            ),
            mga_info:mgas!policies_mga_id_fkey(
              id,
              name
            )
          `)
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
          throw new Error(`Failed to fetch policy stats: ${error.message}`);
        }

        if (data && data.length > 0) {
          allPolicies.push(...data);
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      const data = allPolicies;
      const now = new Date();
      const stats = {
        total: data.length,
        active: data.filter(p => new Date(p.expiration_date) > now).length,
        expired: data.filter(p => new Date(p.expiration_date) <= now).length,
        expiringSoon: data.filter(p => {
          const expDate = new Date(p.expiration_date);
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(now.getDate() + 30);
          return expDate > now && expDate <= thirtyDaysFromNow;
        }).length,
        byCarrier: data.reduce((acc, p) => {
          const carrierName = p.carrier_info?.name || 'Unknown';
          acc[carrierName] = (acc[carrierName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byMGA: data.reduce((acc, p) => {
          const mgaName = p.mga_info?.name;
          if (mgaName) {
            acc[mgaName] = (acc[mgaName] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>),
        byLineOfBusiness: data.reduce((acc, p) => {
          if (p.line_of_business) {
            acc[p.line_of_business] = (acc[p.line_of_business] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>),
      };

      return stats;
    },
    staleTime: 5 * 60 * 1000,
  });
}