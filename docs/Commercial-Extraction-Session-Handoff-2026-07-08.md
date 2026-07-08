# Commercial Document Extraction — Session Handoff (2026-07-08)

> **Purpose:** hand a fresh session everything needed to continue this workstream without re-deriving. Read this top-to-bottom first, then verify any code claim against the live repo/prod before acting (memories/handoffs are point-in-time).

**Branch:** `claude/policy-document-parsing-b604eb` (worktree). **PR:** [#81](https://github.com/Lewis-Insurance/insureflow-ops/pull/81) (open, base `main`).
**Supabase project:** `lrqajzwcmdwahnjyidgv`. **Prod URL:** lewisinsurance.netlify.app (frontend served from `main`).
**Related memory:** `policy-extraction-ingest` (auto-memory), plus `commercial-lines-module`, `coi-acord25-testing-prep`, `coi-winpc-stack-live`, `edge-function-deploy-verify-jwt`, `prod-migration-apply-mechanism`.

---

## 1. Objective & the product vision (from Landen)

Improve document upload so the system properly imports **all** policy + customer info, especially **commercial coverages** that feed the recently-built **ACORD 25 / Master COI** generator. Two target features:

1. **Rich Add-Policy popup** — when adding a policy of an ACORD-25 line (GL / Commercial Auto / Umbrella-Excess / WC), the full coverage fields shown in "View full policy" appear in the add popup, captured at creation. Manual type-select OR extraction-detected type expands the popup. Dropping a dec page **auto-fills empty fields only**. Captures **everything the ACORD 25 captures** (pay basis, blanket endorsements, auto symbols, WC per-statute, etc.).
2. **Verify Policy** — a button on the customer page opens a large modal: drag/drop a document + pick an existing policy → extract → **side-by-side** of current-system vs. extracted (coverages + customer identity + policy core), normalized, with **per-field Accept** (confirm before write, manual never silently overwritten).

**Key locked decisions:**
- ACORD 25 has **4 named sections** (GL, Commercial Auto, Umbrella/Excess, WC) + a **generic "OTHER" section** for any other line. **Property is NOT its own ACORD 25 section** — it goes in the OTHER row (`property_details.coi_summary.*`).
- **P&NC (Primary & Non-Contributory):** not an ACORD 25 column. It becomes a **per-line selector** on the customer/policy page (beside ADDL INSD / SUBR WVD); when ON, generating a COI **seeds editable default language into the Description of Operations** (user can edit/delete).
- **Verify = apply per-field.** Add-screen customer data = auto-fill empty only.
- **VIN = honor the last-6 PII policy** (do NOT send full VINs to the model).

**Agency rules to keep encoded** (from `docs`-referenced handoff on Landen's Desktop, `ACORD_25_Extraction_Handoff.md` — advice, NOT committed): never capture/prefill **premium** anywhere; insurer **NAIC (5-digit) ≠ industry NAICS/SIC**; **producer-block contamination** — ingesting a competitor's COI must never overwrite agency producer defaults (Lewis & Lewis / Brian Lewis FL A154707); **blanket = evidence** (basis blanket|scheduled + form numbers CG2033/2038 blanket, CG2010/2037 scheduled, CG2404 GL waiver, WC000313), never fabricate a "Y" at extraction; Description of Ops blank unless supplied; immutable cert snapshots.

---

## 2. What's DONE and LIVE on prod (this session)

The **extraction backend** is reworked, deployed, and proven live. All 5 `extract-{cgl,bap,wc,property,umbrella}-policy` edge functions are deployed (via `supabase functions deploy --use-api`, `verify_jwt=true` preserved).

- **COI-path normalization:** extractors write the exact `coi_field_registry` JSONB paths + flat-dotted `<line>_field_evidence` that `get_master_coi` reads. Root cause of the original bug: only GL was aligned; Auto/WC/Property/Umbrella wrote shapes the COI ignored (extraction "succeeded" but coverages showed empty). BAP/WC/Property/Umbrella were converted to **Claude tool-use** structured output via new per-line pure `shape.ts` modules (`supabase/functions/extract-<line>-policy/shape.ts`) + vitest suites (`src/__tests__/commercial/<line>Shape.test.ts`). GL keeps its prose/`JSON.parse` path.
- **House standard (all lines):** `<line>_details.identity.{carrier_name,carrier_naic,policy_number,transaction_type,named_insured,dba,fein,mailing_address.{street,city,state,zip}}` + `.dates.{effective_date,expiration_date}` (producer deliberately OUT). Line-specific COI paths per `coi_field_registry`.
- **Redaction:** ported prod's context-aware `_shared/floorSafety.ts` (keeps policy dates, redacts DOBs) + `nullifyRedactedTokens` into the repo.
- **Async + Sonnet 5:** extractors return `202 {job_id, status:'processing'}` immediately after creating the job, then run OCR + Claude in the background via `EdgeRuntime.waitUntil`. Model = `claude-sonnet-5` @ 110s model-call timeout. Job always lands on `completed`/`failed` (background `.catch` records `error_message` + latency).
- **Output trim (GL only):** dropped per-field `confidence`/`status` + flattened array items → ~60% less output. Rich GL policy (51 endorsements) now extracts in **~46s** reliably (was ~110s and truncating).
- **Carrier resolution:** `_shared/carrierResolve.ts` cleans the extracted carrier name (strips AM Best rating + descriptor parentheticals) and resolves against the canonical `carriers` table (30 rows) via `resolve_carrier(p_raw text) → (carrier_id, carrier_name, naic, match_type)`; writes canonical name + NAIC into the blob `identity` (raw kept as `carrier_name_raw`, `carrier_match` flag, unmatched → 'unmatched'). **Blob only — no `policies` scalar writes.**
- **Blanket GL endorsements** labeled clearly (e.g. "Blanket Waiver of Subrogation (CG 24 04)") instead of "Unknown".

**Proven-live E2E (Pbc Inc GL policy `aefcd85f-86e3-4db9-bb8d-ca806ef6f947`):** 46s, Sonnet 5, async → all 6 GL limits ($1M/$2M/$2M/$100k/$5k/$1M) + insured/policy#/dates, carrier → "Security National Insurance Company" / NAIC 19879, COI-ready.

---

## 3. Architecture & data model (the target extraction must hit)

- **`coi_field_registry`** (seed: `supabase/migrations/20260702171000_master_coi_profiles_and_provenance.sql:151-189`, 29 rows) = write-whitelist + panel catalog + required-field checklist.
- **`get_master_coi` / `coi_build_line`** (`supabase/migrations/20260702172000_master_coi_rpcs.sql`) = the COI read model. Reads fixed paths from `policies.<line>_details`. A cell is "extracted" when `<line>_field_evidence ? '<dotted in-blob path>'` (flat map keys relative to the blob column, e.g. `"coverage.liability.csl_limit"`).
- **`save_master_coi_fields`** (same migration, ~L192-433) = the only manual write path for COI scalars.
- **Carrier precedence in `get_master_coi`:** display name = `blob.identity.carrier_name` → `policies.carrier` → `carriers.name`; NAIC = `policies.carrier_naic` → `blob.identity.carrier_naic` → `resolve_carrier(policies.carrier).naic`. (So writing the clean name + NAIC into the blob identity — what we do — is what makes the COI correct.)
- **Line-specific COI paths:** GL `cgl_details.limits.*` + `coverage_options.policy_form`; Auto `bap_details.coverage.liability.{csl_limit,bi_per_person,bi_per_accident,property_damage,limit_type}` + `coverage.symbols.{any_auto,owned_autos,scheduled_autos,hired_autos,non_owned_autos}` (booleans; symbol 7=scheduled, 8=hired); Umbrella `umbrella_details.{policy_type,limits.per_occurrence,limits.aggregate,retention.amount,coi_summary.occurrence_or_claims_made,coi_summary.ded_or_retention_kind}`; WC `wc_details.coverage.{part_one_wc,part_two_employers_liability.{each_accident,disease_each_employee,disease_policy_limit}}`; Property `property_details.coi_summary.{label,limit_amount,limit_description}` (the generic OTHER row).
- **Dual-port rule:** the ACORD 25 pipeline modules exist twice — client `src/lib/acord/acord25/*` AND Deno `supabase/functions/_shared/acord25/*`. Any edit to a ported module must be synced: `npx tsx scripts/acord25/sync-deno-port.ts` then `check-deno-port-sync.ts`. (Extractors + `shape.ts` + `carrierResolve.ts` are NOT part of the acord25 dual-port.)
- **Blanket resolution** (for the ADDL INSD / SUBR WVD "Y"): `resolve_holder_endorsements` (`supabase/migrations/20260704000500...`) is HOLDER-scoped and reads per-line child tables (`policy_cgl_additional_insureds`, `policy_bap_interests`, `policy_wc_subrogation_waivers`, `policy_property_interests`, `policy_umbrella_additional_insureds`). GL blanket = `ai_type='owners_lessees_contractors'` + form `^(CG2033|CG2038)`. Extractors write blanket-as-evidence into these tables with `endorsement_status='requested'` (never a fabricated `'endorsed'`). `winpc` allows manual "Y".

---

## 4. The extraction incident & model learnings (do NOT repeat these)

The first live E2E failed repeatedly; each layer revealed the next. Verified facts (isolated via a throwaway `verify_jwt=false` diag fn calling `anthropicBoundaryCreate` directly + curl with the anon key — DELETE such a fn after):
- **`claude-sonnet-4-20250514` is RETIRED → Anthropic 404.** (Earlier memory claiming PR#72 moved extract fns to sonnet-5 was wrong; prod was still sonnet-4 at v100 and it now 404s.)
- **`claude-sonnet-5` works** (input fast, ~2.7s/24k tokens, `thinking_tokens=0` — no auto-think) **but output generation is slow** (~155 tok/s). A verbose extraction output (51 endorsements) took ~105-118s → **infrastructure truncates long non-streaming responses** ("Unterminated string in JSON") → coin-flip failure.
- **`claude-haiku-4-5-20251001`** works + fast (~13s for a realistic output) — a viable fast fallback, but Landen prefers Sonnet for accuracy.
- **The fix that made Sonnet reliable:** (a) **async** (`EdgeRuntime.waitUntil`) so the request doesn't block, (b) **output trim** so generation finishes well under the infra limit (~46s). max_tokens is 16384 (raised from 8192; 8192 truncated rich policies).
- **Redaction was ruled out** (redactPII is fast, 3ms/92KB, linear). Prompt example JSON was valid.
- **`modelBoundaryFetch` had no timeout** — added `anthropicBoundaryCreate(key, body, timeoutMs=45000)` AbortController; extractors pass `110000`. Extractor catch blocks did NOT record failures (jobs stuck at 'extracting') — now hoist `supabase`/`jobId` + record `status='failed'` + error + latency (CGL done; **propagate to the other 4**).

---

## 5. What's NEXT (prioritized)

1. **Blanket-endorsement → policy-level flags + P&NC** (the piece Landen just surfaced via the "Unknown" waiver rows). Recognize blanket AI (CG2033/2038), blanket waiver (CG2404, WC000313), P&NC → **policy-level blanket flags** that drive the COI SUBR WVD "Y" / ADDL INSD "Y" and the **P&NC editable remarks**. Requires: registry rows (`blanket_additional_insured`, `blanket_waiver_of_subrogation`, `primary_noncontributory` per line) + `save_master_coi_fields` + `get_master_coi` reads + `resolve_holder_endorsements` extension (policy-blanket tier) + the coverage-panel ADDL/SUBR/P&NC selectors. **⚠ NEEDS A PROD-MIGRATION CHECKPOINT with Landen before applying** (registry/resolver migrations). See the field-set spec produced this session for exact paths (in session scratchpad; regenerate if lost).
2. **Propagate the GL output trim to the other 4 extractors** (they have async+Sonnet5+16384+carrier but not the trim; tool-use is more compact so less urgent, but rich Auto/Property policies could still be slow). Also propagate the **job-failed catch hardening** if any of the 4 lack it.
3. **Rich Add-Policy popup** (Feature A) — design already scoped: lift `policyCoverageFields.ts` into a static spec (the panel is coupled to a live policy via `get_master_coi`), render the line's section when type is picked/detected, auto-fill-empty from a dry-run extractor, save via `save_master_coi_fields` after inserting the policy.
4. **Verify Policy** (Feature B) — needs a **dry-run mode** on the extractors (return the payload without persisting) + a pure `comparePolicy.ts` (reuse `src/lib/commercial/boundCheck.ts` normalization) + the modal on `CustomerDetail`. Design scoped this session.
5. **Live "Extracting…" progress UI** — the frontend already has job polling (`useCGLExtractionJob` with `refetchInterval` while pending/ocr_processing/extracting, `src/hooks/useCGLExtraction.ts:435,471`). Wire the coverage panel to poll + refetch on `completed` + show progress + surface `error_message` on `failed`. **Reaches prod only on merge** (Netlify serves `main`).
6. **Efficiency (queued):** OCR cache per `document_id` (avoid re-running Azure across lines/re-runs), batch child-table inserts (currently per-row awaits), prompt caching, skip-OCR-for-text-PDFs.
7. **Aggregate_applies_per** prompt tweak — was null on the PBC doc; Landen to confirm whether it's on the dec page.

---

## 6. Operational gotchas & how to verify

- **Deploy edge fns:** `supabase functions deploy <fn> --use-api --project-ref lrqajzwcmdwahnjyidgv`. CLI links to DEV by default → ALWAYS pass `--project-ref`. `verify_jwt` stays true (extract fns are not in `config.toml`, default true). Verify a deploy by version bump + grep the deployed bundle (`get_edge_function` via Supabase MCP → result is ~60KB, saved to a tool-results file → grep it).
- **`get_logs(edge-function)`** returns REQUEST logs only (`POST | 500 | url` + `execution_time_ms`), NOT console output. To see the real extractor error, read the **job row's `error_message`** (now recorded).
- **DB checks (service role via Supabase MCP `execute_sql`):** `get_master_coi` RAISES 42501 for the service-role caller — probe with plain reads (`policies.<line>_details`, `master_coi_lines(p.*)`, child tables) instead. `policies.policy_type` does NOT exist (use `line_of_business`/`line_canonical`).
- **Test policy:** Pbc Inc GL `aefcd85f-86e3-4db9-bb8d-ca806ef6f947` (doc# SES1835993 00). Jobs table: `policy_cgl_extraction_jobs` (statuses pending→ocr_processing→extracting→completed|failed).
- **Prod migrations:** apply via Supabase MCP `apply_migration` (or Management API `/database/query`), NOT `supabase db push` (replays out-of-band migrations). Pull LIVE defs first (prod drifts from repo migration files). Normalized-MD5 the RPC `$$` bodies vs prod before trusting a repo migration file.
- **Frontend is served from `main`** — branch frontend changes are invisible on prod until merged. Edge functions deploy directly (already live).

---

## 7. Commits (branch `claude/policy-document-parsing-b604eb`), PR #81

- `8dfa433` rework 5 extractors to COI paths + port redaction
- `0b40763` (superseded — sonnet-4 revert, dead model)
- `0f98f05` haiku + model-call timeout + job-failure recording
- `5dd4c61` async background + Sonnet 5 + carrier resolution
- `063ecfb` GL output trim (reliability + speed)
- `c229ee4` label blanket GL endorsements (not "Unknown")

Key files: `supabase/functions/extract-{cgl,bap,wc,property,umbrella}-policy/index.ts` (+ `shape.ts` for the 4 tool-use lines), `supabase/functions/_shared/{floorSafety,modelBoundaryFetch,carrierResolve}.ts`, `src/__tests__/commercial/*Shape.test.ts`, `src/fence/dateRedactionContext.test.ts`. Read model: `supabase/migrations/2026070217{1000,2000}_*.sql`. Panel/spec: `src/components/policies/{PolicyCoveragePanel.tsx,policyCoverageFields.ts}`, `src/hooks/useMasterCoi.ts`, `src/hooks/use<Line>Extraction.ts`.

## 8. Open decisions for Landen
- Go-ahead on the **blanket-endorsement/P&NC prod migrations** (item 5.1 checkpoint).
- Whether to **merge PR #81** to keep repo == deployed prod (edge fns already live; no migrations, no risky frontend in the PR).
- Priority order for the two frontend features (Add-Policy popup vs Verify) once the blanket piece lands.
EOF
