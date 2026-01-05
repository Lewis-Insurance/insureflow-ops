/**
 * Explore Sessions Hook - Aligned Architecture
 * 
 * Uses existing tables:
 * - document_extractions: for document records and evidence catalog
 * - knowledge_base: for vector chunks (linked via document_extraction_id)
 * - ai_conversations / ai_messages: for chat history with citations
 * - document_evidence_items: for bbox highlighting lookup
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

export interface ExploreSession {
  id: string; // ai_conversations.id
  title: string;
  account_id?: string;
  policy_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ExploreDocument {
  id: string; // document_extractions.id
  conversation_id: string;
  document_id?: string; // original documents table
  filename: string;
  file_size?: number;
  page_count?: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  doc_type?: string;
  lob_detected?: string[];
  quality_score?: number;
  evidence_catalog?: EvidenceItem[];
  chunk_count?: number;
  embedding_status?: string;
  extracted_fields?: Record<string, any>;
  created_at: string;
}

export interface EvidenceItem {
  evidence_id: string;
  page_index: number;
  bbox?: { x: number; y: number; w: number; h: number };
  snippet_text: string;
  label?: string;
  confidence?: number;
  source_type?: string;
  tags?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Citation[];
  created_at: string;
}

export interface Citation {
  evidence_id: string;
  document_id?: string;
  page?: number;
  snippet: string;
  confidence?: number;
}

export interface QAResponse {
  answer: string;
  confidence: number;
  citations: Citation[];
  claims: Array<{ text: string; evidence_ids: string[] }>;
  not_found: string[];
  followups: string[];
}

// =============================================================================
// CREATE SESSION
// =============================================================================

export function useCreateExploreSession() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      title,
      accountId,
      policyId,
    }: {
      title?: string;
      accountId?: string;
      policyId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create an ai_conversation as the "session"
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({
          user_id: user.id,
          title: title || 'Document Exploration',
          context: {
            type: 'explore_session',
            account_id: accountId,
            policy_id: policyId,
          },
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['explore-sessions'] });
    },
    onError: (error) => {
      toast({
        title: 'Failed to create session',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// GET SESSION
// =============================================================================

export function useExploreSession(conversationId: string | null) {
  return useQuery({
    queryKey: ['explore-session', conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      return {
        id: data.id,
        title: data.title,
        account_id: data.context?.account_id,
        policy_id: data.context?.policy_id,
        created_at: data.created_at,
        updated_at: data.updated_at,
      } as ExploreSession;
    },
    enabled: !!conversationId,
  });
}

// =============================================================================
// GET SESSION DOCUMENTS (from document_extractions)
// =============================================================================

export function useExploreDocuments(conversationId: string | null) {
  return useQuery({
    queryKey: ['explore-documents', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      // Get document_extractions linked to this conversation via metadata
      const { data, error } = await supabase
        .from('document_extractions')
        .select('*')
        .eq('metadata->>conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((d): ExploreDocument => ({
        id: d.id,
        conversation_id: conversationId,
        document_id: d.document_id,
        filename: d.file_name || 'Unknown',
        file_size: d.metadata?.file_size,
        page_count: d.page_count,
        processing_status: d.status === 'completed' ? 'completed' : 
                          d.status === 'error' ? 'error' :
                          d.status === 'processing' ? 'processing' : 'pending',
        error_message: d.error_message,
        doc_type: d.document_type,
        lob_detected: d.metadata?.lob_detected,
        quality_score: d.quality_score,
        evidence_catalog: d.evidence_catalog,
        chunk_count: d.chunk_count,
        embedding_status: d.embedding_status,
        extracted_fields: d.extracted_fields,
        created_at: d.created_at,
      }));
    },
    enabled: !!conversationId,
    refetchInterval: (query) => {
      // Poll while any document is processing
      const docs = query.state.data;
      if (!docs) return false;
      const hasProcessing = docs.some(
        (d) => d.processing_status === 'pending' || d.processing_status === 'processing'
      );
      return hasProcessing ? 3000 : false;
    },
  });
}

// =============================================================================
// UPLOAD DOCUMENT (creates document_extractions record)
// =============================================================================

export function useUploadExploreDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      file,
      conversationId,
      accountId,
      policyId,
    }: {
      file: File;
      conversationId: string;
      accountId?: string;
      policyId?: string;
    }) => {
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `explore/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Create document_extractions record
      const { data, error } = await supabase
        .from('document_extractions')
        .insert({
          file_name: file.name,
          storage_path: storagePath,
          status: 'pending',
          metadata: {
            conversation_id: conversationId,
            account_id: accountId,
            policy_id: policyId,
            file_size: file.size,
            mime_type: file.type,
            uploaded_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger async processing
      supabase.functions.invoke('process-explore-document', {
        body: {
          document_extraction_id: data.id,
          conversation_id: conversationId,
        },
      }).catch((err) => logger.error('Processing trigger error:', err));

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['explore-documents', variables.conversationId] 
      });
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
}

// =============================================================================
// GET CHAT MESSAGES
// =============================================================================

export function useExploreChatMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['explore-chat', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((m): ChatMessage => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        citations: m.citations,
        created_at: m.created_at,
      }));
    },
    enabled: !!conversationId,
  });
}

// =============================================================================
// SEND Q&A MESSAGE
// =============================================================================

export function useSendExploreQuestion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      conversationId,
      question,
      documentExtractionIds,
    }: {
      conversationId: string;
      question: string;
      documentExtractionIds?: string[];
    }) => {
      // Add user message first
      const { error: userMsgError } = await supabase
        .from('ai_messages')
        .insert({
          conversation_id: conversationId,
          role: 'user',
          content: question,
        });

      if (userMsgError) throw userMsgError;

      // Call explore-qa edge function
      const { data, error } = await supabase.functions.invoke<QAResponse>('explore-qa', {
        body: {
          conversation_id: conversationId,
          question,
          document_extraction_ids: documentExtractionIds,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['explore-chat', variables.conversationId] 
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to get answer',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// =============================================================================
// GET EVIDENCE ITEM (for highlighting)
// =============================================================================

export function useEvidenceItem(extractionId: string | null, evidenceId: string | null) {
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

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

      return data as EvidenceItem | null;
    },
    enabled: !!extractionId && !!evidenceId,
  });
}

// =============================================================================
// RETRY PROCESSING
// =============================================================================

export function useRetryDocumentProcessing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      extractionId,
      conversationId,
    }: {
      extractionId: string;
      conversationId: string;
    }) => {
      // Reset status
      await supabase
        .from('document_extractions')
        .update({ status: 'pending', error_message: null })
        .eq('id', extractionId);

      // Trigger processing
      const { error } = await supabase.functions.invoke('process-explore-document', {
        body: {
          document_extraction_id: extractionId,
          conversation_id: conversationId,
        },
      });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['explore-documents', variables.conversationId] 
      });
      toast({
        title: 'Processing restarted',
      });
    },
  });
}
