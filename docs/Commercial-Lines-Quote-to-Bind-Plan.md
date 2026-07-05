# Commercial Lines Module - Quote-to-Bind Plan

**Status:** PLAN FOR REVIEW (not locked)
**Date:** 2026-07-05
**Owner decisions locked (Landen):** full-lifecycle v1; phased build, one line per phase; ACORD blanks sourced in parallel; prefill = policy-document extraction + Canopy commercial pull + manual entry + agent-speed extras.
**Prior art:** the COI/ACORD 25 module (docs/COI Module/coi-module/, Phases 0-6 shipped 2026-07). This plan deliberately reuses its architecture: canonical read models, typed form engines with Deno parity, immutable outputs, provenance-tracked prefill, one branch + one PR per phase.

---

## 1. Verified current state (all facts checked against prod 2026-07-05)

**The book.** 2,179 policies; **57 commercial** (2.6%): Commercial Auto 23, GL/CGL 15, WC 5, BOP 2, Property 1, Inland Marine 1, other 5, **Excess/Umbrella 0**. 81 business accounts. Top commercial carriers: Progressive (22), Coterie (7), Southern-Owners (5), Auto-Owners, Burlington, Attune, Bass Underwriting, Pie, USLI.

**Quotes.** 3 quote rows in prod, all personal auto, status `open` only. The `quotes` table already carries the scoring engine (price/coverage/carrier/deductible/value/limit-adequacy scores + weight profiles) and a `quote_coverages` child table (coverage_type, limit, deductible, premium) - both essentially unused. No structured commercial detail anywhere in quoting.

**Canopy commercial.** Schema is fully built and empty: `canopy_business_locations`, `canopy_commercial_vehicles`, `canopy_payroll`, `canopy_business_operations`, `canopy_drivers`, `canopy_named_insureds`, `canopy_policy_coverages` - **0 rows each** (no commercial pull has ever run). `get_canopy_commercial_prefill(pull_id)` exists on prod and already returns **ACORD-shaped JSONB keyed acord_125 / acord_126 / acord_127 / acord_130 / acord_140**.

**ACORD templates.** `acord_templates` has 6 rows. The 25 is the real, licensed, onboarded blank (129 extracted fields, pinned sha, license notes). The 125/126/127/130/140 rows are **Dec-2024 metadata stubs with field_count 0** - they are NOT usable blanks and must be superseded by genuine licensed PDFs onboarded through the 25's ingestion pipeline. **No 131 row at all.**

**Form infrastructure.** The Dec-2024 pages survive (`/acord-forms`, AcordTemplates.tsx, AcordFormEdit.tsx, pdfFiller.ts, templateIngestion.ts) and the ingestion pipeline is form-number-agnostic (XFA detection, AcroForm extraction, versioning, is_current pinning). The ACORD 25 engine (`src/lib/acord/acord25/`: typed field map, deterministic builder, validator, preview hash, masking pipeline, Deno parity port via `scripts/acord25/sync-deno-port.ts`) is the proven pattern to replicate per form. The preview masking pipeline was built form-agnostic and is a no-op for the 25; forms 125/127/130 carry real PII (FEIN, driver license numbers, DOBs) and will exercise it for real.

**Coterie.** Mock-only integration (BOP/GL/PL quote shapes, `coterie_quotes` table, approval gates with separation of duties) - no live API, not wired to any client-facing flow.

**Policies.** `policies` already has per-line commercial detail columns (`cgl_details`, `bap_details`, `wc_details`, `property_details`, `umbrella_details` JSONB + `*_field_evidence` provenance) which `get_master_coi` reads. Bound results that land here are immediately COI-ready.

**Doc intake.** OCR + extraction pipeline exists (`process-document-tasks`, `document_insights` human-confirm loop, PII redaction before AI, `extract-*-policy` edge fns) - the chassis for policy-upload prefill.

---

## 2. Target golden path (v1, full lifecycle)

```
INTAKE                     SUBMIT                    QUOTE                     BIND
Prefill sources ->    ACORD packet (125 +      Record carrier quotes    Winning quote ->
canonical risk        line sections) filled    against the submission,  policy row (commercial
profile, agent        from the risk profile,   structured limits in     detail JSONs written
confirms/completes    validated, emailed to    quote_coverages,         through), bind event,
in the intake UI      carrier/MGA (Fence-      scored + compared        risk profile linked;
                      gated send)                                       COI-ready on day one
                                                                        (get_master_coi)
        ^                                                                      |
        +------------------- renewal / remarket prefills from the bound book <-+
```

Every arrow is human-confirmed. Machine sources (extraction, Canopy, AI) only ever stage suggestions (Invariant 4).

---

## 3. Architecture

### 3.1 Canonical commercial risk store (the spine)

One set of account-scoped, workspace-RLS'd tables that everything downstream reads. Canopy tables are a **source**, not the store.

- `commercial_profiles` - one per business account: legal name, DBA, FEIN, entity type, SIC/NAICS, years in business, description of operations, annual revenue, employee counts, subcontractor use, website/contacts.
- `commercial_locations` - address + COPE (construction, occupancy, protection, exposure: year built, sq ft, stories, sprinkler, alarm, roof/wiring/plumbing/HVAC update years, building/BPP/BI values, deductibles incl. wind/hail - Florida matters, flood zone).
- `commercial_vehicles` + `commercial_drivers` - fleet (VIN, GVW, radius, use, cost new, coverages, lienholder) and drivers (license, DOB, MVR summary), account-level (NOT the personal-lines `lead_auto_*`).
- `commercial_wc_classes` - per state/location: class code, description, employee count, payroll, x-mod + effective date.
- `commercial_loss_history` - per line: date, carrier, description, amount paid/reserved, open/closed, source (loss run doc).
- Every field-bearing row carries **provenance** per the COI Section 7 pattern: `src` in `manual | extracted | canopy | book`, with `manual` never overwritten by machine writes.

Schema note: mirror the `canopy_*` column vocabulary where it exists (it was already designed against the ACORD forms) so the Canopy feeder is nearly a straight mapping.

### 3.2 Submission spine

- `commercial_submissions` - account + workspace + target lines[] + status (`draft -> packet_ready -> submitted -> quoting -> bound / lost / abandoned`) + an immutable **risk snapshot** frozen at packet generation (same discipline as certificate snapshots: what you sent the carrier is what you can prove you sent).
- `submission_carriers` - one row per market approached: carrier/MGA, sent_at (Fence-gated email with the packet attached), response status, decline reason.
- Quotes gain `submission_id` (nullable FK; personal-lines quotes unaffected). Structured limits go in the existing `quote_coverages`. Scoring engine reused as-is.
- **Bind** promotes the winning quote: writes the policy row with the line detail JSONs (`cgl_details` etc.) populated from the risk snapshot + quote, links `submission_id`, logs a bind event, marks siblings lost. Because it writes the same columns `get_master_coi` reads, **a policy bound today can issue a COI today**.

### 3.3 Form engines (one per ACORD form, the 25's pattern)

For each of 125, 126, 140, 127, 130, 131: `src/lib/acord/acord<N>/` with typed field map (from the real blank's extracted inventory), deterministic `build<N>FieldValues` (risk profile -> field values), `validate<N>` (form-specific rules), shared preview hash, shared fill (`fillAcordPdf`), Deno parity port (extend `sync-deno-port.ts`). PII masking schemas are **mandatory and real** for 125 (FEIN), 127 (driver DL/DOB), 130 (FEIN, payroll): mask in preview, never in the generated artifact, redact before any AI touch.

Packet generation = one server-side edge fn (`generate-submission-packet`) that fills 125 + the selected line sections against the frozen snapshot, stores artifacts in a private bucket, logs events - the `generate-certificate` shape, minus the per-certificate immutability chain (packets are per-submission-revision instead).

The old `/acord-forms` pages remain the generic viewer/instance store (`acord_forms`); generation for engine-backed forms routes through the new builders. The stub template rows get superseded, not deleted (version history).

### 3.4 Prefill feeders (the speed-and-accuracy layer)

All feeders write **staged suggestions -> agent confirms -> canonical store**, field-level provenance recorded:

1. **Policy/dec-page upload extraction** (Landen: "100% needs"): upload expiring policy, dec page, loss run, or expiring ACORD app -> existing OCR chassis + new commercial extractor prompts -> staged field suggestions with source-page evidence -> review screen -> accept into the risk store. PII redaction before AI per the standing policy.
2. **Canopy commercial pull** (Landen: "100% needs"): run the existing commercial pull for the account, map `get_canopy_commercial_prefill` output into the same staging flow. (Verify the Canopy plan actually returns commercial payloads - tables have 0 rows today, so this path is untested end to end.)
3. **Manual entry**: the intake UI itself, Calm Command, per-line sections, DateField/masked SSN-FEIN inputs, tabular figures.
4. **Existing book / Master COI** (my add): renewals and remarketing start from the bound policy + `get_master_coi` - one click "remarket this policy" clones a submission prefilled from what we already know.
5. **FL Sunbiz lookup** (my add): entity search against the FL Division of Corporations for legal name, entity type, principal address, officers, registered agent, document number - kills the most error-prone 125 fields. Server-side fetch + confirm.
6. **Class-code helpers** (my add): reference tables for WC class codes and GL class codes with fuzzy search, so agents pick codes instead of typing them.
7. **AI drafting assists** (my add, later): description-of-operations drafts, NAICS suggestions from the website/description - suggestion-only, always confirmed.
8. **Property enrichment** (my add, enhancement track): FL county property appraiser / third-party data for COPE fields (year built, construction, sq ft) keyed off the address.

### 3.5 What pulls in where (the reuse map)

| Source | Feeds | Mechanism |
|---|---|---|
| Uploaded policy/dec/loss-run | Risk store (all lines) | OCR -> extractor -> staged confirm |
| Canopy commercial pull | Risk store (ops, locations, fleet, drivers, payroll, coverages) | `get_canopy_commercial_prefill` -> staged confirm |
| Bound book + Master COI | New submissions (renewal/remarket) | clone-with-prefill |
| Risk store snapshot | ACORD 125/126/140/127/130/131 | per-form builders |
| Risk store + quote | Bound policy detail JSONs | bind write-through |
| Bound policy | ACORD 25 / COI module | `get_master_coi` (existing, unchanged) |
| Risk store contacts/holders | Additional Insureds directory | existing module, unchanged |

---

## 4. Phase plan

Vertical-slice strategy: **Phase 1 proves the entire lifecycle on GL alone** (smallest end-to-end loop), then each later phase adds a line to a working pipeline. One branch + one PR per phase; gates per phase: build green, lint green, vitest green (typecheck not a gate, add zero new errors), migrations applied via MCP `apply_migration`, rolled-back prod validation for RPCs, Calm Command acceptance for UI.

**Parallel track (Landen/Brian, starts now): source the six licensed blanks** from the ACORD portal - 125, 126, 140, 127, 130, 131, current editions, fillable AcroForm, FL-appropriate. Same handling as the 25: drop on Desktop, never committed to git, verified genuine + field-inventoried at onboarding. Each phase that needs a blank has a stated fallback (build engine against the extracted inventory the moment the blank lands; data layer and UI never block on it).

- **Phase 0 - Foundations.** Canonical risk store schema + RLS + provenance; `commercial_submissions` + `submission_carriers`; `quotes.submission_id`; supersede-stub handling in template onboarding; class-code reference tables. No UI beyond stubs. *(No blanks needed.)*
- **Phase 1 - GL vertical slice.** Intake UI (profile + GL exposures + locations-lite), 125 + 126 engines + packet generation + Fence-gated packet email, quote capture with structured `quote_coverages` + scoring, compare view, bind -> policy write-through (`cgl_details`) -> COI-ready. *(Needs 125 + 126 blanks; everything but the fill ships without them.)*
- **Phase 2 - Prefill feeders.** Policy-upload extraction (commercial extractor + staged-confirm UI) and Canopy commercial pull wiring, both into the Phase 0 store; Sunbiz lookup; book/remarket clone. *(No blanks needed - highest-leverage phase for the speed goal.)*
- **Phase 3 - Commercial Auto.** Fleet + drivers store UI, 127 engine, packet integration, bind -> `bap_details`. Biggest book segment (23 policies). *(Needs 127.)*
- **Phase 4 - Workers Comp.** Class/payroll/x-mod UI, 130 engine, bind -> `wc_details`. FEIN/payroll masking exercised for real. *(Needs 130.)*
- **Phase 5 - Property.** Full COPE locations UI (FL wind/flood emphasis), 140 engine, bind -> `property_details`. *(Needs 140.)*
- **Phase 6 - Excess/Umbrella + polish.** 131 engine, underlying-schedule auto-build from bound lines, packet completion, renewal remarket loop hardening, backfill sweep of the 57-policy commercial book into risk profiles (small: one afternoon of confirms). *(Needs 131.)*
- **Enhancement track (post-v1, separately approved):** Coterie live quoting (BOP/GL, behind the existing approval gates), property enrichment, loss-run analytics, ACORD 75 binder generation.

Suggested order rationale: GL first because it is the submission workhorse and the COI anchor; Auto second because it is the largest actual book segment; WC third (small but always paired with GL for contractors); Property fourth (one policy today); Excess last (zero today, and 131 depends on the other lines' data for the underlying schedule).

---

## 5. Risks and dependencies

1. **Blank sourcing is the only hard external dependency.** Mitigated by the parallel track + per-phase fallbacks. The 131 has no stub row at all.
2. **Canopy commercial pull is unproven** (0 rows ever). Phase 2 must first verify the agency's Canopy plan returns commercial payloads; if not, the feeder degrades gracefully to extraction + manual.
3. **PII surface grows materially** (FEIN, DLs, DOBs, payroll). Mitigations already built: masking pipeline, redaction-before-AI, workspace RLS, private buckets; each phase's review re-checks them.
4. **Form editions change.** The template versioning/pinning system handles supersession; builders pin to a template sha exactly like the 25 (V9 gate).
5. **Old form pages ambiguity.** Decision below; default is coexist-then-converge, no demolition in v1.
6. **Typecheck debt** unchanged: not a gate, zero new errors per phase.

## 6. Open decisions (need answers, none block Phase 0)

1. **Packet delivery**: email to carrier/MGA from inside the app (Fence-gated, like COI email) - confirm this is how you actually submit today (vs. carrier portals, where the deliverable is just the PDF download).
2. **ACORD 75 (binder)** in scope for the bind step, or out for v1? (Currently: out.)
3. **Coterie live**: enhancement track (current plan) or pulled into v1?
4. **Old `/acord-forms` UI**: keep as generic fallback (current plan) or retire once all six engines exist?
5. **Phase order confirmation**: GL -> Auto -> WC -> Property -> Excess (proposed above; trivially reorderable).
