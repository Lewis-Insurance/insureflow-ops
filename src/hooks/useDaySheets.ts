import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DaySheet, DaySheetFilters } from '@/types/payments';
import { todayLocalDate } from '@/lib/date/localDate';

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
  // Business-timezone "today" (America/New_York), matching the Record Payment
  // form's day_sheet_date default - device-local time booked/printed the wrong
  // sheet for anyone outside ET. Included in the key so it rolls over midnight.
  const today = todayLocalDate();
  return useQuery({
    queryKey: [...daySheetKeys.current(), today],
    queryFn: async () => {

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
