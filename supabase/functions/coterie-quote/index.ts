// ============================================================================
// COTERIE QUOTE (Phase 1 — MOCK, credential-free vertical slice)
// ============================================================================
// Staff-only endpoint that produces a normalized commercial quote for an
// existing account using the Coterie adapter in MOCK mode (fixtures only).
//
// HARD GUARDRAILS (enforced in code):
//   - MOCK ONLY. No live Coterie API calls. The client is created with
//     allowLiveCalls=false, so even mock=false cannot reach the network.
//   - No bind, no client-facing send, no payment. A 'pending' approval gate is
//     created for human review; nothing leaves the agency.
//   - Only redacted payloads are logged; raw responses are persisted, not logged.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  createErrorResponse,
} from '../_shared/error-handler.ts';
import { getEnvOrDefault } from '../_shared/env-validator.ts';
import type {
  AuditEvent,
  CommercialLine,
  CommercialQuoteInput,
} from '../_shared/carrier-adapter/types.ts';
import { CoterieClient } from '../_shared/coterie/client.ts';
import {
  CoterieAdapter,
  buildPendingApprovalGate,
  deriveRiskFlags,
  summarizeQuoteForApproval,
} from '../_shared/coterie/adapter.ts';
import { mapIntakeToCoterieQuoteRequest } from '../_shared/coterie/mappers.ts';
import {
  accountWorkspaceId,
  buildReplayQuoteResult,
  classifyWriteResult,
  evaluateIdempotentReplay,
  isAllowedQuoteRole,
  isUniqueViolation,
  serializeQuoteResult,
  shouldEmitLifecycleAudit,
} from '../_shared/coterie/quote-service.ts';

const logger = createLogger('coterie-quote');

const ALLOWED_LINES: CommercialLine[] = ['BOP', 'GL', 'PL'];
const ALLOWED_LOCATION_TYPES = ['Home', 'BuildingLeased', 'BuildingOwned'];
/**
 * Coarse staff PRE-check only (profile-level). The AUTHORITATIVE authorization
 * is the caller's agency_workspace_memberships.role (see `isAllowedQuoteRole`),
 * which keeps the quote-creator set a subset of the gate-actor set.
 */
const STAFF_ROLES = ['owner', 'admin', 'producer', 'csr', 'staff', 'accounting'];

interface CoterieQuoteRequestBody {
  accountId?: string;
  lines?: string[];
  businessName?: string;
  legalBusinessName?: string;
  businessStartDate?: string;
  glLimit?: number;
  glAggregateLimit?: number;
  annualPayroll?: number;
  grossAnnualSales?: number;
  numEmployees?: number;
  contact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  mailingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  locations?: Array<Record<string, unknown>>;
  /** Optional override for the location type derived from the mailing address. */
  locationType?: string;
  previousLosses?: Array<{ amount?: number; description?: string; date?: string }>;
  idempotencyKey?: string;
}

/** Merge CORS headers into the shared error response (which omits them). */
function corsError(error: unknown, corsHeaders: Record<string, string>): Response {
  const err = error instanceof Error ? error : new Error(String(error));
  const base = createErrorResponse(err);
  const headers = new Headers(base.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(base.body, { status: base.status, headers });
}

function jsonResponse(
  body: unknown,
  corsHeaders: Record<string, string>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validateIntake(body: CoterieQuoteRequestBody): CommercialQuoteInput {
  const errors: Record<string, string> = {};

  if (!body.accountId || typeof body.accountId !== 'string') {
    errors.accountId = 'accountId is required';
  }

  const lines = Array.isArray(body.lines) ? body.lines : [];
  const normalizedLines = lines
    .map((l) => String(l).toUpperCase())
    .filter((l): l is CommercialLine => (ALLOWED_LINES as string[]).includes(l));
  if (normalizedLines.length === 0) {
    errors.lines = 'At least one supported line is required (BOP, GL, PL)';
  }

  if (!body.businessName || typeof body.businessName !== 'string') {
    errors.businessName = 'businessName is required';
  }

  const contact = body.contact ?? {};
  if (!contact.firstName || !contact.lastName || !contact.email || !contact.phone) {
    errors.contact = 'contact firstName, lastName, email and phone are required';
  }

  const addr = body.mailingAddress ?? {};
  if (!addr.street || !addr.city || !addr.state || !addr.zip) {
    errors.mailingAddress = 'mailingAddress street, city, state and zip are required';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Invalid Coterie quote intake', errors);
  }

  return {
    accountId: body.accountId as string,
    lines: normalizedLines,
    businessName: body.businessName as string,
    legalBusinessName: body.legalBusinessName,
    businessStartDate: body.businessStartDate,
    glLimit: body.glLimit,
    glAggregateLimit: body.glAggregateLimit,
    annualPayroll: body.annualPayroll,
    grossAnnualSales: body.grossAnnualSales,
    numEmployees: body.numEmployees,
    contact: {
      firstName: contact.firstName as string,
      lastName: contact.lastName as string,
      email: contact.email as string,
      phone: contact.phone as string,
    },
    mailingAddress: {
      street: addr.street as string,
      city: addr.city as string,
      state: addr.state as string,
      zip: addr.zip as string,
    },
    locations: (body.locations ?? []) as CommercialQuoteInput['locations'],
    locationType:
      body.locationType && ALLOWED_LOCATION_TYPES.includes(body.locationType)
        ? (body.locationType as CommercialQuoteInput['locationType'])
        : undefined,
    previousLosses: (body.previousLosses ?? [])
      .filter((loss) => loss && typeof loss.amount === 'number')
      .map((loss) => ({
        amount: loss.amount as number,
        description: String(loss.description ?? ''),
        date: loss.date,
      })),
    idempotencyKey: body.idempotencyKey,
  };
}

function sessionStatusFromDecision(decision: string): string {
  switch (decision) {
    case 'quoted':
    case 'declined':
    case 'error':
    case 'referral':
      return decision;
    default:
      return 'error';
  }
}

/** Look up the (soft-delete-aware) session for an idempotency key. */
async function findSessionByIdempotencyKey(
  admin: SupabaseClient,
  accountId: string,
  idempotencyKey: string,
): Promise<{ id: string } | null> {
  const { data } = await admin
    .from('coterie_quote_sessions')
    .select('id')
    .eq('account_id', accountId)
    .eq('idempotency_key', idempotencyKey)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/** Load the (most recent) approval gate for a quote entity, if any. */
async function loadGateForQuote(
  admin: SupabaseClient,
  quoteId: string,
): Promise<{ id: string } | null> {
  const { data } = await admin
    .from('carrier_approval_gates')
    .select('id, status')
    .eq('entity_type', 'quote')
    .eq('entity_id', quoteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

/**
 * Load the latest non-deleted quote for a session and its approval gate (if the
 * quote exists). Used both for the idempotent fast path and to detect/heal a
 * partially-written prior attempt.
 */
async function loadSessionBundle(
  admin: SupabaseClient,
  sessionId: string,
): Promise<{ quote: Record<string, any> | null; gate: { id: string } | null }> {
  const { data: quote } = await admin
    .from('coterie_quotes')
    .select('*')
    .eq('session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let gate: { id: string } | null = null;
  if (quote) {
    gate = await loadGateForQuote(admin, (quote as { id: string }).id);
  }
  return { quote: (quote as Record<string, any> | null) ?? null, gate };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  const startTime = Date.now();

  try {
    logger.logRequest(req);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid Authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !serviceRoleKey) {
      throw new AppError('Server is not configured for Coterie quoting', 500, 'CONFIG_ERROR');
    }

    // User-scoped client (RLS-on) to identify + authorize the caller.
    const userClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Service-role client for writes (RLS bypass; tenant checks done explicitly below).
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new AuthenticationError('Invalid or expired token');
    }
    logger.setContext({ userId: user.id });

    // Staff authorization.
    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, is_staff')
      .eq('id', user.id)
      .maybeSingle();
    const isStaff = !!profile && (profile.is_staff === true || STAFF_ROLES.includes(profile.role));
    if (!isStaff) {
      throw new AuthorizationError('Staff access required for Coterie quoting');
    }

    const body = (await req.json().catch(() => {
      throw new ValidationError('Invalid JSON body');
    })) as CoterieQuoteRequestBody;

    const intake = validateIntake(body);

    // Resolve account + tenant; verify caller is an active member of the workspace.
    const { data: account, error: accountError } = await adminClient
      .from('accounts')
      .select('id, agency_workspace_id')
      .eq('id', intake.accountId)
      .is('deleted_at', null)
      .maybeSingle();
    if (accountError || !account) {
      throw new ValidationError('Account not found');
    }

    // Fail closed (HIGH-1): an account with no agency workspace cannot be
    // tenant-scoped, so refuse rather than skip the membership check (otherwise
    // any staff user could quote an orphaned account). No rows are written.
    const agencyWorkspaceId = accountWorkspaceId(account);
    if (!agencyWorkspaceId) {
      throw new AuthorizationError(
        'This account is not linked to an agency workspace and cannot be quoted.',
      );
    }

    // Authoritative authorization (MEDIUM-5): the caller must be an ACTIVE member
    // of the account's workspace AND hold a role allowed to act on the approval
    // gate (owner|admin|producer|csr). This makes the quote-creator set a subset
    // of the gate-actor set — matching the carrier_approval_gates RLS — so nobody
    // can create a quote they could never approve/deny.
    const { data: membership } = await adminClient
      .from('agency_workspace_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('agency_workspace_id', agencyWorkspaceId)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership || !isAllowedQuoteRole(membership.role)) {
      throw new AuthorizationError('You do not have access to this account');
    }

    // ---- Idempotency fast path --------------------------------------------
    // For a repeated key we reuse the first session. When that session already
    // has BOTH a quote and an approval gate we return the full stored result.
    // When it exists but is INCOMPLETE (a prior attempt died mid-write) we fall
    // through and complete the missing inserts ("heal") instead of falsely
    // reporting success with null ids (HIGH-2 / MEDIUM-6).
    let existingSession: { id: string } | null = null;
    let existingQuote: Record<string, any> | null = null;
    let existingGate: { id: string } | null = null;

    if (intake.idempotencyKey) {
      existingSession = await findSessionByIdempotencyKey(
        adminClient,
        intake.accountId,
        intake.idempotencyKey,
      );
      if (existingSession) {
        const bundle = await loadSessionBundle(adminClient, existingSession.id);
        existingQuote = bundle.quote;
        existingGate = bundle.gate;
        if (
          evaluateIdempotentReplay({
            session: existingSession,
            quote: existingQuote,
            gate: existingGate,
          }) === 'complete'
        ) {
          logger.info('Coterie quote idempotent hit (complete)', {
            sessionId: existingSession.id,
          });
          return jsonResponse(
            {
              success: true,
              idempotent: true,
              mock: true,
              sessionId: existingSession.id,
              quoteId: existingQuote!.id,
              approvalGateId: existingGate!.id,
              result: serializeQuoteResult(buildReplayQuoteResult(existingQuote)),
            },
            corsHeaders,
          );
        }
      }
    }

    // ---- Build the MOCK adapter (Phase 1: no live calls possible) ----
    const sandboxEnabled = getEnvOrDefault('COTERIE_SANDBOX_ENABLED', 'false') === 'true';
    const bindEnabled = getEnvOrDefault('COTERIE_BIND_ENABLED', 'false') === 'true';
    if (sandboxEnabled) {
      logger.warn('COTERIE_SANDBOX_ENABLED is set but Phase 1 keeps live calls disabled');
    }

    const client = new CoterieClient({
      mock: true, // Phase 1 hard guardrail — mock only.
      allowLiveCalls: false, // Belt-and-suspenders: live path cannot run.
      publishableKey: Deno.env.get('COTERIE_PUBLISHABLE_KEY') || undefined,
      apiBase: Deno.env.get('COTERIE_API_BASE') || undefined,
      logger,
    });

    const auditBuffer: AuditEvent[] = [];
    let rawResponse: unknown = null;

    const adapter = new CoterieAdapter({
      client,
      bindEnabled, // false in Phase 1; prepareBind is not invoked here regardless.
      actor: user.id,
      agencyExternalId: Deno.env.get('COTERIE_AGENCY_EXTERNAL_ID') || undefined,
      producerExternalId: Deno.env.get('COTERIE_PRODUCER_EXTERNAL_ID') || undefined,
      onAudit: (event) => {
        auditBuffer.push(event);
      },
      onRawResponse: (raw) => {
        rawResponse = raw;
      },
    });

    const normalizedRequest = mapIntakeToCoterieQuoteRequest(intake);
    const result = await adapter.createQuote(intake);

    logger.info('Coterie mock quote produced', {
      decision: result.status,
      externalId: result.externalId,
    });

    // ---- Persist session (idempotency-race aware) ----
    // Reuse an existing (incomplete) session when healing. Otherwise insert; if a
    // concurrent request with the same key won the unique (account_id,
    // idempotency_key) index, adopt the winner instead of 500-ing (MEDIUM-3).
    let session: { id: string } | null = existingSession;
    if (!session) {
      const insertRes = await adminClient
        .from('coterie_quote_sessions')
        .insert({
          account_id: intake.accountId,
          agency_workspace_id: agencyWorkspaceId,
          intake_json: intake,
          normalized_request: normalizedRequest,
          status: sessionStatusFromDecision(result.status),
          idempotency_key: intake.idempotencyKey ?? null,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (insertRes.error || !insertRes.data) {
        if (intake.idempotencyKey && isUniqueViolation(insertRes.error)) {
          const winner = await findSessionByIdempotencyKey(
            adminClient,
            intake.accountId,
            intake.idempotencyKey,
          );
          if (!winner) {
            throw new AppError('Failed to resolve idempotency race', 500, 'PERSIST_ERROR');
          }
          session = winner;
          const bundle = await loadSessionBundle(adminClient, winner.id);
          existingQuote = bundle.quote;
          existingGate = bundle.gate;
          if (
            evaluateIdempotentReplay({ session, quote: existingQuote, gate: existingGate }) ===
            'complete'
          ) {
            logger.info('Coterie quote idempotent hit (race winner)', { sessionId: session.id });
            return jsonResponse(
              {
                success: true,
                idempotent: true,
                mock: true,
                sessionId: session.id,
                quoteId: existingQuote!.id,
                approvalGateId: existingGate!.id,
                result: serializeQuoteResult(buildReplayQuoteResult(existingQuote)),
              },
              corsHeaders,
            );
          }
        } else {
          throw new AppError(
            `Failed to persist quote session: ${insertRes.error?.message ?? 'unknown error'}`,
            500,
            'PERSIST_ERROR',
          );
        }
      } else {
        session = insertRes.data;
      }
    }
    if (!session) {
      throw new AppError('Failed to resolve quote session', 500, 'PERSIST_ERROR');
    }

    // ---- Ensure the quote row exists (reuse on heal / ADOPT on race) ----
    // `uq_coterie_quotes_session_active` permits one active quote per session, so
    // a concurrent second writer hits 23505 and ADOPTS the winner's row instead
    // of duplicating (B2). `quoteInsertedThisRequest` records whether THIS request
    // created the quote — it gates the lifecycle audit batch below (B3).
    let quote: Record<string, any> | null = existingQuote;
    let quoteInsertedThisRequest = false;
    if (!quote) {
      const quoteRes = await adminClient
        .from('coterie_quotes')
        .insert({
          session_id: session.id,
          account_id: intake.accountId,
          external_id: result.externalId ?? null,
          line_quotes: result.lineQuotes,
          premium: result.premium ?? null,
          monthly_premium: result.monthlyPremium ?? null,
          decision: result.status,
          raw_response: rawResponse,
          carrier: result.carrier,
          proposal_url: result.proposalUrl ?? null,
        })
        .select('id')
        .single();

      const outcome = classifyWriteResult(quoteRes);
      if (outcome === 'inserted') {
        quote = quoteRes.data;
        quoteInsertedThisRequest = true;
      } else if (outcome === 'adopt-on-conflict') {
        // A concurrent request won the session's unique quote index. Re-read and
        // adopt its quote (and gate, if already present) rather than duplicate.
        const bundle = await loadSessionBundle(adminClient, session.id);
        if (!bundle.quote) {
          throw new AppError('Failed to resolve quote insert race', 500, 'PERSIST_ERROR');
        }
        quote = bundle.quote;
        existingGate = existingGate ?? bundle.gate;
        logger.info('Coterie quote insert adopted concurrent winner', { sessionId: session.id });
      } else {
        throw new AppError(
          `Failed to persist quote: ${quoteRes.error?.message ?? 'unknown error'}`,
          500,
          'PERSIST_ERROR',
        );
      }
    }

    // ---- Ensure the pending human-approval gate exists (entity_type 'quote') ----
    let gate: { id: string } | null = existingGate;
    if (!gate) {
      const gateModel = buildPendingApprovalGate({
        id: crypto.randomUUID(),
        entityType: 'quote',
        entityId: quote.id,
        requestedBy: user.id,
        summary: summarizeQuoteForApproval(intake, result),
        riskFlags: deriveRiskFlags(intake, result),
      });

      const gateRes = await adminClient
        .from('carrier_approval_gates')
        .insert({
          entity_type: gateModel.entityType,
          entity_id: gateModel.entityId,
          account_id: intake.accountId,
          requested_by: user.id,
          status: 'pending',
          summary: gateModel.summary,
          risk_flags: gateModel.riskFlags,
          audit_trail: [],
        })
        .select('id')
        .single();

      const outcome = classifyWriteResult(gateRes);
      if (outcome === 'inserted') {
        gate = gateRes.data;
      } else if (outcome === 'adopt-on-conflict') {
        // `uq_carrier_gates_entity` already holds a gate for this quote (a
        // concurrent winner). Adopt it instead of duplicating (B2).
        gate = await loadGateForQuote(adminClient, quote.id);
        if (!gate) {
          throw new AppError('Failed to resolve approval gate race', 500, 'PERSIST_ERROR');
        }
        logger.info('Coterie approval gate adopted concurrent winner', { quoteId: quote.id });
      } else {
        throw new AppError(
          `Failed to create approval gate: ${gateRes.error?.message ?? 'unknown error'}`,
          500,
          'PERSIST_ERROR',
        );
      }
    }

    // ---- Persist redacted audit trail (append-only, best-effort) ----
    // B3: the standard intake/quote/approval lifecycle batch is written ONLY when
    // THIS request inserted the quote row. On a heal/adopt we instead record a
    // single distinct `quote_heal_completed` marker, so retries (and concurrent
    // losers of the quote-insert race) can never multiply the lifecycle trail.
    if (shouldEmitLifecycleAudit(quoteInsertedThisRequest)) {
      if (auditBuffer.length > 0) {
        const auditRows = auditBuffer.map((event) => ({
          account_id: intake.accountId,
          actor: user.id,
          event_type: event.eventType,
          entity_type: 'coterie_quote',
          entity_id: quote.id,
          detail: event.detail ?? {},
          created_at: event.at,
        }));
        const { error: auditError } = await adminClient
          .from('carrier_audit_events')
          .insert(auditRows);
        if (auditError) {
          // Audit failure is logged but does not fail the quote (best-effort trail).
          logger.warn('Failed to persist some audit events', { error: auditError.message });
        }
      }
    } else {
      const { error: healAuditError } = await adminClient
        .from('carrier_audit_events')
        .insert({
          account_id: intake.accountId,
          actor: user.id,
          event_type: 'quote_heal_completed',
          entity_type: 'coterie_quote',
          entity_id: quote.id,
          detail: { sessionId: session.id, idempotent: true },
          created_at: new Date().toISOString(),
        });
      if (healAuditError) {
        logger.warn('Failed to persist heal audit event', { error: healAuditError.message });
      }
    }

    logger.logResponse(200, startTime);

    // On a heal/adopt the canonical result is the STORED quote's, not this
    // request's freshly-recomputed one, so concurrent callers see identical
    // bodies and ids. A genuinely fresh insert returns its own result.
    const responseResult = quoteInsertedThisRequest
      ? result
      : buildReplayQuoteResult(quote);

    return jsonResponse(
      {
        success: true,
        mock: true,
        idempotent: !quoteInsertedThisRequest,
        sessionId: session.id,
        quoteId: quote.id,
        approvalGateId: gate.id,
        result: serializeQuoteResult(responseResult),
      },
      corsHeaders,
    );
  } catch (error) {
    logger.error('Coterie quote error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return corsError(error, corsHeaders);
  }
});
