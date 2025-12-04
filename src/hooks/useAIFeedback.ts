import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

export interface AIFeedback {
  id: string;
  conversation_id?: string;
  message_id?: string;
  query: string;
  response: string;
  helpful: boolean;
  feedback_text?: string;
  context_type?: string;
  context_metadata?: any;
  response_time_ms?: number;
  was_cached?: boolean;
  token_count?: number;
  issue_category?: string;
  suggested_improvement?: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AIConversationSession {
  id: string;
  user_id?: string;
  session_type: string;
  entity_type?: string;
  entity_id?: string;
  message_count: number;
  helpful_count: number;
  not_helpful_count: number;
  avg_response_time_ms?: number;
  is_active: boolean;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface FeedbackAnalytics {
  date: string;
  context_type?: string;
  total_feedback: number;
  helpful_count: number;
  not_helpful_count: number;
  helpfulness_rate: number;
  avg_response_time: number;
  cached_responses: number;
  cache_hit_rate: number;
}

export interface SubmitFeedbackParams {
  conversationId?: string;
  messageId?: string;
  query: string;
  response: string;
  helpful: boolean;
  feedbackText?: string;
  contextType?: string;
  contextMetadata?: any;
  responseTimeMs?: number;
  wasCached?: boolean;
  tokenCount?: number;
  issueCategory?: string;
  suggestedImprovement?: string;
}

// ============================================================================
// Hooks for AI Feedback
// ============================================================================

/**
 * Submit feedback on an AI response
 */
export function useSubmitAIFeedback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SubmitFeedbackParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("ai_response_feedback")
        .insert({
          conversation_id: params.conversationId,
          message_id: params.messageId,
          query: params.query,
          response: params.response,
          helpful: params.helpful,
          feedback_text: params.feedbackText,
          context_type: params.contextType,
          context_metadata: params.contextMetadata,
          response_time_ms: params.responseTimeMs,
          was_cached: params.wasCached,
          token_count: params.tokenCount,
          issue_category: params.issueCategory,
          suggested_improvement: params.suggestedImprovement,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to submit feedback: ${error.message}`);
      return data as AIFeedback;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["ai-conversation-sessions"] });

      toast.success("Thank you for your feedback!", {
        description: "Your input helps us improve AI responses.",
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to submit feedback", {
        description: error.message,
      });
    },
  });
}

/**
 * Get user's feedback history
 */
export function useUserAIFeedback(limit: number = 50) {
  return useQuery({
    queryKey: ["ai-feedback", "user", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_response_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch feedback: ${error.message}`);
      return data as AIFeedback[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get feedback analytics
 */
export function useFeedbackAnalytics(days: number = 30) {
  return useQuery({
    queryKey: ["ai-feedback-analytics", days],
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from("ai_feedback_analytics")
        .select("*")
        .gte("date", startDate.toISOString())
        .order("date", { ascending: false });

      if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);
      return data as FeedbackAnalytics[];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Refresh feedback analytics materialized view
 */
export function useRefreshFeedbackAnalytics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("refresh_ai_feedback_analytics");
      if (error) throw new Error(`Failed to refresh analytics: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-feedback-analytics"] });
      toast.success("Analytics refreshed successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to refresh analytics", {
        description: error.message,
      });
    },
  });
}

// ============================================================================
// Hooks for Conversation Sessions
// ============================================================================

/**
 * Create a new AI conversation session
 */
export function useCreateConversationSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      sessionType: string;
      entityType?: string;
      entityId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("ai_conversation_sessions")
        .insert({
          user_id: user.id,
          session_type: params.sessionType,
          entity_type: params.entityType,
          entity_id: params.entityId,
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create session: ${error.message}`);
      return data as AIConversationSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversation-sessions"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to create conversation session", {
        description: error.message,
      });
    },
  });
}

/**
 * Get active conversation sessions
 */
export function useActiveConversationSessions() {
  return useQuery({
    queryKey: ["ai-conversation-sessions", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_conversation_sessions")
        .select("*")
        .eq("is_active", true)
        .order("last_activity_at", { ascending: false });

      if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
      return data as AIConversationSession[];
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * End a conversation session
 */
export function useEndConversationSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("ai_conversation_sessions")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (error) throw new Error(`Failed to end session: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-conversation-sessions"] });
    },
    onError: (error: Error) => {
      toast.error("Failed to end session", {
        description: error.message,
      });
    },
  });
}

/**
 * Get conversation session by ID
 */
export function useConversationSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["ai-conversation-sessions", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from("ai_conversation_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();

      if (error) throw new Error(`Failed to fetch session: ${error.message}`);
      return data as AIConversationSession;
    },
    enabled: !!sessionId,
    staleTime: 30 * 1000, // 30 seconds
  });
}
