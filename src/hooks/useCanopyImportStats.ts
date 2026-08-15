import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CanopyImportStats {
  totalImports: number;
  completedImports: number;
  leadsCreated: number;
}

async function countCanopyPulls(filter?: { status?: string; hasLead?: boolean }): Promise<number> {
  let query = supabase.from('canopy_pulls').select('*', { count: 'exact', head: true });

  if (filter?.status) {
    query = query.eq('status', filter.status);
  }

  if (filter?.hasLead) {
    query = query.not('lead_id', 'is', null);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch Canopy import stats: ${error.message}`);
  }

  return count ?? 0;
}

export function useCanopyImportStats() {
  return useQuery({
    queryKey: ['canopy-import-stats'],
    queryFn: async (): Promise<CanopyImportStats> => {
      const [totalImports, completedImports, leadsCreated] = await Promise.all([
        countCanopyPulls(),
        countCanopyPulls({ status: 'complete' }),
        countCanopyPulls({ hasLead: true }),
      ]);

      return {
        totalImports,
        completedImports,
        leadsCreated,
      };
    },
    staleTime: 30 * 1000,
  });
}
