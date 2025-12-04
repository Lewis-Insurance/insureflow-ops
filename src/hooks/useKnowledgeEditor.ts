import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { KnowledgeEntry } from "./useKnowledgeBase";

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeHistory {
  id: string;
  knowledge_id: string;
  version: number;
  change_type: "created" | "updated" | "deleted" | "restored";
  field_changes: any;
  change_summary?: string;
  title_snapshot: string;
  content_snapshot: string;
  category_snapshot: string;
  tags_snapshot: string[];
  changed_by?: string;
  changed_by_user?: { email: string; raw_user_meta_data?: any };
  changed_at: string;
  metadata?: any;
}

export interface FieldChange {
  before: any;
  after: any;
}

export interface UpdateKnowledgeParams {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  changeSummary?: string;
}

// ============================================================================
// Hooks for Knowledge Editing
// ============================================================================

/**
 * Update a knowledge entry with version tracking
 */
export function useUpdateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateKnowledgeParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { id, changeSummary, ...updates } = params;

      const { data, error } = await supabase
        .from("knowledge_base")
        .update({
          ...updates,
          change_summary: changeSummary,
          edited_by: user.id,
          edited_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update knowledge: ${error.message}`);
      return data as KnowledgeEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-history"] });

      toast.success("Knowledge entry updated successfully", {
        description: "Changes have been saved and version history recorded.",
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to update knowledge", {
        description: error.message,
      });
    },
  });
}

/**
 * Get version history for a knowledge entry
 */
export function useKnowledgeHistory(knowledgeId: string | null) {
  return useQuery({
    queryKey: ["knowledge-history", knowledgeId],
    queryFn: async () => {
      if (!knowledgeId) return [];

      const { data, error } = await supabase
        .from("knowledge_base_history")
        .select(`
          *,
          changed_by_user:changed_by(email, raw_user_meta_data)
        `)
        .eq("knowledge_id", knowledgeId)
        .order("version", { ascending: false });

      if (error) throw new Error(`Failed to fetch history: ${error.message}`);
      return (data as any) as KnowledgeHistory[];
    },
    enabled: !!knowledgeId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Revert knowledge entry to a previous version
 */
export function useRevertKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ knowledgeId, version }: { knowledgeId: string; version: number }) => {
      const { data, error } = await supabase.rpc("revert_knowledge_to_version", {
        p_knowledge_id: knowledgeId,
        p_version: version,
      });

      if (error) throw new Error(`Failed to revert: ${error.message}`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-history"] });

      toast.success("Reverted to previous version", {
        description: "Knowledge entry has been restored.",
      });
    },
    onError: (error: Error) => {
      toast.error("Failed to revert", {
        description: error.message,
      });
    },
  });
}

/**
 * Compare two versions of a knowledge entry
 */
export function useCompareVersions(knowledgeId: string | null, version1: number | null, version2: number | null) {
  return useQuery({
    queryKey: ["knowledge-compare", knowledgeId, version1, version2],
    queryFn: async () => {
      if (!knowledgeId || version1 === null || version2 === null) return null;

      const { data, error} = await supabase
        .from("knowledge_base_history")
        .select("*")
        .eq("knowledge_id", knowledgeId)
        .in("version", [version1, version2])
        .order("version", { ascending: true });

      if (error) throw new Error(`Failed to fetch versions: ${error.message}`);
      if (!data || data.length !== 2) return null;

      const [older, newer] = data as KnowledgeHistory[];

      return {
        older,
        newer,
        changes: {
          title: {
            changed: older.title_snapshot !== newer.title_snapshot,
            before: older.title_snapshot,
            after: newer.title_snapshot,
          },
          content: {
            changed: older.content_snapshot !== newer.content_snapshot,
            before: older.content_snapshot,
            after: newer.content_snapshot,
          },
          category: {
            changed: older.category_snapshot !== newer.category_snapshot,
            before: older.category_snapshot,
            after: newer.category_snapshot,
          },
          tags: {
            changed: JSON.stringify(older.tags_snapshot) !== JSON.stringify(newer.tags_snapshot),
            before: older.tags_snapshot,
            after: newer.tags_snapshot,
          },
        },
      };
    },
    enabled: !!knowledgeId && version1 !== null && version2 !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get knowledge entries with statistics
 */
export function useKnowledgeWithStats() {
  return useQuery({
    queryKey: ["knowledge-with-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_with_stats")
        .select("*")
        .order("last_modified_at", { ascending: false, nullsFirst: false });

      if (error) throw new Error(`Failed to fetch knowledge with stats: ${error.message}`);
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Bulk update knowledge entries
 */
export function useBulkUpdateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Array<{ id: string; changes: Partial<KnowledgeEntry> }>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const results = await Promise.allSettled(
        updates.map(({ id, changes }) =>
          supabase
            .from("knowledge_base")
            .update({
              ...changes,
              edited_by: user.id,
              edited_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
        )
      );

      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        throw new Error(`${failures.length} updates failed`);
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-history"] });

      const successCount = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`Updated ${successCount} knowledge entries`, {
        description: "Bulk update completed successfully.",
      });
    },
    onError: (error: Error) => {
      toast.error("Bulk update failed", {
        description: error.message,
      });
    },
  });
}

/**
 * Get recent changes across all knowledge entries
 */
export function useRecentKnowledgeChanges(limit: number = 20) {
  return useQuery({
    queryKey: ["knowledge-recent-changes", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_history")
        .select(`
          *,
          knowledge:knowledge_base!knowledge_base_history_knowledge_id_fkey(
            id,
            title
          ),
          changed_by_user:changed_by(email, raw_user_meta_data)
        `)
        .order("changed_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch recent changes: ${error.message}`);
      return (data as any) as KnowledgeHistory[];
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}
