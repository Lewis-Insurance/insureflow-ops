import { describe, it, expect } from 'vitest';
import {
  ALLOWED_QUOTE_ROLES,
  accountWorkspaceId,
  buildReplayQuoteResult,
  classifyWriteResult,
  evaluateIdempotentReplay,
  isAllowedQuoteRole,
  isUniqueViolation,
  serializeQuoteResult,
  shouldEmitLifecycleAudit,
} from '../../../supabase/functions/_shared/coterie/quote-service.ts';
import type { RawCoterieQuoteResponse } from '../../../supabase/functions/_shared/coterie/mappers.ts';
import quoteSuccess from '../../../supabase/functions/_shared/coterie/fixtures/quote-success.json';
import quoteDecline from '../../../supabase/functions/_shared/coterie/fixtures/quote-decline.json';

describe('tenant + role gating helpers', () => {
  it('fails closed on a null/blank agency workspace (HIGH-1)', () => {
    expect(accountWorkspaceId({ id: 'a', agency_workspace_id: null })).toBeNull();
    expect(accountWorkspaceId({ id: 'a', agency_workspace_id: '' })).toBeNull();
    expect(accountWorkspaceId(null)).toBeNull();
    expect(accountWorkspaceId(undefined)).toBeNull();
    expect(accountWorkspaceId({ id: 'a', agency_workspace_id: 'ws-1' })).toBe('ws-1');
  });

  it('limits quote creation to the roles RLS allows on gates (MEDIUM-5)', () => {
    for (const role of ALLOWED_QUOTE_ROLES) {
      expect(isAllowedQuoteRole(role)).toBe(true);
    }
    // Broader staff roles must NOT be able to create a quote (avoids the dead-end
    // where a user can create a quote but can never approve/deny its gate).
    expect(isAllowedQuoteRole('staff')).toBe(false);
    expect(isAllowedQuoteRole('accounting')).toBe(false);
    expect(isAllowedQuoteRole(null)).toBe(false);
    expect(isAllowedQuoteRole(undefined)).toBe(false);
  });
});

describe('evaluateIdempotentReplay', () => {
  it('returns "fresh" when there is no prior session', () => {
    expect(evaluateIdempotentReplay({ session: null })).toBe('fresh');
    expect(evaluateIdempotentReplay({})).toBe('fresh');
  });

  it('returns "complete" only when session + quote + gate all exist', () => {
    expect(
      evaluateIdempotentReplay({ session: { id: 's' }, quote: { id: 'q' }, gate: { id: 'g' } }),
    ).toBe('complete');
  });

  it('returns "heal" (NOT complete) on a partial write so success is never falsely reported (HIGH-2)', () => {
    // Session created but quote+gate never written.
    expect(evaluateIdempotentReplay({ session: { id: 's' }, quote: null, gate: null })).toBe('heal');
    // Quote written but gate insert failed.
    expect(evaluateIdempotentReplay({ session: { id: 's' }, quote: { id: 'q' }, gate: null })).toBe(
      'heal',
    );
  });
});

describe('buildReplayQuoteResult + serializeQuoteResult (full replay fidelity — MEDIUM-6)', () => {
  it('reconstructs the full quoted result from the stored raw_response', () => {
    const result = buildReplayQuoteResult({
      id: 'row-1',
      raw_response: quoteSuccess as unknown as RawCoterieQuoteResponse,
    });
    const serialized = serializeQuoteResult(result);
    expect(serialized.status).toBe('quoted');
    expect(serialized.premium).toBe(1284);
    expect(serialized.monthlyPremium).toBe(107);
    expect(serialized.totalYearlyFees).toBe(36);
    expect(serialized.isEstimate).toBe(true);
    expect(serialized.lineQuotes).toHaveLength(2);
    expect(serialized.disclosures.join(' ')).toContain('MOCK quote');
  });

  it('preserves declinations / errors / warnings on replay (previously dropped)', () => {
    const result = buildReplayQuoteResult({
      id: 'row-2',
      decision: 'declined',
      raw_response: quoteDecline as unknown as RawCoterieQuoteResponse,
    });
    const serialized = serializeQuoteResult(result);
    expect(serialized.status).toBe('declined');
    expect(serialized.declinations?.[0].policyType).toBe('BOP');
    expect(serialized.declinations?.[0].reasons.length).toBeGreaterThanOrEqual(2);
    expect((serialized.errors ?? []).length).toBeGreaterThan(0);
    expect(serialized.underwritingId).toBe('mock-uw-decline-001');
  });

  it('falls back to the flat columns when raw_response is absent', () => {
    const result = buildReplayQuoteResult({
      id: 'row-3',
      decision: 'quoted',
      carrier: 'Coterie Insurance',
      external_id: 'ext-9',
      premium: 999,
      monthly_premium: 90,
      line_quotes: [],
      proposal_url: null,
      raw_response: null,
    });
    expect(result.status).toBe('quoted');
    expect(result.carrier).toBe('Coterie Insurance');
    expect(result.externalId).toBe('ext-9');
    expect(result.premium).toBe(999);
    expect(result.monthlyPremium).toBe(90);
  });
});

describe('isUniqueViolation (idempotency race dedupe — MEDIUM-3)', () => {
  it('detects Postgres unique violations by SQLSTATE 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('detects them by message / details text', () => {
    expect(
      isUniqueViolation({ message: 'duplicate key value violates unique constraint "idx"' }),
    ).toBe(true);
    expect(isUniqueViolation({ details: 'duplicate key value found' })).toBe(true);
    expect(isUniqueViolation({ message: 'violates unique constraint' })).toBe(true);
  });

  it('is false for unrelated errors and non-objects', () => {
    expect(isUniqueViolation({ code: '23503', message: 'foreign key violation' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('boom')).toBe(false);
  });
});

describe('classifyWriteResult (quote/gate insert race handling — B2)', () => {
  it('returns "inserted" when the row was created by this request', () => {
    expect(classifyWriteResult({ error: null, data: { id: 'q-1' } })).toBe('inserted');
  });

  it('returns "adopt-on-conflict" on a unique violation (concurrent winner)', () => {
    // A concurrent request already created the quote/gate (one active quote per
    // session; one gate per entity) — adopt it instead of duplicating or 500-ing.
    expect(classifyWriteResult({ error: { code: '23505' }, data: null })).toBe('adopt-on-conflict');
    expect(
      classifyWriteResult({
        error: { message: 'duplicate key value violates unique constraint "uq_carrier_gates_entity"' },
        data: null,
      }),
    ).toBe('adopt-on-conflict');
  });

  it('returns "fail" for a genuine (non-unique) error', () => {
    expect(classifyWriteResult({ error: { code: '23503' }, data: null })).toBe('fail');
    expect(classifyWriteResult({ error: { message: 'permission denied' }, data: null })).toBe(
      'fail',
    );
  });
});

describe('shouldEmitLifecycleAudit (audit idempotency — B3)', () => {
  it('emits the standard lifecycle batch ONLY when this request inserted the quote', () => {
    expect(shouldEmitLifecycleAudit(true)).toBe(true);
  });

  it('does NOT re-emit the batch on a heal/adopt of an existing quote', () => {
    // A retry, or a concurrent loser of the quote-insert race, must never
    // multiply the intake/quote/approval trail — a distinct heal marker is used.
    expect(shouldEmitLifecycleAudit(false)).toBe(false);
  });
});
