/**
 * Module Builder Hooks
 * 
 * React hooks for the AI-powered Module Builder Wizard.
 * Manages conversation state, config generation, and module publishing.
 */

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ============================================================================
// TYPES
// ============================================================================

export interface BuilderMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
  generated_config?: ModuleConfig | null;
}

export interface ModuleConfig {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  system_prompt: string;
  input_config: {
    min_documents: number;
    max_documents: number;
    document_labels: string[];
    allow_text_input: boolean;
    input_placeholder?: string;
    additional_fields?: any[];
  };
  output_config: {
    format: 'structured' | 'markdown' | 'chat' | 'html';
    sections: string[];
    show_email_draft: boolean;
    show_download_report: boolean;
  };
}

export interface BuilderSession {
  id: string;
  module_id: string | null;
  session_type: 'create' | 'improve' | 'clone';
  messages: BuilderMessage[];
  generated_config: ModuleConfig | null;
  final_config: ModuleConfig | null;
  status: 'in_progress' | 'ready_to_test' | 'testing' | 'completed' | 'abandoned';
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ============================================================================
// INDIVIDUAL HOOKS
// ============================================================================

/**
 * Start a new builder session
 */
export function useStartBuilderSession() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('module-builder-chat', {
        body: { action: 'start' },
      });

      if (error) throw error;
      return data as { session_id: string; message: BuilderMessage; status: string };
    },
    onError: (error: Error) => {
      toast({
        title: 'Error starting builder',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Start an improvement session for an existing module
 */
export function useStartImprovementSession() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (moduleId: string) => {
      const { data, error } = await supabase.functions.invoke('module-builder-chat', {
        body: { action: 'improve', module_id: moduleId },
      });

      if (error) throw error;
      return data as {
        session_id: string;
        message: BuilderMessage;
        existing_config: ModuleConfig;
        status: string;
      };
    },
    onError: (error: Error) => {
      toast({
        title: 'Error starting improvement session',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Send a message in the builder conversation
 */
export function useSendBuilderMessage() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sessionId, message }: { sessionId: string; message: string }) => {
      const { data, error } = await supabase.functions.invoke('module-builder-chat', {
        body: { action: 'message', session_id: sessionId, message },
      });

      if (error) throw error;
      return data as {
        session_id: string;
        message: BuilderMessage;
        generated_config: ModuleConfig | null;
        status: string;
      };
    },
    onError: (error: Error) => {
      toast({
        title: 'Error sending message',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Save the generated module as a draft for testing
 */
export function useSaveModuleDraft() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.functions.invoke('module-builder-chat', {
        body: { action: 'save_draft', session_id: sessionId },
      });

      if (error) throw error;
      return data as { session_id: string; module_id: string; module: any; status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
      toast({
        title: 'Module saved for testing',
        description: 'You can now test your module before publishing.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving module',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Publish a module to make it available to all users
 */
export function usePublishModule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ moduleId, sessionId }: { moduleId: string; sessionId?: string }) => {
      const { data, error } = await supabase.functions.invoke('module-builder-chat', {
        body: { action: 'publish', module_id: moduleId, session_id: sessionId },
      });

      if (error) throw error;
      return data as { module: any; status: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
      toast({
        title: 'Module published!',
        description: `${data.module.name} is now available to all staff.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error publishing module',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Fetch a builder session by ID
 */
export function useBuilderSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['builder-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from('ai_module_builder_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      return data as unknown as BuilderSession;
    },
    enabled: !!sessionId,
  });
}

/**
 * Fetch user's draft/testing modules
 */
export function useMyDraftModules() {
  return useQuery({
    queryKey: ['my-draft-modules'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('ai_modules')
        .select('*')
        .eq('created_by', user.id)
        .in('status', ['draft', 'testing'])
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

// ============================================================================
// COMBINED HOOK - FULL STATE MANAGEMENT
// ============================================================================

/**
 * Main hook for managing module builder state
 * Combines all the individual hooks with local state management
 */
export function useModuleBuilder() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BuilderMessage[]>([]);
  const [generatedConfig, setGeneratedConfig] = useState<ModuleConfig | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [moduleId, setModuleId] = useState<string | null>(null);

  const startSession = useStartBuilderSession();
  const startImprovement = useStartImprovementSession();
  const sendMessage = useSendBuilderMessage();
  const saveDraft = useSaveModuleDraft();
  const publish = usePublishModule();

  /**
   * Start a new module creation session
   */
  const start = useCallback(async () => {
    const result = await startSession.mutateAsync();
    setSessionId(result.session_id);
    setMessages([result.message]);
    setStatus(result.status);
    setGeneratedConfig(null);
    setModuleId(null);
  }, [startSession]);

  /**
   * Start an improvement session for an existing module
   */
  const improve = useCallback(async (existingModuleId: string) => {
    const result = await startImprovement.mutateAsync(existingModuleId);
    setSessionId(result.session_id);
    setMessages([result.message]);
    setGeneratedConfig(result.existing_config);
    setStatus(result.status);
    setModuleId(existingModuleId);
  }, [startImprovement]);

  /**
   * Send a message to the AI
   */
  const send = useCallback(async (message: string) => {
    if (!sessionId) return;

    // Optimistically add user message
    const userMsg: BuilderMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await sendMessage.mutateAsync({ sessionId, message });

      // Replace optimistic message with real response
      setMessages(prev => [...prev.slice(0, -1), userMsg, result.message]);
      setStatus(result.status);

      if (result.generated_config) {
        setGeneratedConfig(result.generated_config);
      }
    } catch (error) {
      // Remove optimistic message on error
      setMessages(prev => prev.slice(0, -1));
      throw error;
    }
  }, [sessionId, sendMessage]);

  /**
   * Save the module as a draft for testing
   */
  const saveForTesting = useCallback(async () => {
    if (!sessionId) return;

    const result = await saveDraft.mutateAsync(sessionId);
    setModuleId(result.module_id);
    setStatus('testing');
    return result;
  }, [sessionId, saveDraft]);

  /**
   * Publish the module
   */
  const publishModule = useCallback(async () => {
    if (!moduleId) return;

    const result = await publish.mutateAsync({ moduleId, sessionId: sessionId || undefined });
    setStatus('published');
    return result;
  }, [moduleId, sessionId, publish]);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setSessionId(null);
    setMessages([]);
    setGeneratedConfig(null);
    setStatus('idle');
    setModuleId(null);
  }, []);

  return {
    // State
    sessionId,
    messages,
    generatedConfig,
    status,
    moduleId,

    // Loading states
    isStarting: startSession.isPending || startImprovement.isPending,
    isSending: sendMessage.isPending,
    isSaving: saveDraft.isPending,
    isPublishing: publish.isPending,

    // Actions
    start,
    improve,
    send,
    saveForTesting,
    publishModule,
    reset,

    // Direct config update (for manual edits)
    setGeneratedConfig,
  };
}

