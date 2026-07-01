# GOAL — Merge: wire the review queue to the hardened engine + close the gaps

The hardened merge engine `merge_accounts` already exists in prod and is good. This run (1) routes the `/duplicates` review queue to it instead of the thin legacy path, (2) closes the guards `merge_accounts` does not yet enforce, and (3) lands the two valid Codex security/frontend fixes. This is a wiring + guard job, not a rebuild. Spec: `Merge-and-Survivorship-Policy.md`. Work autonomously; do not stop until every criterion is met. Do not ask permission on routine decisions inside the locked stack.

---

## Paths

- Project root: the Lewis Insurance CRM repo (branch `claude/objective-lederberg-28eb4b`).
- Supabase project: `lrqajzwcmdwahnjyidgv`.
- Policy (spec): `Merge-and-Survivorship-Policy.md`.

---

## Context — verified prod state (do not re-derive)

- `merge_accounts(p_survivor uuid, p_losers uuid[], p_rule text, p_merged_by uuid, p_apply boolean)` — hardened: FK-driven reparent of every table referencing `accounts`, `survivor_before`/`losers_before`/`field_union`/`policies_dedup`/reparent manifest into `merge_history.merge_data`, collision handling with a `safe_delete` allowlist, advisory lock, idempotency, `p_apply=false` dry-run. Performed the 78 historical merges.
- `relgraph_merge_duplicate_group(p_group_id, p_survivor_id)` — what the new `/duplicates` UI calls. **BUG: it calls the thin `merge_duplicate_records` (reparents only contacts, policies, call_sessions, sms_messages; empty snapshot).** This is the wire to fix.
- `is_staff()` exists (profiles.role in staff/admin + active workspace membership). `accounts` RLS is workspace/staff scoped. All seven new RPCs are `SECURITY DEFINER` granted to `authenticated` with **no `is_staff()` check** → a client-portal (`authenticated`, non-staff) user can call them and bypass RLS.
- 176 duplicate_groups pending; 16 are personal↔commercial. No `unmerge` function exists.

---

## First action

Read `Merge-and-Survivorship-Policy.md`, then `pg_get_functiondef` for `merge_accounts`, `relgraph_merge_duplicate_group`, `merge_duplicate_records`, and `search_accounts`. Confirm the wire bug and the missing staff checks before changing anything.

---

## Completion criteria — the goal is met when ALL pass

1. **Review queue routes to `merge_accounts`.** `relgraph_merge_duplicate_group` is rewritten to call `merge_accounts(p_survivor_id, losers, 'duplicate_review', auth.uid(), true)`. The legacy `merge_duplicate_records` is retired (dropped, or repointed to `merge_accounts` so nothing can use the thin path). Proof: seed a scratch loser with rows in ≥12 child tables, merge **through the review path** (`relgraph_merge_duplicate_group`), then an orphan-sweep returns **0 rows referencing any loser** across all `account_id`/`contact_id` tables, and `merge_history.merge_data` for it contains the full manifest (`survivor_before`, `losers_before`, `reparented`).
2. **`same_as` provenance edge is written AFTER the merge, not before.** Writing it before lets `merge_accounts` reparent `to_account=loser` to the survivor, creating a self-loop that violates the `from_account <> to_account` CHECK and aborts the merge. Edges are inserted post-merge with `ON CONFLICT DO NOTHING`. A test merge completes without a check-constraint error and the `same_as` edges exist.
3. **All seven new SECURITY DEFINER RPCs are staff-gated** (Codex #2): `search_accounts`, `get_account_relationships`, `get_account_link_suggestions`, `list_duplicate_groups_for_review`, `generate_relationship_suggestions`, `confirm_relationship_suggestion`, `relgraph_merge_duplicate_group`. Each rejects (or returns zero rows for) a non-staff caller via `public.is_staff()`; destructive ones (`relgraph_merge_duplicate_group`, `confirm_relationship_suggestion`) RAISE. Proof: called as a non-staff `authenticated` role, each is denied/empty; as staff, each works. Merge is restricted to staff (consider `is_admin()` for merge).
4. **`useAccountSearch.clear` is memoized** (Codex #3): `const clear = useCallback(() => setResults([]), [])`. The Relationships tab no longer re-renders/loops when `LinkAccountDrawer` is mounted closed.
5. **Pre-merge guards added** (policy §B, the part `merge_accounts` lacks): block a merge when the group mixes individual + business, or when `ssn_last4`/`tin_last4`/`fein`/`date_of_birth` conflict, or on Jr/Sr suffix mismatch. The 16 personal↔commercial pending groups are reclassified out of the merge queue to link candidates. Proof: an attempt to merge a cross-type group RAISES; the 16 are no longer mergeable.
6. **Consent strictest-wins resolution** (policy §C.6): after a merge, the survivor's consent/DNC state is the most restrictive of all parties across `consents`, `twilio_consents`, `consent_ledger`, `insured_phones.do_not_call` — not merely both rows reparented. Proof: loser DNC/opted-out + survivor opted-in → survivor ends DNC/opted-out.
7. **Non-FK `account_id` coverage verified.** Confirm every `account_id` column has a FK to `accounts` (so `merge_accounts`' FK loop reaches it); add missing FKs or extend the engine to cover them. Proof: the orphan-sweep in criterion 1 is run against the full 126-table column list, not just FK-backed tables, and returns 0.
8. **`unmerge_account(merge_history_id)` exists** and restores the loser, moves children back per the manifest, and clears the tombstone. Proof: merge then un-merge; child counts and `merged_into_id`/`deleted_at` restored.
9. `npm run typecheck`, `npm run lint`, `npm run build` all exit 0; migrations additive/reversible; `types.ts` regenerated; committed in scoped commits with `[TASK N COMPLETE]`; PR opened.
10. Final `[GOAL COMPLETE]` marker.

If any criterion fails, the goal is not met. Continue working.

---

## Binding rules — never violate

- Route all account-group merges through `merge_accounts`. Never reintroduce a partial-reparent path.
- Never hard-delete a merged account (tombstone only). No policy is ever hard-deleted.
- Every `SECURITY DEFINER` RPC over customer data checks `is_staff()`; none is granted to `anon`/`public`.
- Provenance edges written after the merge, never before.
- Guards (cross-type, strong-ID, suffix) block at propose AND at merge; auto-merge only policy Tier 0.
- No `any` types; PII masked in any merge-diff UI; Calm Command (`cc-*`); WCAG AA; `prefers-reduced-motion`.

---

## Autonomy

Decide on your own: SQL/migration design, how to retire `merge_duplicate_records`, the guard implementation, test harness, commit/PR mechanics.

Pause and surface only for: anything that would hard-delete records, grant `anon`/`public`, auto-merge above Tier 0, or weaken a consent/DNC value. Do not pause for routine SQL, RLS/guard authoring, or running tests.

---

## Commit cadence & reporting

Commit per task: `RelGraph merge: {task} — {one line}`; verify typecheck+build before each. After each task output `[TASK N COMPLETE]` with the test evidence (orphan-sweep count, non-staff denial, consent result). Blocked → `[BLOCKED — task N]` with blocker/tried/need. Order: (1) rewire + retire thin path; (2) staff-gate RPCs; (3) clear() useCallback; (4) guards + reclassify 16; (5) consent strictest-wins; (6) non-FK coverage; (7) unmerge; then commit + PR.

---

## Quality bar

A producer merges from the review queue and nothing is lost, the survivor inherits the strictest consent, a cross-type pair can never be merged, and undo is one click. Test the loss and abuse cases — non-staff caller, cross-type group, consent downgrade, a child table with no FK — not just the happy path. If the rewire passes the happy path but any loss/abuse case slips through, it is not done.

---

## Final completion gate

1. typecheck, lint, build exit 0.
2. Orphan-sweep after a merge **through `relgraph_merge_duplicate_group`** = 0 loser refs across all 126 `account_id` + 23 `contact_id` columns (output in transcript).
3. `unmerge_account` restores that merge end-to-end.
4. Non-staff caller denied on all seven RPCs (shown); cross-type merge blocked; consent strictest-wins shown.
5. `merge_duplicate_records` no longer reachable from the app.
6. `git status` clean; PR URL shown; PR body links `Merge-and-Survivorship-Policy.md` and lists the Codex items resolved.

When all gates pass, output:

```
[GOAL COMPLETE]

Review queue routed to merge_accounts; thin path retired; 7 RPCs staff-gated; clear() memoized; cross-type/strong-ID guards + consent strictest-wins + unmerge landed.
Orphan-sweep 0; non-staff denied; PR: {url}
```

Then stop.
