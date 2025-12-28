import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveAgency } from '@/hooks/useAgencyWorkspace';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

export interface GoalType {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  metric_type: 'currency' | 'count' | 'percentage' | 'ratio' | 'score';
  aggregation: 'sum' | 'count' | 'average' | 'max' | 'min';
  source_table: string;
  source_field: string;
  icon: string;
  is_system: boolean;
  agency_workspace_id?: string;
}

export interface Goal {
  id: string;
  agency_workspace_id: string;
  goal_type_id: string;
  goal_type?: GoalType;
  title: string;
  description?: string;
  scope: 'agency' | 'team' | 'producer' | 'personal';
  assigned_to?: string;
  team_id?: string;
  target_value: number;
  current_value: number;
  start_date: string;
  end_date: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  status: 'draft' | 'active' | 'paused' | 'completed' | 'failed';
  progress_percentage: number;
  is_stretch: boolean;
  parent_goal_id?: string;
  created_at: string;
  updated_at: string;
}

export interface GoalMilestone {
  id: string;
  goal_id: string;
  title: string;
  target_value: number;
  reward_type?: 'badge' | 'points' | 'bonus' | 'recognition';
  reward_value?: string;
  completed_at?: string;
  sort_order: number;
}

export interface GoalProgress {
  id: string;
  goal_id: string;
  recorded_at: string;
  value: number;
  delta: number;
  source: 'auto' | 'manual' | 'import';
  notes?: string;
  recorded_by?: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  criteria_type: string;
  criteria_value: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  points: number;
  is_system: boolean;
  is_active: boolean;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  achievement?: Achievement;
  earned_at: string;
  goal_id?: string;
  agency_workspace_id?: string;
}

export interface Leaderboard {
  id: string;
  agency_workspace_id: string;
  name: string;
  description?: string;
  metric_type: string;
  period_type: string;
  is_public: boolean;
  entries?: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  id: string;
  leaderboard_id: string;
  user_id: string;
  period_start: string;
  rank: number;
  value: number;
  previous_rank?: number;
}

export interface GoalDashboard {
  goals: Goal[];
  achievements: UserAchievement[];
  leaderboards: Leaderboard[];
  summary: {
    total_goals: number;
    active_goals: number;
    completed_goals: number;
    on_track: number;
    at_risk: number;
    behind: number;
    total_achievements: number;
  };
}

// ============================================================================
// HELPER: Call edge function
// ============================================================================

async function callGoalManager<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await supabase.functions.invoke('goal-manager', {
    body: { action, ...params },
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (response.error) {
    throw new Error(response.error.message || 'Goal operation failed');
  }

  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Goal operation failed');
  }

  return response.data.data as T;
}

// ============================================================================
// HOOKS: Goal Types
// ============================================================================

export function useGoalTypes() {
  return useQuery({
    queryKey: ['goal-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_types')
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as GoalType[];
    },
    staleTime: 5 * 60 * 1000 // 5 minutes
  });
}

// ============================================================================
// HOOKS: Goals CRUD
// ============================================================================

export function useGoals(filters?: {
  scope?: Goal['scope'];
  status?: Goal['status'];
  assigned_to?: string;
  period_type?: Goal['period_type'];
}) {
  const { activeAgency } = useActiveAgency();
  const agencyId = activeAgency?.agency_workspace_id;

  return useQuery({
    queryKey: ['goals', agencyId, filters],
    queryFn: () => callGoalManager<Goal[]>('get_goals', {
      agency_workspace_id: agencyId,
      ...filters
    }),
    enabled: !!agencyId,
    staleTime: 30 * 1000 // 30 seconds
  });
}

export function useGoal(goalId: string | undefined) {
  return useQuery({
    queryKey: ['goal', goalId],
    queryFn: async () => {
      if (!goalId) return null;
      const { data, error } = await supabase
        .from('goals')
        .select(`
          *,
          goal_type:goal_types(*),
          milestones:goal_milestones(*),
          progress:goal_progress(*)
        `)
        .eq('id', goalId)
        .single();

      if (error) throw error;
      return data as Goal & { milestones: GoalMilestone[]; progress: GoalProgress[] };
    },
    enabled: !!goalId
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  const { activeAgency } = useActiveAgency();
  const agencyId = activeAgency?.agency_workspace_id;

  return useMutation({
    mutationFn: (goal: Partial<Goal>) => callGoalManager<Goal>('create_goal', {
      agency_workspace_id: agencyId,
      ...goal
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Goal created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create goal: ${error.message}`);
    }
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ goalId, updates }: { goalId: string; updates: Partial<Goal> }) =>
      callGoalManager<Goal>('update_goal', { goal_id: goalId, ...updates }),
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId] });
      toast.success('Goal updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update goal: ${error.message}`);
    }
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => callGoalManager<void>('delete_goal', { goal_id: goalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Goal deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete goal: ${error.message}`);
    }
  });
}

// ============================================================================
// HOOKS: Goal Progress
// ============================================================================

export function useUpdateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ goalId, value, notes }: { goalId: string; value: number; notes?: string }) =>
      callGoalManager<GoalProgress>('update_progress', {
        goal_id: goalId,
        value,
        notes,
        source: 'manual'
      }),
    onSuccess: (_, { goalId }) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId] });
      toast.success('Progress updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update progress: ${error.message}`);
    }
  });
}

export function useCalculateProgress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => callGoalManager<Goal>('calculate_progress', { goal_id: goalId }),
    onSuccess: (_, goalId) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId] });
    }
  });
}

// ============================================================================
// HOOKS: Milestones
// ============================================================================

export function useAddMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (milestone: Partial<GoalMilestone> & { goal_id: string }) =>
      callGoalManager<GoalMilestone>('add_milestone', milestone),
    onSuccess: (_, { goal_id }) => {
      queryClient.invalidateQueries({ queryKey: ['goal', goal_id] });
      toast.success('Milestone added');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add milestone: ${error.message}`);
    }
  });
}

export function useCheckMilestones() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (goalId: string) => callGoalManager<GoalMilestone[]>('check_milestones', { goal_id: goalId }),
    onSuccess: (_, goalId) => {
      queryClient.invalidateQueries({ queryKey: ['goal', goalId] });
    }
  });
}

// ============================================================================
// HOOKS: Achievements
// ============================================================================

export function useAchievements() {
  return useQuery({
    queryKey: ['achievements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('is_active', true)
        .order('rarity', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Achievement[];
    },
    staleTime: 10 * 60 * 1000 // 10 minutes
  });
}

export function useUserAchievements(userId?: string) {
  return useQuery({
    queryKey: ['user-achievements', userId],
    queryFn: () => callGoalManager<UserAchievement[]>('get_achievements', { user_id: userId }),
    enabled: !!userId,
    staleTime: 60 * 1000 // 1 minute
  });
}

export function useCheckAchievements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId?: string) => callGoalManager<UserAchievement[]>('check_achievements', { user_id: userId }),
    onSuccess: (newAchievements) => {
      queryClient.invalidateQueries({ queryKey: ['user-achievements'] });
      if (newAchievements.length > 0) {
        toast.success(`You earned ${newAchievements.length} new achievement(s)!`);
      }
    }
  });
}

// ============================================================================
// HOOKS: Leaderboards
// ============================================================================

export function useLeaderboards() {
  const { activeAgency } = useActiveAgency();
  const agencyId = activeAgency?.agency_workspace_id;

  return useQuery({
    queryKey: ['leaderboards', agencyId],
    queryFn: () => callGoalManager<Leaderboard[]>('get_leaderboards', {
      agency_workspace_id: agencyId
    }),
    enabled: !!agencyId,
    staleTime: 60 * 1000 // 1 minute
  });
}

export function useCreateLeaderboard() {
  const queryClient = useQueryClient();
  const { activeAgency } = useActiveAgency();
  const agencyId = activeAgency?.agency_workspace_id;

  return useMutation({
    mutationFn: (leaderboard: Partial<Leaderboard>) =>
      callGoalManager<Leaderboard>('create_leaderboard', {
        agency_workspace_id: agencyId,
        ...leaderboard
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboards'] });
      toast.success('Leaderboard created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create leaderboard: ${error.message}`);
    }
  });
}

// ============================================================================
// HOOKS: Dashboard
// ============================================================================

export function useGoalDashboard() {
  const { activeAgency } = useActiveAgency();
  const agencyId = activeAgency?.agency_workspace_id;

  return useQuery({
    queryKey: ['goal-dashboard', agencyId],
    queryFn: () => callGoalManager<GoalDashboard>('get_dashboard', {
      agency_workspace_id: agencyId
    }),
    enabled: !!agencyId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000 // Auto-refresh every minute
  });
}

// ============================================================================
// HOOKS: Producer Summary View
// ============================================================================

export function useProducerGoalSummary(userId?: string) {
  return useQuery({
    queryKey: ['producer-goal-summary', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_producer_goal_summary')
        .select('*')
        .eq('user_id', userId || '')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignore not found
      return data;
    },
    enabled: !!userId
  });
}

// ============================================================================
// HOOKS: Agency Summary View
// ============================================================================

export function useAgencyGoalSummary() {
  const { activeAgency } = useActiveAgency();
  const agencyId = activeAgency?.agency_workspace_id;

  return useQuery({
    queryKey: ['agency-goal-summary', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_agency_goal_summary')
        .select('*')
        .eq('agency_workspace_id', agencyId || '')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!agencyId
  });
}
