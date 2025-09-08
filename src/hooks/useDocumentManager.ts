import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { usePermissions } from './usePermissions';

export interface DocumentRecord {
  id: string;
  account_id: string;
  name: string;
  category: string;
  storage_path: string;
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
  uploaded_by?: string;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export function useDocumentManager(accountId?: string) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { canManageDocuments } = usePermissions();

  const fetchDocuments = useCallback(async () => {
    if (!accountId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
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
  }, [accountId]);

  const uploadDocument = useCallback(async (
    file: File,
    category: string = 'other'
  ): Promise<DocumentRecord | null> => {
    if (!canManageDocuments) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to upload documents",
        variant: "destructive",
      });
      return null;
    }

    if (!accountId) {
      toast({
        title: "Error",
        description: "Account ID is required for document upload",
        variant: "destructive",
      });
      return null;
    }

    try {
      setUploading(true);

      // Generate unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${accountId}/${fileName}`;

      // Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Create document record
      const { data: { user } } = await supabase.auth.getUser();
      const documentData = {
        account_id: accountId,
        filename: file.name,
        kind: 'document',
        name: file.name,
        category: category as any, // Type assertion to handle enum mismatch
        storage_path: filePath,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user?.id
      };

      const { data: docRecord, error: dbError } = await supabase
        .from('documents')
        .insert(documentData)
        .select('*')
        .single();

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });

      // Refresh documents list
      await fetchDocuments();
      
      return docRecord;
    } catch (err: any) {
      console.error('Error uploading document:', err);
      toast({
        title: "Upload Failed",
        description: err.message || "Failed to upload document",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  }, [accountId, canManageDocuments, fetchDocuments]);

  const downloadDocument = useCallback(async (document: DocumentRecord) => {
    if (!canManageDocuments) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to download documents",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(document.storage_path, 3600); // 1 hour expiry

      if (error) throw error;

      // Create download link
      const link = window.document.createElement('a');
      link.href = data.signedUrl;
      link.download = document.name;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);

      toast({
        title: "Success",
        description: "Document download started",
      });
    } catch (err: any) {
      console.error('Error downloading document:', err);
      toast({
        title: "Download Failed",
        description: err.message || "Failed to download document",
        variant: "destructive",
      });
    }
  }, [canManageDocuments]);

  const deleteDocument = useCallback(async (documentId: string) => {
    if (!canManageDocuments) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to delete documents",
        variant: "destructive",
      });
      return;
    }

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
  }, [canManageDocuments, fetchDocuments]);

  useEffect(() => {
    if (accountId) {
      fetchDocuments();
    }
  }, [accountId, fetchDocuments]);

  return {
    documents,
    loading,
    uploading,
    uploadDocument,
    downloadDocument,
    deleteDocument,
    refetch: fetchDocuments,
    canManageDocuments
  };
}