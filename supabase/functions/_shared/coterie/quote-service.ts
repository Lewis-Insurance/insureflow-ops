/**
 * Coterie quote-service helpers (PURE — no Deno/Node, no DB, no network).
 *
 * Extracted from the `coterie-quote` edge function so its tenant, idempotency,
 * and response-shaping decisions are unit-testable in Vitest. The edge entry
 * point (`index.ts`) imports Deno-only URLs and therefore cannot be loaded by
 * Vitest; these helpers can, and `index.ts` simply orchestrates them around the
 * (untestable) database calls.
 *
 * This module intentionally only imports the pure mappers + the carrier-agnostic
 * domain types, so it stays importable from both the Deno edge runtime and Node.
 */

import type { QuoteResult } from '../carrier-adapter/types.ts';
import {
  COTERIE_DISPLAY_NAME,
  mapCoterieQuoteResponseToResult,
  type RawCoterieQuoteResponse,
} from './mappers.ts';

/**
 * Workspace-membership roles allowed to CREATE a Coterie quote.
 *
 * Kept in lockstep with the `carrier_approval_gates` RLS act-on-gate roles
 * (owner|admin|producer|csr). Because the quote-creator set is a subset of the
 * gate-actor set, no one can create a quote they could never approve/deny
 * (closes the MEDIUM-5 dead-end). This is deliberately NARROWER than the coarse
 * `is_staff` pre-check (which also admits e.g. accounting/staff profiles).
 */
export const ALLOWED_QUOTE_ROLES = ['owner', 'admin', 'producer', 'csr'] as const;

export function isAllowedQuoteRole(role?: string | null): boolean {
  return typeof role === 'string' && (ALLOWED_QUOTE_ROLES as readonly string[]).includes(role);
}

export interface AccountTenantRow {
  id?: string;
  agency_workspace_id?: string | null;
}

/**
 * Fail-closed tenant resolution. Phase 1 refuses to quote an account that is not
 * bound to an agency workspace: a null `agency_workspace_id` would otherwise let
 * the membership check be skipped entirely (HIGH-1). Returns the workspace id
 * when present, else `null` (caller must reject on null).
 */
export function accountWorkspaceId(account: AccountTenantRow | null | undefined): string | null {
  const id = account?.agency_workspace_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export interface ReplayInputs {
  session?: { id: string } | null;
  quote?: { id: string } | null;
  gate?: { id: string } | null;
}

export type ReplayStatus = 'fresh' | 'complete' | 'heal';

/**
 * Decide how to service a (possibly repeated) idempotent submission:
 *   - `fresh`    : no prior session for this key -> run the full create.
 *   - `complete` : session + quote + gate all exist -> return the stored result.
 *   - `heal`     : the session exists but the quote and/or gate is missing -> a
 *                  prior attempt died mid-write. Complete the missing inserts
 *                  rather than falsely reporting success with null ids (HIGH-2).
 */
export function evaluateIdempotentReplay(inputs: ReplayInputs): ReplayStatus {
  if (!inputs.session) return 'fresh';
  if (inputs.quote && inputs.gate) return 'complete';
  return 'heal';
}

export interface StoredQuoteRow {
  id?: string;
  decision?: string | null;
  carrier?: string | null;
  external_id?: string | null;
  premium?: number | null;
  monthly_premium?: number | null;
  line_quotes?: unknown;
  proposal_url?: string | null;
  raw_response?: RawCoterieQuoteResponse | null;
}

/**
 * Rebuild a FULL normalized result for an idempotent replay.
 *
 * Prefers the persisted raw carrier response so the replay keeps declinations,
 * errors, warnings, disclosures and `isEstimate` (MEDIUM-6) — the same fidelity
 * a fresh quote returns. Falls back to the flat columns only if the raw response
 * was not persisted.
 */
export function buildReplayQuoteResult(row: StoredQuoteRow | null | undefined): QuoteResult {
  if (row?.raw_response) {
    return mapCoterieQuoteResponseToResult(row.raw_response, { rawResponseRef: row.id });
  }
  return {
    status: (row?.decision as QuoteResult['status']) ?? 'error',
    carrier: row?.carrier ?? COTERIE_DISPLAY_NAME,
    externalId: row?.external_id ?? undefined,
    premium: row?.premium ?? undefined,
    monthlyPremium: row?.monthly_premium ?? undefined,
    lineQuotes: Array.isArray(row?.line_quotes)
      ? (row?.line_quotes as QuoteResult['lineQuotes'])
      : [],
    proposalUrl: row?.proposal_url ?? undefined,
    disclosures: [],
  };
}

/**
 * Single source of truth for the `result` block the edge function returns.
 * Shared by the fresh and the idempotent-replay paths so the two can never drift
 * (the replay path historically dropped fields — MEDIUM-6).
 */
export function serializeQuoteResult(result: QuoteResult) {
  return {
    status: result.status,
    carrier: result.carrier,
    externalId: result.externalId,
    premium: result.premium,
    monthlyPremium: result.monthlyPremium,
    totalYearlyFees: result.totalYearlyFees,
    totalYearlyOwed: result.totalYearlyOwed,
    isEstimate: result.isEstimate,
    fees: result.fees,
    lineQuotes: result.lineQuotes,
    proposalUrl: result.proposalUrl,
    applicationUrl: result.applicationUrl,
    disclosures: result.disclosures,
    declinations: result.declinations,
    errors: result.errors,
    warnings: result.warnings,
    underwritingId: result.underwritingId,
  };
}

/**
 * Postgres unique-violation (SQLSTATE 23505) detector. Used to dedupe a
 * concurrent idempotency race on the `(account_id, idempotency_key)` unique
 * index instead of surfacing a 500 to the losing request (MEDIUM-3).
 */
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code === '23505') return true;
  const haystack = [e.message, e.details]
    .map((v) => (typeof v === 'string' ? v.toLowerCase() : ''))
    .join(' ');
  return haystack.includes('duplicate key value') || haystack.includes('unique constraint');
}

/**
 * Outcome of a quote/gate insert under the uniqueness constraints added in
 * `20260701120000` (`uq_coterie_quotes_session_active`, one active quote per
 * session; `uq_carrier_gates_entity`, one gate per entity):
 *   - `inserted`          : this request created the row.
 *   - `adopt-on-conflict` : a concurrent writer won the unique index (SQLSTATE
 *                           23505) — re-read and ADOPT the existing row so we
 *                           never duplicate and never surface a 500 (B2).
 *   - `fail`              : a genuine error — surface it.
 */
export type WriteOutcome = 'inserted' | 'adopt-on-conflict' | 'fail';

/**
 * Classify a Supabase insert `{ data, error }` into a {@link WriteOutcome}. Pure
 * so the edge function's race-handling decision is unit-tested (the DB re-read
 * that resolves `adopt-on-conflict` to a concrete row id happens server-side).
 */
export function classifyWriteResult(result: {
  error?: unknown;
  data?: unknown;
}): WriteOutcome {
  if (!result.error && result.data) return 'inserted';
  if (isUniqueViolation(result.error)) return 'adopt-on-conflict';
  return 'fail';
}

/**
 * Audit idempotency (B3). The standard `intake_created` / `quote_created` /
 * `approval_requested` lifecycle batch is appended ONLY when THIS request
 * actually inserted the quote row. On a heal/adopt of an existing quote the
 * batch must NOT be re-appended (a single distinct heal marker is recorded
 * instead), so retries — and concurrent losers of the quote-insert race — can
 * never multiply the lifecycle trail.
 */
export function shouldEmitLifecycleAudit(quoteInsertedThisRequest: boolean): boolean {
  return quoteInsertedThisRequest === true;
}
