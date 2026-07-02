import { describe, expect, it } from 'vitest';
import {
  PRACTICE_FLOOR_CONTEXT,
  buildFloorCockpitInitialContext,
  buildFloorSessionRef,
  resolveWorkRequestRef,
  workRequestRefFromId,
} from '@/floor/floorCockpitContext';

describe('floorCockpitContext', () => {
  it('builds per-agent session refs without raw UUIDs', () => {
    expect(buildFloorSessionRef('kelli')).toBe('chat:cockpit:kelli');
  });

  it('returns practice context when binding is missing or inactive', () => {
    expect(buildFloorCockpitInitialContext({ agentBinding: null })).toEqual(PRACTICE_FLOOR_CONTEXT);
    expect(
      buildFloorCockpitInitialContext({
        agentBinding: {
          agent_id: 'tori',
          human_name: 'Tori Hill',
          role: 'CSR',
          slack_display_name: "Tori's Agent",
          status: 'inactive',
          autonomy_level: 'full_approval',
          second_opinion: false,
        },
      }),
    ).toEqual(PRACTICE_FLOOR_CONTEXT);
  });

  it('builds bound context for active staff agents', () => {
    const context = buildFloorCockpitInitialContext({
      agentBinding: {
        agent_id: 'brian',
        human_name: 'Brian Lewis',
        role: 'Owner / CEO / Orchestrator',
        slack_display_name: "Brian's Agent",
        status: 'active',
        autonomy_level: 'full_approval',
        second_opinion: false,
      },
      agencyName: 'Lewis Insurance',
    });

    expect(context.sessionRef).toBe('chat:cockpit:brian');
    expect(context.label).toBe('Brian Lewis');
    expect(context.chips).toEqual(
      expect.arrayContaining([
        { label: 'Agent', value: "Brian's Agent" },
        { label: 'Agency', value: 'Lewis Insurance' },
        { label: 'Mode', value: 'Internal only / no live sends' },
      ]),
    );
  });

  it('resolves work request refs from preview fields', () => {
    const uuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect(workRequestRefFromId(uuid)).toBe('work_request:bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb');
    expect(resolveWorkRequestRef({ workRequestRef: 'work_request:abc123' })).toBe('work_request:abc123');
    expect(resolveWorkRequestRef({ workRequestId: uuid })).toBe('work_request:bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb');
    expect(resolveWorkRequestRef({})).toBeNull();
  });
});
