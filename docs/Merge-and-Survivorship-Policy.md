# Lewis Insurance — Merge & Survivorship Policy

**The rulebook for deduplicating and merging client records. This is the source of truth; the engine is built to this, not the other way around.**

Date: 2026-06-28 · Scope: Supabase project `lrqajzwcmdwahnjyidgv`, canonical entity = `accounts` · Companion build spec: `GOAL-Merge-Hardening.md`

---

## Prime directive

A wrong merge is far more costly than a missed duplicate. Merging two different parties fuses their policies, payment history, PII, and texting consent into one file — an E&O and privacy failure you may not notice for months. A missed duplicate is mild clutter. **Therefore: bias to link or flag over merge; require a human for anything below near-certainty; and make every merge fully reversible.** When in doubt, do not merge.

---

## Current state — what the live engine actually does (audited 2026-06-28)

This is why this policy exists. **Correction (post-Codex review):** a hardened engine, `merge_accounts(p_survivor, p_losers[], p_rule, p_merged_by, p_apply)`, ALREADY EXISTS in prod and already satisfies most of this policy — it dynamically walks every FK to `accounts`, snapshots survivor+losers, de-dupes policies, unions fields, handles unique collisions, supports a dry-run (`p_apply=false`) preview, and only ever tombstones. It performed the 78 historical merges. The defect is wiring: the new `/duplicates` review queue calls `relgraph_merge_duplicate_group`, which routes to the OLD thin `merge_duplicate_records` (table below) instead of `merge_accounts`. **The fix is a rewire plus a few residual guards — not a rebuild. Do not work the 176-group queue until the rewire and guards below land.** The table below describes the thin path that is wired today; `merge_accounts` already does the right-hand column.

| Area | What the policy requires | What `merge_duplicate_records` does today | Gap |
|---|---|---|---|
| Re-parent child data | Repoint **every** table that references the loser (126 carry `account_id`, 23 carry `contact_id`) | Repoints **4**: `contacts`, `policies`, `call_sessions`, `sms_messages` | **~120 tables stranded** incl. premium_payments, invoices, documents, commissions, renewals, quotes, insured_emails/phones/addresses |
| Reversibility | Full before-snapshot + reparent map stored every merge | Stores `COALESCE(merged_data,'{}')`; the shipped wrapper passes `'{}'` | **New merges are NOT reversible** |
| Contact points | Union loser's emails/phones/addresses onto survivor | Not repointed (CASCADE children of a soft-deleted row) | **Loser contact points lost** |
| Consent | Strictest-wins across all consent tables | `consents` repointed only in the contacts branch; `twilio_consents`, `consent_ledger`, `do_not_call` untouched | **TCPA exposure** |
| Field survivorship | Deterministic per-field rule + manual override | None — survivor row kept as-is | Loser's better data discarded |
| Policy de-dup | Detect same policy on both sides, keep one | Repoints all policies blindly | **Duplicate policies** under survivor |
| Cross-type guard | Block personal↔commercial merges | No guard | **16 of 176 pending groups are personal↔commercial** |
| Strong-ID guard | Block when SSN/EIN/DOB conflict | No guard | Different people can be merged |

That richer engine is `merge_accounts` (confirmed in prod), not a ghost — the 78 past merges carry its `field_union`, `policies_dedup`, `survivor_before`/`losers_before` manifest. So the work is: (1) route the review queue to `merge_accounts`; (2) add the guards `merge_accounts` does NOT yet enforce — cross-type block, conflicting strong-ID block, consent strictest-wins *resolution* (it reparents consent rows but does not collapse them to the most-restrictive value), and coverage for any `account_id` column lacking a FK (the FK-driven loop only reaches FK-backed columns); (3) build the missing `unmerge_account()` from the captured manifest. See `GOAL-Merge-Hardening.md`.

---

## A. The canonical model

1. **`accounts.id` is the identity.** `insured_profiles`, `contacts`, policies, and everything else derive from it. Merges operate on accounts; the contacts-merge path is secondary.
2. **A merged loser is a tombstone, never a delete.** Set `merged_into_id = survivor` and `deleted_at = now()`. **Never hard-delete a merged account** — ~30 child tables are `ON DELETE CASCADE` (policies, insured_emails/phones/addresses, renewals, account_relationships, account_aliases, commission_structures, client_portal_users…); a hard delete would wipe them. Hard-delete is forbidden in the merge path.
3. **Resolve to the ultimate survivor.** Always follow `merged_into_id` chains so a re-merge or a stale reference lands on the final survivor, never a tombstone.

---

## B. Match → decide (when is it a duplicate at all)

Three verbs, decided before anything moves: **merge** (same legal/tax party), **link** (related but distinct — use `account_relationships`), **leave** (coincidence).

**Hard blocks — never auto- or one-click merge when any is true (route to link or reject):**

- **Cross-type:** one side individual, the other business. (Elite RC the LLC ≠ Lance the person ≠ "Elite RC" the DBA. 16 pending groups trip this today.)
- **Conflicting strong identifier:** different `ssn_last4`, `tin_last4`/`fein`, or `date_of_birth`. Strong IDs are dispositive both ways — same SSN strongly confirms, different SSN strongly denies.
- **Suffix mismatch at one address:** "John Smith Jr" vs "John Smith Sr" = father and son, not a duplicate.
- **Household, not duplicate:** shared address (or shared family phone) with *different names* → household link, never a merge. Address alone is never a merge key.
- **Active distinct policies that imply two real parties** (e.g., each is the named insured on different households' policies).

**Match tiers (the existing `duplicate_detection_rules`, with the strong-ID layer added):**

| Tier | Signal | Disposition |
|---|---|---|
| 0 — Identity | Same SSN/EIN, or same policy number + carrier + line + eff date (`IDENT_POLICY`, 0.97) and names agree, no hard-block | Eligible for auto-merge |
| 1 — Strong | Same name + same address (`T1_SHARED_ADDR`) or same name + same phone (`T1_SHARED_PHONE`) | Human review |
| 2 — Probable | Same name + (email or ZIP) (`T2_EMAIL_OR_ZIP`) | Human review |
| 3 — Weak | Same name + different address (`T3_CONFLICT_ADDR`, 0.60); surname↔business (0.40) | Flag only — never propose merge; offer *link* |

Auto-merge is allowed **only** at Tier 0 with zero hard-blocks. Everything else needs a human. Suggestions never auto-commit.

---

## C. The merge transaction (what must happen, atomically)

Run in one transaction. If any step fails, roll back the whole merge.

1. **Snapshot first.** Capture `survivor_before`, `losers_before` (full account rows), and a per-table reparent plan into `merge_history.merge_data`. No snapshot, no merge. (This is the reversibility contract the shipped path violates.)
2. **Re-parent every child table — data-driven, not hardcoded.** Repoint **all** tables with an `account_id` column (126 today) and all `contact_id` tables (23) from loser → survivor. Generate the list from the catalog at run time so new tables are covered automatically; never ship a hand-picked subset. Highest-stakes, must never be missed: `policies`, `premium_payments`, `invoices`, `commission_reports`, `commission_structures`, `documents`/`document_analysis`, `certificates_of_insurance`, `renewals`/`ao_renewals`, `quotes`, `claims`, `tasks`, `notes`, `opportunities`, `insured_emails`, `insured_phones`, `insured_addresses`, `account_relationships`, `account_aliases`. (`customer_*` tables key off the empty `customers` table — verify dead before skipping.)
3. **Union contact points, don't strand them.** Move the loser's `insured_emails`/`insured_phones`/`insured_addresses` to the survivor as non-primary; de-dupe on normalized value; keep exactly one primary.
4. **De-dupe policies.** If loser and survivor hold the same policy (number + carrier + line + eff date), keep one and tombstone the other — don't create twins.
5. **Field survivorship.** For each scalar field, default to **most-complete, then most-recently-updated, then verified-over-unverified**; allow a manual per-field override from the review UI. Preserve the loser's non-winning values in the snapshot.
6. **Consent is strictest-wins.** Across `consents`, `twilio_consents`, `consent_ledger`, `consent_evidence`, `communication_preferences`, and `insured_phones.do_not_call`: the merged record inherits the **most restrictive** state. If either side is opted-out or DNC, the survivor is opted-out/DNC. Never let a merge grant a permission neither side independently had.
7. **Name → alias.** Write each loser's name/DBA into `account_aliases` and a `same_as` edge in `account_relationships` (the relgraph wrapper already does the edge — keep it) so future search and imports still resolve the old identity.
8. **Tombstone the loser** (`merged_into_id`, `deleted_at`), record `merge_history`, set the group `merged`.

---

## D. Reversibility & audit

- **Un-merge must exist and be one click.** From the `merge_history` snapshot + reparent map, restore the loser, move its children back, clear the tombstone. Producers only trust merge when undo is trivial.
- **Every merge logs** actor, timestamp, rule that fired, survivor, losers, and the full reparent map. Insurance is E&O-sensitive; you may need to prove a record's state at a date.
- **Track the un-merge rate.** A high reversal rate means matching is too aggressive — tighten thresholds.

---

## E. Imports & recurrence (dedup is a pipeline, not a cleanup)

- **Honor the survivor on import.** Every Canopy pull, dec-page import, and carrier download must check `merged_into_id` and an `external_ref → survivor` crosswalk, so a merged duplicate is never re-created on the next sync. Without this, the queue refills forever.
- **Dedupe at creation.** Run the Tier-0/1 checks at quote, lead, and import time — the cheapest duplicate is the one never made.

---

## F. Workflow & access

- **Triage the 176, don't hand-review them.** Auto-clear Tier 0 (no hard-block), batch Tier 1–2 for review, flag Tier 3 as link candidates. A queue nobody can finish rots — it already has 176 pending.
- **Blast-radius preview before commit.** Show exactly what will move: *"survivor gains 7 policies, $X premium, 12 documents, 2 consents; 1 duplicate policy will be dropped."* No silent merges.
- **Role-gate merge.** It's destructive — restrict to senior staff via RLS, not every CSR.
- **Mind ownership & commission.** When account A (one producer) merges into B (another), the book of business and commission attribution change. Decide and record who owns the survivor.
- **Mask PII in the diff.** The review screen shows two parties' SSN/DOB side by side — mask by default, reveal per-field, logged.

---

## G. Appendix — generating the must-touch table list

Do not hardcode. The merge enumerates targets from the catalog so it never goes stale:

```sql
-- every table that must be repointed loser -> survivor
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND column_name IN ('account_id','contact_id')   -- extend if new ref columns appear
ORDER BY column_name, table_name;
-- today: 126 tables on account_id, 23 on contact_id
```

Exclude views and the dead `customers`/`customer_*` lineage (verify they are dead first). For each, repoint where the column = any loser id. Wrap the whole sweep in the merge transaction.
