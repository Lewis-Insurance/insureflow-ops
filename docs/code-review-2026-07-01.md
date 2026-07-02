# InsureFlow Ops — Two-Week Ship Review (a89b950 → main, reviewed 2026-07-01)

Scope: everything merged to `main` since mid-June — 357 files, ~39.6k insertions, 75 SQL migrations. Six parallel reviewers covered: SQL migrations/security, payments + day sheets, renewals overhaul, relationship graph/merge/importer, customer record + notes, and the light-theme sweep. Every finding below was verified against the final file content on `origin/main` (and, where noted, against the live prod database).

---

## P0 — Fix immediately

### 1. CRITICAL (security): anon can dump the full book of PII via seven RPCs
The customer/policy/lead search + triage-count RPCs are `SECURITY DEFINER`, owned by postgres (bypasses RLS), contain **no `is_staff()`/`auth.uid()` guard**, and are `GRANT EXECUTE ... TO anon`. **Verified against prod.** Anyone with the public `VITE_SUPABASE_ANON_KEY` (it ships in the JS bundle) can call `POST /rest/v1/rpc/unified_customer_search` and receive names, emails, phones, and addresses for the entire book.

- `supabase/migrations/20260628193100_unified_customer_search_cohort_and_renewal.sql:100`
- `supabase/migrations/20260628193000_customers_triage_counts.sql:42`
- `supabase/migrations/20260628194000_policies_triage_counts_and_search.sql:26,98`
- `supabase/migrations/20260628195000_leads_triage_counts_and_search.sql:25,105`
- `supabase/migrations/20260628194100_ao_migration_counts_and_search.sql:26,92`
- `supabase/migrations/20260628201000_tasks_triage_counts_and_search.sql:14,42`
- `supabase/migrations/20260628200000_needs_me_today_counts.sql:25`

Fix: `REVOKE ... FROM anon` on all seven and add the same `is_staff()` guard the relgraph RPCs already use (`20260628203500`, `20260629103000`). One small migration; apply to prod today.

### 2. HIGH (data corruption): Reopen spawns a duplicate open renewal every time
`supabase/migrations/20260701130000_renewal_reopen_rpc.sql:39-57` — the RPC reactivates the policy **before** flipping the renewal back to `upcoming`. The policy UPDATE fires the sync trigger while the renewal is still `lost`, so the trigger INSERTs a brand-new `upcoming` row; the RPC then also reopens the original. Every reopen of a lost/cancelled/lapsed renewal produces two open renewals — one with none of the notes/quotes. Fix: reopen the renewal row first (or delete the trigger-minted row inside the RPC).

Related: reopening a **moved** renewal leaves it pointing at the now-`inactive` old policy, so the sync never reconciles it (`20260701130000` header even acknowledges this); and reopening a `renewed` renewal doesn't check whether a next-term open row already exists → duplicate queue entries.

### 3. HIGH (data corruption): Mark-Renewed from "Pending" corrupts history and skips the next term
`src/hooks/useRenewalWorkflow.ts:1142-1169` updates the policy first, then closes the renewal. If the working status is `upcoming` (the default "Pending"), the sync trigger's UPDATE branch overwrites the still-open renewal with the NEW term's expiration and premium before it's closed — the closed row shows next year's date and a 0% premium delta (prior premium destroyed), and no next-term `upcoming` row is spawned until the next page-mount reconciler run. The `quoted` path behaves correctly, so behavior silently differs by working status. Fix: close the renewal before touching the policy, or move Renewed into an RPC like Moved. (`useMarkLost` at :1295-1320 has the same non-atomic two-write shape, minus the corruption.)

### 4. HIGH (data explosion): full-book renewal sync ignores `deleted_at`
`supabase/migrations/20260629120000_full_book_renewal_sync.sql:108-121, 139-147` — the reconciler filters `p.status IN ('active','pending')` but dropped the `p.deleted_at IS NULL` filter the previous sync had. The merge engine soft-deletes duplicate policies **without changing status** (`20260628151600:152`), and prod has thousands of such rows. The per-mount reconciler will mint an open `upcoming` renewal for every merge-soft-deleted policy — reintroducing book-wide duplicates the dedup effort removed. Fix: add `AND p.deleted_at IS NULL` to both blocks (and the row trigger at :31-35).

### 5. HIGH (security hygiene): SECURITY DEFINER functions missing `SET search_path`; full-book write callable by any user
- `20260630170000_day_sheet_date_and_paid_to_guards.sql:70-74, 143-147` — `ensure_payment_day_sheet` and `enforce_payment_paid_to` (confirmed empty config in prod).
- `20260629120000_full_book_renewal_sync.sql:72, 154` — `auto_sync_policy_to_renewal` and `sync_policies_to_renewals`; the latter is also granted to all `authenticated` with no `is_staff()` gate, so any logged-in user (incl. customer-portal accounts) can force a full-book renewal write.

Fix: `SET search_path = public` on all four; add `is_staff()` + revoke broad grant on `sync_policies_to_renewals`.

### 6. HIGH (workflow trap): merging customers invalidates zero caches
`src/hooks/useRelationshipGraph.ts:539-547` runs `merge_accounts_manual` and returns; `MergeCustomersPage.tsx:121-127` navigates straight to the survivor. With the global 5-minute `staleTime` (`src/App.tsx:132`), the survivor record renders **without the merged-in policies** — the CSR concludes the merge failed and re-runs it or re-keys the policy. Fix: invalidate `policies`, `unified-customers`, `payments`, `documents`, `account-notes` on success. Same class: merging a duplicate group doesn't refresh the "Recently merged" undo list and vice versa (`DuplicatesReviewPage.tsx:93-102`).

### 7. HIGH (performance): every customer record open fetches the entire policies book
`src/components/customers/CustomerPoliciesSection.tsx:43` calls `usePolicies()` unfiltered; `src/hooks/usePolicies.ts:41-133` paginates the **whole `policies` table** (1000 rows/request with 3 embedded joins) then client-filters to one account. This was pre-existing but hidden inside a lazy tab; the stacked-panels rework (`5285e09`) made it fire on every record open — several serial round-trips and megabytes to render ~3 policy cards, inside a ~15-17-query mount waterfall. Fix: pass an `accountId` filter to the server query. Bonus: `CustomerContactInfo.tsx:259` does `window.location.reload()` after a contact edit, re-running the whole waterfall.

---

## P1 — Real bugs users will hit; fix this sprint

### Payments / Day Sheets
- **Auto-print fires repeatedly and can print an empty sheet** — `src/pages/DaySheetDetail.tsx:68-73`. Effect depends on `payments` (fresh `[]` each render) with no one-shot guard and no URL-param cleanup: prints an empty PDF before payments load, prints again when they do, and again after any payment mutation. 
- **Editing a payment can silently wipe `check_number`** — `src/components/payments/RecordPaymentForm.tsx:296-297` (with 135-145): if the payment-methods fetch is in flight/errored or the method was deactivated, `isCheck` is false and save nulls `check_number`/`reference_number`, skipping validation.
- **"Add Payment" on a past day sheet books to today** — `DaySheetDetail.tsx:229-233`: the form gets no `defaultDaySheetDate`, so `day_sheet_date` defaults to today; the missed payment lands on the wrong sheet.
- **`useCurrentDaySheet` uses device-local time, not America/New_York** — `src/hooks/useDaySheets.ts:82-101`, unlike the form's `todayLocalDate()`. A PT machine at 10pm shows/prints the wrong day's sheet. Query key `['day-sheets','current']` also never rolls over midnight.
- **Voided/NSF payments included in totals** — `PaymentHistoryWidget.tsx:99-101` (customer/policy totals include voided + NSF), `PaymentList.tsx:58-83` (NSF counts in "Total Collected") — both disagree with the day sheet's `grand_total` which counts only `recorded`.

### Renewals
- **`renewal_mark_moved` duplicate guard matches soft-deleted/inactive policies** — `20260701120000_renewal_mark_moved_duplicate_guard.sql:62-71`: no `deleted_at`/status filter while the real uniqueness is a partial index excluding soft-deleted rows. Legit moves get falsely blocked with an error that leaks another account's id. Scope the guard to live policies.
- **No partial unique index enforcing one open renewal per policy** — trigger + reconciler are SELECT-then-INSERT; two agents loading /renewals concurrently can double-insert. `CREATE UNIQUE INDEX ... ON renewals(policy_id) WHERE status IN ('upcoming','in_progress')` structurally prevents this **and** findings P0-2/P0-3's duplicate modes.
- **Date-only strings parsed as UTC → off-by-one across the renewals UI** — `src/lib/renewals/format.ts:8-11`, `src/components/cc/NextRenewal.tsx:25-26`, `src/pages/RenewalsPage.tsx:38-39`: a July 1 renewal displays "Jun 30" and flips Overdue a day early. The codebase's own `parseLocalDate` (used correctly in `RenewalTopBar.tsx:33`) should be used at all three sites.
- **In-flight autosave can reopen a just-committed renewal** — `UpdateRenewalWidget.tsx:150-187`: `committingRef` guards the debounce timer but not a PATCH already in flight; if it lands after Renewed/Moved/Lost it rewrites `status:'upcoming'`. Add a status precondition to `useSaveRenewalDraft` (:1094-1099) server-side or key/abort the mutation.

### Search / Merge / Importer
- **Merge customer search breaks on commas (filter injection)** — `src/components/customers/CustomerMergeSelector.tsx:62-64`: raw input interpolated into `.or(\`name.ilike.%${q}%\`)`; "Smith, John" 400s and silently shows "No customers found" — exactly the names that need merging. `sanitizeForILike` already exists in `usePolicies.ts:79`; use it. (Also un-debounced — fires per keystroke.)
- **Stale-response race in all three live-search hooks** — `useGlobalSearch.ts:25-73`, `useRelationshipGraph.ts:287-301`, `useLeadSearch.ts:64-95`: no request sequencing/abort, so a slow older response overwrites a newer one and Enter opens the wrong record. Fix with a monotonic counter or AbortController.
- **Duplicates queue hard-capped at 200 with no pagination** — `useRelationshipGraph.ts:445-462` vs. the true-total header count (`DuplicatesReviewPage.tsx:171`). With ~14k redundant accounts in the book, most groups are unreachable.
- **Importer: one sequential RPC per row** — `src/lib/import/bulkImportProcessor.ts:146-221`: a 10-15k-row import is 10-15k serial round trips (~20-40 min, no cancel; abandoning mid-run strands `import_batches` in `processing`). Batch the RPC or run 5-10 in flight. Also `bulkImportProcessor.ts:420`: `totalErrors > 0 ? 'completed' : 'completed'` — a batch with hundreds of row errors is recorded identically to a clean run (intended `'completed_with_errors'`), and `totalSuccess` (:417) omits matched accounts.
- **CSV parser breaks on quoted embedded newlines** — `src/hooks/useBulkImport.ts:195-226`: `split('\n')` splits inside quoted fields (multi-line addresses are common in AMS exports).

### Customer record / Notes
- **Per-policy "Add note"/"Add task" drop the policy association** — `CustomerPoliciesSection.tsx:531-540`: `selectedPolicyId` is set (:235,245,255) but never passed to `AddNoteModal`/`AddTaskModal`, so notes/tasks from a policy card lose their policy tag — defeating the notes-unification context chips.
- **"Log contact" never appears in the Activity panel** — `AddCallLogModal.tsx:65-79` invalidates nothing; the wired `onSuccess={refetchNotes}` refreshes dead state. Agent logs a call, sees nothing in Activity, logs it again → duplicate communications. Invalidate `['communication-history', accountId]`.
- **Duplicate-policy dialog can target the wrong customer** — `AddPolicyModal.tsx:321-327`: the lookup is unordered `limit(1)` with no status filter and case-sensitive `eq`, while the violated constraint is the active-only partial index. The "Merge Clients" CTA can deep-link a merge against the wrong customer. Match the index predicate (active statuses, case-insensitive) and order deterministically.
- **NotesPanel renders "No notes yet" on error and for non-staff** — `NotesPanel.tsx:43` ignores `isError`; the RPC returns empty for non-staff instead of raising (`20260701000000:64-67`). Notes are the E&O trail — an outage looks like an empty record.

### Theme
- **`cc-*` colors silently drop every `/opacity` modifier** — `tailwind.config.ts:78-115`: plain `var(--cc-x)` hex vars can't take alpha, and Tailwind emits **no rule at all**. 14 live call sites are broken in both themes: nav "new" indicator (`AppRail.tsx:85,135,370`), DuplicatePolicyDialog emphasis border (:61), AORenewalEdit save-button hovers (:672,834,867), Auth spinners (:271,417), dashboard search borders, prism tiles. Fix with `color-mix(in srgb, var(--cc-x) calc(<alpha-value>*100%), transparent)` wrappers or RGB-triplet vars.

---

## P2 — Worth scheduling

**Migrations / DB**
- `unmerge_account` no-id restore uses `to_jsonb(t) IN (...)` equality (`20260629170000:72-76`) — any trigger-touched column (e.g. `updated_at`) makes the delete match nothing, silently corrupting the reversal.
- Merge field-union only covers 11 scalar fields (`20260629240000:210-221`) — a rich loser's `goes_by`/`tin_last4`/entity names are silently discarded (recoverable only from the `losers_before` JSON snapshot).
- Notes mirror reuses `renewal_notes.id` as `customer_notes.id` with `ON CONFLICT DO NOTHING` (`20260701140000:24-27`) — works today, but couples three tables' PK spaces; prefer a surrogate PK + `source_id`.
- Migration replay is fragile: two files share the `20260629180000` prefix, and `20260629240000` drops `merge_accounts` that earlier same-day migrations call — prod was hand-applied via MCP, so `supabase db reset`/fresh-environment replay has never been validated.
- `get_account_cluster` re-evaluates the `owner_pick` subquery per output row (`20260629220000:100-124`) — O(nodes²), fine today, worth a lateral join.

**Frontend**
- `useRenewals()` fetches the whole book (open + all closed history, growing forever) with `select *` + joins and renders unvirtualized (`RenewalsPage.tsx:305`) — a known cliff as history accumulates.
- Dead code to delete: `useRenewalNotes` family + `RenewalNotes.tsx` (hard-deletes, violates soft-delete invariant, mirror is INSERT-only so resurrection would desync); dead `notes` state/fetches in `CustomerDetail.tsx:170,192-201,222-228` (extra query per mount + per note op); legacy `CSVImport.tsx:270-302` (blind-inserts with no workspace scoping — the exact bug PRs #11/#12 fixed; unreferenced landmine); dead `useUpdateRenewalStatus`/`BulkActionsBar`.
- Task tiles on the customer record go stale immediately (`CustomerDetail.tsx:230-235` one-shot fetch duplicated by `CustomerTasksSection`) — derive both from one `useTasks`.
- `useRenewals` search filter uses `account.name` inside `.or()` — invalid PostgREST, errors if ever used (`useRenewalWorkflow.ts:291-295`). Same class: `usePayments.ts:43-45` embedded-resource `.in()` without `!inner` doesn't filter, and its `.or()` search interpolates raw input.
- Amount not rounded to cents before insert (`RecordPaymentForm.tsx:293`); `payment_date` not validated (:499-506); PaymentList "Today" frozen at mount (:44-47); mutation/PDF failures console-only.
- "Link instead" only links the first two members of a 3+ group and ignores the status-update failure (`MergePreviewDrawer.tsx:111-117`, `useRelationshipGraph.ts:486-503`); survivor picker allows soft-deleted members (server blocks, bad UX); edge retype can invert the owner-direction invariant (`EditRelationshipDrawer.tsx:94-108`).
- `DateField` maps 2-digit years to 20xx ("12/31/99" → 2099) and live-commits transient dates mid-typing (`src/components/cc/DateField.tsx:47,121-129`).
- `maskDob` off-by-one on Jan-1 birthdays (UTC parse, `src/components/cc/mask.ts:26-31`).
- ILIKE wildcard leakage (`%`/`_` unescaped) in `search_leads`/`search_accounts`/`global_search_v1` and `setGoesBy`'s alias delete — parameterized so not injectable, but "%" matches the whole book.
- Theme: dark-flash for light-mode users on every load (`index.html:2` hardcodes `class="dark"`; add an inline pre-paint script); "Source highlighted" badge unreadable in dark mode (`ExtractionReviewDetail.tsx:796`); prism `text-*-400` labels fail contrast in light; `design-system/design-tokens.css` mirror missing 22 tokens the live `src/index.css` defines; unused Plus Jakarta Sans font loaded on every page (`index.html:10`).

---

## Verified good (checked, no issues)

- The **originally-known renewals duplicate-sync bug is fixed** — sync is now keyed on (policy_id, open status); the residual duplicate paths are P0-2/3/4 above.
- Merge engine guards: self-merge, loser-as-survivor, already-merged, idempotency all blocked at both UI and server layers; suggestion double-confirm idempotent; `get_account_cluster` cycle-safe (depth ≤5 + path guard).
- Payments: edit prefill complete; Day Sheet Date re-linking recomputes both sheets' totals; `paid_to` UI/DB constraints match; no orphan-payment path; double-submit guarded; the form's own "today" is correctly ET-pinned.
- Notes: one read path (`get_account_notes`) across customer/policy/standard-renewal pages with correct account scoping; no double-display from the mirror trigger; soft-delete respected; `customer_notes→accounts` FK + reconciler closes the stranded-notes-on-merge hole.
- PII: DOB year-only, TIN last-4, merge diff masks tin/ssn/dob; no SSN/DLN rendered in the reworked panels.
- Lost→inactive policy mapping intact (the "un-hid 101 policies" fix holds); Moved is atomic in its one live path; draft columns immune to sync clobber.
- Theme: overlays/scrims, StatusPill contrast, focus rings, light token block, and all documented KEEPs are correct; token **values** in the two CSS files match exactly (only coverage drifted); `.env` deletions intentional and safe.
- Importer rollback cannot delete matched pre-existing accounts (only newly-created rows are batch-tagged); `import_resolve_account` workspace-required fix holds.

## Suggested fix order

1. **Today:** migration revoking `anon` + adding `is_staff()` to the seven search/triage RPCs (P0-1); `SET search_path` + grant fix (P0-5). Small, zero-risk, closes the PII hole.
2. **This week:** renewals trio (P0-2, P0-3, P0-4) + the partial unique index — they actively corrupt the working queue on routine agent actions; then merge cache invalidation (P0-6) and the account-scoped policies query (P0-7).
3. **This sprint:** the P1 list — payments edit/print/date bugs, merge search sanitization + search races, importer batching + status ternary, per-policy note tagging, log-contact invalidation, duplicate-dialog targeting, cc-* alpha fix.
4. **Backlog:** P2 items, led by deleting the dead/landmine code paths and validating migration replay on a fresh DB.
