import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Coverage {
  type: string;
  limit: string;
  deductible?: string;
  premium?: number;
}

export interface InsuredItem {
  type: 'vehicle' | 'property' | 'business';
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  address?: string;
}

export interface DocumentAnalysis {
  id: string;
  document_id: string;
  file_name: string;
  carrier_name: string | null;
  policy_number: string | null;
  policy_type: string | null;
  insured_name: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  total_premium: number | null;
  payment_frequency: string | null;
  coverages: Coverage[];
  insured_items: InsuredItem[];
  raw_ocr_text: string | null;
  confidence_score: number;
  processing_status: 'pending' | 'complete' | 'error';
  error_message: string | null;
  created_at: string;
}

export const useDocumentAnalysis = (documentId?: string) => {
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
      if (!data) return null;

      return {
        ...data,
        coverages: (data.coverages as unknown as Coverage[]) || [],
        insured_items: (data.insured_items as unknown as InsuredItem[]) || [],
      } as DocumentAnalysis;
    },
    enabled: !!documentId,
    refetchInterval: (query) => {
      // Poll every 3 seconds if still pending
      return query.state.data?.processing_status === 'pending' ? 3000 : false;
    }
  });
};

export const useAnalyzeDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      document_url,
      document_id,
      file_name,
      account_id
    }: {
      document_url: string;
      document_id: string;
      file_name: string;
      account_id: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('analyze-insurance-document', {
        body: {
          document_url,
          document_id,
          file_name,
          account_id,
          user_id: user.id
        }
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document-analysis'] });
      toast.success('Document analyzed successfully');
    },
    onError: (error: Error) => {
      console.error('Analysis error:', error);
      toast.error(`Analysis failed: ${error.message}`);
    }
  });
};

export const useAllDocumentAnalyses = () => {
  return useQuery({
    queryKey: ['all-document-analyses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_analysis')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        coverages: (item.coverages as unknown as Coverage[]) || [],
        insured_items: (item.insured_items as unknown as InsuredItem[]) || [],
      })) as DocumentAnalysis[];
    }
  });
};
