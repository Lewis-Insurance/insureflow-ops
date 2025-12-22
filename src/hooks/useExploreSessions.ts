/**
 * React Query hooks for Explore Insurance Document module
 * 
 * ALIGNED WITH EXISTING SCHEMA:
 * - Uses document_extractions (not explore_documents)
 * - Uses knowledge_base for chunks (not explore_chunks)
 * - Uses ai_conversations/ai_messages (not explore_sessions/messages)
 * - Uses document_evidence_items for citations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// TYPES (Aligned with existing tables)
// =============================================================================

export interface DocumentExtraction {
  id: string;
  document_url: string;
  document_name: string;
  document_type: string;
  file_size_bytes: number | null;
  page_count: number | null;
  account_id: string | null;
  status: 'pending' | 'processing' | 'extracted' | 'mapped' | 'applied' | 'failed';
  azure_confidence_score: number | null;
  azure_text_content: string | null;
  extracted_fields: Record<string, any>;
  evidence_catalog: EvidenceItem[];
  chunk_count: number;
  embedding_status: 'pending' | 'processing' | 'ready' | 'error' | 'skipped';
  error_message: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AIConversation {
  id: string;
  account_id: string | null;
  user_id: string;
  title: string | null;
  context: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[] | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface Citation {
  evidence_id: string;
  document_id?: string;
  extraction_id?: string;
  page: number;
  snippet: string;
  confidence: number;
}

export interface EvidenceItem {
  id?: string;
  evidence_id: string;
  extraction_id?: string;
  document_id?: string;
  page_index: number;
  bbox: { x: number; y: number; w: number; h: number } | null;
  snippet_text: string;
  label: string | null;
  source_type?: string;
  confidence: number;
  tags?: string[];
}

// =============================================================================
// DOCUMENT EXTRACTION HOOKS (Aligned with existing table)
// =============================================================================

/**
 * Fetch document extractions for the current user
 */
export const useDocumentExtractions = (accountId?: string | null) => {
  return useQuery({
    queryKey: ['document-extractions', accountId],
    queryFn: async () => {
      let query = supabase
        .from('document_extractions')
        .select('*')
        .order('created_at', { ascending: false });

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      return data as DocumentExtraction[];
    },
  });
};

/**
 * Fetch a single document extraction with polling for processing
 */
export const useDocumentExtraction = (extractionId: string | null) => {
  return useQuery({
    queryKey: ['document-extraction', extractionId],
    queryFn: async () => {
      if (!extractionId) return null;

      const { data, error } = await supabase
        .from('document_extractions')
        .select('*')
        .eq('id', extractionId)
        .single();

      if (error) throw error;
      return data as DocumentExtraction;
    },
    enabled: !!extractionId,
    refetchInterval: (query) => {
      const data = query.state.data as DocumentExtraction | null;
      // Poll while processing
      if (data?.status === 'pending' || data?.status === 'processing') {
        return 2000;
      }
      if (data?.embedding_status === 'pending' || data?.embedding_status === 'processing') {
        return 2000;
      }
      return false;
    },
  });
};

/**
 * Trigger embedding generation for an existing extraction
 */
export const useTriggerExploreProcessing = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (extractionId: string) => {
      const response = await supabase.functions.invoke('upload-explore-document', {
        body: { extraction_id: extractionId },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document-extraction', data.extraction_id] });
      toast({
        title: 'Processing started',
        description: 'Generating embeddings for Q&A...',
      });
    },
    onError: (error) => {
      toast({
        title: 'Processing failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// =============================================================================
// AI CONVERSATION HOOKS (Using existing ai_conversations/ai_messages)
// =============================================================================

/**
 * Fetch AI conversations for the current user
 */
export const useAIConversations = () => {
  return useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as AIConversation[];
    },
  });
};

/**
 * Upload a document and create extraction for explore Q&A
 */
export const useUploadExploreDocument = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      file: File;
      account_id?: string;
      document_type?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Convert file to base64
      const arrayBuffer = await params.file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const response = await supabase.functions.invoke('upload-explore-document', {
        body: {
          file_base64: base64,
          file_name: params.file.name,
          file_type: params.file.type,
          file_size: params.file.size,
          account_id: params.account_id,
          document_type: params.document_type,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document-extractions'] });
      queryClient.invalidateQueries({ queryKey: ['document-extraction', data.extraction_id] });
      toast({
        title: 'Document uploaded',
        description: 'Generating embeddings for Q&A...',
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
 * Retry processing a failed extraction
 */
export const useRetryExploreDocument = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (extractionId: string) => {
      const response = await supabase.functions.invoke('process-explore-document', {
        body: { extraction_id: extractionId },
      });

      if (response.error) throw response.error;
      return { ...response.data, extraction_id: extractionId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['document-extraction', data.extraction_id] });
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
// MESSAGE / Q&A HOOKS (Using ai_messages)
// =============================================================================

/**
 * Fetch messages for a conversation
 */
export const useExploreMessages = (conversationId: string | null) => {
  return useQuery({
    queryKey: ['ai-messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as AIMessage[];
    },
    enabled: !!conversationId,
  });
};

/**
 * Ask a question about a document extraction
 */
export const useExploreAsk = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: {
      extraction_id?: string;
      document_id?: string;
      conversation_id?: string;
      question: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('explore-qa', {
        body: {
          extraction_id: params.extraction_id,
          document_id: params.document_id,
          conversation_id: params.conversation_id,
          question: params.question,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      if (data.conversation_id) {
        queryClient.invalidateQueries({ queryKey: ['ai-messages', data.conversation_id] });
      }
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
// EVIDENCE HOOKS (Using document_evidence_items)
// =============================================================================

/**
 * Fetch evidence items for an extraction
 */
export const useExploreEvidence = (extractionId: string | null) => {
  return useQuery({
    queryKey: ['document-evidence', extractionId],
    queryFn: async () => {
      if (!extractionId) return [];

      const { data, error } = await supabase
        .from('document_evidence_items')
        .select('*')
        .eq('extraction_id', extractionId)
        .order('page_index', { ascending: true });

      if (error) throw error;
      return data as EvidenceItem[];
    },
    enabled: !!extractionId,
  });
};

/**
 * Get a specific evidence item by ID
 */
export const useEvidenceItem = (extractionId: string | null, evidenceId: string | null) => {
  return useQuery({
    queryKey: ['evidence-item', extractionId, evidenceId],
    queryFn: async () => {
      if (!extractionId || !evidenceId) return null;

      const { data, error } = await supabase
        .from('document_evidence_items')
        .select('*')
        .eq('extraction_id', extractionId)
        .eq('evidence_id', evidenceId)
        .single();

      if (error) throw error;
      return data as EvidenceItem;
    },
    enabled: !!extractionId && !!evidenceId,
  });
};

/**
 * Get evidence from extraction's evidence_catalog JSONB
 */
export const useEvidenceCatalog = (extractionId: string | null) => {
  return useQuery({
    queryKey: ['evidence-catalog', extractionId],
    queryFn: async () => {
      if (!extractionId) return [];

      const { data, error } = await supabase
        .from('document_extractions')
        .select('evidence_catalog')
        .eq('id', extractionId)
        .single();

      if (error) throw error;
      return (data?.evidence_catalog || []) as EvidenceItem[];
    },
    enabled: !!extractionId,
  });
};

