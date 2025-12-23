import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import type {
  Workspace,
  WorkspaceWithEntities,
  WorkspaceDocument,
  WorkspaceFilters,
  LinkWorkspacePayload,
  WorkspaceStatus
} from "@/types/workspace";

// Re-export types for backward compatibility
export type { Workspace, WorkspaceWithEntities, WorkspaceDocument, WorkspaceFilters };

// ============================================================
// QUERIES
// ============================================================

/**
 * Fetch all workspaces with entity details
 * Uses the workspaces_with_entities view when available, falls back to basic query
 */
export function useWorkspaces(filters?: WorkspaceFilters) {
  return useQuery({
    queryKey: ["workspaces", filters],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Try to use the view first, fallback to basic table
      let query = supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false });

      // Apply filters - Note: entity linking filters require migration to be run first
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.task_type && filters.task_type !== 'all') {
        query = query.eq('task_type', filters.task_type);
      }
      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,task_type.ilike.%${filters.search}%,client_name.ilike.%${filters.search}%`
        );
      }
      // Entity filters (uncomment after migration runs):
      // if (filters?.entity_type && filters.entity_type !== 'all') {
      //   query = query.eq('linked_entity_type', filters.entity_type);
      // }
      // if (filters?.account_id) {
      //   query = query.eq('account_id', filters.account_id);
      // }
      // if (filters?.unlinked_only) {
      //   query = query.is('linked_entity_type', null);
      // }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch profiles for all unique creator IDs
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(ws => ws.created_by))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));

        // Also fetch entity names if linked (columns may not exist until migration runs)
        const typedData = data as any[];
        const accountIds = [...new Set(typedData.filter(w => w.account_id).map(w => w.account_id))];
        const leadIds = [...new Set(typedData.filter(w => w.lead_id).map(w => w.lead_id))];
        const policyIds = [...new Set(typedData.filter(w => w.policy_id).map(w => w.policy_id))];

        const [accountsResult, leadsResult, policiesResult] = await Promise.all([
          accountIds.length > 0
            ? supabase.from("accounts").select("id, name, email, type").in("id", accountIds)
            : { data: [] },
          leadIds.length > 0
            ? supabase.from("leads").select("id, first_name, last_name, email, status, company_name").in("id", leadIds)
            : { data: [] },
          policyIds.length > 0
            ? supabase.from("policies").select("id, policy_number, line_of_business, status, carrier:carriers(name)").in("id", policyIds)
            : { data: [] },
        ]);

        const accountMap = new Map((accountsResult.data || []).map((a: any) => [a.id, a]));
        const leadMap = new Map((leadsResult.data || []).map((l: any) => [l.id, l]));
        const policyMap = new Map((policiesResult.data || []).map((p: any) => [p.id, p]));

        return typedData.map(ws => {
          const profile = profileMap.get(ws.created_by);
          const account = ws.account_id ? accountMap.get(ws.account_id) : null;
          const lead = ws.lead_id ? leadMap.get(ws.lead_id) : null;
          const policy = ws.policy_id ? policyMap.get(ws.policy_id) : null;

          return {
            ...ws,
            creator_name: profile || "Unknown User",
            // Account details
            account_name: account?.name,
            account_email: account?.email,
            account_type: account?.type,
            // Lead details
            lead_name: lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.company_name : null,
            lead_email: lead?.email,
            lead_status: lead?.status,
            lead_company: lead?.company_name,
            // Policy details
            policy_number: policy?.policy_number,
            carrier_name: policy?.carrier && typeof policy.carrier === 'object' ? (policy.carrier as any).name : null,
            policy_lob: policy?.line_of_business,
            policy_status: policy?.status,
          } as WorkspaceWithEntities;
        });
      }

      return data as WorkspaceWithEntities[];
    },
  });
}

/**
 * Fetch active workspaces (idle + processing) with entity details
 */
export const useActiveWorkspaces = () => {
  return useQuery({
    queryKey: ["workspaces", "active"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", user.id)
        .in("status", ["idle", "processing"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles and entity details
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(ws => ws.created_by))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));

        // Fetch entity names (columns may not exist until migration runs)
        const typedData = data as any[];
        const accountIds = [...new Set(typedData.filter(w => w.account_id).map(w => w.account_id))];
        const leadIds = [...new Set(typedData.filter(w => w.lead_id).map(w => w.lead_id))];
        const policyIds = [...new Set(typedData.filter(w => w.policy_id).map(w => w.policy_id))];

        const [accountsResult, leadsResult, policiesResult] = await Promise.all([
          accountIds.length > 0
            ? supabase.from("accounts").select("id, name, email, type").in("id", accountIds)
            : { data: [] },
          leadIds.length > 0
            ? supabase.from("leads").select("id, first_name, last_name, email, status, company_name").in("id", leadIds)
            : { data: [] },
          policyIds.length > 0
            ? supabase.from("policies").select("id, policy_number, line_of_business, status, carrier:carriers(name)").in("id", policyIds)
            : { data: [] },
        ]);

        const accountMap = new Map((accountsResult.data || []).map((a: any) => [a.id, a]));
        const leadMap = new Map((leadsResult.data || []).map((l: any) => [l.id, l]));
        const policyMap = new Map((policiesResult.data || []).map((p: any) => [p.id, p]));

        return typedData.map(ws => {
          const profile = profileMap.get(ws.created_by);
          const account = ws.account_id ? accountMap.get(ws.account_id) : null;
          const lead = ws.lead_id ? leadMap.get(ws.lead_id) : null;
          const policy = ws.policy_id ? policyMap.get(ws.policy_id) : null;

          return {
            ...ws,
            creator_name: profile || "Unknown User",
            account_name: account?.name,
            account_email: account?.email,
            account_type: account?.type,
            lead_name: lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.company_name : null,
            lead_email: lead?.email,
            lead_status: lead?.status,
            lead_company: lead?.company_name,
            policy_number: policy?.policy_number,
            carrier_name: policy?.carrier && typeof policy.carrier === 'object' ? (policy.carrier as any).name : null,
            policy_lob: policy?.line_of_business,
            policy_status: policy?.status,
          } as WorkspaceWithEntities;
        });
      }

      return data as WorkspaceWithEntities[];
    },
  });
};

/**
 * Fetch completed workspaces with entity details
 */
export const useCompletedWorkspaces = () => {
  return useQuery({
    queryKey: ["workspaces", "completed"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", user.id)
        .in("status", ["completed", "failed"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      // Fetch profiles and entity details
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(ws => ws.created_by))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));

        // Fetch entity names (columns may not exist until migration runs)
        const typedData = data as any[];
        const accountIds = [...new Set(typedData.filter(w => w.account_id).map(w => w.account_id))];
        const leadIds = [...new Set(typedData.filter(w => w.lead_id).map(w => w.lead_id))];
        const policyIds = [...new Set(typedData.filter(w => w.policy_id).map(w => w.policy_id))];

        const [accountsResult, leadsResult, policiesResult] = await Promise.all([
          accountIds.length > 0
            ? supabase.from("accounts").select("id, name, email, type").in("id", accountIds)
            : { data: [] },
          leadIds.length > 0
            ? supabase.from("leads").select("id, first_name, last_name, email, status, company_name").in("id", leadIds)
            : { data: [] },
          policyIds.length > 0
            ? supabase.from("policies").select("id, policy_number, line_of_business, status, carrier:carriers(name)").in("id", policyIds)
            : { data: [] },
        ]);

        const accountMap = new Map((accountsResult.data || []).map((a: any) => [a.id, a]));
        const leadMap = new Map((leadsResult.data || []).map((l: any) => [l.id, l]));
        const policyMap = new Map((policiesResult.data || []).map((p: any) => [p.id, p]));

        return typedData.map(ws => {
          const profile = profileMap.get(ws.created_by);
          const account = ws.account_id ? accountMap.get(ws.account_id) : null;
          const lead = ws.lead_id ? leadMap.get(ws.lead_id) : null;
          const policy = ws.policy_id ? policyMap.get(ws.policy_id) : null;

          return {
            ...ws,
            creator_name: profile || "Unknown User",
            account_name: account?.name,
            account_email: account?.email,
            account_type: account?.type,
            lead_name: lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.company_name : null,
            lead_email: lead?.email,
            lead_status: lead?.status,
            lead_company: lead?.company_name,
            policy_number: policy?.policy_number,
            carrier_name: policy?.carrier && typeof policy.carrier === 'object' ? (policy.carrier as any).name : null,
            policy_lob: policy?.line_of_business,
            policy_status: policy?.status,
          } as WorkspaceWithEntities;
        });
      }

      return data as WorkspaceWithEntities[];
    },
  });
};

/**
 * Fetch single workspace with documents and entity details
 */
export const useWorkspace = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("No workspace ID");

      const { data, error } = await supabase
        .from("workspaces")
        .select(`
          *,
          workspace_documents (*)
        `)
        .eq("id", workspaceId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!workspaceId,
  });
};

/**
 * Fetch documents for a workspace
 */
export const useWorkspaceDocuments = (workspaceId: string | undefined) => {
  return useQuery({
    queryKey: ["workspace-documents", workspaceId],
    queryFn: async () => {
      if (!workspaceId) throw new Error("No workspace ID");

      const { data, error } = await supabase
        .from("workspace_documents")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as WorkspaceDocument[];
    },
    enabled: !!workspaceId,
  });
};

/**
 * Get unique task types for filter dropdown
 */
export function useWorkspaceTaskTypes() {
  return useQuery({
    queryKey: ['workspace-task-types'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from('workspaces')
        .select('task_type')
        .eq('created_by', user.id)
        .order('task_type');

      if (error) throw error;

      const unique = [...new Set(data.map(d => d.task_type))];
      return unique;
    },
  });
}

// ============================================================
// MUTATIONS
// ============================================================

/**
 * Create workspace mutation
 */
export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      title?: string;
      task_type: string;
      client_name?: string;
      notes?: string;
      account_id?: string;
      lead_id?: string;
      policy_id?: string;
      documents: Array<{
        file_name: string;
        file_url: string;
        role?: string;
      }>;
    }) => {
      const response = await supabase.functions.invoke("create_workspace", {
        body: payload,
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast({
        title: "Workspace created",
        description: "Your documents have been uploaded and sent for processing",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create workspace",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });
};

/**
 * Link a workspace to an account, lead, or policy
 */
export function useLinkWorkspace() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ workspace_id, entity_type, entity_id }: LinkWorkspacePayload) => {
      const updateData: Record<string, string | null> = {
        account_id: null,
        lead_id: null,
        policy_id: null,
      };

      // Set the appropriate FK based on entity type
      if (entity_type === 'account') {
        updateData.account_id = entity_id;
      } else if (entity_type === 'lead') {
        updateData.lead_id = entity_id;
      } else if (entity_type === 'policy') {
        updateData.policy_id = entity_id;

        // If linking to policy, also get the account_id from the policy
        const { data: policy } = await supabase
          .from('policies')
          .select('account_id')
          .eq('id', entity_id)
          .single();

        if (policy?.account_id) {
          updateData.account_id = policy.account_id;
        }
      }

      const { data, error } = await supabase
        .from('workspaces')
        .update(updateData)
        .eq('id', workspace_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', variables.workspace_id] });
      toast({
        title: 'Workspace linked',
        description: `Successfully linked to ${variables.entity_type}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error linking workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Unlink a workspace from all entities
 */
export function useUnlinkWorkspace() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase
        .from('workspaces')
        .update({
          account_id: null,
          lead_id: null,
          policy_id: null,
        })
        .eq('id', workspaceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      toast({
        title: 'Workspace unlinked',
        description: 'Entity link removed',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error unlinking workspace',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Update workspace status mutation
 */
export const useUpdateWorkspaceStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      status,
    }: {
      workspaceId: string;
      status: WorkspaceStatus;
    }) => {
      const { data, error } = await supabase
        .from("workspaces")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", workspaceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Delete workspace mutation
 */
export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .eq("id", workspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast({
        title: "Workspace deleted",
        description: "The workspace has been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Bulk delete workspaces mutation
 */
export const useBulkDeleteWorkspaces = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (workspaceIds: string[]) => {
      const { error } = await supabase
        .from("workspaces")
        .delete()
        .in("id", workspaceIds);

      if (error) throw error;
      return workspaceIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast({
        title: "Workspaces deleted",
        description: `${count} workspace(s) have been removed`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete workspaces",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Delete all processing workspaces
 */
export const useDeleteAllProcessing = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspaces")
        .delete()
        .eq("created_by", user.id)
        .in("status", ["processing", "idle"])
        .select();

      if (error) throw error;
      return data?.length || 0;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      toast({
        title: "All processing jobs deleted",
        description: `${count} workspace(s) have been removed`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete workspaces",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

/**
 * Bulk link multiple workspaces to an entity
 */
export function useBulkLinkWorkspaces() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspace_ids,
      entity_type,
      entity_id
    }: {
      workspace_ids: string[];
      entity_type: 'account' | 'lead' | 'policy';
      entity_id: string;
    }) => {
      const updateData: Record<string, string | null> = {
        account_id: null,
        lead_id: null,
        policy_id: null,
      };

      if (entity_type === 'account') {
        updateData.account_id = entity_id;
      } else if (entity_type === 'lead') {
        updateData.lead_id = entity_id;
      } else if (entity_type === 'policy') {
        updateData.policy_id = entity_id;
      }

      const { error } = await supabase
        .from('workspaces')
        .update(updateData)
        .in('id', workspace_ids);

      if (error) throw error;
      return workspace_ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast({
        title: 'Workspaces linked',
        description: `${count} workspace(s) linked successfully`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error linking workspaces',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Trigger analysis mutation
 */
export const useTriggerAnalysis = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (workspaceId: string) => {
      const { data, error } = await supabase.functions.invoke('analyze-workspace', {
        body: { workspace_id: workspaceId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, workspaceId) => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast({
        title: 'Analysis Started',
        description: 'Your documents are being analyzed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// ============================================================
// REAL-TIME SUBSCRIPTION
// ============================================================

/**
 * Subscribe to workspace changes for real-time updates
 */
export const useWorkspaceSubscription = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const subscribeToWorkspaces = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const channel = supabase
        .channel("workspace-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "workspaces",
            filter: `created_by=eq.${user.id}`,
          },
          () => {
            // Invalidate and refetch workspaces when changes occur
            queryClient.invalidateQueries({ queryKey: ["workspaces"] });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    subscribeToWorkspaces();
  }, [queryClient]);
};
