import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeMultiFieldSearch } from '@/lib/sanitize';
import type {
  PremiumPayment,
  PaymentFilters,
  VoidPaymentInput,
} from '@/types/payments';

// Query keys
export const paymentKeys = {
  all: ['payments'] as const,
  lists: () => [...paymentKeys.all, 'list'] as const,
  list: (filters: PaymentFilters) => [...paymentKeys.lists(), filters] as const,
  details: () => [...paymentKeys.all, 'detail'] as const,
  detail: (id: string) => [...paymentKeys.details(), id] as const,
  byDaySheet: (daySheetId: string) => [...paymentKeys.all, 'day-sheet', daySheetId] as const,
  byAccount: (accountId: string) => [...paymentKeys.all, 'account', accountId] as const,
  byPolicy: (policyId: string) => [...paymentKeys.all, 'policy', policyId] as const,
};

// Fetch payments with filters
export function usePayments(filters: PaymentFilters = {}) {
  return useQuery({
    queryKey: paymentKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('premium_payments')
        .select(`
          *,
          payment_method:payment_methods(id, name, type),
          policy:policies(policy_number, line_of_business, carrier),
          account:accounts(name),
          day_sheet:day_sheets(sheet_date, status, sheet_number)
        `)
        .is('deleted_at', null)
        .order('received_date', { ascending: false })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters.date_from) {
        query = query.gte('received_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('received_date', filters.date_to);
      }
      if (filters.account_id) {
        query = query.eq('account_id', filters.account_id);
      }
      if (filters.policy_id) {
        query = query.eq('policy_id', filters.policy_id);
      }
      if (filters.day_sheet_id) {
        query = query.eq('day_sheet_id', filters.day_sheet_id);
      }
      if (filters.min_amount) {
        query = query.gte('amount', filters.min_amount);
      }
      if (filters.max_amount) {
        query = query.lte('amount', filters.max_amount);
      }
      if (filters.search) {
        // Sanitized: raw commas/parens break the PostgREST .or() filter string.
        query = query.or(
          sanitizeMultiFieldSearch(filters.search, [
            'payer_name',
            'check_number',
            'reference_number',
            'receipt_number',
          ])
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      // Method-type filtering happens client-side: an .in() on the embedded
      // payment_method without !inner does not exclude parents in PostgREST -
      // it just nulls the embed, silently returning every payment.
      let rows = data as PremiumPayment[];
      if (filters.payment_method_type?.length) {
        rows = rows.filter((p) => p.payment_method && filters.payment_method_type!.includes(p.payment_method.type));
      }
      return rows;
    },
  });
}

// Fetch single payment
export function usePayment(id: string) {
  return useQuery({
    queryKey: paymentKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('premium_payments')
        .select(`
          *,
          payment_method:payment_methods(id, name, type),
          policy:policies(policy_number, line_of_business, carrier),
          account:accounts(name),
          day_sheet:day_sheets(sheet_date, status, sheet_number)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data as PremiumPayment;
    },
    enabled: !!id,
  });
}

// Fetch payments by day sheet
export function usePaymentsByDaySheet(daySheetId: string) {
  return useQuery({
    queryKey: paymentKeys.byDaySheet(daySheetId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('premium_payments')
        .select(`
          *,
          payment_method:payment_methods(id, name, type),
          policy:policies(policy_number, line_of_business, carrier),
          account:accounts(name)
        `)
        .eq('day_sheet_id', daySheetId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as PremiumPayment[];
    },
    enabled: !!daySheetId,
  });
}

// Void a payment
export function useVoidPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VoidPaymentInput) => {
      const { data, error } = await supabase
        .from('premium_payments')
        .update({
          status: 'voided',
          voided_at: new Date().toISOString(),
          voided_by: (await supabase.auth.getUser()).data.user?.id,
          void_reason: input.void_reason,
        })
        .eq('id', input.payment_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.detail(variables.payment_id) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ['day-sheets'] });
    },
  });
}

// Mark payment as NSF
export function useMarkPaymentNSF() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ payment_id, nsf_fee }: { payment_id: string; nsf_fee?: number }) => {
      const { data, error } = await supabase
        .from('premium_payments')
        .update({
          status: 'nsf',
          nsf_at: new Date().toISOString(),
          nsf_fee: nsf_fee || null,
        })
        .eq('id', payment_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: paymentKeys.detail(variables.payment_id) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.lists() });
    },
  });
}
