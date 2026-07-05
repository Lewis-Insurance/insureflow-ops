// ============================================================================
// SUNBIZ LOOKUP HOOK (Commercial Lines SOW v3, feeder #6 - Phase 2)
// ============================================================================
// Client side of the sunbiz-lookup edge fn: name search -> candidates, then
// detail fetch for the picked entity. Suggest-then-confirm: results only fill
// the profile FORM; the agent reviews and saves (Sunbiz-applied fields are
// stamped provenance src='extracted' by the save hook's sources map).
// ============================================================================

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SunbizCandidate {
  name: string;
  document_number: string | null;
  status: string | null;
  detail_url: string;
}

export interface SunbizDetail {
  legal_name: string | null;
  entity_type_raw: string | null;
  entity_type: string | null;
  document_number: string | null;
  fei_ein: string | null;
  status: string | null;
  date_filed: string | null;
  principal_address: string | null;
  registered_agent: string | null;
}

export function useSunbizSearch() {
  return useMutation({
    mutationFn: async (query: string) => {
      const { data, error } = await supabase.functions.invoke('sunbiz-lookup', {
        body: { mode: 'search', query },
      });
      if (error) throw error;
      const body = data as { success?: boolean; candidates?: SunbizCandidate[]; error?: string };
      if (!body?.success) throw new Error(body?.error || 'Sunbiz search failed');
      return body.candidates ?? [];
    },
    onError: (error: Error) => toast.error(`Sunbiz search failed: ${error.message}`),
  });
}

export function useSunbizDetail() {
  return useMutation({
    mutationFn: async (detailUrl: string) => {
      const { data, error } = await supabase.functions.invoke('sunbiz-lookup', {
        body: { mode: 'detail', detail_url: detailUrl },
      });
      if (error) throw error;
      const body = data as { success?: boolean; detail?: SunbizDetail; error?: string };
      if (!body?.success || !body.detail) throw new Error(body?.error || 'Sunbiz detail fetch failed');
      return body.detail;
    },
    onError: (error: Error) => toast.error(`Sunbiz detail failed: ${error.message}`),
  });
}
