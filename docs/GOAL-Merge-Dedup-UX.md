# GOAL — Duplicate review + one merge path (work the queue safely)

Make the hardened merge engine usable by a human: a blast-radius preview before any merge, a survivor picker, one-click un-merge, and a single merge path so the broken `/merge-customers` screen is fixed by routing it through the same engine — never a second one. The 160 pending duplicate groups become safe to clear. Work autonomously; do not stop until every criterion is met. Do not ask permission on routine decisions inside the locked stack.

---

## Paths

- Project root: the Lewis Insurance CRM repo (branch off `main` after PR #6 merges; if not yet merged, branch off `claude/objective-lederberg-28eb4b`).
- Supabase project: `lrqajzwcmdwahnjyidgv`.
- Specs: `Merge-and-Survivorship-Policy.md` (rules), `Lewis-CRM-Relationship-Graph-Plan.md` (UX standard).
- Design system: Calm Command (`cc-*`). Reference: `visual-forge-handoff-lewis-insurance-os/design-system/`.

---

## Context — what already exists in prod (verified; reuse, do not rebuild)

- `merge_accounts(p_survivor, p_losers[], p_rule, p_merged_by, p_apply)` — hardened engine. **`p_apply=false` is a dry run**: returns `reparent_counts`, `reparent_total`, `policies_dedup_count`, `field_union`, `computed_survivor`, `survivor_matches_cascade`, and mutates nothing. Granted to `service_role`/`postgres` only.
- `assert_mergeable(p_survivor, p_losers[])` — RAISES on cross-type, conflicting tin_last4/DOB/FEIN, Jr/Sr suffix.
- `relgraph_merge_duplicate_group(p_group_id, p_survivor_id)` — staff-gated; runs assert_mergeable → cleans intra-cluster edges → `merge_accounts(apply=true)` → writes `same_as` edges → `apply_consent_strictest_wins`. This is the group-merge path.
- `apply_consent_strictest_wins`, `unmerge_account(p_merge_history_id)` (staff-gated, single-loser), `list_duplicate_groups_for_review(p_limit, p_offset)`, `compute_account_survivor(uuid[])`, `merge_history`, `duplicate_groups`.
- **Broken:** `useCustomerMerge` calls `merge_customers_transactional_v1`, which does not exist in prod → `/merge-customers` is broken.

---

## First action

Read `Merge-and-Survivorship-Policy.md`. Then read `relgraph_merge_duplicate_group`, `merge_accounts`, `assert_mergeable`, and `unmerge_account` via `pg_get_functiondef`, and the `/duplicates` page + `useRelationshipGraph.ts` + `useCustomerMerge`. Build on these; do not author a second merge engine.

---

## Completion criteria — the goal is met when ALL pass

1. **Soft preview RPC.** New `preview_merge(p_survivor uuid, p_losers uuid[])`, staff-gated, returns `{ mergeable boolean, block_reason text, reparent_counts jsonb, reparent_total int, policies_dedup_count int, computed_survivor uuid, field_diff jsonb }`. It determines `mergeable` by calling `assert_mergeable` inside a `BEGIN/EXCEPTION WHEN others` block and capturing `SQLERRM` as `block_reason` (do NOT duplicate the guard logic), then calls `merge_accounts(..., p_apply => false)` for counts. Proof: calling it leaves all row counts unchanged (shown in transcript).
2. **One shared merge path.** Extract the body of `relgraph_merge_duplicate_group` into a shared internal (e.g. `_do_account_merge(p_survivor, p_losers, p_rule)`) that runs assert_mergeable → edge cleanup → `merge_accounts(apply=true)` → `same_as` edges → `apply_consent_strictest_wins`. Both the group path and a new staff-gated `merge_accounts_manual(p_survivor, p_losers[])` call it. No merge logic is duplicated.
3. **`/merge-customers` fixed via the hardened path.** `useCustomerMerge` no longer references `merge_customers_transactional_v1` (grep of `src/` returns 0 hits). It calls `merge_accounts_manual` (or is retired in favor of a "Merge with…" action on the customer record + the `/duplicates` queue — your call, but the manual merge MUST go through the shared path, same guards, same consent, same `same_as`).
4. **`/duplicates` review flow.** A reviewer can, per group: see the member records and `match_score`; pick the survivor (default to `computed_survivor`, labeled "recommended"); open a **blast-radius preview** (from `preview_merge`) showing what the survivor gains (policies, payments, documents counts), how many duplicate policies will be dropped, and the field diff — PII masked; then **confirm** (naming modal) to merge through the shared path. Proof: a real merge driven through this UI path yields a post-merge orphan-sweep of **0** loser references.
5. **Blocked groups are obvious, not silently mergeable.** When `preview_merge` returns `mergeable=false` (e.g. the 16 cross-type groups), the UI shows the `block_reason` and offers **Link instead** (writes an `account_relationships` edge), with the Merge action disabled. Proof: a cross-type group renders blocked with its reason and a working Link action.
6. **One-click un-merge.** A "Recently merged" view (from `merge_history` where `unmerged_at IS NULL`) with an **Undo** that calls `unmerge_account`; shows what was restored. Proof: merge then undo from the UI; loser restored, tombstone cleared.
7. **Calm Command + access.** Queue = Index/List; preview + survivor pick = Detail Drawer/Side-sheet (420–520px); confirm = naming Modal; "Merge with…" lives on the customer Record Command. Neutral chips, one lime primary, accent spine marks the recommended survivor, designed empty/loading states, PII masked everywhere. All new RPCs `is_staff()`-gated and not granted to `anon`/`public`.
8. `npm run typecheck`, `npm run lint`, `npm run build` exit 0; `types.ts` regenerated; migrations additive/reversible; committed in scoped commits with `[TASK N COMPLETE]`; PR opened.
9. Final `[GOAL COMPLETE]` marker.

If any criterion fails, the goal is not met. Continue working.

---

## Binding rules — never violate

- **One merge path.** Every merge (queue or manual) runs through the shared internal → `merge_accounts` + `assert_mergeable` + `apply_consent_strictest_wins`. Never a second engine; never bypass the guards.
- Dry run (`preview_merge`, `apply=false`) mutates nothing.
- Never hard-delete; tombstone only. Suggestions/previews never auto-commit — a human confirms.
- Auto-merge (if any batch action) only policy Tier 0 with no block.
- All customer-data RPCs `is_staff()`-gated; none granted to `anon`/`public`.
- No `any` types; PII (SSN/DOB/tax IDs) masked in every list, preview, and diff; `prefers-reduced-motion`; WCAG AA.

Forbidden: rainbow buttons, vanity counters, color-only signals, colored relationship/merge chips, em/en dashes in copy, a merge that runs without showing the preview first.

---

## Autonomy

Decide on your own: the `preview_merge`/shared-internal SQL shape, component structure, whether to retire `/merge-customers` vs repoint it (default: one "Merge with…" action on the record + the `/duplicates` queue, both on the shared path), survivor-picker UX, commit/PR mechanics.

Pause and surface only for: anything that would hard-delete, grant `anon`/`public`, auto-merge above Tier 0, or weaken a consent value. Do not pause for routine UI, RLS/guard authoring, or running tests.

---

## Commit cadence & reporting

Commit per task: `Merge UX: {task} — {one line}`; verify typecheck+build before each. After each task output `[TASK N COMPLETE]` with evidence (preview leaves counts unchanged; orphan-sweep 0 via UI path; cross-type blocked; un-merge restored; grep shows 0 `merge_customers_transactional_v1`). Blocked → `[BLOCKED — task N]` with blocker/tried/need. Order: (1) preview_merge + shared internal + manual RPC; (2) fix /merge-customers; (3) /duplicates preview + survivor pick + confirm; (4) blocked-group + Link-instead; (5) un-merge view; then commit + PR.

---

## Quality bar

A reviewer opens a duplicate group, sees exactly what a merge will move and which record will win, merges with one confident click, and can undo it just as easily — and a cross-type pair is visibly blocked, not quietly merged. If the preview is vague, the survivor choice is unclear, or a blocked group looks mergeable, it is not done. Test the blocked and undo paths, not just the happy merge.

---

## Final completion gate

1. typecheck, lint, build exit 0.
2. `preview_merge` shown leaving row counts unchanged (dry run).
3. A merge driven through the `/duplicates` UI → orphan-sweep 0 across `account_id`/`contact_id` tables.
4. A cross-type group renders blocked with reason + working Link-instead.
5. Un-merge from the UI restores the record.
6. `grep -r merge_customers_transactional_v1 src/` returns nothing; manual merge routes through the shared path.
7. `git status` clean; PR URL shown; PR body links `Merge-and-Survivorship-Policy.md`.

When all gates pass, output:

```
[GOAL COMPLETE]

Duplicate review + one merge path shipped: preview_merge dry-run, survivor picker, blocked-group Link-instead, one-click un-merge; /merge-customers routed through merge_accounts; merge_customers_transactional_v1 removed.
Orphan-sweep 0 via UI; PR: {url}
```

Then stop.
