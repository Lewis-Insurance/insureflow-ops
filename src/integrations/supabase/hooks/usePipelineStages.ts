import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

export const usePipelineStages = (accountId?: string) => {
  return useQuery({
    queryKey: ['pipeline_stages', accountId],
    queryFn: async () => {
      let query = (supabase as any)
        .from('pipeline_stages')
        .select('*')
        .order('display_order');

      if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

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

      const { data, error } = await (supabase as any)
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
