import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeEntryVersion {
  id: string;
  knowledge_id: string;
  version_number: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: string;
  metadata: any;
  changed_by: string;
  change_notes?: string;
  created_at: string;
}

export interface UpdateKnowledgeParams {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  source?: string;
  metadata?: any;
  changeNotes?: string;
}

// ============================================================================
// Hooks for Knowledge Editing
// ============================================================================

/**
 * Update a knowledge base entry
 */
export function useUpdateKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateKnowledgeParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { id, changeNotes, ...updateData } = params;

      // Start a transaction-like operation
      // 1. Get current version
      const { data: current, error: fetchError } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw new Error(`Failed to fetch entry: ${fetchError.message}`);
      if (!current) throw new Error('Knowledge entry not found');

      // 2. Create version history record (if table exists)
      try {
        // Get current version number
        const { data: versions } = await supabase
          .from('knowledge_base_versions')
          .select('version_number')
          .eq('knowledge_id', id)
          .order('version_number', { ascending: false })
          .limit(1);

        const nextVersion = versions && versions.length > 0
          ? versions[0].version_number + 1
          : 1;

        await supabase.from('knowledge_base_versions').insert({
          knowledge_id: id,
          version_number: nextVersion,
          title: current.title,
          content: current.content,
          category: current.category,
          tags: current.tags,
          source: current.source,
          metadata: current.metadata,
          changed_by: user.id,
          change_notes: changeNotes,
        });
      } catch (versionError) {
        // Version table might not exist yet - log but don't fail
        logger.warn('Could not create version history:', versionError);
      }

      // 3. Update the main record
      const { data, error } = await supabase
        .from('knowledge_base')
        .update({
          ...updateData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update entry: ${error.message}`);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });

      toast.success('Knowledge updated successfully', {
        description: 'The knowledge base entry has been updated.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update knowledge', {
        description: error.message,
      });
    },
  });
}

/**
 * Delete a knowledge base entry (soft delete)
 */
export function useDeleteKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('id', id);

      if (error) throw new Error(`Failed to delete entry: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });

      toast.success('Knowledge deleted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete knowledge', {
        description: error.message,
      });
    },
  });
}

/**
 * Get version history for a knowledge entry
 */
export function useKnowledgeVersions(knowledgeId: string | null) {
  return useQuery({
    queryKey: ['knowledge-versions', knowledgeId],
    queryFn: async () => {
      if (!knowledgeId) return [];

      const { data, error } = await supabase
        .from('knowledge_base_versions')
        .select(`
          *,
          changed_by_user:changed_by(id, email)
        `)
        .eq('knowledge_id', knowledgeId)
        .order('version_number', { ascending: false });

      if (error) {
        // Table might not exist - return empty array
        logger.warn('Version history not available:', error);
        return [];
      }

      return data as KnowledgeEntryVersion[];
    },
    enabled: !!knowledgeId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Restore a previous version
 */
export function useRestoreKnowledgeVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ knowledgeId, versionId }: { knowledgeId: string; versionId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get the version to restore
      const { data: version, error: versionError } = await supabase
        .from('knowledge_base_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (versionError) throw new Error(`Failed to fetch version: ${versionError.message}`);
      if (!version) throw new Error('Version not found');

      // Get current state for version history
      const { data: current } = await supabase
        .from('knowledge_base')
        .select('*')
        .eq('id', knowledgeId)
        .single();

      if (current) {
        // Create version record for current state before restoring
        const { data: versions } = await supabase
          .from('knowledge_base_versions')
          .select('version_number')
          .eq('knowledge_id', knowledgeId)
          .order('version_number', { ascending: false })
          .limit(1);

        const nextVersion = versions && versions.length > 0
          ? versions[0].version_number + 1
          : 1;

        await supabase.from('knowledge_base_versions').insert({
          knowledge_id: knowledgeId,
          version_number: nextVersion,
          title: current.title,
          content: current.content,
          category: current.category,
          tags: current.tags,
          source: current.source,
          metadata: current.metadata,
          changed_by: user.id,
          change_notes: `Restored from version ${version.version_number}`,
        });
      }

      // Restore the version
      const { data, error } = await supabase
        .from('knowledge_base')
        .update({
          title: version.title,
          content: version.content,
          category: version.category,
          tags: version.tags,
          source: version.source,
          metadata: version.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', knowledgeId)
        .select()
        .single();

      if (error) throw new Error(`Failed to restore version: ${error.message}`);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-entries'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-versions'] });

      toast.success('Version restored successfully', {
        description: 'The knowledge entry has been restored to the selected version.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to restore version', {
        description: error.message,
      });
    },
  });
}

/**
 * Compare two versions side-by-side
 */
export function useCompareVersions(knowledgeId: string, version1: number, version2: number) {
  return useQuery({
    queryKey: ['knowledge-compare', knowledgeId, version1, version2],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_base_versions')
        .select('*')
        .eq('knowledge_id', knowledgeId)
        .in('version_number', [version1, version2])
        .order('version_number', { ascending: true });

      if (error) throw new Error(`Failed to fetch versions: ${error.message}`);

      return {
        older: data[0],
        newer: data[1],
      };
    },
    enabled: !!knowledgeId && version1 > 0 && version2 > 0,
  });
}
