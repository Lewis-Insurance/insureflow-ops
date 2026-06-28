# PLAN A — Deduplication (Build-Ready Merge Plan)

**Database:** InsureFlow / "Lewis Insurance App" (Supabase `lrqajzwcmdwahnjyidgv`)
**Workspace:** `f1f07037-3032-45f8-93ca-72c0f47e4fbb` · active = `deleted_at IS NULL`
**Date:** 2026-06-27 · **Status: PLANNING ONLY — nothing in this file has been executed.** All SQL/DDL below is TEXT for a separate build agent. Only read-only SELECTs were run to verify counts.
**Domain:** DEDUPLICATION = the *same* person/entity represented by 2+ active `accounts` rows. Spouses / different-person-same-roof = HOUSEHOLDS (Plan B), not duplicates, and are explicitly excluded here.

---

## 0. Verified anchors & corrections (re-queried live, 2026-06-27)

| Fact | Value | Source |
|---|---|---|
| Active accounts (all workspaces) | **1,804** | live COUNT |
| ┣ stamped to agency ws | 1,610 | live COUNT |
| ┗ `agency_workspace_id IS NULL` | **194** | live COUNT |
| Active policies | **2,164** | live COUNT |
| `merge_history` rows | **0** (no merge has ever run) | live COUNT |
| `duplicate_flags` rows | **0** | live COUNT |
| `duplicate_groups` rows | 362 (all `status='pending'`, `rule_id` NULL) | live COUNT |
| **FK columns referencing `accounts.id`** | **106 columns across 104 tables** (56 CASCADE, 18 SET NULL, 32 NO ACTION) | `information_schema` |
| ┗ NO ACTION **and** NOT NULL (hard-delete blockers) | **11** | `information_schema` |

### Corrections / disputes vs `A-duplicates.md` (all re-verified live)

1. **Tier counts grow on the full book.** `A-duplicates.md` sized tiers against the **stamped 1,610** and got **T1=21 / T2=58 / T3=4 / 83 clusters**. Re-running the *identical* tier SQL against the **full 1,804** (workspace-NULL included) yields **T1=26 / T2=56 / T3=18 / 92 clusters / 195 accounts**. This is the measurable consequence of the workspace-stamp gap: un-hiding the 194 NULL accounts surfaces new same-name clusters and enlarges existing ones (e.g., the SORENSEN LLC rows are mostly workspace-NULL). **→ This empirically proves the MODEL- workspace-stamp must precede dedup detection; treat 26/56/18 as the post-stamp target, and re-run detection to regenerate the exact cluster list before merging.** The audit's named T1 list (21 clusters, §4) remains valid as the *spot-checked* subset; the 5 extra T1 clusters that appear only post-stamp must be spot-checked the same way before auto-merge.

2. **SORENSEN AND SMITH LLC is 9 rows, not "6–9", and is mostly NOT a merge.** Live breakdown by normalized address:
   - **True dup core (merge 3→1):** `181 Ranchera/Rachera St NW` = **3 rows** — `1e27db5f` (Ranchera), `919d0064` (Ranchera), `3e1fc424` (Rachera, the typo). 5 active policies combined.
   - **Distinct properties (KEEP separate, do NOT merge):** `117 Mesa` (`7e785ee6`), `125 Mesa` (`aa059705`), `300 Mesa` (`f9b0ece8`), `308 Mesa` (`b27bc140`), `2312 Vista` (`d6017096`) — five separate buildings, each its own DF3/HO policy. These are a commercial multi-property holding, handled by Plan C (reclassify commercial), not by merge.
   - The Mesa-address rows share an "identical policy" (American Integrity DF3, eff 2026-05-12) — **this is a master/blanket policy across buildings, NOT a duplicate signal.** Do not let identical-policy detection auto-merge them.

3. **"4 identical-policy pairs" → only ~2 are real dups.** Live: Tracy Cruce (American Integrity PP eff 2025-12-30 — **true dup**, also same-address T1), Gary Howard (Progressive auto, **NULL effective date** — weaker, review), and 4 SORENSEN DF3 pair-rows that are **separate buildings, not dups** (per #2). Net real identical-policy dups: **Tracy Cruce (merge) + Gary Howard (review)**.

---

## 1. Cross-domain dependency statement (read before sequencing)

- **MODEL- workspace-stamp MUST precede all DUP- detection.** Proven in §0.1: the tier counts and the SORENSEN cluster only fully resolve once the 194 NULL-workspace accounts are visible. The build agent must **re-run dup detection after the stamp** and regenerate the cluster list; the IDs in this plan are the pre-stamp spot-checked set plus the documented deltas.
- **DUP- merges MUST precede HH- household linking.** Households key on `accounts.household_id` / surviving account rows; linking before dedup would bind soon-to-be-merged losers into households and double-count roofs. Merge first, then link survivors.
- **DUP- should precede BIZ- reclassification for the SORENSEN cluster specifically** (merge the Ranchera dup core first, then Plan C reclassifies the surviving Ranchera row + the 5 Mesa/Vista rows as commercial). For non-SORENSEN accounts the two are independent.
- **HYG- phone/email standardization is independent** but, if run first, *improves* match recall (E.164 normalization). Not a hard dependency — the dedup match keys already normalize phone to digits-only at query time.

---

## 2. The merge procedure as an algorithm (canonical spec for the build agent)

This is the single source of truth for *how* any DUP- merge executes. Every DUP- item below invokes it.

### 2.1 Survivor selection cascade (first decisive criterion wins)
For a cluster of account rows `{a1..an}` (same entity):
1. **Most active policies** — `COUNT(policies WHERE account_id=ai AND deleted_at IS NULL)` DESC. (Audit: decides 32/83 clusters. Protects revenue — never drop the policy-bearing row.)
2. **Most complete contact** — `(email IS NOT NULL)::int + (phone IS NOT NULL)::int + (address_line1 IS NOT NULL)::int` DESC. (Decides ~40/83.)
3. **Most recent `updated_at`** DESC. (Breaks remaining ~11/83; `updated_at` is populated on all rows.)
4. **Final tiebreak (determinism):** lowest `id::text` ASC — so the algorithm is reproducible across dry-run and apply.

The chosen row = **survivor**; all others = **losers**.

### 2.2 Field-union rule (survivor wins, losers backfill)
For each contact/profile column on `accounts` (`email, phone, address_line1, address_line2, city, state, zip_code, dob, type`, etc.):
- If survivor value `IS NOT NULL` and non-empty → **keep survivor's**.
- Else → **coalesce from losers** in survivor-cascade order (the "best" loser first).
- **Never overwrite a populated survivor field.** Capture every loser's full row in the merge snapshot (§2.4) so nothing is lost.
- `type`: if survivor is `household` but any loser is `commercial`, do **not** auto-resolve here — leave for BIZ- (Plan C). Record the conflict in the snapshot.

### 2.3 Re-parent EVERY child row (the load-bearing safety step)
A loser must have **zero** referencing rows before it is retired. There are **106 FK columns across 104 tables** pointing at `accounts.id` (full inventory in §3). The build agent must, inside one transaction per cluster, run an `UPDATE … SET <fk_col> = :survivor_id WHERE <fk_col> = ANY(:loser_ids)` for **every** FK column — driven dynamically from `information_schema`, not hand-listed, so new tables are covered automatically:

```text
-- Pseudocode the build agent should generate from information_schema (DO NOT hard-code the list):
FOR each (tbl, col) IN (
  SELECT tc.table_name, kcu.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
  JOIN information_schema.constraint_column_usage ccu USING (constraint_name, table_schema)
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
    AND ccu.table_name='accounts' AND ccu.column_name='id'
):
  EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = ANY($2)', tbl, col, col)
          USING survivor_id, loser_ids;
```

**Special-handling notes (verified):**
- **`policies` (account_id, nullable, CASCADE):** re-parent active policies to survivor. Then de-dupe *within survivor*: if the survivor now holds two policies with identical `carrier`+`line_of_business`+`effective_date`+`policy_number`, soft-delete the redundant one (set `deleted_at`) and note it — this is the Tracy-Cruce identical-policy case.
- **`leads.converted_account_id` and `leads.account_id`, `portal_referrals.referring_account_id`/`converted_to_account_id`, `marketing_send_queue.to_account_id`:** non-standard column names — the dynamic loop above already catches them because it reads `kcu.column_name`. Verify they are included in the dry-run row-count report.
- **Self/duplicate-scaffold tables:** `duplicate_groups.entity_ids[]` and `duplicate_flags.account_id` also reference accounts. After merge, mark any `duplicate_groups` row containing a loser id as `status='merged'` and stamp `reviewed_by`/`reviewed_at`.
- **Unique-constraint collisions on re-parent:** some child tables may have a unique index on `(account_id, …)` (e.g., one `insured_profiles` per account, `customer_risk_scores`, `client_portal_users`). Re-parenting a loser's child can collide with the survivor's existing child. Rule: **on conflict, keep the survivor's child, soft-delete (or archive to snapshot then delete) the loser's child.** The build agent must pre-scan for unique constraints on each child `account_id` and generate `ON CONFLICT DO NOTHING` + cleanup for those tables specifically.

### 2.4 Retire the loser — SOFT delete, never hard DELETE
**Do NOT `DELETE FROM accounts`.** The FK census shows **11 NO ACTION + NOT NULL** children that would *block* a hard delete outright, and **56 CASCADE** children that would be *silently destroyed* if the delete somehow proceeded (notes, opportunities, renewals, insured_*, portal_documents, client_portal_users, commercial_business_accounts, …). Instead:
- After all children are re-parented (§2.3), set on each loser: `deleted_at = now()`, and stamp a tombstone (`merged_into = :survivor_id` if such a column exists; otherwise record only in `merge_history`).
- Soft-delete keeps the row recoverable and keeps any missed child FK valid.

### 2.5 Log every merge to `merge_history` (reversibility)
`merge_history` schema (verified): `id uuid pk`, `entity_type text NOT NULL`, `survivor_id uuid NOT NULL`, `merged_ids uuid[] NOT NULL`, `merge_data jsonb NOT NULL`, `merged_by uuid NOT NULL`, `created_at timestamptz default now()`. One row per cluster merge:

```text
INSERT INTO merge_history (entity_type, survivor_id, merged_ids, merge_data, merged_by)
VALUES (
  'accounts',
  :survivor_id,
  :loser_ids,                       -- uuid[]
  jsonb_build_object(
    'cluster_key',      :nkey,
    'rule_id',          :dup_rule_id,           -- the DUP- item / rule taxonomy id
    'survivor_reason',  :which_cascade_step_won, -- 'most_policies'|'most_complete'|'most_recent'|'id_tiebreak'
    'survivor_before',  :survivor_row_json,      -- full survivor row pre-union
    'losers_before',    :array_of_full_loser_rows,
    'field_union',      :map_of_field_to_source_account, -- which account each surviving value came from
    'reparented',       :map_of_table_to_rowcount,       -- per-FK-table rows moved
    'policies_dedup',   :array_of_softdeleted_policy_ids,
    'snapshot_at',      now()
  ),
  :merged_by                        -- the operator/service uuid running the merge
);
```
`merge_data` is the **complete undo manifest**: every loser row, every re-parented table+count, every field-source decision. A reversal procedure reads this row, re-points the listed children back to `merged_ids`, restores loser `deleted_at=NULL`, and reverts unioned survivor fields from `survivor_before`.

### 2.6 Seed `duplicate_flags`
`duplicate_flags` schema (verified): `id`, `account_id NOT NULL`, `flagged_by uuid NOT NULL`, `reason text`, `created_at`. It is a thin "this account was involved in a dedup decision" marker (no status column). For each cluster, insert one flag per loser (and optionally the survivor) recording the human/auto decision:

```text
INSERT INTO duplicate_flags (account_id, flagged_by, reason)
SELECT lid, :flagged_by,
       format('merged into %s via %s (cluster %s)', :survivor_id, :dup_rule_id, :nkey)
FROM unnest(:loser_ids) AS lid;
```
For **review-queued, not-yet-merged** clusters, seed a flag with `reason='queued_review:<tier>'` so the review workbook can pick them up.

### 2.7 Per-cluster transaction & safety envelope
- **Branch-first:** run the entire batch on a Supabase **branch** (`create_branch`), execute, run §-acceptance checks, then `merge_branch` to prod only after sign-off.
- **Dry-run mode:** every DUP- item runs first with `:apply=false` — the procedure computes survivor, the field-union, and the per-table re-parent **row counts**, writes them to a report, and rolls back. No writes. Operator reviews the report; then `:apply=true`.
- **One transaction per cluster** (BEGIN…COMMIT) so a failure isolates to a single cluster and auto-rolls-back.
- **Idempotency:** skip any cluster whose losers are already `deleted_at IS NOT NULL` with a matching `merge_history` row.

---

## 3. Complete FK inventory that must be re-parented (verified live)

106 columns / 104 tables reference `accounts.id`. The build agent re-parents **all** of them via the dynamic loop (§2.3). Grouped by delete-rule so reviewers understand blast radius:

**NO ACTION + NOT NULL — would BLOCK a hard delete; MUST be re-parented first (11):**
`certificates_of_insurance`, `consents`, `invoices`, `portal_coverage_opportunities`, `portal_document_uploads`, `portal_invitations`, `portal_quote_requests`, `portal_referrals.referring_account_id`, `portal_service_requests`, `quotes`, `tickets`.

**CASCADE + NOT NULL — would be SILENTLY DESTROYED on hard delete (sample, 56 total CASCADE):**
`account_memberships`, `account_tags`, `assignment_rules`, `campaign_enrollments`, `client_context_cache/embeddings/index_jobs`, `client_happiness_scores`, `client_portal_users`, `collection_access_tokens`, `commercial_business_accounts`, `customer_risk_scores`, `customers`, `document_processing_queue`, `household_accounts`, `insured_addresses`, `insured_emails`, `insured_phones`, `insured_profiles`, `message_templates`, `notes`, `nurture_campaigns`, `opportunities`, `pipeline_automation_rules/metrics/stage_transitions/stages`, `portal_documents`, `portal_id_cards`, `producer_workload_stats`, `product_recommendations`, `rate_watch_jobs`, `renewal_campaigns`, `renewal_risk_history`, `renewals`, `tags`.

**Core CRM / revenue (re-parent, do not lose):** `policies` (CASCADE, nullable), `tasks` (NO ACTION, nullable), `communications`/`communication_history`, `documents`/`document_analysis`/`document_analyses`/`document_extractions`/`document_processing_queue`, `canopy_pulls`/`canopy_monitorings` (SET NULL), `leads.account_id` (CASCADE) + `leads.converted_account_id` (NO ACTION), `service_tickets`, `premium_payments`, `commission_reports`/`commission_structures`, `acord_forms`, `submission_packages`, `intake_submissions`, `offline_queue`, `import_jobs`, all `lead_*_insurance` (SET NULL), all `portal_*`, all `marketing_*`.

**SET NULL (18):** these would null-out on hard delete (losing the link) — re-parenting preserves the association instead: `ai_module_executions`, `canopy_monitorings`, `canopy_pulls`, `lead_auto/commercial/home/life/renters/umbrella_insurance`, `marketing_automation_enrollments`, `marketing_review_requests`, `marketing_send_queue.to_account_id`, `marketing_survey_sends`, `nps_responses`, `review_requests`, `reviews`, `service_tickets`, `team_conversations`.

> The authoritative, always-current list is the `information_schema` query embedded in §2.3 — the build agent must use that, not this prose snapshot.

---

## 4. Ordered merge plan (DUP- items)

> Tiering note: counts below are the **post-stamp** live numbers (26/56/18) with the audit's spot-checked subset called out. DUP-1/2 are scaffolding/setup; DUP-3 is the proven dependency; DUP-4..9 are the actual merges in execution order (highest confidence/lowest risk first).

### DUP-1 — Establish merge tooling: dry-run procedure, branch workflow, rule taxonomy
- **Problem:** No merge has ever run (`merge_history`=0, `duplicate_flags`=0); `duplicate_groups` has 362 candidates but `rule_id` is NULL on all — there is no executable merge path or decision taxonomy.
- **Change:** (a) Author a parameterized merge function/procedure implementing §2 exactly (`merge_accounts(survivor_id, loser_ids[], dup_rule_id, merged_by, apply boolean)`), defaulting `apply=false` (dry-run → row-count report → rollback). (b) Define a `rule_id` taxonomy for `duplicate_groups`/`merge_history` (e.g. `T1_SHARED_ADDR`, `T1_SHARED_PHONE`, `T2_EMAIL_OR_ZIP`, `T3_CONFLICT_ADDR`, `IDENT_POLICY`, `SORENSEN_RANCHERA`). (c) Wrap in branch-first harness (`create_branch` → run → verify → `merge_branch`). No data writes in this item beyond the (optional) rule-taxonomy seed rows.
- **Type:** additive-safe (schema/function only)
- **Depends on:** MODEL- (workspace-stamp) — so tooling is tested against the full book.
- **Blocks:** DUP-4, DUP-5, DUP-6, DUP-7, DUP-8, DUP-9
- **Reversibility & safety:** function defaults to dry-run; branch-first; nothing destructive. The function *is* the reversibility mechanism (writes `merge_data` undo manifest).
- **Acceptance / verification:** dry-run on one known T1 cluster (e.g. Donald Harris) returns a survivor + per-table re-parent counts + field-union map and writes 0 rows (read-only check: `SELECT COUNT(*) FROM merge_history` unchanged).
- **Priority:** P0 ; domain-rank: 1

### DUP-2 — Re-run detection on the full (post-stamp) book; regenerate cluster list
- **Problem:** Tier sizing was done on 1,610; the true book is 1,804. Live re-run gives **T1=26 / T2=56 / T3=18 / 92 clusters / 195 accounts** — the merge list must be regenerated from the full book, with the suffix-normalized address key (to catch "Pl"/"Place" variants the exact key misses).
- **Change:** Run the §-appendix tiering SQL (from `A-duplicates.md`) **without** the workspace filter, using the suffix-normalized address variant. Materialize results into `duplicate_groups` (or a staging table) with a populated `rule_id`, `match_score`, and the cluster's account ids in `entity_ids[]`. Mark the 22 `duplicate_groups` pairs that reference deleted/out-of-book accounts as `status='out_of_scope'`. Read-only generation + scaffold writes only; no merges.
- **Type:** data-backfill (populates candidate scaffolding; no account changes)
- **Depends on:** MODEL- (workspace-stamp); DUP-1 (taxonomy)
- **Blocks:** DUP-4, DUP-5, DUP-6, DUP-7, DUP-8, DUP-9
- **Reversibility & safety:** writes only to `duplicate_groups` (candidate table); fully truncatable/re-runnable; branch-first.
- **Acceptance / verification:** `SELECT status, COUNT(*) FROM duplicate_groups GROUP BY 1` shows the regenerated set; tier totals match 26/56/18 (±documented spot-check deltas). Spot-check that the 5 newly-surfaced T1 clusters (present at 1,804 but not 1,610) are real same-person dups before they enter the auto-merge set.
- **Priority:** P0 ; domain-rank: 2

### DUP-3 — Gate: confirm workspace-stamp completed (hard dependency checkpoint)
- **Problem:** If dedup runs before the 194 NULL-workspace accounts are stamped, ~12 clusters/19 accounts (the 92-vs-83 delta, incl. most of SORENSEN) are invisible and will be missed or mis-merged.
- **Change:** Assertion step, not a data change: verify `SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND agency_workspace_id IS NULL` = 0 before any merge. If > 0, halt and return to MODEL-.
- **Type:** additive-safe (guard/assertion)
- **Depends on:** MODEL- workspace-stamp
- **Blocks:** DUP-4..DUP-9
- **Reversibility & safety:** read-only guard; no writes.
- **Acceptance / verification:** the COUNT above returns 0.
- **Priority:** P0 ; domain-rank: 3

### DUP-4 — Auto-merge T1 shared-ADDRESS clusters (highest confidence)
- **Problem:** Same `nkey` + an identical populated `address_line1` (or suffix-normalized address) and no conflicting phone/address = the same person duplicated. Audit's spot-checked list (§4 of `A-duplicates.md`): ~17 of 21 are shared-address with no Jr/household/swap flag. Post-stamp this set is the shared-address subset of the 26 T1 clusters.
- **Change:** For each qualifying cluster, call `merge_accounts(survivor, losers, 'T1_SHARED_ADDR', :op, apply=>true)` per §2. Named auto-eligible (verify each still qualifies after re-detection): Donald Harris (1108 sw bluff dr), Terry Wilber (442 sw morning glory dr), Thomas Allen, Aundra Weston, Carey Handley, Helen Lee, Howard Smith, Jennafer Hochmuth, John Hughes, Nelson Lucier, Nick Reid, Ross Meyers, Wade Heitzman, Ziad Darwiche, plus formatting-variant-but-same-place: Charles Amick, Molly Frazier, Teresa Dellinger, Michael Millikin, Melinda Shrum (suffix-normalized address match). **Michael Barrs** (same addr, two phones) → field-union both phones, auto-merge OK.
- **Type:** destructive-merge (soft-delete losers; re-parent children)
- **Depends on:** DUP-1, DUP-2, DUP-3
- **Blocks:** HH- (household linking), BIZ- for any of these that are also commercial
- **Reversibility & safety:** dry-run first (operator reviews per-table counts); branch-first; full `merge_history` undo manifest; losers soft-deleted only.
- **Acceptance / verification:** post-merge, for each survivor: `SELECT COUNT(*) FROM accounts WHERE id=ANY(losers) AND deleted_at IS NULL` = 0; sum of active policies on survivor ≥ pre-merge max of any single member; `SELECT COUNT(*) FROM merge_history WHERE rule_id-equiv='T1_SHARED_ADDR'` = number of clusters merged; zero orphaned children (`SELECT COUNT(*)` on each FK table WHERE col = ANY(losers) = 0).
- **Priority:** P0 ; domain-rank: 4 — **human spot-check of the dry-run report required before apply** (this is the audit's "~17 auto after spot-check").

### DUP-5 — Merge SORENSEN Ranchera/Rachera dup core (3 → 1)
- **Problem:** `SORENSEN AND SMITH LLC` has 9 active rows; **3 of them are one address** — `181 Ranchera St NW` (`1e27db5f`, `919d0064`) + `181 Rachera St NW` (`3e1fc424`, a typo of Ranchera). 5 active policies across the three. The other 5 rows (117/125/300/308 Mesa, 2312 Vista) are **distinct buildings — DO NOT merge** (commercial multi-property; goes to BIZ-/Plan C).
- **Change:** `merge_accounts(survivor, ['the other two Ranchera/Rachera ids'], 'SORENSEN_RANCHERA', :op, apply=>true)`. Survivor by cascade: all three have policies; pick most-complete contact then most-recent `updated_at` (likely `919d0064`, updated 2026-06-19, email `smith.g.milton@gmail.com`). Field-union the `jessicamurphy@circleoflifecommunities.com` / `+13866889318` (property-manager contact on `3e1fc424`) into survivor only if survivor's own contact is null — note: that PM phone is on the global DO-NOT-MATCH list, so it must NOT be used to pull in any *other* account, but within this confirmed cluster it can be retained as a secondary contact in the snapshot.
- **Type:** destructive-merge
- **Depends on:** DUP-1, DUP-2, DUP-3
- **Blocks:** BIZ- (reclassify surviving Ranchera row + 5 Mesa/Vista rows as commercial)
- **Reversibility & safety:** dry-run first; the 5 Mesa/Vista ids are **explicitly excluded** from `loser_ids` — verify they are absent from the merge call; `merge_history` manifest; branch-first.
- **Acceptance / verification:** after merge, `SELECT COUNT(*) FROM accounts WHERE deleted_at IS NULL AND nkey LIKE '%sorensen%smith%'` = **6** (1 merged Ranchera survivor + 5 distinct properties); survivor holds the union of the 3 Ranchera policies (de-duped within survivor); the 5 Mesa/Vista rows untouched (`updated_at` unchanged).
- **Priority:** P0 ; domain-rank: 5 — **human review required** (commercial entity; confirm the 3-vs-5 split before apply).

### DUP-6 — Merge confirmed identical-policy dups
- **Problem:** Two same-name accounts each carrying a policy with identical carrier+line+effective_date is a near-certain dup. Live: **Tracy Cruce** (American Integrity PP eff 2025-12-30, also same address 19816 nw county road 235) is a true dup. **Gary Howard** (Progressive auto, NULL effective date) is weaker. The SORENSEN DF3 "pairs" are separate buildings (handled in DUP-5, excluded here).
- **Change:** Merge Tracy Cruce (`04591c31`, `d118ef48`) via `merge_accounts(..., 'IDENT_POLICY', apply=>true)`; the within-survivor policy de-dupe (§2.3) collapses the duplicated PP policy. Queue **Gary Howard** for human review (null effective date weakens; addresses differ by 14 house-numbers on the same street — possible move vs two properties).
- **Type:** destructive-merge
- **Depends on:** DUP-1, DUP-2, DUP-3
- **Blocks:** HH-
- **Reversibility & safety:** dry-run; the redundant policy is **soft-deleted** (not hard-deleted) and its id recorded in `merge_data.policies_dedup`; branch-first.
- **Acceptance / verification:** post-merge Tracy Cruce survivor has exactly one active American Integrity PP policy (eff 2025-12-30); loser soft-deleted; `merge_history` row present. Gary Howard: present in review queue (`duplicate_flags.reason='queued_review:ident_policy'`), **not** merged.
- **Priority:** P0 ; domain-rank: 6 (Tracy Cruce auto-after-spotcheck; Gary Howard review)

### DUP-7 — T1 shared-PHONE-only clusters → human review (do NOT auto-merge)
- **Problem:** Same `nkey` + shared phone but **different address** is weaker — a shared landline/cell can mean family members. Named: **Heng Zhang** (3 addresses, shared phone — possible family), **James Lawrence** (4044 ford st vs 9907 132nd st, shared phone).
- **Change:** Do not auto-merge. Seed `duplicate_flags` with `reason='queued_review:T1_SHARED_PHONE'` for each member; surface in the review workbook with both addresses + policy lists. Merge only those an operator confirms, then run `merge_accounts(..., 'T1_SHARED_PHONE', apply=>true)` per confirmed cluster.
- **Type:** data-backfill (flags) → destructive-merge (per-approval)
- **Depends on:** DUP-1, DUP-2, DUP-3
- **Blocks:** HH-
- **Reversibility & safety:** nothing merges without per-cluster human approval; dry-run + `merge_history` for any approved merge.
- **Acceptance / verification:** Heng Zhang & James Lawrence appear in review queue; `merge_history` contains only operator-approved phone-only merges.
- **Priority:** P1 ; domain-rank: 7 (review-gated)

### DUP-8 — T2 strong-dup clusters (56) → review workbook, then merge approved
- **Problem:** Same `nkey` + same email OR same single ZIP, with one populated + one complementary/empty contact row, no conflicting addr/phone. **56 clusters** (post-stamp). High confidence but not auto — many are "one rich row + one stub" where field-union matters.
- **Change:** Export all 56 to the review workbook (name, both rows' contact, policy counts, proposed survivor + proposed field-union preview from the dry-run). Operator approves in batches; run `merge_accounts(..., 'T2_EMAIL_OR_ZIP', apply=>true)` per approved cluster. Seed `duplicate_flags` `reason='queued_review:T2'` for the rest.
- **Type:** data-backfill (flags + workbook) → destructive-merge (per-approval)
- **Depends on:** DUP-1, DUP-2, DUP-3
- **Blocks:** HH-
- **Reversibility & safety:** review-gated; dry-run preview shows exact field-union and re-parent counts before apply; `merge_history` undo manifest; branch-first batch.
- **Acceptance / verification:** every merged T2 cluster has a `merge_history` row and zero surviving losers; unmerged T2 clusters carry a `queued_review:T2` flag; running tally `merged + queued = 56`.
- **Priority:** P1 ; domain-rank: 8 (all human-reviewed)

### DUP-9 — T3 conflicting-address clusters (18) → review (move vs two-properties vs hidden-dup)
- **Problem:** Same `nkey` but **conflicting addresses** — could be a hidden dup masked by formatting (merge), a person who moved (merge, keep newest address), or genuinely two properties / two people (keep separate). **18 clusters** post-stamp. Includes Cindi Brennan (3 addresses), Paul Bryan, Derek Aultman, Kevin Fletcher (each 2 distinct addresses/ZIPs), Gary Howard (from DUP-6).
- **Change:** All 18 to review workbook with both addresses, ZIPs, policy lists, and a suffix-normalized-address flag (if normalized addresses match → recommend merge; if truly distinct → recommend keep-separate or route to HH- if different people). Operator decides each; merge approved via `merge_accounts(..., 'T3_CONFLICT_ADDR', apply=>true)`.
- **Type:** data-backfill (flags) → destructive-merge (per-approval)
- **Depends on:** DUP-1, DUP-2, DUP-3
- **Blocks:** HH-
- **Reversibility & safety:** review-gated; default action is **keep-separate** (conservative) unless operator confirms merge; `merge_history` for any merge.
- **Acceptance / verification:** all 18 resolved (merged or flagged keep-separate); no T3 cluster auto-merged; decisions logged in `duplicate_flags`.
- **Priority:** P1 ; domain-rank: 9 (all human-reviewed)

---

## 5. Explicit DO-NOT-MERGE exclusions (enforce in detection + merge guards)

The merge function must **refuse** (or route to review, never auto-apply) any cluster matching these. Encode as pre-merge assertions:

1. **Jr/Sr (and II/III) at same address** — `Dewey Moore` / `Dewey Moore Jr`, `John Holloway` / `John Holloway Jr`. `nkey` collapses the suffix; these are two real people. **Guard:** if raw `name` of any pair differs only by a trailing `jr|sr|ii|iii|iv` token → exclude from auto, flag review.
2. **Name-order / first-last swaps** — `Thomas Howard` / `Howard Thomas`, `William Thomas` / `Thomas Williams`. Could be a data-entry swap (dup) or two people. **Guard:** if token-sorted names are equal but raw order differs → review only.
3. **Person ↔ their own business entity** sharing a phone/email — `Max Bass` / `BoxDrop Live Oak`, `Horace Witt` / `D And H Tractor Works LLC`. Personal lines vs commercial = keep separate, **relate** (BIZ-), never merge.
4. **Shared-phone-only** (different surname OR different address) — never a merge signal alone (see DUP-7).
5. **Commercial multi-property** — same name, multiple distinct addresses = expected (the 5 SORENSEN Mesa/Vista rows; any LLC with N building addresses). Keep separate.
6. **Household false-positives** (different given AND surname, same roof) — `Carlene Rhodes`+`Ronald Myers`, `Ronald Rhodes`+`Ronald Myers`, `Deserrai Davis`+`Myranda Montemurno`, `Mary Williams`+`James Dorman`, `Tony Anderson`+`Teresa Mack`. These are Plan B (link, don't merge).
7. **Internal / shared-contact accounts** — `1313 W US HWY 90`, phone `3863628300`, names ILIKE `%lewis insurance%` / `%daysheet%` / `brian%lewis%`; property-manager `jessicamurphy@circleoflifecommunities.com` / phone `13866889318`. Excluded from all matching; never a survivor or a match key.

---

## 6. Steps requiring human review (summary)

| Item | Auto vs review | Human action |
|---|---|---|
| DUP-4 (T1 shared-addr, ~17-19) | **Auto after dry-run spot-check** | Review the dry-run row-count report once, approve batch |
| DUP-5 (SORENSEN Ranchera 3→1) | **Review** | Confirm 3-vs-5 split before apply |
| DUP-6 Tracy Cruce | Auto after spot-check | Confirm identical-policy collapse |
| DUP-6 Gary Howard | **Review** | Decide move vs two-properties (null eff date) |
| DUP-7 (phone-only: Heng Zhang, James Lawrence) | **Review each** | Confirm family vs same-person |
| DUP-8 (T2, 56) | **Review each/batch** | Approve field-union previews |
| DUP-9 (T3, 18) | **Review each** | Decide merge / keep-separate / household |

Net: ~**19 clusters auto-merge after a single dry-run spot-check**; ~**77+ clusters are individually human-reviewed** (4 T1-review-ish + 56 T2 + 18 T3 minus overlaps). Nothing applies to prod without branch-test + operator sign-off.

---

## 7. Cross-domain dependency map (for the master sequencer)

```
MODEL- (workspace-stamp 194 NULL accts)   ─┐ MUST precede
                                            ├─► DUP-2 (re-detect on 1,804) ─► DUP-3 (gate)
DUP-1 (merge tooling/taxonomy) ────────────┘                                   │
                                                                               ▼
                                          DUP-4 ▸ DUP-5 ▸ DUP-6 ▸ DUP-7 ▸ DUP-8 ▸ DUP-9
                                                                               │ (survivors finalized)
                                                                               ▼
                                          HH- (household linking on survivors) ▸ BIZ- (SORENSEN + others reclassify)
```
- **DUP-* → HH-:** households must link *survivor* account rows, after merges retire losers.
- **DUP-5 → BIZ-:** the surviving Ranchera row + 5 Mesa/Vista rows feed Plan C commercial reclassification.
- **HYG- (phone E.164)** independent; if run first, improves match recall (optional pre-step).
```
