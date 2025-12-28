import { useMutation } from '@tanstack/react-query';
import { supabase } from '../client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface AnalyzeDocumentParams {
  document_id: string;
  file_name: string;
  account_id?: string;
  user_id: string;
}

interface AnalysisResult {
  success: boolean;
  document_id: string;
  page_count: number;
  text_length: number;
  ocr_text: string;
  analysis: {
    policy_number: string;
    insured_name: string;
    carrier: string;
    document_type: string;
    effective_date: string | null;
    expiration_date: string | null;
    coverages: Array<{
      name: string;
      limit: string;
      deductible: string;
      premium: string;
    }>;
    vehicles: Array<{
      year: string;
      make: string;
      model: string;
      vin: string;
    }>;
    property: {
      type: string;
      address: string;
    };
    premium: {
      total: string;
      frequency: string;
    };
    key_details: string[];
  };
}

export const useDocumentAnalysisSimple = () => {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: AnalyzeDocumentParams): Promise<AnalysisResult> => {
      const { data, error } = await supabase.functions.invoke('ai-document-analysis-simple', {
        body: {
          document_id: params.document_id,
          file_name: params.file_name,
          account_id: params.account_id,
          user_id: params.user_id
        }
      });

      if (error) {
        logger.error('Edge function error:', error);
        throw new Error(`Analysis failed: ${error.message}`);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Analysis failed');
      }

      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Analysis Complete",
        description: `Extracted data from ${data.page_count} pages with ${data.analysis?.coverages?.length || 0} coverages found.`,
      });
    },
    onError: (error: Error) => {
      logger.error('Analysis mutation error:', error);
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });
};
