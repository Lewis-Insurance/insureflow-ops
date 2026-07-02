# Master COI / Additional Insureds / ACORD 25 Module: Master Plan

**Status:** Implementation-ready. **Date:** 2026-07-02.
**Supersedes:** `ACORD_COI_Module_Handoff.md` (repo root) as the implementation source. The handoff remains useful background, but this plan corrects several of its factual claims against verified source (see "Ground truth corrections" below), and where they disagree, this plan wins.

**How this plan was produced:** a six-agent verification fleet re-checked every load-bearing handoff claim against actual source (migrations, hooks, pages, and live prod row counts); six subsystem designers produced the specs in this directory; three adversarial reviewers (certificate correctness and E&O, data model and RLS, scope and UX) attacked the combined design and surfaced 12 blockers and majors; 22 binding resolutions were applied in a reconciliation pass; a final gate verified every seam, every banned pattern, and every review finding closed.

---

## 1. Mission (definition of done)

A staff user opens a customer record and sees a **Master COI** panel: that customer's full coverage picture pulled from their policies (carrier, policy number, dates, limits, NAIC, insurer letters, per-line Additional Insured and waiver status with real endorsement tracking), easy to scan and correct, with a readiness indicator that names exactly what is missing before a certificate can go out. Separately, the agency maintains one shared **Additional Insureds** directory with live duplicate detection, so "Enterprise Fleet Management" exists once, not five times. To issue a certificate, staff go to **/certificates**: pick the customer, check the coverage lines, add remarks, pick or create the certificate holder, and click **Generate**, producing a real, correctly filled ACORD 25 PDF that lands automatically in the customer's Documents tab and is preserved as an immutable, numbered, versioned snapshot even if the underlying policy changes later.

## 2. Document map

Read in this order. Each doc is self-contained enough that an implementing engineer never makes an architectural choice.

| Doc | Owns |
|---|---|
| [01-disposition-and-roadmap.md](01-disposition-and-roadmap.md) | System B retirement, dead-code cleanup, Phase 0 tenancy hardening, the seven-phase roadmap with per-phase scope, migrations, acceptance criteria, and demos. **Read first.** |
| [02-master-coi-data-layer.md](02-master-coi-data-layer.md) | `get_master_coi` cell-based read model, manual-entry write model, three-state endorsement status, `resolve_holder_endorsements`, the single insurer-letter algorithm, readiness blocker vocabulary, carrier resolution, producer block, `account_coi_profiles` |
| [03-additional-insureds-directory.md](03-additional-insureds-directory.md) | `additional_insureds` table, search and resolve-or-create RPCs, duplicate suggestions, merge engine clone, the Index/List page and add drawer |
| [04-issuance-and-snapshots.md](04-issuance-and-snapshots.md) | `public.certificates` and its snapshot, freeze trigger, numbering, `generate-certificate` edge function, `finalize_certificate_issue`, the `coi-certificates` bucket, Documents integration, `CertificateIssuanceLog`, `send-coi-email` v2, `src/types/certificates.ts` |
| [05-acord25-pipeline.md](05-acord25-pipeline.md) | Ingestion fixes, template onboarding runbook, `buildAcord25FieldValues` and `validateAcord25`, the field map and template sha pin, `hashFieldValuesForPreview`, the Deno port, the test suite |
| [06-ui-surfaces.md](06-ui-surfaces.md) | Master COI panel, the `/certificates` generator surface (Document Production archetype), entry-point wiring, Calm Command compliance gates |

## 3. The five locked decisions (from Brian, unchanged)

1. **Reuse and fix the existing System A ACORD engine** (`acord_templates` / `acord_forms` / `pdfFiller.ts`), not a parallel PDF system.
2. **Extend the policies data model** for Master COI coverage data, not a parallel model.
3. **Reuse the relationship-graph dedup patterns** for Additional Insureds duplicate detection.
4. **Issued COIs are immutable, versioned snapshots.** Editing a policy later never changes a cert already sent.
5. **Real per-line Additional Insured endorsement status** with a "requested but not yet endorsed" state; never a default-Y checkbox.

## 4. Ground truth corrections (why this plan differs from the handoff)

- **The XFA "blocker" is dead code.** The rejection at `templateIngestion.ts:88-96` can never fire (pdf-lib dictionary lookups require interned PDFName keys, and the code passes raw strings), and pdf-lib 1.17.1 auto-strips XFA on `getForm()`. XFA-hybrid ACORD 25s ingest successfully today. The real fix is small: PDFName-based detection, warn instead of reject, store sanitized bytes (Phase 0).
- **System B (`/coi-generator`) has never been used in production.** Zero rows in `certificates_of_insurance`, `coi_audit_log`, `coi_templates`; zero objects in both COI buckets; its RLS blocks staff writes for effectively all 16,019 accounts; its "Generate with AI" ships raw unredacted PII to OpenAI. Retirement is free: no data migration, five code sites to repoint.
- **The `documents` storage bucket is PUBLIC** (flipped by migration `20251028214559`, with any-authenticated UPDATE and DELETE on objects). Issued certificates therefore get their own private `coi-certificates` bucket.
- **System A never lands generated PDFs in the Documents tab** (no `documents` row insert, a storage key that breaks the bucket's path-based RLS convention, a dead `getPublicUrl` call) and its RLS is auth-only, not workspace-scoped. Both fixed in Phase 0.
- **Policy data is bimodal:** extraction-processed policies carry rich per-line JSONB (limits, NAIC, additional insureds); manually added policies carry almost nothing, and `carrier_id` / `carrier_naic` are never written by the add-policy modal. The Master COI write model exists precisely to close this gap.

## 5. Architecture at a glance (binding resolutions)

- **Generation is server-side authoritative.** The `generate-certificate` edge function is the only issuance path: it re-reads `get_master_coi` at issue time, fills the PDF via a Deno port of the shared builder, uploads, and commits through service-role-only `finalize_certificate_issue`. Authenticated users have zero write grants on `certificates`. Client-side fill exists for the live preview only.
- **The E&O gate is holder-scoped.** `resolve_holder_endorsements(account, holder, policies)` returns `endorsed` / `requested` / `none` per line for THIS holder (blanket endorsement, or scheduled match by directory id or normalized name). ADDL INSD prints Y only when holder-resolved endorsed; the user's per-line intent can only downgrade to N, never upgrade. The server 422s on any attempt to print Y for a non-endorsed pair.
- **One insurer-letter authority.** The letter algorithm lives once, in SQL, inside `get_master_coi` (canonical line order gl, auto, umbrella, wc, property, other; carrier grouping by `carrier_id` else `normalize_entity_name`; NAIC-conflict split; deterministic tiebreak; more than 6 carriers is a hard blocker). The client preview consumes it; the server recomputes it at issue time and 422s on mismatch.
- **Server-enforced readiness.** Six blocker codes (`no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `policy_expired`, `insurer_overflow`) defined once in 02; the server refuses to issue on any of them. An expired policy can never print as in-force coverage.
- **Preview-issue integrity.** The client sends the sha256 of its previewed build (`hashFieldValuesForPreview`, owned by 05); the server compares against its own rebuild and returns 409 if data changed since the user last looked.
- **Immutability that composes with merges.** The freeze trigger locks `certificate_number`, `snapshot`, `pdf_sha256`, storage pointers, `issued_at`, `issued_by`, and legal status transitions. `account_id` and `holder_id` are reparentable navigation metadata, so customer merges and holder merges keep working; the snapshot preserves the as-issued identities.
- **Private storage for legal artifacts.** Issued PDFs live in the new private `coi-certificates` bucket (no UPDATE policy, service-role writes, signed-URL reads, sha256 verified on download). The Documents-tab row is a convenience pointer; deleting it never touches the certificate.
- **Uniform tenancy.** Every new table carries `agency_workspace_id`, derived server-side, with `is_staff() AND is_agency_member()` RLS, matching the Phase 0 hardening of `acord_forms`.
- **No drafts, no addendum, no premium.** Certificate drafts are cut from v1. Remarks overflow is a hard pre-generation error ("shorten by N characters"), never an addendum page on an issued cert. Premium can never appear in the payload by construction, backed by a validator and tests.

## 6. Phased roadmap summary

Full detail, per-phase file lists, migrations, and acceptance criteria live in [01-disposition-and-roadmap.md](01-disposition-and-roadmap.md).

| Phase | Size | Delivers | Demo |
|---|---|---|---|
| 0. Foundations and hardening | S | Workspace RLS + soft delete on `acord_forms`; ingestion XFA fix; generated forms land in Documents; **licensed ACORD 25 acquisition kicked off (gates 2, 3, 5)** | Generate an existing form, see it in the customer's Documents tab |
| 1. Legacy demolition and repoint | S | System B frontend deleted; `/certificates` scaffold live; four entry points repointed; System A dead code removed | Every certificate button lands on the new scaffold; `/coi-generator` is gone |
| 2. ACORD 25 template onboarding | M | Real ACORD 25 template ingested, field map + validation rules + round-trip and visual tests | Hand-fill and print a real ACORD 25 from `/acord-forms` |
| 3. Master COI data layer and panel | L | `get_master_coi`, manual limits editing, three-state endorsements, letter authority, readiness; the Master COI panel on the customer record | Fix one limit and one NAIC, watch readiness flip to ready |
| 4. Additional Insureds directory | M | Directory + live dup warning + merge + FK wire-up; `resolve_holder_endorsements` lands here | Add the same fleet company twice, get warned, merge the pair |
| 5. Certificate issuance | L | `generate-certificate`, immutable snapshots, numbering, issuance log, email, the full `/certificates` generator | The golden path: issue, email, edit the policy, confirm the cert is untouched, reissue to a second holder |
| 6. Demolition and polish | S | Drop System B DB objects and buckets; delete mined reference code; regenerate types; update CLAUDE.md | Schema contains no System B object; customer merge still works |

Dependency spine: 0 before everything; 1 independent after 0; 2 before 3; 3 and 4 feed 5; 6 last. `main` is shippable at every phase boundary.

## 7. Prerequisites and risks

- **Licensed blank ACORD 25 (external, human, unknown lead time).** Nothing in the repo ships it and a lookalike is never acceptable. Brian starts acquisition at Phase 0 kickoff; it gates Phases 2, 3, and 5.
- **The public `documents` bucket** remains a repo-wide exposure outside this module's critical path; flagged for a separate hardening pass.
- **Typecheck debt:** `npm run typecheck` carries ~1156 pre-existing errors, so phase gates rely on Vite build, lint, and Vitest.
- **Prod edge-function deletions** (Phase 1) are prod actions outside git; directories remain recoverable from history.

## 8. Quality gates

Every phase closes only when its acceptance criteria in 01 pass. Module-wide, the non-negotiable tests are: the fill round-trip and visual render tests for the ACORD 25 (Phase 2); the client/Deno builder parity fixture (Phase 5); the snapshot-replay round-trip (store, reload, refill, extract, compare; Phase 5); the three merge tests (account merge with issued certs, holder merge with issued certs, unmerge; Phase 5); and the E&O denial tests (422 on Y-for-non-endorsed, 422 on expired line, 422 on letter mismatch, 409 on stale preview; Phase 5). Every UI surface passes the Calm Command acceptance checklist in both themes, with the checklist's stale dark-only line explicitly waived.
