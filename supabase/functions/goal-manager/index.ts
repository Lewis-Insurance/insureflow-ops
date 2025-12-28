/**
 * Goal Manager Edge Function
 *
 * Handles goal management operations including:
 * - Goal CRUD operations
 * - Progress calculation and tracking
 * - Achievement checking and awarding
 * - Leaderboard management
 *
 * SECURITY:
 * - All actions require JWT auth + agency membership
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';
import { requireAgencyAuth, verifyAgencyMembership, AgencyAuthenticatedUser } from '../_shared/agency-auth.ts';

const logger = createLogger('goal-manager');

// All actions require authentication
const AUTH_REQUIRED = true;

interface GoalCreateRequest {
  name: string;
  description?: string;
  goal_type_id?: string;
  scope: 'agency' | 'team' | 'producer' | 'personal';
  assigned_to?: string;
  target_value: number;
  target_type: 'at_least' | 'at_most' | 'exactly' | 'range';
  target_min?: number;
  target_max?: number;
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  start_date: string;
  end_date: string;
  milestones?: Array<{
    name: string;
    target_value: number;
    reward_points?: number;
  }>;
}

interface LeaderboardCreateRequest {
  name: string;
  description?: string;
  metric_type: string;
  goal_type_id?: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'all_time';
  start_date?: string;
  end_date?: string;
  participant_type: 'producer' | 'team' | 'all';
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // Parse request body
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      body = await req.json();
    }

    // Require authentication for all actions
    const authResult = await requireAgencyAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) {
      return authResult;
    }
    const user = authResult;

    logger.info('Goal manager action', { action, userId: user.id });

    let result;

    switch (action) {
      // Goal CRUD
      case 'create_goal':
        result = await createGoal(supabase, body as GoalCreateRequest, user);
        break;

      case 'update_goal':
        result = await updateGoal(supabase, body, user);
        break;

      case 'delete_goal':
        result = await deleteGoal(supabase, body.goal_id as string, user);
        break;

      case 'get_goals':
        result = await getGoals(supabase, body, user);
        break;

      case 'get_goal':
        result = await getGoal(supabase, body.goal_id as string, user);
        break;

      // Progress
      case 'update_progress':
        result = await updateProgress(supabase, body.goal_id as string, body.value as number, user);
        break;

      case 'calculate_progress':
        result = await calculateProgress(supabase, body.goal_id as string, user);
        break;

      case 'get_progress_history':
        result = await getProgressHistory(supabase, body.goal_id as string, user);
        break;

      // Milestones
      case 'add_milestone':
        result = await addMilestone(supabase, body, user);
        break;

      case 'check_milestones':
        result = await checkMilestones(supabase, body.goal_id as string, user);
        break;

      // Achievements
      case 'get_achievements':
        result = await getAchievements(supabase, user);
        break;

      case 'check_achievements':
        result = await checkAchievements(supabase, user);
        break;

      case 'get_user_achievements':
        result = await getUserAchievements(supabase, body.user_id as string, user);
        break;

      // Leaderboards
      case 'create_leaderboard':
        result = await createLeaderboard(supabase, body as LeaderboardCreateRequest, user);
        break;

      case 'get_leaderboards':
        result = await getLeaderboards(supabase, user);
        break;

      case 'get_leaderboard':
        result = await getLeaderboard(supabase, body.leaderboard_id as string, user);
        break;

      case 'refresh_leaderboard':
        result = await refreshLeaderboard(supabase, body.leaderboard_id as string, user);
        break;

      // Goal Types
      case 'get_goal_types':
        result = await getGoalTypes(supabase, user);
        break;

      // Templates
      case 'get_templates':
        result = await getTemplates(supabase, user);
        break;

      case 'create_from_template':
        result = await createFromTemplate(supabase, body, user);
        break;

      // Dashboard
      case 'get_dashboard':
        result = await getDashboard(supabase, user);
        break;

      default:
        throw new ValidationError(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Goal manager error', { error: error.message });
    return createErrorResponse(error, corsHeaders);
  }
});

// ============================================================================
// Goal CRUD Operations
// ============================================================================

async function createGoal(
  supabase: SupabaseClient,
  request: GoalCreateRequest,
  user: AgencyAuthenticatedUser
) {
  const agencyId = user.defaultAgencyId;
  if (!agencyId) {
    throw new ValidationError('No agency workspace selected');
  }

  // Validate dates
  const startDate = new Date(request.start_date);
  const endDate = new Date(request.end_date);
  if (endDate <= startDate) {
    throw new ValidationError('End date must be after start date');
  }

  // Create goal
  const { data: goal, error } = await supabase
    .from('goals')
    .insert({
      agency_workspace_id: agencyId,
      name: request.name,
      description: request.description,
      goal_type_id: request.goal_type_id,
      scope: request.scope,
      assigned_to: request.scope === 'personal' ? user.id : request.assigned_to,
      target_value: request.target_value,
      target_type: request.target_type,
      target_min: request.target_min,
      target_max: request.target_max,
      period_type: request.period_type,
      start_date: request.start_date,
      end_date: request.end_date,
      status: 'active',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    logger.error('Failed to create goal', { error: error.message });
    throw error;
  }

  // Create milestones if provided
  if (request.milestones && request.milestones.length > 0) {
    const milestones = request.milestones.map((m, index) => ({
      goal_id: goal.id,
      name: m.name,
      target_value: m.target_value,
      percentage_of_goal: (m.target_value / request.target_value) * 100,
      reward_points: m.reward_points || 0,
      sort_order: index,
    }));

    await supabase.from('goal_milestones').insert(milestones);
  }

  logger.info('Goal created', { goalId: goal.id, userId: user.id });

  return { goal };
}

async function updateGoal(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const goalId = body.goal_id as string;
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }

  // Get existing goal
  const { data: existing, error: fetchError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (fetchError || !existing) {
    throw new ValidationError('Goal not found');
  }

  // Verify access
  if (!verifyAgencyMembership(user, existing.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  // Only admins can update agency/team goals
  if (
    existing.scope !== 'personal' &&
    existing.assigned_to !== user.id &&
    !user.isStaff
  ) {
    // Check if user is admin
    const { data: membership } = await supabase
      .from('agency_workspace_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('agency_workspace_id', existing.agency_workspace_id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ValidationError('Only admins can update this goal');
    }
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.target_value !== undefined) updates.target_value = body.target_value;
  if (body.status !== undefined) updates.status = body.status;

  const { data: goal, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;

  return { goal };
}

async function deleteGoal(
  supabase: SupabaseClient,
  goalId: string,
  user: AgencyAuthenticatedUser
) {
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }

  // Get existing goal
  const { data: existing } = await supabase
    .from('goals')
    .select('agency_workspace_id, assigned_to, scope')
    .eq('id', goalId)
    .single();

  if (!existing) {
    throw new ValidationError('Goal not found');
  }

  // Verify access
  if (!verifyAgencyMembership(user, existing.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  // Soft delete by setting status to cancelled
  const { error } = await supabase
    .from('goals')
    .update({ status: 'cancelled' })
    .eq('id', goalId);

  if (error) throw error;

  return { deleted: true };
}

async function getGoals(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const agencyId = (body.agency_workspace_id as string) || user.defaultAgencyId;
  if (!agencyId) {
    throw new ValidationError('agency_workspace_id is required');
  }

  if (!verifyAgencyMembership(user, agencyId)) {
    throw new ValidationError('Access denied');
  }

  let query = supabase
    .from('goals')
    .select(`
      *,
      goal_type:goal_types(*),
      assigned_user:profiles!goals_assigned_to_fkey(id, full_name, email),
      milestones:goal_milestones(*)
    `)
    .eq('agency_workspace_id', agencyId)
    .neq('status', 'cancelled');

  // Apply filters
  if (body.scope) {
    query = query.eq('scope', body.scope);
  }
  if (body.status) {
    query = query.eq('status', body.status);
  }
  if (body.assigned_to) {
    query = query.eq('assigned_to', body.assigned_to);
  }

  query = query.order('created_at', { ascending: false });

  const { data: goals, error } = await query;

  if (error) throw error;

  return { goals };
}

async function getGoal(
  supabase: SupabaseClient,
  goalId: string,
  user: AgencyAuthenticatedUser
) {
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }

  const { data: goal, error } = await supabase
    .from('goals')
    .select(`
      *,
      goal_type:goal_types(*),
      assigned_user:profiles!goals_assigned_to_fkey(id, full_name, email),
      milestones:goal_milestones(*),
      progress:goal_progress(*)
    `)
    .eq('id', goalId)
    .single();

  if (error) throw error;

  if (!verifyAgencyMembership(user, goal.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  return { goal };
}

// ============================================================================
// Progress Operations
// ============================================================================

async function updateProgress(
  supabase: SupabaseClient,
  goalId: string,
  value: number,
  user: AgencyAuthenticatedUser
) {
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }
  if (value === undefined) {
    throw new ValidationError('value is required');
  }

  // Get goal
  const { data: goal } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (!goal) {
    throw new ValidationError('Goal not found');
  }

  if (!verifyAgencyMembership(user, goal.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  // Calculate progress percentage
  const progressPct = goal.target_value > 0 ? (value / goal.target_value) * 100 : 0;

  // Update goal
  const updates: Record<string, unknown> = {
    current_value: value,
    progress_percentage: Math.round(progressPct * 100) / 100,
    last_calculated_at: new Date().toISOString(),
  };

  // Check if goal is achieved
  if (progressPct >= 100 && goal.status === 'active') {
    updates.status = 'achieved';
    updates.achieved_at = new Date().toISOString();
  }

  const { data: updatedGoal, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', goalId)
    .select()
    .single();

  if (error) throw error;

  // Create progress snapshot
  await supabase.from('goal_progress').insert({
    goal_id: goalId,
    current_value: value,
    progress_percentage: progressPct,
    value_change: value - (goal.current_value || 0),
    snapshot_type: 'manual',
    recorded_by: user.id,
  });

  // Check milestones
  await checkMilestones(supabase, goalId, user);

  // Check achievements if goal achieved
  if (updates.status === 'achieved') {
    await checkAchievements(supabase, user);
  }

  return { goal: updatedGoal };
}

async function calculateProgress(
  supabase: SupabaseClient,
  goalId: string,
  user: AgencyAuthenticatedUser
) {
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }

  const { data: result, error } = await supabase.rpc('calculate_goal_progress', {
    p_goal_id: goalId,
  });

  if (error) throw error;

  return result;
}

async function getProgressHistory(
  supabase: SupabaseClient,
  goalId: string,
  user: AgencyAuthenticatedUser
) {
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }

  // Verify access via goal
  const { data: goal } = await supabase
    .from('goals')
    .select('agency_workspace_id')
    .eq('id', goalId)
    .single();

  if (!goal || !verifyAgencyMembership(user, goal.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  const { data: progress, error } = await supabase
    .from('goal_progress')
    .select('*')
    .eq('goal_id', goalId)
    .order('recorded_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return { progress };
}

// ============================================================================
// Milestone Operations
// ============================================================================

async function addMilestone(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const goalId = body.goal_id as string;
  if (!goalId) {
    throw new ValidationError('goal_id is required');
  }

  // Get goal for validation
  const { data: goal } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (!goal) {
    throw new ValidationError('Goal not found');
  }

  if (!verifyAgencyMembership(user, goal.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  const { data: milestone, error } = await supabase
    .from('goal_milestones')
    .insert({
      goal_id: goalId,
      name: body.name,
      target_value: body.target_value,
      percentage_of_goal: ((body.target_value as number) / goal.target_value) * 100,
      reward_points: body.reward_points || 0,
    })
    .select()
    .single();

  if (error) throw error;

  return { milestone };
}

async function checkMilestones(
  supabase: SupabaseClient,
  goalId: string,
  user: AgencyAuthenticatedUser
) {
  // Get goal and milestones
  const { data: goal } = await supabase
    .from('goals')
    .select(`
      *,
      milestones:goal_milestones(*)
    `)
    .eq('id', goalId)
    .single();

  if (!goal) {
    return { achieved: [] };
  }

  const achieved: string[] = [];

  for (const milestone of goal.milestones || []) {
    if (!milestone.is_achieved && goal.current_value >= milestone.target_value) {
      // Mark milestone as achieved
      await supabase
        .from('goal_milestones')
        .update({
          is_achieved: true,
          achieved_at: new Date().toISOString(),
        })
        .eq('id', milestone.id);

      achieved.push(milestone.id);

      // Create progress snapshot
      await supabase.from('goal_progress').insert({
        goal_id: goalId,
        current_value: goal.current_value,
        progress_percentage: goal.progress_percentage,
        snapshot_type: 'milestone',
        recorded_by: user.id,
        notes: `Milestone achieved: ${milestone.name}`,
      });
    }
  }

  return { achieved };
}

// ============================================================================
// Achievement Operations
// ============================================================================

async function getAchievements(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const { data: achievements, error } = await supabase
    .from('achievements')
    .select('*')
    .eq('is_active', true)
    .order('points', { ascending: false });

  if (error) throw error;

  return { achievements };
}

async function checkAchievements(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const agencyId = user.defaultAgencyId;
  if (!agencyId) {
    return { new_achievements: [] };
  }

  const { data: result, error } = await supabase.rpc('check_user_achievements', {
    p_user_id: user.id,
    p_agency_workspace_id: agencyId,
  });

  if (error) {
    logger.error('Failed to check achievements', { error: error.message });
    return { new_achievements: [] };
  }

  return { new_achievements: result || [] };
}

async function getUserAchievements(
  supabase: SupabaseClient,
  targetUserId: string,
  user: AgencyAuthenticatedUser
) {
  const userId = targetUserId || user.id;
  const agencyId = user.defaultAgencyId;

  let query = supabase
    .from('user_achievements')
    .select(`
      *,
      achievement:achievements(*)
    `)
    .eq('user_id', userId);

  if (agencyId) {
    query = query.eq('agency_workspace_id', agencyId);
  }

  const { data: achievements, error } = await query.order('earned_at', { ascending: false });

  if (error) throw error;

  return { achievements };
}

// ============================================================================
// Leaderboard Operations
// ============================================================================

async function createLeaderboard(
  supabase: SupabaseClient,
  request: LeaderboardCreateRequest,
  user: AgencyAuthenticatedUser
) {
  const agencyId = user.defaultAgencyId;
  if (!agencyId) {
    throw new ValidationError('No agency workspace selected');
  }

  const { data: leaderboard, error } = await supabase
    .from('leaderboards')
    .insert({
      agency_workspace_id: agencyId,
      name: request.name,
      description: request.description,
      metric_type: request.metric_type,
      goal_type_id: request.goal_type_id,
      period_type: request.period_type,
      start_date: request.start_date,
      end_date: request.end_date,
      participant_type: request.participant_type,
      status: 'active',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;

  return { leaderboard };
}

async function getLeaderboards(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const agencyId = user.defaultAgencyId;
  if (!agencyId) {
    return { leaderboards: [] };
  }

  const { data: leaderboards, error } = await supabase
    .from('leaderboards')
    .select(`
      *,
      goal_type:goal_types(*)
    `)
    .eq('agency_workspace_id', agencyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return { leaderboards };
}

async function getLeaderboard(
  supabase: SupabaseClient,
  leaderboardId: string,
  user: AgencyAuthenticatedUser
) {
  if (!leaderboardId) {
    throw new ValidationError('leaderboard_id is required');
  }

  const { data: leaderboard, error } = await supabase
    .from('leaderboards')
    .select(`
      *,
      goal_type:goal_types(*),
      entries:leaderboard_entries(
        *,
        user:profiles(id, full_name, email)
      )
    `)
    .eq('id', leaderboardId)
    .single();

  if (error) throw error;

  if (!verifyAgencyMembership(user, leaderboard.agency_workspace_id)) {
    throw new ValidationError('Access denied');
  }

  // Sort entries by rank
  if (leaderboard.entries) {
    leaderboard.entries.sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
  }

  return { leaderboard };
}

async function refreshLeaderboard(
  supabase: SupabaseClient,
  leaderboardId: string,
  user: AgencyAuthenticatedUser
) {
  if (!leaderboardId) {
    throw new ValidationError('leaderboard_id is required');
  }

  const { error } = await supabase.rpc('refresh_leaderboard', {
    p_leaderboard_id: leaderboardId,
  });

  if (error) throw error;

  return { refreshed: true };
}

// ============================================================================
// Goal Types & Templates
// ============================================================================

async function getGoalTypes(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const { data: types, error } = await supabase
    .from('goal_types')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;

  return { types };
}

async function getTemplates(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const agencyId = user.defaultAgencyId;

  const { data: templates, error } = await supabase
    .from('goal_templates')
    .select(`
      *,
      goal_type:goal_types(*)
    `)
    .or(`is_system.eq.true,agency_workspace_id.eq.${agencyId}`)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;

  return { templates };
}

async function createFromTemplate(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  user: AgencyAuthenticatedUser
) {
  const templateId = body.template_id as string;
  if (!templateId) {
    throw new ValidationError('template_id is required');
  }

  // Get template
  const { data: template } = await supabase
    .from('goal_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (!template) {
    throw new ValidationError('Template not found');
  }

  // Calculate dates based on period
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  switch (template.default_period) {
    case 'monthly':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'quarterly':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
      break;
    case 'yearly':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
      break;
    default:
      startDate = now;
      endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  // Create goal from template
  const goalRequest: GoalCreateRequest = {
    name: (body.name as string) || template.name,
    description: (body.description as string) || template.description,
    goal_type_id: template.goal_type_id,
    scope: (body.scope as GoalCreateRequest['scope']) || template.default_scope || 'personal',
    assigned_to: body.assigned_to as string,
    target_value: (body.target_value as number) || template.default_target,
    target_type: 'at_least',
    period_type: (body.period_type as GoalCreateRequest['period_type']) || template.default_period || 'monthly',
    start_date: startDate.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
    milestones: template.milestones,
  };

  return await createGoal(supabase, goalRequest, user);
}

// ============================================================================
// Dashboard
// ============================================================================

async function getDashboard(supabase: SupabaseClient, user: AgencyAuthenticatedUser) {
  const agencyId = user.defaultAgencyId;
  if (!agencyId) {
    return {
      personal_goals: [],
      team_goals: [],
      achievements: [],
      leaderboard_positions: [],
    };
  }

  // Get personal goals
  const { data: personalGoals } = await supabase
    .from('goals')
    .select(`
      *,
      goal_type:goal_types(name, icon, color)
    `)
    .eq('assigned_to', user.id)
    .eq('status', 'active')
    .order('end_date', { ascending: true })
    .limit(5);

  // Get agency goals
  const { data: agencyGoals } = await supabase
    .from('goals')
    .select(`
      *,
      goal_type:goal_types(name, icon, color)
    `)
    .eq('agency_workspace_id', agencyId)
    .eq('scope', 'agency')
    .eq('status', 'active')
    .order('end_date', { ascending: true })
    .limit(5);

  // Get recent achievements
  const { data: achievements } = await supabase
    .from('user_achievements')
    .select(`
      *,
      achievement:achievements(name, icon, points, rarity)
    `)
    .eq('user_id', user.id)
    .eq('agency_workspace_id', agencyId)
    .order('earned_at', { ascending: false })
    .limit(5);

  // Get producer summary
  const { data: summary } = await supabase
    .from('v_producer_goal_summary')
    .select('*')
    .eq('user_id', user.id)
    .eq('agency_workspace_id', agencyId)
    .single();

  return {
    personal_goals: personalGoals || [],
    agency_goals: agencyGoals || [],
    achievements: achievements || [],
    summary: summary || {
      active_goals: 0,
      achieved_goals: 0,
      avg_progress: 0,
      total_points: 0,
    },
  };
}
