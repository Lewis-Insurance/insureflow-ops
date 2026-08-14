import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BookOfBusinessData {
  insureds: {
    commercial: number;
    personal: number;
  };
  prospects: {
    commercial: number;
    personal: number;
  };
}

const PERSONAL_OR_FILTER =
  'type.eq.household,type.eq.individual,type.eq.personal,account_type.eq.individual,account_type.eq.personal';

const COMMERCIAL_OR_FILTER =
  'type.eq.business,type.eq.commercial,type.eq.commercial_business,type.eq.corporate,account_type.eq.business,account_type.eq.commercial,account_type.eq.corporate';

async function countAccounts(orFilter: string, withPolicies = false): Promise<number> {
  const selectColumns = withPolicies ? 'id, policies!inner(id)' : 'id';
  const { count, error } = await supabase
    .from('accounts')
    .select(selectColumns, { count: 'exact', head: true })
    .is('deleted_at', null)
    .or(orFilter);

  if (error) {
    throw new Error(`Failed to fetch accounts: ${error.message}`);
  }

  return count ?? 0;
}

export function useBookOfBusinessData() {
  return useQuery({
    queryKey: ['book-of-business'],
    queryFn: async (): Promise<BookOfBusinessData> => {
      const [personalTotal, commercialTotal, personalInsured, commercialInsured] = await Promise.all([
        countAccounts(PERSONAL_OR_FILTER),
        countAccounts(COMMERCIAL_OR_FILTER),
        countAccounts(PERSONAL_OR_FILTER, true),
        countAccounts(COMMERCIAL_OR_FILTER, true),
      ]);

      return {
        insureds: {
          personal: personalInsured,
          commercial: commercialInsured,
        },
        prospects: {
          personal: Math.max(0, personalTotal - personalInsured),
          commercial: Math.max(0, commercialTotal - commercialInsured),
        },
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
