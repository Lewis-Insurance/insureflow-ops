import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================
// Types
// ============================================

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

interface UploadOptions {
  file: File;
  accountId?: string;
  analysisMode?: AnalysisMode;
  workflowContext?: Record<string, any>;
  navigateOnComplete?: boolean;
}

interface ComparisonDocument {
  file: File;
  label?: string;
}

// ============================================
// Single Document Analysis Hook
// ============================================

export const useDocumentAnalysis = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

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
        description: 'Document analyzed successfully',
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

  const analyzeAndNavigate = async (
    options: DocumentAnalysisOptions
  ): Promise<void> => {
    const result = await analyzeDocument(options);
    
    if (result.success && result.analysis_id) {
      navigate(`/analyze-documents/${result.analysis_id}`);
    }
  };

  return {
    analyzeDocument,
    analyzeAndNavigate,
    isAnalyzing,
    progress
  };
};

// ============================================
// Document Upload & Analysis Hook
// ============================================

export const useDocumentUploadAndAnalysis = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { analyzeDocument, isAnalyzing, progress: analysisProgress } = useDocumentAnalysis();
  const { toast } = useToast();
  const navigate = useNavigate();

  const uploadAndAnalyze = async (options: UploadOptions) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const { 
        file, 
        accountId, 
        analysisMode = 'all', 
        workflowContext = {},
        navigateOnComplete = false 
      } = options;
      
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

      const { error: uploadError } = await supabase.storage
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

      // Navigate if successful and requested
      if (navigateOnComplete && analysisResult.success && analysisResult.analysis_id) {
        navigate(`/analyze-documents/${analysisResult.analysis_id}`);
      }

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

// ============================================
// Document Comparison Hook
// ============================================

export const useDocumentComparison = () => {
  const [isComparing, setIsComparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();

  const compareDocuments = async (
    documents: ComparisonDocument[],
    accountId?: string
  ) => {
    if (documents.length < 2) {
      throw new Error('Please provide at least 2 documents to compare');
    }

    setIsComparing(true);
    setProgress(0);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      setProgress(10);

      // Upload all documents
      const uploadedDocs = [];
      const progressPerDoc = 40 / documents.length;

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        
        // Upload file
        const fileExt = doc.file.name.split('.').pop();
        const fileName = `${Date.now()}-${i}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = accountId ? `${accountId}/${fileName}` : `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('customer-docs')
          .upload(filePath, doc.file);

        if (uploadError) {
          throw uploadError;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('customer-docs')
          .getPublicUrl(filePath);

        // Create document record
        const { data: docRecord, error: docError } = await supabase
          .from('documents')
          .insert({
            account_id: accountId,
            filename: doc.file.name,
            kind: 'document',
            name: doc.file.name,
            category: 'other',
            storage_path: filePath,
            storage_bucket: 'customer-docs',
            file_missing: false,
            mime_type: doc.file.type,
            size_bytes: doc.file.size,
            uploaded_by: user.id
          })
          .select()
          .single();

        if (docError) {
          throw docError;
        }

        uploadedDocs.push({
          document_id: docRecord.id,
          document_url: publicUrl,
          file_name: doc.file.name,
          label: doc.label || `Option ${i + 1}`
        });

        setProgress(10 + (i + 1) * progressPerDoc);
      }

      setProgress(50);

      // Analyze all documents
      const analysisResults = [];
      const analysisProgressPerDoc = 30 / uploadedDocs.length;

      for (let i = 0; i < uploadedDocs.length; i++) {
        const doc = uploadedDocs[i];
        
        const { data, error } = await supabase.functions.invoke(
          'analyze-insurance-document',
          {
            body: {
              document_url: doc.document_url,
              document_id: doc.document_id,
              file_name: doc.file_name,
              account_id: accountId,
              user_id: user.id,
              analysis_mode: 'parse',
              workflow_context: {
                comparison_mode: true,
                document_label: doc.label
              }
            }
          }
        );

        if (error) {
          throw error;
        }

        analysisResults.push({
          ...doc,
          analysis: data
        });

        setProgress(50 + (i + 1) * analysisProgressPerDoc);
      }

      setProgress(80);

      // Create comparison session
      const { data: sessionData, error: sessionError } = await supabase
        .from('comparison_sessions')
        .insert({
          account_id: accountId,
          created_by: user.id,
          option1_data: analysisResults[0],
          option2_data: analysisResults[1] || null,
          comparison_results: {
            documents: analysisResults,
            created_at: new Date().toISOString()
          },
          status: 'complete'
        })
        .select()
        .single();

      if (sessionError) {
        throw sessionError;
      }

      setProgress(100);

      toast({
        title: 'Comparison Complete',
        description: `Successfully compared ${documents.length} documents`,
      });

      // Navigate to comparison page
      navigate(`/comparison/${sessionData.id}`);

      return {
        session_id: sessionData.id,
        documents: analysisResults
      };

    } catch (error) {
      console.error('[Document Comparison] Error:', error);
      
      toast({
        title: 'Comparison Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });

      throw error;
    } finally {
      setIsComparing(false);
      setProgress(0);
    }
  };

  return {
    compareDocuments,
    isComparing,
    progress
  };
};

// ============================================
// Query Hooks
// ============================================

export const useDocumentAnalysisQuery = (analysisId: string | null) => {
  return useQuery({
    queryKey: ['document-analysis', analysisId],
    queryFn: async () => {
      if (!analysisId) return null;

      const { data, error } = await supabase
        .from('document_analysis')
        .select('*, documents(filename, storage_path, mime_type)')
        .eq('id', analysisId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!analysisId,
    refetchInterval: (query) => {
      // Poll every 2 seconds while processing
      if (query.state.data?.processing_status === 'pending') {
        return 2000;
      }
      return false;
    }
  });
};

export const useDocumentAnalysisByDocumentId = (documentId: string | null) => {
  return useQuery({
    queryKey: ['document-analysis-by-doc', documentId],
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
    enabled: !!documentId
  });
};

export const useDocumentAnalysisList = (accountId?: string) => {
  return useQuery({
    queryKey: ['document-analysis-list', accountId],
    queryFn: async () => {
      let query = supabase
        .from('document_analysis')
        .select('*, documents(filename, storage_path, mime_type)')
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

export const useComparisonSessionQuery = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['comparison-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from('comparison_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!sessionId
  });
};

export const useComparisonSessionsList = (accountId?: string) => {
  return useQuery({
    queryKey: ['comparison-sessions-list', accountId],
    queryFn: async () => {
      let query = supabase
        .from('comparison_sessions')
        .select('*')
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
    mutationFn: async (params: DocumentAnalysisOptions) => {
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
        queryKey: ['document-analysis'] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['document-analysis-by-doc', variables.documentId] 
      });
    }
  });
};
