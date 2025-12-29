import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BankAccount, CreateBankAccountInput } from '@/types/payments';

// Query keys
export const bankAccountKeys = {
  all: ['bank-accounts'] as const,
  active: () => [...bankAccountKeys.all, 'active'] as const,
  primary: () => [...bankAccountKeys.all, 'primary'] as const,
  detail: (id: string) => [...bankAccountKeys.all, 'detail', id] as const,
};

// Fetch active bank accounts
export function useBankAccounts() {
  return useQuery({
    queryKey: bankAccountKeys.active(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
        .order('account_name', { ascending: true });

      if (error) throw error;
      return data as BankAccount[];
    },
  });
}

// Fetch primary bank account
export function usePrimaryBankAccount() {
  return useQuery({
    queryKey: bankAccountKeys.primary(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('is_primary', true)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;
      return data as BankAccount | null;
    },
  });
}

// Fetch single bank account
export function useBankAccount(id: string) {
  return useQuery({
    queryKey: bankAccountKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data as BankAccount;
    },
    enabled: !!id,
  });
}

// Create a new bank account
export function useCreateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBankAccountInput) => {
      // If setting as primary, unset other primary accounts first
      if (input.is_primary) {
        await supabase
          .from('bank_accounts')
          .update({ is_primary: false })
          .eq('is_primary', true);
      }

      const { data, error } = await supabase
        .from('bank_accounts')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankAccountKeys.all });
    },
  });
}

// Update a bank account
export function useUpdateBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BankAccount> & { id: string }) => {
      // If setting as primary, unset other primary accounts first
      if (updates.is_primary) {
        await supabase
          .from('bank_accounts')
          .update({ is_primary: false })
          .eq('is_primary', true)
          .neq('id', id);
      }

      const { data, error } = await supabase
        .from('bank_accounts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankAccountKeys.all });
    },
  });
}

// Soft delete a bank account
export function useDeleteBankAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('bank_accounts')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankAccountKeys.all });
    },
  });
}
