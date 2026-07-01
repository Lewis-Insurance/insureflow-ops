import { describe, it, expect } from 'vitest';
import { CoterieAdapter } from '../../../supabase/functions/_shared/coterie/adapter.ts';
import { CoterieClient } from '../../../supabase/functions/_shared/coterie/client.ts';
import type {
  ApprovalGate,
  BindPreparationInput,
} from '../../../supabase/functions/_shared/carrier-adapter/types.ts';

function makeBindGate(overrides: Partial<ApprovalGate> = {}): ApprovalGate {
  return {
    id: 'gate-1',
    entityType: 'bind',
    entityId: 'quote-1',
    requestedBy: 'user-1',
    status: 'approved',
    approvedBy: 'manager-1',
    approvedAt: new Date().toISOString(),
    summary: 'Approve bind for quote-1',
    riskFlags: [],
    auditTrail: [],
    ...overrides,
  };
}

function makeBindInput(overrides: Partial<BindPreparationInput> = {}): BindPreparationInput {
  return {
    quoteId: 'quote-1',
    accountId: 'acc-1',
    preparedBy: 'user-1',
    paymentInterval: 'Monthly',
    tokenizedPaymentId: 'tok_secret',
    ...overrides,
  };
}

function makeAdapter(bindEnabled: boolean): CoterieAdapter {
  return new CoterieAdapter({
    client: new CoterieClient({ mock: true }),
    bindEnabled,
  });
}

describe('CoterieAdapter.prepareBind guardrails', () => {
  it('refuses when no approval gate is supplied (even with binding enabled)', async () => {
    const adapter = makeAdapter(true);
    await expect(adapter.prepareBind(makeBindInput({ approvalGate: undefined }))).rejects.toThrow(
      /approved ApprovalGate/i,
    );
  });

  it('refuses when the gate is not approved', async () => {
    const adapter = makeAdapter(true);
    const pendingGate = makeBindGate({ status: 'pending', approvedBy: undefined });
    await expect(
      adapter.prepareBind(makeBindInput({ approvalGate: pendingGate })),
    ).rejects.toThrow(/approved ApprovalGate/i);
  });

  it('refuses when COTERIE_BIND_ENABLED is false, even with an approved gate', async () => {
    const adapter = makeAdapter(false); // binding disabled (Phase 1 default)
    await expect(
      adapter.prepareBind(makeBindInput({ approvalGate: makeBindGate() })),
    ).rejects.toThrow(/bind is disabled/i);
  });

  it('refuses an approved gate whose entityType is not "bind"', async () => {
    const adapter = makeAdapter(true);
    const wrongEntity = makeBindGate({ entityType: 'quote' });
    await expect(
      adapter.prepareBind(makeBindInput({ approvalGate: wrongEntity })),
    ).rejects.toThrow(/entityType 'bind'/i);
  });

  it('succeeds ONLY when binding is enabled AND an approved bind gate is supplied', async () => {
    const adapter = makeAdapter(true);
    const packet = await adapter.prepareBind(makeBindInput({ approvalGate: makeBindGate() }));

    expect(packet.executed).toBe(false); // hard guardrail: never executed
    expect(packet.carrier).toBe('Coterie Insurance');
    expect(packet.quoteId).toBe('quote-1');
    expect(packet.approvalGateId).toBe('gate-1');
    expect(packet.request.paymentInterval).toBe('Monthly');
    expect(packet.request.tokenizedPaymentID).toBe('tok_secret');
    expect(packet.notice).toMatch(/no carrier call/i);
  });
});
