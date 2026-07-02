/**
 * CoterieClient — thin transport around the Coterie commercial quote API.
 *
 * PHASE 1 GUARDRAILS (enforced in code, not just comments):
 *   - Defaults to `mock: true`. In mock mode `createQuote` returns deep-cloned
 *     fixtures and NEVER touches the network (no `fetch`).
 *   - The live path is double-gated: it only runs when `mock === false` AND
 *     `allowLiveCalls === true`. Both are off by default, so a live Coterie call
 *     is impossible unless a future phase explicitly opts in.
 *   - `redactForLog` strips payment tokens, AKHash, FEIN, contact PII, mailing
 *     address, and financials, then runs remaining strings through `redactPII`.
 *
 * This module is imported by the Deno edge runtime and by Vitest. It therefore
 * keeps all Deno-specific access lazy (inside methods) — there are no top-level
 * `Deno.*` references — so Node/Vitest can import it safely.
 */

import { redactPII } from '../floorSafety.ts';
import { defaultCoterieFixtures, type CoterieFixtureSet } from './fixtures/index.ts';
import {
  COTERIE_DISPLAY_NAME,
  type CoterieBindableQuoteRequest,
  type RawCoterieQuoteResponse,
} from './mappers.ts';

export type CoterieMockScenario = 'success' | 'decline' | 'validation_error';

export interface CoterieClientLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

const NOOP_LOGGER: CoterieClientLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export interface CoterieClientConfig {
  /** Defaults to true. Mock mode returns fixtures and never calls the network. */
  mock?: boolean;
  /**
   * Extra explicit opt-in required (in addition to `mock === false`) before any
   * live HTTP call is attempted. Phase 1 leaves this false everywhere.
   */
  allowLiveCalls?: boolean;
  apiBase?: string;
  /** Publishable key — used for quote creation (header `Authorization: token <key>`). */
  publishableKey?: string;
  /** Secret key — reserved for bind in a later phase. Never logged. */
  secretKey?: string;
  fixtures?: CoterieFixtureSet;
  /** Force a specific mock scenario, bypassing request-based heuristics. */
  mockScenario?: CoterieMockScenario;
  logger?: CoterieClientLogger;
}

/**
 * Sensitive request/response keys removed entirely before logging.
 * Comparison is case-insensitive.
 */
const SENSITIVE_KEYS = new Set(
  [
    'tokenizedPaymentID',
    'tokenizedPaymentId',
    'AKHash',
    'FEIN',
    'fein',
    // Contact identity (both the flattened Coterie keys and the nested intake keys).
    'contactFirstName',
    'contactLastName',
    'firstName',
    'lastName',
    'contactEmail',
    'contactPhone',
    'email',
    'phone',
    // Mailing address (flattened Coterie keys).
    'mailingAddress',
    'mailingAddressStreet',
    'mailingAddressCity',
    'mailingAddressState',
    'mailingAddressZip',
    // Physical address parts — covers nested `locations[]` and the intake's
    // `mailingAddress` object alike (a precise street/city/state/zip locates a
    // business and must never reach logs).
    'street',
    'city',
    'state',
    'zip',
    'annualPayroll',
    'grossAnnualSales',
    'ssn',
  ].map((k) => k.toLowerCase()),
);

const REDACTED = '[REDACTED]';

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = REDACTED;
      } else {
        out[key] = sanitizeForLog(val);
      }
    }
    return out;
  }
  if (typeof value === 'string') {
    return redactPII(value).redacted;
  }
  return value;
}

/**
 * Produce a log-safe copy of any Coterie payload: sensitive keys are dropped and
 * all remaining free-text strings are run through the shared PII redactor.
 */
export function redactForLog(payload: unknown): unknown {
  return sanitizeForLog(payload);
}

const COTERIE_DEFAULT_SANDBOX_BASE = 'https://api-sandbox.coterieinsurance.com/v1.6/commercial';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Heuristic mock scenario selection driven by the (already mapped) request. */
function inferScenario(request: CoterieBindableQuoteRequest): CoterieMockScenario {
  const name = `${request.businessName ?? ''} ${request.legalBusinessName ?? ''}`.toLowerCase();

  if (name.includes('decline') || name.includes('declined')) {
    return 'decline';
  }
  if (name.includes('invalid') || name.includes('error')) {
    return 'validation_error';
  }
  // Mirror a common Coterie validation rule: payroll below the documented minimum.
  if (typeof request.annualPayroll === 'number' && request.annualPayroll < 1000) {
    return 'validation_error';
  }
  // BPP limits only make sense for BOP; a GL-only request with bppLimit is invalid.
  const glOnly =
    request.applicationTypes.length === 1 && request.applicationTypes[0] === 'GL';
  const hasBpp = (request.locations ?? []).some((loc) => loc.bppLimit !== undefined);
  if (glOnly && hasBpp) {
    return 'validation_error';
  }
  return 'success';
}

export class CoterieClient {
  readonly id = 'coterie';
  readonly displayName = COTERIE_DISPLAY_NAME;

  private readonly mock: boolean;
  private readonly allowLiveCalls: boolean;
  private readonly apiBase: string;
  private readonly publishableKey?: string;
  private readonly secretKey?: string;
  private readonly fixtures: CoterieFixtureSet;
  private readonly forcedScenario?: CoterieMockScenario;
  private readonly logger: CoterieClientLogger;

  constructor(config: CoterieClientConfig = {}) {
    this.mock = config.mock ?? true;
    this.allowLiveCalls = config.allowLiveCalls ?? false;
    this.apiBase = config.apiBase ?? COTERIE_DEFAULT_SANDBOX_BASE;
    this.publishableKey = config.publishableKey;
    this.secretKey = config.secretKey;
    this.fixtures = config.fixtures ?? defaultCoterieFixtures;
    this.forcedScenario = config.mockScenario;
    this.logger = config.logger ?? NOOP_LOGGER;
  }

  get isMock(): boolean {
    return this.mock;
  }

  /** Log-safe view of a payload (sensitive keys stripped + PII redacted). */
  redactForLog(payload: unknown): unknown {
    return redactForLog(payload);
  }

  private fixtureForScenario(scenario: CoterieMockScenario): RawCoterieQuoteResponse {
    switch (scenario) {
      case 'decline':
        return this.fixtures.decline;
      case 'validation_error':
        return this.fixtures.validationError;
      case 'success':
      default:
        return this.fixtures.success;
    }
  }

  /**
   * Create a bindable quote. In mock mode (Phase 1 default) this resolves a
   * fixture and returns a deep clone — the network is never touched.
   */
  async createQuote(request: CoterieBindableQuoteRequest): Promise<RawCoterieQuoteResponse> {
    if (this.mock) {
      const scenario = this.forcedScenario ?? inferScenario(request);
      this.logger.info('Coterie mock createQuote', {
        scenario,
        request: this.redactForLog(request),
      });
      return deepClone(this.fixtureForScenario(scenario));
    }

    return this.createQuoteLive(request);
  }

  /**
   * LIVE Coterie quote creation. Intentionally unreachable in Phase 1: it throws
   * unless live calls have been explicitly enabled. Kept here so the contract is
   * documented and so enabling a later phase is a config change, not a rewrite.
   */
  private async createQuoteLive(
    request: CoterieBindableQuoteRequest,
  ): Promise<RawCoterieQuoteResponse> {
    if (!this.allowLiveCalls) {
      throw new Error(
        'Coterie live calls are disabled (Phase 1 mock-only guardrail). ' +
          'Set mock=false AND allowLiveCalls=true to enable in a later phase.',
      );
    }
    if (!this.publishableKey) {
      throw new Error('Coterie publishable key is required for live quote calls.');
    }

    const url = `${this.apiBase}/quotes/bindable`;
    this.logger.warn('Coterie LIVE createQuote', {
      url,
      request: this.redactForLog(request),
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `token ${this.publishableKey}`,
      },
      body: JSON.stringify(request),
    });

    const text = await response.text();
    let parsed: RawCoterieQuoteResponse;
    try {
      parsed = JSON.parse(text) as RawCoterieQuoteResponse;
    } catch {
      parsed = { isSuccess: false, errors: [`Non-JSON response (status ${response.status})`] };
    }
    return parsed;
  }
}
