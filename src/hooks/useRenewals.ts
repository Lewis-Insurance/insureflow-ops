import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PolicyWithAccount } from './usePolicies';

export type RenewalType = 'upcoming' | 'expired';

export interface RenewalsStats {
  upcoming: number;
  expired: number;
  total: number;
  byCarrier: Array<{ carrier: string; count: number }>;
  byLineOfBusiness: Array<{ line: string; count: number }>;
}

export function useRenewals(type: RenewalType) {
  return useQuery({
    queryKey: ['renewals', type],
    queryFn: async () => {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

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
          )
        `);

      if (type === 'upcoming') {
        // Policies expiring within 30 days
        query = query
          .gte('expiration_date', today.toISOString().split('T')[0])
          .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
          .in('status', ['active', 'pending']);
      } else if (type === 'expired') {
        // Policies that have already expired
        query = query
          .lt('expiration_date', today.toISOString().split('T')[0])
          .in('status', ['active', 'expired']);
      }

      query = query.order('expiration_date', { ascending: true });

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch ${type} renewals: ${error.message}`);
      }

      return data as PolicyWithAccount[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRenewalsStats() {
  return useQuery({
    queryKey: ['renewals', 'stats'],
    queryFn: async () => {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      // Get upcoming renewals count
      const { count: upcomingCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .in('status', ['active', 'pending']);

      // Get expired policies count
      const { count: expiredCount } = await supabase
        .from('policies')
        .select('*', { count: 'exact', head: true })
        .lt('expiration_date', today.toISOString().split('T')[0])
        .in('status', ['active', 'expired']);

      // Get breakdown by carrier for upcoming renewals
      const { data: carrierData } = await supabase
        .from('policies')
        .select(`
          carrier,
          carrier_info:carriers!policies_carrier_id_fkey(name)
        `)
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .in('status', ['active', 'pending']);

      // Get breakdown by line of business for upcoming renewals
      const { data: lineData } = await supabase
        .from('policies')
        .select('line_of_business')
        .gte('expiration_date', today.toISOString().split('T')[0])
        .lte('expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .in('status', ['active', 'pending']);

      // Process carrier breakdown
      const carrierCounts = (carrierData || []).reduce((acc, policy) => {
        const carrierName = policy.carrier_info?.name || policy.carrier || 'Unknown';
        acc[carrierName] = (acc[carrierName] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byCarrier = Object.entries(carrierCounts)
        .map(([carrier, count]) => ({ carrier, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Process line of business breakdown
      const lineCounts = (lineData || []).reduce((acc, policy) => {
        const line = policy.line_of_business || 'Unknown';
        acc[line] = (acc[line] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const byLineOfBusiness = Object.entries(lineCounts)
        .map(([line, count]) => ({ line, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        upcoming: upcomingCount || 0,
        expired: expiredCount || 0,
        total: (upcomingCount || 0) + (expiredCount || 0),
        byCarrier,
        byLineOfBusiness,
      } as RenewalsStats;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}