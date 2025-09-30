import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ValueSegment {
  segment: string;
  customers: number;
  totalValue: number;
  avgValue: number;
  percentage: number;
}

interface TopCustomer {
  name: string;
  value: number;
  policies: number;
  risk: string;
}

interface InsuredTotalValueData {
  valueSegments: ValueSegment[];
  topCustomers: TopCustomer[];
  totalValue: number;
  totalCustomers: number;
  avgValuePerCustomer: number;
}

export function useInsuredTotalValue() {
  return useQuery({
    queryKey: ['insured-total-value'],
    queryFn: async (): Promise<InsuredTotalValueData> => {
      // Fetch accounts and policies separately to respect RLS policies
      const [accountsResult, policiesResult] = await Promise.all([
        supabase
          .from('accounts')
          .select('id, name')
          .is('deleted_at', null),
        supabase
          .from('policies')
          .select('id, premium, line_of_business, account_id')
      ]);

      if (accountsResult.error) throw accountsResult.error;
      if (policiesResult.error) throw policiesResult.error;

      // Combine accounts with their policies
      const accounts = accountsResult.data?.map(account => ({
        ...account,
        policies: policiesResult.data?.filter(policy => policy.account_id === account.id) || []
      })) || [];

      // Calculate total value per customer and segment them
      const customerValues = accounts.map(account => {
        const totalPolicies = account.policies?.length || 0;
        const totalValue = account.policies?.reduce((sum, policy) => sum + (policy.premium || 0), 0) || 0;
        
        // Estimate total insured value (using premium as a proxy - multiply by typical coverage ratio)
        const estimatedInsuredValue = totalValue * 50; // Rough estimate: premium is ~2% of coverage
        
        return {
          name: account.name,
          value: estimatedInsuredValue,
          policies: totalPolicies,
          risk: estimatedInsuredValue > 200000 ? 'High' : estimatedInsuredValue > 100000 ? 'Medium' : 'Low'
        };
      });

      // Sort by value and get top customers
      const topCustomers = customerValues
        .filter(customer => customer.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      // Calculate segments
      const totalValue = customerValues.reduce((sum, customer) => sum + customer.value, 0);
      const totalCustomers = customerValues.filter(customer => customer.value > 0).length;

      const highValue = customerValues.filter(c => c.value > 100000);
      const mediumValue = customerValues.filter(c => c.value >= 50000 && c.value <= 100000);
      const standardValue = customerValues.filter(c => c.value >= 25000 && c.value < 50000);
      const basicValue = customerValues.filter(c => c.value > 0 && c.value < 25000);

      const valueSegments: ValueSegment[] = [
        {
          segment: 'High Value (>$100k)',
          customers: highValue.length,
          totalValue: highValue.reduce((sum, c) => sum + c.value, 0),
          avgValue: highValue.length > 0 ? highValue.reduce((sum, c) => sum + c.value, 0) / highValue.length : 0,
          percentage: totalValue > 0 ? (highValue.reduce((sum, c) => sum + c.value, 0) / totalValue) * 100 : 0
        },
        {
          segment: 'Medium Value ($50k-$100k)',
          customers: mediumValue.length,
          totalValue: mediumValue.reduce((sum, c) => sum + c.value, 0),
          avgValue: mediumValue.length > 0 ? mediumValue.reduce((sum, c) => sum + c.value, 0) / mediumValue.length : 0,
          percentage: totalValue > 0 ? (mediumValue.reduce((sum, c) => sum + c.value, 0) / totalValue) * 100 : 0
        },
        {
          segment: 'Standard Value ($25k-$50k)',
          customers: standardValue.length,
          totalValue: standardValue.reduce((sum, c) => sum + c.value, 0),
          avgValue: standardValue.length > 0 ? standardValue.reduce((sum, c) => sum + c.value, 0) / standardValue.length : 0,
          percentage: totalValue > 0 ? (standardValue.reduce((sum, c) => sum + c.value, 0) / totalValue) * 100 : 0
        },
        {
          segment: 'Basic Value (<$25k)',
          customers: basicValue.length,
          totalValue: basicValue.reduce((sum, c) => sum + c.value, 0),
          avgValue: basicValue.length > 0 ? basicValue.reduce((sum, c) => sum + c.value, 0) / basicValue.length : 0,
          percentage: totalValue > 0 ? (basicValue.reduce((sum, c) => sum + c.value, 0) / totalValue) * 100 : 0
        }
      ];

      return {
        valueSegments,
        topCustomers,
        totalValue,
        totalCustomers,
        avgValuePerCustomer: totalCustomers > 0 ? totalValue / totalCustomers : 0
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}