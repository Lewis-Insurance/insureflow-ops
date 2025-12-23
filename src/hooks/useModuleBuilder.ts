import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Types
export interface BuilderMessage {
    role: 'user' | 'assistant';
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
        min_documents?: number;
        max_documents?: number;
        document_labels?: string[];
        allow_text_input?: boolean;
        text_input_placeholder?: string;
        additional_fields?: Array<{
            name: string;
            type: string;
            label: string;
        }>;
    };
    output_config: {
        format: 'structured' | 'chat';
        sections?: string[];
        show_email_draft?: boolean;
        show_download_report?: boolean;
        show_sources?: boolean;
        show_checklist?: boolean;
    };
}

export interface AIModule {
    id: string;
    slug: string;
    name: string;
    description?: string;
    icon: string;
    color: string;
    category: string;
    system_prompt: string;
    input_config: ModuleConfig['input_config'];
    output_config: ModuleConfig['output_config'];
    status: 'draft' | 'testing' | 'published' | 'archived';
    is_system: boolean;
    is_active: boolean;
    usage_count: number;
    created_by?: string;
    created_at: string;
    updated_at: string;
    published_at?: string;
}

export interface BuilderSession {
    id: string;
    module_id?: string;
    session_type: 'create' | 'improve' | 'clone';
    messages: BuilderMessage[];
    generated_config?: ModuleConfig;
    final_config?: ModuleConfig;
    status: 'in_progress' | 'ready_to_test' | 'testing' | 'completed' | 'abandoned';
    created_by: string;
    created_at: string;
    updated_at: string;
    completed_at?: string;
}

// ============================================================
// HOOKS
// ============================================================

/**
 * Fetch all published and user's own modules
 */
export function useAIModules() {
    return useQuery({
        queryKey: ['ai-modules'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('ai_modules')
                .select('*')
                .order('name');

            if (error) throw error;
            return data as AIModule[];
        },
    });
}

/**
 * Fetch a single module by slug
 */
export function useAIModuleBySlug(slug: string | undefined) {
    return useQuery({
        queryKey: ['ai-module', slug],
        queryFn: async () => {
            if (!slug) return null;

            const { data, error } = await supabase
                .from('ai_modules')
                .select('*')
                .eq('slug', slug)
                .single();

            if (error) throw error;
            return data as AIModule;
        },
        enabled: !!slug,
    });
}

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
            if (data?.error) throw new Error(data.error);
            return data as { session_id: string; message: BuilderMessage; status: string };
        },
        onError: (error: Error) => {
            console.error('Builder start error:', error);
            toast({
                title: 'Error starting builder',
                description: error.message || 'Failed to connect to the AI service',
                variant: 'destructive',
            });
        },
        retry: false, // Don't retry on failure to prevent infinite loops
    });
}

/**
 * Send a message in the builder session
 */
export function useSendBuilderMessage() {
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ session_id, message }: { session_id: string; message: string }) => {
            const { data, error } = await supabase.functions.invoke('module-builder-chat', {
                body: { action: 'message', session_id, message },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data as {
                session_id: string;
                message: BuilderMessage;
                generated_config?: ModuleConfig;
                status: string;
            };
        },
        onError: (error: Error) => {
            console.error('Builder message error:', error);
            toast({
                title: 'Error sending message',
                description: error.message,
                variant: 'destructive',
            });
        },
        retry: false,
    });
}

/**
 * Save the generated module as a draft for testing
 */
export function useSaveDraft() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (session_id: string) => {
            const { data, error } = await supabase.functions.invoke('module-builder-chat', {
                body: { action: 'save_draft', session_id },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data as {
                session_id: string;
                module_id: string;
                module: AIModule;
                status: string;
            };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
            toast({
                title: 'Draft saved',
                description: 'Your module is ready for testing',
            });
        },
        onError: (error: Error) => {
            toast({
                title: 'Error saving draft',
                description: error.message,
                variant: 'destructive',
            });
        },
        retry: false,
    });
}

/**
 * Publish a module
 */
export function usePublishModule() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ module_id, session_id }: { module_id: string; session_id?: string }) => {
            const { data, error } = await supabase.functions.invoke('module-builder-chat', {
                body: { action: 'publish', module_id, session_id },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data as { module: AIModule; status: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['ai-modules'] });
            toast({
                title: 'Module published!',
                description: 'Your module is now available to the team',
            });
        },
        onError: (error: Error) => {
            toast({
                title: 'Error publishing',
                description: error.message,
                variant: 'destructive',
            });
        },
        retry: false,
    });
}

/**
 * Start an improvement session for an existing module
 */
export function useImproveModule() {
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (module_id: string) => {
            const { data, error } = await supabase.functions.invoke('module-builder-chat', {
                body: { action: 'improve', module_id },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            return data as {
                session_id: string;
                message: BuilderMessage;
                existing_config: ModuleConfig;
                status: string;
            };
        },
        onError: (error: Error) => {
            toast({
                title: 'Error starting improvement',
                description: error.message,
                variant: 'destructive',
            });
        },
        retry: false,
    });
}

/**
 * Combined hook for managing a builder session
 */
export function useModuleBuilder() {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<BuilderMessage[]>([]);
    const [generatedConfig, setGeneratedConfig] = useState<ModuleConfig | null>(null);
    const [status, setStatus] = useState<string>('idle');
    const [moduleId, setModuleId] = useState<string | null>(null);
    const [initError, setInitError] = useState(false);

    const startSession = useStartBuilderSession();
    const sendMessage = useSendBuilderMessage();
    const saveDraft = useSaveDraft();
    const publishModule = usePublishModule();
    const improveModule = useImproveModule();

    const start = useCallback(async () => {
        try {
            setInitError(false);
            const result = await startSession.mutateAsync();
            setSessionId(result.session_id);
            setMessages([result.message]);
            setStatus(result.status);
        } catch (error) {
            setInitError(true);
            throw error;
        }
    }, [startSession]);

    const improve = useCallback(async (existingModuleId: string) => {
        try {
            setInitError(false);
            const result = await improveModule.mutateAsync(existingModuleId);
            setSessionId(result.session_id);
            setMessages([result.message]);
            setGeneratedConfig(result.existing_config);
            setStatus(result.status);
        } catch (error) {
            setInitError(true);
            throw error;
        }
    }, [improveModule]);

    const send = useCallback(async (message: string) => {
        if (!sessionId) return;

        // Optimistically add user message
        const userMessage: BuilderMessage = {
            role: 'user',
            content: message,
            timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMessage]);

        const result = await sendMessage.mutateAsync({ session_id: sessionId, message });
        setMessages(prev => [...prev, result.message]);
        setStatus(result.status);
        if (result.generated_config) {
            setGeneratedConfig(result.generated_config);
        }
    }, [sessionId, sendMessage]);

    const save = useCallback(async () => {
        if (!sessionId) return;
        const result = await saveDraft.mutateAsync(sessionId);
        setModuleId(result.module_id);
        setStatus(result.status);
        return result;
    }, [sessionId, saveDraft]);

    const publish = useCallback(async () => {
        if (!moduleId) return;
        const result = await publishModule.mutateAsync({ module_id: moduleId, session_id: sessionId || undefined });
        setStatus('published');
        return result;
    }, [moduleId, sessionId, publishModule]);

    const reset = useCallback(() => {
        setSessionId(null);
        setMessages([]);
        setGeneratedConfig(null);
        setStatus('idle');
        setModuleId(null);
        setInitError(false);
    }, []);

    return {
        // State
        sessionId,
        messages,
        generatedConfig,
        status,
        moduleId,
        initError,

        // Loading states
        isStarting: startSession.isPending,
        isSending: sendMessage.isPending,
        isSaving: saveDraft.isPending,
        isPublishing: publishModule.isPending,

        // Actions
        start,
        improve,
        send,
        save,
        publish,
        reset,
    };
}
