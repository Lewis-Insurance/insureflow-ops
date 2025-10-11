import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ProcessedDocument {
  id: string;
  name: string;
  category: string;
  size: string;
  uploadDate: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  confidence?: number;
  entities?: {
    policyNumber?: string;
    insuredName?: string;
    coverage?: string;
    premium?: string;
    effectiveDate?: string;
    expiryDate?: string;
  };
  keyTerms?: string[];
  riskScore?: number;
  complianceStatus?: string;
  storage_path?: string;
  storage_bucket?: string;
}

interface SearchResult {
  id: string;
  document: string;
  excerpt: string;
  relevance: number;
  page: number;
  context: string;
}

interface Insight {
  id: string;
  type: 'risk' | 'opportunity' | 'compliance' | 'trend';
  title: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
  value: string;
}

interface BatchStatus {
  batchId: string;
  total: number;
  completed: number;
  processing: number;
  queued: number;
  failed: number;
}

export function useDocumentIntelligence() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [activeBatches, setActiveBatches] = useState<BatchStatus[]>([]);

  // Fetch documents from database
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all documents accessible to the user
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform to processed format
      const processed: ProcessedDocument[] = (data || []).map(doc => ({
        id: doc.id,
        name: doc.name || doc.filename || 'Untitled',
        category: doc.category || 'other',
        size: doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(2)} KB` : 'Unknown',
        uploadDate: doc.uploaded_at || doc.created_at,
        status: 'processed',
        storage_path: doc.storage_path,
        storage_bucket: doc.storage_bucket,
      }));

      setDocuments(processed);
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Poll batch status
  const pollBatchStatus = useCallback(async (batchId: string) => {
    try {
      const { data, error } = await supabase
        .from('document_batch_summary')
        .select('*')
        .eq('batch_id', batchId)
        .single();

      if (error) throw error;

      if (data) {
        const status: BatchStatus = {
          batchId: data.batch_id,
          total: data.total_files,
          completed: data.completed,
          processing: data.processing,
          queued: data.queued,
          failed: data.failed
        };

        setActiveBatches(prev => {
          const filtered = prev.filter(b => b.batchId !== batchId);
          if (status.queued > 0 || status.processing > 0) {
            return [...filtered, status];
          }
          return filtered;
        });

        // Update progress
        const progress = (status.completed / status.total) * 100;
        setUploadProgress(progress);

        // Update status message
        if (status.processing > 0) {
          setProcessingStatus(`Processing ${status.processing} of ${status.total} documents...`);
        } else if (status.queued > 0) {
          setProcessingStatus(`Queued: ${status.queued} documents waiting...`);
        } else if (status.completed === status.total) {
          setProcessingStatus('All documents processed!');
          setUploading(false);
          fetchDocuments();
          toast({
            title: "Success",
            description: `${status.total} document(s) processed successfully`,
          });
        } else if (status.failed > 0) {
          setProcessingStatus(`Completed with ${status.failed} failed documents`);
        }

        // Continue polling if not done
        if (status.queued > 0 || status.processing > 0) {
          setTimeout(() => pollBatchStatus(batchId), 2000);
        }
      }
    } catch (err) {
      console.error('Error polling batch status:', err);
    }
  }, [fetchDocuments, toast]);

  // Upload documents using queue system
  const handleUpload = useCallback(async (files: File[]) => {
    try {
      setUploading(true);
      setUploadProgress(0);
      setProcessingStatus('Preparing upload...');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to upload documents",
          variant: "destructive",
        });
        return;
      }

      // Get user's account
      const { data: membership } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (!membership) {
        toast({
          title: "Error",
          description: "No account found",
          variant: "destructive",
        });
        return;
      }

      // Generate batch ID
      const batchId = crypto.randomUUID();
      const queueItems = [];

      setProcessingStatus('Uploading files to storage...');

      // Upload files to storage and create queue items
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = ((i + 1) / files.length) * 50; // First 50% for uploads
        setUploadProgress(progress);

        // Upload to storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${membership.account_id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('customer-docs')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error(`Failed to upload ${file.name}:`, uploadError);
          continue;
        }

        // Add to queue items
        queueItems.push({
          account_id: membership.account_id,
          batch_id: batchId,
          file_name: file.name,
          file_size: file.size,
          storage_path: filePath,
          status: 'queued',
          priority: 0,
          metadata: {
            mime_type: file.type,
            original_name: file.name
          }
        });
      }

      if (queueItems.length === 0) {
        throw new Error('No files were uploaded successfully');
      }

      setProcessingStatus('Adding documents to processing queue...');

      // Insert all queue items
      const { error: queueError } = await supabase
        .from('document_processing_queue')
        .insert(queueItems);

      if (queueError) throw queueError;

      setProcessingStatus('Starting batch processing...');

      // Trigger batch processing
      const { error: processError } = await supabase.functions.invoke('process-document-batch', {
        body: { batchId, maxConcurrent: 3 }
      });

      if (processError) throw processError;

      toast({
        title: "Upload Complete",
        description: `${files.length} documents queued for processing`,
      });

      // Start polling for status
      pollBatchStatus(batchId);

    } catch (err: any) {
      console.error('Error uploading documents:', err);
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to upload documents",
        variant: "destructive",
      });
      setUploading(false);
      setUploadProgress(0);
      setProcessingStatus('');
    }
  }, [toast, pollBatchStatus]);

  // AI-powered search
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) return;
    
    try {
      setLoading(true);

      // Call AI edge function for semantic search
      const { data, error } = await supabase.functions.invoke('ai-document-intelligence', {
        body: {
          action: 'search',
          query: query,
          documents: documents.map(d => ({
            id: d.id,
            name: d.name,
            category: d.category,
          }))
        }
      });

      if (error) throw error;

      setSearchResults(data.results || []);
    } catch (err: any) {
      console.error('Error searching documents:', err);
      toast({
        title: "Search Failed",
        description: err.message || "Failed to search documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [documents, toast]);

  // Generate AI insights
  const generateInsights = useCallback(async () => {
    if (documents.length === 0) return;
    
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('ai-document-intelligence', {
        body: {
          action: 'generate_insights',
          documents: documents.map(d => ({
            id: d.id,
            name: d.name,
            category: d.category,
            uploadDate: d.uploadDate,
          }))
        }
      });

      if (error) throw error;

      setInsights(data.insights || []);
    } catch (err: any) {
      console.error('Error generating insights:', err);
      toast({
        title: "Insights Generation Failed",
        description: err.message || "Failed to generate insights",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [documents, toast]);

  // View document
  const viewDocument = useCallback(async (doc: ProcessedDocument) => {
    try {
      if (!doc.storage_bucket || !doc.storage_path) {
        toast({
          title: "Error",
          description: "Document storage information not found",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 3600);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No signed URL returned');

      window.open(data.signedUrl, '_blank');
    } catch (err: any) {
      console.error('Error viewing document:', err);
      toast({
        title: "View Failed",
        description: err.message || "Failed to view document",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Download document
  const downloadDocument = useCallback(async (doc: ProcessedDocument) => {
    try {
      if (!doc.storage_bucket || !doc.storage_path) {
        toast({
          title: "Error",
          description: "Document storage information not found",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 3600);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('No signed URL returned');

      const link = document.createElement('a');
      link.href = data.signedUrl;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Success", description: "Document download started" });
    } catch (err: any) {
      console.error('Error downloading document:', err);
      toast({
        title: "Download Failed",
        description: err.message || "Failed to download document",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Delete document
  const deleteDocument = useCallback(async (documentId: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Document deleted successfully",
      });

      await fetchDocuments();
    } catch (err: any) {
      console.error('Error deleting document:', err);
      toast({
        title: "Delete Failed",
        description: err.message || "Failed to delete document",
        variant: "destructive",
      });
    }
  }, [toast, fetchDocuments]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  return {
    documents,
    insights,
    searchResults,
    loading,
    uploading,
    uploadProgress,
    processingStatus,
    activeBatches,
    handleUpload,
    handleSearch,
    generateInsights,
    viewDocument,
    downloadDocument,
    deleteDocument,
    refetch: fetchDocuments,
  };
}
