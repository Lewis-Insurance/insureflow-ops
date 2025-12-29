import { z } from 'zod';

// Difficulty levels
export type TrainingDifficulty = 'beginner' | 'intermediate' | 'advanced';

// Progress status
export type TrainingStatus = 'not_started' | 'in_progress' | 'completed';

// Training Material
export interface TrainingMaterial {
  id: string;
  org_id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  gamma_url: string;
  embed_url: string;
  thumbnail_url?: string;
  duration_minutes?: number;
  difficulty: TrainingDifficulty;
  is_required: boolean;
  view_count: number;
  sort_order: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Training Material with user progress
export interface TrainingMaterialWithProgress extends TrainingMaterial {
  user_started_at?: string;
  user_completed_at?: string;
  user_last_viewed?: string;
  user_view_count?: number;
  user_status: TrainingStatus;
}

// Training Progress
export interface TrainingProgress {
  id: string;
  user_id: string;
  material_id: string;
  started_at: string;
  completed_at?: string;
  last_viewed_at: string;
  view_count: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Training Category
export interface TrainingCategory {
  id: string;
  org_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// User Training Stats
export interface TrainingUserStats {
  user_id: string;
  materials_started: number;
  materials_completed: number;
  total_views: number;
  last_activity?: string;
  required_total: number;
  required_completed: number;
}

// Form schemas
export const createTrainingMaterialSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  category: z.string().min(1, 'Category is required'),
  tags: z.array(z.string()).default([]),
  gamma_url: z.string().url('Must be a valid URL').refine(
    (url) => url.includes('gamma.app'),
    'Must be a Gamma deck URL'
  ),
  thumbnail_url: z.string().url().optional().or(z.literal('')),
  duration_minutes: z.number().int().positive().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  is_required: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export type CreateTrainingMaterialInput = z.infer<typeof createTrainingMaterialSchema>;

export const updateTrainingMaterialSchema = createTrainingMaterialSchema.partial();

export type UpdateTrainingMaterialInput = z.infer<typeof updateTrainingMaterialSchema>;

// Filter options
export interface TrainingFilters {
  search?: string;
  category?: string;
  difficulty?: TrainingDifficulty;
  status?: TrainingStatus;
  isRequired?: boolean;
  tags?: string[];
}

// Helper function to convert Gamma URL to embed URL
export function toGammaEmbedUrl(url: string): string {
  // Handle various Gamma URL formats
  // https://gamma.app/docs/title-xyz123 → https://gamma.app/embed/title-xyz123
  // https://gamma.app/public/title-xyz123 → https://gamma.app/embed/title-xyz123
  return url
    .replace('/docs/', '/embed/')
    .replace('/public/', '/embed/');
}

// Helper to extract deck ID from Gamma URL
export function extractGammaDeckId(url: string): string | null {
  const match = url.match(/gamma\.app\/(?:docs|public|embed)\/([^/?]+)/);
  return match ? match[1] : null;
}

// Difficulty badge colors
export const difficultyColors: Record<TrainingDifficulty, string> = {
  beginner: 'bg-green-100 text-green-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-red-100 text-red-800',
};

// Status badge colors
export const statusColors: Record<TrainingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
};

// Category colors (for default categories)
export const categoryColors: Record<string, string> = {
  Onboarding: 'bg-blue-500',
  'Product Knowledge': 'bg-green-500',
  'Sales Techniques': 'bg-purple-500',
  'Carrier Training': 'bg-orange-500',
  Compliance: 'bg-red-500',
  Technology: 'bg-cyan-500',
};
