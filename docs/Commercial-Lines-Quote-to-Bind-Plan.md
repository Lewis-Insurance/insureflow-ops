# Commercial Lines Module - Scope of Work (v2)

**Status:** SCOPE OF WORK FOR REVIEW (v2 - supersedes the v1 plan on this branch)
**Date:** 2026-07-05
**What changed from v1:** v1 was a data + forms plan. v2 adds the layers that make it an agency-grade system: the FL compliance/E&O spine (surplus lines diligent effort, rejection documentation, e-signatures), the client-facing side (intake portal, proposals), market intelligence (appetite registry), post-bind rigor (policy checking), and workflow cadence. Phases re-cut accordingly.
**Owner decisions locked (Landen):** full-lifecycle v1; phased vertical slices; ACORD blanks sourced in parallel; prefill = policy-document extraction + Canopy pull + manual + agent-speed extras.
**Prior art:** the COI/ACORD 25 module (shipped 2026-07). Same discipline throughout: canonical read models, typed form engines with Deno parity, immutable artifacts, provenance-tracked prefill, suggest-then-confirm for every machine write, one branch + one PR per phase.

---

## 1. Verified current state (prod, 2026-07-05)

- **Book:** 2,179 policies; **57 commercial** (Auto 23, GL 15, WC 5, BOP 2, Property 1, Excess 0). 81 business accounts. Commercial carriers include **E&S/wholesale paper: Burlington, USLI, Bass Underwriting** - surplus lines compliance is not hypothetical, it is already how this agency places business.
- **ACORD templates:** the 25 is real (129 fields, licensed, pinned). The 125/126/127/130/140 rows are **Dec-2024 stubs with 0 extracted fields** - unusable. **No 131.** All six commercial blanks need licensed sourcing (parallel track).
- **Canopy commercial:** full schema, **0 rows** (never pulled). `get_canopy_commercial_prefill()` live and ACORD-shaped. Unproven end to end.
- **Quotes:** 3 rows, all personal auto. Scoring engine + `quote_coverages` exist, unused. No commercial structure.
- **Already-owned machinery this plan reuses:** doc-intake OCR + human-confirm pipeline, Dropbox Sign (`esign-create-request` live), public tokenized `DocumentCollectionPortal`, payments module, tasks engine, communications log, relationship graph (affiliated-business edges), retention scoring, CEO digest, `policies.cgl/bap/wc/property/umbrella_details` JSONB that `get_master_coi` reads (bind -> COI-ready same day), Coterie mock integration with approval gates.

---

## 2. Target golden path (v2)

```
PROSPECT/RENEWAL          INTAKE                      PACKET + SIGN               MARKET
x-date or renewal    Prefill (doc extraction,   ACORD 125 + line sections   Appetite registry
timeline opens a     Canopy, Sunbiz, client     built from frozen risk      suggests eligible
submission           portal, book clone) ->     snapshot -> validated ->    markets; E&S requires
                     agent confirms into the    INSURED E-SIGNS (Dropbox    documented admitted
                     canonical risk store       Sign) -> signed packet      declinations
                                                stored                      (diligent effort)
                                                                                  |
BIND + AFTER                        PRESENT                    QUOTE               v
policy write-through (COI-ready),   Branded PROPOSAL w/    Track per-market   Submit packet,
billing capture, offer/rejection    disclaimers + SL       responses, quotes  follow-up cadence,
forms signed (UM, umbrella, WC      notices; client        w/ structured      quote due dates
exemption), then POLICY CHECKING    decision recorded      coverages, scored
(issued policy diffed vs bound)     
        |
        +-> renewal timeline (90/60/30) reopens the loop with everything prefilled
```

Every machine write is staged and human-confirmed (Invariant 4). Every client-facing send is Fence-gated. Every step lands in the account's activity timeline - the E&O file assembles itself.

---

## 3. Architecture

### 3.1 Canonical commercial risk store

Account-scoped, workspace-RLS'd, per-field provenance `src = manual | extracted | canopy | client | book` (manual never machine-overwritten; the COI Section 7 pattern).

- `commercial_profiles` - legal name, DBA, FEIN, entity type, SIC/NAICS, years in business, description of operations, revenue, employee counts, subcontractor use + cost, website. **Named-insured schedule** seeded by relationship-graph suggestions (affiliated_business/owns edges -> "should these be named insureds?").
- `commercial_locations` - address + full COPE, FL-weighted: wind/hail deductible, flood zone, roof age, sprinkler/alarm, building/BPP/BI values.
- `commercial_vehicles` + `commercial_drivers` - fleet (VIN + **VIN-decode enrichment**, GVWR, radius, use, coverages, lienholder) and drivers (license, DOB, MVR summary). Account-level; distinct from personal-lines `lead_auto_*`.
- `commercial_wc_classes` - state/location, class code, payroll, employee counts, x-mod + effective date, **FL exemption records** (who holds a DWC exemption, expiry).
- `commercial_loss_history` - per line/policy year: carrier, claims, paid/reserved, open/closed, valuation date, source doc.
- Column vocabulary mirrors the existing `canopy_*` tables (already ACORD-designed) so the Canopy feeder is a near-straight mapping.

### 3.2 Submission spine + market intelligence

- `commercial_submissions` - account, target lines[], effective date, status (`draft -> intake -> packet_ready -> signing -> marketing -> quoted -> proposed -> bound / lost / abandoned`), producer + CSR assignment, **immutable risk snapshot** frozen at packet generation, renewal linkage (remarket-of).
- `markets` (the appetite registry) - every carrier/MGA/wholesaler the agency can access: lines written, **admitted vs surplus**, appetite class codes, submission email/portal, contacts, appointment status. Intake matches class code + line -> eligible markets. (Absorbs the future-features "Carrier Appointment Tracker".)
- `submission_markets` - one row per market approached: sent_at (Fence-gated email w/ packet, or marked "portal-submitted" with the packet artifact), response (`pending / declined / quoted / blocked`), **declination reason + date (the diligent-effort evidence)**, quote due date, follow-up task hooks.
- **Diligent effort record** - for any E&S placement, the system assembles the declination trail from `submission_markets` into a signed-off diligent-effort artifact attached to the submission. (Filing with FSLSO is normally the wholesaler's duty; documenting the effort is the retail agent's - this makes it automatic.)
- **Offer-and-rejection log** - structured record per submission of coverages offered and declined (umbrella offered/rejected, limits offered vs chosen, FL commercial auto **UM/UIM written rejection**, WC exemption elections). Each generates a signable form routed through e-sign; signed artifacts attach to the account.
- Follow-up cadence: quote due dates, x-date countdowns, and a **90/60/30 renewal timeline** for bound commercial policies, all emitted as tasks through the existing engine (dedupe-keyed, the cancellation-trigger lesson applied).

### 3.3 Documents out: form engines, e-sign, proposals

- **Per-form ACORD engines** for 125, 126, 140, 127, 130, 131 - the acord25 pattern each time: typed field map from the real blank's extracted inventory, deterministic builder from the risk snapshot, validator, preview hash, shared fill, Deno parity port. PII masking schemas are mandatory and real (FEIN on 125/130, DL/DOB on 127): masked in preview, never in the artifact, redacted before any AI touch.
- **Packet generation** - `generate-submission-packet` edge fn fills 125 + selected sections against the frozen snapshot, stores artifacts in a private bucket, logs events.
- **E-signature** - packet routes to the insured via the existing Dropbox Sign integration; signed packet is the submission artifact. Rejection forms (UM, umbrella, exemptions) ride the same rail.
- **Proposal generation** - client-facing branded proposal from the quote set: coverage comparison, premium breakdown incl. E&S taxes/fees where applicable, required disclaimers ("coverage not bound until carrier confirmation"), **surplus lines disclosures** when any option is E&S. Fence-gated delivery. The client's choice is recorded on the submission.
- The old `/acord-forms` pages remain the generic viewer/instance store; engine-backed forms generate through the new builders; stub template rows superseded (never deleted) at real onboarding.

### 3.4 Data in: prefill feeders

All feeders stage suggestions -> agent confirms -> risk store, provenance recorded:

1. **Policy/dec/loss-run upload extraction** - existing OCR chassis + commercial extractor prompts, evidence-linked suggestions, review screen. PII redaction before AI.
2. **Canopy commercial pull** - map `get_canopy_commercial_prefill` output through the same staging. (First step: verify the plan actually returns commercial payloads - 0 rows ever.)
3. **Client intake portal** - tokenized public link (DocumentCollectionPortal pattern): the insured completes business info, location/vehicle/driver schedules, payroll, and uploads docs; lands as `src='client'` staged suggestions. The single biggest speed lever in the plan.
4. **Manual entry** - the intake UI, Calm Command, masked PII inputs, class-code fuzzy pickers (NCCI/GL reference tables), typeable DateFields.
5. **Book/remarket clone** - one click from a bound policy or renewal row: new submission prefilled from the risk store + `get_master_coi`.
6. **FL Sunbiz lookup** - entity name, type, principals, registered agent, document number -> the error-prone 125 fields.
7. **VIN decode** - free NHTSA vPIC API: VIN -> year/make/model/GVWR/body class on fleet entry.
8. **Loss-run requests** - generated LOA + request letter to prior carriers, tracked as tasks; returned loss runs feed feeder #1.
9. *(Later)* AI drafting assists (description of operations, NAICS suggestion) and property enrichment (county appraiser COPE data) - suggestion-only.

### 3.5 Post-bind rigor

- **Bind write-through** - winning quote -> policy row with line detail JSONs populated from snapshot + quote (immediately COI-ready via `get_master_coi`), siblings marked lost, bind event logged, billing captured (agency/direct bill, premium-finance yes/no + finance company, down payment via the existing payments module).
- **Policy checking** - when the carrier-issued policy arrives (upload or Canopy), the extraction pipeline diffs it against the bound quote/binder: limits, deductibles, forms, named insureds, mortgagee/loss-payee. Discrepancy report -> task. Few agencies this size do this; the machinery already exists here.
- **Renewal loop** - bound policies enter the 90/60/30 timeline; remarket clones carry the whole risk profile forward.
- *(Enhancement track)* WC/GL premium-audit season support (audit notice -> doc collection -> payroll/sales package), mid-term endorsement request tracking, ACORD 75 binder issuance, inbound COI tracking for insureds who hire subcontractors.

### 3.6 Measurement

Submission pipeline dashboard (by stage, aging, effective-date risk), **hit ratios by market/line/class code**, quoted-vs-bound premium, declination reasons, E&S vs admitted mix. Feeds the existing CEO digest.

---

## 4. Reuse map (what pulls in where)

| Source | Feeds | Mechanism |
|---|---|---|
| Uploaded policy/dec/loss-run | Risk store | OCR -> extractor -> staged confirm |
| Canopy commercial pull | Risk store | prefill fn -> staged confirm |
| Client portal | Risk store | tokenized intake -> staged confirm (`src='client'`) |
| Sunbiz / VIN decode / class refs | Risk store field-level | lookup -> confirm |
| Bound book + Master COI | New submissions | remarket clone |
| Relationship graph | Named-insured schedule | edge suggestions -> confirm |
| Risk snapshot | ACORD 125/126/140/127/130/131 + rejection forms | per-form builders -> e-sign |
| Quote set | Proposal | proposal builder -> Fence-gated send |
| Winning quote + snapshot | Policy detail JSONs | bind write-through |
| Bound policy | COI module | `get_master_coi` (unchanged) |
| Issued policy doc | Policy checking | extraction -> diff vs bound |
| Submissions + quotes | Analytics / CEO digest | pipeline views |

---

## 5. Phase plan (v2)

Vertical slices; Phase 1 proves the entire lifecycle on GL. Gates per phase: build/lint/vitest green (typecheck not a gate, zero new errors), migrations via MCP `apply_migration`, rolled-back prod validation for RPCs, Calm Command acceptance, PII re-check.

**Parallel track (Landen/Brian, starts now):** source licensed blanks - **125, 126, 140, 127, 130, 131** (current editions, fillable AcroForm) plus, pending decision 2, **ACORD 75** and the **FL UM rejection form** current edition. Same handling as the 25: Desktop drop, never committed, verified + inventoried at onboarding. No phase's data layer or UI blocks on a blank; only the fill step does.

- **Phase 0 - Foundations.** Risk store schema + RLS + provenance; submission spine + `markets` + `submission_markets` + offer/rejection log; `quotes.submission_id`; class-code reference tables; stub-supersede handling. Seed the markets registry from the live carrier list (admitted/E&S flags - Burlington/USLI/Bass marked E&S). *(No blanks.)*
- **Phase 1 - GL vertical slice, compliance-complete.** Intake UI (profile + GL + locations-lite), 125+126 engines, packet generation + **e-sign**, market selection from appetite + Fence-gated submission send, **declination capture + diligent-effort record** (GL is where E&S shows up first), quote capture w/ structured coverages + scoring, **proposal v1** w/ disclaimers + SL disclosures, bind -> `cgl_details` write-through + billing capture-lite -> COI-ready. *(Needs 125+126 for the fill; all else ships without.)*
- **Phase 2 - Prefill at full strength.** Doc extraction (commercial extractor + staged-confirm UI), Canopy pull wiring (after plan verification), **client intake portal**, Sunbiz lookup, book/remarket clone, loss-run LOA workflow. *(No blanks. Highest-leverage phase for speed+accuracy.)*
- **Phase 3 - Commercial Auto.** Fleet/driver store + UI, VIN decode, 127 engine, **FL UM/UIM written-rejection flow** (e-sign), bind -> `bap_details`. Biggest book segment. *(Needs 127.)*
- **Phase 4 - Workers Comp.** Class/payroll/x-mod UI, **FL exemption tracking**, 130 engine, bind -> `wc_details`. FEIN/payroll masking exercised for real. *(Needs 130.)*
- **Phase 5 - Property (+BOP).** Full COPE locations UI (FL wind/flood emphasis), 140 engine, BOP handled as GL+Property packet, bind -> `property_details`. *(Needs 140.)*
- **Phase 6 - Excess + post-bind rigor.** 131 engine w/ underlying-schedule auto-build, **policy checking**, renewal 90/60/30 timeline + remarket loop, pipeline analytics + hit ratios, umbrella offer/rejection defaults on every submission, backfill of the 57-policy commercial book (one afternoon of confirms). *(Needs 131.)*
- **Enhancement track (post-v1, separately approved):** Coterie live quoting behind the existing approval gates; premium finance + invoicing w/ E&S tax/fee calc; WC/GL premium-audit support; mid-term endorsement tracking; ACORD 75 binder; property enrichment; inbound COI tracking for insureds with subcontractors; commission tracking.

---

## 6. Risks and dependencies

1. **Blank sourcing** - only hard external dependency; per-phase fallbacks stated. 131 and (if in scope) 75 + UM form have no existing rows at all.
2. **Canopy commercial unproven** (0 rows ever) - Phase 2 verifies before relying; degrades to extraction + portal + manual.
3. **Compliance correctness** - diligent-effort and rejection-form requirements must be validated against current FL statute/FSLSO guidance during Phase 1 build (I verify against primary sources; Brian confirms agency practice). The system makes documentation automatic; it does not practice law.
4. **PII surface** (FEIN, DLs, DOBs, payroll, now also client-submitted) - masking, redaction-before-AI, RLS, private buckets, tokenized portal with expiry; re-checked every phase.
5. **Scope discipline** - v2 is wider than v1; the vertical-slice cut keeps each phase shippable. Anything that slips lands in the enhancement track, not in a half-built phase.
6. **Typecheck debt** unchanged: not a gate, zero new errors per phase.

## 7. Open decisions (defaults chosen; correct me where wrong)

1. **Packet delivery** - default: both. Fence-gated email per market where you email submissions; "mark portal-submitted" with artifact attach where you use carrier portals.
2. **ACORD 75 binder** - default: enhancement track, revisit at Phase 6. Pull forward if you issue binders routinely at bind.
3. **Coterie live** - default: enhancement track (approval-gated), not v1.
4. **Old `/acord-forms` UI** - default: coexist through v1, converge after all six engines exist.
5. **Phase order** - default: GL -> Auto -> WC -> Property -> Excess (book-weighted; GL is the E&S + COI anchor).
6. **Surplus lines path** - default assumption: E&S placements go through wholesalers (Bass et al.) who handle FSLSO filing; the system documents diligent effort and disclosures regardless. Confirm this matches practice.
7. **Client portal exposure** - default: tokenized per-submission links (no login), expiring, PII-masked review before commit. Confirm you are comfortable with client self-entry at all; it can ship later without blocking anything.
