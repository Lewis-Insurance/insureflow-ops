import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { workRequestRefFromId } from '@/floor/floorCockpitContext';
import type { RiskLevel } from '@/floor/spine/types';

export interface FloorPendingPackage {
  packageId: string;
  workRequestId: string;
  headline: string;
  risk: RiskLevel;
  playId: string;
  packageRef: string;
  workRequestRef: string;
}

function packageRefFromId(packageId: string): string {
  return `package:${packageId.replace(/-/g, '')}`;
}

export function useFloorPendingPackages(agencyWorkspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['floor-pending-packages', agencyWorkspaceId],
    enabled: Boolean(agencyWorkspaceId),
    queryFn: async (): Promise<FloorPendingPackage[]> => {
      const { data, error } = await supabase
        .from('decision_packages')
        .select(`
          id,
          work_request_id,
          play_id,
          headline,
          risk,
          automation_work_requests!inner (
            id,
            status,
            agency_workspace_id
          )
        `)
        .eq('automation_work_requests.status', 'awaiting_approval')
        .eq('automation_work_requests.agency_workspace_id', agencyWorkspaceId!)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        packageId: row.id as string,
        workRequestId: row.work_request_id as string,
        headline: row.headline as string,
        risk: row.risk as RiskLevel,
        playId: row.play_id as string,
        packageRef: packageRefFromId(row.id as string),
        workRequestRef: workRequestRefFromId(row.work_request_id as string),
      }));
    },
  });
}
