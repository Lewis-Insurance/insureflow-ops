/**
 * React Query hooks for Explore Insurance Document module
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// TYPES
// =============================================================================

export interface ExploreSession {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  account_id: string | null;
  policy_id: string | null;
  title: string | null;
  description: string | null;
  status: 'pending' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  total_documents: number;
  processed_documents: number;
  total_chunks: number;
  total_evidence_items: number;
}

export interface ExploreDocument {
  id: string;
  session_id: string;
  created_at: string;
  storage_path: string | null;
  storage_bucket: string;
  filename: string;
  mime_type: string | null;
  file_size: number | null;
  page_count: number | null;
  doc_role: string | null;
  predicted_doc_type: string | null;
  predicted_doc_type_confidence: number | null;
  lob_detected: string[] | null;
  carrier_detected: string | null;
  quality_score: number | null;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  error_message: string | null;
  evidence_count: number;
  chunk_count: number;
}

export interface ExploreMessage {
  id: string;
  session_id: string;
  created_at: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[] | null;
  model_used: string | null;
  tokens_used: number | null;
  latency_ms: number | null;
}

export interface Citation {
  evidence_id: string;
  document_id: string;
  page: number;
  snippet: string;
  confidence: number;
}

export interface EvidenceItem {
  id: string;
  evidence_id: string;
  document_id: string;
  page_index: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  snippet_text: string;
  label: string | null;
  source_type: string;
  confidence: number;
  tags: string[];
  potential_field: string | null;
}

// =============================================================================
// SESSION HOOKS
// =============================================================================

/**
 * Fetch all explore sessions for current user
 */
export const useExploreSessions = () => {
  return useQuery({
    queryKey: ['explore-sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('explore_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ExploreSession[];
    },
  });
};

/**
 * Fetch a single explore session with documents
 */
export const useExploreSession = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['explore-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from('explore_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      return data as ExploreSession;
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data as ExploreSession | null;
      // Poll while processing
      if (data?.status === 'pending' || data?.status === 'processing') {
        return 2000;
      }
      return false;
    },
  });
};

/**
 * Create a new explore session
 */
export const useCreateExploreSession = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      title?: string;
      account_id?: string;
      policy_id?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('explore_sessions')
        .insert({
          created_by: user.id,
          title: params.title || 'New Explore Session',
          account_id: params.account_id || null,
          policy_id: params.policy_id || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return data as ExploreSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['explore-sessions'] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create session: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
};

/**
 * Delete an explore session
 */
export const useDeleteExploreSession = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from('explore_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['explore-sessions'] });
      toast({ title: 'Session deleted' });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to delete session: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// DOCUMENT HOOKS
// =============================================================================

/**
 * Fetch documents for a session
 */
export const useExploreDocuments = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['explore-documents', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];

      const { data, error } = await supabase
        .from('explore_documents')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ExploreDocument[];
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const data = query.state.data as ExploreDocument[] | undefined;
      // Poll while any document is processing
      if (data?.some(d => d.status === 'uploading' || d.status === 'processing')) {
        return 2000;
      }
      return false;
    },
  });
};

/**
 * Upload a document to a session
 */
export const useUploadExploreDocument = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      session_id?: string;
      account_id?: string;
      policy_id?: string;
      file: File;
      doc_role?: string;
      doc_type_hint?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Convert file to base64
      const arrayBuffer = await params.file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await supabase.functions.invoke('upload-explore-document', {
        body: {
          session_id: params.session_id,
          account_id: params.account_id,
          policy_id: params.policy_id,
          file_name: params.file.name,
          file_type: params.file.type,
          file_size: params.file.size,
          file_base64: base64,
          doc_role: params.doc_role,
          doc_type_hint: params.doc_type_hint,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['explore-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['explore-session', data.session_id] });
      queryClient.invalidateQueries({ queryKey: ['explore-documents', data.session_id] });
      toast({
        title: 'Document uploaded',
        description: 'Processing started...',
      });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

/**
 * Retry processing a failed document
 */
export const useRetryExploreDocument = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data: doc } = await supabase
        .from('explore_documents')
        .select('id, session_id')
        .eq('id', documentId)
        .single();

      if (!doc) throw new Error('Document not found');

      const response = await supabase.functions.invoke('process-explore-document', {
        body: {
          document_id: documentId,
          session_id: doc.session_id,
        },
      });

      if (response.error) throw response.error;
      return { ...response.data, session_id: doc.session_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['explore-documents', data.session_id] });
      toast({ title: 'Retry started' });
    },
    onError: (error) => {
      toast({
        title: 'Retry failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// MESSAGE / Q&A HOOKS
// =============================================================================

/**
 * Fetch messages for a session
 */
export const useExploreMessages = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['explore-messages', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];

      const { data, error } = await supabase
        .from('explore_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as ExploreMessage[];
    },
    enabled: !!sessionId,
  });
};

/**
 * Ask a question about documents in a session
 */
export const useExploreAsk = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      session_id: string;
      question: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('explore-qa', {
        body: {
          session_id: params.session_id,
          question: params.question,
        },
      });

      if (response.error) throw response.error;
      return { ...response.data, session_id: params.session_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['explore-messages', data.session_id] });
    },
    onError: (error) => {
      toast({
        title: 'Question failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// EVIDENCE HOOKS
// =============================================================================

/**
 * Fetch evidence items for a document
 */
export const useExploreEvidence = (documentId: string | null) => {
  return useQuery({
    queryKey: ['explore-evidence', documentId],
    queryFn: async () => {
      if (!documentId) return [];

      const { data, error } = await supabase
        .from('explore_evidence_items')
        .select('*')
        .eq('document_id', documentId)
        .order('page_index', { ascending: true });

      if (error) throw error;
      return data as EvidenceItem[];
    },
    enabled: !!documentId,
  });
};

/**
 * Get a specific evidence item by ID
 */
export const useEvidenceItem = (evidenceId: string | null) => {
  return useQuery({
    queryKey: ['evidence-item', evidenceId],
    queryFn: async () => {
      if (!evidenceId) return null;

      const { data, error } = await supabase
        .from('explore_evidence_items')
        .select('*')
        .eq('evidence_id', evidenceId)
        .single();

      if (error) throw error;
      return data as EvidenceItem;
    },
    enabled: !!evidenceId,
  });
};

