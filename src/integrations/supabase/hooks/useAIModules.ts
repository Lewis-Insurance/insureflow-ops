/**
 * Lewis AI Hub - Module & Execution Hooks
 * 
 * Provides React Query hooks for:
 * - AI module configuration (CRUD)
 * - Module execution (run AI analysis)
 * - Execution history
 * - Document linking utilities
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

export interface AIModuleInputConfig {
  min_documents?: number;
  max_documents?: number;
  document_labels?: string[];
  additional_fields?: Array<{
    name: string;
    type: 'text' | 'select' | 'multiselect' | 'textarea' | 'number';
    label: string;
    required?: boolean;
    options?: string[];
    default?: string;
    placeholder?: string;
  }>;
  allow_text_input?: boolean;
  input_placeholder?: string;
  is_conversational?: boolean;
}

export interface AIModuleOutputConfig {
  format: 'structured' | 'markdown' | 'chat' | 'html';
  sections?: string[];
  show_email_draft?: boolean;
  show_download_report?: boolean;
  show_sources?: boolean;
  show_checklist?: boolean;
}

export interface AIModule {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  category: string;
  system_prompt: string;
  input_config: AIModuleInputConfig;
  output_config: AIModuleOutputConfig;
  is_system: boolean;
  is_active: boolean;
  required_role: string;
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModuleExecution {
  id: string;
  module_id: string;
  module_slug: string;
  account_id: string | null;
  policy_id: string | null;
  lead_id: string | null;
  document_ids: string[];
  input_text: string | null;
  input_config: Record<string, unknown> | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result: Record<string, unknown> | null;
  result_summary: string | null;
  error_message: string | null;
  email_draft_subject: string | null;
  email_draft_body: string | null;
  report_html: string | null;
  processing_time_ms: number | null;
  tokens_used: number | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  // Joined fields
  module?: AIModule;
  account?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
}

export interface ExecuteModuleParams {
  module_slug: string;
  document_ids: string[];
  input_text?: string;
  additional_inputs?: Record<string, unknown>;
  link_to?: {
    type: 'account' | 'lead' | 'policy';
    id: string;
  };
}

export interface DocumentWithRelationships {
  id: string;
  filename: string;
  storage_path: string;
  file_size?: number;
  document_type?: string;
  category?: string;
  created_at: string;
  extracted_text?: string;
  account_id: string | null;
  policy_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  // Joined
  account?: { id: string; name: string } | null;
  policy?: { id: string; policy_number: string } | null;
  lead?: { id: string; name: string } | null;
}

// ============================================================================
// MODULE HOOKS
// ============================================================================

/**
 * List all active AI modules
 */
export function useAIModules() {
  return useQuery({
    queryKey: ['ai-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_modules')
        .select('*')
        .eq('is_active', true)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      return (data || []) as AIModule[];
    },
  });
}

/**
 * Get a single module by slug
 */
export function useAIModule(slug: string | undefined) {
  return useQuery({
    queryKey: ['ai-module', slug],
    queryFn: async () => {
      if (!slug) return null;
      
      const { data, error } = await supabase
        .from('ai_modules')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data as AIModule;
    },
    enabled: !!slug,
  });
}

/**
 * Create a new AI module (admin only)
 */
export function useCreateModule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (module: Partial<AIModule>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ai_modules')
        .insert({
          ...module,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as AIModule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
      toast({
        title: 'Module Created',
        description: 'Your custom AI module has been created.',
      });
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

/**
 * Update an AI module (admin only)
 */
export function useUpdateModule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIModule> & { id: string }) => {
      const { data, error } = await supabase
        .from('ai_modules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AIModule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
      queryClient.invalidateQueries({ queryKey: ['ai-module', data.slug] });
      toast({
        title: 'Module Updated',
        description: 'Changes saved successfully.',
      });
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

/**
 * Delete an AI module (admin only, non-system modules)
 */
export function useDeleteModule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_modules')
        .delete()
        .eq('id', id)
        .eq('is_system', false); // Only allow deleting non-system modules

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
      toast({
        title: 'Module Deleted',
        description: 'The module has been removed.',
      });
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

// ============================================================================
// EXECUTION HOOKS
// ============================================================================

/**
 * Execute an AI module
 */
export function useExecuteModule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: ExecuteModuleParams) => {
      const { data, error } = await supabase.functions.invoke('execute-ai-module', {
        body: params,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data as {
        execution_id: string;
        status: string;
        result: Record<string, unknown>;
        processing_time_ms: number;
        tokens_used: number;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-executions'] });
      queryClient.invalidateQueries({ queryKey: ['ai-modules'] }); // Refresh usage counts
    },
    onError: (error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * List execution history with optional filters
 */
export function useModuleExecutions(filters?: {
  module_slug?: string;
  account_id?: string;
  lead_id?: string;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-executions', filters],
    queryFn: async () => {
      let query = supabase
        .from('ai_module_executions')
        .select(`
          *,
          module:ai_modules(id, name, slug, icon, color),
          account:accounts(id, name),
          lead:leads(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.module_slug) {
        query = query.eq('module_slug', filters.module_slug);
      }
      if (filters?.account_id) {
        query = query.eq('account_id', filters.account_id);
      }
      if (filters?.lead_id) {
        query = query.eq('lead_id', filters.lead_id);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AIModuleExecution[];
    },
  });
}

/**
 * Get a single execution by ID
 */
export function useModuleExecution(id: string | undefined) {
  return useQuery({
    queryKey: ['ai-execution', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('ai_module_executions')
        .select(`
          *,
          module:ai_modules(id, name, slug, icon, color, output_config),
          account:accounts(id, name),
          lead:leads(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as AIModuleExecution;
    },
    enabled: !!id,
  });
}

/**
 * Get recent executions for the current user
 */
export function useRecentExecutions(limit = 10) {
  return useQuery({
    queryKey: ['ai-executions-recent', limit],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('ai_module_executions')
        .select(`
          id,
          module_slug,
          result_summary,
          status,
          created_at,
          module:ai_modules(name, icon, color),
          account:accounts(id, name)
        `)
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    },
  });
}

// ============================================================================
// DOCUMENT LINKING HOOKS
// ============================================================================

/**
 * Link a document to an account, lead, or policy
 */
export function useLinkDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      documentId,
      linkType,
      linkId,
      documentType,
    }: {
      documentId: string;
      linkType: 'account' | 'lead' | 'policy';
      linkId: string;
      documentType?: string;
    }) => {
      const updates: Record<string, unknown> = {};

      if (linkType === 'account') {
        updates.account_id = linkId;
        updates.related_entity_type = 'account';
        updates.related_entity_id = linkId;
      } else if (linkType === 'lead') {
        updates.related_entity_type = 'lead';
        updates.related_entity_id = linkId;
      } else if (linkType === 'policy') {
        updates.policy_id = linkId;
        updates.related_entity_type = 'policy';
        updates.related_entity_id = linkId;
      }

      if (documentType) {
        updates.document_type = documentType;
      }

      const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['unlinked-documents'] });
      toast({
        title: 'Document Linked',
        description: 'Document has been linked successfully.',
      });
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

/**
 * Get documents without relationships (orphaned)
 */
export function useUnlinkedDocuments() {
  return useQuery({
    queryKey: ['unlinked-documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id, filename, storage_path, document_type, category, created_at')
        .is('account_id', null)
        .is('policy_id', null)
        .is('related_entity_id', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Get documents with their relationships (enhanced list)
 */
export function useDocumentsWithRelationships(filters?: {
  account_id?: string;
  document_type?: string;
  unlinked_only?: boolean;
  search?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['documents-with-relationships', filters],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select(`
          id,
          filename,
          storage_path,
          document_type,
          category,
          created_at,
          extracted_text,
          account_id,
          policy_id,
          related_entity_type,
          related_entity_id,
          account:accounts(id, name),
          policy:policies(id, policy_number)
        `)
        .order('created_at', { ascending: false });

      if (filters?.account_id) {
        query = query.eq('account_id', filters.account_id);
      }
      if (filters?.document_type) {
        query = query.eq('document_type', filters.document_type);
      }
      if (filters?.unlinked_only) {
        query = query
          .is('account_id', null)
          .is('policy_id', null)
          .is('related_entity_id', null);
      }
      if (filters?.search) {
        query = query.ilike('filename', `%${filters.search}%`);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch lead names for documents linked to leads
      const docsWithLeads = data?.filter(d => d.related_entity_type === 'lead') || [];
      const leadIds = [...new Set(docsWithLeads.map(d => d.related_entity_id))].filter(Boolean);
      
      let leadsMap: Record<string, { id: string; name: string }> = {};
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name')
          .in('id', leadIds as string[]);
        
        leadsMap = (leads || []).reduce((acc, lead) => {
          acc[lead.id] = lead;
          return acc;
        }, {} as Record<string, { id: string; name: string }>);
      }

      return (data || []).map(doc => ({
        ...doc,
        lead: doc.related_entity_type === 'lead' && doc.related_entity_id 
          ? leadsMap[doc.related_entity_id] || null 
          : null,
      })) as DocumentWithRelationships[];
    },
  });
}

/**
 * Get documents for use in AI modules (with extracted text)
 */
export function useDocumentsForAI(documentIds: string[]) {
  return useQuery({
    queryKey: ['documents-for-ai', documentIds],
    queryFn: async () => {
      if (documentIds.length === 0) return [];

      const { data, error } = await supabase
        .from('documents')
        .select('id, filename, storage_path, extracted_text, document_type')
        .in('id', documentIds);

      if (error) throw error;
      return data || [];
    },
    enabled: documentIds.length > 0,
  });
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Get module statistics
 */
export function useModuleStats(days = 30) {
  return useQuery({
    queryKey: ['ai-module-stats', days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_ai_module_stats', { p_days: days });
      if (error) throw error;
      return data || [];
    },
  });
}

