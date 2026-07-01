# PLAN-INT-C — Phase-0 Cross-Sell Campaign Wiring (BUILD-READY SPEC)

**Status:** Planning only. Read-only investigation complete. This document mutates/sends/deploys NOTHING. It is the build sheet for a Claude Code build agent.
**Project (Supabase):** `lrqajzwcmdwahnjyidgv` · **Tenant (workspace):** `f1f07037-3032-45f8-93ca-72c0f47e4fbb` (single tenant) · **Date:** 2026-06-28
**Layer:** This is the **middle layer**. Agent A = batch-mint personal Canopy links (invites table). Agent B = compliant Levitate send (queue). This spec turns the target list into a **runnable, segmented, household-grouped campaign** and defines the seams to A and B.

---

## 1. Problem

Phase-0 wants the agency's clean book worked for cross-sell **before** any cold prospecting. The book is normalized (`policies.line_canonical` / `policies.line_category`, `policies.line_of_business_id`) and there is a target list of ~1,528 households across four plays:

| Play | Definition | Sell |
|---|---|---|
| P1 home-only → auto | dwelling, no personal_auto | Auto |
| P2 auto-only → home | personal_auto, no dwelling | Home |
| P3 umbrella add | has auto or dwelling, no personal_umbrella | Umbrella |
| P4 rec → auto | specialty (boat/MC/RV/trailer), no personal_auto | Auto |

What exists today:
- A **Canopy webhook** writes a `coverage_gap_opportunities` row (`opportunity_key='canopy_cross_sell'`) + a producer task on **account-linked** pull completion. (Table currently 0 rows — not yet fired in production.)
- `coverage_gap_rules` already encodes the play logic: `home_no_auto`, `auto_no_home`, `high_liability_no_umbrella`, `single_policy_bundle`.
- **Agent A** (separate) will mint a per-account personal Canopy link into an invites table (not yet created; `canopy_pulls.public_url` is the link shape, NULL for all 17 existing rows).
- **Agent B** (separate) does the compliant send via Levitate's `marketing_send_queue`.

**Gap this spec fills:** there is **no** target view, **no** enrollment table that is one-row-per-household, and **no** defined data flow connecting target → mint → send. We build those.

---

## 2. Target source (live SELECT — no view exists yet)

**Finding:** No `v_phase0_crosssell_targets` (or equivalent) view exists. Searched all 44 public views — none match cross-sell/phase0/target/opportunity/campaign. **Build agent must create the view below.**

### 2.1 Load-bearing data facts (verified read-only)

- **Clean book:** 1,714 active accounts (`account_status='active' AND deleted_at IS NULL`), 2,163 active policies, all in workspace `f1f07037…`. (15,991 total account rows include leads/dupes — **must** filter on workspace + status + deleted_at.)
- **`accounts.household_id` is SPARSE.** Only **25** distinct household_id values populated; **1,663** active accounts have `household_id IS NULL`. The Levitate `households` table has 37 rows, `household_rollup` view joins on it → effectively unusable for grouping the book today.
  → **Decision:** synthesize a stable household key: `COALESCE(a.household_id::text, 'acct:'||a.id::text)`. Each un-grouped account becomes its own single-member household. This is correct (no false merges) and future-proof (re-runs collapse automatically once `household_id` backfills).
- **Line classification:** use `policies.line_category` (normalized). Active map: `personal_auto` (1,052 acct), `dwelling` (≈430 acct: Homeowners/HO-8/DP-1/DP-3/HO-6/Mobile/Property-dwelling/Renters), `specialty` (boat 129, MC 77, travel trailer 45, motorhome 11), `personal_umbrella` (CPL/Personal Liability/Umbrella), `commercial`, `life`, `flood`.
- **Contactability (email-first):** `insured_emails.is_primary` covers **707** accounts; `accounts.email` column covers the **identical** 707. So **email reach across the active book = 707/1,714 = 41%**, not 84%. (See §5 — the "84%" figure in the mandate does not reproduce against this data.)
- **account_type is unreliable:** NULL for 1,691 of 1,714 active accounts; only 23 are `business`. Do **not** filter on `account_type='household'`. Instead **exclude** the 23 `account_type='business'` rows and gate plays on **personal** `line_category` membership.

### 2.2 Canonical view DDL (build agent runs this; planning only — DO NOT execute here)

```sql
CREATE OR REPLACE VIEW public.v_phase0_crosssell_targets AS
WITH acct AS (
  SELECT
    a.id                AS account_id,
    a.agency_workspace_id,
    COALESCE(a.household_id::text, 'acct:' || a.id::text) AS household_key,
    a.household_id,
    COALESCE(a.name_display, a.name)        AS account_name,
    a.account_type,
    ie.email            AS primary_email,           -- insured_emails (canonical, primary)
    a.email             AS account_email_fallback   -- identical coverage today, kept as fallback
  FROM accounts a
  LEFT JOIN insured_emails ie ON ie.account_id = a.id AND ie.is_primary
  WHERE a.account_status = 'active'
    AND a.deleted_at IS NULL
    AND a.agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
    AND COALESCE(a.account_type::text,'household') <> 'business'
),
acct_lines AS (
  SELECT
    p.account_id,
    bool_or(p.line_category = 'personal_auto')      AS has_auto,
    bool_or(p.line_category = 'dwelling')           AS has_dwelling,
    bool_or(p.line_category = 'personal_umbrella')  AS has_umbrella,
    bool_or(p.line_category = 'specialty')          AS has_specialty,
    array_agg(DISTINCT p.line_canonical)            AS lines_held
  FROM policies p
  WHERE p.status = 'active' AND p.deleted_at IS NULL
  GROUP BY p.account_id
),
hh AS (
  SELECT
    ac.agency_workspace_id,
    ac.household_key,
    min(ac.household_id)                                   AS household_id,
    -- contact account = lowest account_id that HAS an email; else lowest account_id
    (array_agg(ac.account_id ORDER BY (ac.primary_email IS NULL), ac.account_id))[1] AS contact_account_id,
    (array_agg(COALESCE(ac.primary_email, ac.account_email_fallback)
       ORDER BY (ac.primary_email IS NULL), ac.account_id) FILTER
       (WHERE COALESCE(ac.primary_email, ac.account_email_fallback) IS NOT NULL))[1]  AS contact_email,
    (array_agg(ac.account_name ORDER BY (ac.primary_email IS NULL), ac.account_id))[1] AS contact_name,
    bool_or(COALESCE(al.has_auto,false))      AS has_auto,
    bool_or(COALESCE(al.has_dwelling,false))  AS has_dwelling,
    bool_or(COALESCE(al.has_umbrella,false))  AS has_umbrella,
    bool_or(COALESCE(al.has_specialty,false)) AS has_specialty,
    count(*)                                  AS member_accounts
  FROM acct ac
  LEFT JOIN acct_lines al ON al.account_id = ac.account_id
  GROUP BY ac.agency_workspace_id, ac.household_key
)
SELECT
  agency_workspace_id,
  household_key,
  household_id,
  contact_account_id,                         -- the account_id Agent A mints the Canopy link for
  contact_email,
  contact_name,
  (contact_email IS NOT NULL)                 AS reachable_email,
  member_accounts,
  has_auto, has_dwelling, has_umbrella, has_specialty,
  CASE
    WHEN has_dwelling  AND NOT has_auto      THEN 'home_only_sell_auto'
    WHEN has_auto      AND NOT has_dwelling  THEN 'auto_only_sell_home'
    WHEN (has_auto OR has_dwelling) AND NOT has_umbrella THEN 'umbrella_add'
    WHEN has_specialty AND NOT has_auto      THEN 'rec_sell_auto'
    ELSE 'other'
  END AS play
FROM hh
WHERE has_auto OR has_dwelling OR has_specialty;   -- has at least one anchor line
```

**Play resolution is priority-ordered (CASE):** home/auto bundle gaps win over umbrella-add so a dwelling-only household is "sell auto," not "add umbrella." A household qualifies for **exactly one** play per run. (If you want a household to receive umbrella *after* it bundles, that is a later re-run, not a second simultaneous enrollment.)

### 2.3 Verified play counts (this exact logic, run 2026-06-28)

| play | households | reachable (email) | reach % |
|---|---:|---:|---:|
| `home_only_sell_auto` | 347 | **90** | 25.9% |
| `auto_only_sell_home` | 951 | **452** | 47.5% |
| `umbrella_add` | 88 | 44 | 50.0% |
| `rec_sell_auto` | 106 | 80 | 75.5% |
| (`other`) | 196 | 25 | — |
| **Plays total** | **1,492** | **666** | 44.6% |

Plays-total (1,492) ≈ the "~1,528" context figure (difference is boundary/`other` handling). **666** households are email-reachable across the four plays — this is the true Phase-0 email-addressable universe.

### 2.4 `coverage_gap_opportunities` / rules / templates (inspected)

- **`coverage_gap_opportunities`** (0 rows today): keyed by `account_id` (NOT household), `opportunity_key`, `idempotency_key` (NOT NULL, unique dedupe), `rule_id`, `severity`, `confidence numeric`, `rationale jsonb`, `current_coverage_summary jsonb`, `recommended_next_step`, `status`, `converted_policy_id`, `detection_version`, `last_detected_at`. The Canopy webhook writes `opportunity_key='canopy_cross_sell'` here on account-linked completion. **We READ this (do not write it)** as a per-account signal that a pull already happened (suppression input), and as the post-send conversion join.
- **`coverage_gap_rules`** (6 rows): `rule_key`, `applies_to_lines jsonb`, `recommended_action`, `severity`, `enabled`, `logic jsonb`. Existing keys map cleanly to plays: `home_no_auto`→P2, `auto_no_home`→P1, `high_liability_no_umbrella`→P3, `single_policy_bundle`/`commercial_*` (n/a). Store the matching `rule_key` on each enrollment for traceability; no need to re-derive logic — the view IS the logic.
- **`coverage_gap_templates`** (2 rows): industry/commercial-oriented (`required_coverages[]`, `recommendation_template`, `gap_description_template`). **Not used** for personal Phase-0 messaging — our per-play copy lives in §4.

---

## 3. Enrollment model

### 3.1 Decision: lean `phase0_campaign` + `phase0_enrollment` (do NOT reuse Levitate enrollments)

Evaluated `marketing_automation_recipes` / `marketing_automation_enrollments`:
- They are **trigger/event-driven** (`trigger_type`, `audience_filter`, `marketing_automation_events`) and per **contact/account/policy** — `marketing_automation_enrollments` has `contact_id`/`account_id`/`policy_id` but **no `household_id`**. The mandate requires **one enrollment per household**. Forcing household semantics into a per-contact recipe engine is a misfit (dedupe, play tagging, account_id-for-link all become side-tables).
- → **Build a lean pair.** It is one-row-per-household, carries the play, the contact email, and the `contact_account_id` for Agent A's mint. It hands to Levitate's **send queue** (§5), so we reuse Levitate's compliance/governor without inheriting its enrollment engine.

### 3.2 DDL (build agent applies via migration; planning only — DO NOT execute here)

```sql
CREATE TABLE public.phase0_campaign (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL,
  key                 text NOT NULL,                 -- e.g. 'phase0_crosssell_2026q3'
  name                text NOT NULL,
  play                text NOT NULL CHECK (play IN
                        ('home_only_sell_auto','auto_only_sell_home','umbrella_add','rec_sell_auto')),
  status              text NOT NULL DEFAULT 'draft'  -- draft|active|paused|archived
                        CHECK (status IN ('draft','active','paused','archived')),
  email_template_key  text NOT NULL,                 -- FK-by-convention to §4 template
  coverage_gap_rule_key text,                        -- traceability into coverage_gap_rules
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_workspace_id, key)
);

CREATE TABLE public.phase0_enrollment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id uuid NOT NULL,
  campaign_id         uuid NOT NULL REFERENCES public.phase0_campaign(id),
  household_key       text NOT NULL,                 -- COALESCE(household_id,'acct:'||id) from the view
  household_id        uuid,                          -- nullable; set when real grouping exists
  play                text NOT NULL,
  contact_account_id  uuid NOT NULL,                 -- account Agent A mints the Canopy link for
  contact_email       text NOT NULL,                 -- email-first; enrollment requires reachable
  contact_name        text,
  -- lifecycle
  status              text NOT NULL DEFAULT 'enrolled'
                        CHECK (status IN ('enrolled','minting','ready_to_send','queued',
                                          'sent','converted','suppressed','cancelled','failed')),
  -- mint seam (Agent A fills)
  canopy_invite_id    uuid,                           -- FK-by-convention to invites table (Agent A)
  canopy_link_url     text,                           -- public_url once minted
  minted_at           timestamptz,
  -- send seam (Agent B / queue)
  send_queue_id       uuid,                           -- marketing_send_queue.id once enqueued
  queued_at           timestamptz,
  sent_at             timestamptz,
  -- conversion (read from coverage_gap_opportunities / new policy)
  converted_at        timestamptz,
  converted_policy_id uuid,
  -- idempotency: one live enrollment per household per campaign
  idempotency_key     text NOT NULL,                  -- = campaign.key || ':' || household_key
  suppressed_reason   text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, household_key),
  UNIQUE (idempotency_key)
);
CREATE INDEX ON public.phase0_enrollment (status);
CREATE INDEX ON public.phase0_enrollment (campaign_id, play);
CREATE INDEX ON public.phase0_enrollment (contact_account_id);
```

RLS: mirror existing tenant policies (filter `agency_workspace_id`), same as `coverage_gap_opportunities`.

### 3.3 Enrollment population (one INSERT … SELECT per play, planning only)

```sql
-- example: P1 home_only_sell_auto into an active campaign row :campaign_id
INSERT INTO public.phase0_enrollment
  (agency_workspace_id, campaign_id, household_key, household_id, play,
   contact_account_id, contact_email, contact_name, idempotency_key)
SELECT
  t.agency_workspace_id, :campaign_id, t.household_key, t.household_id, t.play,
  t.contact_account_id, t.contact_email, t.contact_name,
  :campaign_key || ':' || t.household_key
FROM public.v_phase0_crosssell_targets t
WHERE t.play = 'home_only_sell_auto'
  AND t.reachable_email                       -- email-first: never enroll the unreachable
ON CONFLICT (idempotency_key) DO NOTHING;      -- re-run safe
```

**Suppression at enrollment** (before queueing): skip households where `contact_email` exists in Levitate opt-outs (`consent_ledger` opt-out / `communication_preferences`), or where a `coverage_gap_opportunities` row for the contact account already shows `status IN ('converted','dismissed')`, or a Canopy pull already completed for the account. Set `status='suppressed'`, `suppressed_reason`.

---

## 4. Templates per play (subject + body shell)

**Wedge (all plays):** *"share your current policy in 30 seconds and see exactly where you're exposed."* **CTA = the personal Canopy link.** Merge fields available from enrollment + view + book: `{{first_name}}`, `{{current_carrier}}` (from the held anchor policy's `policies.carrier`), `{{specific_gap}}` (play-derived phrase), `{{canopy_link}}`, `{{agency_name}}`, `{{producer_name}}`, `{{agency_postal_address}}`, `{{unsubscribe_url}}`.

> CAN-SPAM: every template carries `{{agency_postal_address}}` + `{{unsubscribe_url}}` placeholders. **Levitate (Agent B) fills/enforces** actual compliance (physical address, one-click opt-out, suppression). Body shells below are **content only**; do not hard-code unsubscribe HTML.

**Template key `phase0_home_only_sell_auto`**
- Subject: `{{first_name}}, your home's covered — is your car leaving money on the table?`
- Body shell:
  ```
  Hi {{first_name}},

  We already protect your home, and we noticed we're not currently helping with your auto.
  Households that bundle home + auto with us typically save — but the bigger reason to look
  is coverage gaps you can't see from a premium quote.

  Share your current auto policy in 30 seconds and we'll show you exactly where you're exposed —
  no call, no obligation:
  {{canopy_link}}

  It pulls your current {{current_carrier}} coverage securely so we compare apples to apples.

  — {{producer_name}}, {{agency_name}}
  {{agency_postal_address}}
  {{unsubscribe_url}}
  ```
- `{{specific_gap}}` = "no auto policy on file with us — bundling + a gap check."

**Template key `phase0_auto_only_sell_home`**
- Subject: `{{first_name}}, one quick check on your home coverage`
- Body shell: same wedge; gap line: *"We insure your auto, but not your home — and homeowner coverage gaps (replacement cost, water backup, liability limits) are the ones that hurt most in a claim."* CTA `{{canopy_link}}`, pulls current `{{current_carrier}}` home policy.
- `{{specific_gap}}` = "no home/dwelling policy on file — replacement-cost & liability gap check."

**Template key `phase0_umbrella_add`**
- Subject: `{{first_name}}, are your assets covered above your auto/home limits?`
- Body shell: wedge + *"You carry auto and home with us, but no umbrella. One at-fault accident or lawsuit can blow past your underlying limits."* CTA `{{canopy_link}}` to verify underlying limits in 30 seconds.
- `{{specific_gap}}` = "liability stops at your auto/home limits — no umbrella layer."

**Template key `phase0_rec_sell_auto`**
- Subject: `{{first_name}}, your {{rec_item}} is insured — what about the truck that tows it?`
- Body shell: wedge + *"We cover your {{rec_item}}, but we're not on your auto. Same 30-second check shows where your auto coverage is thin."* (`{{rec_item}}` from specialty `line_canonical`: boat/motorcycle/RV/travel trailer.)
- `{{specific_gap}}` = "specialty/rec policy with us, but no auto — gap check + bundle."

Storage: persist these as rows the build agent can pick up — either `marketing_email_templates` (Levitate, versioned, preferred so Agent B renders them) keyed by the four template keys, or a small `phase0_template` table if Agent B reads from there. **Pick `marketing_email_templates`** — the send queue payload already references `template_id`/`template_version_id` and `merge_context`.

---

## 5. First batch definition (the ~200 home-only → auto)

> **CONFLICT TO FLAG (load-bearing):** The mandate specifies "~200 highest-intent home-only → auto households (84% reachable)." **This does not reproduce against the live book.** Home-only households = **347**, of which only **90 are email-reachable (25.9%)**. There is no 200-household, 84%-reachable home-only pool. Email reach across the *entire* active book is 41% (707/1,714), and `insured_emails` + `accounts.email` cover the identical 707 accounts (no hidden email source).

**Recommended first batch — two options; build agent picks with stakeholder:**

**Option A (faithful to "home-only → auto", smaller):** the **90** email-reachable `home_only_sell_auto` households. Exact selection:
```sql
SELECT * FROM public.v_phase0_crosssell_targets
WHERE play = 'home_only_sell_auto' AND reachable_email = true;   -- 90 households
```
"Highest-intent" ordering for staged send (if throttling): prioritize households whose dwelling policy is **higher-premium** and **renews soonest** (join `policies` on `contact_account_id`, `order by expiration_date asc, premium desc`).

**Option B (hit ~200, highest-intent, multi-play):** to reach ~200 in the first batch, take all **90** home-only→auto **plus the top ~110 `rec_sell_auto`** (80 reachable, 75.5%) and highest-premium `auto_only_sell_home` — all "sell auto/home bundle" intent. This gives a 200-household first batch at high reachability but **is not purely home-only**.

**Spec default: Option A (90), labeled `phase0_crosssell_2026q3 / home_only_sell_auto`**, because it is unambiguous, fully reachable, and matches the named play. Document the 90-vs-200 gap to the stakeholder; if 200 is a hard requirement, switch to Option B. **Selection criteria (Option A), exact:** active account, workspace `f1f07037…`, not business, dwelling line present, no personal_auto line, has primary email, grouped to one household key, one enrollment per household.

---

## 6. Mint + Send wiring (data flow + keys)

```
v_phase0_crosssell_targets
        │  (INSERT…SELECT, idempotency_key = campaign.key||':'||household_key)
        ▼
phase0_enrollment  (status='enrolled', contact_account_id, contact_email)
        │
        │  AGENT A (mint): reads enrollments WHERE status='enrolled'
        │     mints a personal Canopy link for contact_account_id → invites table
        │     writes back: canopy_invite_id, canopy_link_url (= public_url), minted_at
        │     sets status='ready_to_send'
        ▼
phase0_enrollment  (status='ready_to_send', canopy_link_url filled)
        │
        │  MIDDLE LAYER (this spec): for each ready_to_send + not suppressed,
        │     INSERT into marketing_send_queue (+ _payloads) with merge_context
        │     sets send_queue_id, queued_at, status='queued'
        ▼
marketing_send_queue        ──►  AGENT B (Levitate): claims pending, validates
  + marketing_send_queue_payloads   compliance, renders template, sends, writes
        │                            communication_evidence + communication_events
        │  on sent: status='sent', provider_message_id
        ▼
phase0_enrollment.status='sent' (sync via sent_at / provider_message_id)
        │
        │  conversion: coverage_gap_opportunities.status='converted'
        │     OR new policy on contact_account_id in target sell-line
        ▼
phase0_enrollment.status='converted', converted_policy_id, converted_at
```

### 6.1 Keys / contracts

- **Target → enrollment:** join key `household_key` (= `COALESCE(household_id::text,'acct:'||id)`). Idempotency `campaign.key || ':' || household_key`.
- **Enrollment → mint (Agent A):** Agent A keys on `phase0_enrollment.contact_account_id`. **Interface contract for Agent A's invites table** (build A to satisfy this): one row per minted link with `account_id`, `public_url`, `public_alias`, `consent_token`, and a back-reference `phase0_enrollment_id`. Agent A writes `canopy_invite_id` + `canopy_link_url` + `minted_at` back onto the enrollment and flips `status='ready_to_send'`. (Link shape mirrors `canopy_pulls.public_url`/`public_alias`/`consent_token`.)
- **Enrollment → send (Agent B queue):** middle layer INSERTs into `marketing_send_queue` with the **exact constrained values**:
  - `source_type='campaign'`, `source_id = phase0_campaign.id`
  - `classification='marketing'`, `channel='email'`, `status='pending'`, `priority` 5
  - `to_account_id = contact_account_id`, `to_email = contact_email`
  - `household_id = phase0_enrollment.household_id` (nullable), `household_dedupe_key = household_key`
  - `idempotency_key = phase0_enrollment.idempotency_key` (carries through → exactly-once send)
  - `template_id` = the `marketing_email_templates` id for the play; `merge_context jsonb` in `marketing_send_queue_payloads` = `{first_name, current_carrier, specific_gap, canopy_link (=canopy_link_url), rec_item?, producer_name, agency_name}`.
  - Leave `unsubscribe_url` / `postal_address` for Agent B to populate (compliance owner).
- **Send → enrollment:** poll/trigger on `marketing_send_queue.status` → mirror `sent_at`, `provider_message_id` onto enrollment; `status='sent'`.
- **Conversion:** join `coverage_gap_opportunities` on `account_id = contact_account_id` (status→`converted`/`converted_policy_id`), or detect a new active policy in the sell line on the household. Set enrollment `status='converted'`.

### 6.2 Reusable building blocks present (no need to build)

- RPCs: `enroll_in_automation`, `list_coverage_gap_opportunities`, `refresh_coverage_gap_analytics`, `map_canopy_to_account`, `get_canopy_pull_summary`.
- `marketing_send_queue` + `_payloads` (Agent B's queue, fully shaped).
- `coverage_gap_rules` (play logic mirror), `coverage_gap_opportunities` (per-account signal + conversion).
- Levitate compliance stack: `consent_ledger`, `communication_preferences`, `prohibited_phrases`, `state_communication_rules`, `marketing_governor_config`, `contact_send_frequency` (Agent B enforces).

---

## 7. Acceptance criteria

1. `v_phase0_crosssell_targets` exists; returns **1,492** play rows (`home_only_sell_auto` 347 / `auto_only_sell_home` 951 / `umbrella_add` 88 / `rec_sell_auto` 106), of which **666** have `reachable_email=true`; every row has exactly one non-`other` `play` and a `household_key`.
2. `phase0_campaign` + `phase0_enrollment` tables created with the CHECK/UNIQUE constraints above; RLS scoped to `f1f07037…`.
3. Enrolling the first batch (Option A) yields **exactly 90** `phase0_enrollment` rows (`play='home_only_sell_auto'`, all with `contact_email` and `contact_account_id`), zero duplicate households, re-running the INSERT adds 0 rows (idempotent).
4. Four `marketing_email_templates` exist (one per play) with the §4 subject/body, merge tags resolvable, `{{unsubscribe_url}}`+`{{agency_postal_address}}` present as placeholders (not hard-filled).
5. Mint seam: given a `ready_to_send` enrollment, Agent A's invites row links by `contact_account_id` and writes `canopy_link_url`+`minted_at`; enrollment flips to `ready_to_send`. (Contract documented even though Agent A is separate.)
6. Send seam: enqueuing inserts `marketing_send_queue` rows with `source_type='campaign'`, `classification='marketing'`, `channel='email'`, `status='pending'`, carrying `idempotency_key`; one queue row per enrollment; no row enqueued without a `canopy_link_url`.
7. Suppression: opted-out / already-converted / already-pulled households are `status='suppressed'` and never enqueued.
8. Nothing is sent or minted by this layer; only `pending` queue rows are produced. Sending is Agent B's job.

---

## 8. Risks

- **R1 — Reach reality vs. mandate (HIGH):** "200 home-only @ 84%" does not exist; real pool is 90 @ 25.9%. Surfaced in §5. Decision needed: ship 90 (Option A) or broaden to ~200 multi-play (Option B). Either way, **41% of the book has no email** — Phase-0 email-only caps at ~666 households; the remaining ~826 need phone/mail (out of scope here).
- **R2 — Household grouping is synthetic:** 1,663/1,714 accounts have no `household_id`, so most "households" are single accounts. Spouses/partners on separate accounts will get separate sends until `household_id` is backfilled. `household_dedupe_key` is carried so Levitate can still dedupe by address-hash where it has it.
- **R3 — Email source ceiling:** `insured_emails.is_primary` == `accounts.email` (same 707). No second source to lift reach. Don't assume a richer email table exists.
- **R4 — Canopy link not yet minted anywhere:** `canopy_pulls.public_url` NULL for all 17; Agent A is unbuilt. The enrollment `canopy_link_url` will be NULL until A runs — guard the enqueue step on `canopy_link_url IS NOT NULL`.
- **R5 — `coverage_gap_opportunities` empty:** webhook hasn't fired account-linked completions in prod. Conversion attribution (§6.1) is design-correct but untested against live rows.
- **R6 — Play overlap / re-enrollment:** priority CASE assigns one play; a household that bundles auto then becomes umbrella-eligible needs a deliberate second campaign run, not an automatic re-enroll (no `allow_re_enrollment` here by design).
- **R7 — Levitate enrollment engine bypass:** we feed `marketing_send_queue` directly, not via `marketing_automation_*`. Confirm Agent B's queue processor consumes `source_type='campaign'` rows that were not created by a recipe (it should — `source_type` enumerates `campaign`/`manual`/`system` separately from `automation`).
```
