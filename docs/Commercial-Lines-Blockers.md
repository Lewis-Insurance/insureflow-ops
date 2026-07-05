# Commercial Lines - What Is Blocked and How to Unblock It

**Date:** 2026-07-05 (update as items clear)
**Context:** SOW v3 (`docs/Commercial-Lines-Quote-to-Bind-Plan.md`). Everything not listed here is unblocked and either shipped or in progress. Every item below is external - it needs Landen or Brian, not code.

---

## 1. Licensed ACORD blanks - THE critical path

**Blocked:** every form engine and packet step. Phase 1b (125+126 engines, packet with cover page, e-sign, one-click send), and the form half of Phases 3-6.
**Not blocked by this:** everything else - intake, submissions, diligent effort, offers, quotes, bind, COIs (the 25 is already onboarded), prefill (Phase 2).

**What to get** (ACORD Advantage portal, agency's license - same as the 25):

| Form | Name | Unblocks | Priority |
|---|---|---|---|
| **125** | Commercial Insurance Application | Phase 1b packet core | **NOW** |
| **126** | Commercial General Liability Section | Phase 1b (GL packet) | **NOW** |
| 140 | Property Section | Phase 3 | next |
| 130 | Workers Compensation Application | Phase 4 | next |
| 131 | Umbrella / Excess Section | Phase 5 | later |
| 127 | Business Auto Section | Phase 6 | later |

**Requirements for each PDF:** current edition, **fillable AcroForm** (not a flat scan, not XFA-only), FL-appropriate where state editions exist. The 2024/01 editions referenced by the old stub rows are fine if still current on the portal.

**Handoff (same drill as the 25):**
1. Download from the ACORD portal.
2. Drop on the Mac Desktop (`~/Desktop`), tell me the filename.
3. **Never** commit, email, or move into the repo - the onboarding pipeline verifies it is genuine, extracts + pins the field inventory, stores it in the private template bucket, and supersedes the Dec-2024 stub row.

**What happens the same day a blank lands:** I onboard it, build that form's typed engine (the acord25 pattern), and wire it into the packet. 125+126 together = the GL packet ships end to end.

**Also grab while in the portal (smaller, later):**
- **FL UM/UIM selection/rejection form** (current edition) - unblocks the signed UM rejection flow (Phase 6, Business Auto).
- **ACORD 75 (Insurance Binder)** - only if you decide binders are in scope (currently enhancement track).

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

## 3. RESEND_API_KEY - COI email delivery (carryover from the COI module)

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
