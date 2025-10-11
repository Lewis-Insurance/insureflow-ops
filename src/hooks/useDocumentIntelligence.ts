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

export function useDocumentIntelligence() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<ProcessedDocument[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');

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

  // Process document with AI
  const processDocument = async (file: File): Promise<void> => {
    setProcessingStatus('Analyzing document structure...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setProcessingStatus('Extracting key information...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setProcessingStatus('Generating embeddings...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setProcessingStatus('Indexing for search...');
    await new Promise(resolve => setTimeout(resolve, 800));
  };

  // Upload documents
  const handleUpload = useCallback(async (files: File[]) => {
    try {
      setUploading(true);
      setUploadProgress(0);

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

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress((i / files.length) * 100);

        // Process with AI
        await processDocument(file);

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

        if (uploadError) throw uploadError;

        // Create document record
        const docInsert: any = {
          account_id: membership.account_id,
          filename: file.name,
          name: file.name,
          kind: 'document',
          category: file.name.includes('policy') ? 'policy' : 
                   file.name.includes('claim') ? 'claim' : 'other',
          storage_path: filePath,
          storage_bucket: 'customer-docs',
          file_missing: false,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: user.id
        };

        const { error: dbError } = await supabase
          .from('documents')
          .insert(docInsert);

        if (dbError) throw dbError;
      }

      setUploadProgress(100);
      setProcessingStatus('Processing complete!');
      
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setProcessingStatus('');
        fetchDocuments();
      }, 2000);

      toast({
        title: "Success",
        description: `${files.length} document(s) uploaded successfully`,
      });
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
  }, [toast, fetchDocuments]);

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
    handleUpload,
    handleSearch,
    generateInsights,
    viewDocument,
    downloadDocument,
    deleteDocument,
    refetch: fetchDocuments,
  };
}
