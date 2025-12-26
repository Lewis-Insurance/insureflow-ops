/**
 * Coverage Comparison React Hooks
 *
 * Provides hooks for:
 * - Fetching comparison workspaces and results
 * - Triggering extraction and comparison
 * - Real-time status updates
 * - Q&A with evidence citations
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type {
  PolicySnapshot,
  ComparisonResult,
  ComparisonWorkspace,
  ComparisonDifference,
  DocMismatch,
  CoverageGap,
  QAResponse,
} from "@/types/coverage-comparison";

// =============================================================================
// WORKSPACE HOOKS
// =============================================================================

/**
 * Fetch comparison workspace with all related data
 */
export const useComparisonWorkspace = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["comparison-workspace", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      // Fetch workspace with documents
      const { data: workspace, error: wsError } = await supabase
        .from("workspaces")
        .select(`
          *,
          workspace_documents (
            id,
            file_name,
            file_url,
            doc_role,
            document_type,
            quality_score,
            quality_tier
          )
        `)
        .eq("id", workspaceId)
        .single();

      if (wsError) throw wsError;
      if (!workspace) return null;

      // Fetch snapshots
      const { data: snapshots } = await supabase
        .from("policy_snapshots")
        .select("*")
        .eq("workspace_id", workspaceId);

      // Fetch comparison result
      const { data: results } = await supabase
        .from("comparison_results")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("compared_at", { ascending: false })
        .limit(1);

      // Fetch reports
      const { data: reports } = await supabase
        .from("comparison_reports")
        .select("*")
        .eq("workspace_id", workspaceId);

      const docA = workspace.workspace_documents?.find((d: any) => d.doc_role === 'A');
      const docB = workspace.workspace_documents?.find((d: any) => d.doc_role === 'B');
      const snapshotA = snapshots?.find((s: any) => s.doc_role === 'A');
      const snapshotB = snapshots?.find((s: any) => s.doc_role === 'B');

      return {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        documentA: docA ? {
          id: docA.id,
          fileName: docA.file_name,
          fileUrl: docA.file_url,
          documentType: docA.document_type,
          qualityScore: docA.quality_score,
          qualityTier: docA.quality_tier,
        } : null,
        documentB: docB ? {
          id: docB.id,
          fileName: docB.file_name,
          fileUrl: docB.file_url,
          documentType: docB.document_type,
          qualityScore: docB.quality_score,
          qualityTier: docB.quality_tier,
        } : null,
        snapshotA: snapshotA || null,
        snapshotB: snapshotB || null,
        comparisonResult: results?.[0] || null,
        reports: reports || [],
        createdAt: workspace.created_at,
        updatedAt: workspace.updated_at,
      } as ComparisonWorkspace;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Fetch comparison result for a workspace
 */
export const useComparisonResult = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["comparison-result", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return null;

      const { data, error } = await supabase
        .from("comparison_results")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("compared_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return data as ComparisonResult;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Fetch policy snapshots for a workspace
 */
export const usePolicySnapshots = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["policy-snapshots", workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { snapshotA: null, snapshotB: null };

      const { data, error } = await supabase
        .from("policy_snapshots")
        .select("*")
        .eq("workspace_id", workspaceId);

      if (error) throw error;

      const snapshotA = data?.find((s: any) => s.doc_role === 'A') || null;
      const snapshotB = data?.find((s: any) => s.doc_role === 'B') || null;

      return { snapshotA, snapshotB };
    },
    enabled: !!workspaceId,
  });
};

// =============================================================================
// MUTATION HOOKS
// =============================================================================

/**
 * Trigger extraction for workspace documents
 */
export const useTriggerExtraction = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase.functions.invoke("comparison-extract", {
        body: { workspace_id: workspaceId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: (data, workspaceId) => {
      toast({
        title: "Extraction Started",
        description: "Documents are being processed. This may take a few minutes.",
      });
      queryClient.invalidateQueries({ queryKey: ["comparison-workspace", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["policy-snapshots", workspaceId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Trigger comparison analysis
 */
export const useTriggerComparison = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase.functions.invoke("comparison-analyze", {
        body: { workspace_id: workspaceId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: (data, workspaceId) => {
      toast({
        title: "Comparison Complete",
        description: `Found ${data.summary?.criticalCount || 0} critical and ${data.summary?.highCount || 0} high-severity differences.`,
      });
      queryClient.invalidateQueries({ queryKey: ["comparison-workspace", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["comparison-result", workspaceId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Comparison Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Generate comparison report
 */
export const useGenerateReport = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      reportType = "standard",
      includeEvidence = true,
    }: {
      workspaceId: string;
      reportType?: "standard" | "executive" | "detailed" | "client_facing";
      includeEvidence?: boolean;
    }) => {
      const { data, error } = await supabase.functions.invoke("comparison-report", {
        body: {
          workspace_id: workspaceId,
          report_type: reportType,
          include_evidence: includeEvidence,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: (data, { workspaceId }) => {
      toast({
        title: "Report Generated",
        description: "Your comparison report is ready to download.",
      });
      queryClient.invalidateQueries({ queryKey: ["comparison-workspace", workspaceId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Report Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Ask a question about the comparison
 */
export const useAskComparisonQuestion = () => {
  return useMutation({
    mutationFn: async ({
      workspaceId,
      question,
    }: {
      workspaceId: string;
      question: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("comparison-qa", {
        body: {
          workspace_id: workspaceId,
          question,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data.response as QAResponse;
    },
  });
};

// =============================================================================
// REAL-TIME SUBSCRIPTION HOOK
// =============================================================================

/**
 * Subscribe to workspace status changes
 */
export const useComparisonSubscription = (workspaceId: string | undefined) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`workspace-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "workspaces",
          filter: `id=eq.${workspaceId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["comparison-workspace", workspaceId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "policy_snapshots",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["policy-snapshots", workspaceId] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comparison_results",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["comparison-result", workspaceId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
};

// =============================================================================
// DOCUMENT MANAGEMENT HOOKS
// =============================================================================

/**
 * Assign document role (A or B)
 */
export const useAssignDocumentRole = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      documentId,
      docRole,
    }: {
      documentId: string;
      docRole: 'A' | 'B';
    }) => {
      const { data, error } = await supabase
        .from("workspace_documents")
        .update({ doc_role: docRole })
        .eq("id", documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Role Assigned",
        description: `Document assigned as Document ${data.doc_role}`,
      });
      queryClient.invalidateQueries({ queryKey: ["comparison-workspace"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Assign Role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Swap document roles (A <-> B)
 */
export const useSwapDocumentRoles = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      // Fetch current documents
      const { data: docs, error: fetchError } = await supabase
        .from("workspace_documents")
        .select("id, doc_role")
        .eq("workspace_id", workspaceId);

      if (fetchError) throw fetchError;

      const docA = docs?.find((d) => d.doc_role === 'A');
      const docB = docs?.find((d) => d.doc_role === 'B');

      if (!docA || !docB) {
        throw new Error("Both documents must have roles assigned");
      }

      // Swap roles
      await supabase
        .from("workspace_documents")
        .update({ doc_role: 'B' })
        .eq("id", docA.id);

      await supabase
        .from("workspace_documents")
        .update({ doc_role: 'A' })
        .eq("id", docB.id);

      return { success: true };
    },
    onSuccess: (_, workspaceId) => {
      toast({
        title: "Roles Swapped",
        description: "Document A and B have been swapped.",
      });
      queryClient.invalidateQueries({ queryKey: ["comparison-workspace", workspaceId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Swap Roles",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

// =============================================================================
// HELPER HOOKS
// =============================================================================

/**
 * Get differences filtered by category
 */
export const useDifferencesByCategory = (
  result: ComparisonResult | null | undefined,
  category: string
) => {
  if (!result?.differencesByCategory) return [];
  return result.differencesByCategory[category as keyof typeof result.differencesByCategory] || [];
};

/**
 * Get top N differences by severity
 */
export const useTopDifferences = (
  result: ComparisonResult | null | undefined,
  limit: number = 10
) => {
  if (!result?.differences) return [];

  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...result.differences]
    .sort((a, b) => {
      const aSev = severityOrder[a.severity] ?? 4;
      const bSev = severityOrder[b.severity] ?? 4;
      return aSev - bSev;
    })
    .slice(0, limit);
};

/**
 * Calculate comparison progress percentage
 */
export const useComparisonProgress = (workspace: ComparisonWorkspace | null | undefined) => {
  if (!workspace) return 0;

  const steps = [
    !!workspace.documentA,
    !!workspace.documentB,
    !!workspace.snapshotA,
    !!workspace.snapshotB,
    !!workspace.comparisonResult,
  ];

  const completed = steps.filter(Boolean).length;
  return Math.round((completed / steps.length) * 100);
};
