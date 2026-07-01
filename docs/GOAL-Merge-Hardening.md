# GOAL — Merge Engine Hardening (get it right before first use)

Rebuild the account merge so it is safe, complete, and reversible, to the rules in `Merge-and-Survivorship-Policy.md`. The currently wired engine (`merge_duplicate_records`, called by `relgraph_merge_duplicate_group`) repoints only 4 of 126 `account_id` tables, strands consent and payment data, and writes an empty (non-reversible) snapshot. It has not run in prod yet (the `/duplicates` UI is on an uncommitted branch) — this run makes it correct before anyone touches the 176-group queue. Work autonomously. Do not stop until every completion criterion is met. Do not ask permission on routine implementation decisions inside the locked stack.

---

## Paths

- Project root (build target): the Lewis Insurance CRM repo (branch `claude/objective-lederberg-28eb4b` or a new branch off it).
- Supabase project (source of truth): `lrqajzwcmdwahnjyidgv`.
- Policy (read first, this is the spec): `Merge-and-Survivorship-Policy.md`.
- Migrations: `supabase/migrations/`.

---

## First action

Read `Merge-and-Survivorship-Policy.md` in full. Then read the live source of `merge_duplicate_records` and `relgraph_merge_duplicate_group` (`SELECT pg_get_functiondef(...)`) and run the appendix query to get the current `account_id`/`contact_id` table list (126 / 23). Build to the policy; the function is the implementation of it.

---

## Completion criteria — the goal is met when ALL pass

1. **Safety gate first.** The merge action in the `/duplicates` UI is feature-flagged OFF (guarded) and stays off until criteria 2-9 pass. Commit shows the guard. No merge can run through the thin path in the meantime.
2. **Complete re-parenting, data-driven.** `merge_duplicate_records` v2 repoints every table with an `account_id` column (126) and every `contact_id` table (23), enumerated from the catalog at run time — not a hardcoded list. Proof in transcript: seed a scratch loser account with rows in at least 12 representative child tables (`policies`, `premium_payments`, `invoices`, `commission_reports`, `documents`, `notes`, `tasks`, `opportunities`, `insured_emails`, `insured_phones`, `consents`, `account_relationships`), run the merge, then a sweep query returns **0 rows still referencing any loser id** across all account_id/contact_id tables.
3. **Reversible.** `merge_history.merge_data` for the test merge contains non-empty `survivor_before`, `losers_before`, and a per-table reparent map. A new `unmerge_account(merge_id)` (or equivalent) restores the loser, moves its children back, and clears the tombstone; transcript shows child counts restored and `merged_into_id`/`deleted_at` cleared.
4. **Consent strictest-wins.** Test: loser is `do_not_call`/opted-out, survivor opted-in → after merge the survivor is DNC/opted-out across `consents`, `twilio_consents`, `consent_ledger`, `insured_phones.do_not_call`. A merge never grants a permission neither side had.
5. **Contact-point union.** Loser `insured_emails`/`insured_phones`/`insured_addresses` end up on the survivor, deduped on normalized value, with exactly one primary each.
6. **Policy de-dup.** When loser and survivor hold the same policy (number+carrier+line+eff date), one is kept and the other tombstoned — no twin policies under the survivor.
7. **Guards enforced.** The propose/merge layer blocks: cross-type (individual↔business), conflicting `ssn_last4`/`tin_last4`/`fein`/`date_of_birth`, and Jr/Sr suffix mismatch. A test attempt to merge a personal+commercial group is rejected with a clear error. The 16 personal↔commercial pending groups are reclassified out of the merge queue to link-candidates.
8. **Auto-merge scoped.** Only Tier 0 (identity match, no hard-block) is auto-eligible; everything else requires human confirm. Suggestions never auto-commit.
9. **Import crosswalk.** The import path resolves `external_ref`/`merged_into_id` to the ultimate survivor so a merged duplicate is not re-created; a test re-importing a merged loser's external_ref resolves to the survivor (or a documented `resolve_account(external_ref)` with a passing test).
10. **Everything atomic + secured.** The merge runs in one transaction (any failure rolls back the whole thing); no hard-deletes; new/changed SECURITY DEFINER funcs revoked from `anon`/`public`; merge + un-merge restricted to a senior role via RLS/role check; `types.ts` regenerated.
11. `npm run typecheck`, `npm run lint`, `npm run build` all exit 0; migrations additive/reversible; committed in scoped commits with `[TASK N COMPLETE]` markers; PR opened.
12. Final `[GOAL COMPLETE]` marker output.

If any criterion fails, the goal is not met. Continue working.

---

## Binding rules — never violate

- **Never hard-delete a merged account.** Tombstone only (`merged_into_id` + `deleted_at`). ~30 child tables are `ON DELETE CASCADE`; a hard delete wipes policies, contact points, relationships, aliases.
- **Re-parent list is generated from the catalog, never hardcoded** — so new tables are always covered.
- **One transaction, all-or-nothing.** A partial merge is a corrupt merge.
- **Snapshot before mutate** — no snapshot, no merge.
- **Consent and DNC merge strictest-wins**, always.
- Auto-merge only at policy Tier 0 with no hard-block; all else human-confirmed.
- Build on `accounts.id`; do not add a parallel identity model; reuse `merge_history`, `account_relationships` (`same_as`), `account_aliases`.
- No `any` types; PII masked in any merge diff UI; Calm Command (`cc-*`) for any UI; WCAG AA; `prefers-reduced-motion`.

---

## Autonomy

Decide on your own: SQL/migration design, the catalog-driven reparent implementation, the test harness, function names, commit/PR mechanics, where the feature flag lives.

Pause and surface only for: anything that would hard-delete records, grant `anon`/`public` access, auto-merge above policy Tier 0, or change consent semantics in a way that could grant a permission. Do not pause for routine SQL, RLS authoring, or running tests.

---

## Commit cadence

Commit per task with `RelGraph merge: {task} — {one line}`. Verify typecheck + build before each commit. Never commit a broken build or a merge that fails the orphan-sweep test.

---

## Progress reporting

After each task, output `[TASK N COMPLETE]` with what shipped and the test evidence (the orphan-sweep count, the consent test result, etc.). If blocked, output `[BLOCKED — task N]` with blocker, what you tried, and what you need.

Suggested order: (0) feature-flag guard; (1) catalog-driven reparent + snapshot; (2) un-merge; (3) consent strictest-wins + contact-point union + policy dedup; (4) guards + tier scoping + reclassify the 16; (5) import crosswalk; then commit + PR.

---

## Quality bar

A producer must be able to merge two records and trust that nothing was lost and that undo is one click. If after the rebuild a merge can still strand a payment, a document, or a consent — or can't be reversed — it is not done, regardless of green tests on the happy path. Test the loss cases, not just the success case. If the catalog sweep ever needs a manual exception, stop and surface it rather than hardcoding around it.

---

## Final completion gate

1. `npm run typecheck`, `npm run lint`, `npm run build` — all exit 0.
2. Orphan-sweep test: after a seeded multi-table merge, 0 rows reference any loser across all 126 account_id + 23 contact_id tables (query output in transcript).
3. Un-merge restores the loser end-to-end (counts + tombstone cleared shown).
4. Consent strictest-wins, contact-point union, and policy-dedup tests each pass (shown).
5. Cross-type and conflicting-strong-ID merges blocked (shown); 16 personal↔commercial groups reclassified.
6. `git status` clean; PR URL shown; PR body summarizes the engine change and links `Merge-and-Survivorship-Policy.md`.

When all gates pass, output:

```
[GOAL COMPLETE]

Merge engine hardened to Merge-and-Survivorship-Policy.md.
Catalog-driven reparent (126+23 tables), reversible snapshots, consent strictest-wins, cross-type/strong-ID guards, import crosswalk. /duplicates merge re-enabled behind senior-role gate.
PR: {url}
```

Then stop.
