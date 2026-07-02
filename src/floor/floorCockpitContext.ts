import type { FloorAgentBinding } from '@/hooks/useFloorAgentBinding';
import type { FloorInitialContext } from './types';

export const PRACTICE_FLOOR_CONTEXT: FloorInitialContext = {
  sessionRef: 'chat:practice-floor-cockpit',
  clientRef: 'client:practice-context',
  label: 'Practice mode',
  chips: [
    { label: 'Mode', value: 'Practice / no live sends' },
    { label: 'Surface', value: 'InsureFlow cockpit' },
  ],
};

export function buildFloorSessionRef(agentId: string): string {
  return `chat:cockpit:${agentId.trim()}`;
}

export function buildFloorCockpitInitialContext(params: {
  agentBinding: FloorAgentBinding | null | undefined;
  agencyName?: string | null;
}): FloorInitialContext {
  if (!params.agentBinding || params.agentBinding.status !== 'active') {
    return PRACTICE_FLOOR_CONTEXT;
  }

  const displayName = params.agentBinding.slack_display_name ?? `${params.agentBinding.human_name}'s Floor`;

  return {
    sessionRef: buildFloorSessionRef(params.agentBinding.agent_id),
    label: params.agentBinding.human_name,
    displayTitle: displayName,
    chips: [
      { label: 'Agent', value: displayName },
      { label: 'Role', value: params.agentBinding.role },
      ...(params.agencyName ? [{ label: 'Agency', value: params.agencyName }] : []),
      { label: 'Mode', value: 'Internal only / no live sends' },
      { label: 'Surface', value: 'InsureFlow cockpit' },
    ],
  };
}

export function workRequestRefFromId(workRequestId: string): string {
  return `work_request:${workRequestId.replace(/-/g, '')}`;
}

export function resolveWorkRequestRef(preview: {
  workRequestRef?: string;
  workRequestId?: string;
}): string | null {
  if (preview.workRequestRef) return preview.workRequestRef;
  if (preview.workRequestId) return workRequestRefFromId(preview.workRequestId);
  return null;
}
