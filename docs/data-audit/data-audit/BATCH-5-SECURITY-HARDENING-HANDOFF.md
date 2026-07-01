# InsureFlow — Batch 5: Security Hardening Handoff (for Claude Code)

**Date:** 2026-06-28
**Author:** Brian's architect/orchestrator (planning only — nothing executed from this side).
**Executor:** Claude Code, Supabase project `lrqajzwcmdwahnjyidgv`, new branch off `main` (suggest `hardening/rls-batch-5`).
**Status:** Batches 1–4 are live on `main` (RLS on `accounts` already scoped, anon revoked on 15 PII tables, 7 analytics matviews closed). This batch closes the *remaining* exposure surfaced during Batch 1–4.

## Why this batch
None of the items below is a leak **today** because Lewis is single‑tenant — but each becomes a real cross‑tenant exposure the moment a second agency is added, and several are correctness/integrity gaps regardless. **Do this before any multi‑tenant work.** Independent of 4C and the assistant queues — can run anytime.

## Operating rules (same as prior batches)
- Branch‑first; versioned migrations committed to git; **dry‑run → apply → verify**; reversible (include the prior policy/constraint definitions as down‑migrations).
- **Test the app's read AND write paths on the branch before prod** — scoping writes is the item most likely to break a live flow.
- Respect/strengthen RLS; never weaken. Re‑run the Supabase **security advisor** at the end and confirm the ERROR count drops.

---

### 5.0 — Prerequisite: sync the repo to prod (kill the drift)
16 migrations were applied directly to prod **outside the repo**. Run a `supabase db pull`, commit the reconstructed migrations, and confirm `migration list` matches prod **before** generating any new migration in this batch — otherwise these new RLS changes stack on a divergent history.
**Verify:** local migration list == prod; clean tree.

### 5A — Lock down wide‑open writes (the main item)
Six tables still allow **any authenticated user to INSERT/UPDATE** every row: `policies, communications, documents, quotes, notes, tasks`. **First discover the full set** — audit *all* public tables for residual `authenticated USING(true)` / `WITH CHECK(true)` policies and unscoped INSERT/UPDATE/DELETE; don't trust the list of six to be complete.
**Approach per table:** scope writes to staff within the owning agency, mirroring the `accounts` pattern from 1D.
- Tables with a direct `agency_workspace_id` → scope on membership (`agency_workspace_id IN (select agency_workspace_id from agency_workspace_memberships where user_id = auth.uid())`).
- Tables without one (most of these) → **derive tenancy through the parent** (`account_id → accounts.agency_workspace_id`, `policy_id → …`, etc.) via a subquery in the policy `USING`/`WITH CHECK`.
- Add the `profiles.role IN (admin,owner,producer,csr,staff)` staff guard as the belt‑and‑suspenders condition.
**Caution:** these are live write paths — confirm the app's create/update flows for policies, quotes, tasks, notes, documents, communications still succeed on the branch (service‑role/Edge‑function writes are unaffected; only the `authenticated` client path changes).
**Verify:** no `USING(true)` write policy remains on any PII table; app smoke test of each write flow passes.

### 5B — Storage: documents bucket
The documents bucket allows **listing**. Lock `storage.objects` RLS so objects are only readable/writable by staff in the owning agency (derive tenancy from the document's account), disable public/anon listing, and confirm uploads/downloads still work via the app's signed‑URL path.
**Verify:** anon/cross‑agency cannot list or fetch; legitimate app download still works.

### 5C — SECURITY DEFINER views (41, advisor ERRORs)
The security advisor lists **41 `SECURITY DEFINER` views** — they run with the definer's privileges and bypass RLS. Audit each: set `security_invoker = true` (PG17 supports it) wherever the view should run as the querying user; for any that *must* stay definer for a legitimate reason, add explicit tenant/role filtering **inside** the view and document why. 
**Verify:** security advisor `SECURITY DEFINER` ERRORs cleared (or each remaining one documented with its tenant filter).

### 5D — `ao_renewal_quotes` integrity
The expected CHECK guard is absent. Add the missing CHECK constraint (validate existing rows first; quarantine/repair any violators rather than failing the migration).
**Verify:** constraint present and enforced; zero violating rows.

### 5E — Membership coverage (so 1D doesn't lock anyone out)
**Tamrah Tyre** has no `f1f07037` membership (works today only via the `is_staff` fallback). Audit: **every active staff user must have an `agency_workspace_memberships` row** for the agency, or the scoped RLS from 1D/5A silently hides data from them. Add the missing membership(s).
**Verify:** every active staff `profiles` row has a matching membership; each can read the book on the branch.

### 5F — Finish
Re‑run the Supabase **security advisor (security)** — confirm the ERROR/WARN count drops materially and capture before/after. Commit each item, **merge `hardening/rls-batch-5` → `main`, push.** Output `[BATCH 5 COMPLETE]` with the advisor before/after and the per‑item verification results.

---

## Stays with Brian (architect calls)
- The **multi‑tenant go/no‑go** — this batch is the prerequisite that makes it safe.
- Any SECURITY DEFINER view that must remain definer for a business reason (5C will surface them for a decision).
- Whether to fold the `is_staff` fallback removal into this batch or keep it as a safety net until membership coverage is proven 100%.
