import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  BankStatement,
  BankStatementLine,
  StatementFilters,
  ImportStatementInput,
  DepositMatchSuggestion,
} from '@/types/payments';

// Query keys
export const bankStatementKeys = {
  all: ['bank-statements'] as const,
  lists: () => [...bankStatementKeys.all, 'list'] as const,
  list: (filters: StatementFilters) => [...bankStatementKeys.lists(), filters] as const,
  details: () => [...bankStatementKeys.all, 'detail'] as const,
  detail: (id: string) => [...bankStatementKeys.details(), id] as const,
  lines: (statementId: string) => [...bankStatementKeys.all, 'lines', statementId] as const,
  suggestions: (statementId: string) => [...bankStatementKeys.all, 'suggestions', statementId] as const,
};

// Fetch bank statements with filters
export function useBankStatements(filters: StatementFilters = {}) {
  return useQuery({
    queryKey: bankStatementKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('bank_statements')
        .select(`
          *,
          bank_account:bank_accounts(id, account_name, bank_name)
        `)
        .is('deleted_at', null)
        .order('statement_date', { ascending: false });

      // Apply filters
      if (filters.reconciliation_status?.length) {
        query = query.in('reconciliation_status', filters.reconciliation_status);
      }
      if (filters.date_from) {
        query = query.gte('statement_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('statement_date', filters.date_to);
      }
      if (filters.bank_account_id) {
        query = query.eq('bank_account_id', filters.bank_account_id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as BankStatement[];
    },
  });
}

// Fetch single bank statement with lines
export function useBankStatement(id: string) {
  return useQuery({
    queryKey: bankStatementKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_statements')
        .select(`
          *,
          bank_account:bank_accounts(id, account_name, bank_name),
          lines:bank_statement_lines(*)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data as BankStatement;
    },
    enabled: !!id,
  });
}

// Fetch statement lines
export function useStatementLines(statementId: string) {
  return useQuery({
    queryKey: bankStatementKeys.lines(statementId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_statement_lines')
        .select(`
          *,
          matched_deposit:escrow_deposits(id, deposit_date, total_amount, deposit_slip_number),
          matched_payment:premium_payments(id, receipt_number, amount, payer_name)
        `)
        .eq('statement_id', statementId)
        .order('line_date', { ascending: true });

      if (error) throw error;
      return data as BankStatementLine[];
    },
    enabled: !!statementId,
  });
}

// Fetch match suggestions for a statement
export function useMatchSuggestions(statementId: string) {
  return useQuery({
    queryKey: bankStatementKeys.suggestions(statementId),
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('suggest_deposit_matches', { p_statement_id: statementId });

      if (error) throw error;
      return data as DepositMatchSuggestion[];
    },
    enabled: !!statementId,
  });
}

// Import a bank statement
export function useImportStatement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ImportStatementInput | FormData) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const isFormData = input instanceof FormData;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bank-statement-process`,
        {
          method: 'POST',
          headers: {
            ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: isFormData ? input : JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import statement');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.all });
    },
  });
}

// Match a deposit to a statement line
export function useMatchDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ line_id, deposit_id }: { line_id: string; deposit_id: string }) => {
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
          body: JSON.stringify({ action: 'match', line_id, deposit_id }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to match deposit');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.all });
      queryClient.invalidateQueries({ queryKey: ['escrow-deposits'] });
    },
  });
}

// Unmatch a deposit from a statement line
export function useUnmatchDeposit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ line_id, deposit_id }: { line_id?: string; deposit_id?: string }) => {
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
          body: JSON.stringify({ action: 'unmatch', line_id, deposit_id }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to unmatch deposit');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.all });
      queryClient.invalidateQueries({ queryKey: ['escrow-deposits'] });
    },
  });
}

// Exclude a statement line
export function useExcludeLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ line_id, exclude_reason }: { line_id: string; exclude_reason: string }) => {
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
          body: JSON.stringify({ action: 'exclude', line_id, exclude_reason }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to exclude line');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.all });
    },
  });
}

// Complete reconciliation for a statement
export function useCompleteReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      statement_id,
      reconciled_balance,
      notes,
    }: {
      statement_id: string;
      reconciled_balance?: number;
      notes?: string;
    }) => {
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
          body: JSON.stringify({ action: 'reconcile', statement_id, reconciled_balance, notes }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to complete reconciliation');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.detail(variables.statement_id) });
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.lists() });
    },
  });
}

// Delete a bank statement (soft delete)
export function useDeleteStatement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('bank_statements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bankStatementKeys.all });
    },
  });
}
