# Commercial Lines - What Is Blocked and How to Unblock It

**Date:** 2026-07-06 (update as items clear)
**Context:** SOW v3 (`docs/Commercial-Lines-Quote-to-Bind-Plan.md`). Everything not listed here is unblocked and either shipped or in progress. Every item below is external - it needs Landen or Brian, not code.

---

## 1. Licensed ACORD blanks - ~~THE critical path~~ RESOLVED 2026-07-06 (one straggler)

**ALL SIX application blanks are verified fillable and onboarded** (Desktop drop
2026-07-06 + the 130 recovered from the Dec-2024 bucket upload, which was a real
encrypted portal download all along). Editions, field counts, and hash pins live
in `src/lib/acord/blanks/README.md`; inventories are committed alongside. The
portal downloads ship encrypted + hybrid-XFA; normalization is `qpdf --decrypt`
(also repaired the 125's damaged xref). Engines pin the normalized bytes.

| Form | Edition | Fields | Status |
|---|---|---|---|
| 125 | 2016/03 | 603 | onboarded |
| 126 | 2009/08 | 279 | onboarded (generic names - coordinate map) |
| 127 | 2015/12 | 636 | onboarded |
| 130 | 2010/05 | 486 | onboarded (generic names - coordinate map) |
| 140 | 2014/12 | 355 | onboarded |
| 131 | 2009/10 | 405 | onboarded (generic names - coordinate map) |

**The one straggler - FL UM/UIM supplement:** the `ACORD_61_FL_-_UM_Supplement.pdf`
on the Desktop is a PRINT-ONLY version (0 form fields). Re-download the
**fillable** ACORD 61 FL from the portal (same Desktop drop drill). Until then
the UM decision log + signed-document linkage work; only the machine-filled
printable waits.

**ACORD 75 (Insurance Binder):** still optional, enhancement track.

---

## 1b. ANTHROPIC_API_KEY - present but the VALUE is malformed

The secret now EXISTS in the edge-function store (good), but its value is
**403 characters** - a real key is ~108 (`sk-ant-api03-`, one line). Whatever
was pasted includes ~300 characters of extra content, so Anthropic rejects the
call ("x-api-key header is required"). **Re-set it with exactly the key and
nothing else** (dashboard: Edge Functions -> Secrets -> `ANTHROPIC_API_KEY`, or
`supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref lrqajzwcmdwahnjyidgv`).
The Azure OCR leg of extraction is already fixed and proven (retired API version
migrated across all nine extract functions, 2026-07-06); the moment the key
value is clean, extraction is fully live.

---

## 2. Canopy commercial pull - verify the plan covers it

**Blocked:** the Canopy prefill feeder (one of Phase 2's three intake sources). The other feeders (policy-upload extraction, client portal, manual, Sunbiz) do not depend on this.

**The problem:** the Canopy commercial tables have **never received a row** (0 rows, verified). The schema and the `get_canopy_commercial_prefill()` function are ready, but we have no evidence the agency's Canopy subscription actually returns commercial payloads (fleet, GL/BOP detail, payroll classes, business locations).

**To unblock (Landen or Brian, ~15 minutes):**
1. Pick one real commercial account with a known carrier login (a Progressive commercial auto or an Auto-Owners GL is ideal).
2. Run a Canopy connect/pull for it the normal way.
3. Tell me the account - I check whether the commercial tables populated.
- If data lands: Phase 2 wires the feeder as planned.
- If not: ask Canopy support whether commercial-lines data is in the current plan tier, and what it costs if not. Phase 2 ships without it either way (extraction + portal + manual carry the load).

---

## 2b. ANTHROPIC_API_KEY - policy-upload extraction (found 2026-07-05)

**Blocked:** the entire policy-upload extraction feeder (Phase 2's headline). The 9 extract-* edge fns require `ANTHROPIC_API_KEY` + the two Azure Document Intelligence secrets. **Verified (re-checked 2026-07-05 late): the Azure secrets ARE set in prod; `ANTHROPIC_API_KEY` is still NOT in the Supabase EDGE-FUNCTION secrets** (if it was set in Netlify or GitHub env, those do not reach edge functions - it must be a Supabase edge secret). Every extraction call fails at the key check until it exists.

**To unblock (Landen, ~5 minutes):** add an Anthropic API key as a Supabase edge secret:
- Dashboard: project `lrqajzwcmdwahnjyidgv` -> Settings -> Edge Functions -> Secrets -> `ANTHROPIC_API_KEY`
- Or CLI: `supabase secrets set ANTHROPIC_API_KEY=<key> --project-ref lrqajzwcmdwahnjyidgv`
No deploy needed. First real extraction after that verifies the whole path (upload a GL policy on a commercial policy record -> Extract GL Details).

---

## 3. ~~RESEND_API_KEY~~ - DONE (verified set in edge secrets 2026-07-05)

**Blocked:** actually delivering certificate emails (and, later, the Phase 1b one-click packet send, which uses the same provider). Everything up to the provider call is live and Fence-gated; a send today returns a 502 at Resend.

**To unblock (Landen, ~5 minutes):** restore the key as a Supabase edge-function secret:
- Dashboard: project `lrqajzwcmdwahnjyidgv` -> Settings -> Edge Functions -> Secrets -> set `RESEND_API_KEY`.
- Or CLI: `supabase secrets set RESEND_API_KEY=<key> --project-ref lrqajzwcmdwahnjyidgv`
No deploy needed; the next send picks it up.

---

## 4. Coterie live quoting - enhancement track (no action needed now)

**Blocked:** live BOP/GL API quoting through Coterie (currently a mock integration behind approval gates). Deliberately **out of v1** per the locked scope. When you want it: Coterie production API credentials + a go decision, and it gets its own build behind the existing approval gates.

---

## Quick status of everything else (NOT blocked)

- **Shipped:** Phase 0 risk store + submission spine (prod); Phase 1a business-profile intake, submissions UI, diligent-effort log, offer/rejection log; quote capture + bind write-through (PR in flight).
- **COIs for direct/admitted carriers:** working TODAY - Master COI panel -> coverage line -> enter the two required GL limits -> generate. The book's blocker is unfilled data (0 of 55 commercial policies have details), not code.
- **In progress next, no dependencies:** Phase 2 prefill (policy-upload extraction, client intake portal, Sunbiz lookup, remarket clone).
