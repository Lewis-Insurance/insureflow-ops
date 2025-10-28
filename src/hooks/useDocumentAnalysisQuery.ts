import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useDocumentAnalysisQuery = (documentId: string | null) => {
  return useQuery({
    queryKey: ['document-analysis', documentId],
    queryFn: async () => {
      if (!documentId) return null;

      const { data, error } = await supabase
        .from('document_analysis')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!documentId,
    refetchInterval: (query) => {
      // Poll every 2 seconds while processing
      if (query.state.data?.processing_status === 'pending') {
        return 2000;
      }
      return false;
    }
  });
};

export const useDocumentAnalysisList = (accountId?: string) => {
  return useQuery({
    queryKey: ['document-analysis-list', accountId],
    queryFn: async () => {
      let query = supabase
        .from('document_analysis')
        .select('*, documents(filename, storage_path)')
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });
};

export const useReanalyzeMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      documentUrl: string;
      documentId: string;
      fileName: string;
      accountId?: string;
      userId: string;
      analysisMode?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        'analyze-insurance-document',
        { body: params }
      );

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Reanalysis failed');
      
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['document-analysis', variables.documentId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['document-analysis-list'] 
      });
    }
  });
};
