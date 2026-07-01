import { describe, expect, it, vi } from 'vitest';
import {
  buildCoverageDiff,
  classifyInboundAttachments,
  deriveWorkRequestStatus,
  evaluateFloorEmailIntake,
  evaluatePolicyInForce,
  goldenCoverageDiffLines,
  goldenResolveEmailExact,
  goldenRouterAllowlistedCoi,
  goldenRouterAuthFail,
  goldenSendCOIEmailPayload,
  mailSkillRouter,
  releaseHeldClientSend,
  resolveAccount,
  runCarrierReconciliationPlay,
  runSuspenseSweepPlay,
  planInternalPlays,
  persistInternalPlayCards,
  shouldForceIdentityPick,
  stageClientSend,
  mintFloorActionToken,
  isFloorActionApprovalRef,
  maybeStageClientSendOnApprove,
  createInternalRecipientGuard,
  isStubInternalSendSpec,
  isTier3SendSpec,
  parseInternalSendAllowlist,
  type AccountRecord,
  type FloorClientSendApproval,
  type ResolveAccountStore,
} from '@/floor/spine';

describe('Floor spine — mailSkillRouter', () => {
  it('routes allowlisted COI attachment to coi.issue', async () => {
    const decision = await mailSkillRouter(goldenRouterAllowlistedCoi.input, {
      allowedSender: () => true,
      classifyDocument: () => 'coi',
    });
    expect(decision).toEqual({
      route: 'work_request',
      action: goldenRouterAllowlistedCoi.expectedAction,
      sender_identity: 'contractor@aceconstruction.com',
    });
  });

  it('falls through when auth fails', async () => {
    const decision = await mailSkillRouter(goldenRouterAuthFail, {
      allowedSender: () => true,
      classifyDocument: () => 'coi',
    });
    expect(decision).toEqual({ route: 'fall_through', reason: 'auth_failed' });
  });
});

describe('Floor spine — email inbound integration', () => {
  const floorRouterDeps = {
    allowedSender: () => true,
    classifyDocument: classifyInboundAttachments,
  };

  it('classifies COI attachments by filename metadata', () => {
    expect(
      classifyInboundAttachments([{ contentType: 'application/pdf', filename: 'coi-request.pdf' }]),
    ).toBe('coi');
    expect(
      classifyInboundAttachments([{ contentType: 'application/pdf', filename: 'invoice.pdf' }]),
    ).not.toBe('coi');
  });

  it('evaluateFloorEmailIntake routes COI to work_request after resolveAccount', async () => {
    const store: ResolveAccountStore = {
      findByEmail: async (email) =>
        email === 'contractor@aceconstruction.com'
          ? ({ id: 'acct-coi-1', email, phone: null, phone_e164: null, name: 'Ace Construction' } satisfies AccountRecord)
          : null,
      findByInsuredEmail: async () => null,
      findByAlias: async () => null,
      findByEmailDomain: async () => [],
      searchByName: async () => [],
      findByPhone: async () => null,
    };

    const resolveResult = await resolveAccount({ email: 'contractor@aceconstruction.com' }, store);
    const body = {
      from: 'contractor@aceconstruction.com',
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass',
      attachments: [{ name: 'coi-request.pdf', type: 'application/pdf' }],
    };

    const attachments = [{ contentType: 'application/pdf', filename: 'coi-request.pdf' }];
    const intake = await evaluateFloorEmailIntake({
      body,
      attachments,
      resolveResult,
      routerDeps: floorRouterDeps,
    });

    expect(intake.handled).toBe(true);
    expect(intake.action).toBe('coi.issue');
    expect(intake.workRequestStatus).toBe('awaiting_approval');
    expect(deriveWorkRequestStatus(resolveResult)).toBe('awaiting_approval');
  });

  it('evaluateFloorEmailIntake falls through to helpdesk path when out of scope', async () => {
    const intake = await evaluateFloorEmailIntake({
      body: {
        from: 'contractor@aceconstruction.com',
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
      },
      attachments: [],
      resolveResult: { candidates: [], top: null },
      routerDeps: floorRouterDeps,
    });

    expect(intake.handled).toBe(false);
    expect(intake.route).toEqual({ route: 'fall_through', reason: 'out_of_scope' });
  });

  it('forces needs_identity when resolve confidence is below threshold', async () => {
    const fuzzyStore: ResolveAccountStore = {
      findByEmail: async () => null,
      findByInsuredEmail: async () => null,
      findByAlias: async () => null,
      findByEmailDomain: async () => [],
      searchByName: async () => [
        { id: 'acct-fuzzy', email: null, phone: null, phone_e164: null, name: 'Ace Co', score: 0.5 },
      ],
      findByPhone: async () => null,
    };

    const resolveResult = await resolveAccount({ email: 'contractor@aceconstruction.com', name: 'Ace Co' }, fuzzyStore);
    expect(shouldForceIdentityPick(resolveResult)).toBe(true);

    const intake = await evaluateFloorEmailIntake({
      body: {
        from: 'contractor@aceconstruction.com',
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'pass',
        attachments: [{ name: 'coi-request.pdf', type: 'application/pdf' }],
      },
      attachments: [{ contentType: 'application/pdf', filename: 'coi-request.pdf' }],
      resolveResult,
      routerDeps: floorRouterDeps,
    });

    expect(intake.handled).toBe(true);
    expect(intake.workRequestStatus).toBe('needs_identity');
  });
});

describe('Floor spine — resolveAccount', () => {
  const store: ResolveAccountStore = {
    findByEmail: async (email) =>
      email === 'jane.doe@example.com'
        ? ({ id: 'acct-1', email, phone: null, phone_e164: null, name: 'Jane Doe' } satisfies AccountRecord)
        : null,
    findByInsuredEmail: async () => null,
    findByAlias: async () => null,
    findByEmailDomain: async () => [],
    searchByName: async () => [],
    findByPhone: async () => null,
  };

  it('auto-resolves exact email above threshold', async () => {
    const result = await resolveAccount(goldenResolveEmailExact, store);
    expect(result.top).toEqual({ account_id: 'acct-1', confidence: 1 });
    expect(shouldForceIdentityPick(result)).toBe(false);
  });

  it('forces human pick below threshold', async () => {
    const fuzzyStore: ResolveAccountStore = {
      ...store,
      findByEmail: async () => null,
      searchByName: async () => [
        { id: 'acct-2', email: null, phone: null, phone_e164: null, name: 'Jane D', score: 0.5 },
      ],
    };
    const result = await resolveAccount({ name: 'Jane D' }, fuzzyStore);
    expect(result.top).toBeNull();
    expect(shouldForceIdentityPick(result)).toBe(true);
  });
});

describe('Floor spine — coverage diff', () => {
  it('flags red when holder demand is not backed', () => {
    const diff = buildCoverageDiff(goldenCoverageDiffLines);
    expect(diff.overall).toBe('red');
  });
});

describe('Floor spine — policy in force', () => {
  it('blocks lapsed policies', () => {
    expect(
      evaluatePolicyInForce({
        status: 'active',
        effective_date: '2020-01-01',
        expiration_date: '2020-12-31',
        cancelled_at: null,
        deleted_at: null,
        asOf: new Date('2026-06-30'),
      }),
    ).toBe(false);
  });

  it('allows active in-term policies', () => {
    expect(
      evaluatePolicyInForce({
        status: 'active',
        effective_date: '2026-01-01',
        expiration_date: '2027-01-01',
        cancelled_at: null,
        deleted_at: null,
        asOf: new Date('2026-06-30'),
      }),
    ).toBe(true);
  });
});

describe('Floor spine — stageClientSend', () => {
  it('places undo hold without sending immediately', async () => {
    const approval: FloorClientSendApproval = {
      id: 'appr-1',
      work_request_id: 'wr-1',
      approver_id: 'user-1',
      status: 'approved',
      hold_until: null,
      recipient: goldenSendCOIEmailPayload.to,
      recipient_basis: 'approved_holder',
      send_payload: goldenSendCOIEmailPayload,
      created_at: new Date().toISOString(),
    };

    const send = vi.fn();
    const result = await stageClientSend(
      {
        work_request_id: 'wr-1',
        approval_id: 'appr-1',
        send_spec: {
          channel: 'email',
          recipient: goldenSendCOIEmailPayload.to,
          recipient_basis: 'approved_holder',
          authorized_rep_of_record: 'Tori Hill',
          payload: goldenSendCOIEmailPayload,
        },
      },
      {
        now: () => new Date('2026-06-30T12:00:00Z'),
        readApproval: async () => approval,
        assertRecipientOnFile: async () => {},
        assertCertificateAccess: async () => {},
        assertExternalRecipientAllowed: async () => {},
        updateApproval: async (_id, patch) => ({ ...approval, ...patch }),
        invokeSendCOIEmail: send,
        logEmail: async () => {},
      },
    );

    expect(result).toEqual({ status: 'held' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends after hold expires via releaseHeldClientSend', async () => {
    const approval: FloorClientSendApproval = {
      id: 'appr-1',
      work_request_id: 'wr-1',
      approver_id: 'user-1',
      status: 'held',
      hold_until: '2026-06-30T11:59:00Z',
      recipient: goldenSendCOIEmailPayload.to,
      recipient_basis: 'approved_holder',
      send_payload: goldenSendCOIEmailPayload,
      created_at: new Date().toISOString(),
    };

    const send = vi.fn().mockResolvedValue({ success: true, messageId: 'msg-1' });
    const result = await releaseHeldClientSend('appr-1', {
      now: () => new Date('2026-06-30T12:00:00Z'),
      readApproval: async () => approval,
      assertRecipientOnFile: async () => {},
      assertCertificateAccess: async () => {},
      assertExternalRecipientAllowed: async () => {},
      updateApproval: async (_id, patch) => ({ ...approval, ...patch }),
      invokeSendCOIEmail: send,
      logEmail: async () => {},
    });

    expect(result).toEqual({ status: 'sent', messageId: 'msg-1' });
    expect(send).toHaveBeenCalledWith(goldenSendCOIEmailPayload);
  });

  it('mints floor_action token and attaches Fence marker on release', async () => {
    const approval: FloorClientSendApproval = {
      id: 'appr-1',
      work_request_id: 'wr-1',
      approver_id: 'user-1',
      status: 'held',
      hold_until: '2026-06-30T11:59:00Z',
      recipient: goldenSendCOIEmailPayload.to,
      recipient_basis: 'approved_holder',
      send_payload: goldenSendCOIEmailPayload,
      created_at: new Date().toISOString(),
    };

    const inserted: Array<Record<string, unknown>> = [];
    const send = vi.fn().mockResolvedValue({ success: true, messageId: 'msg-floor-1' });
    await releaseHeldClientSend('appr-1', {
      now: () => new Date('2026-06-30T12:00:00Z'),
      readApproval: async () => approval,
      assertRecipientOnFile: async () => {},
      assertCertificateAccess: async () => {},
      assertExternalRecipientAllowed: async () => {},
      updateApproval: async (_id, patch) => ({ ...approval, ...patch }),
      mintFloorFenceApproval: {
        hashPayload: async () => 'sha256:fixturehash',
        insertClientSendApproval: async (row) => {
          inserted.push(row);
        },
      },
      invokeSendCOIEmail: send,
      logEmail: async () => {},
    });

    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.approval_ref).toMatch(/^floor_action:[a-f0-9]{32}$/);
    expect(send).toHaveBeenCalledTimes(1);
    const markedPayload = send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(markedPayload.client_send_approval).toMatchObject({
      approval_ref: inserted[0]?.approval_ref,
      approved_by_human_id: 'user-1',
    });
  });
});

describe('Floor plays — stubs', () => {
  it('summarizes carrier reconciliation', () => {
    const summary = runCarrierReconciliationPlay({
      policies: [
        {
          policy_id: 'p1',
          account_id: 'a1',
          policy_number: 'PN1',
          in_force: true,
          premium: 1200,
          cgl_details: null,
          bap_details: null,
          evaluated_at: '2026-06-30T00:00:00Z',
        },
        {
          policy_id: 'p2',
          account_id: 'a2',
          policy_number: 'PN2',
          in_force: false,
          premium: 800,
          cgl_details: null,
          bap_details: null,
          evaluated_at: '2026-06-30T00:00:00Z',
        },
      ],
    });
    expect(summary.in_force_count).toBe(1);
    expect(summary.lapsed_count).toBe(1);
    expect(summary.policy_ids_lapsed).toEqual(['p2']);
  });

  it('ranks suspense tasks by severity', () => {
    const items = runSuspenseSweepPlay(
      [
        {
          id: 't1',
          title: 'Follow up quote',
          assignee_id: 'u1',
          due_at: '2026-06-28T12:00:00Z',
          priority: 'high',
          status: 'pending',
          account_id: 'a1',
          premium_hint: 5000,
        },
        {
          id: 't2',
          title: 'Low priority note',
          assignee_id: 'u2',
          due_at: '2026-07-05T12:00:00Z',
          priority: 'low',
          status: 'pending',
          account_id: 'a2',
        },
      ],
      new Date('2026-06-30T12:00:00Z'),
    );
    expect(items[0]?.task_id).toBe('t1');
    expect(items[0]?.severity_score).toBeGreaterThan(items[1]?.severity_score ?? 0);
  });
});

describe('Floor plays — internal card pipeline', () => {
  it('plans Play 1 + Play 3 internal cards', () => {
    const planned = planInternalPlays({
      agency_workspace_id: '00000000-0000-4000-8000-000000000001',
      dayKey: '2026-07-01',
      policies: [
        {
          policy_id: 'p-lapsed',
          account_id: 'a1',
          policy_number: 'PN-LAP',
          in_force: false,
          premium: 500,
          cgl_details: null,
          bap_details: null,
          evaluated_at: '2026-07-01T00:00:00Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          title: 'Call client back',
          assignee_id: 'u1',
          due_at: '2026-06-28T12:00:00Z',
          priority: 'high',
          status: 'pending',
          account_id: 'a1',
        },
      ],
    });

    expect(planned.plans.length).toBeGreaterThanOrEqual(2);
    expect(planned.plans.some((p) => p.play_id === 'carrier.reconcile')).toBe(true);
    expect(planned.plans.some((p) => p.play_id === 'suspense.sweep')).toBe(true);
    expect(planned.plans.every((p) => p.idempotency_key.includes('2026-07-01'))).toBe(true);
  });

  it('persists internal play cards with idempotency', async () => {
    const inserted: string[] = [];
    const db = {
      insertWorkRequest: vi.fn(async () => ({ id: 'wr-1' })),
      findExistingWorkRequest: vi.fn(async () => null),
      findPackageId: vi.fn(async () => true),
      insertDecisionPackage: vi.fn(async () => ({ id: 'pkg-1', work_request_id: 'wr-1' })),
      linkWorkRequestPackage: vi.fn(async () => {}),
      insertWorkRequestEvent: vi.fn(async () => {}),
    };

    const planned = planInternalPlays({
      agency_workspace_id: '00000000-0000-4000-8000-000000000001',
      dayKey: '2026-07-01',
      policies: [
        {
          policy_id: 'p-lapsed',
          account_id: 'a1',
          policy_number: 'PN-LAP',
          in_force: false,
          premium: 500,
          cgl_details: null,
          bap_details: null,
          evaluated_at: '2026-07-01T00:00:00Z',
        },
      ],
      tasks: [],
      play3Limit: 0,
    });

    const result = await persistInternalPlayCards(db, '00000000-0000-4000-8000-000000000001', planned.plans);
    expect(result.created).toBe(1);
    expect(result.package_refs[0]).toMatch(/^package:/);
    expect(db.insertWorkRequest).toHaveBeenCalled();
    inserted.push(...result.package_refs);
    expect(inserted.length).toBe(1);
  });
});

describe('Floor spine — internal send allowlist (Phase 2)', () => {
  it('treats Phase 1 stub recipient as non-tier-3', () => {
    expect(isStubInternalSendSpec('[INTERNAL_ONLY]')).toBe(true);
    expect(
      isTier3SendSpec({
        channel: 'email',
        recipient: '[INTERNAL_ONLY]',
        recipient_basis: 'account_of_record',
        authorized_rep_of_record: 'Tori Hill',
        payload: goldenSendCOIEmailPayload,
      }),
    ).toBe(false);
  });

  it('blocks recipients outside the internal allowlist', async () => {
    const guard = createInternalRecipientGuard(parseInternalSendAllowlist('brian@lewisinsurance.ai'));
    await expect(guard('client@example.invalid')).rejects.toThrow(/not on the internal send allowlist/);
    await expect(guard('brian@lewisinsurance.ai')).resolves.toBeUndefined();
  });

  it('stages tier-3 approve into held state without invoking send', async () => {
    const sendSpec = {
      channel: 'email' as const,
      recipient: 'brian@lewisinsurance.ai',
      recipient_basis: 'approved_holder' as const,
      authorized_rep_of_record: 'Tori Hill',
      payload: {
        ...goldenSendCOIEmailPayload,
        to: 'brian@lewisinsurance.ai',
      },
    };

    const invokeSendCOIEmail = vi.fn();
    const result = await maybeStageClientSendOnApprove({
      workRequestId: 'wr-tier3',
      approverId: 'user-1',
      sendSpec,
      allowlistRaw: 'brian@lewisinsurance.ai',
      db: {
        findFloorSendApproval: async () => null,
        insertFloorSendApproval: async (row) => ({
          id: 'appr-tier3',
          work_request_id: row.work_request_id,
          approver_id: row.approver_id,
          status: 'approved',
          hold_until: null,
          recipient: row.recipient,
          recipient_basis: row.recipient_basis,
          send_payload: row.send_payload,
          created_at: new Date().toISOString(),
        }),
      },
      stageDeps: {
        now: () => new Date('2026-07-01T12:00:00Z'),
        invokeSendCOIEmail,
        logEmail: async () => {},
      },
    });

    expect(result).toEqual({ staged: true, status: 'held', approvalId: 'appr-tier3' });
    expect(invokeSendCOIEmail).not.toHaveBeenCalled();
  });

  it('skips staging for Phase 1 internal-only packages', async () => {
    const result = await maybeStageClientSendOnApprove({
      workRequestId: 'wr-internal',
      approverId: 'user-1',
      sendSpec: {
        channel: 'email',
        recipient: '[INTERNAL_ONLY]',
        recipient_basis: 'account_of_record',
        authorized_rep_of_record: '[INTERNAL_ONLY]',
        payload: goldenSendCOIEmailPayload,
      },
      allowlistRaw: 'brian@lewisinsurance.ai',
      db: {
        findFloorSendApproval: async () => null,
        insertFloorSendApproval: async () => {
          throw new Error('should not insert');
        },
      },
      stageDeps: {
        now: () => new Date(),
        invokeSendCOIEmail: async () => ({ success: false }),
        logEmail: async () => {},
      },
    });

    expect(result).toEqual({ staged: false, reason: 'internal_only' });
  });

  it('mints opaque floor_action tokens', () => {
    const token = mintFloorActionToken();
    expect(isFloorActionApprovalRef(token)).toBe(true);
    expect(token).toMatch(/^floor_action:[a-f0-9]{32}$/);
  });
});
