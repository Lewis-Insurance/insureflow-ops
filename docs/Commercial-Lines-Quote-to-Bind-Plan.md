# Commercial Lines Module - Scope of Work (v3, LOCKED)

**Status:** SCOPE LOCKED - Landen's answers 2026-07-05 (see `docs/Commercial-Lines-Open-Decisions.md`). Phase 0 in progress.
**Date:** 2026-07-05
**What changed from v2:**
- **No market registry, no appetite matching, no per-market submission routing/tracking** (Landen Q1). Replaced by ONE universal packet action: assemble the packet with a cover page, then one-click email (Fence-gated + logged, like COI email) or print/download PDF.
- **Direct-carrier COI path promoted to co-primary deliverable** (Landen Q1 scope addition): the commercial data layer also fills policy details on admitted business (Nationwide etc.) so COIs issue through the existing COI module with no submission involved. "The COI side is the bigger half of the value."
- **Diligent-effort documentation confirmed IN scope** (Q2b: declinations are not consistently documented today - build it): a lightweight declination log per submission, free-text carrier names, generating the diligent-effort artifact. Wholesaler remains agent of record and handles FSLSO filing (Q2a).
- **Client intake portal confirmed** (Q3).
- **Phase order changed to GL -> Property -> WC -> Excess -> Business Auto** (Q4, deliberate: Auto last despite being the largest segment; 131 umbrella accepts manual underlying-schedule entry until Auto ships).
- Defaults accepted: ACORD 75 = enhancement track; Coterie live = enhancement track; old `/acord-forms` pages coexist through v1.

**Prior art:** the COI/ACORD 25 module (shipped 2026-07). Same discipline throughout: canonical read models, typed form engines with Deno parity, immutable artifacts, provenance-tracked prefill, suggest-then-confirm for every machine write, Fence-gated client sends, one branch + one PR per phase.

---

## 1. Verified current state (prod, 2026-07-05)

- **Book:** 2,179 policies; **57 commercial** (Auto 23, GL 15, WC 5, BOP 2, Property 1, Excess 0). 81 business accounts. E&S/wholesale paper already present (Burlington, USLI, Bass Underwriting); admitted/direct commercial (Progressive, Auto-Owners/Southern-Owners, etc.) is the larger count.
- **ACORD templates:** the 25 is real (129 fields, licensed, pinned). The 125/126/127/130/140 rows are **Dec-2024 stubs with 0 extracted fields** - unusable. **No 131.** All six commercial blanks need licensed sourcing (parallel track).
- **Canopy commercial:** full schema, **0 rows** (never pulled). `get_canopy_commercial_prefill()` live and ACORD-shaped. Unproven end to end.
- **Quotes:** 3 rows, all personal auto. Scoring engine + `quote_coverages` exist, unused.
- **Already-owned machinery this plan reuses:** the COI module end to end (`get_master_coi` reads `policies.cgl/bap/wc/property/umbrella_details`), doc-intake OCR + human-confirm pipeline, Dropbox Sign, public tokenized `DocumentCollectionPortal` pattern, payments module, tasks engine, communications log, relationship graph, retention scoring, CEO digest, Coterie mock integration.

---

## 2. The two golden paths (v3)

**Path A - direct/admitted carriers (the bigger half): policy details in, COI out.**

```
Existing or new admitted policy (Nationwide, Auto-Owners, Progressive...)
   -> line detail editor fills the policy's commercial details
      (prefill: doc extraction / Canopy / client portal / manual; agent confirms)
   -> writes policies.cgl/bap/wc/property/umbrella_details w/ provenance
   -> get_master_coi readiness turns green
   -> COI issued through the existing certificate module, same day
```

**Path B - E&S submissions: intake -> packet -> sign -> send -> quote -> bind.**

```
Submission opened (new business or remarket)
   -> prefill into the canonical risk store, agent confirms
   -> ACORD 125 + line sections built from a frozen risk snapshot + COVER PAGE
   -> insured e-signs (Dropbox Sign)
   -> UNIVERSAL SEND: one-click email to the wholesaler (Fence-gated, logged)
      or print/download            
   -> admitted declinations recorded as they come -> diligent-effort artifact
   -> quotes recorded (structured coverages, scored) -> branded proposal w/
      disclaimers + SL disclosures -> client decision recorded (offer/rejection log)
   -> bind: policy row written through (COI-ready immediately, Path A takes over)
```

Both paths share the same risk store, the same prefill feeders, and the same line detail editors. Every machine write is staged and human-confirmed (Invariant 4). Every client-facing send is Fence-gated. Every step lands in the account's activity timeline.

---

## 3. Architecture

### 3.1 Canonical commercial risk store

Account-scoped, workspace-RLS'd, per-field provenance `src = manual | extracted | canopy | client | book` (manual never machine-overwritten; the COI Section 7 pattern).

- `commercial_profiles` - legal name, DBA, FEIN, entity type, SIC/NAICS, years in business, description of operations, revenue, employee counts, subcontractor use + cost, website, WC x-mod + effective date. Named-insured schedule seeded by relationship-graph suggestions.
- `commercial_locations` - address + full COPE, FL-weighted (wind/hail deductible, flood zone, roof/wiring/plumbing/heating update years, sprinkler/alarm, building/BPP/BI values).
- `commercial_vehicles` + `commercial_drivers` - fleet (VIN + VIN-decode enrichment, GVWR, radius, use, deductibles, lienholder, garaging location) and drivers (license, DOB, MVR summary). Account-level; distinct from personal-lines `lead_auto_*`.
- `commercial_wc_classes` + `commercial_wc_exemptions` - class/payroll rows per state/location; FL exemption records (holder, number, expiry).
- `commercial_loss_history` - per-claim rows per line: carrier, period, date of loss, paid/reserved, status, valuation date, source doc.
- Column vocabulary mirrors the existing `canopy_*` tables so the Canopy feeder is a near-straight mapping.

### 3.2 Line detail editors + the direct-carrier COI path (Path A)

One reusable **line detail editor** per line (GL, Property, WC, Excess, Auto), reading/writing the risk store, used in three places: the submission intake, the client-portal review screen, and **directly against a policy**. "Apply to policy" writes the line's details into the policy's `*_details` JSONB with field provenance - the exact columns `get_master_coi` reads - so an admitted policy becomes COI-ready without any submission, packet, or quote. This ships **per line, in the same phase as that line's ACORD engine**, and is the primary deliverable of each line phase.

### 3.3 Submission spine (Path B)

- `commercial_submissions` - account, target lines[], effective date, status (`draft -> intake -> packet_ready -> signing -> submitted -> quoted -> proposed -> bound / lost / abandoned`), producer/CSR, wholesaler name + email (free text - **no market registry**), immutable **risk snapshot** frozen at packet generation, remarket linkage.
- `submission_events` - the audit trail (packet built, sent, signed, declination recorded, proposal sent, bound), mirrored into the account activity timeline.
- `submission_declinations` - the diligent-effort feature (Q2b): free-text carrier name, date, reason per admitted declination; the system assembles these into a **diligent-effort artifact** attached to any E&S placement. No routing, no registry - just the E&O record.
- **Offer-and-rejection log** - coverages offered and declined (umbrella offered/rejected, limits offered vs chosen, FL commercial auto UM/UIM written rejection, WC exemption elections), each generating a signable form via e-sign; signed artifacts attach to the account.
- Follow-up cadence: simple task hooks (packet awaiting signature, quote follow-up, effective-date countdown) plus the **90/60/30 renewal timeline** on bound commercial policies - all through the existing tasks engine, dedupe-keyed.

### 3.4 Documents out: packet, e-sign, proposal

- **Per-form ACORD engines** for 125, 126, 140, 130, 131, 127 (build order) - the acord25 pattern each time: typed field map from the real blank's inventory, deterministic builder from the risk snapshot, validator, preview hash, shared fill, Deno parity port. PII masking real for 125/130 (FEIN) and 127 (DL/DOB): masked in preview, never in the artifact, redacted before any AI touch.
- **Packet generation** - `generate-submission-packet` edge fn: **agency-branded cover page** (insured, lines, effective date, agency contact) + 125 + selected sections, built from the frozen snapshot, stored in a private bucket, event-logged.
- **Universal send** - ONE action, two outputs: (1) one-click email of the signed packet to the wholesaler address on the submission - Fence-gated (server-minted approval bound to submission + recipient), logged, exactly the COI email pattern; (2) download/print. Nothing else. No per-market routing.
- **E-signature** - packet routes to the insured via the existing Dropbox Sign integration before sending; rejection forms ride the same rail.
- **Proposal generation** - client-facing branded proposal from the quote set: comparison, premium incl. E&S taxes/fees, "not bound until carrier confirmation" disclaimers, **surplus lines disclosures** when any option is E&S. Fence-gated delivery; client decision recorded.
- The old `/acord-forms` pages remain the generic viewer/instance store; stub template rows superseded (never deleted) at real onboarding.

### 3.5 Data in: prefill feeders

All feeders stage suggestions -> agent confirms -> risk store, provenance recorded. They serve BOTH paths (a direct-carrier policy fill uses the same feeders as a submission intake):

1. **Policy/dec/loss-run upload extraction** - existing OCR chassis + commercial extractor prompts, evidence-linked suggestions, review screen. PII redaction before AI. For Path A this is the headline: *upload the Nationwide policy, confirm the extracted details, issue the COI*.
2. **Canopy commercial pull** - `get_canopy_commercial_prefill` through the same staging (verify the plan returns commercial payloads first - 0 rows ever).
3. **Client intake portal** (confirmed Q3) - tokenized, expiring public link; insured completes business info, schedules, payroll, uploads docs; lands as `src='client'` staged suggestions.
4. **Manual entry** - the editors themselves; Calm Command; masked PII inputs; class-code fuzzy pickers.
5. **Book/remarket clone** - one click from a bound policy or renewal row.
6. **FL Sunbiz lookup** - entity name/type/principals/registered agent -> the error-prone 125 fields.
7. **VIN decode** - free NHTSA vPIC on fleet entry.
8. **Loss-run requests** - generated LOA + request letter, tracked as tasks; returns feed feeder #1.
9. *(Later)* AI drafting assists; county-appraiser COPE enrichment - suggestion-only.

### 3.6 Post-bind rigor

- **Bind write-through** (Path B -> Path A): winning quote -> policy row with line detail JSONs from snapshot + quote, siblings lost, bind event, billing capture-lite (bill type, finance y/n + company, down payment via payments module).
- **Policy checking** - issued policy (upload or Canopy) diffed against the bound quote: limits, deductibles, forms, named insureds. Discrepancy report -> task.
- **Renewal loop** - 90/60/30 timeline; remarket clones carry the full risk profile.
- *(Enhancement track)* premium-audit support, mid-term endorsement tracking, ACORD 75, inbound COI tracking for insureds with subs, premium finance/invoicing w/ tax calc, commission tracking, Coterie live.

### 3.7 Measurement

Submission pipeline view (stage, aging, effective-date risk), quoted-vs-bound premium, declination reasons, E&S vs admitted mix, **COIs issued off Path A**. Feeds the CEO digest. (Hit-ratio-by-market analytics dropped with the registry; declination stats remain.)

---

## 4. Reuse map

| Source | Feeds | Mechanism |
|---|---|---|
| Uploaded policy/dec/loss-run | Risk store | OCR -> extractor -> staged confirm |
| Canopy commercial pull | Risk store | prefill fn -> staged confirm |
| Client portal | Risk store | tokenized intake -> staged confirm (`src='client'`) |
| Sunbiz / VIN decode / class refs | Risk store fields | lookup -> confirm |
| Bound book + Master COI | New submissions | remarket clone |
| Relationship graph | Named-insured schedule | edge suggestions -> confirm |
| Risk store | **Direct policy details (Path A)** | line editor "apply to policy" write-through |
| Risk snapshot | ACORD packet + rejection forms | per-form builders -> e-sign -> universal send |
| Quote set | Proposal | proposal builder -> Fence-gated send |
| Winning quote + snapshot | Policy details (bind) | bind write-through |
| Policy details | COI module | `get_master_coi` (existing, unchanged) |
| Issued policy doc | Policy checking | extraction -> diff vs bound |

---

## 5. Phase plan (v3, order locked)

Vertical slices; every line phase ships BOTH paths for its line (submission packet + direct-policy COI fill). Gates per phase: build/lint/**vitest** green (CI does not run vitest - run locally; typecheck not a gate, zero new errors), migrations via MCP `apply_migration`, rolled-back prod validation for RPCs, Calm Command acceptance, PII re-check.

**Parallel track (Landen/Brian, starts now):** source licensed blanks - **125, 126, 140, 130, 131, 127** (current editions, fillable AcroForm) + the current **FL UM/UIM rejection form**. Desktop drop, never committed. Only each form's fill step waits on its blank.

- **Phase 0 - Foundations.** Risk store schema + RLS + provenance; submission spine (submissions, events, declinations, offer/rejection log); `quotes.submission_id`; class-code reference tables; workspace-autofill tenancy guards. *(No blanks. No UI beyond what later phases mount.)*
- **Phase 1 - GL vertical slice, both paths.** GL line detail editor; **direct-policy GL fill -> COI-ready (Path A)**; 125+126 engines; packet w/ cover page; e-sign; universal send; declination log + diligent-effort artifact; quote capture w/ structured coverages + scoring; proposal v1; bind write-through + billing capture-lite. *(Fill step needs 125+126.)*
- **Phase 2 - Prefill at full strength.** Commercial doc extraction + staged-confirm UI (Path A headline: policy upload -> confirm -> COI); Canopy pull wiring (after verification); **client intake portal**; Sunbiz; book/remarket clone; loss-run LOA. *(No blanks. Highest-leverage phase.)*
- **Phase 3 - Property (+BOP).** COPE locations editor; direct-policy property fill; 140 engine; BOP as GL+Property packet. *(Needs 140.)*
- **Phase 4 - Workers Comp.** Class/payroll/x-mod editor; FL exemption tracking; direct-policy WC fill; 130 engine. FEIN/payroll masking real. *(Needs 130.)*
- **Phase 5 - Excess/Umbrella.** 131 engine; underlying schedule built from bound GL/Property/WC lines **with manual entry for auto underliers until Phase 6** (accepted Q4); direct-policy umbrella fill. *(Needs 131.)*
- **Phase 6 - Business Auto + closing rigor.** Fleet/driver editors; VIN decode; 127 engine; **FL UM/UIM written-rejection flow**; direct-policy auto fill; auto underliers wired into 131; **policy checking**; renewal 90/60/30 timeline; pipeline measurement; backfill of the 57-policy commercial book. *(Needs 127.)*
- **Enhancement track (post-v1, separately approved):** Coterie live (approval-gated), premium finance + invoicing w/ tax/fee calc, WC/GL premium-audit support, mid-term endorsements, ACORD 75, property enrichment, inbound COI tracking, commission tracking.

---

## 6. Risks and dependencies

1. **Blank sourcing** - only hard external dependency; per-phase fallbacks stated. 131 has no existing row at all.
2. **Canopy commercial unproven** (0 rows ever) - Phase 2 verifies before relying; degrades to extraction + portal + manual.
3. **Compliance correctness** - diligent-effort record content and the FL UM form edition verified against primary sources at build time; Brian confirms agency practice. The system automates documentation; it does not practice law.
4. **PII surface** (FEIN, DLs, DOBs, payroll, client-submitted data) - masking, redaction-before-AI, RLS, private buckets, tokenized portal expiry; re-checked every phase.
5. **Path A/Path B coherence** - the line editors must stay the single source for both paths; a fork here doubles maintenance forever. Architecture review each line phase.
6. **Typecheck debt** unchanged: not a gate, zero new errors per phase.

## 7. Decisions (RESOLVED 2026-07-05 - see Commercial-Lines-Open-Decisions.md)

1. Packet delivery: **universal action** (one-click Fence-gated email OR print/download). No registry, no routing, no tracking.
2. Direct-carrier COI fill: **co-primary deliverable**, ships per line phase.
3. Surplus lines: wholesaler is agent of record + files FSLSO; system documents **diligent effort (build it) + disclosures**.
4. Client portal: **build it** (Phase 2).
5. Order: **GL -> Property -> WC -> Excess -> Business Auto** (deliberate).
6. ACORD 75 / Coterie live / old `/acord-forms`: defaults accepted (enhancement / enhancement / coexist).
