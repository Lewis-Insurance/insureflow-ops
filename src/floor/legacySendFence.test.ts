import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { floorApprovalGateResponse, validateFloorApprovalTokenForClientEffect } from '../../supabase/functions/_shared/floorApprovalGate.ts';
import { redactPII } from '../../supabase/functions/_shared/floorSafety.ts';
import { AI_RESULTS_SMS_DISABLED_REASON, isAiResultsSmsActionEnabled } from './legacyActionGate';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('legacy send fence', () => {
  it('rejects email-send without a Floor approval token before any provider send can happen', async () => {
    const response = floorApprovalGateResponse('email-send', { to: 'client@example.invalid', subject: 'Hello' }, {});

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    await expect(responseJson(response!)).resolves.toMatchObject({
      success: false,
      error: 'floor_approval_required',
      floor_approval_required: true,
    });
  });

  it('rejects send-sms without a Floor approval token before any carrier send can happen', async () => {
    const response = floorApprovalGateResponse('send-sms', { to_number: '+15555550123', body: 'Hello' }, {});

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    await expect(responseJson(response!)).resolves.toMatchObject({
      success: false,
      error: 'floor_approval_required',
      floor_approval_required: true,
    });
  });

  it('only accepts opaque Floor approval metadata for future exact-artifact sends', () => {
    expect(
      validateFloorApprovalTokenForClientEffect('email-send', {
        floor_approval_token: 'floor_action:opaqueSyntheticToken001',
        floor_package_ref: 'package:synthetic-decpage-001',
        floor_rendered_hash: 'sha256:synthetic-rendered-artifact',
        floor_approved_by_human_ref: 'human:brian',
      }),
    ).toMatchObject({ ok: true });

    expect(
      validateFloorApprovalTokenForClientEffect('send-sms', {
        floor_approval_token: 'floor_action:550e8400-e29b-41d4-a716-446655440000',
        floor_package_ref: 'package:synthetic-decpage-001',
        floor_rendered_hash: 'sha256:synthetic-rendered-artifact',
        floor_approved_by_human_ref: 'human:brian',
      }),
    ).toMatchObject({ ok: false, status: 422, error: 'floor_approval_boundary_violation' });
  });

  it('keeps AI-result to SMS disabled until routed through the Floor gate', () => {
    expect(isAiResultsSmsActionEnabled()).toBe(false);
    expect(AI_RESULTS_SMS_DISABLED_REASON).toMatch(/Floor approval gate/i);

    const source = readFileSync(resolve(repoRoot, 'src/components/ai/AIResultsActionBar.tsx'), 'utf8');
    expect(source).not.toContain("functions.invoke('send-sms'");
    expect(source).toContain('AI_RESULTS_SMS_DISABLED_REASON');
  });

  it('redacts document text before execute-ai-module can build a model prompt', () => {
    const raw = 'DOB: 01/02/1980, SSN 123-45-6789, email client@example.invalid, phone 555-555-1212';
    const { redacted } = redactPII(raw);

    expect(redacted).not.toContain('123-45-6789');
    expect(redacted).not.toContain('client@example.invalid');
    expect(redacted).not.toContain('555-555-1212');

    const source = readFileSync(resolve(repoRoot, 'supabase/functions/execute-ai-module/index.ts'), 'utf8');
    expect(source).toContain("import { redactPII }");
    expect(source).toContain('redactPII(text.substring(0, 80000))');
    expect(source).not.toContain('${doc.filename} ---\\n${doc.text}');
  });
});
