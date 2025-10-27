import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type Policy = Database['public']['Tables']['policies']['Row'];

export interface PolicyFilters {
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
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.search) {
        query = query.or(
          `policy_number.ilike.%${filters.search}%,carrier.ilike.%${filters.search}%,line_of_business.ilike.%${filters.search}%`
        );
      }

      if (filters.policyNumber) {
        query = query.ilike('policy_number', `%${filters.policyNumber}%`);
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

      if (filters.carrier) {
        query = query.ilike('carrier', `%${filters.carrier}%`);
      }

      if (filters.mga) {
        query = query.eq('mga_id', filters.mga);
      }

      if (filters.lineOfBusiness) {
        query = query.ilike('line_of_business', `%${filters.lineOfBusiness}%`);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch policies: ${error.message}`);
      }

      // Filter by business type and zip code if provided (from related account)
      let filteredData = data as PolicyWithAccount[];

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

      return filteredData;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function usePolicyStats() {
  return useQuery({
    queryKey: ['policy-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          status, 
          carrier, 
          line_of_business, 
          effective_date, 
          expiration_date,
          mga_info:mgas!policies_mga_id_fkey(
            id,
            name
          )
        `);

      if (error) {
        throw new Error(`Failed to fetch policy stats: ${error.message}`);
      }

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
          acc[p.carrier] = (acc[p.carrier] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byMGA: data.reduce((acc, p) => {
          const mgaName = (p.mga_info as any)?.name;
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