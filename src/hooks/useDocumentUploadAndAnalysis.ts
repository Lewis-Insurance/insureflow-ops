import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAzureDocumentAnalysis, AnalysisMode } from './useAzureDocumentAnalysis';

interface UploadAndAnalyzeOptions {
  file: File;
  accountId?: string;
  analysisMode?: AnalysisMode;
  workflowContext?: Record<string, any>;
}

export const useDocumentUploadAndAnalysis = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { analyzeDocument, isAnalyzing, progress: analysisProgress } = useAzureDocumentAnalysis();
  const { toast } = useToast();

  const uploadAndAnalyze = async (options: UploadAndAnalyzeOptions) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const { file, accountId, analysisMode = 'all', workflowContext = {} } = options;
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Validate file
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error('File size exceeds 50MB limit');
      }

      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Invalid file type. Supported: PDF, JPEG, PNG, DOCX');
      }

      setUploadProgress(20);

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = accountId ? `${accountId}/${fileName}` : `${user.id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('customer-docs')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      setUploadProgress(50);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('customer-docs')
        .getPublicUrl(filePath);

      setUploadProgress(60);

      // Create document record
      const { data: docRecord, error: docError } = await supabase
        .from('documents')
        .insert({
          account_id: accountId,
          filename: file.name,
          kind: 'document',
          name: file.name,
          category: 'other',
          storage_path: filePath,
          storage_bucket: 'customer-docs',
          file_missing: false,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (docError) {
        throw docError;
      }

      setUploadProgress(80);

      toast({
        title: 'Upload Complete',
        description: 'Starting document analysis...',
      });

      setUploadProgress(100);
      setIsUploading(false);

      // Analyze document
      const analysisResult = await analyzeDocument({
        documentUrl: publicUrl,
        documentId: docRecord.id,
        fileName: file.name,
        accountId: accountId,
        userId: user.id,
        analysisMode: analysisMode,
        workflowContext: workflowContext
      });

      return {
        document: docRecord,
        analysis: analysisResult
      };

    } catch (error) {
      console.error('[Upload & Analysis] Error:', error);
      
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });

      throw error;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return {
    uploadAndAnalyze,
    isUploading,
    uploadProgress,
    isAnalyzing,
    analysisProgress,
    isProcessing: isUploading || isAnalyzing
  };
};
