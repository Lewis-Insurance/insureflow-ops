import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PaymentMethod } from '@/types/payments';

// Query keys
export const paymentMethodKeys = {
  all: ['payment-methods'] as const,
  active: () => [...paymentMethodKeys.all, 'active'] as const,
};

// Fetch active payment methods
export function usePaymentMethods() {
  return useQuery({
    queryKey: paymentMethodKeys.active(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as PaymentMethod[];
    },
  });
}

// Fetch all payment methods (including inactive)
export function useAllPaymentMethods() {
  return useQuery({
    queryKey: paymentMethodKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .is('deleted_at', null)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data as PaymentMethod[];
    },
  });
}

// Create a new payment method
export function useCreatePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<PaymentMethod, 'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'>) => {
      const { data, error } = await supabase
        .from('payment_methods')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentMethodKeys.all });
    },
  });
}

// Update a payment method
export function useUpdatePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentMethod> & { id: string }) => {
      const { data, error } = await supabase
        .from('payment_methods')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentMethodKeys.all });
    },
  });
}

// Soft delete a payment method
export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('payment_methods')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: paymentMethodKeys.all });
    },
  });
}
