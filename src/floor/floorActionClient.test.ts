import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeFloorAction } from './floorActionClient';
import { setFloorCockpitLaunchControlOverrideForTests } from './launchControl';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

describe('floorActionClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setFloorCockpitLaunchControlOverrideForTests(null);
  });

  it('posts feedback to floor-action with the session bearer token', async () => {
    setFloorCockpitLaunchControlOverrideForTests(true);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          verb: 'approve',
          preview: {
            packageRef: 'package:abc123',
            revision: 1,
            title: 'Stub',
            summary: 'Stub summary',
            actions: ['approve', 'edit', 'kill'],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const workspaceId = '11111111-1111-4111-8111-111111111111';
    const actorId = '22222222-2222-4222-8222-222222222222';

    const result = await invokeFloorAction({
      action: 'feedback',
      agency_workspace_id: workspaceId,
      workRequestRef: 'work_request:bbbbbbbbbbbb4bbb8bbb8bbbbbbbbbbbb',
      packageRef: 'package:aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa',
      verb: 'approve',
      actor_id: actorId,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/floor-action'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        body: JSON.stringify({
          action: 'feedback',
          agency_workspace_id: workspaceId,
          workRequestRef: 'work_request:bbbbbbbbbbbb4bbb8bbb8bbbbbbbbbbbb',
          packageRef: 'package:aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa',
          verb: 'approve',
          actor_id: actorId,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.verb).toBe('approve');
  });
});
