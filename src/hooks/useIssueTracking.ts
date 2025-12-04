import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type IssueCategory =
  | 'bug'
  | 'feature_request'
  | 'ui_ux'
  | 'performance'
  | 'security'
  | 'data_issue'
  | 'integration'
  | 'other';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IssuePriority = 'urgent' | 'high' | 'medium' | 'low';
export type IssueStatus =
  | 'new'
  | 'triaged'
  | 'investigating'
  | 'in_progress'
  | 'testing'
  | 'resolved'
  | 'closed'
  | 'wont_fix'
  | 'duplicate';

export interface CreateIssueRequest {
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  priority?: IssuePriority;
  affected_page?: string;
  affected_module?: string;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  error_message?: string;
  console_logs?: string;
  is_blocker?: boolean;
  is_regression?: boolean;
}

export interface UpdateIssueRequest {
  issue_id: string;
  updates: {
    title?: string;
    description?: string;
    category?: IssueCategory;
    severity?: IssueSeverity;
    priority?: IssuePriority;
    status?: IssueStatus;
    assigned_to?: string;
    resolution_notes?: string;
    steps_to_reproduce?: string;
    expected_behavior?: string;
    actual_behavior?: string;
  };
}

/**
 * Hook to create a new issue
 */
export function useCreateIssue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: CreateIssueRequest) => {
      // Capture browser info automatically
      const browserInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        timestamp: new Date().toISOString(),
      };

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('issues')
        .insert({
          ...request,
          reported_by: user.id,
          browser_info: browserInfo,
          affected_page: request.affected_page || window.location.pathname,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Issue Reported',
        description: `Issue #${data.issue_number} has been created. Thank you for your feedback!`,
      });

      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Issue',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to fetch issues with filtering
 */
export function useIssues(filters?: {
  status?: IssueStatus | IssueStatus[];
  category?: IssueCategory;
  severity?: IssueSeverity;
  assigned_to?: string;
  reported_by?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['issues', filters],
    queryFn: async () => {
      let query = supabase
        .from('issues')
        .select(`
          *,
          reported_by_user:auth.users!issues_reported_by_fkey(id, email, raw_user_meta_data),
          assigned_to_user:auth.users!issues_assigned_to_fkey(id, email, raw_user_meta_data),
          attachments:issue_attachments(count),
          comments:issue_comments(count)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      if (filters?.reported_by) {
        query = query.eq('reported_by', filters.reported_by);
      }

      if (filters?.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
}

/**
 * Hook to fetch a single issue with full details
 */
export function useIssue(issueId?: string) {
  return useQuery({
    queryKey: ['issue', issueId],
    queryFn: async () => {
      if (!issueId) return null;

      const { data, error } = await supabase
        .from('issues')
        .select(`
          *,
          reported_by_user:auth.users!issues_reported_by_fkey(id, email, raw_user_meta_data),
          assigned_to_user:auth.users!issues_assigned_to_fkey(id, email, raw_user_meta_data),
          resolved_by_user:auth.users!issues_resolved_by_fkey(id, email, raw_user_meta_data),
          attachments:issue_attachments(*),
          comments:issue_comments(
            *,
            author:auth.users(id, email, raw_user_meta_data)
          ),
          labels:issue_label_assignments(
            label:issue_labels(*)
          ),
          activity:issue_activity_log(
            *,
            user:auth.users(id, email, raw_user_meta_data)
          )
        `)
        .eq('id', issueId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!issueId,
  });
}

/**
 * Hook to update an issue
 */
export function useUpdateIssue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issue_id, updates }: UpdateIssueRequest) => {
      const { data, error } = await supabase
        .from('issues')
        .update(updates)
        .eq('id', issue_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Issue Updated',
        description: `Issue #${data.issue_number} has been updated`,
      });

      queryClient.invalidateQueries({ queryKey: ['issue', data.id] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to add a comment to an issue
 */
export function useAddIssueComment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      issue_id,
      comment_text,
      parent_comment_id,
    }: {
      issue_id: string;
      comment_text: string;
      parent_comment_id?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('issue_comments')
        .insert({
          issue_id,
          author_id: user.id,
          comment_text,
          parent_comment_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Comment Added',
        description: 'Your comment has been posted',
      });

      queryClient.invalidateQueries({ queryKey: ['issue', data.issue_id] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Add Comment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to upvote an issue
 */
export function useVoteIssue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ issue_id, remove }: { issue_id: string; remove?: boolean }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('User not authenticated');

      if (remove) {
        // Remove vote
        const { error } = await supabase
          .from('issue_votes')
          .delete()
          .eq('issue_id', issue_id)
          .eq('user_id', user.id);

        if (error) throw error;
        return { action: 'removed' };
      } else {
        // Add vote
        const { error } = await supabase.from('issue_votes').insert({
          issue_id,
          user_id: user.id,
        });

        if (error) throw error;
        return { action: 'added' };
      }
    },
    onSuccess: (data, variables) => {
      // Silent success - just update UI
      queryClient.invalidateQueries({ queryKey: ['issue', variables.issue_id] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Vote Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to upload issue attachment
 */
export function useUploadIssueAttachment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      issue_id,
      file,
      attachment_type,
      description,
    }: {
      issue_id: string;
      file: File;
      attachment_type: 'screenshot' | 'screen_recording' | 'document' | 'log_file' | 'other';
      description?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('User not authenticated');

      // Upload file to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${issue_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('issue-attachments')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('issue-attachments').getPublicUrl(fileName);

      // Create attachment record
      const { data, error } = await supabase
        .from('issue_attachments')
        .insert({
          issue_id,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: fileName,
          file_size: file.size,
          file_type: file.type,
          mime_type: file.type,
          attachment_type,
          description,
        })
        .select()
        .single();

      if (error) throw error;
      return { ...data, publicUrl };
    },
    onSuccess: (data, variables) => {
      toast({
        title: 'Attachment Uploaded',
        description: 'File has been attached to the issue',
      });

      queryClient.invalidateQueries({ queryKey: ['issue', variables.issue_id] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to get issue statistics
 */
export function useIssueStats() {
  return useQuery({
    queryKey: ['issue-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('issues').select('status, category, severity');

      if (error) throw error;

      const stats = {
        total: data.length,
        byStatus: {} as Record<IssueStatus, number>,
        byCategory: {} as Record<IssueCategory, number>,
        bySeverity: {} as Record<IssueSeverity, number>,
      };

      data.forEach((issue) => {
        // Count by status
        stats.byStatus[issue.status as IssueStatus] =
          (stats.byStatus[issue.status as IssueStatus] || 0) + 1;

        // Count by category
        stats.byCategory[issue.category as IssueCategory] =
          (stats.byCategory[issue.category as IssueCategory] || 0) + 1;

        // Count by severity
        stats.bySeverity[issue.severity as IssueSeverity] =
          (stats.bySeverity[issue.severity as IssueSeverity] || 0) + 1;
      });

      return stats;
    },
  });
}

/**
 * Hook to check if user has voted on an issue
 */
export function useHasVoted(issueId?: string) {
  return useQuery({
    queryKey: ['issue-vote', issueId],
    queryFn: async () => {
      if (!issueId) return false;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return false;

      const { data, error } = await supabase
        .from('issue_votes')
        .select('id')
        .eq('issue_id', issueId)
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
      return !!data;
    },
    enabled: !!issueId,
  });
}

/**
 * Hook to fetch available labels
 */
export function useIssueLabels() {
  return useQuery({
    queryKey: ['issue-labels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('issue_labels')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}
