import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeUsageLog {
  id: string;
  knowledge_id: string;
  action_type: "view" | "search_result" | "ai_response" | "edit" | "helpful_vote" | "unhelpful_vote";
  search_query?: string;
  context_type?: string;
  response_time_ms?: number;
  relevance_score?: number;
  was_helpful?: boolean;
  user_id?: string;
  session_id?: string;
  created_at: string;
}

export interface KnowledgeSearchQuery {
  id: string;
  query_text: string;
  normalized_query?: string;
  result_count: number;
  top_result_id?: string;
  avg_relevance_score?: number;
  had_results: boolean;
  user_clicked_result?: boolean;
  user_satisfied?: boolean;
  user_id?: string;
  session_id?: string;
  created_at: string;
}

export interface KnowledgeUsageStats {
  knowledge_id: string;
  title: string;
  category: string;
  tags?: string[];
  entry_created_at: string;
  entry_updated_at: string;
  view_count: number;
  search_result_count: number;
  ai_response_count: number;
  edit_count: number;
  total_interactions: number;
  helpful_votes: number;
  unhelpful_votes: number;
  helpfulness_rate?: number;
  avg_response_time_ms?: number;
  avg_relevance_score?: number;
  last_accessed_at?: string;
  days_since_last_access?: number;
  unique_users: number;
  unique_sessions: number;
}

export interface KnowledgeSearchTrend {
  normalized_query: string;
  example_query: string;
  search_count: number;
  no_results_count: number;
  no_results_rate: number;
  avg_results_per_search: number;
  avg_relevance: number;
  click_count: number;
  click_through_rate: number;
  last_searched_at: string;
  unique_users: number;
  is_knowledge_gap: boolean;
}

export interface KnowledgeGapTrend {
  date: string;
  normalized_query: string;
  example_query: string;
  attempt_count: number;
  unique_users_affected: number;
  unique_sessions_affected: number;
  avg_result_count: number;
}

export interface KnowledgeCategoryStats {
  category: string;
  entry_count: number;
  unique_tags: number;
  avg_content_length: number;
  total_views: number;
  total_searches: number;
  total_ai_responses: number;
  avg_helpfulness_rate: number;
  newest_entry_at: string;
  oldest_entry_at: string;
  last_updated_at: string;
}

export interface LogUsageParams {
  knowledgeId: string;
  actionType: "view" | "search_result" | "ai_response" | "edit" | "helpful_vote" | "unhelpful_vote";
  searchQuery?: string;
  contextType?: string;
  responseTimeMs?: number;
  relevanceScore?: number;
  sessionId?: string;
}

export interface LogSearchParams {
  queryText: string;
  resultCount?: number;
  topResultId?: string;
  avgRelevanceScore?: number;
  sessionId?: string;
}

// ============================================================================
// Hooks for Logging Usage
// ============================================================================

/**
 * Log knowledge usage event
 */
export function useLogKnowledgeUsage() {
  return useMutation({
    mutationFn: async (params: LogUsageParams) => {
      const { data, error } = await supabase.rpc("log_knowledge_usage", {
        p_knowledge_id: params.knowledgeId,
        p_action_type: params.actionType,
        p_search_query: params.searchQuery,
        p_context_type: params.contextType,
        p_response_time_ms: params.responseTimeMs,
        p_relevance_score: params.relevanceScore,
        p_session_id: params.sessionId,
      });

      if (error) throw new Error(`Failed to log usage: ${error.message}`);
      return data;
    },
    // Silent logging - no toast notifications
    onError: (error: Error) => {
      logger.error("Failed to log knowledge usage:", error.message);
    },
  });
}

/**
 * Log knowledge search query
 */
export function useLogKnowledgeSearch() {
  return useMutation({
    mutationFn: async (params: LogSearchParams) => {
      const { data, error } = await supabase.rpc("log_knowledge_search", {
        p_query_text: params.queryText,
        p_result_count: params.resultCount ?? 0,
        p_top_result_id: params.topResultId,
        p_avg_relevance_score: params.avgRelevanceScore,
        p_session_id: params.sessionId,
      });

      if (error) throw new Error(`Failed to log search: ${error.message}`);
      return data;
    },
    // Silent logging - no toast notifications
    onError: (error: Error) => {
      logger.error("Failed to log knowledge search:", error.message);
    },
  });
}

// ============================================================================
// Hooks for Analytics Queries
// ============================================================================

/**
 * Get knowledge usage statistics
 */
export function useKnowledgeUsageStats(limit: number = 50) {
  return useQuery({
    queryKey: ["knowledge-usage-stats", limit],
    queryFn: async (): Promise<KnowledgeUsageStats[]> => {
      const { data, error } = await supabase
        .from("knowledge_usage_stats")
        .select("*")
        .order("total_interactions", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch usage stats: ${error.message}`);
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get usage statistics for a specific knowledge entry
 */
export function useKnowledgeEntryStats(knowledgeId: string | null) {
  return useQuery({
    queryKey: ["knowledge-usage-stats", knowledgeId],
    queryFn: async (): Promise<KnowledgeUsageStats | null> => {
      if (!knowledgeId) return null;

      const { data, error } = await supabase
        .from("knowledge_usage_stats")
        .select("*")
        .eq("knowledge_id", knowledgeId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // No rows returned
        throw new Error(`Failed to fetch entry stats: ${error.message}`);
      }
      return data;
    },
    enabled: !!knowledgeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get search trends
 */
export function useKnowledgeSearchTrends(limit: number = 100) {
  return useQuery({
    queryKey: ["knowledge-search-trends", limit],
    queryFn: async (): Promise<KnowledgeSearchTrend[]> => {
      const { data, error } = await supabase
        .from("knowledge_search_trends")
        .select("*")
        .order("search_count", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch search trends: ${error.message}`);
      return data || [];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Get knowledge gaps (queries with no results)
 */
export function useKnowledgeGaps(limit: number = 50) {
  return useQuery({
    queryKey: ["knowledge-gaps", limit],
    queryFn: async (): Promise<KnowledgeSearchTrend[]> => {
      const { data, error } = await supabase
        .from("knowledge_search_trends")
        .select("*")
        .eq("is_knowledge_gap", true)
        .order("search_count", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch knowledge gaps: ${error.message}`);
      return data || [];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Get knowledge gap trends over time
 */
export function useKnowledgeGapTrends(days: number = 30) {
  return useQuery({
    queryKey: ["knowledge-gap-trends", days],
    queryFn: async (): Promise<KnowledgeGapTrend[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from("knowledge_gap_trends")
        .select("*")
        .gte("date", startDate.toISOString())
        .order("date", { ascending: false })
        .order("attempt_count", { ascending: false });

      if (error) throw new Error(`Failed to fetch gap trends: ${error.message}`);
      return data || [];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Get category statistics
 */
export function useKnowledgeCategoryStats() {
  return useQuery({
    queryKey: ["knowledge-category-stats"],
    queryFn: async (): Promise<KnowledgeCategoryStats[]> => {
      const { data, error } = await supabase
        .from("knowledge_category_stats")
        .select("*")
        .order("total_views", { ascending: false });

      if (error) throw new Error(`Failed to fetch category stats: ${error.message}`);
      return data || [];
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Get recent usage logs
 */
export function useRecentKnowledgeUsage(limit: number = 100) {
  return useQuery({
    queryKey: ["knowledge-usage-logs", limit],
    queryFn: async (): Promise<KnowledgeUsageLog[]> => {
      const { data, error } = await supabase
        .from("knowledge_usage_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch usage logs: ${error.message}`);
      return data || [];
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Get recent search queries
 */
export function useRecentSearchQueries(limit: number = 100) {
  return useQuery({
    queryKey: ["knowledge-search-queries", limit],
    queryFn: async (): Promise<KnowledgeSearchQuery[]> => {
      const { data, error } = await supabase
        .from("knowledge_search_queries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch search queries: ${error.message}`);
      return data || [];
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

// ============================================================================
// Hooks for Analytics Refresh
// ============================================================================

/**
 * Refresh all knowledge analytics materialized views
 */
export function useRefreshKnowledgeAnalytics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("refresh_knowledge_analytics");
      if (error) throw new Error(`Failed to refresh analytics: ${error.message}`);
    },
    onSuccess: () => {
      // Invalidate all analytics queries
      queryClient.invalidateQueries({ queryKey: ["knowledge-usage-stats"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-search-trends"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-gaps"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-gap-trends"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-category-stats"] });
      queryClient.invalidateQueries({ queryKey: ["top-knowledge-entries"] });
      queryClient.invalidateQueries({ queryKey: ["most-helpful-entries"] });

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
// Helper Hooks for Common Analytics Patterns
// ============================================================================

/**
 * Get top performing knowledge entries
 */
export function useTopKnowledgeEntries(limit: number = 10) {
  return useQuery({
    queryKey: ["top-knowledge-entries", limit],
    queryFn: async (): Promise<KnowledgeUsageStats[]> => {
      const { data, error } = await supabase
        .from("knowledge_usage_stats")
        .select("*")
        .order("total_interactions", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch top entries: ${error.message}`);
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get most helpful knowledge entries
 */
export function useMostHelpfulEntries(limit: number = 10) {
  return useQuery({
    queryKey: ["most-helpful-entries", limit],
    queryFn: async (): Promise<KnowledgeUsageStats[]> => {
      const { data, error } = await supabase
        .from("knowledge_usage_stats")
        .select("*")
        .not("helpfulness_rate", "is", null)
        .gte("helpful_votes", 3) // Require at least 3 votes for reliability
        .order("helpfulness_rate", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch helpful entries: ${error.message}`);
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get trending searches (recent high-volume queries)
 */
export function useTrendingSearches(days: number = 7, limit: number = 20) {
  return useQuery({
    queryKey: ["trending-searches", days, limit],
    queryFn: async (): Promise<KnowledgeSearchQuery[]> => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from("knowledge_search_queries")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch trending searches: ${error.message}`);
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
