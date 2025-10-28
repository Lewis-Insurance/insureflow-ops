import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AnalysisMode = 'parse' | 'summarize' | 'classify' | 'insights' | 'workflow' | 'all';

interface DocumentAnalysisOptions {
  documentUrl: string;
  documentId: string;
  fileName: string;
  accountId?: string;
  userId: string;
  analysisMode?: AnalysisMode;
  workflowContext?: Record<string, any>;
}

interface DocumentAnalysisResult {
  success: boolean;
  analysis_id?: string;
  mode?: AnalysisMode;
  data?: any;
  analysis?: any;
  workflow_results?: any[];
  error?: string;
}

export const useAzureDocumentAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const analyzeDocument = async (
    options: DocumentAnalysisOptions
  ): Promise<DocumentAnalysisResult> => {
    setIsAnalyzing(true);
    setProgress(10);

    try {
      setProgress(30);
      
      const { data, error } = await supabase.functions.invoke(
        'analyze-insurance-document',
        {
          body: {
            document_url: options.documentUrl,
            document_id: options.documentId,
            file_name: options.fileName,
            account_id: options.accountId,
            user_id: options.userId,
            analysis_mode: options.analysisMode || 'all',
            workflow_context: options.workflowContext || {}
          }
        }
      );

      setProgress(90);

      if (error) {
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Analysis failed');
      }

      setProgress(100);
      
      toast({
        title: 'Analysis Complete',
        description: `Document analyzed successfully in ${options.analysisMode || 'all'} mode`,
      });

      return data as DocumentAnalysisResult;

    } catch (error) {
      console.error('[Document Analysis] Error:', error);
      
      toast({
        title: 'Analysis Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      setIsAnalyzing(false);
      setProgress(0);
    }
  };

  return {
    analyzeDocument,
    isAnalyzing,
    progress
  };
};
