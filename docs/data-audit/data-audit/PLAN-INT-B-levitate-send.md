# PLAN-INT-B — Levitate Compliant Send Path (Build-Ready Spec)

**Database:** InsureFlow / "Lewis Insurance App" (Supabase `lrqajzwcmdwahnjyidgv`)
**Workspace (single tenant):** `f1f07037-3032-45f8-93ca-72c0f47e4fbb` · active customer = `deleted_at IS NULL`
**Date:** 2026-06-28 · **Status: PLANNING ONLY — nothing here has been executed. Read-only SELECTs only. Do NOT enqueue, send, deploy, or mutate.**
**Scope:** The compliant SEND path that takes the Phase-0 cross-sell list (existing monoline customers, each carrying a pre-minted Canopy `public_url` from PLAN-INT-A) and delivers ONE personalized email per household through the existing "Levitate" marketing subsystem — gated by CAN-SPAM/state compliance, frequency caps, sender governor, full evidence logging, and a **mandatory human fire-gate with dry-run preview**. Minting the Canopy link is OUT OF SCOPE (PLAN-INT-A). SMS is OUT OF SCOPE for Phase-0 (email-first).

> **Read this first — the finding that shapes the whole spec.** Levitate's schema, governor, and automation processor are **fully built and deployed** (all 15 tables exist; all 6 edge functions ACTIVE). But the entire stack is keyed on `contacts.id` + `org_id`, and **the `contacts` table has 0 rows** and **has no `org_id` column**. The Phase-0 audience lives in `accounts` (1,714 active / 707 with email), keyed on `agency_workspace_id`. **Nothing is wired to send to `accounts`, no consent baseline exists, no governor config row exists, no templates exist, and the compliance engine is NOT called on the send path.** Phase-0 is therefore mostly *configuration, seeding, and an identity bridge* over an already-built engine — plus a thin enqueue+preview+fire layer. The engine's wiring also has several latent schema/RPC mismatches (§3) that must be fixed before a real send.

---

## 0. Verified anchors (re-queried live, 2026-06-28)

| Fact | Value | Source |
|---|---|---|
| Active accounts (`deleted_at IS NULL`) | **1,714** | live COUNT (per PLAN-INT-A) |
| ┗ active accounts with non-empty `email` | **707** | live COUNT |
| `contacts` rows (total) | **0** | live COUNT — **table is empty** |
| `contacts.org_id` column | **does not exist** (`contacts` keys on `account_id`, `household_id`; no workspace/org col) | `information_schema` |
| `accounts` identity column | **`agency_workspace_id`** (not `org_id`); has `state`, `email`, `phone`, `household_id` | `information_schema` |
| Levitate tables present | **all 15** | `information_schema` |
| Levitate edge functions present | **all 6 ACTIVE** (`marketing-send-governor` v85, `marketing-compliance-engine` v85, `marketing-automation-processor` v85, `marketing-unsubscribe` v85, `email-send` v395, `dispatch-outbox` v6) | `list_edge_functions` |
| `marketing_send_queue` rows | **0** | live COUNT |
| `marketing_send_queue_payloads` rows | **0** | live COUNT |
| `communication_preferences` rows | **0** — **no consent/suppression baseline** | live COUNT |
| `consent_ledger` rows | **0** | live COUNT |
| `contact_send_frequency` rows | **0** | live COUNT |
| `communication_evidence` / `communication_events` rows | **0 / 0** | live COUNT |
| `marketing_governor_config` rows | **0** — **governor runs on hardcoded DEFAULT_CONFIG** | live COUNT |
| `sender_pause_state` rows | **0** (nothing paused; no global-pause row exists) | live COUNT |
| `sender_health_metrics` rows | **0** | live COUNT |
| `marketing_email_templates` / `_versions` rows | **0 / 0** — **no templates** | live COUNT |
| `state_communication_rules` rows | **4** — seeded: CA, FL, NY, TX (all `earliest_hour=8, latest_hour=21`, `applies_to_lines=NULL`) | live |
| `prohibited_phrases` rows | **14 active** (e.g. "guarantee", "lowest rate", "best rate", "full coverage", "risk free", "act now", "limited time") | live |
| `external_service_health` rows | **4**, all `status='unknown'` (`email_provider`, `twilio_sms`, `twilio_voice`, `google_business_profile`) | live |
| RPC `check_frequency_cap` | **EXISTS** — `(p_org_id uuid, p_contact_id uuid, p_household_id uuid, p_classification text, p_channel text) RETURNS TABLE(allowed bool, reason text, …)` | `pg_proc` |
| RPC `claim_marketing_queue_items` | **MISSING** → governor uses fallback non-atomic claim | `pg_proc` |
| RPC `increment_contact_frequency` | **MISSING** → governor frequency-write silently no-ops | `pg_proc` |
| RPC `is_automation_enabled` | EXISTS (`p_feature text`) RETURNS bool | `pg_proc` |

---

## 1. Problem

Send each Phase-0 existing customer (monoline household, has email) a single personal email containing their pre-minted Canopy `public_url`, in a way that is **CAN-SPAM-compliant** (physical postal address present; working one-click opt-out honored; existing-business-relationship basis; accurate from/subject), **state-aware** (FL + others), **frequency-capped**, **rate-limited / sender-health-aware**, **fully evidenced** for audit, and **never auto-sends** — a human must explicitly fire after reviewing a dry-run preview (who, content, pass/fail counts).

The Levitate engine to do all of this **already exists and is deployed**, but cannot run for Phase-0 today because of five concrete blockers:

1. **Audience/identity mismatch.** Queue, preferences, frequency, evidence all require `to_contact_id` (uuid into `contacts`) and `org_id`. `contacts` is empty; `contacts` has no `org_id`; the audience is in `accounts` keyed by `agency_workspace_id`. There is no bridge.
2. **No consent/suppression baseline.** `communication_preferences` has 0 rows. The governor's suppression check (`do_not_contact`, `do_not_market`, `deceased`, channel opt-outs) reads this table; with no rows it returns "not suppressed" for everyone — i.e., **no suppression is actually enforced** and there is no opt-out list to honor yet.
3. **No governor config and no global-pause row.** `marketing_governor_config` is empty → governor silently falls back to `DEFAULT_CONFIG`. `sender_pause_state` is empty → there is no "global" row to flip for an emergency stop or for the fire-gate's "armed/disarmed" control.
4. **No templates and the compliance engine is not on the send path.** `marketing_email_templates` is empty. `marketing-compliance-engine` (which checks CAN-SPAM unsubscribe + postal address + prohibited phrases + state) is a **separate, JWT-gated, pre-send/template-time validator** that the governor **never calls**. So content can reach the wire without a postal address or a working opt-out unless we add an explicit gate.
5. **No enqueue path for a list, and no human fire-gate / dry-run.** The only enqueue path that exists (`marketing-automation-processor`) enqueues per-`contact_id` from automation enrollments, and even it does **not** populate `unsubscribe_url` / `postal_address` on the payload. There is no "enqueue this Phase-0 batch" entrypoint, no preview, and nothing that requires a human to fire.

---

## 2. What EXISTS today (inventory of the live Levitate contracts)

### 2.1 Tables (columns verified live; "populated?" from live counts)

- **`marketing_send_queue`** (0 rows) — the work queue. Key cols: `id`, `org_id` (NOT NULL), `idempotency_key` (NOT NULL), `priority` (def 5), `scheduled_for` (NOT NULL), `channel` (NOT NULL), `classification` (NOT NULL), `from_user_id` (NOT NULL), `to_contact_id`, `to_account_id`, `to_email`, `to_phone`, `household_id`, `household_dedupe_key`, `preferences_version_at_queue`, `source_type` (NOT NULL), `source_id`, `automation_step_id`, `automation_enrollment_id`, `status` (def `pending`), `processor_id`, `claimed_at`, `claim_expires_at`, `attempts`, `max_attempts` (def 3), `next_retry_at`, `last_error`, `sent_at`, `provider_message_id`, `communication_evidence_id`. **Note:** `from_user_id` is NOT NULL — a real `profiles.id` (the producer "from") is required on every row.
- **`marketing_send_queue_payloads`** (0 rows) — content, 1:1 by `queue_id` (NOT NULL). Cols: `org_id`, `channel`, `email_subject`, `email_body_html`, `email_body_text`, `email_headers` (jsonb), `email_attachments`, `sms_*`, `compliance_validated` (def false), `compliance_classification`, **`unsubscribe_url`**, **`postal_address`**, `disclaimers_applied`, `template_id`, `template_version_id`, `merge_context` (jsonb). **These two CAN-SPAM fields exist but the existing enqueue path leaves them NULL.**
- **`communication_preferences`** (0 rows) — consent + suppression, keyed `org_id` + (`contact_id` | `account_id` | `household_id`). Channel flags default **true** (`email_marketing`, `email_transactional`, `sms_*`, `mail_marketing`, `phone_marketing`), `purpose_preferences` jsonb (incl. `cross_sell:true`), kill switches `do_not_contact`/`do_not_market`/`deceased`/`active_claim_suppression` (def false), `temporary_suppression_until`/`_reason`, `version` (def 1, used for stale-check), consent timestamps/sources, `agency_workspace_id`. **Defaults mean: an absent row = "allowed".** Unique conflict target used by code: `(org_id, contact_id)`.
- **`consent_ledger`** (0 rows) — immutable opt-in/opt-out audit. `org_id`, `contact_id`, `email`, `phone`, `channel` (NOT NULL), `action` (NOT NULL — `opt_out`/`opt_in`/`preference_change`), `purpose`, `source` (NOT NULL), `source_details` jsonb, `ip_address`, `user_agent`, `consent_text_shown`, `recorded_by`, `recorded_at`. Written by `marketing-unsubscribe`.
- **`contact_send_frequency`** (0 rows) — per-contact-per-day counters. `org_id`, `contact_id` (NOT NULL), `household_id`, `date` (NOT NULL), `marketing_count`/`relationship_count`/`transactional_count`/`email_count`/`sms_count`. Read by `check_frequency_cap` RPC.
- **`state_communication_rules`** (4 rows: CA/FL/NY/TX) — `state_code` (NOT NULL), `earliest_hour`/`latest_hour` (quiet-hours, all 8–21), `required_disclaimers` jsonb, `prohibited_phrases` array, `post_purchase_quiet_days`/`post_claim_quiet_days`/`post_cancellation_quiet_days`, `applies_to_lines`, `is_active`. **Note the column is `required_disclaimers`/`prohibited_phrases`; the compliance engine code reads `required_disclosures`/`regulation_name` — a name mismatch (§3.4).**
- **`prohibited_phrases`** (14 active) — `phrase` (NOT NULL), `applies_to_channels` (def `{email,sms}`), `applies_to_lines`, `applies_to_states`, `severity` (def `block`), `reason`, `regulatory_reference`, `is_active`, `org_id` (nullable → global rule).
- **`communication_evidence`** (0 rows) — the compliance/audit record per sent message. Rich schema incl. `org_id` (NOT NULL), `message_type`, `classification`, `message_id`/`in_reply_to`/`references_chain`/`thread_id`, from/to identity, `subject`, `body_html`/`body_text`, `attachments`, `included_unsubscribe` (bool), `included_postal_address` (bool), `compliance_footer_text`, `disclaimers_applied`, `template_id`/`template_version_id`, `source_type`/`source_id`, `automation_*`, `campaign_id`, `provider_message_id`, `created_at`. **Written by the governor on every successful send.**
- **`communication_events`** (0 rows) — per-evidence lifecycle events. `org_id` (NOT NULL), `evidence_id` (NOT NULL), `event_type` (NOT NULL — `sent`/`opened`/`clicked`/…), `event_data` jsonb, `occurred_at`, `source`. Governor inserts a `sent` event; opens/clicks/bounces require a provider webhook (NOT built — §4.7).
- **`sender_health_metrics`** (0 rows) — daily per-scope deliverability. `scope_type`/`scope_id`/`metric_date`, `emails_sent`/`delivered`/`bounces_hard`/`bounces_soft`/`complaints`/`unsubscribes`/`opens`/`clicks`/`replies`, `bounce_rate`/`complaint_rate`/`open_rate`/`click_rate`, `health_status`. Nothing writes this yet.
- **`marketing_email_templates`** (0 rows) + **`_versions`** (0 rows) — versioned templates. Template: `name`, `category`, `message_classification` (def `marketing`), `current_version_id`, `applies_to_lines`, `ai_generated`/`ai_certified`, `is_active`/`is_archived`. Version: `version_number`, `subject`, `body_html`, `body_text`, `merge_fields_used`, `compliance_validated`(+`_at`/`_issues`), `state_variations` jsonb, `preview_text`.
- **`marketing_governor_config`** (0 rows) — **actual columns:** `per_user_hourly_limit` (50), `per_user_daily_limit` (500), `marketing_per_contact_per_day` (2), `marketing_per_contact_per_week` (5), `marketing_per_household_per_day` (2), `business_hours_start`(9)/`business_hours_end`(17)/`business_days`({1..5})/`org_timezone`('America/New_York'), `holiday_dates`, `transactional_bypasses_hours`, `pause_on_bounce_rate`(0.05)/`pause_on_complaint_rate`(0.001)/`pause_on_error_rate`(0.10), `max_concurrent_sends`(10), `jitter_max_seconds`(30). **These do NOT match the column names the governor code reads (§3.1).**
- **`sender_pause_state`** (0 rows) — kill switch. `scope_type`/`scope_id`, `is_paused`, `marketing_paused`/`relationship_paused`/`transactional_paused`, `paused_reason`/`paused_by_user_id`/`paused_at`, `auto_resume_at`/`resumed_at`/`resumed_by`.
- **`external_service_health`** (4 rows, all `status='unknown'`) — `service_name`, `status`, `circuit_open`(+`_until`), `consecutive_failures`, `last_*_at`, latency/req counters. Seeded names: `email_provider`, `twilio_sms`, `twilio_voice`, `google_business_profile`. **Governor reads `is_healthy` and service names `postmark`/`sendgrid`/`twilio` — both mismatch the seed (§3.2).**

### 2.2 Edge functions (live contracts)

- **`marketing-send-governor`** (`verify_jwt=false`; cron-style; **no auth header check in code** — relies on platform). **This is the actual sender.** Flow per invocation: load config (→ falls back to DEFAULT, §3.1) → `checkGlobalPause` (reads `sender_pause_state` scope `global`.`is_paused`) → `checkServiceHealth` (§3.2, currently always "healthy") → reclaim orphaned claims → claim a batch (RPC `claim_marketing_queue_items`, **missing → fallback** select+update `status='pending'→'claimed'`, batch 50) → for each: preference-stale check (version) → **frequency cap** (RPC `check_frequency_cap`, §3.3 arg mismatch) → household dedupe (`household_dedupe_key` already `sent`) → **suppression** (reads `communication_preferences`: `do_not_contact`/`deceased`/`do_not_market`/temp-suppression/channel opt-out) → **send** (`sendEmail`: POST Postmark `/email`, `MessageStream='broadcast'` for marketing, sets `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers **only if `payload.unsubscribe_url` is present**; SendGrid alt) → on success **insert `communication_evidence`** (sets `included_unsubscribe = !!unsubscribe_url`) + **insert `communication_events` `sent`** + `markSent` (queue `status='sent'`, `provider_message_id`, `communication_evidence_id`) + `updateFrequencyTracking` (RPC `increment_contact_frequency`, **missing → no-op**). Failure → retry (5 min, `max_attempts`) or `failed`. Statuses written: `sent`/`failed`/`suppressed`/`rate_limited`/`preference_stale`/`pending`. Env it needs: `EMAIL_PROVIDER` (def postmark), `EMAIL_PROVIDER_API_KEY`, `OUTBOUND_FROM`, (`TWILIO_*` for SMS). **Output:** JSON `{success, processor_id, duration_ms, stats:{processed,sent,failed,suppressed,rate_limited,preference_stale}}`.
  - **Critical:** the governor does **NOT** call `marketing-compliance-engine`. It does **NOT** itself verify postal-address presence; it only forwards whatever HTML is in the payload and records `included_unsubscribe`/`included_postal_address` flags (and only sets the unsubscribe HEADER if `unsubscribe_url` is non-null). **CAN-SPAM correctness is entirely the responsibility of whatever fills the payload** — today nothing guarantees it.
- **`marketing-compliance-engine`** (`verify_jwt=false` but **`requireAuth` in code → needs a user Bearer JWT**). Input `{content_type:'email'|'sms', subject?, body_html?, body_text?, sms_message?, recipient_state?, classification?, template_id?, validate_merge_fields?, merge_context?}`. Checks: prohibited phrases (built-in list + `prohibited_phrases` table by org/channel), state rules (by `recipient_state`), **CAN-SPAM** (`marketing` requires unsubscribe-link text + postal-address pattern in body; `relationship` requires unsubscribe only; `transactional` neither), TCPA (SMS), merge-field presence, subject-line hygiene, SMS length. **Output `{valid, score 0-100, issues[], classification, can_send, requires_review}`.** This is the right CAN-SPAM gate — but it is **content-only** (it cannot see suppression/consent), **JWT-gated**, and **not invoked anywhere in the send path**. (Postal-address check is a loose regex; unsubscribe check is keyword-presence.)
- **`marketing-unsubscribe`** (`verify_jwt=false`, **public by design**). **This is the working opt-out path** and satisfies "working one-click opt-out honored." Routes (path suffix): `/one-click` (RFC 8058 `List-Unsubscribe-Post`, returns 200, no UI), `/link` (HTML confirm→success page), `/preferences` (preference-center upsert), `/sms-stop` (Twilio STOP/START keywords), `/verify` (token introspection). On opt-out it **upserts `communication_preferences`** (`email_marketing=false` etc., conflict `(org_id,contact_id)`), **inserts immutable `consent_ledger`** (`action='opt_out'`, captures IP/UA), and **cancels active `marketing_automation_enrollments`**. Tokens are HMAC-SHA256 `base64(json).sig`, **90-day expiry**, require env **`UNSUBSCRIBE_SECRET`**; payload `{contact_id, org_id, email, channel, purpose?, expires_at, message_id?}`; token also re-verifies the contact exists. **Exports `generateUnsubscribeToken(...)`** — the canonical way to build the `unsubscribe_url`. **Consequence for Phase-0:** the opt-out token is **contact_id + org_id based**; with no contacts/org_id, the bridge in §4.1 must supply both, or the token scheme must be extended to account-based (§3.5).
- **`email-send`** (`verify_jwt=false` + **`requireAuth` → user JWT**). **NOT the marketing sender.** It is the **support/ticket reply** path: input `{ticketId, to, subject, body, inReplyTo}`, Postmark `MessageStream='outbound'`, **no List-Unsubscribe headers, no postal address, no evidence**, logs to `ticket_messages`. **Do NOT route Phase-0 marketing through `email-send`.** (The PLAN mandate's phrase "send via email-send" is corrected here: Phase-0 sends via the **governor's** `sendEmail` Postmark `broadcast` path.)
- **`dispatch-outbox`** (`verify_jwt=false`, `X-Cron-Secret` gated). **Unrelated to email.** Relays `automation_event_outbox` rows to an **n8n** webhook (`N8N_EVENT_WEBHOOK_URL`, secret `N8N_WEBHOOK_SECRET`), gated by `is_automation_enabled` kill switch. Listed in the mandate but **out of band** for the email send; mention only as "not used by Phase-0."
- **`marketing-automation-processor`** (`verify_jwt=false`, cron-style). The **enqueue engine** for drip automations: claims due `marketing_automation_step_executions`, and on a `send_email` step **INSERTs `marketing_send_queue` + `_payloads`** (`classification='marketing'`, idempotency `automation-{enrollment}-{step}-email`, pulls contact email from `contacts`, applies `{{merge}}` fields, resolves `template_id`→current version). **It does NOT set `unsubscribe_url` or `postal_address`** on the payload, and it is **contact/enrollment-driven** (not a "send this list" entrypoint). It is the model to copy, but a **batch enqueuer is needed** (§4.2).

### 2.3 What this means: ALREADY WORKS vs MISSING (summary)

**Already works (deployed, correct):**
- The queue → claim → send → evidence pipeline (governor), incl. retry, orphan reclaim, household dedupe, preference-stale check, suppression read, and Postmark `broadcast` send with one-click List-Unsubscribe headers.
- The opt-out subsystem (`marketing-unsubscribe`): RFC 8058 one-click, preference center, SMS STOP, immutable `consent_ledger`, enrollment cancellation, HMAC token mint/verify.
- The content compliance checker (`marketing-compliance-engine`): prohibited phrases, CAN-SPAM unsubscribe+postal, state rules, subject hygiene — **as a callable validator**.
- Seed data for `state_communication_rules` (CA/FL/NY/TX) and `prohibited_phrases` (14).

**Missing / must be built or fixed for Phase-0 (detail in §3–§4):**
1. **Identity bridge** account → contact/org (the audience does not exist in the contact-keyed schema).
2. **Consent/suppression seeding** (per the DB-cleanup result) so suppression actually means something + an opt-out **suppression list** that is honored.
3. **Governor config row + schema/RPC fixes** (config columns, health columns/names, `check_frequency_cap` arg list, missing claim/increment RPCs).
4. **A CAN-SPAM-correct Phase-0 template** (with postal address + `{{unsubscribe_url}}` + EBR framing) and **the sending domain/Postmark broadcast stream + env** (`EMAIL_PROVIDER_API_KEY`, `OUTBOUND_FROM`, `UNSUBSCRIBE_SECRET`, DKIM/SPF/DMARC).
5. **A batch enqueuer** that compliance-gates each recipient and fills `unsubscribe_url` + `postal_address` on the payload, plus **a human fire-gate + dry-run preview** (§6).
6. **Provider event ingestion** (Postmark bounce/complaint/open webhook → `communication_events` + `sender_health_metrics`) so opt-out-by-complaint, bounce suppression, and auto-pause thresholds work.

---

## 3. Latent bugs / contract mismatches the build agent MUST fix before any real send

These are real and will silently degrade compliance if left as-is.

**3.1 Governor config is never loaded.** `loadGovernorConfig` selects `marketing_governor_config` with `.eq('is_active', true)` and reads `max_emails_per_minute_per_sender`, `batch_size`, `claim_timeout_seconds`, `circuit_breaker_threshold`. **None of those columns exist** (table has `is_active`? — no; it has `per_user_hourly_limit`, `marketing_per_contact_per_day`, `business_hours_*`, `pause_on_*`, `max_concurrent_sends`, `jitter_max_seconds`). Result: query returns nothing/errors → **always DEFAULT_CONFIG**, and **business-hours / per-contact-per-day / pause-rate config is entirely ignored.** Fix: either (a) reconcile the governor to read the real columns (and add a quiet-hours/business-days guard it currently lacks), or (b) add the code's expected columns. Recommend (a) + add quiet-hours enforcement using `business_hours_*`/`org_timezone`/`state_communication_rules.earliest/latest_hour`.

**3.2 Service-health check is a no-op.** `checkServiceHealth` filters `service_name IN ('postmark','sendgrid','twilio')` and reads `is_healthy`. The table has rows named `email_provider`/`twilio_sms`/… and column `status` (no `is_healthy`). With no match it defaults `hasHealthyEmail = true`. Result: **circuit breaker never trips.** Fix: align service names + read `status`/`circuit_open`.

**3.3 Frequency cap mismatch → cap not enforced.** Governor calls `check_frequency_cap(p_org_id, p_contact_id, p_channel)` and expects a scalar boolean. The actual RPC signature is `(p_org_id, p_contact_id, p_household_id, p_classification, p_channel) RETURNS TABLE(allowed bool, …)`. The 3-arg call won't resolve → error caught → `?? true` → **cap allows everyone.** Fix: call with the correct 5 args and read `.allowed` (per-contact/day=2, /week=5, per-household/day=2 come from config once §3.1 is fixed).

**3.4 State-rules column name mismatch.** `checkStateRules` reads `rule.required_disclosures` and `rule.regulation_name`; the table columns are `required_disclaimers` and (no `regulation_name`; has `source_reference`/`notes`). State disclosure enforcement silently does nothing. Fix the field names.

**3.5 Missing RPCs.** `claim_marketing_queue_items` (atomic claim) and `increment_contact_frequency` are absent. The governor's fallback claim is **not race-safe** (two concurrent governors could double-send). For a single cron at low volume this is tolerable; for safety, **build the atomic claim RPC** (e.g. `FOR UPDATE SKIP LOCKED`). Build `increment_contact_frequency` so `contact_send_frequency` actually accrues (otherwise the cap, once fixed, can't see today's count).

**3.6 `markFailed` bug.** Governor's `markFailed` assigns a Supabase query Promise to the `attempts` column in an `.update()` — invalid; attempts won't increment on hard-fail. Fix to a numeric increment.

**3.7 Opt-out token is contact-based.** `generateUnsubscribeToken`/`decodeToken` require `{contact_id, org_id}` and re-verify the contact row exists. Phase-0 has neither. **Decision (see §4.1):** create one `contacts` row per Phase-0 account (the bridge), so the existing token + suppression + `consent_ledger` all work unchanged. (Alternative: extend the token/handler to accept `account_id`; more code, touches the proven opt-out path — not recommended.)

---

## 4. End-to-end Phase-0 flow (target design)

ASCII overview:

```
[accounts: 707 w/ email]                       ┌── PLAN-INT-A: canopy_invites.public_url (per account/household)
        │                                       │
        ▼ (one-time)                            ▼
 (4.1) Identity bridge  ───────────────►  (4.2) phase0-batch-enqueue  (NEW edge fn, service-role + X-Cron-Secret)
   ensure contacts row + org_id +                │  for each target household:
   communication_preferences row                 │   • resolve to_contact_id, org_id, email, state, household_id
                                                  │   • load template + merge {{first_name}},{{agent}},{{canopy_url}},{{unsubscribe_url}},{{postal_address}}
                                                  │   • CALL marketing-compliance-engine (service-role variant) → can_send?
                                                  │   • compute unsubscribe_url via generateUnsubscribeToken(contact,org)
                                                  │   • DRY-RUN: just record would-send + pass/fail  (NO insert)
                                                  │   • FIRE: insert marketing_send_queue + _payloads
                                                  ▼                       (status=pending, scheduled_for=now/quiet-hours-aware)
                                         (4.3) HUMAN FIRE-GATE  ── preview must be reviewed; arm token required (§6)
                                                  │
                                                  ▼
                  (cron, ~1/min)  (4.4) marketing-send-governor
                     pause? health? claim batch → per item:
                       preference-stale → frequency cap → household dedupe → suppression
                       → sendEmail (Postmark broadcast + List-Unsubscribe one-click)
                       → insert communication_evidence (+ included_unsubscribe/postal flags)
                       → insert communication_events 'sent'
                       → markSent + increment_contact_frequency
                                                  │
                              ┌───────────────────┴───────────────────┐
                              ▼                                        ▼
              (4.5) recipient clicks opt-out            (4.7) Postmark webhook (NEW)
                marketing-unsubscribe/one-click           bounce/complaint/open/click
                → communication_preferences off           → communication_events
                → consent_ledger opt_out (immutable)      → sender_health_metrics
                → cancel enrollments                      → auto-suppress hard-bounce/complaint
                                                          → governor auto-pause on thresholds
```

**(4.1) Identity bridge (one-time, build step).** For each Phase-0 account (active, has email, single tenant): ensure a `contacts` row exists linked via `account_id` + `household_id`, carrying `email`/`first_name`/`last_name`. Because `contacts` has **no `org_id`**, the Levitate `org_id` must be sourced consistently — **decision:** use the single-tenant workspace `f1f07037-…` as `org_id` everywhere in the Levitate tables (queue/preferences/evidence all take `org_id uuid`; there is exactly one tenant). Document that `org_id == agency_workspace_id == f1f07037-…` for this deployment. Also create the `communication_preferences` baseline row per contact (so suppression/consent state is explicit and versioned), seeded from the DB-cleanup decisions (DNC/deceased/opt-outs already known → set `do_not_contact`/`deceased`/`do_not_market`). **This bridge is the single biggest build item.** (If the team prefers not to populate `contacts`, the alternative is to make the whole send path account-keyed — far larger surface; not recommended.)

**(4.2) Batch enqueue (NEW edge function `phase0-batch-enqueue`).** Service-role; gated by `X-Cron-Secret`/shared secret (reuse `verifyCronSecret`); `verify_jwt=false`. Input `{ mode:'dry_run'|'fire', segment:'phase0' | account_ids?:uuid[], template_id:uuid, from_user_id:uuid, scheduled_for?:iso, limit?:int }`. For each resolved household (dedupe to ONE recipient per `household_id` — prefer the primary contact with email):
  1. Resolve `to_contact_id`, `org_id`(=workspace), `to_account_id`, `to_email`, `household_id`, recipient `state` (from `accounts.state`).
  2. Pull the Canopy `public_url` from PLAN-INT-A's source-of-truth (`canopy_invites` else `canopy_pulls` where `pull_type='attach_account_invite'`); **skip with reason `no_invite`** if absent/expired.
  3. Render template → fill merge context incl. `{{first_name}}`, `{{agent_name}}`, `{{canopy_url}}`, **`{{postal_address}}`** (agency physical address — REQUIRED), **`{{unsubscribe_url}}`** = `${SUPABASE_URL}/functions/v1/marketing-unsubscribe/one-click?token=` + `generateUnsubscribeToken({contact_id,org_id,email,channel:'email',purpose:'cross_sell'})`.
  4. **Call `marketing-compliance-engine`** with the rendered `subject`/`body_html`/`recipient_state`/`classification:'marketing'`. Gate on `can_send` (block on any `error`-severity issue, incl. missing unsubscribe/postal/prohibited-phrase/deceptive-subject). Record `score`/`issues`. **Build a service-role-callable compliance entrypoint** (today it is JWT-gated; add a variant or internal function-to-function call with the service key, OR refactor the validator into a shared module both functions import).
  5. **Frequency/suppression pre-check (read-only):** also evaluate `communication_preferences` (DNC/opt-out/channel/temp-suppression) and `check_frequency_cap` for the recipient now, so the preview's "pass/fail" reflects what the governor will do (the governor re-checks at send; this is for an accurate dry-run).
  6. **If `mode='dry_run'`** → DO NOT insert; append `{account_id, household_id, to_email(masked), template, subject, compliance_pass, compliance_issues, suppressed?(reason), freq_ok?, would_send:bool}` to the preview result. **If `mode='fire'`** (and only if armed, §6) → insert `marketing_send_queue` (`status='pending'`, `classification='marketing'`, `source_type='phase0_crosssell'`, `from_user_id`, `household_dedupe_key='phase0:'||household_id`, `idempotency_key='phase0:'||household_id||':'||template_id`, `scheduled_for` honoring quiet hours) + `marketing_send_queue_payloads` (subject/html/text, **`unsubscribe_url`**, **`postal_address`**, `compliance_validated=true`, `compliance_classification`, `template_id`/`version`, `merge_context`). Idempotency key guarantees re-fire enqueues 0 duplicates.
  7. Return summary `{mode, requested, would_send, blocked_compliance, suppressed, no_invite, enqueued (fire only), errors[]}`.

**(4.3) Human fire-gate** — see §6 (mandatory; nothing in 4.2 inserts unless explicitly armed + fired).

**(4.4) Governor send** — existing function (after §3 fixes). Runs on cron; claims `pending` Phase-0 rows; re-applies preference-stale, **frequency cap (fixed)**, household dedupe, **suppression (now meaningful)**; sends via Postmark `broadcast` with one-click List-Unsubscribe; writes evidence + `sent` event; marks queue `sent`. Quiet-hours/business-hours guard to be added (§3.1).

**(4.5) Opt-out processing** — existing `marketing-unsubscribe`. One-click + preference-center + SMS STOP already write `communication_preferences` + immutable `consent_ledger` + cancel enrollments. The governor's next pass honors the new preference (and the `version` bump trips `preference_stale` for anything mid-flight). **This is the "process unsubscribes" requirement, already satisfied** — provided (a) `UNSUBSCRIBE_SECRET` is set, (b) the token is minted in 4.2 with a valid `contact_id`/`org_id`, and (c) the opt-out URL host is publicly reachable (it is, via the function URL; an optional friendly domain/route can front it).

**(4.6) Suppression list** — the union of `communication_preferences` rows where `do_not_contact OR do_not_market OR deceased OR email_marketing=false OR temporary_suppression_until>now()` IS the live suppression list. Seed it from the DB-cleanup outcomes; thereafter it grows via opt-outs (4.5) and bounce/complaint ingestion (4.7). No separate table needed.

**(4.7) Provider event ingestion (NEW, required for real compliance).** Build a `postmark-webhook` (or extend an existing inbound) to receive Postmark `Bounce`/`SpamComplaint`/`Open`/`Click`/`Delivery` events → insert `communication_events` (match by `provider_message_id` → `communication_evidence`) and upsert `sender_health_metrics` (daily). On **hard bounce** → set `communication_preferences.email_marketing=false` (or a bounce-suppression flag) + `consent_ledger` `action='bounce_suppress'`; on **spam complaint** → `do_not_market=true` + `consent_ledger` `opt_out`. Feed `bounce_rate`/`complaint_rate` into the governor auto-pause (`pause_on_bounce_rate`/`pause_on_complaint_rate`) by flipping `sender_pause_state` global. Without this, CAN-SPAM "honor opt-outs / don't keep mailing dead or complaining addresses" and sender-reputation protection are not closed loops.

---

## 5. Compliance gates (explicit mapping to the law + where each is enforced)

| Requirement | Where enforced (target) | Status today |
|---|---|---|
| **CAN-SPAM: conspicuous physical postal address** | Template includes `{{postal_address}}`; **`marketing-compliance-engine`** checks address pattern at enqueue; payload `postal_address` set; evidence `included_postal_address=true` | **Build:** address regex is loose (improve to assert the agency's actual address string); engine not yet on path |
| **CAN-SPAM: working opt-out, honored ≤10 business days** | `marketing-unsubscribe` one-click + List-Unsubscribe header (governor sets it when `unsubscribe_url` present); opt-out writes prefs immediately; governor suppresses next pass | **Works** once `unsubscribe_url` minted in 4.2 + `UNSUBSCRIBE_SECRET` set |
| **CAN-SPAM: one-click (RFC 8058)** | governor sends `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`; `/one-click` returns 200 | **Works** (header only added when `unsubscribe_url` non-null — so 4.2 MUST set it) |
| **CAN-SPAM: accurate from / non-deceptive subject; no fake Re:/Fwd:** | compliance engine subject checks; `OUTBOUND_FROM` is the real agency sender | **Build:** ensure engine on path; set From |
| **Existing-business-relationship basis (transactional/relationship framing)** | Audience = existing customers (accounts with policies); `classification='marketing'` but EBR documented; cross-sell purpose pref defaults true | **Works** (audience), **document** EBR in evidence/source_type |
| **FL + state rules (quiet hours, disclaimers, post-event quiet days)** | `state_communication_rules` (FL/CA/NY/TX seeded); compliance engine state check (after §3.4 fix); governor quiet-hours guard (after §3.1) | **Partial:** seeded but engine reads wrong column names; quiet-hours not enforced by governor |
| **Prohibited phrases (insurance puffery)** | `prohibited_phrases` (14 active) + built-in list in compliance engine; `severity='block'` fails `can_send` | **Works** as a validator; **must be on path** (4.2 step 4) |
| **Suppression / opt-out / DNC / deceased** | `communication_preferences` kill switches; governor `checkSuppressionRules`; bounce/complaint feed (4.7) | **Build:** table empty → seed baseline; otherwise enforces nothing |
| **Frequency cap (per contact/household/day/week)** | `check_frequency_cap` RPC + `contact_send_frequency` + governor | **Build:** fix arg mismatch (§3.3) + build `increment_contact_frequency` (§3.5) |
| **Provider reputation / auto-pause** | `sender_health_metrics` + `pause_on_*` thresholds + `sender_pause_state` | **Build:** ingestion (4.7) + config wiring (§3.1) |

---

## 6. THE HUMAN FIRE-GATE + DRY-RUN (CRITICAL — nothing auto-sends)

**Principle: two independent stops between "list" and "wire."** (1) Nothing is enqueued without an explicit human "fire". (2) Even an enqueued batch will not actually send unless the global sender is "armed" (un-paused) — and it starts **paused**.

**6.1 Default-safe posture.**
- **Seed `sender_pause_state` with a `global` row `is_paused=true` (and `marketing_paused=true`) before anything else.** The governor checks this first and exits early — so even if rows are enqueued, **zero send** until a human flips it. This row does not exist today and MUST be created as part of setup.
- `phase0-batch-enqueue` defaults to `mode='dry_run'`. `mode='fire'` is rejected unless an **arm token** is supplied (a short-lived `BATCH_ARM_SECRET` / one-time code the operator pastes), AND `dry_run` was run within the last N minutes for the same segment+template (enforce by requiring the caller to pass back the `preview_id`/hash from the dry-run).

**6.2 Dry-run preview (required before fire).** `mode='dry_run'` returns, without inserting anything:
- **Who would receive:** count + per-recipient list `{account_id, household_id, masked email, state, has_canopy_invite}`. Households deduped to one recipient.
- **What they'd get:** resolved `subject` + a rendered sample `body_html` (with real merge values for 1–3 sample recipients), the `template_id`/version, and the exact `unsubscribe_url` + `postal_address` that will be embedded.
- **Compliance pass/fail counts:** `{would_send, blocked_compliance (with issue breakdown by code/severity), suppressed (by reason: do_not_contact/deceased/opt_out/channel/temp), no_invite, frequency_blocked}`. Each blocked recipient lists its reasons.
- **Totals** + a `preview_id` (hash of segment+template+audience snapshot) the operator must echo to fire.

**6.3 Fire (explicit, human).** Operator reviews the preview, then calls `mode='fire'` with `{preview_id, arm_token}`. The function: re-resolves the audience, re-checks each recipient (compliance + suppression + freq), **inserts only the `would_send` set** into `marketing_send_queue`/`_payloads` (`status='pending'`), and returns `{enqueued, skipped_changed_since_preview}`. **It still does not send** — the governor does, and only after a human separately flips `sender_pause_state.global.is_paused=false` (the "go live" switch), ideally with a small `BATCH_MAX_ENQUEUE` cap (e.g. ≤50) for the first pilot wave.

**6.4 Abort / kill switch.** Flipping `sender_pause_state.global.is_paused=true` halts the governor immediately; `pending` rows simply wait. A "drain/cancel" admin action can set remaining `pending` Phase-0 rows to `cancelled`.

**6.5 No auto-enrollment.** Do **not** wire Phase-0 to `marketing-automation-processor` (which would enqueue on triggers automatically). Phase-0 uses the explicit batch enqueuer only, so the human fire-gate cannot be bypassed by an automation trigger.

---

## 7. Sending domain / infrastructure checklist (must verify before a real wave)

- **Email provider creds:** `EMAIL_PROVIDER=postmark`, `EMAIL_PROVIDER_API_KEY` (a **server token whose "broadcast" message stream exists** — the governor uses `MessageStream:'broadcast'` for marketing), `OUTBOUND_FROM` (the agency's real, authenticated From address). Confirm the Postmark server has both `outbound` and `broadcast` streams.
- **Domain auth:** SPF, DKIM, and DMARC aligned for the `OUTBOUND_FROM` domain (required for `broadcast`/bulk and for deliverability). Verify in Postmark + DNS.
- **`UNSUBSCRIBE_SECRET`** set (else `marketing-unsubscribe` rejects every token and `generateUnsubscribeToken` throws → no opt-out link can be built).
- **Opt-out URL reachability:** `${SUPABASE_URL}/functions/v1/marketing-unsubscribe/one-click` is public; optionally front with a friendly path. Confirm List-Unsubscribe-Post POSTs land on `/one-click`.
- **`external_service_health`** updated to reflect the real provider (rename to/maintain a `postmark` row, or fix the governor to read `email_provider`/`status` per §3.2) so the health gate is meaningful.
- **`CRON_SECRET`** set (used by `phase0-batch-enqueue` arm path and any cron). **`marketing_governor_config`** seeded with one active row (and §3.1 reconciled).
- **`sender_pause_state` global row** created with `is_paused=true` (§6.1).
- **Postmark webhook** endpoint (4.7) configured in Postmark → bounce/complaint/open.

---

## 8. Acceptance criteria

1. **Default-safe:** with the system "as shipped" (global pause row = paused, enqueuer in dry-run), a full Phase-0 run sends **zero** emails; `marketing_send_queue` gains 0 rows in dry-run.
2. **Identity bridge:** every Phase-0 account with email has exactly one linked `contacts` row + one `communication_preferences` baseline row; `org_id` = `f1f07037-…` consistently; opt-out tokens mint and verify for those contacts.
3. **Dry-run preview** returns who/what/compliance-counts (would_send, blocked_compliance by issue, suppressed by reason, no_invite, frequency_blocked) and a `preview_id`, inserting nothing.
4. **Fire requires human + arm token + matching preview_id;** absent any, `mode='fire'` is rejected. On fire, only the `would_send` set is enqueued; re-firing the same segment/template enqueues **0** duplicates (idempotency key per household).
5. **CAN-SPAM on the wire:** every enqueued payload has non-empty `postal_address` and a working `unsubscribe_url`; the sent email carries `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`; `communication_evidence.included_unsubscribe` and `included_postal_address` are true. A test recipient's one-click opt-out flips `communication_preferences.email_marketing=false`, writes an immutable `consent_ledger` `opt_out`, and the **next governor pass suppresses that recipient** (verified).
6. **Compliance gate is on the path:** a payload containing a prohibited phrase, a missing postal address, a deceptive `Re:` subject, or a state-prohibited phrase is **blocked at enqueue** (counted in the dry-run, never enqueued).
7. **Frequency cap enforced:** `check_frequency_cap` is called with the correct 5 args and `.allowed` honored; `contact_send_frequency` accrues via `increment_contact_frequency`; a second same-day marketing send to the same contact is rate-limited.
8. **State/quiet-hours:** FL (and CA/NY/TX) recipients are not scheduled/sent outside 8–21 local; state column-name fix (§3.4) verified by a unit check.
9. **Governor fixes:** config row is actually loaded (no silent DEFAULT fallback); service-health reads the real provider row; `markFailed` increments attempts. Concurrent governor invocations do not double-send (atomic claim).
10. **Auto-pause loop:** a simulated complaint/bounce above threshold flips `sender_pause_state` global to paused; the governor stops on the next pass.
11. **No data mutated and nothing sent during spec/dev verification beyond a controlled sandbox/test send to an internal address.**

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Engine keyed on empty `contacts` + no `org_id`** — the audience literally doesn't exist in the schema the engine reads | **High** | §4.1 identity bridge (create contacts + prefs rows; pin `org_id=workspace`); acceptance #2 gates it |
| **Compliance engine not on the send path** — content can reach the wire without postal/opt-out/phrase checks | **High** | §4.2 step 4 calls it at enqueue; governor also only sets unsubscribe header when URL present; acceptance #5/#6 |
| **Suppression table empty → nothing is actually suppressed** | **High** | Seed `communication_preferences` from DB-cleanup (DNC/deceased/opt-outs) before fire; bounce/complaint feed (4.7) |
| **Auto-send risk** if Phase-0 were wired to the automation processor or governor un-paused by default | **High** | §6: global pause defaults ON; explicit fire + arm token; no automation enrollment for Phase-0 |
| **Frequency cap / config / health silently disabled** (RPC arg + column-name mismatches) | **High** | §3.1–§3.6 fixes are prerequisites; acceptance #7/#9 |
| **Opt-out token unusable** (`UNSUBSCRIBE_SECRET` unset, or no contact_id) | **High** | §7 env checklist + §4.1 bridge supplies contact_id/org_id; acceptance #5 |
| **No bounce/complaint ingestion** → mail dead/complaining addresses, reputation + CAN-SPAM exposure | **Med-High** | Build `postmark-webhook` (4.7); wire `sender_health_metrics` + auto-pause |
| **Sending domain not authenticated** (SPF/DKIM/DMARC) / no broadcast stream → bulk goes to spam or fails | **Med** | §7 verify before wave |
| **Non-atomic fallback claim double-sends** under concurrent cron | **Med** | Build `claim_marketing_queue_items` (`FOR UPDATE SKIP LOCKED`); single cron until then |
| **Loose postal-address regex** passes content lacking the real address | **Low-Med** | Assert the literal agency address string in the template + a stricter check |
| **Household dedupe vs per-account** — sending one email per household needs a chosen primary recipient | **Low-Med** | §4.2 dedupe by `household_id`, prefer primary contact w/ email; `household_dedupe_key='phase0:'||household_id` |
| **`dispatch-outbox` confusion** — it's n8n, not email | **Low** | Documented out-of-band (§2.2); not used by Phase-0 |

---

*Sources: live introspection of `lrqajzwcmdwahnjyidgv` on 2026-06-28 (information_schema columns for all 15 Levitate tables; row counts; `pg_proc` for RPC signatures; seed contents of `state_communication_rules`/`prohibited_phrases`/`external_service_health`), and full source of the 6 edge functions (`marketing-send-governor`, `marketing-compliance-engine`, `marketing-automation-processor`, `marketing-unsubscribe`, `email-send`, `dispatch-outbox`) via `get_edge_function`. Companion: PLAN-INT-A (Canopy batch-mint) for the upstream `public_url` contract. No data mutated; read-only throughout.*
