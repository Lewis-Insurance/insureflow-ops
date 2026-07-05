# Commercial Lines SOW - Four Decisions Needed

**Companion to:** `docs/Commercial-Lines-Quote-to-Bind-Plan.md` (SOW v2, PR #51)
**Date:** 2026-07-05
**Who answers:** Landen (loop in Brian on Q1 and Q2 - they are about agency practice, not software)

Write answers directly under each question (or reply in chat / PR comment). Once all four are answered and #51 is merged, the scope is locked and Phase 0 starts.

---

## Question 1 - How do you actually submit to markets today?

When you send a commercial risk to a carrier, MGA, or wholesaler to get a quote, how does the application packet physically get there?

**Why it matters:** this decides what Phase 1 builds for the "submit" step. Email means the system sends the signed ACORD packet itself (approval-gated, like COI email, with the send logged per market). Portals mean the system's job ends at producing a perfect packet PDF and recording that you submitted it.

**Pick one:**
- **A. Email** - you email the packet to an underwriter or wholesaler contact. (System sends it, Fence-gated, fully logged.)
- **B. Carrier portals** - you re-key or upload into each market's website. (System generates the packet + a "mark as submitted" button with the artifact attached; no sending.)
- **C. Both, depends on the market** *(my default assumption)* - each market in the registry gets flagged email vs portal and the submit step adapts.

**ANSWER:**

---

## Question 2 - How do your surplus lines placements work?

Your commercial book already includes E&S paper (Burlington, USLI, and Bass Underwriting as a wholesaler). Florida requires a documented diligent effort (declinations from admitted carriers) before an E&S placement, and surplus lines disclosures to the insured.

**Why it matters:** this decides how much compliance machinery Phase 1 builds and who it assumes does the state filing.

**Two parts:**

**2a. When you place E&S business, does it go through a wholesaler (like Bass) who is the surplus lines agent of record and handles the FSLSO filing and tax?**
- **A. Yes, always through a wholesaler** *(my default assumption)* - the system documents your diligent effort + disclosures; filing stays the wholesaler's job.
- **B. Sometimes direct** - someone at the agency holds a surplus lines license and files. (System must also track the filing + tax side - bigger build, needs Brian.)

**2b. Today, when you place E&S, do you already document the admitted-market declinations anywhere?**
- **A. Yes, we keep declination records** - the system replaces that process.
- **B. Not consistently** - the system introduces it (this is the E&O win; it changes nothing about what I build, just confirms the gap is real).

**ANSWER 2a:**

**ANSWER 2b:**

---

## Question 3 - Are you comfortable letting the insured enter their own data?

The single biggest speed lever in the plan is a client intake portal: you send the business owner a secure, expiring link; they fill in business info, location details, vehicle and driver schedules, payroll, and upload documents; everything they enter is staged for YOUR review and nothing touches the record until an agent confirms it. Same pattern as the document-collection portal you already run.

**Why it matters:** this is Phase 2's headline feature. If you would never send a client a form link, I build those hours into agent-side entry instead.

**Pick one:**
- **A. Yes, build the portal** *(my default)* - tokenized per-submission links, no login, expiring, agent confirms every field.
- **B. Yes, but later** - keep it in the plan, move it to a later phase; Phase 2 focuses on document extraction + Canopy.
- **C. No** - agent-only entry; drop the portal from scope.

**ANSWER:**

---

## Question 4 - Confirm the build order of the five lines

Each line ships as its own complete phase (data + intake UI + ACORD form + bind). The first line built proves the entire lifecycle end to end, so it gets the most scrutiny.

**Why it matters:** the order decides what you can quote-and-bind in the system soonest.

**Pick one:**
- **A. GL, then Commercial Auto, then WC, then Property, then Excess** *(my proposal)* - GL first because it anchors both E&S compliance and COIs; Auto second because it is your largest commercial segment (23 of 57 policies); Excess last because you have zero today and the 131 needs the other lines' data anyway.
- **B. GL, Property, Auto, Excess, WC** - the order from your original request, if that reflects where new business is coming from.
- **C. Another order** - write it in.

**ANSWER:**

---

## Defaults I am running with unless you object

No answer needed - listed so the decision record is complete:

1. **ACORD 75 (binder at bind time):** enhancement track, not v1. Pull it forward if you routinely issue binders.
2. **Coterie live quoting:** enhancement track, behind the existing approval gates.
3. **Old `/acord-forms` pages:** stay as a generic fallback through v1; converge after all six form engines exist.

---

## Reminder - the parallel track that starts now

Regardless of the answers above: source the six licensed ACORD blanks (**125, 126, 140, 127, 130, 131** - current editions, fillable AcroForm) from the ACORD portal, plus the current **FL UM/UIM rejection form**. Same handling as the 25: drop on the Desktop, never committed to git. Nothing else in Phase 0-2 waits on them; only each form's fill step does.
