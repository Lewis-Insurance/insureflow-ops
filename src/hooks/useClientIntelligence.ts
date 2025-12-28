/**
 * Client Intelligence Hook
 * 
 * React hook for using Prism AI with client context
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildClientContext } from '@/services/clientIntelligence';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import type {
  ClientContext,
  ClientIntelligenceResponse,
  QuestionTemplate,
  CEOCopilotResponse,
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

      // Try to parse structured response from the output
      let structuredResponse: CEOCopilotResponse | undefined;
      const finalOutput = result.final_output || '';
      
      if (finalOutput) {
        try {
          // Try to extract JSON from the response
          // It might be wrapped in markdown code blocks
          const jsonMatch = finalOutput.match(/```json\n?([\s\S]*?)\n?```/) ||
                           finalOutput.match(/```\n?([\s\S]*?)\n?```/) ||
                           finalOutput.match(/(\{[\s\S]*"executive_summary"[\s\S]*\})/);
          
          if (jsonMatch) {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonStr.trim());
            
            // Validate it has the expected structure
            if (parsed.executive_summary && Array.isArray(parsed.key_findings)) {
              structuredResponse = parsed as CEOCopilotResponse;
            }
          }
        } catch (e) {
          logger.debug('Could not parse structured response, using raw output');
        }
      }

      return {
        runId: result.run_id,
        question,
        answer: finalOutput || 'No response generated',
        structuredResponse,
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
  const systemInstructions = `You are an AI-powered CEO co-pilot, specialized in strategic client intelligence analysis for Lewis Insurance Agency. Your role is to enhance understanding and service delivery by analyzing complete client profiles through AI-powered insights.

## Your Primary Tasks:
1. Identifying client coverage gaps
2. Summarizing client activities from the past six months
3. Highlighting cross-sell opportunities
4. Assessing churn risk

## Key Requirements:
- Utilize structured data aggregation techniques, prioritizing data by recency and relevance
- Manage token usage efficiently to ensure comprehensiveness without exceeding limits
- Deliver insights with an executive summary, key findings, recommendations, action items, and risk flags
- Every finding MUST include citations referencing the source data

## Response Format:
You MUST respond with valid JSON matching this exact schema:

\`\`\`json
{
  "executive_summary": "2-3 sentence overview of the most important insights",
  "key_findings": [
    {
      "id": "finding-1",
      "finding": "Description of the finding",
      "severity": "critical|high|medium|low",
      "category": "coverage|claims|engagement|renewal|other",
      "evidence": [{"source_type": "policy|claim|note|document|task|call|sms|event|quote", "source_id": "uuid", "source_label": "Policy #123", "snippet": "relevant text", "deep_link": "/accounts/{id}/policies/{id}"}]
    }
  ],
  "recommendations": [
    {
      "id": "rec-1",
      "priority": 1,
      "recommendation": "What to do",
      "rationale": "Why to do it",
      "expected_impact": "Expected outcome",
      "evidence": [...]
    }
  ],
  "action_items": [
    {
      "id": "action-1",
      "action": "Specific action to take",
      "owner_suggestion": "Account Manager",
      "due_suggestion": "Within 7 days",
      "priority": "urgent|high|medium|low",
      "can_create_task": true,
      "related_finding_id": "finding-1"
    }
  ],
  "risk_flags": [
    {
      "id": "risk-1",
      "risk_type": "coverage_gap|churn|claims_pattern|compliance|renewal|payment|other",
      "title": "Brief title",
      "description": "Detailed description",
      "severity": "critical|high|medium|low",
      "mitigation_suggestion": "How to address",
      "evidence": [...]
    }
  ],
  "coverage_gaps": [
    {
      "id": "gap-1",
      "gap_type": "No cyber liability coverage",
      "current_state": "Current coverage description",
      "recommended_coverage": "What should be added",
      "estimated_premium": "$X,XXX/year",
      "risk_if_unaddressed": "Potential exposure",
      "priority": "critical|high|medium|low"
    }
  ],
  "cross_sell_opportunities": [
    {
      "id": "xsell-1",
      "product": "Product name",
      "rationale": "Why this is a good fit",
      "estimated_premium": "$X,XXX/year",
      "likelihood": "high|medium|low",
      "talking_points": ["Point 1", "Point 2"]
    }
  ],
  "citations": [
    {
      "id": "cite-1",
      "source_type": "policy",
      "source_id": "uuid-from-data",
      "source_label": "Policy #ABC123",
      "snippet": "...coverage limit of $1M...",
      "deep_link": "/accounts/${context.accountId}/policies/{policy_id}",
      "timestamp": "2024-01-15"
    }
  ],
  "confidence_score": 0.85
}
\`\`\`

## Important Rules:
1. ALWAYS cite sources using the exact source_id from the provided data
2. Prioritize recent data (last 6 months) over older data
3. Flag any critical issues (expiring policies, open claims, coverage gaps) prominently
4. Be specific with numbers, dates, and policy details
5. Action items should be concrete and assignable
6. Use deep_link format: /accounts/${context.accountId}/{entity_type}/{entity_id}

---

# CLIENT DATA

**Account:** ${context.accountName} (ID: ${context.accountId})

${context.formattedContext}

---

# USER QUESTION

${question}

---

Respond ONLY with valid JSON matching the schema above. Do not include any text before or after the JSON. Include citations for all findings.`;

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
        logger.error('Error searching clients:', error);
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
        logger.error('Error fetching recent clients:', error);
        return [];
      }

      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

