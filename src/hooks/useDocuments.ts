import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Document {
  id: string;
  account_id: string | null;
  policy_id: string | null;
  kind: string;
  filename: string;
  storage_path: string;
  file_size: number | null;
  mime_type: string | null;
  pii_level: string | null;
  signature_request_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  account?: {
    id: string;
    name: string;
  };
  policy?: {
    id: string;
    policy_number: string;
    line_of_business: string;
  };
}

interface UseDocumentsOptions {
  accountId?: string;
  policyId?: string;
}

export function useDocuments(options: UseDocumentsOptions = {}) {
  const { accountId, policyId } = options;

  return useQuery({
    queryKey: ['documents', { accountId, policyId }],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select(`
          *,
          account:accounts!documents_account_id_fkey(id, name),
          policy:policies!documents_policy_id_fkey(id, policy_number, line_of_business)
        `)
        .order('created_at', { ascending: false });

      if (policyId) {
        query = query.eq('policy_id', policyId);
      } else if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching documents:', error);
        throw new Error(`Failed to fetch documents: ${error.message}`);
      }

      return (data || []) as Document[];
    },
    enabled: !!(accountId || policyId),
  });
}

export function useDocumentById(documentId: string | undefined) {
  return useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID is required');

      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          account:accounts!documents_account_id_fkey(id, name),
          policy:policies!documents_policy_id_fkey(id, policy_number, line_of_business)
        `)
        .eq('id', documentId)
        .single();

      if (error) throw new Error(`Failed to fetch document: ${error.message}`);
      return data as Document;
    },
    enabled: !!documentId,
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (documentId: string) => {
      // First get the document to find the storage path
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();

      if (fetchError) throw new Error(`Failed to find document: ${fetchError.message}`);

      // Delete from storage if path exists
      if (doc?.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([doc.storage_path]);

        if (storageError) {
          console.warn('Failed to delete from storage:', storageError);
          // Continue with database deletion even if storage fails
        }
      }

      // Delete from database
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw new Error(`Failed to delete document: ${error.message}`);
    },
    onSuccess: () => {
      // Invalidate all document queries regardless of filters
      queryClient.invalidateQueries({ queryKey: ['documents'], refetchType: 'all' });
      toast({ title: 'Document deleted', description: 'The document has been removed.' });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Document> }) => {
      const { error } = await supabase
        .from('documents')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw new Error(`Failed to update document: ${error.message}`);
    },
    onSuccess: () => {
      // Invalidate all document queries regardless of filters
      queryClient.invalidateQueries({ queryKey: ['documents'], refetchType: 'all' });
      toast({ title: 'Document updated', description: 'Changes have been saved.' });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDocumentUrl(storagePath: string | undefined) {
  return useQuery({
    queryKey: ['document-url', storagePath],
    queryFn: async () => {
      if (!storagePath) return null;

      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) {
        console.error('Error creating signed URL:', error);
        return null;
      }

      return data.signedUrl;
    },
    enabled: !!storagePath,
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });
}

