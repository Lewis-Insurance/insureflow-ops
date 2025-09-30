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
  // Optional fields present in DB but not always selected
  filename?: string;
  storage_bucket?: string;
  file_missing?: boolean;
}

export function useDocumentManager(accountId?: string) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const { canManageDocuments } = usePermissions();

  const fetchDocuments = useCallback(async () => {
    if (!accountId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('account_id', accountId)
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
        .from('customer-docs')
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
        storage_bucket: 'customer-docs',
        file_missing: false,
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

  const viewDocument = useCallback(async (document: DocumentRecord): Promise<boolean> => {
    if (!canManageDocuments) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to view documents",
        variant: "destructive",
      });
      return false;
    }

    // Normalize legacy paths that accidentally included bucket names
    const normalizePath = (p?: string) =>
      (p || '')
        .replace(/^customer-docs\//, '')
        .replace(/^documents\//, '')
        .replace(/^\/+/, '');

    try {
      const filename = (document as any).filename as string | undefined;
      const preferredBucket = (document as any).storage_bucket as string | undefined;
      const normalizedPath = normalizePath(document.storage_path);
      const candidates: Array<{ bucket: string; path: string }> = [];

      // Prefer the recorded storage_bucket when present
      if (preferredBucket) {
        candidates.push({ bucket: preferredBucket, path: normalizedPath });
      }

      // Always try our known buckets as fallback
      candidates.push(
        { bucket: 'customer-docs', path: normalizedPath },
        { bucket: 'documents', path: normalizedPath },
      );

      // Also try the raw storage_path if it differs from normalized (for older records)
      if (normalizedPath !== document.storage_path) {
        if (preferredBucket) candidates.push({ bucket: preferredBucket, path: document.storage_path });
        candidates.push(
          { bucket: 'customer-docs', path: document.storage_path },
          { bucket: 'documents', path: document.storage_path },
        );
      }

      if (filename) {
        const accountScoped = `${document.account_id}/${filename}`;
        if (preferredBucket) {
          candidates.push(
            { bucket: preferredBucket, path: accountScoped },
            { bucket: preferredBucket, path: filename },
          );
        }
        candidates.push(
          { bucket: 'customer-docs', path: accountScoped },
          { bucket: 'documents', path: accountScoped },
          { bucket: 'customer-docs', path: filename },
          { bucket: 'documents', path: filename },
        );
      }

      for (const c of candidates) {
        const { data } = await supabase.storage.from(c.bucket).createSignedUrl(c.path, 3600);
        if (data?.signedUrl) {
          window.open(data.signedUrl, '_blank');
          return true;
        }
      }

      throw new Error('File not found in storage');
    } catch (err: any) {
      console.error('Error viewing document:', err);
      toast({
        title: "View Failed",
        description: err?.message || "Failed to view document",
        variant: "destructive",
      });
      return false;
    }
  }, [canManageDocuments]);

  const downloadDocument = useCallback(async (document: DocumentRecord) => {
    if (!canManageDocuments) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to download documents",
        variant: "destructive",
      });
      return;
    }

    // Normalize legacy paths that accidentally included bucket names
    const normalizePath = (p?: string) =>
      (p || '')
        .replace(/^customer-docs\//, '')
        .replace(/^documents\//, '')
        .replace(/^\/+/, '');

    try {
      const filename = (document as any).filename as string | undefined;
      const preferredBucket = (document as any).storage_bucket as string | undefined;
      const normalizedPath = normalizePath(document.storage_path);
      const candidates: Array<{ bucket: string; path: string }> = [];

      if (preferredBucket) {
        candidates.push({ bucket: preferredBucket, path: normalizedPath });
      }

      candidates.push(
        { bucket: 'customer-docs', path: normalizedPath },
        { bucket: 'documents', path: normalizedPath },
      );

      if (normalizedPath !== document.storage_path) {
        if (preferredBucket) candidates.push({ bucket: preferredBucket, path: document.storage_path });
        candidates.push(
          { bucket: 'customer-docs', path: document.storage_path },
          { bucket: 'documents', path: document.storage_path },
        );
      }

      if (filename) {
        const accountScoped = `${document.account_id}/${filename}`;
        if (preferredBucket) {
          candidates.push(
            { bucket: preferredBucket, path: accountScoped },
            { bucket: preferredBucket, path: filename },
          );
        }
        candidates.push(
          { bucket: 'customer-docs', path: accountScoped },
          { bucket: 'documents', path: accountScoped },
          { bucket: 'customer-docs', path: filename },
          { bucket: 'documents', path: filename },
        );
      }

      let lastError: any = null;
      for (const c of candidates) {
        const { data, error } = await supabase.storage.from(c.bucket).createSignedUrl(c.path, 3600);
        if (!error && data?.signedUrl) {
          const link = window.document.createElement('a');
          link.href = data.signedUrl;
          link.download = document.name;
          window.document.body.appendChild(link);
          link.click();
          window.document.body.removeChild(link);

          toast({ title: "Success", description: "Document download started" });
          return;
        }
        lastError = error;
      }

      throw lastError || new Error('File not found in storage');
    } catch (err: any) {
      console.error('Error downloading document:', err);
      toast({
        title: "Download Failed",
        description: err.message || "Failed to download document",
        variant: "destructive",
      });
    }
  }, [canManageDocuments]);

  const replaceDocumentFile = useCallback(async (document: DocumentRecord, file: File) => {
    if (!canManageDocuments) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to replace documents",
        variant: "destructive",
      });
      return null;
    }

    try {
      const ext = file.name.split('.').pop();
      const newName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const newPath = `${document.account_id}/${newName}`;

      const { error: uploadErr } = await supabase.storage
        .from('customer-docs')
        .upload(newPath, file, { cacheControl: '3600', upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: updated, error: updErr } = await supabase
        .from('documents')
        .update({
          storage_path: newPath,
          storage_bucket: 'customer-docs',
          file_missing: false,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_at: new Date().toISOString(),
        })
        .eq('id', document.id)
        .select('*')
        .single();

      if (updErr) throw updErr;

      toast({ title: 'Replaced', description: 'Document file updated' });
      await fetchDocuments();
      return updated;
    } catch (err: any) {
      console.error('Error replacing document file:', err);
      toast({
        title: 'Replace Failed',
        description: err.message || 'Failed to replace document file',
        variant: 'destructive',
      });
      return null;
    }
  }, [canManageDocuments, fetchDocuments]);

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

  const checkIntegrity = useCallback(async () => {
    if (!accountId) return;
    
    try {
      setChecking(true);
      const { data, error } = await supabase.functions.invoke('check-document-integrity', {
        body: { account_id: accountId }
      });

      if (error) throw error;

      toast({
        title: 'Integrity Check Complete',
        description: `Checked ${data.checked} documents. ${data.missing} files missing.`,
      });

      // Refresh document list to show updated status
      await fetchDocuments();
      
      return data;
    } catch (err: any) {
      console.error('Error checking integrity:', err);
      toast({
        title: 'Check Failed',
        description: err.message || 'Failed to check document integrity',
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  }, [accountId, fetchDocuments]);

  useEffect(() => {
    if (accountId) {
      fetchDocuments();
    }
  }, [accountId, fetchDocuments]);

  return {
    documents,
    loading,
    uploading,
    checking,
    uploadDocument,
    viewDocument,
    downloadDocument,
    deleteDocument,
    replaceDocumentFile,
    checkIntegrity,
    refetch: fetchDocuments,
    canManageDocuments
  };
}