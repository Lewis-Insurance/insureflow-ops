/**
 * Client Intelligence Hook
 * 
 * React hook for using Prism AI with client context
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildClientContext } from '@/services/clientIntelligence';
import { useToast } from '@/hooks/use-toast';
import type {
  ClientContext,
  ClientIntelligenceResponse,
  QuestionTemplate,
} from '@/types/client-intelligence';
import { SUGGESTED_QUESTIONS } from '@/types/client-intelligence';

// Get Supabase project URL from environment
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://lrqajzwcmdwahnjyidgv.supabase.co';
const PRISM_API_BASE = `${SUPABASE_URL}/functions/v1/prism-api`;

// =============================================================================
// TYPES
// =============================================================================

interface UseClientIntelligenceOptions {
  accountId: string | null;
  autoLoadContext?: boolean;
  includeDocumentText?: boolean;
  maxDocuments?: number;
}

interface ClientIntelligenceState {
  context: ClientContext | null;
  responses: ClientIntelligenceResponse[];
  currentQuestion: string;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useClientIntelligence(options: UseClientIntelligenceOptions) {
  const { 
    accountId, 
    autoLoadContext = true,
    includeDocumentText = true,
    maxDocuments = 20,
  } = options;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<ClientIntelligenceResponse[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ==========================================================================
  // CONTEXT LOADING
  // ==========================================================================

  const {
    data: context,
    isLoading: isLoadingContext,
    error: contextError,
    refetch: refetchContext,
  } = useQuery({
    queryKey: ['client-intelligence-context', accountId, includeDocumentText, maxDocuments],
    queryFn: async () => {
      if (!accountId) return null;
      return buildClientContext(accountId, { includeDocumentText, maxDocuments });
    },
    enabled: !!accountId && autoLoadContext,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // ==========================================================================
  // QUESTION SUBMISSION
  // ==========================================================================

  const askQuestionMutation = useMutation({
    mutationFn: async ({ question, clientContext }: { question: string; clientContext: ClientContext }) => {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in to use Client Intelligence');
      }

      // Build the full prompt with client context
      const fullPrompt = buildPromptWithContext(question, clientContext);

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      // Call Prism API
      const response = await fetch(`${PRISM_API_BASE}/run`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          mode: 'sequential',
          depth: 'synthesis', // 2 cycles for balanced analysis
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const result = await response.json();

      return {
        runId: result.run_id,
        question,
        answer: result.final_output || 'No response generated',
        tokensUsed: result.usage?.total_tokens || 0,
        cost: result.usage?.estimated_cost || 0,
        timestamp: new Date().toISOString(),
      } as ClientIntelligenceResponse;
    },
    onSuccess: (response) => {
      setResponses(prev => [response, ...prev]);
      
      // Invalidate usage stats
      queryClient.invalidateQueries({ queryKey: ['prism-usage'] });
    },
    onError: (error: Error) => {
      if (error.name === 'AbortError') {
        toast({
          title: 'Request cancelled',
          description: 'The analysis was cancelled',
        });
        return;
      }

      toast({
        title: 'Analysis failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const askQuestion = useCallback(async (question: string) => {
    if (!context) {
      toast({
        title: 'No client loaded',
        description: 'Please select a client first',
        variant: 'destructive',
      });
      return null;
    }

    if (!question.trim()) {
      toast({
        title: 'Question required',
        description: 'Please enter a question to ask',
        variant: 'destructive',
      });
      return null;
    }

    return askQuestionMutation.mutateAsync({ question: question.trim(), clientContext: context });
  }, [context, askQuestionMutation, toast]);

  const askSuggestedQuestion = useCallback((template: QuestionTemplate) => {
    return askQuestion(template.question);
  }, [askQuestion]);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const clearResponses = useCallback(() => {
    setResponses([]);
  }, []);

  const loadContext = useCallback(async (newAccountId: string) => {
    return queryClient.fetchQuery({
      queryKey: ['client-intelligence-context', newAccountId, includeDocumentText, maxDocuments],
      queryFn: () => buildClientContext(newAccountId, { includeDocumentText, maxDocuments }),
    });
  }, [queryClient, includeDocumentText, maxDocuments]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    // Context state
    context,
    isLoadingContext,
    contextError: contextError as Error | null,
    refetchContext,
    loadContext,

    // Question state
    responses,
    isAsking: askQuestionMutation.isPending,
    askError: askQuestionMutation.error as Error | null,

    // Actions
    askQuestion,
    askSuggestedQuestion,
    cancelRequest,
    clearResponses,

    // Templates
    suggestedQuestions: SUGGESTED_QUESTIONS,
  };
}

// =============================================================================
// HELPER: BUILD PROMPT WITH CONTEXT
// =============================================================================

function buildPromptWithContext(question: string, context: ClientContext): string {
  const systemInstructions = `You are an expert insurance advisor and account analyst for Lewis Insurance Agency. 
You have been provided with comprehensive client data below. Use this information to provide accurate, actionable insights.

## Your Analysis Guidelines:
1. Be specific and reference actual data from the client's profile
2. Identify concrete opportunities, risks, or recommendations
3. Prioritize findings by importance/urgency
4. Include relevant dates, amounts, and policy details when applicable
5. Format your response clearly with sections and bullet points
6. If you identify any concerning patterns or risks, highlight them prominently
7. Always consider the client's full picture - policies, claims, communications, etc.

## Response Format:
- Start with a brief executive summary (2-3 sentences)
- Follow with detailed findings organized by topic
- End with prioritized recommendations or action items
- Use markdown formatting for clarity

---

# CLIENT DATA

${context.formattedContext}

---

# USER QUESTION

${question}

---

Please provide a comprehensive, data-driven response based on the client information above.`;

  return systemInstructions;
}

// =============================================================================
// HOOK: CLIENT SEARCH FOR SELECTOR
// =============================================================================

export function useClientSearch(searchQuery: string) {
  return useQuery({
    queryKey: ['client-search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) {
        return [];
      }

      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, account_type, account_status, city, state')
        .is('deleted_at', null)
        .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .order('name')
        .limit(20);

      if (error) {
        console.error('Error searching clients:', error);
        return [];
      }

      return data || [];
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// =============================================================================
// HOOK: RECENT CLIENTS
// =============================================================================

export function useRecentClients(limit: number = 10) {
  return useQuery({
    queryKey: ['recent-clients', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, account_type, account_status, city, state, updated_at')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching recent clients:', error);
        return [];
      }

      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

