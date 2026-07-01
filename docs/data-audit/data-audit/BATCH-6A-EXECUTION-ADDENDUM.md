# Batch 6A — Execution Addendum (storage signed‑URL migration)

**Date:** 2026-06-28 · **For:** Claude Code · Planning only.
**Extends:** `BATCH-6A-STORAGE-MIGRATION-PLAN.md` + `BATCH-6-RESIDUAL-HARDENING-HANDOFF.md`. Resolves the open question *"how to handle 6A given the runtime smoke‑test gate."*

## Decision: build it fully, verify on staging, then merge — never ship to `main` unverified
The blocker is **verification, not capability.** There is **no safe interim** — a `public=true` bucket serves objects to anyone with the URL by design, so you cannot keep `getPublicUrl()` working *and* close the exposure. The full refactor is the only real fix; the missing ingredient is a human smoke‑test, which we route to staging.

## Execution sequence
1. **Branch off `main`.** Build the complete 6A per the plan:
   - **Schema change + backfill** for the 5 sites that persist the public URL into a DB column (incl. the ACORD forms/templates PDF feature): store the **object path**, not the URL; backfill existing rows (path‑from‑URL); sign on read.
   - Convert all `documents` `getPublicUrl()` reads → signed URLs via the existing **`get-document-url`** edge function (single chokepoint).
   - Fix the 2 edge functions hard‑coding `/object/public/documents/`: `execute-ai-module`, `analyze-insurance-document`.
2. **Expanded scope (from live config) — not just `documents`.** These buckets are public **and** PII‑bearing: **`documents`, `certificates`, `acord-forms`, `acord-templates`, `portal-documents`, `workspace-documents`** — migrate reads for all six. Leave **`favicon`, `lewis-social-videos`, `avatars`** public (non‑sensitive). *(An earlier read called `portal-documents` private; live config = `public=true` — trust live.)*
3. **Scope the open write.** `storage.objects` INSERT is currently `authenticated` on **all** buckets (no filter). Restrict to `is_staff()` + bucket, alongside the existing per‑bucket SELECT/UPDATE/DELETE.
4. **Deploy the branch to a Netlify preview/staging. STOP.**
5. **Human gate (Brian or staff with creds) — smoke‑test on staging:** (a) upload a document, (b) open/display a stored document, (c) generate + open an ACORD form **and** template PDF, (d) run AI document analysis. **All four must pass.**
6. **Only after the human confirms:** merge to `main`; set the 6 buckets `public=false` and finalize `storage.objects` read scope (staff/owner). Expect a **real Netlify production deploy** on merge — re‑verify the four flows on prod post‑deploy.
7. Commit the `src/` URL migration **separately** from the storage‑lock migration (independently reviewable/reversible).

## Who does what
- **Claude Code:** everything except the runtime smoke‑test.
- **Brian / staff:** the staging smoke‑test (the gate). Pair this deploy with the two still‑open CLI/dashboard items, since 6A is the first real deploy: **enable PITR** + run **`supabase db pull`** (the 16 prod‑only migrations) before/with this work.
- Buckets stay public until step 6; reversible throughout.

## Acceptance
All four flows pass on staging, then on prod post‑deploy; the 6 PII buckets `public=false`; `storage.objects` write = `is_staff()`, read = staff/owner, no anon access; security‑advisor storage findings cleared. Output `[BATCH 6A COMPLETE]`.
