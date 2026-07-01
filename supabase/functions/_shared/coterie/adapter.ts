/**
 * CoterieAdapter — first concrete `CommercialCarrierAdapter` implementation.
 *
 * Responsibilities:
 *   - createQuote: map intake -> Coterie request -> client -> normalized result,
 *     with in-memory idempotency and structured (redacted) audit emission.
 *   - checkAppetite: deterministic, explainable pre-screen.
 *   - retrieveQuote: in-memory lookup of a previously created mock quote.
 *   - prepareBind: HARD-GATED packet assembly. Refuses unless binding is enabled
 *     AND an approved ApprovalGate is supplied. Never sends anything.
 *
 * Pure-ish: the only side effects are the injected audit sink and the in-memory
 * maps. No Deno/Node globals are referenced at module scope, so Vitest can
 * import and exercise this directly.
 */

import type {
  AppetiteResult,
  ApprovalGate,
  AuditEvent,
  BindPacket,
  BindPreparationInput,
  CommercialCarrierAdapter,
  CommercialLine,
  CommercialQuoteInput,
  CommercialRiskIntake,
  QuoteResult,
} from '../carrier-adapter/types.ts';
import { CoterieClient, redactForLog } from './client.ts';
import {
  COTERIE_DISPLAY_NAME,
  mapCoterieQuoteResponseToResult,
  mapIntakeToCoterieQuoteRequest,
  type RawCoterieQuoteResponse,
} from './mappers.ts';

const SUPPORTED_LINES: CommercialLine[] = ['BOP', 'GL', 'PL'];

/** States where Coterie does not currently write commercial business (modeled). */
const UNSUPPORTED_STATES = new Set(['AK', 'HI']);

/** Documented Coterie minimum annual payroll. */
const MIN_ANNUAL_PAYROLL = 1000;

export type AuditSink = (event: AuditEvent) => void | Promise<void>;

export interface CoterieAdapterConfig {
  client?: CoterieClient;
  /** Mirrors COTERIE_BIND_ENABLED. Default false — prepareBind refuses while false. */
  bindEnabled?: boolean;
  /** Identity recorded on audit events / approval requests. */
  actor?: string;
  agencyExternalId?: string;
  producerExternalId?: string;
  /** Receives already-redacted audit events. Injected by the edge function to persist. */
  onAudit?: AuditSink;
  /**
   * Receives the raw carrier response (for persistence as `raw_response`). Fires
   * only on a fresh carrier call — never on an idempotency cache hit.
   */
  onRawResponse?: (raw: RawCoterieQuoteResponse) => void | Promise<void>;
  /** Idempotency cache (key -> result). Injectable for testing/persistence bridging. */
  idempotencyStore?: Map<string, QuoteResult>;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Derive coarse, human-readable risk flags for the approval summary. */
export function deriveRiskFlags(
  input: CommercialQuoteInput,
  result: QuoteResult,
): string[] {
  const flags: string[] = [];
  if (result.status === 'declined') flags.push('carrier_declined');
  if (result.status === 'error') flags.push('quote_error');
  if (result.isEstimate) flags.push('premium_is_estimate');
  if ((input.previousLosses?.length ?? 0) > 0) flags.push('prior_losses_reported');
  if (typeof result.premium === 'number' && result.premium >= 10000) flags.push('high_premium');
  if ((input.lines?.length ?? 0) > 1) flags.push('multi_line');
  return flags;
}

export function summarizeQuoteForApproval(
  input: CommercialQuoteInput,
  result: QuoteResult,
): string {
  const lines = input.lines.join(', ');
  if (result.status === 'quoted') {
    const premium =
      typeof result.premium === 'number' ? `$${result.premium.toFixed(2)}/yr` : 'n/a';
    return `Coterie ${lines} quote for "${input.businessName}" — ${premium} (${result.isEstimate ? 'estimate' : 'firm'}). Needs human review before any client-facing action.`;
  }
  if (result.status === 'declined') {
    return `Coterie DECLINED ${lines} for "${input.businessName}". Review declination reasons before responding to the client.`;
  }
  return `Coterie ${lines} quote for "${input.businessName}" returned ${result.status}. Review before any further action.`;
}

/** Build a fresh pending approval gate for a quote/proposal/bind entity. */
export function buildPendingApprovalGate(params: {
  id: string;
  entityType: ApprovalGate['entityType'];
  entityId: string;
  requestedBy: string;
  assignedTo?: string;
  summary: string;
  riskFlags?: string[];
  auditTrail?: AuditEvent[];
}): ApprovalGate {
  return {
    id: params.id,
    entityType: params.entityType,
    entityId: params.entityId,
    requestedBy: params.requestedBy,
    assignedTo: params.assignedTo,
    status: 'pending',
    summary: params.summary,
    riskFlags: params.riskFlags ?? [],
    auditTrail: params.auditTrail ?? [],
  };
}

export class CoterieAdapter implements CommercialCarrierAdapter {
  readonly id = 'coterie';
  readonly displayName = COTERIE_DISPLAY_NAME;

  private readonly client: CoterieClient;
  private readonly bindEnabled: boolean;
  private readonly actor: string;
  private readonly agencyExternalId?: string;
  private readonly producerExternalId?: string;
  private readonly onAudit?: AuditSink;
  private readonly onRawResponse?: (raw: RawCoterieQuoteResponse) => void | Promise<void>;
  private readonly idempotencyStore: Map<string, QuoteResult>;
  private readonly quotesByExternalId = new Map<string, QuoteResult>();

  constructor(config: CoterieAdapterConfig = {}) {
    this.client = config.client ?? new CoterieClient({ mock: true });
    this.bindEnabled = config.bindEnabled ?? false;
    this.actor = config.actor ?? 'system';
    this.agencyExternalId = config.agencyExternalId;
    this.producerExternalId = config.producerExternalId;
    this.onAudit = config.onAudit;
    this.onRawResponse = config.onRawResponse;
    this.idempotencyStore = config.idempotencyStore ?? new Map<string, QuoteResult>();
  }

  private async emitAudit(
    eventType: string,
    entityId: string,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.onAudit) return;
    const event: AuditEvent = {
      at: nowIso(),
      actor: this.actor,
      eventType,
      // Redact every audit detail before it leaves the adapter.
      detail: detail ? (redactForLog({ entityId, ...detail }) as Record<string, unknown>) : { entityId },
    };
    await this.onAudit(event);
  }

  async checkAppetite(input: CommercialRiskIntake): Promise<AppetiteResult> {
    const supportedLines = input.lines.filter((l) => SUPPORTED_LINES.includes(l));
    const unsupportedLines = input.lines.filter((l) => !SUPPORTED_LINES.includes(l));
    const reasons: string[] = [];
    let eligible = true;

    if (supportedLines.length === 0) {
      eligible = false;
      reasons.push('No Coterie-supported lines requested (BOP, GL, PL).');
    }
    if (unsupportedLines.length > 0) {
      reasons.push(`Unsupported line(s): ${unsupportedLines.join(', ')}.`);
    }
    if (input.state && UNSUPPORTED_STATES.has(input.state.toUpperCase())) {
      eligible = false;
      reasons.push(`Coterie does not currently write commercial business in ${input.state}.`);
    }
    if (typeof input.annualPayroll === 'number' && input.annualPayroll < MIN_ANNUAL_PAYROLL) {
      eligible = false;
      reasons.push(`Annual payroll is below the program minimum of ${MIN_ANNUAL_PAYROLL}.`);
    }
    if (eligible && reasons.length === 0) {
      reasons.push('Risk appears to be within Coterie appetite for the requested lines.');
    }

    return {
      eligible,
      carrier: this.displayName,
      supportedLines,
      unsupportedLines,
      reasons,
    };
  }

  async createQuote(input: CommercialQuoteInput): Promise<QuoteResult> {
    // Idempotency: identical key returns the first result without re-calling the carrier.
    if (input.idempotencyKey && this.idempotencyStore.has(input.idempotencyKey)) {
      const cached = this.idempotencyStore.get(input.idempotencyKey)!;
      await this.emitAudit('quote_idempotent_hit', cached.externalId ?? input.accountId, {
        idempotencyKey: input.idempotencyKey,
      });
      return deepClone(cached);
    }

    await this.emitAudit('intake_created', input.accountId, {
      lines: input.lines,
      businessName: input.businessName,
    });

    const request = mapIntakeToCoterieQuoteRequest({
      ...input,
      agencyExternalId: input.agencyExternalId ?? this.agencyExternalId,
      producerExternalId: input.producerExternalId ?? this.producerExternalId,
    });

    const rawResponse = await this.client.createQuote(request);
    if (this.onRawResponse) {
      await this.onRawResponse(rawResponse);
    }
    const result = mapCoterieQuoteResponseToResult(rawResponse);

    if (result.externalId) {
      this.quotesByExternalId.set(result.externalId, result);
    }
    if (input.idempotencyKey) {
      this.idempotencyStore.set(input.idempotencyKey, result);
    }

    await this.emitAudit('quote_created', result.externalId ?? input.accountId, {
      decision: result.status,
      premium: result.premium,
      carrier: result.carrier,
    });

    // Every quote requires a named-human approval before any client-facing use.
    await this.emitAudit('approval_requested', result.externalId ?? input.accountId, {
      decision: result.status,
      riskFlags: deriveRiskFlags(input, result),
    });

    return result;
  }

  async retrieveQuote(quoteId: string): Promise<QuoteResult> {
    const byExternal = this.quotesByExternalId.get(quoteId);
    if (byExternal) return deepClone(byExternal);

    for (const result of this.quotesByExternalId.values()) {
      if (result.lineQuotes.some((lq) => lq.quoteId === quoteId)) {
        return deepClone(result);
      }
    }

    return {
      status: 'error',
      carrier: this.displayName,
      lineQuotes: [],
      disclosures: [],
      errors: [`Quote ${quoteId} not found in mock store.`],
    };
  }

  /**
   * Assemble (NEVER send) a bind packet. Double-gated:
   *   1. Binding must be enabled (COTERIE_BIND_ENABLED).
   *   2. An APPROVED ApprovalGate for the bind must be supplied.
   * Phase 1 leaves binding disabled, so this always refuses.
   */
  async prepareBind(input: BindPreparationInput): Promise<BindPacket> {
    if (!this.bindEnabled) {
      throw new Error(
        'Coterie bind is disabled (COTERIE_BIND_ENABLED=false). Phase 1 does not permit binding.',
      );
    }

    const gate = input.approvalGate;
    if (!gate || gate.status !== 'approved') {
      throw new Error(
        'prepareBind requires an APPROVED ApprovalGate. No bind packet may be assembled without explicit human approval.',
      );
    }
    if (gate.entityType !== 'bind') {
      throw new Error(
        `prepareBind requires a gate with entityType 'bind' (received '${gate.entityType}').`,
      );
    }
    if (!gate.approvedBy) {
      throw new Error('prepareBind requires the approving user to be recorded on the gate.');
    }

    const packet: BindPacket = {
      carrier: this.displayName,
      quoteId: input.quoteId,
      request: {
        tokenizedPaymentID: input.tokenizedPaymentId,
        paymentInterval: input.paymentInterval ?? 'None',
        agencyExternalId: input.agencyExternalId ?? this.agencyExternalId,
      },
      approvalGateId: gate.id,
      preparedBy: input.preparedBy,
      preparedAt: nowIso(),
      executed: false,
      notice:
        'Bind packet assembled for review only. No carrier call, no payment, and no policy issuance occurred (Phase 1 guardrail).',
    };

    await this.emitAudit('bind_packet_prepared', input.quoteId, {
      approvalGateId: gate.id,
      paymentInterval: packet.request.paymentInterval,
    });

    return packet;
  }
}
