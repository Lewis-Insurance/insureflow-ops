import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type {
  TrainingMaterial,
  TrainingMaterialWithProgress,
  TrainingProgress,
  TrainingCategory,
  TrainingUserStats,
  TrainingFilters,
  CreateTrainingMaterialInput,
  UpdateTrainingMaterialInput,
} from '@/types/training';
import { toGammaEmbedUrl } from '@/types/training';

// Query keys
export const trainingKeys = {
  all: ['training'] as const,
  materials: () => [...trainingKeys.all, 'materials'] as const,
  materialsList: (filters: TrainingFilters) => [...trainingKeys.materials(), 'list', filters] as const,
  material: (id: string) => [...trainingKeys.materials(), 'detail', id] as const,
  categories: () => [...trainingKeys.all, 'categories'] as const,
  progress: () => [...trainingKeys.all, 'progress'] as const,
  userProgress: (userId: string) => [...trainingKeys.progress(), userId] as const,
  userStats: (userId: string) => [...trainingKeys.all, 'stats', userId] as const,
};

// Fetch training materials with optional filters
export function useTrainingMaterials(filters: TrainingFilters = {}) {
  return useQuery({
    queryKey: trainingKeys.materialsList(filters),
    queryFn: async () => {
      // Use the view that includes user progress
      let query = supabase
        .from('training_materials_with_progress')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.difficulty) {
        query = query.eq('difficulty', filters.difficulty);
      }
      if (filters.isRequired !== undefined) {
        query = query.eq('is_required', filters.isRequired);
      }
      if (filters.status) {
        query = query.eq('user_status', filters.status);
      }
      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,` +
          `description.ilike.%${filters.search}%`
        );
      }
      if (filters.tags?.length) {
        query = query.overlaps('tags', filters.tags);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as TrainingMaterialWithProgress[];
    },
  });
}

// Fetch single training material
export function useTrainingMaterial(id: string) {
  return useQuery({
    queryKey: trainingKeys.material(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_materials_with_progress')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as TrainingMaterialWithProgress;
    },
    enabled: !!id,
  });
}

// Fetch training categories
export function useTrainingCategories() {
  return useQuery({
    queryKey: trainingKeys.categories(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data || []) as TrainingCategory[];
    },
  });
}

// Fetch unique categories from existing materials (fallback if no categories table)
export function useTrainingCategoriesFromMaterials() {
  return useQuery({
    queryKey: [...trainingKeys.categories(), 'from-materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_materials')
        .select('category')
        .eq('is_active', true);

      if (error) throw error;

      // Extract unique categories
      const categories = [...new Set((data || []).map(m => m.category))];
      return categories.sort();
    },
  });
}

// Fetch user progress for all materials
export function useTrainingProgress(userId?: string) {
  const { user } = useAuth();
  const effectiveUserId = userId || user?.id;

  return useQuery({
    queryKey: trainingKeys.userProgress(effectiveUserId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_progress')
        .select('*')
        .eq('user_id', effectiveUserId);

      if (error) throw error;
      return (data || []) as TrainingProgress[];
    },
    enabled: !!effectiveUserId,
  });
}

// Fetch user training stats
export function useTrainingUserStats(userId?: string) {
  const { user } = useAuth();
  const effectiveUserId = userId || user?.id;

  return useQuery({
    queryKey: trainingKeys.userStats(effectiveUserId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_user_stats')
        .select('*')
        .eq('user_id', effectiveUserId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data as TrainingUserStats | null;
    },
    enabled: !!effectiveUserId,
  });
}

// Create training material
export function useCreateTrainingMaterial() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateTrainingMaterialInput) => {
      // Convert Gamma URL to embed URL
      const embed_url = toGammaEmbedUrl(input.gamma_url);

      const { data, error } = await supabase
        .from('training_materials')
        .insert({
          ...input,
          embed_url,
          thumbnail_url: input.thumbnail_url || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TrainingMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.materials() });
      toast({
        title: 'Training material added',
        description: 'The training material has been added successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to add training material',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update training material
export function useUpdateTrainingMaterial() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTrainingMaterialInput & { id: string }) => {
      // If gamma_url is being updated, regenerate embed_url
      const updateData: Partial<TrainingMaterial> = { ...input };
      if (input.gamma_url) {
        updateData.embed_url = toGammaEmbedUrl(input.gamma_url);
      }

      const { data, error } = await supabase
        .from('training_materials')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as TrainingMaterial;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.materials() });
      queryClient.invalidateQueries({ queryKey: trainingKeys.material(data.id) });
      toast({
        title: 'Training material updated',
        description: 'The training material has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to update training material',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Delete training material (soft delete)
export function useDeleteTrainingMaterial() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('training_materials')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.materials() });
      toast({
        title: 'Training material removed',
        description: 'The training material has been removed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to remove training material',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Start tracking progress (when user opens a material)
export function useStartTrainingProgress() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (materialId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Upsert progress - create if not exists, update last_viewed if exists
      const { data, error } = await supabase
        .from('training_progress')
        .upsert(
          {
            user_id: user.id,
            material_id: materialId,
            last_viewed_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,material_id',
          }
        )
        .select()
        .single();

      if (error) throw error;

      // Also increment the global view count
      await supabase.rpc('increment_training_view_count', { material_uuid: materialId });

      return data as TrainingProgress;
    },
    onSuccess: (_, materialId) => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.progress() });
      queryClient.invalidateQueries({ queryKey: trainingKeys.material(materialId) });
    },
  });
}

// Mark training as complete
export function useCompleteTraining() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (materialId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('training_progress')
        .upsert(
          {
            user_id: user.id,
            material_id: materialId,
            completed_at: new Date().toISOString(),
            last_viewed_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,material_id',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data as TrainingProgress;
    },
    onSuccess: (_, materialId) => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.progress() });
      queryClient.invalidateQueries({ queryKey: trainingKeys.material(materialId) });
      queryClient.invalidateQueries({ queryKey: trainingKeys.materials() });
      toast({
        title: 'Training completed!',
        description: 'Great job completing this training material.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to mark as complete',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Reset training progress (mark as incomplete)
export function useResetTrainingProgress() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (materialId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('training_progress')
        .update({ completed_at: null })
        .eq('user_id', user.id)
        .eq('material_id', materialId);

      if (error) throw error;
    },
    onSuccess: (_, materialId) => {
      queryClient.invalidateQueries({ queryKey: trainingKeys.progress() });
      queryClient.invalidateQueries({ queryKey: trainingKeys.material(materialId) });
      queryClient.invalidateQueries({ queryKey: trainingKeys.materials() });
    },
  });
}
