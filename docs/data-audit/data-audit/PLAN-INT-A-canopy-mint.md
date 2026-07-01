# PLAN-INT-A — Canopy Batch-Mint (Build-Ready Spec)

**Database:** InsureFlow / "Lewis Insurance App" (Supabase `lrqajzwcmdwahnjyidgv`)
**Workspace (single tenant):** `f1f07037-3032-45f8-93ca-72c0f47e4fbb` · active account = `deleted_at IS NULL`
**Date:** 2026-06-28 · **Status: PLANNING ONLY — nothing here has been executed. Read-only SELECTs only. Do NOT mint, send, or deploy.**
**Scope:** A service-role BATCH path to mint one account-linked Canopy intake link per target account (the Phase-0 cross-sell list), with no per-user login. Output of mint = a stored shareable URL per account. **Sending is OUT OF SCOPE** (handed to the Levitate "send" spec).

---

## 0. Verified anchors (re-queried live, 2026-06-28)

| Fact | Value | Source |
|---|---|---|
| Active accounts (`deleted_at IS NULL`) | **1,714** | live COUNT |
| ┗ active accounts with a non-empty `email` | **707** | live COUNT |
| `canopy_pulls` rows total | **17** | live COUNT |
| ┗ account-linked (`account_id IS NOT NULL`) | **0** | live COUNT |
| ┗ rows with `public_url` populated | **0** | live COUNT |
| ┗ rows with `consent_token` populated | **0** | live COUNT |
| `canopy_pulls` distinct `status` seen | `authenticated`, `complete` | live |
| `tasks.dedupe_key` column exists | **true** | `information_schema` |
| `canopy_pulls.pull_type` column exists | **true** | `information_schema` |
| `coverage_gap_opportunities` table | exists, has `idempotency_key` | `information_schema` |

**Read this first — the core finding that shapes the whole spec:**
The existing `canopy-initiate` function POSTs to `${CANOPY_API_BASE_URL}/pulls` and expects a response `{ pull_id, link_token, expires_at }`. **That endpoint and shape do not exist in Canopy's real REST API** (confirmed against `https://docs.usecanopy.com/llms.txt`). There is **no `POST /pulls`.** This is why every live `canopy_pulls` row has `public_url`, `public_alias`, `widget_id`, `consent_token` = NULL — the hosted-link path was never actually exercised; the SDK `link_token` path was. The batch function MUST NOT copy `canopy-initiate`'s API call. It must use the **Widget** model (see §3).

---

## 1. Problem

We have a Phase-0 cross-sell list of existing-client `accounts` (subset of the 1,714 active; the ~707 with email are reachable today). To send each client a personalized "share your current policy" Canopy invite **at scale**, we first need a **shareable hosted Canopy URL minted per account**, stored where the send step can read it, and wired so that when the client completes the share, the existing `canopy-webhook` links the pulled data back to that account (creating a `coverage_gap_opportunities` row + a producer `tasks` row).

Two blockers today:
1. **`canopy-initiate` requires an authenticated staff user** (it calls `supabaseUser.auth.getUser()` and checks `profiles.role`). No way to mint for a list without a human session per account.
2. **No correct hosted-link minting exists.** The current API call is to a non-existent endpoint; nothing populates the shareable-URL columns.

---

## 2. What to build

A **new service-role edge function `canopy-batch-initiate`** (do not loosen auth on `canopy-initiate`; keep that for the interactive in-app SDK flow). The batch function:

- Is invoked server-to-server (cron / admin RPC / one-off script) with the service-role key or a shared `BATCH_TRIGGER_SECRET`. **No per-user login.**
- Accepts a list of `account_id`s (or a `mode:'list'` that self-selects the Phase-0 segment).
- For each account, **mints (or reuses) an account-scoped Canopy hosted link** and writes a `canopy_pulls` row carrying `account_id`, `widget_id`, `public_alias`, `public_url`, `pull_type='attach_account_invite'`, `status='invite_minted'`.
- Is **idempotent**: never mints a second open invite for an account that already has one (§5).
- Returns a per-account result array `{ account_id, status, public_url, canopy_pulls_id, reason }` for the send step to consume (the send step can also just query the table — §6).

### Canopy link model (decided)
Canopy hosted intake links are **Widgets**. The mint creates a widget whose hosted page (`public_url`, e.g. `https://app.usecanopy.com/i/{public_alias}`) is the consumer-facing link. The widget's `metadata` carries our `account_id`, so when the consumer completes, the `COMPLETE` webhook payload's pull echoes that metadata and `canopy-webhook` links the resulting pull to the account.

Two viable widget strategies — **build agent picks A unless ops confirms a shared-widget preference:**

- **Strategy A — one widget per account (recommended for clean attribution + idempotency).** `POST /widgets` per account with `metadata.account_id`. `public_url` is unique per account; attribution is unambiguous; idempotency is "does this account already have a live widget row." Cost: 707–1,714 widgets created in Canopy. Confirm with Canopy rep that per-consumer widget creation is within plan limits (Canopy plans meter pulls/widgets — see §5.4).
- **Strategy B — one shared widget + per-link `client_reference_id`.** Create/reuse a single agency widget, then append a per-account query param (e.g. `?client_reference_id={account_id}` / `?metadata=...`) to its `public_url`. Fewer Canopy objects. Risk: attribution depends on Canopy echoing that param into the pull's metadata — **must be validated in sandbox before adopting** (not all hosted widgets propagate arbitrary query params to the webhook). If validated, idempotency becomes purely a `canopy_pulls`-row check and no Canopy object is created per account.

> **The build agent MUST verify the exact `POST /widgets` request/response in Canopy sandbox** (fields: `public_alias`, `public_url`, `widget_id`/`id`, and whether `metadata` is supported on the widget) before wiring storage. The column names below (`widget_id`, `public_alias`, `public_url`) already exist on `canopy_pulls` and are the intended destinations.

---

## 3. Exact functions, tables, env

### 3.1 New edge function
- **Slug:** `canopy-batch-initiate`
- **`verify_jwt`:** `false` (same as `canopy-initiate`); auth is enforced in-code via a shared secret + service role, NOT a user JWT.
- **Reuses:** `functions/_shared/cors.ts` (note: CORS is irrelevant for a server-to-server caller, but keep for symmetry).

### 3.2 Canopy API (CONFIRMED from docs + existing `canopy-webhook` outbound code)
- **Base URL:** `https://app.usecanopy.com/api/v1.0.0` — **this is correct.** The `canopy-initiate` default `https://api.canopyconnect.com/v1` is **stale/wrong.** Set env `CANOPY_API_BASE_URL=https://app.usecanopy.com/api/v1.0.0`.
- **Auth (server/Team calls):** request headers **`x-canopy-client-id`** + **`x-canopy-client-secret`**. This is the scheme the live `canopy-webhook` already uses for its outbound `GET /pulls/:id` call — **replicate it.** Do NOT use `Authorization: Basic` (that's the bug in `canopy-initiate`). (Per Canopy docs you may alternatively mint a Bearer access token, but the client-id/secret header pair is already wired and proven in this codebase.)
- **Endpoints relevant here (from `https://docs.usecanopy.com/llms.txt`):**
  - `POST /widgets` — create a hosted intake link (Strategy A/B). → returns a `Widget` (`schemas-widget`: includes `public_alias`, `public_url`, widget id).
  - `GET /widgets`, `GET /:widgetId` — list / fetch widgets (reuse / reconciliation).
  - `GET /pulls/:pullId`, `GET /pulls` — read pull data (used by webhook, not by mint).
  - `POST /consentAndConnect` — used by the hosted page when a consumer consents (creates the actual Pull). **Not called by the batch mint** — the consumer triggers it by opening the link.
  - **There is NO `POST /pulls`.** Do not call it.
- **Env vars (already present in project; reuse — do NOT introduce new Canopy creds):**
  - `CANOPY_CLIENT_ID`, `CANOPY_CLIENT_SECRET` — outbound API auth.
  - `CANOPY_API_BASE_URL` — set/confirm to the value above.
  - `CANOPY_WEBHOOK_SECRET` — used by `canopy-webhook` for HMAC verification (unchanged; mint doesn't touch it, but note the webhook **bypasses verification with a warning if this is unset** — ops should set it before a real send).
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — service-role DB writes.
  - **NEW:** `BATCH_TRIGGER_SECRET` — shared secret the caller must present (header `x-batch-secret`) so the function can't be invoked anonymously. Validate constant-time.
  - Optional: `CANOPY_WIDGET_ID` / `CANOPY_PUBLIC_ALIAS` — if Strategy B (shared widget) is adopted, the pre-created shared widget identifiers.
  - `ENVIRONMENT` — `sandbox` vs `production` gating.

### 3.3 Tables
- **Write target (source of truth for minted invites): `canopy_pulls`.** Columns to populate at mint time:
  - `canopy_pull_id` (TEXT, **NOT NULL, UNIQUE**) — see §5.1 for the no-real-pull-yet problem and the chosen fix.
  - `account_id` = target account.
  - `lead_id` = NULL.
  - `status` = `'invite_minted'` (new status value; webhook later moves it through `authenticated`→`complete`).
  - `pull_type` = `'attach_account_invite'`.
  - `widget_id`, `public_alias`, `public_url` = from the Canopy `POST /widgets` response (the shareable link is `public_url`).
  - `initiated_by` = NULL (no user) — **verify FK allows NULL: it does (`initiated_by uuid NULL`).**
  - `metadata` = `{ mode:'attach_account', minted_by:'canopy-batch-initiate', batch_id:'<uuid>', invite_minted_at:'<iso>', expires_at:'<iso|null>' }`.
- **No schema change is strictly required** (all needed columns exist). **Recommended migrations (separate DDL, build agent):**
  1. **Partial unique index for idempotency** (the real guarantee):
     ```sql
     CREATE UNIQUE INDEX uq_canopy_open_invite_per_account
       ON public.canopy_pulls (account_id)
       WHERE account_id IS NOT NULL
         AND status IN ('invite_minted','pending','processing','authenticated')
         AND deleted_at IS NULL;
     ```
     This makes double-minting impossible at the DB level (insert race → unique violation → caught & treated as "already minted"). **Verify no existing open rows violate it before creating (currently 0 account-linked rows, so safe).**
  2. Optional `invite_expires_at timestamptz` column (instead of stashing in metadata) for cheap expiry queries.
- **Downstream (already wired in `canopy-webhook`, FYI only — mint does not write these):** on account-linked `COMPLETE`, webhook inserts `coverage_gap_opportunities` (`opportunity_key='canopy_cross_sell'`, `idempotency_key='canopy:<pullId>'`) and a `tasks` row (`source='canopy'`, `dedupe_key='canopy-xsell:<pullId>'`).

---

## 4. Per-account mint flow (algorithm)

Input: `account_ids: uuid[]` (explicit) **or** `segment:'phase0'` (function self-selects). For each `account_id`:

1. **Load account** (service role): `SELECT id, name, email, phone, type, account_type, agency_workspace_id, owner_agent_id, deleted_at FROM accounts WHERE id = :id`.
   - Skip with `reason='inactive'` if `deleted_at IS NOT NULL`.
   - Skip with `reason='wrong_workspace'` if `agency_workspace_id <> 'f1f07037-…'` (guard the single tenant).
   - (Deliverability gating — e.g. require `email`/`phone` — belongs to the **send** step, not mint. Mint can still create the link. But to avoid minting links nobody can receive, **recommended:** skip with `reason='no_contact'` when both `email` and `phone` are NULL. Make this a flag `require_contact` default `true`.)
2. **Idempotency check (pre-flight):** `SELECT id, public_url, status FROM canopy_pulls WHERE account_id=:id AND status IN ('invite_minted','pending','processing','authenticated') AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`.
   - If found and not expired → **reuse**: return `{status:'reused', public_url, canopy_pulls_id}`. Do NOT call Canopy.
   - If found but expired → soft-archive it (`is_archived=true`, `deleted_at=now()` or `status='expired'`) and continue to mint a fresh one.
3. **Mint at Canopy** (`POST {BASE}/widgets`, headers `x-canopy-client-id/secret`):
   - Body (validate exact shape in sandbox): name/label referencing the account, `metadata:{ account_id, workspace_id, mode:'attach_account' }`, products `['auto','home','renters','umbrella']` (mirror `canopy-initiate`'s product list), `webhook_url:'${SUPABASE_URL}/functions/v1/canopy-webhook'` if widget-level webhooks are supported (else the Team-level webhook already configured in the Canopy dashboard handles it).
   - Parse `widget_id` (or `id`), `public_alias`, `public_url` from response. If `public_url` absent but `public_alias` present, construct `https://app.usecanopy.com/i/${public_alias}` and store both (validate the host in sandbox).
4. **Persist** (service role insert into `canopy_pulls`, fields per §3.3). Use **upsert keyed on the partial unique index** so a concurrent run can't double-insert; on unique violation, fall back to step 2's reuse path.
5. **Return** `{ account_id, status:'minted', public_url, public_alias, widget_id, canopy_pulls_id }`.

**Batching loop:** process in chunks of **N=25** with a short delay between chunks; **stop-on-budget** guard (max widgets per run, env `BATCH_MAX_MINT` default 250) so a first production run can't accidentally create 1,700 Canopy objects. Aggregate results; return summary `{ requested, minted, reused, skipped, failed, errors[] }`.

---

## 5. Idempotency & limits

### 5.1 The `canopy_pull_id NOT NULL UNIQUE` problem (must solve)
A widget is **not** a pull; the real `canopy_pull_id` only exists after the consumer consents. But `canopy_pulls.canopy_pull_id` is **NOT NULL + UNIQUE**. Options, in order of preference:
- **(Chosen) Synthetic placeholder:** set `canopy_pull_id = 'invite:' || widget_id` (or `'invite:' || account_id || ':' || batch_id`) at mint time. Guaranteed unique, satisfies NOT NULL. When the webhook's `COMPLETE` arrives with the *real* pull id, `canopy-webhook` currently matches on `canopy_pull_id = payload.pull_id` and **won't find this placeholder row** → it will create a *new* row. **→ Two-line follow-up change to `canopy-webhook` (call it out as a dependency, see §7):** before insert-on-not-found, also try to match an open invite row by `metadata->>account_id` (from the pull's echoed metadata) and *upgrade* it (set real `canopy_pull_id`, `status`, link). Without this, the invite row and the completed-pull row diverge (attribution still works via `account_id`, but you get a duplicate `canopy_pulls` row per completed invite).
- **(Alternative) Don't pre-insert a pull row at all:** store minted links in a **dedicated `canopy_invites` table** (`account_id`, `widget_id`, `public_alias`, `public_url`, `status`, `expires_at`, unique partial index on open invites). Cleaner separation; the webhook stays untouched for matching (it still links the real pull to the account via metadata). **This is the lower-risk option if the team prefers not to touch `canopy-webhook`.** Trade-off: send step reads `canopy_invites` instead of `canopy_pulls`. **Recommend this if Strategy B (shared widget) is chosen, since then there's no per-account Canopy object and `canopy_pulls` would otherwise be polluted with placeholder rows.**

> **Decision for build agent:** default to the **`canopy_invites` table** (alternative) — it avoids the NOT NULL/UNIQUE hack and keeps `canopy_pulls` meaning "a real pull." If the team insists on a single table, use the synthetic-placeholder + webhook-upgrade path. Either way, the *idempotency unit* is "one open invite per account."

### 5.2 Idempotency guarantee
- DB-enforced via the **partial unique index** on `(account_id) WHERE status IN open-set` (on whichever table holds invites).
- Pre-flight SELECT (§4.2) avoids most Canopy calls; the unique index is the race backstop.
- `metadata.batch_id` lets you re-run a specific batch safely and audit "what did run X mint."

### 5.3 Expiry
- Canopy hosted links / widgets may carry an expiry; **capture whatever expiry field `POST /widgets` returns** into `invite_expires_at` (or `metadata.expires_at`). If Canopy widgets do not expire, set a **business TTL** (recommend 30 days) so stale invites get re-minted rather than re-sent forever.
- A row is "open/active" for idempotency only while `now() < invite_expires_at`. Expired rows are re-mintable (step 2 archives + re-mints).
- **Recommended companion:** a small `canopy-invite-sweeper` cron (out of scope to build now, note it) to mark expired invites and optionally re-mint for accounts that never opened the link.

### 5.4 Canopy rate / volume limits (confirm with rep; conservative defaults)
- Canopy plans **meter pulls and may meter widgets/links** — creating 707–1,714 widgets (Strategy A) could hit plan ceilings or per-consumer pricing. **Action: confirm the agency's plan allowances and per-widget/per-pull cost with the Canopy rep BEFORE a full run.** This is the single biggest external risk.
- No published hard RPS limit found in docs. **Default client-side throttle:** ≤5 requests/sec, chunks of 25, 200–500 ms inter-chunk delay. Honor HTTP `429` with exponential backoff + `Retry-After`.
- `BATCH_MAX_MINT` (default 250) caps any single run so the first production batch is a controlled pilot.

### 5.5 Error handling & retries
- Per-account isolation: one account's failure never aborts the batch; collect into `errors[]` with `{account_id, stage, http_status, message}`.
- **Retry Canopy 5xx / network:** retry up to 3× with backoff (250 ms → 1 s → 3 s). On `429`: respect `Retry-After`.
- **Canopy 4xx (bad request / auth):** do NOT retry; surface immediately (likely a config/scheme bug — esp. if a 401, check you used `x-canopy-client-id/secret`, not Basic).
- **DB unique violation on insert:** treat as success-by-reuse (someone/another worker already minted) — re-select and return that row.
- **Partial Canopy success / DB failure:** if the widget was created at Canopy but the DB insert failed, log `widget_id`+`public_url` to a `canopy_webhook_log`-style audit (or stderr with structured fields) so the orphan widget can be reconciled via `GET /widgets` on retry; the next run's pre-flight won't see it (no row), so add a **reconciliation step**: before minting, optionally `GET /widgets?metadata.account_id=…` (if supported) to adopt an orphan. If not supported, accept rare orphan widgets and dedupe by metadata during periodic reconciliation.
- Idempotency makes the whole batch **safely re-runnable** end to end.

---

## 6. Handoff to the send step (Levitate)

- **Contract:** the send step reads minted invites from the source-of-truth table (default **`canopy_invites`**, else `canopy_pulls` with `pull_type='attach_account_invite'`). Query:
  ```sql
  SELECT i.account_id, a.name, a.email, a.phone, i.public_url, i.public_alias, i.status, i.invite_expires_at
  FROM canopy_invites i
  JOIN accounts a ON a.id = i.account_id
  WHERE i.status = 'invite_minted'
    AND i.deleted_at IS NULL
    AND (i.invite_expires_at IS NULL OR i.invite_expires_at > now())
    AND a.deleted_at IS NULL;
  ```
- **The link to send is `public_url`.** Personalization tokens available: `accounts.name`, owner agent (`owner_agent_id`), and (post-completion) the cross-sell `coverage_gap_opportunities` row.
- **State ownership boundary:** mint sets `status='invite_minted'`. The **send step** is responsible for marking `status='invite_sent'` (+ `sent_at`, channel) after Levitate confirms delivery — mint must NOT set sent state. The **webhook** owns `authenticated`/`complete`. Define this enum explicitly in the build so the three writers don't collide.
- **Do not** have the send step call Canopy; it only delivers the pre-minted `public_url`.

---

## 7. Dependencies / cross-spec notes

- **`canopy-webhook` change (only if single-table/placeholder path in §5.1 is chosen):** add a metadata-based match so a completed real pull *upgrades* the placeholder invite row instead of inserting a duplicate. If the `canopy_invites` table path is chosen, **no webhook change is required** (webhook keeps linking real pulls to accounts by `account_id`; invites table is purely the send queue).
- **`canopy-initiate` bugs surfaced (fix opportunistically, not required for this spec):** wrong base URL (`api.canopyconnect.com/v1`) and wrong auth (`Authorization: Basic`) and a non-existent `POST /pulls`. The batch function must use the **correct** values (§3.2); consider back-porting the fix to `canopy-initiate` so the interactive flow actually stores `public_url`.
- **`CANOPY_WEBHOOK_SECRET` must be set in prod** before a real send wave (webhook currently bypasses verification when unset).

---

## 8. Acceptance criteria

1. `canopy-batch-initiate` deployed with `verify_jwt=false`; rejects any call lacking a valid `x-batch-secret` (constant-time) with 401; **no user JWT path exists.**
2. Given a list of N valid `account_id`s, the function mints/reuses exactly one open invite per account and returns a per-account result array; re-running the same list mints **0** new links (all `reused`) — proven by row counts before/after.
3. Each minted row has non-null `public_url` (a real `https://app.usecanopy.com/...` link), `public_alias`, `widget_id`, `account_id`, `status='invite_minted'`, `pull_type='attach_account_invite'`, and correct `agency_workspace_id` lineage.
4. The partial unique index prevents a second open invite per account (concurrent double-run raises a unique violation that is caught and resolved to `reused`).
5. Inactive / wrong-workspace / (optionally) no-contact accounts are skipped with explicit reasons; one bad account never aborts the batch.
6. Canopy `429`/5xx are retried with backoff; `4xx` fail fast; `BATCH_MAX_MINT` caps a run.
7. The send step can select all sendable invites via the §6 query with no further Canopy calls.
8. When a test consumer completes a minted link in sandbox, `canopy-webhook` links the pull to the correct `account_id` and creates the `coverage_gap_opportunities` + `tasks` rows (no duplicate `canopy_pulls`/invite row if the §5.1 chosen path is implemented).
9. **No data mutated and nothing sent during spec/dev verification beyond sandbox.**

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Canopy plan meters widgets/pulls** — minting 707–1,714 could exceed allowance or incur per-consumer cost | **High** | Confirm plan with Canopy rep first; `BATCH_MAX_MINT` pilot of ≤250; consider Strategy B (one shared widget) to avoid per-account objects |
| **`POST /widgets` exact request/response unverified in this codebase** (docs only) | **High** | Build agent validates in **sandbox** first; confirm `public_url`/`public_alias`/`widget_id`/`metadata` fields and link host before wiring storage |
| **Attribution leak (Strategy B):** shared-widget query params may not propagate to the webhook pull metadata | Med | Sandbox-validate metadata echo before adopting B; default to Strategy A (per-account widget) which is unambiguous |
| **`canopy_pull_id NOT NULL/UNIQUE`** forces a placeholder hack | Med | Prefer dedicated `canopy_invites` table; else synthetic id + webhook upgrade (§5.1) |
| **Duplicate `canopy_pulls` rows** on completion if webhook isn't taught the placeholder | Med | Use `canopy_invites` table (no webhook change) OR add the metadata-match upgrade to `canopy-webhook` |
| **Orphan Canopy widgets** (created at Canopy, DB insert failed) | Low | Structured audit log of `widget_id`; periodic `GET /widgets` reconciliation by metadata |
| **Webhook signature bypass** if `CANOPY_WEBHOOK_SECRET` unset | Med | Set the secret in prod before any send wave (cross-spec note §7) |
| **Sending to stale/expired links** | Low | `invite_expires_at` + business TTL (30d) + send-step query filters expired; optional sweeper cron |
| **Wrong base URL / auth copied from `canopy-initiate`** | Med | Spec pins correct values (§3.2): `app.usecanopy.com/api/v1.0.0` + `x-canopy-client-id/secret` headers |

---

*Sources for Canopy API facts: existing `canopy-webhook` outbound code (auth header pair, base host), `canopy-initiate` source (env var names, product list), and Canopy docs `https://docs.usecanopy.com/llms.txt` (endpoint inventory — confirms no `POST /pulls`, presence of `POST /widgets`, `Widget` schema with `public_alias`/`public_url`). All DB facts re-queried live against `lrqajzwcmdwahnjyidgv` on 2026-06-28.*
