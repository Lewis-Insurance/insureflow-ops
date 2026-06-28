// ============================================================================
// CANOPY BATCH INITIATE  (PLAN-INT-A — Agent A: bulk attach_account invite mint)
// ============================================================================
// Service-role batch endpoint that mints Canopy "attach_account" warm invites
// for Phase-0 cross-sell target accounts, idempotently, one open invite per
// account (enforced both in-app and by the DB partial-unique index
// `uq_canopy_open_invite_per_account`).
//
// AUTH: header `x-batch-secret` must equal env `BATCH_TRIGGER_SECRET`
//       (constant-time compare). There is NO user-JWT path — this is an
//       operator/cron-only batch trigger. Configure verify_jwt=false.
//
// Canopy outbound auth mirrors the CORRECT pattern used by canopy-webhook:
//   headers x-canopy-client-id / x-canopy-client-secret  (NOT Basic auth)
//   env    CANOPY_CLIENT_ID / CANOPY_CLIENT_SECRET
//
// !!! IMPORTANT — SANDBOX CAVEAT (READ BEFORE BULK USE) !!!
// The exact request/response contract for `POST {CANOPY_API_BASE_URL}/widgets`
// is UNVERIFIED (sandbox-gated). The mint call below is written defensively:
//   - request body carries account reference + metadata + products, but the
//     precise field names Canopy expects may differ.
//   - response parsing tolerates id|widget_id and public_url|hosted_url|url and
//     reconstructs public_url from public_alias when absent.
// You MUST validate the field mapping against the Canopy sandbox (capture one
// real /widgets response) and adjust `parseWidgetResponse()` / the request body
// BEFORE running this against the real book. Until then, treat minted rows as
// provisional.
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

const logger = createLogger("canopy-batch-initiate");

// ---- Constants --------------------------------------------------------------
const PHASE0_WORKSPACE_ID = "f1f07037-3032-45f8-93ca-72c0f47e4fbb";
const CANOPY_PRODUCTS = ["auto", "home", "renters", "umbrella"];
const CHUNK_SIZE = 25;
const INTER_CHUNK_DELAY_MS = 300;
const DEFAULT_MAX_MINT = 250;

// Statuses that count as an "open" invite (mirrors the partial-unique index
// predicate in migration 20260628215132_phase0_03_canopy_invites.sql).
const OPEN_INVITE_STATUSES = [
  "invite_minted",
  "sent",
  "pending",
  "processing",
  "authenticated",
];

// ---- Types ------------------------------------------------------------------
interface BatchRequest {
  account_ids?: string[];
  segment?: "phase0";
  mode?: string;
  require_contact?: boolean; // default true
  max_mint?: number;
}

interface AccountRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  agency_workspace_id: string | null;
  owner_agent_id: string | null;
  deleted_at: string | null;
}

interface ResultRow {
  account_id: string;
  status: "minted" | "reused" | "skipped" | "failed";
  reason?: string;
  canopy_invites_id?: string;
  widget_id?: string | null;
  public_url?: string | null;
}

// ---- Constant-time secret compare (mirrors _shared/cron-auth.ts) ------------
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---- Small helpers ----------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isUniqueViolation(error: unknown): boolean {
  // Postgres unique_violation = 23505. supabase-js surfaces it on error.code.
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505") return true;
  const msg = (error as { message?: string } | null)?.message ?? "";
  return /duplicate key value|unique constraint|uq_canopy_open_invite_per_account/i
    .test(msg);
}

// ---- Canopy /widgets response parsing (DEFENSIVE — see sandbox caveat) -------
interface ParsedWidget {
  widget_id: string | null;
  public_alias: string | null;
  public_url: string | null;
}

function parseWidgetResponse(raw: unknown): ParsedWidget {
  // Canopy may wrap the payload (e.g. { widget: {...} } / { data: {...} }) or
  // return it flat. Tolerate both. UNVERIFIED — validate in sandbox.
  const r = (raw ?? {}) as Record<string, unknown>;
  const w = ((r.widget ?? r.data ?? r) as Record<string, unknown>) ?? {};

  const widget_id =
    (w.widget_id as string) ?? (w.id as string) ?? (w.widgetId as string) ?? null;

  const public_alias =
    (w.public_alias as string) ??
    (w.alias as string) ??
    (w.publicAlias as string) ??
    null;

  let public_url =
    (w.public_url as string) ??
    (w.hosted_url as string) ??
    (w.url as string) ??
    (w.publicUrl as string) ??
    (w.hostedUrl as string) ??
    null;

  // If we only got an alias, construct the canonical hosted invite URL.
  if (!public_url && public_alias) {
    public_url = `https://app.usecanopy.com/i/${public_alias}`;
  }

  return { widget_id, public_alias, public_url };
}

// ---- Canopy mint with retry/backoff -----------------------------------------
interface MintConfig {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
}

interface MintOutcome {
  ok: boolean;
  widget?: ParsedWidget;
  status?: number;
  error?: string;
}

async function mintWidget(
  account: AccountRow,
  cfg: MintConfig,
): Promise<MintOutcome> {
  const url = `${cfg.apiBaseUrl}/widgets`;

  // DEFENSIVE request body. Field names are best-effort and UNVERIFIED.
  // We include several plausible account-reference keys so whichever Canopy
  // honors is present; harmless extras are typically ignored. The metadata
  // block is the contract our webhook relies on (account_id / mode) and Canopy
  // round-trips metadata, so that part is safe.
  const body = {
    products: CANOPY_PRODUCTS,
    reference_id: account.id,
    external_id: account.id,
    consumer: {
      name: account.name ?? undefined,
      email: account.email ?? undefined,
      phone: account.phone ?? undefined,
    },
    metadata: {
      account_id: account.id,
      workspace_id: PHASE0_WORKSPACE_ID,
      mode: "attach_account",
    },
  };

  const MAX_ATTEMPTS = 3;
  const BACKOFFS_MS = [250, 1000, 3000];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "x-canopy-client-id": cfg.clientId,
          "x-canopy-client-secret": cfg.clientSecret,
        },
        body: JSON.stringify(body),
      });

      // Success
      if (resp.ok) {
        const json = await resp.json().catch(() => ({}));
        return { ok: true, widget: parseWidgetResponse(json), status: resp.status };
      }

      // Rate limited — honor Retry-After, then retry (counts as an attempt).
      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get("Retry-After"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BACKOFFS_MS[Math.min(attempt - 1, BACKOFFS_MS.length - 1)];
        logger.warn("Canopy 429 rate limit", {
          accountId: account.id,
          attempt,
          waitMs,
        });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(waitMs);
          continue;
        }
        const text = await resp.text().catch(() => "");
        return { ok: false, status: 429, error: `rate_limited: ${text}`.trim() };
      }

      // 5xx — retry with backoff.
      if (resp.status >= 500) {
        const text = await resp.text().catch(() => "");
        logger.warn("Canopy 5xx, will retry", {
          accountId: account.id,
          attempt,
          status: resp.status,
        });
        if (attempt < MAX_ATTEMPTS) {
          await sleep(BACKOFFS_MS[Math.min(attempt - 1, BACKOFFS_MS.length - 1)]);
          continue;
        }
        return { ok: false, status: resp.status, error: `canopy_5xx: ${text}`.trim() };
      }

      // 4xx (non-429) — fail fast, no retry.
      const text = await resp.text().catch(() => "");
      return {
        ok: false,
        status: resp.status,
        error: `canopy_4xx_${resp.status}: ${text}`.trim(),
      };
    } catch (err) {
      // Network/transport error — retry with backoff.
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Canopy network error, will retry", {
        accountId: account.id,
        attempt,
        error: msg,
      });
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFFS_MS[Math.min(attempt - 1, BACKOFFS_MS.length - 1)]);
        continue;
      }
      return { ok: false, error: `network: ${msg}` };
    }
  }

  return { ok: false, error: "exhausted_retries" };
}

// ---- Idempotency lookup -----------------------------------------------------
async function findOpenInvite(
  supabase: SupabaseClient,
  accountId: string,
): Promise<{ id: string; public_url: string | null; widget_id: string | null } | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("canopy_invites")
    .select("id, public_url, widget_id, invite_expires_at")
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .in("status", OPEN_INVITE_STATUSES)
    .limit(50); // small set; filter expiry in app to express the OR-null cleanly

  if (error) {
    // Treat a read error as "unknown" — caller decides. Surface upstream.
    throw error;
  }

  const live = (data ?? []).find(
    (row) =>
      row.invite_expires_at == null ||
      new Date(row.invite_expires_at as string).getTime() > new Date(nowIso).getTime(),
  );

  return live
    ? { id: live.id as string, public_url: (live.public_url as string) ?? null, widget_id: (live.widget_id as string) ?? null }
    : null;
}

// ---- Per-account processing (isolated — never throws to the batch loop) -----
async function processAccount(
  supabase: SupabaseClient,
  accountId: string,
  opts: { requireContact: boolean; mintCfg: MintConfig; batchId: string },
): Promise<ResultRow> {
  try {
    // 1) Load account + eligibility gates.
    const { data: account, error: acctErr } = await supabase
      .from("accounts")
      .select("id, name, email, phone, agency_workspace_id, owner_agent_id, deleted_at")
      .eq("id", accountId)
      .maybeSingle();

    if (acctErr) {
      return { account_id: accountId, status: "failed", reason: `account_load_error: ${acctErr.message}` };
    }
    if (!account) {
      return { account_id: accountId, status: "skipped", reason: "not_found" };
    }

    const acct = account as AccountRow;

    if (acct.deleted_at) {
      return { account_id: accountId, status: "skipped", reason: "inactive" };
    }
    if (acct.agency_workspace_id !== PHASE0_WORKSPACE_ID) {
      return { account_id: accountId, status: "skipped", reason: "wrong_workspace" };
    }
    if (opts.requireContact && acct.email == null && acct.phone == null) {
      return { account_id: accountId, status: "skipped", reason: "no_contact" };
    }

    // 2) Idempotency pre-check — reuse an existing open, unexpired invite.
    let existing;
    try {
      existing = await findOpenInvite(supabase, accountId);
    } catch (preErr) {
      return {
        account_id: accountId,
        status: "failed",
        reason: `idempotency_precheck_error: ${preErr instanceof Error ? preErr.message : String(preErr)}`,
      };
    }
    if (existing) {
      return {
        account_id: accountId,
        status: "reused",
        canopy_invites_id: existing.id,
        widget_id: existing.widget_id,
        public_url: existing.public_url,
      };
    }

    // 3) Mint via Canopy (retry/backoff inside).
    const mint = await mintWidget(acct, opts.mintCfg);
    if (!mint.ok || !mint.widget) {
      return {
        account_id: accountId,
        status: "failed",
        reason: mint.error ?? `mint_failed_status_${mint.status ?? "unknown"}`,
      };
    }

    const { widget_id, public_alias, public_url } = mint.widget;

    // 4) Insert canopy_invites. The partial-unique index is the real guard
    //    against a race (two batch runs / a click in between) — on unique
    //    violation we re-select and return 'reused' instead of failing.
    const insertRow = {
      account_id: accountId,
      agency_workspace_id: PHASE0_WORKSPACE_ID,
      widget_id,
      public_alias,
      public_url,
      pull_type: "attach_account_invite",
      status: "invite_minted",
      batch_id: opts.batchId,
      metadata: {
        minted_by: "canopy-batch-initiate",
        mode: "attach_account",
        products: CANOPY_PRODUCTS,
        owner_agent_id: acct.owner_agent_id,
      },
    };

    const { data: inserted, error: insErr } = await supabase
      .from("canopy_invites")
      .insert(insertRow)
      .select("id")
      .single();

    if (insErr) {
      if (isUniqueViolation(insErr)) {
        // Lost the race to another open invite — adopt it.
        const raced = await findOpenInvite(supabase, accountId).catch(() => null);
        if (raced) {
          return {
            account_id: accountId,
            status: "reused",
            canopy_invites_id: raced.id,
            widget_id: raced.widget_id,
            public_url: raced.public_url,
          };
        }
        // Unique violation but nothing live found — report as failed so it's visible.
        return {
          account_id: accountId,
          status: "failed",
          reason: "unique_violation_no_live_invite",
          widget_id,
          public_url,
        };
      }
      // Other insert error: the widget was minted at Canopy but not persisted.
      return {
        account_id: accountId,
        status: "failed",
        reason: `invite_insert_error: ${insErr.message}`,
        widget_id,
        public_url,
      };
    }

    return {
      account_id: accountId,
      status: "minted",
      canopy_invites_id: (inserted as { id: string }).id,
      widget_id,
      public_url,
    };
  } catch (err) {
    // Absolute backstop: a single account must never abort the batch.
    return {
      account_id: accountId,
      status: "failed",
      reason: `unexpected: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---- Self-selection (segment=phase0) ----------------------------------------
async function selectPhase0Targets(
  supabase: SupabaseClient,
  cap: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("v_phase0_crosssell_targets")
    .select("contact_account_id")
    .eq("reachable_email", true)
    .limit(cap);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .map((r) => (r as { contact_account_id: string | null }).contact_account_id)
    .filter((id): id is string => !!id);
}

// ============================================================================
// HTTP entrypoint
// ============================================================================
Deno.serve(async (req: Request) => {
  // CORS preflight.
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  // ---- AUTH: x-batch-secret == BATCH_TRIGGER_SECRET (constant-time) ----------
  const expectedSecret = Deno.env.get("BATCH_TRIGGER_SECRET");
  if (!expectedSecret) {
    logger.error("BATCH_TRIGGER_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Batch authentication not configured" }),
      { status: 500, headers: jsonHeaders },
    );
  }
  const providedSecret = req.headers.get("x-batch-secret");
  if (!providedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    logger.warn("Invalid or missing x-batch-secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: jsonHeaders },
    );
  }

  // ---- Config ----------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const canopyClientId = Deno.env.get("CANOPY_CLIENT_ID");
  const canopyClientSecret = Deno.env.get("CANOPY_CLIENT_SECRET");
  const canopyApiBaseUrl =
    Deno.env.get("CANOPY_API_BASE_URL") || "https://app.usecanopy.com/api/v1.0.0";
  const batchMaxMintEnv = Number(Deno.env.get("BATCH_MAX_MINT"));
  const batchMaxMintDefault =
    Number.isFinite(batchMaxMintEnv) && batchMaxMintEnv > 0
      ? batchMaxMintEnv
      : DEFAULT_MAX_MINT;

  if (!supabaseUrl || !serviceKey) {
    logger.error("Missing Supabase service configuration");
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: jsonHeaders },
    );
  }
  if (!canopyClientId || !canopyClientSecret) {
    logger.error("Missing Canopy credentials");
    return new Response(
      JSON.stringify({ error: "Canopy API not configured" }),
      { status: 500, headers: jsonHeaders },
    );
  }

  // ---- Parse input -----------------------------------------------------------
  let body: BatchRequest;
  try {
    body = (await req.json()) as BatchRequest;
  } catch {
    body = {};
  }

  const requireContact = body.require_contact !== false; // default true
  const reqMax = Number(body.max_mint);
  const maxMint =
    Number.isFinite(reqMax) && reqMax > 0
      ? Math.min(reqMax, batchMaxMintDefault)
      : batchMaxMintDefault;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Resolve the target account_ids ----------------------------------------
  let accountIds: string[] = [];
  try {
    if (Array.isArray(body.account_ids) && body.account_ids.length > 0) {
      accountIds = body.account_ids.filter((x): x is string => typeof x === "string");
    } else if (body.segment === "phase0") {
      accountIds = await selectPhase0Targets(supabase, batchMaxMintDefault);
    } else {
      return new Response(
        JSON.stringify({
          error: "No targets: provide account_ids[] or segment='phase0'",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }
  } catch (selErr) {
    logger.error(
      "Target selection failed",
      selErr instanceof Error ? selErr : undefined,
    );
    return new Response(
      JSON.stringify({
        error: "Target selection failed",
        message: selErr instanceof Error ? selErr.message : String(selErr),
      }),
      { status: 500, headers: jsonHeaders },
    );
  }

  // De-dupe while preserving order, then cap at maxMint.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of accountIds) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }
  const targets = deduped.slice(0, maxMint);

  const batchId = crypto.randomUUID();
  logger.info("Batch initiate starting", {
    batchId,
    requested: targets.length,
    requireContact,
    maxMint,
    segment: body.segment ?? null,
  });

  // ---- Process in chunks of 25 with inter-chunk delay ------------------------
  const results: ResultRow[] = [];
  const errors: Array<{ account_id: string; reason?: string }> = [];
  const mintCfg: MintConfig = {
    apiBaseUrl: canopyApiBaseUrl,
    clientId: canopyClientId,
    clientSecret: canopyClientSecret,
  };

  let minted = 0;
  let reused = 0;
  let skipped = 0;
  let failed = 0;

  const chunks = chunk(targets, CHUNK_SIZE);
  outer: for (let ci = 0; ci < chunks.length; ci++) {
    const group = chunks[ci];

    // Process accounts within a chunk concurrently; each is fully isolated.
    const settled = await Promise.all(
      group.map((accountId) =>
        processAccount(supabase, accountId, { requireContact, mintCfg, batchId })
      ),
    );

    for (const r of settled) {
      results.push(r);
      switch (r.status) {
        case "minted":
          minted++;
          break;
        case "reused":
          reused++;
          break;
        case "skipped":
          skipped++;
          break;
        case "failed":
          failed++;
          errors.push({ account_id: r.account_id, reason: r.reason });
          break;
      }
    }

    // Hard stop once we've actually minted maxMint new invites (reused/skipped
    // do not consume the budget; the request cap already bounds total work).
    if (minted >= maxMint) {
      logger.info("Reached max_mint cap, stopping", { batchId, minted, maxMint });
      break outer;
    }

    // Inter-chunk delay (skip after the final chunk).
    if (ci < chunks.length - 1) {
      await sleep(INTER_CHUNK_DELAY_MS);
    }
  }

  logger.info("Batch initiate complete", {
    batchId,
    requested: targets.length,
    minted,
    reused,
    skipped,
    failed,
  });

  return new Response(
    JSON.stringify({
      batch_id: batchId,
      requested: targets.length,
      minted,
      reused,
      skipped,
      failed,
      results,
      errors,
    }),
    { status: 200, headers: jsonHeaders },
  );
});
