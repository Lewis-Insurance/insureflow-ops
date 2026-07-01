# InsureFlow — Interim‑Work Handoff (for Claude Code)

**Date:** 2026-06-28 · **Author:** architect/orchestrator (planning only; read‑only investigation by 4 agents, validated here). Nothing was built, minted, or sent.
**Executor:** Claude Code. **Window:** runs *now*, while the assistant works the Cleanup Kit. Independent of her — only **4C** waits on her.
**Detail specs:** `interim/PLAN-INT-A-canopy-mint.md`, `PLAN-INT-B-levitate-send.md`, `PLAN-INT-C-campaign-wiring.md` (+ loose ends below). Read those for the build‑level detail; this is the validated, sequenced overview.

## Honest headline (read first)
The Phase‑0 outreach "engine" is **scaffolded but not wired** — three systems each need real work plus an identity bridge. This is a genuine 1–2 week build, not a flip a switch. That's exactly why it's the right use of the assistant's days. **Nothing sends without an explicit human fire‑gate** (specced below).

## Cross‑cutting findings the agents surfaced (validated against live prod)
1. **Canopy server‑side minting is broken.** `canopy-initiate` POSTs to a non‑existent Canopy `/pulls` endpoint with the wrong base URL + auth — which is why all 17 `canopy_pulls` have NULL link fields. The real path is the **Widgets API** (`POST /widgets` → `public_alias`/`public_url`, `x-canopy-client-id/secret` headers), which `canopy-webhook` already uses correctly. (Inbound completion works; outbound *link minting* never did.)
2. **Levitate is orphaned from the entity model.** The whole send stack keys on `contacts.id` + `org_id`; `contacts` is empty and has no `org_id`, while the audience lives in `accounts` / `agency_workspace_id`. **No bridge exists.** Also: consent baseline empty (so suppression isn't actually enforced), governor config empty, zero templates, and the compliance engine is never called on the send path. Several latent bugs (frequency‑cap arg mismatch, missing RPCs, disclaimer/disclosure key mismatch).
3. **Householding is only 25 of 1,714 accounts.** Only the HIGH tier got `household_id`; the campaign must use `household_key = COALESCE(household_id,'acct:'||id)` (collapses automatically as more get linked).
4. **First‑batch reality:** email‑reachable home‑only→auto is **90 households (25.9%)**, not the ~200 I'd estimated (my 224 was email‑*or*‑phone). Book‑wide email reach is 707 accounts (41%).

## The work — two parallel streams

### Stream 1 — Loose ends (small, independent; ship anytime)
*(Agent‑D was interrupted; build agent confirms exact object names in‑repo/DB during implementation.)*
- **6A path columns:** add `certificates_of_insurance.document_path` + `workspace_documents.file_path`; backfill from the JSONB key currently holding the path (confirm key from a sample row); point the read sites at the columns. Retires the JSONB shortcut.
- **ACORD seeds:** replace the ~5 placeholder `acord_templates` rows (`YOUR_PROJECT_ID`) with real template definitions so they render.
- **TS types:** regenerate Supabase types; drop the transitional `as any` casts from 6A.
- **2 open log/audit tables (6B):** identify via `pg_policies` (permissive/public write on log tables); confirm each writer is `SECURITY DEFINER`; scope writes to definer/`is_staff()`.
- **F3 onboarding guard:** ensure new staff are granted `agency_workspace_memberships` + `default_agency_workspace_id` at creation (find the admin‑create‑user path + `is_staff()` def) so the scoped RLS never locks anyone out.

### Stream 2 — Phase‑0 outreach engine (dependency order)
**2a. Canopy batch‑mint** (`PLAN-INT-A`): new `canopy-batch-initiate` edge fn (`verify_jwt=false`, gated by `BATCH_TRIGGER_SECRET`) that mints one **Widget** link per target account via `POST /widgets` (don't touch the interactive `canopy-initiate`); persist to a dedicated **`canopy_invites`** table; partial‑unique idempotency (one open invite per account); `BATCH_MAX_MINT` pilot cap; 429/5xx backoff. **Confirm the Canopy plan's widget volume ceiling before bulk minting.**

**2b. Levitate readiness** (`PLAN-INT-B`): build the **identity bridge** (accounts/`agency_workspace_id` → the send stack); seed the **consent baseline** (so suppression is real); populate `marketing_governor_config`; fix the latent bugs (frequency‑cap arg count, missing `claim_marketing_queue_items` + `increment_contact_frequency` RPCs, disclaimer/disclosure key, `markFailed`); wire the **compliance engine into the send path**; create one CAN‑SPAM‑correct email template (physical postal address + working one‑click opt‑out); stand up a **dedicated sending domain** (SPF/DKIM/DMARC, `UNSUBSCRIBE_SECRET`); build `phase0-batch-enqueue`; add Postmark bounce/complaint ingestion. *(Reuse what works: governor queue→claim→send→evidence, and the `marketing-unsubscribe` opt‑out subsystem.)*

**2c. Campaign wiring** (`PLAN-INT-C`): create the `v_phase0_crosssell_targets` view (canonical SELECT in the spec); add lean `phase0_campaign` + `phase0_enrollment` (one row per household, carries play + email + account_id for the Canopy link); per‑play email templates (wedge = "share your policy in 30 sec, see exactly where you're exposed," CTA = the Canopy link); wire enrollment → `canopy_invites` (mint) → `marketing_send_queue` (send) with the pinned column values.

## The FIRE‑GATE (non‑negotiable — build it in)
Nothing reaches a customer without an explicit human go. Two independent stops, both from `PLAN-INT-B`:
1. `phase0-batch-enqueue` defaults to **`dry_run`** — returns a preview (who would receive, the content, compliance pass/fail/suppressed counts) and requires an **arm‑token + matching `preview_id`** to actually enqueue.
2. `sender_pause_state` ships with a **`global` row `is_paused=true`** — even enqueued rows send nothing until a human flips "go live."

## Sequencing & ownership
- **Run now (parallel with the assistant):** Stream 1 + Stream 2a/2b/2c — all build/test, no sending.
- **Waits for Brian:** the sending‑domain DNS (SPF/DKIM/DMARC) setup; the first‑batch choice (the real **90** email‑reachable home‑only, or broaden to ~200 across "sell‑auto" plays); confirming Canopy's widget volume; and the **fire** itself (dry‑run preview → arm → unpause).
- **Still waits on the assistant:** only **4C**.

## What "done" looks like for this handoff
Loose ends merged; `canopy-batch-initiate` mints real Widget links to `canopy_invites` (tested on a 2–3 account pilot, not bulk); Levitate passes a dry‑run preview end‑to‑end with real compliance counts and **zero sends** (global pause on); campaign view + enrollment populate for the first batch. Output `[INTERIM WORK COMPLETE]` with the dry‑run preview numbers — then it's staged for your fire decision.
