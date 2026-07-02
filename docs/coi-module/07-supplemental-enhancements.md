# 07. Supplemental Enhancements: Renewal Cascade, Holder Requirements, Backfill, Cancellation Notice, and Integration Checkpoints

**Status:** Supplemental handoff, issued 2026-07-02 after the primary set (00 through 06) was handed off for implementation.
**Authority:** Subordinate to 00-master-plan.md and the six subsystem docs EXCEPT for the explicit contract extensions registered in Section 1. Everything in this document is ADDITIVE: no existing table, RPC signature, status vocabulary, freeze list, blocker code, or component contract from 00-06 is modified. If implementing any item here would require changing a 00-06 contract beyond the Section 1 registry, stop and report; do not improvise.
**Why this exists:** four capabilities were identified after handoff that are dramatically cheaper to accommodate now than to retrofit (a renewal reissue cascade, holder requirements profiles, an extraction backfill for the manual-empty policy population, and cancellation notice tracking), plus three verification checkpoints that protect correctness during the current build. Each item below states its priority, the phase it binds to, whether it blocks that phase's close, and additive-safe migration posture for the case where that phase has already merged.

Priorities: **P0** = must land inside the current phased build (cheap now, expensive later). **P1** = build immediately after Phase 5 ships, on the same architecture. **P2** = fast-follow backlog, listed so it is deliberately deferred rather than forgotten.

---

## 1. Contract extensions registry (the complete list)

These are the ONLY changes to 00-06 contracts this document authorizes. Each is optional-additive so existing call sites and tests remain valid unchanged.

1. **`GenerateCertificateRequest` (04 Sec 7.2)** gains two optional fields: `mode?: 'interactive' | 'reissue'` (default `'interactive'`) and `reissue_of?: uuid`. Rules in Section 3.4 below. In `'interactive'` mode behavior is byte-identical to the current spec, including the mandatory `preview_sha256` and 409 semantics (R9 untouched).
2. **`get_master_coi` warnings vocabulary (02 Sec 2.7)** gains one non-blocking warning code: `source_data_stale`. The six-blocker vocabulary is untouched. Rules in Section 6.
3. **`additional_insureds` (03 Sec 1)** gains two nullable columns: `requirements jsonb` and `requirements_notes text`. Rules in Section 4.
4. **`certificates.snapshot` (04 Sec 4)** gains one optional key: `requirements_evaluation` (Section 4.4). Snapshot keys are additive by design; the replay test ignores unknown keys.
5. **`certificate_events` action taxonomy (04 Sec 9)** gains one action: `requirements_overridden`. All existing actions unchanged.

No other contract changes are authorized by this document.

---

## 2. P0 verification checkpoints (bind to current phases; block phase close)

### 2.1 Producer signature stamping (binds to Phase 2 and Phase 5; blocks Phase 2 close)

The ACORD 25 Authorized Representative box is frequently NOT an AcroForm text field on licensed blanks; it may require an image overlay at fixed coordinates. The primary set carries `authorizedRepName` but a cert with an empty signature box gets rejected by lenders and GCs.

When the licensed blank arrives (Phase 2):
1. Inspect the ingested `field_inventory` and `signature_anchors` (ingestion already extracts anchors from `/signature|sign/i` fields with page, rect, and signerRole; see `src/lib/acord/templateIngestion.ts:345-365`).
2. If the box is a fillable text field: fill it with the authorized representative name per 05's field map; done.
3. If the box requires an image overlay: store the producer signature PNG alongside the producer profile home chosen in 02 (workspace-scoped, staff-editable, private storage, never in a public bucket); stamp it in the Deno fill path at the anchor coordinates recorded per template version (coordinates live with the template row so an ACORD edition change re-derives them); the printed representative name MUST match the signature owner (enforced in `validateAcord25`, new issue code `signature_name_mismatch`).
4. Extend the Phase 2 visual render test to assert the signature block is visibly populated after flatten.

Phase 2 acceptance criteria gain: "the Authorized Representative box renders a signature (field fill or overlay) and the visual test asserts it."

### 2.2 Holder requirements columns land with the Phase 4 table (binds to Phase 4; blocks Phase 4 close)

Add `requirements jsonb null` and `requirements_notes text null` to `additional_insureds` at table creation (or, if 03's table migration already merged, one additive migration `ALTER TABLE public.additional_insureds ADD COLUMN IF NOT EXISTS ...`). Column semantics and consumers are Section 4; only the columns bind to Phase 4. The AdditionalInsuredDrawer gains an optional Requirements section in edit mode (Section 4.3); if UI timing is tight, the columns may ship in Phase 4 with the drawer editor deferred to the Section 4 build, but the columns themselves must not slip.

### 2.3 Phase 5 migration dry-run on a Supabase branch (binds to Phase 5; blocks Phase 5 prod apply)

Phase 5 ships the freeze trigger and a `CREATE OR REPLACE` of `_do_account_merge` (the certificate_policies-aware policy-dedup skip). These touch a live prod feature (customer merge). Before applying the Phase 5 migration set to prod: create a Supabase branch, apply the set there, run the three R4 merge tests (account merge with issued certs, holder merge with issued certs, unmerge) against the branch, then apply to prod. This is a process gate, not schema.

### 2.4 Verify `certificate_policies(policy_id)` is indexed (binds to Phase 5; trivial)

Sections 3 and 5 below query by `policy_id`. 04 creates `idx_certificates_holder`; confirm an index on `certificate_policies(policy_id)` exists in 04's DDL and add it in the Phase 5 migration if absent (`CREATE INDEX IF NOT EXISTS idx_certificate_policies_policy ON public.certificate_policies (policy_id);`).

---

## 3. P1: Renewal reissue cascade (the highest-value follow-on; build immediately after Phase 5)

### 3.1 Problem

A certificate is an annual obligation, not a one-time artifact. When a policy renews, every active cert referencing it shows stale dates, and holders demand fresh certs. Without this feature the module saves minutes per cert; with it, it saves the January mass-reissue season. All required infrastructure exists after Phase 5 (`certificate_policies` junction, immutable snapshots, `supersedes` linkage, the holder directory, `generate-certificate`).

### 3.2 Verify-first item (do this before designing further)

Determine how a renewal is represented in this repo: same policy row with advanced `effective_date`/`expiration_date`, or a NEW policy row (the repo has an AO renewal system and an `auto_sync_policy_to_renewal` trigger; the answer may be "both"). Detection v1 (Section 3.3) covers the same-row case, which must be confirmed as the dominant path. If replacement-row renewals are common, a policy lineage link (old id to new id) is required before the cascade can follow them; report the finding and the lineage source before building.

### 3.3 Detection read model

RPC `list_certificates_needing_reissue(p_account_id uuid default null)` returns active certificates (status in ('issued','sent'), not superseded by a live cert) where, for ANY joined `certificate_policies` line, the snapshot's printed expiration date for that line differs from the current `policies.expiration_date` for the same policy id (renewal advanced the date), or the printed expiration has passed while the policy remains active. Returns per cert: certificate_id, certificate_number, holder display name (from snapshot), account, the stale lines with printed-vs-current date pairs, and current readiness for the same line selection (so the queue can show "ready to reissue" vs "blocked: limit_missing"). Staff + workspace RLS posture per 01 Section 4.5. Also a companion count for the triage tile.

### 3.4 Reissue execution (the Section 1 contract extension, precisely)

`generate-certificate` with `mode: 'reissue'` and `reissue_of: <certificate_id>`:
- The server loads the superseded cert's snapshot and derives holder_id, line selection, per-line print intent, description of operations, and remarks FROM THAT SNAPSHOT; the request omits them (any that are present are ignored in reissue mode; single source of truth is the prior snapshot plus current DB coverage data).
- `preview_sha256` is OPTIONAL in reissue mode. Rationale, stated so nobody "fixes" it back: R9 binds an interactive preview the user just verified; a reissue is verified differently, by the diff gate below. R9's 409 mechanics are unchanged in interactive mode.
- Substitute verification: the response includes `diff_summary` (per line: printed dates old vs new, each limit old vs new, insurer letter old vs new, ADDL INSD / SUBR WVD old vs new). The batch UI MUST display the diff and require one explicit confirm before executing; single-cert reissue from `CertificateIssuanceLog` shows the same diff inline.
- Every server-side E&O gate applies unchanged per cert: all six readiness blockers (422), holder-resolved endorsement downgrade-only semantics via `resolve_holder_endorsements` (422), letter recomputation and mismatch check (422). A reissue can never bypass a gate an interactive issue would hit.
- On success: new sequential certificate_number, new immutable snapshot, `supersedes` set to the old cert, old cert status `superseded`, `certificate_events` action `reissued` on both, documents pointer row inserted, same as any issue.

### 3.5 Batch UX

On `/certificates`: a triage tile "Needs reissue: N" (TriageTile, routes into the queue per the Index/List archetype). The queue lists stale certs with per-row diff, readiness pill, checkbox select, and one primary "Reissue selected" action; per-row failures (422 blockers) render as labeled pills with the blocker name and do not abort the batch; results summarized (M reissued, K blocked with reasons). Blocked rows deep-link to the customer's Master COI panel to fix the named blocker. Calm Command gates apply (one lime primary, labeled pills, tabular figures, both themes, no em or en dashes).

### 3.6 Acceptance criteria

Renewing a policy's dates surfaces its active certs in the queue with correct diffs; batch reissue of 3 certs produces 3 new sequential-numbered immutable certs, 3 superseded originals, 3 documents rows, and `reissued` events; a cert whose line now has a missing limit is blocked with `limit_missing` shown and the batch still completes for the others; an interactive issue with `mode` omitted behaves byte-identically to the pre-extension contract (regression test).

---

## 4. P1: Holder requirements profiles (columns are P0 per Section 2.2; engine and UI are P1)

### 4.1 Problem

Large certificate holders publish requirements ("$2M general aggregate, CG 20 10 additional insured, waiver of subrogation, 30 day notice"). The module can issue a CORRECT cert that still FAILS the holder's requirements. Storing requirements on the holder and checking them pre-generation turns the generator into a compliance guard.

### 4.2 Data shape (`additional_insureds.requirements jsonb`)

Closed schema, validated on write by the drawer and on read defensively:
```
{
  "min_limits":   [ { "line_key": "gl", "field": "general_aggregate", "min": 2000000 }, ... ],
  "flags":        [ { "line_key": "gl", "requires_additional_insured": true, "requires_waiver": true }, ... ],
  "required_endorsement_forms": ["CG 20 10", "CG 20 37"],
  "notice_days":  30,
  "required_lines": ["gl", "auto"]
}
```
`line_key` uses the canonical enum (gl, auto, umbrella, wc, property, other; 02 Sec 2.3). `field` names must be keys that exist in the `get_master_coi` line cell contract for that line_key. `requirements_notes text` carries free text that never participates in evaluation.

### 4.3 Editor

The AdditionalInsuredDrawer (03 Sec 8.6) gains a collapsed "Requirements" section in edit mode: structured rows (line, field, minimum) via selects bound to the canonical vocabulary, flag toggles per line, notice days, endorsement form chips, and the free-text notes. All optional; a holder with no requirements behaves exactly as today. `onSaved` row shape is unchanged (requirements are not part of `AdditionalInsuredSavedRow`; the generator fetches them with the holder pick).

### 4.4 Evaluation semantics: advisory with logged override, never a silent pass and never a hard server block

- Client: on holder pick in the generator, evaluate requirements against the selected lines' `get_master_coi` values and the holder-resolved endorsement results. Render a compliance strip: one labeled pill per rule, pass or fail with the expected-vs-actual value ("GL aggregate 1,000,000, holder requires 2,000,000"). Failures do NOT disable Generate.
- On Generate with failures present: an explicit confirm dialog restating each failure; proceeding writes `certificate_events` action `requirements_overridden` with the failure list, and the server embeds `requirements_evaluation` (the full pass/fail result set plus the override flag and user) into the snapshot.
- Server: `generate-certificate` re-runs the same evaluation (shared pure function, ported with the rest of `_shared/acord25/`) so the snapshot records the server's evaluation, not the client's claim. It does NOT 422 on requirement failures (they are business advisories that may be stale, unlike the six correctness blockers, which are unchanged and still 422).
- Rationale recorded so it is not "improved" later: legal correctness gates block; counterparty preferences warn and log. Mixing them would train users to override blocks.

### 4.5 Acceptance criteria

A holder with a $2M GL aggregate requirement against a $1M policy shows a failing pill and requires the confirm dialog; the issued snapshot contains `requirements_evaluation` with the override recorded and a `requirements_overridden` event exists; a holder with no requirements shows no strip and no snapshot key; requirement evaluation appears in the Section 3 reissue diff when the result changed.

---

## 5. P1: Cancellation notice workflow

### 5.1 Scope (deliberately small in v1)

When a policy transitions to a cancelled or non-renewed status, staff must know which active certificate holders were promised notice. v1 is detection plus a task plus the holder list; automated notice letters are P2.

### 5.2 Design

- RPC `list_active_cert_holders_for_policy(p_policy_id uuid)`: active certs (issued or sent, not superseded/voided) joined through `certificate_policies`, returning certificate_id, certificate_number, holder display name and mailing address (from snapshot, which is the promised-notice identity), holder_id (live directory row for current contact info), issued_at, and the holder's `notice_days` from requirements if set. Staff + workspace RLS.
- Detection: a DB trigger on the policies status transition (verify the exact status vocabulary and any existing cancellation flow before wiring; if a cancellation pipeline already exists, hook it instead of adding a parallel trigger) inserts ONE task per affected policy (`tasks` table, `source='system'`, title "Notify certificate holders: policy <number> cancelled", description embedding the holder count, entity_type 'policy'). No task when the policy has zero active certs.
- UI: the task links to a holder-list view (drawer or section on the policy page) rendering the RPC output with each holder's address and notice_days; a per-row "Mark notified" writes a `certificate_events` row (action `emailed` when sent via send-coi-email with a notice note, otherwise a note-only event; do NOT extend the action taxonomy beyond Section 1).

### 5.3 Acceptance criteria

Cancelling a policy with two active certs creates exactly one task naming two holders; the holder list shows snapshot identity plus current directory contact; a policy with no active certs creates no task; re-cancelling (status churn) does not duplicate the open task (idempotency: skip when an open system task for the same policy exists).

---

## 6. P0: Canopy and extraction staleness warning (binds to Phase 3; small)

Add warning code `source_data_stale` to `get_master_coi` warnings (Section 1 registry item 2): emitted per line when every load-bearing cell for that line has `src='extracted'` provenance and the newest underlying extraction or Canopy pull timestamp for that policy is older than 90 days (constant, named, adjustable). Non-blocking; renders in the Master COI panel as a muted labeled pill with the data age ("Data from Canopy pull, 94 days old") and in the generator as a per-line warning. Never blocks Generate (staleness is a review prompt, not a correctness failure; the readiness blockers are unchanged). Panel already displays provenance; this adds only the age computation and the warning emission. Acceptance: a line whose only data source is an extraction older than 90 days shows the pill; a manual edit to any load-bearing cell on that line clears it (manual src is never stale).

## 7. P1: Master COI extraction backfill (run once, right after Phase 3 ships)

### 7.1 Problem

Phase 3's value is gated by the bimodal-data problem: manually-added policies have empty `*_details`, so Master COI starts empty for much of the book and CSRs hand-enter limits. The repo already owns extractors (`extract-cgl-policy`, `extract-bap-policy`, `extract-wc-policy`, `extract-property-policy`, `extract-umbrella-policy`) and years of stored policy documents. Run them over the backlog once.

### 7.2 Design

- New edge function `backfill-policy-extraction` (CRON_SECRET auth per repo invariant; manual trigger, not scheduled). Work list: policies whose line-appropriate `*_details` is null or empty AND that have at least one linked documents row with `document_type` in ('policy','dec_page') (verify exact type values in the CHECK; prefer dec_page when both exist, newest first). For each, invoke the existing extractor for that line (line selection via `line_canonical`/`line_category`, not string-matching `line_of_business`).
- Provenance safety: extraction writes carry `src='extracted'` and MUST honor 02's provenance ledger rule that extractor output never silently overwrites manual (`src='manual'`) values; since the work list targets empty details, conflicts should be nil, but the rule is enforced by the write path regardless.
- Idempotency and audit: one `analytics_job_runs` row per run with per-policy stats (extracted, skipped_manual, no_document, extractor_error); chunked with a per-run cap (default 50 policies) and re-runnable until the work list is empty; per-policy failures never abort the run.
- Cost control: dry-run mode first (returns the work-list count and document inventory, executes nothing); Brian approves the run size before live execution (OCR and AI costs are per document).
- Everything extracted lands with the extraction pipeline's existing `NEEDS_VERIFICATION`/confidence machinery, which the Master COI panel already renders as provenance, so CSR review happens in the panel, not a new surface.

### 7.3 Acceptance criteria

Dry run reports an accurate work list; a live chunk populates `*_details` for policies that had documents, visibly filling their Master COI panels with `extracted` provenance and confidence flags; a policy with a manually-entered limit is skipped for that field; the run is re-entrant; a job-runs row records every policy touched.

## 8. P2: Deliberate deferrals (recorded so they are decisions, not omissions)

1. **CEO digest and metrics**: certs issued/sent per week, median time-to-issue, blocked-by-readiness counts, top holders; `certificate_events` already captures all inputs; extend `get_weekly_ceo_digest_facts` when wanted.
2. **Inbound request intake**: parse holder cert-request emails (via `email-inbound`) into a pre-filled generator; must comply with the AI PII policy (redaction before any model call); its own project.
3. **Automated cancellation notice letters** (Section 5 v1 is detection plus task).
4. **ACORD 101 overflow companion form** (remarks overflow remains a hard block per R16).
5. **Customer portal self-service cert requests**; **holder-facing verification links or QR on the PDF**; **email delivery/open tracking webhooks**.
6. **Initial multi-holder batch issuance** (one customer, N holders in one action): the Section 3 batch machinery makes this nearly free later; deferred to keep the interactive flow's preview binding uncomplicated.
7. **ACORD 125/126/140 support** (out of scope by the original mandate; the template/versioning architecture already accommodates them).

## 9. Sequencing summary

| Item | Priority | Binds to | Blocks phase close? |
|---|---|---|---|
| 2.1 Producer signature | P0 | Phase 2 (verify), Phase 5 (Deno overlay) | Yes (Phase 2) |
| 2.2 Requirements columns | P0 | Phase 4 table creation (additive migration if merged) | Yes (Phase 4) |
| 2.3 Branch dry-run | P0 | Phase 5 prod apply | Yes (process gate) |
| 2.4 certificate_policies index check | P0 | Phase 5 | Yes (trivial) |
| 6 Staleness warning | P0 | Phase 3 (additive to 02 warnings) | No (ship within Phase 3 if possible, else first patch after) |
| 7 Extraction backfill | P1 | After Phase 3 migrations; before broad CSR rollout | No |
| 3 Renewal cascade | P1 | After Phase 5 | No |
| 4 Requirements engine + UI | P1 | After Phase 5 (columns already present) | No |
| 5 Cancellation notice | P1 | After Phase 5 | No |
| 8 Deferrals | P2 | Backlog | No |

All quality gates from 00 Section 8 apply to every item here, including the Calm Command acceptance checklist in both themes and the no em dash / no en dash rule in documents and UI copy.
