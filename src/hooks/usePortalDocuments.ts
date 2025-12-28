// ============================================================================
// PORTAL DOCUMENTS HOOK
// ============================================================================
// Document access with RPC-based downloads
// ============================================================================

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PortalDocument } from '@/types/portal';
import { logger } from '@/lib/logger';

export function usePortalDocuments(policyId?: string) {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['portal-documents', policyId],
    queryFn: async () => {
      let query = supabase
        .from('portal_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (policyId) {
        query = query.eq('policy_id', policyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PortalDocument[];
    },
  });

  // Get signed URL for document download via Edge Function
  const getDocumentUrl = useCallback(async (documentId: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('get-document-url', {
      body: { documentId },
    });

    if (error) {
      logger.error('Document URL error:', error);
      throw new Error(error.message || 'Failed to get document URL');
    }

    return data.url;
  }, []);

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['portal-documents', policyId] });
  }, [queryClient, policyId]);

  return {
    documents: documentsQuery.data ?? [],
    isLoading: documentsQuery.isLoading,
    error: documentsQuery.error,
    refetch,
    getDocumentUrl,
  };
}
