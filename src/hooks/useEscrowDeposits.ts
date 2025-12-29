import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  EscrowDeposit,
  DepositFilters,
  CreateDepositInput,
  VerifyDepositInput,
} from '@/types/payments';

// Query keys
export const escrowDepositKeys = {
  all: ['escrow-deposits'] as const,
  lists: () => [...escrowDepositKeys.all, 'list'] as const,
  list: (filters: DepositFilters) => [...escrowDepositKeys.lists(), filters] as const,
  details: () => [...escrowDepositKeys.all, 'detail'] as const,
  detail: (id: string) => [...escrowDepositKeys.details(), id] as const,
  unmatched: () => [...escrowDepositKeys.all, 'unmatched'] as const,
};

// Fetch escrow deposits with filters
export function useEscrowDeposits(filters: DepositFilters = {}) {
  return useQuery({
    queryKey: escrowDepositKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('escrow_deposits')
        .select(`
          *,
          bank_account:bank_accounts(id, account_name, bank_name),
          day_sheet:day_sheets(sheet_date, sheet_number)
        `)
        .is('deleted_at', null)
        .order('deposit_date', { ascending: false });

      // Apply filters
      if (filters.reconciliation_status?.length) {
        query = query.in('reconciliation_status', filters.reconciliation_status);
      }
      if (filters.date_from) {
        query = query.gte('deposit_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('deposit_date', filters.date_to);
      }
      if (filters.bank_account_id) {
        query = query.eq('bank_account_id', filters.bank_account_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as EscrowDeposit[];
    },
  });
}

// Fetch unmatched deposits
export function useUnmatchedDeposits() {
  return useQuery({
    queryKey: escrowDepositKeys.unmatched(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escrow_deposits')
        .select(`
          *,
          bank_account:bank_accounts(id, account_name, bank_name),
          day_sheet:day_sheets(sheet_date, sheet_number)
        `)
        .eq('reconciliation_status', 'pending')
        .is('deleted_at', null)
        .order('deposit_date', { ascending: false });

      if (error) throw error;
      return data as EscrowDeposit[];
    },
  });
}

// Fetch single escrow deposit
export function useEscrowDeposit(id: string) {
  return useQuery({
    queryKey: escrowDepositKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escrow_deposits')
        .select(`
          *,
          bank_account:bank_accounts(id, account_name, bank_name),
          day_sheet:day_sheets(sheet_date, sheet_number, grand_total, payment_count)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data as EscrowDeposit;
    },
    enabled: !!id,
  });
}

// Create a new escrow deposit
export function useCreateDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDepositInput) => {
      const { data, error } = await supabase
        .from('escrow_deposits')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: escrowDepositKeys.all });
    },
  });
}

// Verify a deposit (manual QuickBooks check)
export function useVerifyDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: VerifyDepositInput) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deposit-verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            action: 'verify',
            deposit_id: input.deposit_id,
            verified_amount: input.verified_amount,
            verification_notes: input.verification_notes,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to verify deposit');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: escrowDepositKeys.detail(variables.deposit_id) });
      queryClient.invalidateQueries({ queryKey: escrowDepositKeys.lists() });
    },
  });
}

// Update deposit slip number
export function useUpdateDepositSlip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deposit_id, deposit_slip_number }: { deposit_id: string; deposit_slip_number: string }) => {
      const { data, error } = await supabase
        .from('escrow_deposits')
        .update({ deposit_slip_number })
        .eq('id', deposit_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: escrowDepositKeys.detail(variables.deposit_id) });
    },
  });
}

// Delete an escrow deposit (soft delete)
export function useDeleteDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('escrow_deposits')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('reconciliation_status', 'pending') // Can only delete unmatched deposits
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: escrowDepositKeys.all });
    },
  });
}
