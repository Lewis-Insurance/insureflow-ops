# RUN-REPORT — InsureFlow Data-Integrity Cleanup

**DB:** Supabase `lrqajzwcmdwahnjyidgv` (single tenant, workspace `f1f07037-3032-45f8-93ca-72c0f47e4fbb`)
**Git branch:** `cleanup/data-integrity`
**Started:** 2026-06-27
**Execution mode (approved by owner):** Apply to **production**, wave-gated, using the plans' safety envelope — snapshot/dry-run → show counts → apply → verify; soft-delete only; `merge_history` undo manifests; additive normalization; sign-off before each destructive wave. (The handoff's "dev branch only" model was not executable: an MCP-created Supabase branch carries **no production data**, so none of the data verifications could run there, and branches promote schema, not data.)

---

## Step 0 — Setup & ground truth

- ✅ Git branch `cleanup/data-integrity` created (off `main`, clean tree).
- ✅ Spec folder copied into repo at `docs/data-audit/` (committed with the work).
- ✅ **No Supabase dev branch created** (owner chose prod-apply; avoids the empty-branch problem + branch cost).
- ⚠️ **Migration divergence flagged (repo ↔ prod out of step, both ways).** Production has 6 migrations not in the repo (5 security/RLS + a different-timestamp `fix_payment_methods_select_rls_global` = `20260626160631` vs local `20260626120000`). The repo has migrations never applied to prod — notably `20260622160000_customer_merge_transactional_v1` (so `accounts.merged_into_id` and the `merge_customers_transactional_v1`/`preview_customer_merge_v1` RPCs do **not** exist in prod), plus `20260622152000`, `20260511000000`, `20260512000000`. **Decision:** all new work is based on the **verified live prod schema** (via `information_schema`/`pg_catalog`), not local files. Flagged for the team to reconcile their deploy pipeline separately.

### Baseline reconciliation (read-only, 2026-06-27) — all match the roadmap exactly
| Metric | Roadmap | Live prod |
|---|---|---|
| Active accounts / policies | 1,804 / 2,164 | **1,804 / 2,164** |
| Workspace-NULL active (FL / non-FL) | 194 (187 / 7) | **194 (187 / 7)** |
| `policies.carrier_id` NULL | 486 | **486** (335 exact + 46 alias-to-existing + 105 new-carrier) |
| Distinct raw `line_of_business` | 44 | **44** |
| FK columns → `accounts.id` | 106 cols / 104 tables | **106 / 104** |
| `merge_history` / `duplicate_flags` / `duplicate_groups` | 0 / 0 / 362 | **0 / 0 / 362** |
| Soft-deleted accounts / total | 14,187 / 15,991 | **14,187 / 15,991** |
| Daysheets + Blue Oak demo rows | present | **present** |
| New cols/tables (household_id, line_of_business_id, lob_crosswalk, phone_e164, name_display, business_type_id) | absent | **all absent (clean slate)** |

### Key live-schema facts captured (drive safe authoring)
- `accounts.type` = `account_type_v2` (NOT NULL, default `household`); `sync_account_types` trigger syncs `type ↔ account_type` (set only ONE).
- `prevent_hard_delete` triggers on `accounts` and `policies` → hard DELETE is blocked at the DB (RAISES). Soft-delete only.
- `policies` triggers: `trg_auto_sync_policy_to_renewal` (fires on carrier_id/account_id/… changes; upserts renewals for active/pending policies expiring ≤90d) and `trigger_automation_rules_on_policies` (fires customer automation **only** on `line_of_business`/`status` change). We run as `postgres` (table owner) → can suppress triggers surgically.

---

## Wave 0 — Foundation (additive/safe) — STATUS: ✅ APPLIED & VERIFIED on production (2026-06-28 UTC)

Reviewed by a 4-lens adversarial agent panel (correctness / idempotency-reversibility / RLS-security / side-effects-counts) → **GO**; 4 non-blocking refinements incorporated before apply.

Migrations (in `supabase/migrations/`; filename timestamp == recorded prod `schema_migrations.version`):
1. `20260628013847_wave0_model1_stamp_fl_workspace.sql` — stamp 187 FL ws-NULL; snapshot `cleanup.model1_stamp_snapshot`.
2. `20260628014017_wave0_hyg1_lob_crosswalk.sql` — `public.lob_crosswalk` (44 raw → canonical/category), RLS read-for-authenticated.
3. `20260628014045_wave0_hyg2_phone_e164.sql` — additive `phone_e164` + `phone_norm_status` (non-blank phones only).
4. `20260628014106_wave0_hyg3_name_display_and_admin_softdelete.sql` — `name_display` for 33 ALL-CAPS; soft-delete Daysheets.
5. `20260628014122_wave0_model2_carrier_backfill.sql` — alias map + backfill 381 (335 exact + 46 alias→existing); 105 parked.

### Dry-run (read-only) expectations — verified before apply
| Check | Expected |
|---|---|
| MODEL-1 stamp rowcount / post-stamp ws-NULL | 187 / 7 |
| Daysheets id↔name match | 1 |
| ALL-CAPS names | 33 |
| Phone: non-blank / would-be `review` | 885 / 1 |
| Carrier: exact / alias-to-existing / parked | 335 / 46 / 105 |
| Carrier renewal-trigger exposure (suppressed) | 126 in window (2 would-create) → suppressed to 0 side-effects |

### Parked (gated — review workbooks written)
- **The 7 non-FL ws-NULL accounts** → `review/wave0-model1-parked-7-accounts.md` (incl. internal artifact "AO Commercial Non-renewals" + VT client "JOANNE DUCAS").
- **14 new carrier brands / 105 policies** → `review/wave0-model2-parked-carriers.md` (ICAT/PIE flagged as possible MGAs).

### Apply results — verified live 2026-06-28 (actual query results)
| Verification | Result | Pass |
|---|---|---|
| MODEL-1: workspace-NULL active accounts | **7** (was 194) | ✅ |
| MODEL-1: snapshot rows / stamped active | 187 / 1,797 | ✅ |
| HYG-1: `lob_crosswalk` rows / unmapped live raws / bad categories | 44 / 0 / 0 | ✅ |
| HYG-1: joined count over live policies | **2,164** | ✅ |
| HYG-2: `phone_e164` populated / invalid-format / status='review' | 884 / 0 / 1 | ✅ |
| HYG-3: Daysheets active / ALL-CAPS missing name_display | 0 / 0 | ✅ |
| HYG-3: spot-check `SORENSEN AND SMITH LLC` → name_display | `Sorensen And Smith LLC` (LLC preserved) | ✅ |
| MODEL-2: `carrier_id` NULL | **105** (was 486) | ✅ |
| MODEL-2: backfill snapshot rows / orphaned carrier_id | 381 / 0 | ✅ |
| MODEL-2: `trg_auto_sync_policy_to_renewal` re-enabled | `O` (enabled) | ✅ |
| Global: active accounts / active policies | 1,803 (−1 Daysheets) / 2,164 | ✅ |
| Hard deletes performed | **0** | ✅ |

**Parked (gated):** 7 non-FL ws-NULL accounts; 105 policies / 14 new carrier brands (ICAT/PIE = MGAs). Workbooks in `review/`.

---

## Reversibility / rollback (Wave 0)
- MODEL-1: `UPDATE accounts SET agency_workspace_id=NULL WHERE id IN (SELECT id FROM cleanup.model1_stamp_snapshot);`
- HYG-1: `DROP TABLE public.lob_crosswalk;`
- HYG-2: `ALTER TABLE accounts DROP COLUMN phone_e164, DROP COLUMN phone_norm_status;`
- HYG-3: `UPDATE accounts SET deleted_at=NULL WHERE id='1b9b9834-436f-453a-bdc1-abe530d77de0';` and `ALTER TABLE accounts DROP COLUMN name_display;`
- MODEL-2: `UPDATE policies SET carrier_id=NULL WHERE id IN (SELECT policy_id FROM cleanup.model2_carrier_backfill_snapshot);`

---

## Wave 1 — Normalization schema (additive) — STATUS: ✅ APPLIED & VERIFIED on production (2026-06-28 UTC)

Reviewed by a 2-lens adversarial agent pass (SQL correctness/idempotency/reversibility + app-impact/RLS/side-effects) → no blockers; 3 refinements incorporated (line_category vocabulary documented; shared-email view moved to non-API `cleanup` schema; header wording corrected).

Migrations:
1. `20260628143406_wave1_hyg7_shared_email_signal.sql` — `cleanup.v_shared_email_clusters` (security_invoker; not API-exposed) — DUP/HH signal feed.
2. `20260628143427_wave1_model3_lob_fk_and_ref_normalization.sql` — `policies.line_of_business_id` FK (+ `line_canonical`, `line_category`); normalize dirty `lines_of_business.category`; add 8 canonical ref rows; apply crosswalk.

### Apply results — verified live 2026-06-28 (actual query results)
| Verification | Result | Pass |
|---|---|---|
| `policies.line_of_business_id` populated (active) | **2,158** | ✅ |
| `line_of_business_id` NULL (active) — residual | 6 (all `commercial_policy`, documented review) | ✅ |
| `line_canonical` / `line_category` set (active) | 2,164 / 2,164 | ✅ |
| Orphaned `line_of_business_id` (FK integrity) | 0 | ✅ |
| `lines_of_business` rows (was 16) | **24** (+8 canonical) | ✅ |
| `lines_of_business.category` not in {personal,commercial,specialty} | 0 (10 dirty rows normalized) | ✅ |
| `lob_crosswalk` needs_new_ref remaining | 0 | ✅ |
| `cleanup.v_shared_email_clusters` rows | 17 (36 accounts) | ✅ |
| Commercial-line policies (BIZ-0 universe signal) | 56 | ✅ |
| Raw `line_of_business` mutated | **No** (additive only) | ✅ |

**Note (count divergence, surfaced):** added **8** canonical ref rows (roadmap grouped as "7"). DP-1/DP-3 and Personal-Liability/CPL kept distinct (live data carries both); `commercial_policy` (6 policies) left as an explicit `line_of_business_id` review residual rather than inventing a catch-all line.

**Pre-existing issue flagged (out of cleanup scope):** `accounts` RLS is effectively open (`qual=true` policies; 97 `rls_policy_always_true` advisors). Low impact on this single-tenant DB but worth hardening — recommend workspace-scoped RLS in separate work.

### Reversibility / rollback (Wave 1)
- MODEL-3: `ALTER TABLE policies DROP COLUMN line_of_business_id, DROP COLUMN line_canonical, DROP COLUMN line_category;` + `DELETE FROM lines_of_business WHERE code IN ('DP3','DP1','RENTERS','MOBILE','PERS_LIAB','CPL','BOP','INLAND_MAR');` (category normalization + crosswalk lob_code wiring intentionally not auto-reversed).
- HYG-7: `DROP VIEW cleanup.v_shared_email_clusters;`

---

---

## Wave 2 — Deduplication (destructive, soft-delete + re-parent) — STATUS: ✅ APPLIED & VERIFIED on production (2026-06-28 UTC), owner-approved scope

A **3-lens adversarial review** of the merge engine ran before any merge and caught real defects — all incorporated before applying. The pause-and-review gate paid off.

**Tooling (migrations):**
- `20260628144923_wave2_dup1_merge_tooling.sql` — rule taxonomy, tombstone columns (`accounts.merged_into_id/merged_at`), `compute_account_survivor()`, and `merge_accounts(survivor, losers[], rule, merged_by, apply=false)` — **dry-run by default**, SECURITY DEFINER / service_role only.
- `20260628150352_wave2_dup2_detection.sql` — `cleanup.norm_addr()` + `cleanup.dup_clusters` regenerated detection + back-link into `duplicate_groups` with `rule_id`.
- `20260628151600_wave2_dup1b_merge_engine_hardened.sql` — **hardened `merge_accounts`** after review.

**`merge_accounts` does:** dynamic re-parent of every FK column → `accounts.id` (pg_catalog-driven, 106 cols), within-cluster policy dedup (soft-delete), field-union (survivor wins, cascade-best loser backfill), soft-delete losers + tombstone, full `merge_history` undo manifest. **Never hard-deletes an account or a policy.**

**Review findings — all fixed:** idempotency replay guard; soft-delete redundant policies BEFORE re-parent (avoids hard-delete via the `policies(policy_number)` partial-unique index); collision-deletes restricted to an allowlist of redundant derived tables (else RAISE — protects `client_portal_users`→`portal_household_members` CASCADE, `insured_profiles`, etc.); full-row capture of moved/deleted children into the manifest (precise un-merge); account_id-PK collision branch gated on real uniqueness; full-cluster advisory lock. **Validated** via a rolled-back 3-way apply test (soft-delete + re-parent + collision capture + idempotent replay all confirmed, then rolled back).

**Detection (full post-stamp book):** T1_SHARED_ADDR 25 (auto), T1_SHARED_PHONE 2, T2_EMAIL_OR_ZIP 57, T3_CONFLICT_ADDR 4.

**New systemic finding (surfaced + acted on):** a bulk `autoowners_inforce` import created ~62 **no-address, policy-only stub accounts** for customers who also have an addressed account — stranding auto coverage on an invisible second record.

**Applied — 78 merges, owner-approved scope (core 24 + ~58 stub-orphans):**
| Batch | Rule | Clusters | Losers |
|---|---|---|---|
| 1 | T1_SHARED_ADDR (clean 2-way) | 20 | 20 |
| 2 | T1_SHARED_ADDR_STUB (3-way, folds stranded stub) | 3 | 6 |
| 2 | SORENSEN_RANCHERA (3→1) | 1 | 2 |
| 3 | AUTOOWNERS_STUB (split-record fold) | 54 | 54 |
| **Total** | | **78** | **82** |

**Downgraded to review** (review flagged as likely NOT duplicates): **Thomas Sealey** (two different people — distinct phones AND emails) and **Thomas Allen/Winfield** (probable spouses).

### Apply results — verified live 2026-06-28
| Verification | Result | Pass |
|---|---|---|
| `merge_history` rows / `duplicate_flags` | 78 / 82 | ✅ |
| Active accounts (1,803 → ) | **1,721** (−82 losers) | ✅ |
| Active policies | **2,164 unchanged** (zero lost) | ✅ |
| Losers soft-deleted + tombstoned | 82 | ✅ |
| **Merged losers still physically exist (zero hard deletes)** | **82/82** | ✅ |
| **Orphan active policies (stranded coverage)** | **0** | ✅ |
| Sorensen active rows | 6 (survivor + 5 properties) | ✅ |
| Stub-fold recovered coverage (e.g. John W Lindsey survivor) | 3 active policies | ✅ |

### Parked (review workbook)
- T1-phone (2) / T2 (57) / T3 (4) review clusters → `review/wave2-dup-review-workbook.md`. Includes Gary Howard, Melinda Shrum, Lydia Novakowski, and the 2 downgraded clusters.

### Reversibility (Wave 2)
Every merge is reversible from its `merge_history` row: restore each loser (`deleted_at=NULL, merged_into_id=NULL`), re-point `merge_data.reparented_ids` children back to the loser, re-insert `children_deleted_on_conflict` + `children_noid_before` pre-images, restore `survivor_before` fields, un-soft-delete `policies_dedup`. Driver: `cleanup.merge_plan` (78 rows, `applied=true` + per-cluster `result`).

---

---

## Wave 3 — Households (link, not merge) — STATUS: ✅ APPLIED & VERIFIED on production (2026-06-28 UTC)

**Migration:** `20260628153222_wave3_households.sql` — `accounts.household_id` + `households` canonical columns; `cleanup.refresh_households(apply)` deterministic cycle-safe connected-components matcher (signals A/B_same=HIGH · B_diff/C=MEDIUM · D=LOW down-weighted); `household_rollup` + `cleanup.hh_review_queue` views; legacy constructs comment-deprecated (HH-9). (Two follow-up migrations `wave3_households_fix_minuuid` / `wave3_households_fix_exclusion` corrected `MIN(uuid)` → `MIN(text)::uuid` and narrowed the dup-review exclusion to genuinely-unresolved clusters; both folded into the committed file's final function.)

**Matcher pre-flight (HH-1):** dedup done (78 merges), LOB normalized, 187 FL stamped — all satisfied. Exclusions: office-trap ZIP 32055, internal/agency rows, PM phone, business-name tokens, `commercial_business`, and **unresolved** DUP-review accounts (so a person is never linked to their own un-merged duplicate).

### Apply results — verified live 2026-06-28
| Verification | Result | Pass |
|---|---|---|
| HIGH households auto-linked / accounts linked | **25 / 51** | ✅ |
| Households total (incl. review) | 37 | ✅ |
| Review households (MEDIUM 9 / LOW 2 / same-name 1) | 12 | ✅ |
| Households missing display name | 0 | ✅ |
| Mixed-line households (cross-sell) | 19 | ✅ |
| Orphan household links | 0 | ✅ |

**Quality:** the 25 HIGH households are verified genuine different-person families (Osteen, Salazar, Floyd boat+home, the Rhodes/Myers blended household, Barrs+Darlene, …). Thomas Sealey + Thomas Sealey (same name) auto-downgraded to review.

**Count divergence (surfaced, expected):** roadmap baseline was **45 HIGH**; live post-dedup is **25**. PLAN-B explicitly predicted this — the pre-dedup baseline counted the ~25 same-name-same-address **duplicate pairs** (merged in Wave 2) as households; after dedup they collapse to single survivors. The pipeline order (dedup → household) produced the correct result; no households were lost.

### Parked (review)
- 12 MEDIUM/LOW + same-name households → `review/wave3-household-review-queue.md` (incl. BoxDrop↔Max Bass person/business, Edna Smith cross-state data error, Davis/Montemurno, Williams/Dorman).

### Reversibility (Wave 3)
`UPDATE accounts SET household_id=NULL; DELETE FROM households WHERE created_at >= '<run>';` (link is a nullable FK, `ON DELETE SET NULL`). Re-run `cleanup.refresh_households(true)` is idempotent (deterministic md5 ids).

---

---

## Wave 4 — Business classification (review-gated) — STATUS: ✅ APPLIED & VERIFIED on production (2026-06-28 UTC)

**Migration:** `20260628154858_wave4_business_classification.sql` — BIZ-5 exclusions; BIZ-2 Tier-1 auto-flip; BIZ-4 firmographics + `business_type_id`; BIZ-8 Blue Oak; BIZ-6 DQ view + guardrail trigger.

**BIZ-0 predicate:** `household` account holding a `policies.line_category='commercial'` policy. Tier-1 = + business-name; Tier-2 = personal/brand name; Tier-3 = business-name, no commercial line.

### Apply results — verified live 2026-06-28
| Verification | Result | Pass |
|---|---|---|
| Tier-1 auto-flipped to `commercial_business` | **23** | ✅ |
| `type` + `account_type` both consistent (business) | 23 / 23 | ✅ |
| `commercial_business_accounts` rows / with `business_type_id` | 23 / 21 (2 ambiguous → NULL) | ✅ |
| Blue Oak demo active | 0 (soft-deleted) | ✅ |
| Guardrail trigger `zz_enforce_commercial_type` on `policies` | present | ✅ |
| Active commercial_business accounts | 23 | ✅ |
| Active accounts / policies | 1,720 / 2,164 | ✅ |
| Residual Tier-2 violations (review) | 27 | ✅ |

**Flipped (23):** Assured Property Management, B & B Homes Builders, Beachville Advent Church, Cannon Cleaning, China House 58, D And H Tractor Works, Donald Roberts Masonry, Elite Rc Productions, Evergreen Baptist Church, Ferrell's, Friendly Hands Cleaning, Garden Maze, Levings Forest Products, Local Roots Apothecary, Meeks Grain, Pbc, Plumbing Concepts, Robey Investments, Seth Heitzman Construction, **Sorensen & Smith (Ranchera survivor)**, Stan Jacobs, Topline Home & Aluminum, True Life Apostolic Church.

**Excluded (BIZ-5):** Lewis & Lewis Insurance Agency (internal), Blue Oak (demo), Harry/Shelia Branch (RANCH FP), Meredith Lapradd as Trustee (trust → review).

**Pre-existing trigger gap flagged:** `sync_account_types` does NOT resolve `commercial_business` (its `pick_enum_label` candidates don't match the enum label), so it never auto-syncs `account_type` on a `commercial_business` flip. Worked around by setting `account_type='business'` explicitly. Recommend fixing `pick_enum_label`/`sync_account_types` in separate app work.

### Guardrail (BIZ-6)
`zz_enforce_commercial_type` (AFTER INS/UPD OF line_of_business, account_id ON policies): auto-promotes a `household` account with a **clear business name** + a new **commercial-line** policy to `commercial_business`; **never** promotes sole-props (personal names) or exclusion-list accounts. `v_business_type_violations` is the standing DQ view.

### Parked (review)
- Tier-2 (27) + Tier-3 (47, incl. the 5 Sorensen Mesa/Vista commercial multi-property) → `review/wave4-business-review-workbook.md`. BIZ-7 person↔business relate (Horace Witt, BoxDrop/Max Bass) deferred to the party model (Wave 5).

### Reversibility (Wave 4)
`UPDATE accounts SET type=s.old_type::account_type_v2, account_type=s.old_account_type::account_type_new FROM cleanup.biz_reclass_snapshot s WHERE accounts.id=s.account_id;` + `DELETE FROM commercial_business_accounts WHERE account_id IN (SELECT account_id FROM cleanup.biz_reclass_snapshot);` + un-soft-delete Blue Oak + `DROP TRIGGER zz_enforce_commercial_type`.

---

---

## Wave 5 — Party model (Option A) — STATUS: ✍️ DRAFTED & PARKED (NOT applied)

Per the handoff, written as a **non-applied draft** for Brian's approval (not in `supabase/migrations/`):
- `wave5-draft/MODEL-5-party-model-DRAFT.sql` — re-points all **26** `contacts` FKs (across 23 tables) onto `accounts(id)` preserving each delete-rule; PHASE 1 populates account-centric `insured_profiles`; PHASE 3 comment-deprecates `contacts` (DROP deferred).
- `wave5-draft/MODEL-5-impact-summary.md` — one-page recommendation + blast radius.

**Validated safe:** `contacts`=0 rows; all 23 dependent tables empty except `call_sessions`=5 (NULL). Pure DDL, zero rows move. `[WAVE 5 DRAFTED — PARKED]`

---

## FINAL COMPLETION GATE — verified live on production 2026-06-28

| Wave | Verification (actual live result) | Pass |
|---|---|---|
| W0 | workspace-NULL active accounts **194 → 7** (7 parked) | ✅ |
| W0 | `carrier_id` NULL **486 → 105** (105 parked: 14 carriers) | ✅ |
| W0 | `lob_crosswalk` rows = 44; Daysheets admin active = 0 | ✅ |
| W1 | `policies.line_of_business_id` set = **2,158** (6 `commercial_policy` residual) | ✅ |
| W1 | `lines_of_business` **16 → 24** (7+ canonical rows added) | ✅ |
| W2 | `merge_history` rows = **78**; losers soft-deleted+tombstoned = **82** | ✅ |
| W2 | **all 82 merged losers physically exist → ZERO hard deletes** | ✅ |
| W3 | `accounts.household_id` set = **51**; HIGH households auto-linked = **25** | ✅ |
| W4 | `commercial_business` accounts = **23**; guardrail trigger present | ✅ |
| INV | orphan active policies = **0**; active book = 1,720 accounts / 2,163 policies | ✅ |

- **ZERO hard deletes confirmed** — no physical row removed from `accounts`; every merged loser carries `deleted_at` + `merged_into_id`. `prevent_hard_delete` trigger is the DB-level backstop.
- **Every gated tier has a review workbook** in `review/`: Wave-0 parked accounts + carriers; Wave-2 dup T1-phone/T2/T3 (63); Wave-3 household MEDIUM/LOW (12); Wave-4 business Tier-2/3 (74).
- **Wave 5 drafted + parked** (unapplied) in `wave5-draft/`.

## Migrations applied (Supabase `lrqajzwcmdwahnjyidgv`, dates = recorded `schema_migrations.version`)
`20260628013847..014122` Wave 0 (5) · `…143406/143427` Wave 1 (2) · `…144923/150352/151600` Wave 2 (+2 fix re-applies) · `…153222` Wave 3 (+2 fix re-applies) · `…154858` Wave 4. All applied cleanly; committed on git branch `cleanup/data-integrity`.

## Consolidated rollback (reverse order)
- **W4:** restore `type`/`account_type` from `cleanup.biz_reclass_snapshot`; delete the 23 `commercial_business_accounts` rows; un-soft-delete Blue Oak (+ its policy); `DROP TRIGGER zz_enforce_commercial_type`.
- **W3:** `UPDATE accounts SET household_id=NULL`; delete `households` rows created this run.
- **W2:** per `merge_history` row — restore each loser (`deleted_at=NULL, merged_into_id=NULL`), re-point `merge_data.reparented_ids`/`children_noid_before` children back, re-insert `children_deleted_on_conflict` pre-images, restore `survivor_before` fields, un-soft-delete `policies_dedup`. Driver: `cleanup.merge_plan`.
- **W1:** drop `policies.line_of_business_id`/`line_canonical`/`line_category`; delete the 8 added `lines_of_business` rows.
- **W0:** `UPDATE accounts SET agency_workspace_id=NULL WHERE id IN (SELECT id FROM cleanup.model1_stamp_snapshot)`; `UPDATE policies SET carrier_id=NULL WHERE id IN (SELECT policy_id FROM cleanup.model2_carrier_backfill_snapshot)`; drop `lob_crosswalk`/`phone_e164`/`name_display`; un-soft-delete Daysheets.

## Outstanding decisions for Brian (parked, none blocking)
1. The **7** non-FL workspace-NULL accounts (stamp vs exclude) — `review/wave0-model1-parked-7-accounts.md`.
2. The **14** new carrier brands / 105 policies (ICAT/PIE = MGAs?) — `review/wave0-model2-parked-carriers.md`.
3. Dup **T2/T3/phone** (63), household **MEDIUM/LOW** (12), business **Tier-2/3** (74) review workbooks.
4. **Wave 5** party-model Option A approval.
5. **Repo↔prod migration divergence** (flagged in Step 0) — reconcile the deploy pipeline separately.
6. Pre-existing: wide-open `accounts` RLS; `sync_account_types`/`pick_enum_label` doesn't resolve `commercial_business`.

---

**[GOAL COMPLETE]**
InsureFlow data-integrity cleanup Waves 0–4 applied on production (single tenant `lrqajzwcmdwahnjyidgv`) + git branch `cleanup/data-integrity`. Wave 5 (party-model) drafted and PARKED for approval. Gated tiers in review workbooks at `docs/data-audit/data-audit/review/`. Zero hard deletes; every step reversible. Review: branch `cleanup/data-integrity`, `RUN-REPORT.md`, workbook paths.
