/**
 * Rate Watch Hooks
 * 
 * React Query hooks for the Rate Watch module.
 * Handles jobs, documents, and customer lookup.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

export type RateWatchStatus = 'draft' | 'uploading' | 'processing' | 'analyzing' | 'completed' | 'failed';
export type RateWatchDocumentType = 'current_policy' | 'renewal' | 'quote';
export type ExtractionStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RateWatchJob {
  id: string;
  account_id: string;
  job_name: string;
  line_of_business: string;
  status: RateWatchStatus;
  current_premium: number | null;
  renewal_premium: number | null;
  premium_change_amount: number | null;
  premium_change_pct: number | null;
  comparison_result: Record<string, unknown> | null;
  coverage_gaps: Record<string, unknown>[] | null;
  recommendation: string | null;
  email_subject: string | null;
  email_body: string | null;
  email_sent_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  accounts?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
}

export interface RateWatchDocument {
  id: string;
  job_id: string;
  document_type: RateWatchDocumentType;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  carrier_name: string | null;
  extracted_premium: number | null;
  extracted_coverages: Record<string, unknown> | null;
  extracted_vehicles: Record<string, unknown>[] | null;
  extraction_status: ExtractionStatus;
  extraction_error: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface CreateRateWatchJobInput {
  account_id: string;
  job_name: string;
  line_of_business: string;
}

export interface UploadDocumentInput {
  job_id: string;
  document_type: RateWatchDocumentType;
  file: File;
  carrier_name?: string;
}

export const LINE_OF_BUSINESS_OPTIONS = [
  'Personal Auto',
  'Personal Home',
  'Personal Umbrella',
  'Personal Package',
  'Commercial Auto',
  'Commercial Property',
  'Commercial Package',
  'Workers Compensation',
  'General Liability',
  'Professional Liability',
  'Cyber Liability',
] as const;

export const RATE_WATCH_STATUS_CONFIG: Record<RateWatchStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  uploading: { label: 'Uploading', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  processing: { label: 'Processing', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  analyzing: { label: 'Analyzing', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  completed: { label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100' },
  failed: { label: 'Failed', color: 'text-red-600', bgColor: 'bg-red-100' },
};

// =============================================================================
// JOB HOOKS
// =============================================================================

/**
 * List all rate watch jobs with account info
 */
export function useRateWatchJobs() {
  return useQuery({
    queryKey: ['rate-watch-jobs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_watch_jobs')
        .select(`
          *,
          accounts (id, name, email, phone)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as RateWatchJob[];
    },
  });
}

/**
 * Get single rate watch job with account info
 */
export function useRateWatchJob(jobId: string | null) {
  return useQuery({
    queryKey: ['rate-watch-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;

      const { data, error } = await supabase
        .from('rate_watch_jobs')
        .select(`
          *,
          accounts (id, name, email, phone)
        `)
        .eq('id', jobId)
        .single();

      if (error) throw error;
      return data as RateWatchJob;
    },
    enabled: !!jobId,
  });
}

/**
 * Create a new rate watch job
 */
export function useCreateRateWatchJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateRateWatchJobInput) => {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('rate_watch_jobs')
        .insert({
          account_id: input.account_id,
          job_name: input.job_name,
          line_of_business: input.line_of_business,
          created_by: user.id,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;
      return data as RateWatchJob;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-jobs'] });
      toast({ title: 'Success', description: 'Rate watch job created' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create job',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update a rate watch job
 */
export function useUpdateRateWatchJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ jobId, updates }: { jobId: string; updates: Partial<RateWatchJob> }) => {
      const { data, error } = await supabase
        .from('rate_watch_jobs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .select()
        .single();

      if (error) throw error;
      return data as RateWatchJob;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['rate-watch-job', data.id] });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update job',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Delete a rate watch job
 */
export function useDeleteRateWatchJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('rate_watch_jobs')
        .delete()
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-jobs'] });
      toast({ title: 'Success', description: 'Rate watch job deleted' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete job',
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// DOCUMENT HOOKS
// =============================================================================

/**
 * List documents for a job
 */
export function useRateWatchDocuments(jobId: string | null) {
  return useQuery({
    queryKey: ['rate-watch-documents', jobId],
    queryFn: async () => {
      if (!jobId) return [];

      const { data, error } = await supabase
        .from('rate_watch_documents')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as RateWatchDocument[];
    },
    enabled: !!jobId,
  });
}

/**
 * Upload a document to storage and create record
 */
export function useUploadRateWatchDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UploadDocumentInput) => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      // Generate unique file path
      const ext = input.file.name.split('.').pop() || 'pdf';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      const filePath = `rate-watch/${input.job_id}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, input.file, {
          contentType: input.file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Create document record
      const { data, error } = await supabase
        .from('rate_watch_documents')
        .insert({
          job_id: input.job_id,
          document_type: input.document_type,
          file_name: input.file.name,
          file_path: filePath,
          file_size: input.file.size,
          mime_type: input.file.type,
          carrier_name: input.carrier_name || null,
          uploaded_by: user.id,
          extraction_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as RateWatchDocument;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-documents', data.job_id] });
      toast({ title: 'Uploaded', description: `${data.file_name} uploaded successfully` });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Upload Failed', 
        description: error.message || 'Failed to upload document',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Delete a document from storage and database
 */
export function useDeleteRateWatchDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ documentId, filePath, jobId }: { documentId: string; filePath: string; jobId: string }) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([filePath]);

      // Continue even if storage delete fails (file might not exist)
      if (storageError) {
        logger.warn('Storage delete warning:', storageError);
      }

      // Delete record
      const { error } = await supabase
        .from('rate_watch_documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;
      return { jobId };
    },
    onSuccess: ({ jobId }) => {
      queryClient.invalidateQueries({ queryKey: ['rate-watch-documents', jobId] });
      toast({ title: 'Deleted', description: 'Document deleted' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Get signed URL for document preview/download
 */
export async function getRateWatchDocumentUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600); // 1 hour

  if (error) {
    logger.error('Error creating signed URL:', error);
    return null;
  }

  return data.signedUrl;
}

// =============================================================================
// ACCOUNT SEARCH HOOK
// =============================================================================

/**
 * Search accounts for the customer dropdown
 */
export function useAccountsForRateWatch(searchQuery: string) {
  return useQuery({
    queryKey: ['rate-watch-accounts', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('accounts')
        .select('id, name, email, phone, type, city, state')
        .order('name', { ascending: true })
        .limit(25);

      if (searchQuery && searchQuery.length >= 2) {
        query = query.ilike('name', `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data || [];
    },
    enabled: true,
    staleTime: 30000, // Cache for 30 seconds
  });
}

// =============================================================================
// COMBINED HOOK FOR DETAIL PAGE
// =============================================================================

/**
 * Get job with all documents in one hook
 */
export function useRateWatchJobWithDocuments(jobId: string | null) {
  const jobQuery = useRateWatchJob(jobId);
  const documentsQuery = useRateWatchDocuments(jobId);

  return {
    job: jobQuery.data,
    documents: documentsQuery.data || [],
    isLoading: jobQuery.isLoading || documentsQuery.isLoading,
    error: jobQuery.error || documentsQuery.error,
    refetch: () => {
      jobQuery.refetch();
      documentsQuery.refetch();
    },
  };
}


