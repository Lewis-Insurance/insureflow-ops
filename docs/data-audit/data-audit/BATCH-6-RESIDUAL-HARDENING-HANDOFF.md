# InsureFlow — Batch 6: Residual Hardening Handoff (for Claude Code)

**Date:** 2026-06-28
**Author:** Brian's architect/orchestrator (planning only — not executed from this side).
**Executor:** Claude Code, Supabase project `lrqajzwcmdwahnjyidgv`, new branch off `main` (suggest `hardening/storage-batch-6`).
**Status:** Waves 0–5 + Batches 1–5 live on `main`. This is the **final** hardening pass — it closes the two items Batch 5 deliberately deferred (storage buckets, log/audit tier) plus the operational guards. Evidence base: `STORAGE-URL-FINDINGS.md` (on `main`).

## Why this is its own batch
**6A is the first substantial `src/` change in the whole arc** — it migrates frontend URL call sites, so unlike every prior batch it **will trigger a real Netlify deploy** and needs app smoke‑testing. Sequence it carefully; the storage buckets stay public until the URL migration lands.

## Operating rules
- Branch‑first; versioned migrations + reviewable `src/` diffs; **dry‑run/verify**; reversible.
- **Test the affected app flows on the branch before merge** (6A especially).
- Re‑run the Supabase **security advisor** at the end; capture before/after.

### 6.0 — Prerequisite (still open): repo↔prod sync
The `supabase db pull` of the 16 prod‑only migrations is still pending (blocked on `SUPABASE_ACCESS_TOKEN` in the Claude Code env — Brian/CLI runs it once). **Land that first** so Batch 6 migrations don't stack on a divergent history.

### 6A — Storage hardening (TWO phases — do not reorder)
Per `STORAGE-URL-FINDINGS.md`: `documents` is read via `getPublicUrl()` in **19** sites + **2 hard‑coded** `/object/public/documents/` edge functions, alongside 17 `createSignedUrl()` sites (inconsistent). It **cannot** go private until the public‑URL reads are migrated.

**Phase 1 — migrate URL call sites (frontend + edge fns; ship & smoke‑test first):**
- Convert the **19 `documents` `getPublicUrl()` sites** (incl. `useAcordForms.ts:334`, `useAcordTemplates.ts:169`) to **signed URLs**, standardized through the existing **`get-document-url`** edge function (single chokepoint).
- Fix the **2 edge functions** that hard‑code public paths: `execute-ai-module` (hard‑coded `/object/public/documents/`) and `analyze-insurance-document` (parses `/object/public/`) → signed URL / service‑role read.
- Same one‑site fix for `acord-forms`, `certificates`, `issue-attachments` (1 `getPublicUrl` each).
- **Verify on branch:** document upload, document display, ACORD form + template rendering, and AI document analysis all still work end‑to‑end. This is the gate to Phase 2.

**Phase 2 — lock the buckets (after Phase 1 verified):**
- Set `documents`, `acord-forms`, `certificates`, `issue-attachments` (and any other PII buckets) `public=false`.
- Scope `storage.objects` RLS: **write → `is_staff()`** in the owning agency (derive tenancy from the document's parent account); **read → staff/owner**.
- **Verify:** anon/cross‑agency cannot list or fetch; the app's signed‑URL path still serves docs; already‑private buckets (`ticket-attachments`, `portal-documents`, `exports`) unaffected.

**Separate quick look:** `avatars` and `ao-renewal-quotes` are already private but read via `getPublicUrl` ×1 → likely already broken/dead. Confirm and either convert to signed or remove the dead call.

### 6B — Append‑only log/audit tier (the 19 tables Batch 5 left open)
These remain writable via public‑role policies (deliberately, pending verification).
- For each, **confirm its writer is a `SECURITY DEFINER` trigger** (so locking the public write policy won't break the insert).
- Confirmed‑definer → replace the open public write policy with definer‑path/`is_staff()` only; scope reads.
- Any written by a non‑definer/public flow → convert the writer to definer first, or document why it must stay open (these are append‑only, no PII read — lower risk, but close them once the writer path is confirmed).
- **Verify:** the audit/log write flows still succeed; no unintended public direct write remains.

### 6C — Operational guards (latent items F2/F3 from Batch 5)
- **New‑staff onboarding:** provisioning must set `default_agency_workspace_id` **and** an `agency_workspace_memberships` row before the user can read/write — otherwise the 1D/5A scoping silently blocks them. Encode this in the onboarding function/runbook (and keep the `is_staff()` fallback until coverage is proven).
- **canopy‑completion trigger (F2 latent):** the agent flagged this earlier — confirm it behaves under the new account‑linked Canopy path and the scoped RLS; fix if it writes in a role the new policies block.

### 6D — Finish
Re‑run **security advisor**; capture before/after. Commit each item (separate the `src/` URL migration from the storage‑lock migration), **merge → `main`, push.** Expect a **real Netlify deploy** this time — verify the deployed app's document flows post‑deploy. Output `[BATCH 6 COMPLETE]` with the advisor delta and per‑flow smoke‑test results.

---

## Stays with Brian (architect calls)
- Whether to run the `getPublicUrl → signed` migration now or batch it with other planned frontend work (it's the first real frontend deploy of the arc).
- Final sign‑off that document display/upload looks right in the deployed app after Phase 1.
- After Batch 6 + the assistant's review queues land → **4C** is the last thing standing (with PITR confirmed).
