/**
 * React Query hooks for Document Collection module
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// TYPES
// =============================================================================

export interface CollectionPacket {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  account_id: string | null;
  policy_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  accounts?: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
  policies?: {
    id: string;
    policy_number: string;
    carrier_info: any;
  };
}

export interface CollectionRequirement {
  id: string;
  workspace_id: string;
  doc_type: string;
  label: string;
  instructions: string | null;
  is_required: boolean;
  min_quantity: number;
  max_quantity: number;
  accepted_file_types: string[];
  max_file_size_mb: number;
  acord_form_id: string | null;
  status: 'not_requested' | 'requested' | 'uploaded' | 'processing' | 'needs_review' | 'accepted' | 'rejected' | 'expired';
  display_order: number;
  created_at: string;
  updated_at: string;
  collection_uploads?: CollectionUpload[];
}

export interface CollectionUpload {
  id: string;
  requirement_id: string;
  document_id: string | null;
  extraction_id: string | null;
  filename: string;
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  upload_channel: 'portal' | 'email' | 'agent_upload' | 'api';
  processing_status: 'pending' | 'processing' | 'extracted' | 'failed';
  review_status: 'pending' | 'in_review' | 'accepted' | 'rejected' | 'needs_changes';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  client_feedback: string | null;
  created_at: string;
}

export interface CollectionTemplate {
  id: string;
  name: string;
  description: string | null;
  use_case: string | null;
  line_of_business: string | null;
  requirements: Array<{
    doc_type: string;
    label: string;
    instructions?: string;
    is_required?: boolean;
    min_quantity?: number;
    max_quantity?: number;
  }>;
  default_expiration_days: number;
  is_active: boolean;
  is_system: boolean;
}

export interface CollectionStatusSummary {
  total_requirements: number;
  required_count: number;
  completed_count: number;
  pending_review_count: number;
  rejected_count: number;
  not_started_count: number;
  all_required_complete: boolean;
  progress_percent: number;
}

export interface CreatePacketRequest {
  account_id: string;
  policy_id?: string;
  name: string;
  description?: string;
  template_id?: string;
  requirements?: Array<{
    doc_type: string;
    label: string;
    instructions?: string;
    is_required?: boolean;
  }>;
  recipient_email?: string;
  recipient_name?: string;
  expires_days?: number;
}

// =============================================================================
// QUERY HOOKS
// =============================================================================

/**
 * Get all collection packets for an account
 */
export function useCollectionPackets(accountId: string | null) {
  return useQuery({
    queryKey: ['collection-packets', accountId],
    queryFn: async () => {
      if (!accountId) return [];

      try {
        const { data, error } = await supabase
          .from('workspaces')
          .select(`
            *,
            accounts (id, name, email, phone),
            policies (id, policy_number, carrier_info)
          `)
          .eq('account_id', accountId)
          .eq('task_type', 'document_collection')
          .order('created_at', { ascending: false });

        if (error) {
          console.warn('[useCollectionPackets] Query error:', error);
          return [];
        }
        return (data || []) as CollectionPacket[];
      } catch (err) {
        console.warn('[useCollectionPackets] Error:', err);
        return [];
      }
    },
    enabled: !!accountId,
  });
}

/**
 * Get a single collection packet with its requirements
 */
export function useCollectionPacket(workspaceId: string | null) {
  return useQuery({
    queryKey: ['collection-packet', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'get_packet_data',
            workspace_id: workspaceId,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      // Poll if any requirements are processing
      const data = query.state.data;
      const hasProcessing = data?.requirements?.some(
        (r: CollectionRequirement) => r.status === 'processing'
      );
      return hasProcessing ? 3000 : false;
    },
  });
}

/**
 * Get requirements for a packet
 */
export function useCollectionRequirements(workspaceId: string | null) {
  return useQuery({
    queryKey: ['collection-requirements', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from('collection_requirements')
        .select(`
          *,
          collection_uploads (*)
        `)
        .eq('workspace_id', workspaceId)
        .order('display_order');

      if (error) throw error;
      return data as CollectionRequirement[];
    },
    enabled: !!workspaceId,
  });
}

/**
 * Get collection templates
 */
export function useCollectionTemplates(useCase?: string) {
  return useQuery({
    queryKey: ['collection-templates', useCase],
    queryFn: async () => {
      let query = supabase
        .from('collection_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (useCase) {
        query = query.eq('use_case', useCase);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CollectionTemplate[];
    },
  });
}

/**
 * Get status summary for a packet
 */
export function useCollectionStatusSummary(workspaceId: string | null) {
  return useQuery({
    queryKey: ['collection-status-summary', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase.rpc('get_collection_status_summary', {
        p_workspace_id: workspaceId,
      });

      if (error) throw error;
      return data as CollectionStatusSummary;
    },
    enabled: !!workspaceId,
  });
}

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Create a new collection packet
 */
export function useCreateCollectionPacket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (request: CreatePacketRequest) => {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'create_packet',
            ...request,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collection-packets', variables.account_id] });
      toast({
        title: 'Packet Created',
        description: data.portal_url 
          ? 'Collection packet created with portal link.'
          : 'Collection packet created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Generate a new portal access token
 */
export function useGeneratePortalToken() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      workspace_id: string;
      recipient_email?: string;
      recipient_name?: string;
      expires_days?: number;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'generate_token',
            ...params,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: () => {
      toast({
        title: 'Link Generated',
        description: 'Portal access link has been generated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update a requirement's status
 */
export function useUpdateRequirementStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: string;
      notes?: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'update_requirement_status',
            ...params,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['collection-packet'] });
      queryClient.invalidateQueries({ queryKey: ['collection-status-summary'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update an upload's review status
 */
export function useUpdateUploadStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: 'pending' | 'in_review' | 'accepted' | 'rejected' | 'needs_changes';
      notes?: string;
      rejection_reason?: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'update_upload_status',
            ...params,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['collection-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['collection-packet'] });
      queryClient.invalidateQueries({ queryKey: ['collection-status-summary'] });
      
      const statusMessages: Record<string, string> = {
        accepted: 'Document accepted',
        rejected: 'Document rejected',
        needs_changes: 'Requested changes from client',
      };
      
      toast({
        title: statusMessages[variables.status] || 'Status Updated',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Send a reminder for a packet
 */
export function useSendReminder() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'send_reminder',
            workspace_id: workspaceId,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (data) => {
      toast({
        title: 'Reminder Queued',
        description: `Reminder will be sent to ${data.recipients} recipient(s).`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Upload a document (agent upload)
 */
export function useAgentUpload() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      requirement_id: string;
      file: File;
    }) => {
      const { requirement_id, file } = params;

      // Get requirement to find workspace and account
      const { data: requirement } = await supabase
        .from('collection_requirements')
        .select('workspace_id, workspaces!inner(account_id)')
        .eq('id', requirement_id)
        .single();

      if (!requirement) throw new Error('Requirement not found');

      // Upload file to storage
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `collection/${requirement.workspace_id}/${requirement_id}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('customer-docs')
        .upload(filePath, file);

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create document record
      const { data: document } = await supabase
        .from('documents')
        .insert({
          account_id: (requirement.workspaces as any).account_id,
          uploaded_by: user?.id,
          path: filePath,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
        })
        .select()
        .single();

      // Create upload record
      const { data: upload, error: uploadRecordError } = await supabase
        .from('collection_uploads')
        .insert({
          requirement_id,
          document_id: document?.id,
          filename: file.name,
          file_path: filePath,
          file_size_bytes: file.size,
          mime_type: file.type,
          upload_channel: 'agent_upload',
          uploaded_by_profile_id: user?.id,
          processing_status: 'pending',
          review_status: 'pending',
        })
        .select()
        .single();

      if (uploadRecordError) throw uploadRecordError;

      return upload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['collection-packet'] });
      queryClient.invalidateQueries({ queryKey: ['collection-status-summary'] });
      toast({
        title: 'Document Uploaded',
        description: 'Document has been uploaded and is being processed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// PORTAL HOOKS (for unauthenticated access)
// =============================================================================

/**
 * Validate a portal token and get packet data (secure, client-safe)
 */
export function usePortalPacket(token: string | null) {
  return useQuery({
    queryKey: ['portal-packet', token],
    queryFn: async () => {
      if (!token) return null;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWFqendjbWR3YWhuanlpZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyODk5OTksImV4cCI6MjA3Mjg2NTk5OX0.Pyob4fMYhHjHhVCxhP2UdSSMAv6i9eqmLD-lxavfV5s',
          },
          body: JSON.stringify({
            action: 'portal_get_packet',
            token,
          }),
        }
      );

      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      return result;
    },
    enabled: !!token,
    retry: 1,
    staleTime: 30000, // Cache for 30 seconds
  });
}

/**
 * Mark portal submission as complete
 */
export function usePortalSubmitComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWFqendjbWR3YWhuanlpZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyODk5OTksImV4cCI6MjA3Mjg2NTk5OX0.Pyob4fMYhHjHhVCxhP2UdSSMAv6i9eqmLD-lxavfV5s',
          },
          body: JSON.stringify({
            action: 'portal_submit_complete',
            token,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (_, token) => {
      queryClient.invalidateQueries({ queryKey: ['portal-packet', token] });
    },
  });
}

/**
 * Upload a document via portal
 */
export function usePortalUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      token: string;
      requirement_id: string;
      file: File;
    }) => {
      const { token, requirement_id, file } = params;

      // Convert file to base64
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-collection`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWFqendjbWR3YWhuanlpZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyODk5OTksImV4cCI6MjA3Mjg2NTk5OX0.Pyob4fMYhHjHhVCxhP2UdSSMAv6i9eqmLD-lxavfV5s',
          },
          body: JSON.stringify({
            action: 'portal_upload',
            token,
            requirement_id,
            filename: file.name,
            file_base64: base64,
            mime_type: file.type,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal-packet', variables.token] });
    },
  });
}

