import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSaveComparisonSession, useUpdateComparisonSession } from '@/hooks/useComparisonSessions';
import type { InsuranceDocument, ComparisonResult } from '@/types/insurance-comparison';

export function useInsuranceComparison() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles1, setUploadedFiles1] = useState<File[]>([]);
  const [uploadedFiles2, setUploadedFiles2] = useState<File[]>([]);
  const [option1, setOption1] = useState<InsuranceDocument | null>(null);
  const [option2, setOption2] = useState<InsuranceDocument | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const saveSession = useSaveComparisonSession();
  const updateSession = useUpdateComparisonSession();

  const processDocuments = async (files: File[], optionNumber: 1 | 2) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Upload files to storage
      const uploadPromises = files.map(async (file) => {
        const filePath = `insurance-comparison/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file);

        if (uploadError) throw uploadError;
        return filePath;
      });

      const paths = await Promise.all(uploadPromises);

      // Process with AI document analysis
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke(
        'ai-document-analysis',
        {
          body: {
            documentPaths: paths,
            analysisType: 'insurance_extraction'
          }
        }
      );

      if (analysisError) throw analysisError;

      const extractedDoc: InsuranceDocument = {
        id: crypto.randomUUID(),
        ...analysisData.extracted,
        effectiveDate: new Date(analysisData.extracted.effectiveDate),
        expirationDate: new Date(analysisData.extracted.expirationDate),
        rawData: analysisData
      };

      if (optionNumber === 1) {
        setOption1(extractedDoc);
      } else {
        setOption2(extractedDoc);
      }

      toast({
        title: 'Success',
        description: `Option ${optionNumber} processed successfully`
      });

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to process documents';
      setError(errorMsg);
      toast({
        title: 'Processing Error',
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const compareOptions = async () => {
    if (!option1 || !option2) {
      toast({
        title: 'Missing Documents',
        description: 'Please upload documents for both options',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Use AI to generate detailed comparison
      const { data, error: compareError } = await supabase.functions.invoke(
        'compare-insurance-options',
        {
          body: {
            option1,
            option2
          }
        }
      );

      if (compareError) throw compareError;

      setComparison(data);

      // Save the comparison session
      if (option1.account_id) {
        const savedSession = await saveSession.mutateAsync({
          accountId: option1.account_id,
          option1,
          option2,
          comparisonResults: data,
          clientName: option1.insuredName,
        });
        
        if (savedSession) {
          setCurrentSessionId(savedSession.id);
        }
      }

      toast({
        title: 'Comparison Complete',
        description: 'Analysis report generated and saved successfully'
      });

    } catch (err: any) {
      toast({
        title: 'Comparison Error',
        description: err.message || 'Failed to compare options',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const uploadFiles = (files: File[], optionNumber: 1 | 2) => {
    if (optionNumber === 1) {
      setUploadedFiles1(files);
    } else {
      setUploadedFiles2(files);
    }
  };

  const processAllDocuments = async () => {
    if (uploadedFiles1.length === 0 || uploadedFiles2.length === 0) {
      toast({
        title: 'Missing Documents',
        description: 'Please upload documents for both options',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Process Option 1
      const paths1 = await uploadToStorage(uploadedFiles1);
      const analysisData1 = await analyzeDocuments(paths1);
      const extractedDoc1: InsuranceDocument = {
        id: crypto.randomUUID(),
        ...analysisData1.extracted,
        effectiveDate: new Date(analysisData1.extracted.effectiveDate),
        expirationDate: new Date(analysisData1.extracted.expirationDate),
        rawData: analysisData1
      };
      setOption1(extractedDoc1);

      // Process Option 2
      const paths2 = await uploadToStorage(uploadedFiles2);
      const analysisData2 = await analyzeDocuments(paths2);
      const extractedDoc2: InsuranceDocument = {
        id: crypto.randomUUID(),
        ...analysisData2.extracted,
        effectiveDate: new Date(analysisData2.extracted.effectiveDate),
        expirationDate: new Date(analysisData2.extracted.expirationDate),
        rawData: analysisData2
      };
      setOption2(extractedDoc2);

      toast({
        title: 'Success',
        description: 'Both documents processed successfully'
      });

    } catch (err: any) {
      const errorMsg = err.message || 'Failed to process documents';
      setError(errorMsg);
      toast({
        title: 'Processing Error',
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const uploadToStorage = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file) => {
      const filePath = `insurance-comparison/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;
      return filePath;
    });

    return Promise.all(uploadPromises);
  };

  const analyzeDocuments = async (paths: string[]) => {
    const { data, error } = await supabase.functions.invoke(
      'ai-document-analysis',
      {
        body: {
          documentPaths: paths,
          analysisType: 'insurance_extraction'
        }
      }
    );

    if (error) throw error;
    return data;
  };

  const reset = () => {
    setUploadedFiles1([]);
    setUploadedFiles2([]);
    setOption1(null);
    setOption2(null);
    setComparison(null);
    setCurrentSessionId(null);
    setError(null);
  };

  return {
    isProcessing,
    uploadedFiles1,
    uploadedFiles2,
    option1,
    option2,
    comparison,
    currentSessionId,
    error,
    uploadFiles,
    processDocuments,
    processAllDocuments,
    compareOptions,
    reset
  };
}
