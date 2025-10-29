import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  task_type: string;
  status: "idle" | "processing" | "completed" | "failed";
  created_by: string;
  client_name: string | null;
  notes: string | null;
  analysis_output: any;
  created_at: string;
  updated_at: string;
  creator_name?: string;
}

export interface WorkspaceDocument {
  id: string;
  workspace_id: string;
  file_name: string | null;
  file_url: string | null;
  role: string | null;
  parseur_document_id: string | null;
  created_at: string;
}

// Fetch all workspaces for current user
export const useWorkspaces = () => {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Workspace[];
    },
  });
};

// Fetch workspaces by status
export const useWorkspacesByStatus = (status: Workspace["status"]) => {
  return useQuery({
    queryKey: ["workspaces", status],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("created_by", user.id)
        .eq("status", status)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Workspace[];
    },
  });
};

// Fetch active workspaces (idle + processing)
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
      
      // Fetch profiles for all unique creator IDs
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(ws => ws.created_by))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));
        
        return data.map(ws => ({
          ...ws,
          creator_name: profileMap.get(ws.created_by) || "Unknown User"
        })) as Workspace[];
      }
      
      return data as Workspace[];
    },
  });
};

// Fetch completed workspaces
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
      
      // Fetch profiles for all unique creator IDs
      if (data && data.length > 0) {
        const creatorIds = [...new Set(data.map(ws => ws.created_by))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", creatorIds);
        
        const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));
        
        return data.map(ws => ({
          ...ws,
          creator_name: profileMap.get(ws.created_by) || "Unknown User"
        })) as Workspace[];
      }
      
      return data as Workspace[];
    },
  });
};

// Fetch single workspace with documents
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

// Fetch documents for a workspace
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

// Create workspace mutation
export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: {
      title?: string;
      task_type: string;
      client_name?: string;
      notes?: string;
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

// Update workspace status mutation
export const useUpdateWorkspaceStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      status,
    }: {
      workspaceId: string;
      status: Workspace["status"];
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

// Delete workspace mutation
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

// Trigger analysis mutation
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

// Real-time subscription hook
export const useWorkspaceSubscription = () => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["workspace-subscription"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

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
    },
    staleTime: Infinity,
  });
};
