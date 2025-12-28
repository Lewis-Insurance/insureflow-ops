import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface PipelineStage {
  id: string;
  account_id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  color: string | null;
  icon: string | null;
  stage_type: string;
  is_default: boolean | null;
  is_final: boolean | null;
  auto_create_task: boolean | null;
  task_template_id: string | null;
  auto_send_email: boolean | null;
  email_template_id: string | null;
  auto_send_sms: boolean | null;
  sms_template_id: string | null;
  target_duration_hours: number | null;
  alert_threshold_hours: number | null;
  leads_count: number | null;
  avg_time_in_stage_hours: number | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
}

export const usePipelineStages = () => {
  return useQuery({
    queryKey: ['pipeline_stages'],
    queryFn: async () => {
      // First get the current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user's account_id through account_memberships
      const { data: membership, error: membershipError } = await supabase
        .from('account_memberships')
        .select('account_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (membershipError) {
        logger.warn('No account membership found:', membershipError);
        // Return empty array if no account membership
        return [];
      }

      if (!membership?.account_id) {
        return [];
      }

      // Now fetch pipeline stages for this account only
      const { data, error } = await (supabase)
        .from('pipeline_stages')
        .select('*')
        .eq('account_id', membership.account_id)
        .order('display_order');

      if (error) throw error;
      return data as PipelineStage[];
    },
  });
};

export const usePipelineStage = (stageId: string | undefined) => {
  return useQuery({
    queryKey: ['pipeline_stage', stageId],
    queryFn: async () => {
      if (!stageId) return null;

      const { data, error } = await (supabase)
        .from('pipeline_stages')
        .select('*')
        .eq('id', stageId)
        .maybeSingle();

      if (error) throw error;
      return data as PipelineStage | null;
    },
    enabled: !!stageId,
  });
};
