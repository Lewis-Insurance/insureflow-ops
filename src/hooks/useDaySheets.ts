import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DaySheet, DaySheetFilters, CloseDaySheetInput } from '@/types/payments';

// Query keys
export const daySheetKeys = {
  all: ['day-sheets'] as const,
  lists: () => [...daySheetKeys.all, 'list'] as const,
  list: (filters: DaySheetFilters) => [...daySheetKeys.lists(), filters] as const,
  details: () => [...daySheetKeys.all, 'detail'] as const,
  detail: (id: string) => [...daySheetKeys.details(), id] as const,
  current: () => [...daySheetKeys.all, 'current'] as const,
};

// Extended filters interface to support both naming conventions
interface ExtendedDaySheetFilters extends DaySheetFilters {
  startDate?: string;
  endDate?: string;
  status?: 'open' | 'closed' | 'deposited' | DaySheetFilters['status'];
}

// Fetch day sheets with filters
export function useDaySheets(filters: ExtendedDaySheetFilters = {}) {
  return useQuery({
    queryKey: daySheetKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('day_sheets')
        .select('*')
        .is('deleted_at', null)
        .order('sheet_date', { ascending: false });

      // Apply filters - support both naming conventions
      const statusFilter = filters.status;
      if (statusFilter) {
        // Handle both single string and array formats
        const statusArray = Array.isArray(statusFilter) ? statusFilter : [statusFilter];
        if (statusArray.length > 0) {
          query = query.in('status', statusArray);
        }
      }

      // Support both date_from/date_to and startDate/endDate
      const dateFrom = filters.date_from || filters.startDate;
      const dateTo = filters.date_to || filters.endDate;

      if (dateFrom) {
        query = query.gte('sheet_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('sheet_date', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as DaySheet[];
    },
  });
}

// Fetch single day sheet
export function useDaySheet(id: string) {
  return useQuery({
    queryKey: daySheetKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('day_sheets')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) throw error;
      return data as DaySheet;
    },
    enabled: !!id,
  });
}

// Fetch current (today's) open day sheet
export function useCurrentDaySheet() {
  return useQuery({
    queryKey: daySheetKeys.current(),
    queryFn: async () => {
      // Use local date (not UTC) to avoid timezone issues
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('day_sheets')
        .select('*')
        .eq('sheet_date', today)
        .eq('status', 'open')
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;
      return data as DaySheet | null;
    },
  });
}

// Close a day sheet
export function useCloseDaySheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CloseDaySheetInput & { create_deposit?: boolean; bank_account_id?: string }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/day-sheet-close`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify(input),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to close day sheet');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: daySheetKeys.detail(variables.day_sheet_id) });
      queryClient.invalidateQueries({ queryKey: daySheetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: daySheetKeys.current() });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['escrow-deposits'] });
    },
  });
}

// Reopen a day sheet (admin only)
export function useReopenDaySheet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (daySheetId: string) => {
      const { data, error } = await supabase
        .from('day_sheets')
        .update({
          status: 'open',
          closed_at: null,
          closed_by: null,
        })
        .eq('id', daySheetId)
        .eq('status', 'closed') // Can only reopen closed sheets, not deposited
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, daySheetId) => {
      queryClient.invalidateQueries({ queryKey: daySheetKeys.detail(daySheetId) });
      queryClient.invalidateQueries({ queryKey: daySheetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: daySheetKeys.current() });
    },
  });
}

// Add notes to a day sheet
export function useUpdateDaySheetNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ daySheetId, notes }: { daySheetId: string; notes: string }) => {
      const { data, error } = await supabase
        .from('day_sheets')
        .update({ notes })
        .eq('id', daySheetId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: daySheetKeys.detail(variables.daySheetId) });
    },
  });
}
