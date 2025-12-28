import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  location?: string;
}

interface SuggestedTask {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  due_days: number;
  confidence: number;
  evidence: string[];
  suggested_assignee_role?: string;
}

interface DocumentInsight {
  id: string;
  created_at: string;
  agency_workspace_id: string | null;
  account_id: string | null;
  document_id: string | null;
  job_id: string | null;
  analyzer_version: string;
  summary: string | null;
  extracted_entities: ExtractedEntity[];
  suggested_tasks: SuggestedTask[];
  raw_evidence: string[];
  missing_context_questions: string[];
  ai_provider: string | null;
  ai_model: string | null;
  tokens_used: number | null;
}

interface DocumentAnalysisJob {
  id: string;
  created_at: string;
  updated_at: string;
  agency_workspace_id: string | null;
  account_id: string | null;
  document_id: string | null;
  document_storage_path: string | null;
  source: 'upload' | 'canopy' | 'email' | 'api';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  max_attempts: number;
  analyzer_version: string;
  doc_fingerprint: string | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  stats: Record<string, unknown>;
}

interface AIGeneratedTask {
  id: string;
  created_at: string;
  account_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  source: string | null;
  ai_generated: boolean;
  confidence: number | null;
  evidence: string[] | null;
  suggested_assignee_role: string | null;
  document_id: string | null;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Get document insights with filters
 */
export function useDocumentInsights(params?: {
  accountId?: string;
  documentId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['document-insights', params],
    queryFn: async () => {
      let query = supabase
        .from('document_insights')
        .select('*')
        .order('created_at', { ascending: false });

      if (params?.accountId) {
        query = query.eq('account_id', params.accountId);
      }
      if (params?.documentId) {
        query = query.eq('document_id', params.documentId);
      }
      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as DocumentInsight[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Get AI-generated tasks pending approval
 */
export function useAIGeneratedTasks(params?: {
  accountId?: string;
  status?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['ai-generated-tasks', params],
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('ai_generated', true)
        .order('created_at', { ascending: false });

      if (params?.accountId) {
        query = query.eq('account_id', params.accountId);
      }
      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as AIGeneratedTask[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Get document analysis jobs
 */
export function useDocumentAnalysisJobs(params?: {
  status?: string;
  accountId?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['document-analysis-jobs', params],
    queryFn: async () => {
      let query = supabase
        .from('document_analysis_jobs')
        .select('*')
        .order('created_at', { ascending: false });

      if (params?.status) {
        query = query.eq('status', params.status);
      }
      if (params?.accountId) {
        query = query.eq('account_id', params.accountId);
      }
      if (params?.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as DocumentAnalysisJob[];
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Queue a document for analysis
 */
export function useQueueDocumentAnalysis() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      documentId: string;
      documentStoragePath: string;
      accountId?: string;
      agencyWorkspaceId?: string;
      source?: 'upload' | 'canopy' | 'email' | 'api';
    }) => {
      const { data, error } = await supabase
        .from('document_analysis_jobs')
        .insert({
          document_id: params.documentId,
          document_storage_path: params.documentStoragePath,
          account_id: params.accountId,
          agency_workspace_id: params.agencyWorkspaceId,
          source: params.source || 'upload',
          status: 'queued',
          doc_fingerprint: `${params.documentId}_${Date.now()}`,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-analysis-jobs'] });
      toast.success('Document queued for analysis');
    },
    onError: (error) => {
      toast.error(`Failed to queue document: ${error.message}`);
    },
  });
}

/**
 * Approve an AI-generated task
 */
export function useApproveAITask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      assignedTo?: string;
      modifications?: {
        title?: string;
        description?: string;
        priority?: string;
        due_at?: string;
      };
    }) => {
      const updates: Record<string, unknown> = {
        status: 'pending',
        updated_at: new Date().toISOString(),
      };

      if (params.assignedTo) {
        updates.assigned_to = params.assignedTo;
      }

      if (params.modifications) {
        Object.assign(updates, params.modifications);
      }

      const { data, error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', params.taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-generated-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task approved');
    },
    onError: (error) => {
      toast.error(`Failed to approve task: ${error.message}`);
    },
  });
}

/**
 * Dismiss an AI-generated task
 */
export function useDismissAITask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      taskId: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          status: 'cancelled',
          notes: params.reason || 'Dismissed by user',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-generated-tasks'] });
      toast.success('Task dismissed');
    },
    onError: (error) => {
      toast.error(`Failed to dismiss task: ${error.message}`);
    },
  });
}

/**
 * Get document insight statistics
 */
export function useDocumentInsightStats(agencyWorkspaceId?: string) {
  return useQuery({
    queryKey: ['document-insight-stats', agencyWorkspaceId],
    queryFn: async () => {
      // Get job stats
      let jobsQuery = supabase
        .from('document_analysis_jobs')
        .select('status');

      if (agencyWorkspaceId) {
        jobsQuery = jobsQuery.eq('agency_workspace_id', agencyWorkspaceId);
      }

      const { data: jobs, error: jobsError } = await jobsQuery;
      if (jobsError) throw jobsError;

      // Get task stats
      let tasksQuery = supabase
        .from('tasks')
        .select('status, ai_generated')
        .eq('ai_generated', true);

      if (agencyWorkspaceId) {
        tasksQuery = tasksQuery.eq('agency_workspace_id', agencyWorkspaceId);
      }

      const { data: tasks, error: tasksError } = await tasksQuery;
      if (tasksError) throw tasksError;

      const jobsList = jobs || [];
      const tasksList = tasks || [];

      return {
        jobs: {
          total: jobsList.length,
          queued: jobsList.filter(j => j.status === 'queued').length,
          running: jobsList.filter(j => j.status === 'running').length,
          completed: jobsList.filter(j => j.status === 'completed').length,
          failed: jobsList.filter(j => j.status === 'failed').length,
        },
        tasks: {
          total: tasksList.length,
          pending: tasksList.filter(t => t.status === 'pending').length,
          approved: tasksList.filter(t => t.status === 'in_progress' || t.status === 'completed').length,
          dismissed: tasksList.filter(t => t.status === 'cancelled').length,
        },
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}
