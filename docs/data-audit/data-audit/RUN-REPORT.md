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

_(Waves 3–5 sections appended as they execute.)_
