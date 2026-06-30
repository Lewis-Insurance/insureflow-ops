import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clientSendApprovalGateResponse,
  createInMemoryClientSendApprovalStore,
  createPendingClientSendApproval,
  hashClientSendPayload,
} from '../../supabase/functions/_shared/clientSendApprovalGate.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('server-verified client send approval gate', () => {
  it('rejects no-approval client-send payloads before provider/carrier send', async () => {
    const store = createInMemoryClientSendApprovalStore([]);
    const response = await clientSendApprovalGateResponse({
      surface: 'email-send',
      payload: { to: 'client@example.invalid', subject: 'Hello', body: 'Human text' },
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
    await expect(responseJson(response!)).resolves.toMatchObject({
      success: false,
      error: 'client_send_approval_required',
      client_send_approval_required: true,
    });
  });

  it('accepts a legitimate named-human approval once, then rejects replay', async () => {
    const payload = { to_number: '+15551234567', body: 'Your ID card is ready for review.', account_id: 'account-ref-001' };
    const approval = await createPendingClientSendApproval({
      surface: 'send-sms',
      payload,
      approvedByUserId: 'user-human-001',
      approvalRef: 'sendapproval_valid_once_001',
    });
    const store = createInMemoryClientSendApprovalStore([approval]);

    await expect(clientSendApprovalGateResponse({
      surface: 'send-sms',
      payload: { ...payload, client_send_approval: { approval_ref: approval.approvalRef, approved_by_human_id: approval.approvedByUserId } },
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    })).resolves.toBeNull();

    const replay = await clientSendApprovalGateResponse({
      surface: 'send-sms',
      payload: { ...payload, client_send_approval: { approval_ref: approval.approvalRef, approved_by_human_id: approval.approvedByUserId } },
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    });

    expect(replay?.status).toBe(403);
    await expect(responseJson(replay!)).resolves.toMatchObject({ error: 'client_send_approval_replayed' });
  });

  it('rejects approval references tied to different content', async () => {
    const approvedPayload = { to: 'client@example.invalid', subject: 'Approved', body: 'Approved body' };
    const tamperedPayload = { to: 'client@example.invalid', subject: 'Approved', body: 'Changed body' };
    const approval = await createPendingClientSendApproval({
      surface: 'email-send',
      payload: approvedPayload,
      approvedByUserId: 'user-human-001',
      approvalRef: 'sendapproval_content_bound_001',
    });
    const store = createInMemoryClientSendApprovalStore([approval]);

    const response = await clientSendApprovalGateResponse({
      surface: 'email-send',
      payload: { ...tamperedPayload, client_send_approval: { approval_ref: approval.approvalRef, approved_by_human_id: approval.approvedByUserId } },
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    });

    expect(response?.status).toBe(403);
    await expect(responseJson(response!)).resolves.toMatchObject({ error: 'client_send_approval_content_mismatch' });
    await expect(hashClientSendPayload('email-send', approvedPayload)).resolves.not.toEqual(await hashClientSendPayload('email-send', tamperedPayload));
  });

  it('wires email-send and send-sms to the async server-side approval gate', () => {
    const emailSource = readFileSync(resolve(repoRoot, 'supabase/functions/email-send/index.ts'), 'utf8');
    const smsSource = readFileSync(resolve(repoRoot, 'supabase/functions/send-sms/index.ts'), 'utf8');

    expect(emailSource).toContain('clientSendApprovalGateResponse');
    expect(emailSource).toContain('await clientSendApprovalGateResponse');
    expect(smsSource).toContain('clientSendApprovalGateResponse');
    expect(smsSource).toContain('await clientSendApprovalGateResponse');
  });

  it('mints approval refs through a non-send edge function and stores only the content hash', () => {
    const source = readFileSync(resolve(repoRoot, 'supabase/functions/client-send-approval-create/index.ts'), 'utf8');
    const migration = readFileSync(resolve(repoRoot, 'supabase/migrations/20260630040000_client_send_approvals.sql'), 'utf8');

    expect(source).toContain('hashClientSendPayload');
    expect(source).toContain("supabase.from('client_send_approvals').insert");
    expect(source).not.toContain('api.postmarkapp.com');
    expect(source).not.toContain('Messages.json');
    expect(migration).toContain('create table if not exists public.client_send_approvals');
    expect(migration).toContain('content_hash text not null');
    expect(migration).toContain('alter table public.client_send_approvals enable row level security');
  });

  it('wraps legitimate human SMS composer flows with the server-minted approval marker', () => {
    const hookSource = readFileSync(resolve(repoRoot, 'src/hooks/useSMSMessages.ts'), 'utf8');
    const modalSource = readFileSync(resolve(repoRoot, 'src/components/communications/SMSComposerModal.tsx'), 'utf8');
    const helperSource = readFileSync(resolve(repoRoot, 'src/lib/clientSendApproval.ts'), 'utf8');

    expect(helperSource).toContain("functions.invoke('client-send-approval-create'");
    expect(hookSource).toContain("createClientSendApproval('send-sms', payload)");
    expect(hookSource).toContain('client_send_approval');
    expect(modalSource).toContain("createClientSendApproval('send-sms', sendPayload)");
    expect(modalSource).toContain('client_send_approval');
  });
});
