import { describe, expect, it } from 'vitest';
import { redactPII } from '../../../supabase/functions/_shared/floorSafety.ts';
import {
  buildPackagePreview,
  containsDisallowedRawUuid,
  isOpaqueRef,
  parseUuidFromOpaqueRef,
  validateFeedbackActor,
  validateFloorActionBody,
} from '@/floor/floorAction';

describe('floorSafety — redactPII', () => {
  it('redacts email and phone while keeping safe operator text', () => {
    const { redacted, redactions } = redactPII('Contact jane@example.com or 555-123-4567 about the renewal.');
    expect(redacted).toContain('[REDACTED_EMAIL]');
    expect(redacted).toContain('[REDACTED_PHONE]');
    expect(redacted).not.toContain('jane@example.com');
    expect(redactions.length).toBeGreaterThan(0);
  });

  it('redacts raw UUIDs before Hermes upstream', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const { redacted } = redactPII(`context ${uuid}`);
    expect(redacted).not.toContain(uuid);
    expect(redacted).toContain('[REDACTED_REF]');
  });
});

describe('floorAction — validation', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const actorId = '22222222-2222-4222-8222-222222222222';
  const accountHex = '33333333333343338333333333333333';

  it('accepts create_internal_package with opaque clientRef', () => {
    const parsed = validateFloorActionBody({
      action: 'create_internal_package',
      agency_workspace_id: workspaceId,
      idempotency_key: 'phase0-stub-001',
      play_id: 'internal.tier1.stub',
      play_version: '1.0.0',
      clientRef: `account:${accountHex}`,
    });

    expect(parsed).toMatchObject({
      action: 'create_internal_package',
      clientRef: `account:${accountHex}`,
    });
  });

  it('rejects raw UUIDs in ref fields', () => {
    const parsed = validateFloorActionBody({
      action: 'create_internal_package',
      agency_workspace_id: workspaceId,
      idempotency_key: 'phase0-stub-002',
      play_id: 'internal.tier1.stub',
      play_version: '1.0.0',
      clientRef: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(parsed).toMatchObject({ ok: false, error: 'opaque_refs_required' });
  });

  it('allows agency_workspace_id UUID while blocking other raw UUID fields', () => {
    expect(
      containsDisallowedRawUuid({
        agency_workspace_id: workspaceId,
        clientRef: 'account:practice-context',
      }),
    ).toBe(false);
    expect(
      containsDisallowedRawUuid({
        agency_workspace_id: workspaceId,
        mystery: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).toBe(true);
  });

  it('validates feedback actor matches JWT user', () => {
    expect(validateFeedbackActor(actorId, actorId)).toBeNull();
    expect(validateFeedbackActor(actorId, 'other-user')).toMatchObject({ error: 'actor_mismatch' });
  });

  it('round-trips opaque UUID refs', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const opaque = `work_request:${uuid.replace(/-/g, '')}`;
    expect(isOpaqueRef(opaque)).toBe(true);
    expect(parseUuidFromOpaqueRef(opaque)).toBe(uuid);
  });

  it('builds preview shape aligned with FloorDecisionPackagePreview', () => {
    const preview = buildPackagePreview({
      packageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      playId: 'internal.tier1.stub',
      playVersion: '1.0.0',
      headline: 'Stub headline',
      summary: 'Stub summary',
      risk: 'green',
      clientRef: 'account:practice-context',
    });

    expect(preview.actions).toEqual(['approve', 'edit', 'kill']);
    expect(preview.packageRef).toBe('package:aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa');
    expect(preview.workRequestRef).toBe('work_request:bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb');
  });
});
