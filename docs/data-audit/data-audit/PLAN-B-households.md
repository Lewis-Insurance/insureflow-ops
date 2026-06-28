# PLAN-B — Householding (Domain B)

**Database:** InsureFlow / "Lewis Insurance App" (Supabase `lrqajzwcmdwahnjyidgv`)
**Domain owner:** Auditor B (Householding)
**Date:** 2026-06-27
**Status:** PLANNING ONLY — nothing in this file has been executed. All SQL/DDL below is written as TEXT for a separate Claude Code build agent to implement after sign-off. The only live activity during planning was read-only `SELECT` to re-verify counts.

**Mission:** Group DIFFERENT people who share a household (e.g. spouses where one holds the home, the other the auto/boat) into one household record so cross-sell can be worked at the household level. **LINK, never MERGE** — spouses are distinct legal insureds; merging would destroy policy ownership and consent boundaries. Merging same-person duplicate rows is a *different* domain (DUP-) and must run first.

---

## 0. Re-verified anchors (read-only, this session)

| Metric | Value | Note |
|---|---|---|
| Active accounts (all, `deleted_at IS NULL`) | **1,804** | confirmed |
| — stamped to workspace `f1f07037-…` | 1,610 | the B-households.md population |
| — `agency_workspace_id IS NULL` (hidden) | **194** | of which **167** have active policies |
| Active policies (all) | **2,164** | confirmed |
| `households` rows | **0** | empty; cols: id, org_id, name, primary_contact_id, address_hash, created_at, updated_at |
| `household_accounts` rows | **1** | synthetic; cols incl. head_contact_id, spouse_contact_id (both FK the dead `contacts`) |
| `portal_household_members` rows | **0** | portal-invite construct, not CRM grouping |
| `accounts.household_id` column | **DOES NOT EXIST** | must be added (HH-2) |
| `policies.line_of_business_id` column | **DOES NOT EXIST** | 44 distinct raw text values; `lines_of_business` has 16 — HYG- dependency |
| `contacts` rows | **0** | dead table; `households.primary_contact_id`, `accounts.contact_id`, `household_accounts.*_contact_id` all point here |
| `accounts.type` enum (`account_type_v2`) | **{household, commercial_business}** | person↔business exclusion uses `type='commercial_business'` |

### Householding result, re-run two ways (READ-ONLY)

I re-ran the exact B-households.md connected-components algorithm. **The cited counts change depending on whether the 167 hidden accounts are included** (the brief instructs HH- to include them, coordinating with MODEL- workspace-stamp):

| Population | Households | Accounts | HIGH | MEDIUM | LOW | Mixed-line |
|---|---|---|---|---|---|---|
| **Stamped-only** (B-households.md scope, 1,610) | 55 | 117 | **42** / 89 | 7 / 16 | 6 / 12 | 44 |
| **Expanded** (stamped + 167 hidden) — *this is the build target* | **59** | **125** | **45** / 95 | 8 / 18 | 6 / 12 | 44 |

**DISPUTE / FLAG #1 — the "42 HIGH auto-link" anchor:** The brief's headline of **42 HIGH auto-link** is the *stamped-only* number and I can stand behind it for that scope. Once MODEL- stamps the 167 hidden accounts (which the brief explicitly requires HH- to include), the HIGH set grows to **45 households / 95 accounts**. **The build must run the matcher AFTER MODEL- workspace-stamp and treat 45/95 as the live HIGH count, not 42/89.** Re-verify at build time — the exact number can drift again as the book grows or as DUP- removes duplicate rows.

**DISPUTE / FLAG #2 — size-5/7 clusters from B-households.md (Barrs, Max Bass):** B-households.md lists Barrs at size 5 and a Max Bass cluster at size 7 via email/phone edges. In my re-run (both populations) the largest component is **size 4**; Barrs and Max Bass resolve to ≤4 members. The difference is almost certainly the recursive-CTE traversal terminating on visited nodes differently across runs (the `WITH RECURSIVE` in the source query has no cycle guard and can under- or over-expand depending on plan). **The build agent must use the deterministic, cycle-safe union-find in HH-4 — do not trust either ad-hoc size figure.** Component *membership* for tiering/auto-link is what matters, and the deterministic algorithm is the source of truth.

**Confirmed mixed-line:** 44 of 59 households are mixed-line — but this was computed against **raw** `line_of_business` text. It is only trustworthy once HYG- normalizes LOB (HH dependency below).

---

## 0a. Cross-domain dependencies (must be stated up front)

- **DUP- (deduplication) MUST run BEFORE HH- linking.** Several 2-member "households" are actually the *same person* in duplicate rows, not two people under one roof. Re-verified this session:
  - **Cruce (Tracy Cruce ×2)** — two byte-identical rows (19816 NW County Road 235, Lake Butler 32054, no phone/email). **True duplicate → DUP-. EXCLUDE from HH-.**
  - **Darwiche (Ziad Darwiche ×2)** — two identical rows (521 SW Starlight Ct, Lake City 32024). **True duplicate → DUP-. EXCLUDE from HH-.**
  - **Zhang (Heng Zhang ×3)** — three rows, three different addresses, share phone `14077020856` on two; one row carries ZIP `32055` (office trap, so it never entered householding anyway). Same person/business across a move (or a duplicate). **Route to DUP- review. EXCLUDE from HH-.**
  - **Lawrence (James Lawrence ×2)** — two rows, different cities (Live Oak 32060 / Orlando 32811), **same phone `15854154340`**. Same-person move or duplicate. **Route to DUP- review. EXCLUDE from HH-.**
  - Also: any "Name ×2/×3" sub-clusters nested inside HIGH households (B-households.md §6.3) — DUP- collapses these to one survivor row first; HH- then links the survivor to the *other* family member.
  - **Mechanism (HH-3):** HH- reads a DUP- output (`merge_history` survivors, or a `dup_exclusions` view DUP- publishes) and removes merged-away loser ids from its input set, so a household never links a person to their own stale duplicate.
- **MODEL- (data-model) workspace-stamp is a prerequisite** so the 167 hidden accounts are visible and carry the correct `agency_workspace_id` before linking (FLAG #1). HH- also coordinates with MODEL- on the `households` canonicalization and the deprecation of `household_accounts` / `portal_household_members` (HH-2, HH-9) — these are shared objects; HH- owns the *grouping* semantics, MODEL- owns the *table lifecycle*. Do not let the two domains both DROP/repoint the same column.
- **HYG- (field hygiene / LOB) LOB normalization is a prerequisite for mixed-line detection (HH-7).** `policies.line_of_business_id` does not exist and there are 44 dirty raw values. Mixed-line is the cross-sell payload of this whole domain; computing it on raw text mislabels households. HH-7 consumes HYG-'s `line_canonical` / `line_category`.
- **Person↔business exclusion** uses `accounts.type='commercial_business'` (enum confirmed) plus a name-token guard (LLC / INC / CHURCH / PA / LEASING / etc.). Coordinates with Domain C (business reclassification): accounts C re-types to `commercial_business` drop out of HH- on the next run.

---

## HH-1 — Pre-flight gate: confirm prerequisites & freeze inputs

- **Problem:** Householding silently produces wrong groups if it runs before DUP- (duplicate persons linked as "households"), before MODEL- stamping (167 customers invisible), or before HYG- LOB normalization (mixed-line mislabeled). There is currently no guard that these ran.
- **Change:** A read-only pre-flight check the build agent runs (and the maintained routine in HH-11 re-runs) before any write. As TEXT:
  ```sql
  -- HH-1 pre-flight (READ-ONLY; all three must pass)
  -- (a) MODEL- stamp done: zero active accounts with NULL workspace remain
  SELECT 'stamp' chk, COUNT(*) failing
    FROM accounts WHERE deleted_at IS NULL AND agency_workspace_id IS NULL;          -- expect 0
  -- (b) HYG- LOB normalized: column exists and is populated for active policies
  SELECT 'lob' chk,
    (SELECT COUNT(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='policies' AND column_name='line_canonical') AS has_col,
    (SELECT COUNT(*) FROM policies WHERE deleted_at IS NULL AND line_canonical IS NULL) AS unmapped; -- expect has_col=1, unmapped=0
  -- (c) DUP- has run: merge_history non-empty OR dup_exclusions view present
  SELECT 'dedup' chk, (SELECT COUNT(*) FROM merge_history) AS merges;                 -- expect > 0
  ```
- **Type:** Validation / guard (read-only).
- **Depends on:** MODEL-workspace-stamp; HYG-LOB-normalization; DUP-merge (at least Tier-1 clusters processed).
- **Blocks:** HH-3, HH-4, HH-5, HH-6 (no linking writes until this passes).
- **Reversibility & safety:** Read-only; nothing to reverse. Acts as a circuit-breaker.
- **Acceptance:** All three checks pass (stamp failing=0; LOB has_col=1 and unmapped=0; dedup merges>0). If any fails, build halts and reports which prerequisite is missing. The named DUP- exclusions (Cruce, Darwiche, Zhang, Lawrence) confirmed absent from the linking input.
- **Priority + domain-rank:** P1 (gate) · **B-rank 1**

---

## HH-2 — Schema: add the household link + canonicalize on `households`

- **Problem:** There are three competing household constructs and none usable: `households` (0 rows), `household_accounts` (1 synthetic row, FKs the dead `contacts`), `portal_household_members` (0 rows, portal-invite only). Crucially, **`accounts` has no `household_id` column**, so there is no way to attach an account to a household at all. `households.primary_contact_id` references the dead `contacts` table (0 rows), so it can never be populated under the account-centric party model the audit recommends.
- **Change (DDL as TEXT — additive, non-destructive):**
  ```sql
  -- (1) The link column on accounts (nullable; singletons stay NULL)
  ALTER TABLE accounts
    ADD COLUMN household_id uuid NULL REFERENCES households(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_accounts_household_id ON accounts(household_id);

  -- (2) Canonicalize on households: repoint the primary pointer from the dead contacts
  --     table to an account (account-centric party model, per audit §7).
  ALTER TABLE households
    ADD COLUMN primary_account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL,
    ADD COLUMN tier text NULL,                 -- 'HIGH' | 'MEDIUM' | 'LOW'
    ADD COLUMN match_signals text[] NULL,      -- e.g. {A,B_same,C}
    ADD COLUMN is_mixed_line boolean NULL,
    ADD COLUMN linked_by text NULL,            -- 'auto' | 'review'
    ADD COLUMN agency_workspace_id uuid NULL;  -- stamp so households are tenant-scoped like accounts
  -- DO NOT drop households.primary_contact_id in this item; deprecate it in HH-9 once nothing reads it.
  -- (org_id stays as-is; set org_id from the agency org at insert time in HH-5.)
  ```
- **Type:** Schema / DDL (additive).
- **Depends on:** MODEL- (coordinate ownership of `households` lifecycle — MODEL- D-item canonicalizes on `households`; HH- adds the grouping columns. Single migration authored jointly to avoid two domains altering the same table).
- **Blocks:** HH-5 (insert), HH-6 (link), HH-7 (rollup), HH-8 (display name), HH-9 (deprecation).
- **Reversibility & safety:** Fully reversible — `ALTER TABLE accounts DROP COLUMN household_id;` and drop the added `households` columns. Additive only; no existing column dropped, no row touched. New column is NULL for every account until HH-6 runs.
- **Acceptance:** `accounts.household_id` exists, nullable, FK→`households(id)`, indexed; `households` has `primary_account_id` (FK→accounts), `tier`, `match_signals`, `is_mixed_line`, `linked_by`, `agency_workspace_id`. No data rows changed (still 0 households, 0 linked accounts). `information_schema` confirms columns and FK.
- **Priority + domain-rank:** P1 · **B-rank 2**

---

## HH-3 — Build the householding input set (exclusions baked in)

- **Problem:** The raw account population contains (a) office traps, (b) same-person DUP- duplicates, (c) person↔business pairs that share a phone/email but are not a residential household, and (d) accounts still NULL-workspace if run too early. Feeding these into the matcher produces false households.
- **Change (TEXT — a stable view the matcher reads):**
  ```sql
  CREATE OR REPLACE VIEW hh_input AS
  SELECT a.id, a.name, a.type::text AS acct_type,
    LOWER(SPLIT_PART(TRIM(a.name),' ',GREATEST(1,array_length(string_to_array(TRIM(a.name),' '),1)))) AS surname,
    LOWER(a.city) AS city_n, a.zip_code,
    NULLIF(regexp_replace(regexp_replace(LOWER(TRIM(a.address_line1)),'[^a-z0-9 ]','','g'),'\s+',' ','g'),'') AS addr_n,
    NULLIF(SPLIT_PART(TRIM(a.address_line1),' ',1),'') AS house_no,
    regexp_replace(COALESCE(a.phone,''),'[^0-9]','','g') AS phone_n,
    LOWER(NULLIF(TRIM(a.email),'')) AS email_n
  FROM accounts a
  WHERE a.deleted_at IS NULL
    -- include the 167 hidden accounts: stamped OR (now-stamped) null is fine post-MODEL-, so just require the agency workspace
    AND a.agency_workspace_id = 'f1f07037-3032-45f8-93ca-72c0f47e4fbb'
    -- office traps
    AND COALESCE(a.zip_code,'') <> '32055'
    AND a.name NOT IN ('Lewis Insurance Daysheets','BRIAN LEWIS','Brian Thomas Lewis')
    AND COALESCE(regexp_replace(COALESCE(a.phone,''),'[^0-9]','','g'),'') <> '3863628300'
    AND COALESCE(a.address_line1,'') NOT ILIKE '%1313 W US HWY 90%'
    -- person<->business exclusion: drop commercial entities and obvious business-name tokens from HOUSEHOLDING
    AND a.type::text <> 'commercial_business'
    AND a.name !~* '(\m(llc|inc|l\.?l\.?c|corp|co|company|church|ministries|apostolic|baptist|pa|p\.a|md pa|leasing|holdings|enterprises|services|works|farms?|ranch)\M)'
    -- DUP- exclusion: drop accounts that DUP- merged away (losers) so we never link a person to their own stale row
    AND a.id NOT IN (SELECT loser_account_id FROM merge_history WHERE loser_account_id IS NOT NULL)
    -- belt-and-suspenders: explicit duplicate-person rows routed to DUP-
    AND a.id NOT IN (SELECT account_id FROM dup_exclusions);   -- DUP- publishes this; empty-safe if it pre-creates it
  ```
  *Note:* the business-name regex is intentionally conservative and must NOT strip legitimate surnames (e.g. exclude false positives like "B-RANCH" handled by Domain C; coordinate the token list with C so HH- and C agree). Person-name accounts that merely *own* a business stay in HH- as people; their LLC stays out.
- **Type:** Data prep (view; read-only object).
- **Depends on:** HH-1 (gate), HH-2 (n/a for the view itself but conceptually same migration window), DUP- (`merge_history.loser_account_id` and/or `dup_exclusions`), MODEL- (stamp), Domain C (shared business-token list).
- **Blocks:** HH-4.
- **Reversibility & safety:** `DROP VIEW hh_input;` — no data. Read-only.
- **Acceptance:** `hh_input` excludes all office traps, all `commercial_business`, business-token names, and the named DUP- rows (Cruce/Darwiche/Zhang/Lawrence absent). Row count ≈ 1,474 + the newly-visible hidden personal accounts, minus DUP- losers; spot-check confirms Floyd, Myers/Rhodes, Barrs present and Sorensen&Smith LLC / BoxDrop / True Life Church absent.
- **Priority + domain-rank:** P1 · **B-rank 3**

---

## HH-4 — Matching algorithm: signals + connected components (deterministic union-find)

- **Problem:** Two distinct people belong to one household when they share a real-world residence/contact. The source query in B-households.md is sound in its signals but its `WITH RECURSIVE` propagation has no cycle guard (FLAG #2: Barrs/Max Bass sizes drift). We need a deterministic, idempotent component assignment.
- **Change (TEXT — full algorithm; signals, weighting, union via recursive min-label with a cycle guard):**
  ```sql
  -- Signals (an account joins a household if it shares ANY with a member):
  --   A      surname + house_no + ZIP        -> HIGH   (same family, same roof)
  --   B_same exact addr_n + ZIP, same surname -> HIGH
  --   B_diff exact addr_n + ZIP, diff surname -> MEDIUM (roommates / name change / typo)
  --   C      shared email                      -> MEDIUM (family inbox OR shared agent/PM email)
  --   D      shared phone (>=10 digits)        -> LOW    (DOWN-WEIGHTED; highest false-positive)
  -- Phone down-weight rule: a D edge is only allowed to FORM a household on its own when it does
  -- NOT bridge different surnames AND different cities (kills shared-PM/agent-phone false bundles).

  WITH e_a AS (
    SELECT a.id id1, b.id id2, 'A'::text kind FROM hh_input a JOIN hh_input b
      ON a.surname=b.surname AND a.house_no=b.house_no AND a.zip_code=b.zip_code AND a.id<b.id
      WHERE a.surname<>'' AND a.house_no IS NOT NULL AND a.zip_code IS NOT NULL),
  e_b AS (
    SELECT a.id id1, b.id id2, CASE WHEN a.surname=b.surname THEN 'B_same' ELSE 'B_diff' END kind
      FROM hh_input a JOIN hh_input b
      ON a.addr_n=b.addr_n AND a.zip_code=b.zip_code AND a.id<b.id
      WHERE a.addr_n IS NOT NULL AND a.zip_code IS NOT NULL),
  e_c AS (
    SELECT a.id id1, b.id id2, 'C'::text kind FROM hh_input a JOIN hh_input b
      ON a.email_n=b.email_n AND a.id<b.id WHERE a.email_n IS NOT NULL),
  e_d AS (
    SELECT a.id id1, b.id id2, 'D'::text kind FROM hh_input a JOIN hh_input b
      ON a.phone_n=b.phone_n AND a.id<b.id
      WHERE LENGTH(a.phone_n)>=10
        -- down-weight guard: drop phone-only bridges across diff surname AND diff city
        AND NOT (a.surname<>b.surname AND COALESCE(a.city_n,'')<>COALESCE(b.city_n,''))),
  all_edges AS (
    SELECT id1,id2,kind FROM e_a UNION ALL SELECT id1,id2,kind FROM e_b
    UNION ALL SELECT id1,id2,kind FROM e_c UNION ALL SELECT id1,id2,kind FROM e_d),
  edges AS (SELECT DISTINCT id1,id2 FROM all_edges),
  uedges AS (SELECT id1::text src,id2::text dst FROM edges
             UNION SELECT id2::text,id1::text FROM edges),
  -- Cycle-safe min-label propagation: track the visited path in an array so a node is never
  -- re-expanded along a cycle (this is the fix for FLAG #2 nondeterminism).
  prop AS (
    WITH RECURSIVE p(node, label, path) AS (
      SELECT src, src, ARRAY[src] FROM uedges
      UNION ALL
      SELECT u.dst, LEAST(pr.label, u.dst), pr.path || u.dst
      FROM p pr JOIN uedges u ON u.src = pr.node
      WHERE NOT (u.dst = ANY(pr.path))            -- cycle guard
        AND array_length(pr.path,1) < 64          -- safety bound; households are tiny
    )
    SELECT node, MIN(label) AS comp FROM p GROUP BY node
  ),
  comp AS (SELECT comp FROM prop GROUP BY comp HAVING COUNT(*) >= 2),
  edge_comp AS (SELECT ae.kind, p.comp FROM all_edges ae JOIN prop p ON p.node = ae.id1::text),
  comp_tier AS (
    SELECT cs.comp,
      CASE WHEN bool_or(ec.kind IN ('A','B_same')) THEN 'HIGH'
           WHEN bool_or(ec.kind IN ('B_diff','C')) THEN 'MEDIUM'
           ELSE 'LOW' END AS tier,
      ARRAY(SELECT DISTINCT k FROM unnest(array_agg(ec.kind)) k ORDER BY k) AS signals
    FROM comp cs JOIN edge_comp ec ON ec.comp = cs.comp GROUP BY cs.comp)
  SELECT m.comp AS household_key, m.node::uuid AS account_id, t.tier, t.signals
  FROM prop m JOIN comp c ON c.comp=m.comp JOIN comp_tier t ON t.comp=m.comp;
  ```
  - **Canonical household key** = `MIN(account_id::text)` in the component (lexicographically-smallest UUID). Stable, collision-free, recomputable — the same input always yields the same key.
  - **Tier** = max tier of any edge inside the component.
  - The min-label + cycle guard makes membership **deterministic** regardless of query plan, resolving FLAG #2.
- **Type:** Algorithm (read-only computation; build agent materializes results into a staging table `hh_candidates`).
- **Depends on:** HH-3 (`hh_input`).
- **Blocks:** HH-5, HH-6, HH-7, HH-8.
- **Reversibility & safety:** Pure computation into a staging table; `TRUNCATE/DROP hh_candidates` to redo. No production rows touched.
- **Acceptance:** Re-running on identical input yields byte-identical `(household_key, account_id, tier)` rows (determinism test: run twice, `EXCEPT` both ways = 0 rows). Expanded population yields **~59 households / ~125 accounts** with **~45 HIGH / ~8 MEDIUM / ~6 LOW** (±small drift after DUP- removals — re-verify, do not hard-code). Floyd and Myers/Rhodes both appear as HIGH; no component exceeds size ~7.
- **Priority + domain-rank:** P1 · **B-rank 4**

---

## HH-5 — Materialize household records (insert into `households`, HIGH auto + all staged)

- **Problem:** `households` is empty. We need one row per detected component, carrying the canonical key, tier, signals, primary account, and tenant stamp — written idempotently so re-runs update rather than duplicate.
- **Change (TEXT — upsert keyed on the canonical key; primary_account_id = account with most active policies, then most-complete contact, then most-recent updated_at):**
  ```sql
  -- requires a stable natural key. Use the canonical min-UUID as a deterministic UUID household id:
  --   household.id = uuid_generate_v5(<fixed namespace>, household_key_text)
  -- so the same component always maps to the same households.id across re-runs (idempotency).
  INSERT INTO households (id, org_id, agency_workspace_id, name, primary_account_id, tier, match_signals, is_mixed_line, linked_by, created_at, updated_at)
  SELECT
    uuid_generate_v5('<fixed-namespace-uuid>', hc.household_key::text) AS id,
    '<agency-org-id>'::uuid AS org_id,
    'f1f07037-3032-45f8-93ca-72c0f47e4fbb'::uuid AS agency_workspace_id,
    NULL AS name,                                  -- HH-8 fills display name
    -- primary account: most active policies -> most complete contact -> most recent updated_at
    (SELECT a.id FROM accounts a
       LEFT JOIN LATERAL (SELECT COUNT(*) pc FROM policies p WHERE p.account_id=a.id AND p.deleted_at IS NULL) pol ON true
       WHERE a.id IN (SELECT account_id FROM hc_members WHERE household_key=hc.household_key)
       ORDER BY pol.pc DESC,
                (CASE WHEN a.email IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN a.phone IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN a.address_line1 IS NOT NULL THEN 1 ELSE 0 END) DESC,
                a.updated_at DESC NULLS LAST
       LIMIT 1) AS primary_account_id,
    hc.tier, hc.signals,
    NULL AS is_mixed_line,                          -- HH-7 fills
    CASE WHEN hc.tier='HIGH' THEN 'auto' ELSE 'review' END AS linked_by,
    now(), now()
  FROM (SELECT DISTINCT household_key, tier, signals FROM hc_candidates) hc
  ON CONFLICT (id) DO UPDATE
    SET tier=EXCLUDED.tier, match_signals=EXCLUDED.match_signals,
        primary_account_id=EXCLUDED.primary_account_id, updated_at=now();
  -- (hc_members / hc_candidates are the materialized output of HH-4.)
  ```
  - **Only HIGH households are auto-applied** (`linked_by='auto'`). MEDIUM/LOW rows are still inserted into `households` but flagged `linked_by='review'` and are NOT linked to accounts (HH-6) until a human approves (HH-10).
- **Type:** Data write (INSERT/UPSERT into `households`).
- **Depends on:** HH-2 (columns), HH-4 (candidates).
- **Blocks:** HH-6, HH-7, HH-8.
- **Reversibility & safety:** Reversible — `DELETE FROM households WHERE created_at >= <run_ts>` (or where id IN the v5-derived set). No account row touched yet (link happens in HH-6), so deleting households here has zero blast radius on accounts. Deterministic v5 id makes re-runs upserts, not duplicates.
- **Acceptance:** ~59 `households` rows exist; each has a valid `primary_account_id` ∈ its member set, a non-null `tier`, and `match_signals`. HIGH rows `linked_by='auto'`; MEDIUM/LOW `linked_by='review'`. Re-running HH-5 produces 0 new rows (pure upsert). All rows stamped to the agency workspace + org.
- **Priority + domain-rank:** P1 · **B-rank 5**

---

## HH-6 — Link accounts to households (HIGH only auto; the actual `accounts.household_id` write)

- **Problem:** With households created, member accounts must be pointed at them via `accounts.household_id` — but ONLY for HIGH-tier (auto) households. This is the single mutating write on `accounts` and must be reversible and gated.
- **Change (TEXT):**
  ```sql
  -- Link ONLY accounts in HIGH (auto) households. MEDIUM/LOW wait for HH-10 approval.
  UPDATE accounts a
  SET household_id = uuid_generate_v5('<fixed-namespace-uuid>', m.household_key::text)
  FROM hc_members m
  JOIN hc_candidates c ON c.household_key=m.household_key
  WHERE a.id = m.account_id
    AND c.tier = 'HIGH'
    AND a.household_id IS DISTINCT FROM uuid_generate_v5('<fixed-namespace-uuid>', m.household_key::text);
  ```
  - Idempotent via `IS DISTINCT FROM` (re-links only what changed).
  - **LINK, not MERGE:** each account keeps its own row, name, policies; only the FK is set.
- **Type:** Data write (UPDATE `accounts.household_id`).
- **Depends on:** HH-1 (gate), HH-5 (households exist).
- **Blocks:** HH-7 (rollup reads the link), HH-8.
- **Reversibility & safety:** Fully reversible — `UPDATE accounts SET household_id=NULL WHERE household_id IN (<this run's ids>);`. Because it is a nullable FK that nothing destructive cascades from (`ON DELETE SET NULL`), un-linking restores the pre-state exactly. **Only HIGH/auto accounts touched (~95);** ~1,700 singletons and all MEDIUM/LOW accounts remain `household_id IS NULL`. Run inside a transaction; capture affected ids to an audit log first.
- **Acceptance:** ~95 accounts have `household_id` set, all to HIGH households; 0 MEDIUM/LOW accounts linked; every linked account's `household_id` resolves to an existing `households.id` and that account is in the household's member set (no orphan links). Spot-check: Floyd's two accounts share one `household_id`; Sorensen&Smith LLC unlinked.
- **Priority + domain-rank:** P1 · **B-rank 6**

---

## HH-7 — Household policy roll-up + mixed-line flag (query across member accounts' policies)

- **Problem:** The business value is seeing a household's *combined* book ("home + boat + auto across spouses") to drive cross-sell. Policies live on member accounts; there is no household-level view. Mixed-line (≥2 distinct canonical LOB groups across members) is the cross-sell trigger and must be computed on **normalized** LOB (HYG-), not raw text.
- **Change (TEXT — a view + a back-fill of `households.is_mixed_line`):**
  ```sql
  -- Roll-up view: one row per household with its members and aggregated lines.
  CREATE OR REPLACE VIEW household_rollup AS
  SELECT h.id AS household_id, h.name AS household_name, h.tier,
         COUNT(DISTINCT a.id) AS member_count,
         COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL) AS active_policies,
         ARRAY_AGG(DISTINCT p.line_category) FILTER (WHERE p.deleted_at IS NULL AND p.line_category IS NOT NULL) AS line_categories,
         COUNT(DISTINCT p.line_category) FILTER (WHERE p.deleted_at IS NULL) AS distinct_line_groups,
         (COUNT(DISTINCT p.line_category) FILTER (WHERE p.deleted_at IS NULL) >= 2) AS is_mixed_line,
         SUM(p.premium) FILTER (WHERE p.deleted_at IS NULL) AS household_premium
  FROM households h
  JOIN accounts a ON a.household_id = h.id AND a.deleted_at IS NULL
  LEFT JOIN policies p ON p.account_id = a.id
  GROUP BY h.id, h.name, h.tier;

  -- Back-fill the flag onto households for fast filtering / cross-sell targeting:
  UPDATE households h SET is_mixed_line = r.is_mixed_line, updated_at = now()
  FROM household_rollup r WHERE r.household_id = h.id
    AND h.is_mixed_line IS DISTINCT FROM r.is_mixed_line;
  ```
  - `line_category` / `line_canonical` are HYG-'s normalized columns. If HYG- names them differently, bind to those exact names at build time.
- **Type:** Reporting view + small data write (`households.is_mixed_line`).
- **Depends on:** HH-6 (links), **HYG-LOB-normalization** (normalized line columns on `policies`).
- **Blocks:** Cross-sell consumers (Phase-0 / Outbound engine read this) — but not other HH- items.
- **Reversibility & safety:** View is droppable; the flag back-fill is reversible (`UPDATE households SET is_mixed_line=NULL`). Read-mostly; the only write is a boolean already covered by HH-5's column.
- **Acceptance:** `household_rollup` returns ~59 (HIGH-linked subset once HH-6 ran) rows with correct member counts and aggregated `line_categories`; `is_mixed_line` true for ~44 households and matches a manual recount on a 5-household sample (Floyd, Barrs, Myers/Rhodes, Frazier, Fletcher). No household shows a `line_category` of NULL where the member clearly has a normalized policy (catches HYG- gaps).
- **Priority + domain-rank:** P1 · **B-rank 7**

---

## HH-8 — Household display-name rule

- **Problem:** `households.name` is NULL. The UI/cross-sell lists need a stable, human-readable label. B-households.md specifies "Surname — house# ZIP" for address households, falling back to the seed member's name for email/phone-only clusters.
- **Change (TEXT):**
  ```sql
  UPDATE households h
  SET name = sub.display_name, updated_at = now()
  FROM (
    SELECT h2.id,
      CASE
        -- HIGH address households: "Surname — house# ZIP"
        WHEN h2.tier='HIGH' AND pa.address_line1 IS NOT NULL AND pa.zip_code IS NOT NULL
          THEN INITCAP(LOWER(SPLIT_PART(TRIM(pa.name),' ',GREATEST(1,array_length(string_to_array(TRIM(pa.name),' '),1)))))
               || ' — ' || SPLIT_PART(TRIM(pa.address_line1),' ',1) || ' ' || pa.zip_code
        -- fallback (email/phone-only or missing address): seed (primary) member's name + " Household"
        ELSE pa.name || ' Household'
      END AS display_name
    FROM households h2 JOIN accounts pa ON pa.id = h2.primary_account_id
  ) sub
  WHERE sub.id = h.id AND h.name IS DISTINCT FROM sub.display_name;
  ```
  - Uses `primary_account_id` (HH-5) as the surname/address source — deterministic.
  - Collisions (two "Smith — 123 32024") are acceptable as labels; the `id` disambiguates. Optionally append a short hash if a uniqueness constraint is ever desired (not required).
- **Type:** Data write (`households.name`).
- **Depends on:** HH-5 (primary_account_id), HH-6 (so HIGH households are real).
- **Reversibility & safety:** Reversible (`UPDATE households SET name=NULL`). Cosmetic field; no FK, no cascade.
- **Acceptance:** Every household has a non-null `name`. HIGH address households render as "Surname — house# ZIP" (e.g. "Floyd — 123 32024"); email/phone-only fall back to "<Name> Household". Re-running changes nothing (idempotent via `IS DISTINCT FROM`).
- **Priority + domain-rank:** P2 · **B-rank 8**

---

## HH-9 — Deprecate legacy household constructs (coordinate with MODEL-)

- **Problem:** `household_accounts` (1 synthetic row, FKs dead `contacts`) and `portal_household_members` (portal-invite only) and `households.primary_contact_id` (→ dead `contacts`) must not be used for CRM grouping going forward, or the org ends up with four conflicting household notions again.
- **Change (TEXT — staged, non-destructive first):**
  ```sql
  -- Step 1 (now): comment + stop writes (application-level), keep tables for safety.
  COMMENT ON TABLE household_accounts IS 'DEPRECATED for CRM grouping 2026-06; use households + accounts.household_id. Retained read-only pending MODEL- cutover.';
  COMMENT ON TABLE portal_household_members IS 'Portal-invite construct only; NOT CRM householding. Use households + accounts.household_id.';
  COMMENT ON COLUMN households.primary_contact_id IS 'DEPRECATED (contacts table is empty). Superseded by households.primary_account_id.';
  -- Step 2 (later, MODEL--owned, after a release with no readers): optionally drop the synthetic row / column.
  -- DELETE FROM household_accounts WHERE <synthetic row>;   -- only once confirmed unreferenced
  -- ALTER TABLE households DROP COLUMN primary_contact_id;  -- MODEL- executes, not HH-
  ```
- **Type:** Deprecation (comments now; drops deferred to MODEL-).
- **Depends on:** HH-2, HH-5, HH-6 (the replacement must be live first). **Coordinates with MODEL-** (MODEL- owns the eventual DROP of `primary_contact_id` and the `household_accounts` lifecycle — HH- must not DROP what MODEL- is also scheduling).
- **Blocks:** Nothing in HH-; informs MODEL- cleanup.
- **Reversibility & safety:** Comments are free to reverse. No table dropped in this domain's scope — the destructive drops are explicitly handed to MODEL- to avoid two domains racing on the same objects. Zero data loss.
- **Acceptance:** The three legacy objects carry DEPRECATED comments; application code paths for CRM grouping read `households`/`accounts.household_id` only; `portal_household_members` still functions for its portal purpose. No drops executed by HH-.
- **Priority + domain-rank:** P2 · **B-rank 9**

---

## HH-10 — Human-review gate for MEDIUM/LOW + person↔business exclusions

- **Problem:** MEDIUM (diff-surname-same-address, shared email) and LOW (phone-only) households have real false-positive risk: roommates vs. spouses, family inbox vs. shared agent email, shared-PM phone, ZIP/state data errors (Edna Smith ZIP 32008 / Murphy NC; Mack/Anderson ZIP 33909). Person↔business pairs (Sorensen&Smith, Max Bass+BoxDrop+True Life Church, D&H Tractor+Witt) must never auto-link. These require a human pass before `accounts.household_id` is set.
- **Change (TEXT — a review queue the owner works; approval flips the link):**
  ```sql
  -- Review queue: every MEDIUM/LOW household + the specific risk flags, surfaced for eyeball.
  CREATE OR REPLACE VIEW hh_review_queue AS
  SELECT h.id AS household_id, h.name, h.tier, h.match_signals,
         ARRAY_AGG(a.name ORDER BY a.name) AS members,
         ARRAY_AGG(DISTINCT a.city) AS cities,
         ARRAY_AGG(DISTINCT a.zip_code) AS zips,
         CASE
           WHEN 'B_diff' = ANY(h.match_signals) THEN 'diff-surname same address: roommates vs name-change?'
           WHEN h.tier='LOW' THEN 'phone-only: confirm by call before linking'
           WHEN 'C' = ANY(h.match_signals) THEN 'shared email: family inbox vs shared agent/PM?'
           ELSE 'review' END AS review_reason
  FROM households h
  JOIN hc_members m ON m.household_key::text = (SELECT MIN(id::text) FROM accounts WHERE id IN (SELECT account_id FROM hc_members mm WHERE mm.household_key=m.household_key))
  JOIN accounts a ON a.id = m.account_id
  WHERE h.linked_by = 'review'
  GROUP BY h.id, h.name, h.tier, h.match_signals;
  -- Approval action (run per approved household, build agent executes on owner sign-off):
  --   UPDATE accounts SET household_id = :hid WHERE id = ANY(:approved_member_ids);
  --   UPDATE households SET linked_by='review-approved', updated_at=now() WHERE id=:hid;
  -- Rejection: leave accounts.household_id NULL; optionally set households.linked_by='review-rejected'.
  ```
  - **Person↔business** items never enter auto-link (already excluded in HH-3). If a reviewer wants to *relate* (not household) an owner to their LLC, that is a Domain C relationship, not an HH- link.
  - Known data-error flags (Edna Smith, Mack/Anderson) are surfaced via the city/zip arrays so the reviewer sees the cross-region mismatch.
- **Type:** Review workflow (view + gated manual UPDATEs).
- **Depends on:** HH-5 (review rows exist), HH-6 (auto path done first).
- **Blocks:** Final linking of MEDIUM/LOW (only after sign-off).
- **Reversibility & safety:** Nothing auto-applies. Each approval is a single reversible `UPDATE … household_id`; rejections write nothing. Person↔business stays unlinked by construction. This is the safety valve for the whole domain.
- **Acceptance:** `hh_review_queue` lists the 8 MEDIUM + 6 LOW households with a human-readable `review_reason` and member/city/zip context; the cross-region data-error households are visibly flagged; no MEDIUM/LOW account is linked until an explicit approval UPDATE runs. Sorensen&Smith / Max Bass-business / D&H Tractor never appear as auto-links.
- **Priority + domain-rank:** P1 (governance) · **B-rank 10**

---

## HH-11 — Maintained re-run routine (idempotent, book-growth-safe)

- **Problem:** The book grows weekly. New accounts (new spouse, new policy on an existing roof) must fold into the right household without manual re-runs and without duplicating households or re-linking by hand. The matcher must stay correct over time and must keep honoring DUP-/MODEL-/HYG- prerequisites.
- **Change (TEXT — wrap HH-1→HH-8 in one re-runnable routine; schedule via Supabase edge function + cron, or a SQL function called by pg_cron):**
  ```sql
  -- Recommended: a SECURITY DEFINER SQL function refresh_households() that, in order:
  --   1. runs HH-1 pre-flight; aborts (RAISE NOTICE + return) if any prerequisite fails.
  --   2. recomputes hh_input + HH-4 candidates into staging.
  --   3. HH-5 upserts households (deterministic v5 ids => no dup households).
  --   4. HH-6 links ONLY HIGH/auto accounts (idempotent IS DISTINCT FROM).
  --   5. HH-7 refreshes is_mixed_line; HH-8 refreshes names.
  --   6. NEVER auto-links MEDIUM/LOW (those stay in hh_review_queue for a human).
  --   7. Un-links accounts that dropped out of a HIGH component (e.g. address corrected):
  --        UPDATE accounts SET household_id=NULL
  --        WHERE household_id IS NOT NULL AND id NOT IN (SELECT account_id FROM hc_members hi
  --             JOIN hc_candidates hc USING(household_key) WHERE hc.tier='HIGH');
  --   8. Soft-retire empty households: households with 0 current members ->
  --        UPDATE households SET tier='EMPTY' (or delete if never linked).
  -- Trigger options (recommend the scheduled job over a row trigger, to batch and to keep the
  -- recursive CC cheap): pg_cron nightly  OR  a Supabase scheduled edge function calling the RPC.
  -- A lightweight AFTER INSERT/UPDATE trigger on accounts(address_line1,zip_code,email,phone,name)
  -- may ENQUEUE a "households dirty" flag rather than recompute inline (CC over the whole book
  -- per-row is wasteful). The scheduled job drains the flag.
  ```
  - **Idempotency guarantees:** deterministic canonical key + v5 household id + `IS DISTINCT FROM` link guard ⇒ running the routine N times == running once. New accounts join existing households (same key) or form new ones; corrected/merged accounts un-link cleanly.
  - **Stays correct with DUP-:** because `hh_input` (HH-3) subtracts `merge_history` losers and `dup_exclusions` every run, a duplicate created later is removed from householding once DUP- processes it.
- **Type:** Operational routine (function + scheduler).
- **Depends on:** HH-1..HH-8; DUP-/MODEL-/HYG- continuing to publish their outputs.
- **Blocks:** Nothing; this is the steady-state.
- **Reversibility & safety:** The routine only ever sets/clears a nullable FK and upserts household rows — every effect is reversible by the same primitives as HH-5/HH-6. It refuses to run (HH-1 gate) if a prerequisite regresses, so it can't silently corrupt grouping. Schedule it read-mostly (nightly) to bound cost. Recommend logging each run's link/unlink counts to a small `hh_run_log` for audit.
- **Acceptance:** Calling `refresh_households()` twice in a row produces 0 net changes (idempotency). Inserting a synthetic new spouse account at an existing HIGH address and re-running links it to the existing household (no new household row, no dup). A prerequisite regression (e.g. a new NULL-workspace account) makes the routine abort at HH-1 rather than mis-link. Run log records counts.
- **Priority + domain-rank:** P2 (sustainability) · **B-rank 11**

---

## Appendix — Ordered build sequence & one-line dependency map

1. **HH-1** pre-flight gate ⟵ MODEL-stamp, HYG-LOB, DUP-merge
2. **HH-2** schema: `accounts.household_id` + `households` canonical columns ⟵ co-author with MODEL-
3. **HH-3** `hh_input` view (exclusions: office, commercial_business, business-tokens, DUP- losers) ⟵ DUP-, Domain C token list
4. **HH-4** matcher: A/B_same(HIGH) · B_diff/C(MEDIUM) · D(LOW, down-weighted) → deterministic union-find ⟵ HH-3
5. **HH-5** upsert `households` (HIGH=auto, MED/LOW=review), primary_account_id by survivor rule ⟵ HH-2, HH-4
6. **HH-6** link `accounts.household_id` for **HIGH only** ⟵ HH-1, HH-5
7. **HH-7** `household_rollup` view + `is_mixed_line` ⟵ HH-6, **HYG-LOB**
8. **HH-8** display name "Surname — house# ZIP" / fallback ⟵ HH-5, HH-6
9. **HH-9** deprecate `household_accounts` / `portal_household_members` / `primary_contact_id` (comments; drops → MODEL-) ⟵ HH-6
10. **HH-10** human-review queue for MEDIUM/LOW + person↔business ⟵ HH-5, HH-6
11. **HH-11** maintained `refresh_households()` routine (cron/edge fn) ⟵ HH-1..HH-8

**Cross-domain dependencies (hard):** DUP-merge **before** HH-3/HH-6 (Cruce, Darwiche, Zhang, Lawrence + nested Name×N excluded from HH-, routed to DUP-); MODEL-workspace-stamp **before** HH-1 (adds the 167 hidden accounts → HIGH grows 42→45); HYG-LOB-normalization **before** HH-7 (mixed-line on normalized, not raw, LOB); Domain C shares the business-name token list (HH-3) and owns owner↔business *relating*.

**Disputes / flags carried forward:**
- **42 vs 45 HIGH:** brief's "42 auto-link" is stamped-only; build target after MODEL- stamp is **45 households / 95 accounts** (re-verified). Use the live number at build, do not hard-code.
- **Component-size nondeterminism (Barrs/Max Bass 5/7):** source `WITH RECURSIVE` lacked a cycle guard; HH-4 replaces it with a deterministic cycle-safe union-find. Trust HH-4 membership, not the ad-hoc sizes.
- **Mixed-line 44** is provisional until HYG- LOB lands (computed on raw text this session).
