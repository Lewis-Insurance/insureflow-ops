import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clientSendApprovalGateResponse,
  createInMemoryClientSendApprovalStore,
  createPendingClientSendApproval,
  createSupabaseClientSendApprovalStore,
  hashClientSendPayload,
  isFloorActionApprovalRef,
  type PendingClientSendApproval,
} from '../../supabase/functions/_shared/clientSendApprovalGate.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

type TestedSurface = 'email-send' | 'send-sms' | 'send-coi-email' | 'esign-create-request';

interface SurfaceCase {
  surface: TestedSurface;
  payload: Record<string, unknown>;
  tamperedPayload: Record<string, unknown>;
}

interface ApprovalRow {
  approval_ref: string;
  surface: string;
  content_hash: string;
  approved_by_user_id: string;
  consumed_at: string | null;
  expires_at: string;
}

type SupabaseFilter =
  | { op: 'eq'; column: string; value: string }
  | { op: 'is'; column: string; value: null }
  | { op: 'gt'; column: string; value: string };

interface SupabaseUpdateAttempt {
  table: string;
  values: Record<string, unknown>;
  filters: SupabaseFilter[];
}

const surfaceCases: SurfaceCase[] = [
  {
    surface: 'email-send',
    payload: { to: 'client@example.invalid', subject: 'Hello', body: 'Human text', ticketId: 'ticket-ref-001' },
    tamperedPayload: { to: 'client@example.invalid', subject: 'Hello', body: 'Changed human text', ticketId: 'ticket-ref-001' },
  },
  {
    surface: 'send-sms',
    payload: { to_number: '+155****4567', body: 'Your ID card is ready for review.', account_id: 'account-ref-001', contact_id: 'contact-ref-001' },
    tamperedPayload: { to_number: '+155****4567', body: 'Changed SMS body.', account_id: 'account-ref-001', contact_id: 'contact-ref-001' },
  },
  {
    surface: 'send-coi-email',
    payload: { to: 'holder@example.invalid', certificateNumber: 'COI-2026-0001', certificateUrl: 'https://example.invalid/coi.pdf', holderName: 'Certificate Holder' },
    tamperedPayload: { to: 'holder@example.invalid', certificateNumber: 'COI-2026-0001', certificateUrl: 'https://example.invalid/changed.pdf', holderName: 'Certificate Holder' },
  },
  {
    surface: 'esign-create-request',
    payload: {
      document_url: 'https://example.invalid/acord.pdf',
      document_name: 'ACORD 25',
      signers: [{ email: 'signer@example.invalid', name: 'Signer One', role: 'applicant', order: 1 }],
      form_number: '25',
      acord_form_id: 'acord-ref-001',
      message: 'Please review and sign.',
      expires_in_days: 14,
    },
    tamperedPayload: {
      document_url: 'https://example.invalid/acord-v2.pdf',
      document_name: 'ACORD 25',
      signers: [{ email: 'signer@example.invalid', name: 'Signer One', role: 'applicant', order: 1 }],
      form_number: '25',
      acord_form_id: 'acord-ref-001',
      message: 'Please review and sign.',
      expires_in_days: 14,
    },
  },
];

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function approvalRefFor(surface: TestedSurface, suffix: string): string {
  return `sendapproval_${surface.replace(/-/g, '_')}_${suffix}_abcdefghijkl`;
}

function payloadWithApproval(
  payload: Record<string, unknown>,
  approval: PendingClientSendApproval,
  approvedByHumanId = approval.approvedByUserId,
): Record<string, unknown> {
  return {
    ...payload,
    client_send_approval: {
      approval_ref: approval.approvalRef,
      approved_by_human_id: approvedByHumanId,
    },
  };
}

async function expectGateRejection(response: Response | null, error: string, status = 403): Promise<void> {
  expect(response).not.toBeNull();
  expect(response?.status).toBe(status);
  await expect(responseJson(response!)).resolves.toMatchObject({ error });
}

function rowFromApproval(approval: PendingClientSendApproval): ApprovalRow {
  if (!approval.expiresAtIso) throw new Error('Supabase approval rows require expires_at');
  return {
    approval_ref: approval.approvalRef,
    surface: approval.surface,
    content_hash: approval.contentHash,
    approved_by_user_id: approval.approvedByUserId,
    consumed_at: approval.consumedAtIso,
    expires_at: approval.expiresAtIso,
  };
}

function createFakeSupabaseApprovalClient(initialRows: ApprovalRow[]) {
  const rows = initialRows.map((row) => ({ ...row }));
  const updateAttempts: SupabaseUpdateAttempt[] = [];

  function matchesFilters(row: ApprovalRow, filters: SupabaseFilter[]): boolean {
    const record = row as unknown as Record<string, unknown>;
    return filters.every((filter) => {
      const actual = record[filter.column];
      if (filter.op === 'eq') return actual === filter.value;
      if (filter.op === 'is') return actual === filter.value;
      return typeof actual === 'string' && new Date(actual).getTime() > new Date(filter.value).getTime();
    });
  }

  function createBuilder(
    mode: 'select' | 'update',
    table: string,
    values: Record<string, unknown> = {},
  ) {
    const filters: SupabaseFilter[] = [];
    const builder = {
      eq(column: string, value: string) {
        filters.push({ op: 'eq', column, value });
        return builder;
      },
      is(column: string, value: null) {
        filters.push({ op: 'is', column, value });
        return builder;
      },
      gt(column: string, value: string) {
        filters.push({ op: 'gt', column, value });
        return builder;
      },
      select(_columns: string) {
        return builder;
      },
      async maybeSingle() {
        if (table !== 'client_send_approvals') {
          return { data: null, error: new Error(`Unexpected table: ${table}`) };
        }
        if (mode === 'select') {
          const row = rows.find((candidate) => matchesFilters(candidate, filters));
          return { data: row ? { ...row } : null, error: null };
        }

        updateAttempts.push({ table, values: { ...values }, filters: [...filters] });
        const row = rows.find((candidate) => matchesFilters(candidate, filters));
        if (!row) return { data: null, error: null };
        Object.assign(row, values);
        return { data: { approval_ref: row.approval_ref }, error: null };
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      return {
        select(_columns: string) {
          return createBuilder('select', table);
        },
        update(values: Record<string, unknown>) {
          return createBuilder('update', table, values);
        },
      };
    },
  } as Parameters<typeof createSupabaseClientSendApprovalStore>[0];

  return { client, rows, updateAttempts };
}

function sourceIndex(source: string, snippet: string): number {
  const index = source.indexOf(snippet);
  expect(index, `Expected source to contain: ${snippet}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('server-verified client send approval gate', () => {
  it.each(surfaceCases)('rejects no-approval $surface payloads before provider/carrier send', async ({ surface, payload }) => {
    const store = createInMemoryClientSendApprovalStore([]);
    const response = await clientSendApprovalGateResponse({
      surface,
      payload,
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

  it.each(surfaceCases)('accepts a legitimate named-human $surface approval once, then rejects replay', async ({ surface, payload }) => {
    const approval = await createPendingClientSendApproval({
      surface,
      payload,
      approvedByUserId: 'user-human-001',
      approvalRef: approvalRefFor(surface, 'valid_once'),
    });
    const store = createInMemoryClientSendApprovalStore([approval]);
    const approvedPayload = payloadWithApproval(payload, approval);

    await expect(clientSendApprovalGateResponse({
      surface,
      payload: approvedPayload,
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    })).resolves.toBeNull();

    const replay = await clientSendApprovalGateResponse({
      surface,
      payload: approvedPayload,
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    });

    await expectGateRejection(replay, 'client_send_approval_replayed');
  });

  it.each(surfaceCases)('rejects $surface approval references tied to different content', async ({ surface, payload, tamperedPayload }) => {
    const approval = await createPendingClientSendApproval({
      surface,
      payload,
      approvedByUserId: 'user-human-001',
      approvalRef: approvalRefFor(surface, 'content_bound'),
    });
    const store = createInMemoryClientSendApprovalStore([approval]);

    const response = await clientSendApprovalGateResponse({
      surface,
      payload: payloadWithApproval(tamperedPayload, approval),
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
    });

    await expectGateRejection(response, 'client_send_approval_content_mismatch');
    await expect(hashClientSendPayload(surface, payload)).resolves.not.toEqual(await hashClientSendPayload(surface, tamperedPayload));
  });

  it('rejects approval use by a different authenticated human', async () => {
    const payload = surfaceCases[0].payload;
    const approval = await createPendingClientSendApproval({
      surface: 'email-send',
      payload,
      approvedByUserId: 'user-human-001',
      approvalRef: 'sendapproval_wrong_human_abcdefghijkl',
    });
    const store = createInMemoryClientSendApprovalStore([approval]);

    const response = await clientSendApprovalGateResponse({
      surface: 'email-send',
      payload: payloadWithApproval(payload, approval),
      userId: 'user-human-002',
      approvalStore: store,
      corsHeaders: {},
    });

    await expectGateRejection(response, 'client_send_approval_wrong_human');
  });

  it('rejects expired approval references', async () => {
    const nowIso = '2026-06-30T12:00:00.000Z';
    const payload = surfaceCases[1].payload;
    const approval = await createPendingClientSendApproval({
      surface: 'send-sms',
      payload,
      approvedByUserId: 'user-human-001',
      approvalRef: 'sendapproval_expired_ref_abcdefghijkl',
      expiresAtIso: '2026-06-30T11:59:59.000Z',
    });
    const store = createInMemoryClientSendApprovalStore([approval]);

    const response = await clientSendApprovalGateResponse({
      surface: 'send-sms',
      payload: payloadWithApproval(payload, approval),
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
      nowIso,
    });

    await expectGateRejection(response, 'client_send_approval_expired');
  });

  it('rejects invalid approval refs before store lookup', async () => {
    const response = await clientSendApprovalGateResponse({
      surface: 'email-send',
      payload: {
        ...surfaceCases[0].payload,
        client_send_approval: {
          approval_ref: 'user-provided-readable-token',
          approved_by_human_id: 'user-human-001',
        },
      },
      userId: 'user-human-001',
      approvalStore: {
        async consume() {
          throw new Error('store should not be called for invalid refs');
        },
      },
      corsHeaders: {},
    });

    await expectGateRejection(response, 'invalid_client_send_approval_ref');
  });

  it('consumes Supabase-backed approvals with final update predicates and rejects replay', async () => {
    const nowIso = '2026-06-30T12:00:00.000Z';
    const payload = surfaceCases[0].payload;
    const approval = await createPendingClientSendApproval({
      surface: 'email-send',
      payload,
      approvedByUserId: 'user-human-001',
      approvalRef: 'sendapproval_supabase_once_abcdefghijkl',
      expiresAtIso: '2026-06-30T12:15:00.000Z',
    });
    const fakeSupabase = createFakeSupabaseApprovalClient([rowFromApproval(approval)]);
    const store = createSupabaseClientSendApprovalStore(fakeSupabase.client);
    const approvedPayload = payloadWithApproval(payload, approval);

    await expect(clientSendApprovalGateResponse({
      surface: 'email-send',
      payload: approvedPayload,
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
      nowIso,
    })).resolves.toBeNull();

    expect(fakeSupabase.updateAttempts).toHaveLength(1);
    expect(fakeSupabase.updateAttempts[0].filters).toEqual(expect.arrayContaining([
      { op: 'eq', column: 'approval_ref', value: approval.approvalRef },
      { op: 'eq', column: 'surface', value: approval.surface },
      { op: 'eq', column: 'content_hash', value: approval.contentHash },
      { op: 'eq', column: 'approved_by_user_id', value: approval.approvedByUserId },
      { op: 'gt', column: 'expires_at', value: nowIso },
      { op: 'is', column: 'consumed_at', value: null },
    ]));

    const replay = await clientSendApprovalGateResponse({
      surface: 'email-send',
      payload: approvedPayload,
      userId: 'user-human-001',
      approvalStore: store,
      corsHeaders: {},
      nowIso,
    });

    await expectGateRejection(replay, 'client_send_approval_replayed');
    expect(fakeSupabase.updateAttempts).toHaveLength(1);
  });

  it('wires direct client-effect functions to the async server-side approval gate', () => {
    const clientEffectFunctions = [
      ['email-send', 'supabase/functions/email-send/index.ts'],
      ['send-sms', 'supabase/functions/send-sms/index.ts'],
      ['send-coi-email', 'supabase/functions/send-coi-email/index.ts'],
      ['esign-create-request', 'supabase/functions/esign-create-request/index.ts'],
    ];

    for (const [surface, path] of clientEffectFunctions) {
      const source = readFileSync(resolve(repoRoot, path), 'utf8');
      expect(source, `${surface} must import the shared approval gate`).toContain('clientSendApprovalGateResponse');
      expect(source, `${surface} must await the shared approval gate`).toContain('await clientSendApprovalGateResponse');
      expect(source, `${surface} must use the Supabase one-time approval store`).toContain('createSupabaseClientSendApprovalStore');
    }
  });

  it('defers send-sms approval consumption until after non-side-effect validation, access, and rate checks', () => {
    const smsSource = readFileSync(resolve(repoRoot, 'supabase/functions/send-sms/index.ts'), 'utf8');
    const gateIndex = sourceIndex(smsSource, 'await clientSendApprovalGateResponse');

    expect(sourceIndex(smsSource, 'if (!to_number || !body)')).toBeLessThan(gateIndex);
    expect(sourceIndex(smsSource, 'body.length > 1600')).toBeLessThan(gateIndex);
    expect(sourceIndex(smsSource, 'Invalid phone number format')).toBeLessThan(gateIndex);
    expect(sourceIndex(smsSource, 'await verifyResourceAccess')).toBeLessThan(gateIndex);
    expect(sourceIndex(smsSource, 'await checkRateLimit')).toBeLessThan(gateIndex);
    expect(gateIndex).toBeLessThan(sourceIndex(smsSource, 'Messages.json'));
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

  it('wraps legitimate human client-effect flows with the server-minted approval marker', () => {
    const hookSource = readFileSync(resolve(repoRoot, 'src/hooks/useSMSMessages.ts'), 'utf8');
    const modalSource = readFileSync(resolve(repoRoot, 'src/components/communications/SMSComposerModal.tsx'), 'utf8');
    const coiSource = readFileSync(resolve(repoRoot, 'src/hooks/useCOIGeneration.ts'), 'utf8');
    const signatureHookSource = readFileSync(resolve(repoRoot, 'src/hooks/useSignature.ts'), 'utf8');
    const signatureModalSource = readFileSync(resolve(repoRoot, 'src/components/signatures/SignatureRequestModal.tsx'), 'utf8');
    const helperSource = readFileSync(resolve(repoRoot, 'src/lib/clientSendApproval.ts'), 'utf8');

    expect(helperSource).toContain("functions.invoke('client-send-approval-create'");
    expect(hookSource).toContain("createClientSendApproval('send-sms', payload)");
    expect(hookSource).toContain('client_send_approval');
    expect(modalSource).toContain("createClientSendApproval('send-sms', sendPayload)");
    expect(modalSource).toContain('client_send_approval');
    expect(coiSource).toContain("createClientSendApproval('send-coi-email', sendPayload)");
    expect(coiSource).toContain('client_send_approval');
    expect(signatureHookSource).toContain("createClientSendApproval('esign-create-request', signatureRequestPayload)");
    expect(signatureHookSource).toContain('client_send_approval');
    expect(signatureModalSource).toContain("createClientSendApproval('esign-create-request', signatureRequestPayload)");
    expect(signatureModalSource).toContain('client_send_approval');
  });

  it('consumes floor_action approvals without a live user session (Floor service release path)', async () => {
    const coiCase = surfaceCases.find((entry) => entry.surface === 'send-coi-email');
    if (!coiCase) throw new Error('missing send-coi-email surface case');

    const approvalRef = 'floor_action:abcdef0123456789abcdef0123456789';
    expect(isFloorActionApprovalRef(approvalRef)).toBe(true);

    const approval = await createPendingClientSendApproval({
      surface: 'send-coi-email',
      payload: coiCase.payload,
      approvedByUserId: 'approver-human-001',
      approvalRef,
      expiresAtIso: '2026-06-30T12:15:00.000Z',
    });

    const store = createInMemoryClientSendApprovalStore([approval]);
    const approvedPayload = payloadWithApproval(coiCase.payload, approval, 'approver-human-001');

    await expect(clientSendApprovalGateResponse({
      surface: 'send-coi-email',
      payload: approvedPayload,
      userId: 'service-role-not-human',
      approvalStore: store,
      corsHeaders: {},
      nowIso: '2026-06-30T12:00:00.000Z',
    })).resolves.toBeNull();
  });
});
