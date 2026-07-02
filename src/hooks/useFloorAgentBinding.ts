import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isFloorCockpitEnabled } from '@/floor/launchControl';
import { logger } from '@/lib/logger';

export interface FloorAgentBinding {
  agent_id: string;
  human_name: string;
  role: string;
  slack_display_name: string | null;
  status: string;
  autonomy_level: string;
  second_opinion: boolean;
}

export function useFloorAgentBinding() {
  const { user } = useAuth();
  const cockpitEnabled = isFloorCockpitEnabled();

  return useQuery<FloorAgentBinding | null>({
    queryKey: ['floor-agent-binding', user?.id],
    queryFn: async () => {
      if (!user?.email) return null;

      const { data, error } = await supabase.from('floor_agent_bindings_v').select('*').maybeSingle();

      if (error) {
        if (error.code === '42P01' || error.message.includes('floor_agent_bindings_v')) {
          logger.warn('Floor agent binding view unavailable', { error: error.message });
          return null;
        }
        logger.error('Failed to fetch Floor agent binding', { error: error.message });
        throw error;
      }

      return (data as FloorAgentBinding | null) ?? null;
    },
    enabled: !!user?.id && cockpitEnabled,
    staleTime: 10 * 60 * 1000,
  });
}
