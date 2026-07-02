# 04: Certificate Issuance, Immutable Snapshots, Numbering, and Documents Integration

Area: Master COI / ACORD 25 module, issuance subsystem. Resolves handoff open question 6 (snapshot mechanics) and specifies the mechanics of locked Decision 4 (issued COIs are immutable versioned snapshots). This is the FINAL, implementation-ready version, reconciled against the orchestrator resolutions R1 to R22.

Repo: /Users/brianlewis/insureflow-ops. All file references below are relative to the repo root unless absolute.

Sibling documents referenced throughout (all in docs/coi-module/):

- `01-disposition-and-roadmap.md`: System B retirement, phases, rollout, entry-point repointing.
- `02-master-coi-data-layer.md`: `get_master_coi`, `resolve_holder_endorsements`, readiness blocker vocabulary, insurer-letter authority, canonical line keys, `src/types/master-coi.ts`.
- `03-additional-insureds-directory.md`: `additional_insureds` table, holder dedup/merge engine.
- `05-acord25-pipeline.md`: field map, `buildAcord25FieldValues`, `validateAcord25`, template sha pin, and their Deno ports in `supabase/functions/_shared/acord25/`.
- `06-ui-surfaces.md`: the `/certificates` surface, generator page, and all UI wiring that consumes this subsystem.

---

## 0. Summary of decisions made in this document

1. New table `public.certificates`: one row per issued certificate, created only after the PDF exists. No draft state on this table or anywhere in the module (R20; draft support is a noted future enhancement, `acord_forms`-backed if ever needed). Status CHECK: `issued -> sent`, either of those `-> voided` or `-> superseded`. Immutability enforced by BOTH a BEFORE UPDATE/DELETE column-freeze trigger and a privilege design where authenticated users have SELECT only; all writes go through the `generate-certificate` edge function (service role) and narrow SECURITY DEFINER RPCs. Generation is server-side authoritative and this is the ONLY issuance path (R1).
2. Per R4, the freeze trigger does NOT freeze `account_id`, `holder_id`, or `agency_workspace_id`: those are reparentable navigation metadata that the account-merge and holder-merge engines must be able to update. The snapshot JSONB preserves the as-issued insured and holder identities. Frozen: `certificate_number`, `snapshot`, `snapshot_sha256`, `pdf_sha256`, `storage_bucket`, `storage_path`, `size_bytes`, `issued_at`, `issued_by`, provenance columns, and status transitions limited to the legal set.
3. Numbering: DB-side BEFORE INSERT trigger, format `COI-YYYY-NNNNN`, sequential per year via a `certificate_number_counters` row-locked counter table (not System B's random 5 digits). Numbers are reserved before PDF fill via a service-role-only RPC so the number can be printed on the form; a failed generation burns the number (gap), which is acceptable and documented.
4. Storage: issued certificate PDFs live in a NEW private `coi-certificates` bucket (R5), never in the `documents` bucket, which is verifiably PUBLIC with any-authenticated UPDATE/DELETE (supabase/migrations/20251028214559_04cdd6c2-dee6-41a5-80c8-85cecdb2b4ae.sql). Path: `{account_id}/{certificate_id}/{certificate_number}.pdf`. No UPDATE storage policy exists on the bucket; the artifact layer is immutable like the row layer.
5. Junction `certificate_policies` exists for querying and navigation only (which certs reference this policy). `policy_id` is `ON DELETE RESTRICT` (R4). The snapshot JSONB on `certificates` is fully self-contained; per-line data is duplicated there deliberately.
6. Reissue: never edit an issued cert. A corrected cert is a brand-new row with a new number, `supersedes_id` pointing at the old row, `revision = parent.revision + 1`; the old row is stamped `superseded_by_id` + `status='superseded'` in the same transaction. Voiding is a status change plus stamps; nothing is ever deleted.
7. Documents tab: the ground-truth documents ROW contract is adopted (one `documents` row with `document_type='coi'`, never `org_id`, `size_bytes` not `file_size`), but the row points at the `coi-certificates` bucket via `storage_bucket='coi-certificates'`, which the tab already resolves correctly (src/hooks/useDocumentManager.ts:148-173 tries `doc.storage_bucket` first). The documents row is a convenience pointer; if the user soft-deletes or replaces it, the certificate is unaffected because the issuance log downloads through `certificates.storage_path` directly, and a "Restore to Documents" action re-inserts a pointer row against the same storage object.
8. Issuance log: new `certificate_events` table with a CHECK-constrained action taxonomy adapted from System B (`generated`, `previewed`, `downloaded`, `emailed`, `reissued`, `voided`, `document_restored`). Rendered by ONE reusable `CertificateIssuanceLog` component (R17), full variant beneath the generator on the `/certificates` surface, compact variant (limit 5) at the bottom of the Master COI panel. `06-ui-surfaces.md` consumes this component and ships no parallel log component.
9. Email: rework the existing `send-coi-email` edge function; this document is its single owner (R10). Contract `{certificate_id, to, cc?, note?}`, requireAuth + `is_staff()` + `is_agency_member(cert.agency_workspace_id)`, attachment-only from the `coi-certificates` bucket with NO signed-URL fallback, stamps `sent_to`/`sent_at`/`status`, logs an `emailed` event.
10. Server-side gates at issue time: `get_master_coi` readiness blockers are 422s including `policy_expired` (R6); insurer letters are re-read from `get_master_coi` and client letters are a cross-check that 422s on mismatch (R7); ADDL INSD / SUBR WVD print values come from `resolve_holder_endorsements` for THIS holder, and the request's per-line intent can only downgrade, never upgrade (R2, R3); the client's `preview_sha256` is compared against the server rebuild and mismatch is a 409 (R9).
11. Tenancy: `certificates`, `certificate_policies`, and `certificate_events` all carry `agency_workspace_id`, derived server-side from the account with the sec005 orphan fallback, with `is_staff() AND is_agency_member(agency_workspace_id)` RLS (R14).

---

## 1. Existing-code facts this design is built on (verified citations)

### 1.1 System B conventions being carried forward as patterns

- DB-trigger numbering: `generate_coi_number()` builds `'COI-' || TO_CHAR(now(),'YYYY') || '-' || LPAD(floor(random()*99999)::text, 5, '0')` inside a uniqueness retry loop (supabase/migrations/20251011003211_458f658b-d47f-4d45-83b9-1688124f1992.sql:228-243), wired as BEFORE INSERT trigger `set_coi_number_trigger` that fills only when the incoming value is NULL (same file :264-279). The fill-only-when-NULL guard is reused here because it lets the edge function pass a pre-reserved number.
- Append-only version pattern: `versions jsonb + current_version` columns plus SECURITY DEFINER `append_coi_version(p_coi_id, p_version_data)` RPC (supabase/migrations/20251011013105_0fb9bb00-6a02-42da-8395-52080f4a6ba0.sql:2-22). Acknowledged but NOT adopted as-is: the RPC appends into a JSONB array on a row whose other columns remained freely mutable, so it never actually delivered immutability. This design replaces version arrays with supersede-chained rows (Section 5).
- Audit action taxonomy: `coi_audit_log.action CHECK (action IN ('generated','downloaded','emailed','previewed','revised','cancelled'))` (supabase/migrations/20251011013849_05d90d0c-d5b5-4bc2-9893-a2714f9c311c.sql:19). Adopted with renames (Section 3.3). Its `WITH CHECK (true)` open INSERT policy (same file :48-51), which the batch6b audit lockdown explicitly flagged (supabase/migrations/20260628192844_batch6b_log_audit_lockdown_and_f2.sql:6), is NOT repeated.
- CHECK-constrained status: System B's status was a SQL comment only (supabase/migrations/20251011003211_...sql:73) and the code immediately drifted by writing an undocumented `'issued'` (src/hooks/useCOIGeneration.ts:285). The new table uses a real CHECK constraint plus trigger-enforced transitions.
- The System B RLS failure to avoid: both its policies gate on `account_memberships` (supabase/migrations/20251011003211_...sql:188-207); prod has 2 membership rows against 16,019 accounts, so writes were RLS-blocked for effectively every account and prod has 0 certificate rows. The new tables use `is_staff()` plus `is_agency_member()` (Section 3.6, R14).
- `send-coi-email`: Resend REST, fixed sender `coi@lewisinsurance.ai` (supabase/functions/send-coi-email/index.ts:35-36), requireAuth (:217-222), rate limiting (:224-234), and an admitted missing access check (:294-295). It also inserts into an `email_log` table that no migration creates (insert at :330-343; `grep email_log supabase/migrations/` returns nothing), so that logging currently fails silently. Reused with the rework in Section 8.

### 1.2 Documents-tab plumbing (row contract adopted; bucket NOT adopted)

- The `documents` bucket was created private by supabase/migrations/20250929150017_543c0e63-e6af-4987-bc52-b99e0b3d9d60.sql:1-3, but a later migration flipped it PUBLIC: supabase/migrations/20251028214559_04cdd6c2-dee6-41a5-80c8-85cecdb2b4ae.sql inserts the bucket with `public = true` (`ON CONFLICT (id) DO UPDATE SET public = true`, comment "Ensure documents bucket exists and is public"), replaces the path-scoped SELECT policy with `"Anyone can view documents" USING (bucket_id = 'documents')` with no path or membership restriction, and creates UPDATE and DELETE policies gated only on `auth.role() = 'authenticated'`. Consequence: any object in that bucket is world-readable by URL and any authenticated user can overwrite or delete its bytes. Issued legal certificates therefore NEVER touch the `documents` bucket (R5); they live in the private `coi-certificates` bucket (Section 3.7). Re-privatizing the `documents` bucket is flagged as a separate hardening task OUTSIDE this module (owned by `01-disposition-and-roadmap.md`).
- Canonical documents ROW shape (still adopted for the pointer row): src/hooks/useDocumentManager.ts:86-121 (row fields `account_id, filename, kind, name, category, storage_path, storage_bucket, file_missing:false, mime_type, size_bytes, uploaded_by` at :103-115).
- The Documents tab fetch has zero filters that could hide a COI row: `.from('documents').select('*').eq('account_id', accountId).order('created_at', ...)` (src/hooks/useDocumentManager.ts:41-45).
- `document_type='coi'` is legal under the current CHECK (supabase/migrations/20260120200000_fix_document_type_constraint.sql:14-29, which superseded 20251204000003).
- Row rendering reads `name || filename` (src/components/customers/CustomerDocumentsSection.tsx:160) and `size_bytes` not `file_size` (:169).
- Delete is soft: `perform_soft_delete` RPC sets `deleted_at` (src/hooks/useDocumentManager.ts:309-319; RPC at supabase/migrations/20251226000002_soft_delete_enforcement.sql:208). It never removes the storage object, so a certificate's bytes survive a documents-row delete.
- Replace never overwrites bytes: `replaceDocumentFile` uploads to a NEW path with `upsert:false` and repoints the row (src/hooks/useDocumentManager.ts:258-281). So even a "replaced" COI documents row leaves the certificate's original storage object untouched.
- View/download resolve via `createSignedUrl` trying `doc.storage_bucket` FIRST, then `'documents'` (src/hooks/useDocumentManager.ts:148-173). This is load-bearing: a pointer row with `storage_bucket='coi-certificates'` renders, views, and downloads in the tab with zero tab changes.
- The broken precedent NOT to copy: `useAcordForms.generatePdf` uploads to `acord-forms/${account_id}/...`, stores a `getPublicUrl` URL, and never inserts a documents row (src/hooks/useAcordForms.ts:322-345).
- `documents` has no `agency_workspace_id` column; tenancy flows through `account_id`, and `org_id` is a vestigial random default that must never be set by new code (supabase/migrations/20250908032636_1d8f856a-3ce8-455d-8f6b-89be079e1fd3.sql:175; no writer in src/ sets it).

### 1.3 Fill engine, edge-function, tenancy, and merge-engine precedents

- Client fill core: `fillAcordPdf(templateBytes, options)` in src/lib/acord/pdfFiller.ts:38-51, pdf-lib based, `updateFieldAppearances` + `flatten` (imports at :6-17). Types come from `@/types/acord` (:17), which is why the Deno side needs a port, not an import.
- pdf-lib runs in Deno edge functions: the (dead) worker already imports `pdf-lib@1.17.1` from esm.sh (supabase/functions/pdf-generation-worker/index.ts:8).
- `acord_templates` columns including `version`, `is_current`, `field_inventory`, `field_schema`, `validation_rules` (supabase/migrations/20251218204626_acord_form_automation_suite.sql:7-29); `acord_forms` columns (:101-123). `acord_forms` RLS was auth-only, `USING (auth.uid() IS NOT NULL)` (:390-392); Phase 0 of `01-disposition-and-roadmap.md` fixes that to the workspace posture this module also uses.
- `is_staff()` is SECURITY DEFINER over `profiles` (`is_staff = true OR role IN ('admin','agent','producer','csr')`), supabase/migrations/20260410000011_fix_is_staff_function.sql:5-18.
- `is_agency_member(p_agency_id uuid)` exists: SECURITY DEFINER STABLE, returns FALSE on NULL input, true when the caller has an active `agency_workspace_memberships` row for the workspace (supabase/migrations/20251228000000_m0_agency_workspace_foundation.sql:125-140).
- The sec005 workspace-scoping pattern this module copies: add nullable `agency_workspace_id`, backfill from `accounts.agency_workspace_id` via the account FK, orphan fallback assigns the first workspace (`SELECT id FROM agency_workspaces ORDER BY created_at LIMIT 1`), then SET NOT NULL, index, workspace-scoped policies (supabase/migrations/20260408100000_sec005_leads_workspace_isolation.sql).
- `accounts.agency_workspace_id` exists (ensured by supabase/migrations/20251228000002_marketing_automation_engine.sql:33-40) but may be NULL on legacy accounts, hence the orphan fallback at issue time (Section 7.4).
- The live account-merge engine `_do_account_merge` discovers every single-column FK to `accounts` via pg_constraint introspection and UPDATEs it to the survivor (supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql:143-206); its lockdown pattern pairs `revoke execute ... from public, anon, authenticated` with an explicit `grant execute ... to service_role` (:264-265). Its policy de-dup step SOFT-deletes duplicate policies in the merged cluster (dedup CTE and `update public.policies set deleted_at = now()` at :127-141). Both facts drive Sections 3.5 and 3.8.
- Edge function registration pattern: `[functions.<name>]` entries in supabase/config.toml (e.g. :37-49).
- Entry points that touch this area's UI wiring: CustomerDetail.tsx overflow "New certificate" at src/pages/CustomerDetail.tsx:429-431; the Documents section at :476-481; `SECTION_IDS` at :105; PolicyDetail buttons at src/pages/PolicyDetail.tsx:210 and :502; nav entry at src/components/layout/chrome/navConfig.ts:132. Per R15, all four are repointed to `/certificates?accountId=...` in Phase 1 (owned by `01-disposition-and-roadmap.md` and `06-ui-surfaces.md`).

---

## 2. Naming and scope boundaries

New table names: `certificates`, `certificate_policies`, `certificate_events`, `certificate_number_counters`. New bucket name: `coi-certificates`. `certificates` does not collide with the legacy `certificates_of_insurance` table (System B, zero prod rows, retired per `01-disposition-and-roadmap.md`) and does not conflict with the legacy public `certificates` storage bucket (separate namespace; this design never uses that bucket because it is world-readable, supabase/migrations/20251011012403_a9537ba4-375f-4322-b107-bc1f7ca38607.sql:2-21).

Canonical vocabulary used by this document and every sibling (R7, R11):

- Issued-cert table: `public.certificates`, holder FK column `holder_id`, issuance timestamp `issued_at`.
- Line keys: `'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other'`. The single published mapping of keys to display names lives in `02-master-coi-data-layer.md`; `certificate_policies.line_key` stores these canonical keys directly, so there is no second line vocabulary in this subsystem. Excess/follow-form policies ride the `umbrella` key per the mapping in 02.
- Shared TypeScript types: `src/types/certificates.ts` (owned here, Section 9.1) and `src/types/master-coi.ts` (owned by 02).

Interfaces this subsystem consumes from sibling designs (stated as contracts, not designed here):

- `additional_insureds` table (`03-additional-insureds-directory.md`): exposes `id uuid`, display `name text`, and an address block. `certificates.holder_id` FKs to it. The issuance migration creates `idx_certificates_holder` once; 03 must NOT recreate it (R11).
- `get_master_coi(p_account_id, p_policy_ids)` (`02-master-coi-data-layer.md`): the cell-based read model (`src/types/master-coi.ts`), lines keyed by the canonical keys, per-line typed limits, carrier name + NAIC, effective/expiration dates, the authoritative insurer-letter map (R7: letter assignment is implemented ONCE, in SQL, inside `get_master_coi`), and readiness `{ready, blockers[], warnings[]}` with the six-code blocker vocabulary `no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `policy_expired`, `insurer_overflow` defined ONCE in 02 Sec 2.7 (R6).
- `resolve_holder_endorsements(p_account_id uuid, p_holder_id uuid, p_policy_ids uuid[])` (`02-master-coi-data-layer.md` Sec 4.7, R2): per-line `{line_key, addl_insd_resolved, subr_wvd_resolved, basis}`, where `addl_insd_resolved` and `subr_wvd_resolved` are text over the closed set `'endorsed' | 'requested' | 'none'` owned by 02 Sec 4.7. A line resolves `endorsed` for a holder ONLY when an AI row with `endorsement_status='endorsed'` is blanket-scoped OR matches the holder by `additional_insured_id` or by `normalize_entity_name(name)`; a second query tier reports `requested` when a blanket-scoped or holder-matched row exists with `endorsement_status='requested'`. BOTH the UI toggle gate and `generate-certificate` call this same RPC, so the gate and the printed Y/N can never disagree.
- An onboarded ACORD 25 template row in `acord_templates` with `form_number='25'`, `is_current=true`, populated `field_inventory`/`field_schema`, plus the Deno ports of `buildAcord25FieldValues`, `validateAcord25`, the field map, and the `ACORD25_TEMPLATE_SHA256` pin in `supabase/functions/_shared/acord25/` (`05-acord25-pipeline.md`, R1), guarded by a parity-fixture test shared with the client build.
- The generator page at route `/certificates` (`06-ui-surfaces.md`, R19) collects the user's selections and calls `generate-certificate` via a `useIssueCertificate` hook that wraps `supabase.functions.invoke('generate-certificate')`; it imports `CertificateIssuanceLog` from this design (R17).

---

## 3. Data model

All DDL lives in one new migration: `supabase/migrations/2026MMDDHHMMSS_certificates_issuance.sql` (timestamp assigned at implementation time; must sort after all existing migrations and after the `additional_insureds` migration from 03). Per R22b, every `ALTER TABLE ... ADD CONSTRAINT` is wrapped in a DO-block `IF NOT EXISTS` guard against `pg_constraint`, tables use `CREATE TABLE IF NOT EXISTS`, functions use `CREATE OR REPLACE`, indexes use `CREATE INDEX IF NOT EXISTS`, and triggers/policies use `DROP ... IF EXISTS` then `CREATE`, so the migration is re-runnable.

### 3.1 `certificates` (the issued-certificate record)

```sql
CREATE TABLE public.certificates (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy and subjects (reparentable navigation metadata, NOT frozen; see 3.5 / R4)
  agency_workspace_id   uuid NOT NULL REFERENCES public.agency_workspaces(id),
  account_id            uuid NOT NULL REFERENCES public.accounts(id),
  holder_id             uuid NOT NULL REFERENCES public.additional_insureds(id),

  -- Identity
  certificate_number    text UNIQUE NOT NULL,
  revision              integer NOT NULL DEFAULT 0,

  -- Frozen provenance (also duplicated inside snapshot for self-containment)
  template_id           uuid NOT NULL REFERENCES public.acord_templates(id),
  template_version      text NOT NULL,           -- acord_templates.version at issue time
  acord_edition         text NOT NULL,           -- e.g. 'ACORD 25 (2016/03)'
  source_form_id        uuid REFERENCES public.acord_forms(id),  -- optional provenance only (R1)

  -- The immutable freeze
  snapshot              jsonb NOT NULL,
  snapshot_sha256       text NOT NULL,           -- sha256 of canonical snapshot JSON
  pdf_sha256            text NOT NULL,           -- sha256 of stored PDF bytes

  -- Stored artifact (authoritative pointer; documents row is a convenience copy)
  storage_bucket        text NOT NULL DEFAULT 'coi-certificates',
  storage_path          text NOT NULL,           -- {account_id}/{certificate_id}/{certificate_number}.pdf
  size_bytes            bigint NOT NULL,

  -- Convenience pointer into the Documents tab (nullable; see Section 6.3)
  document_id           uuid REFERENCES public.documents(id) ON DELETE SET NULL,

  -- Workflow
  status                text NOT NULL DEFAULT 'issued'
                          CHECK (status IN ('issued','sent','voided','superseded')),

  -- Issuance stamps (frozen)
  issued_by             uuid NOT NULL REFERENCES auth.users(id),
  issued_at             timestamptz NOT NULL DEFAULT now(),

  -- Delivery stamps (mutable via send-coi-email only; last send wins, history in events)
  sent_to               text,
  sent_at               timestamptz,

  -- Supersede chain (corrected reissues)
  supersedes_id         uuid REFERENCES public.certificates(id),
  superseded_by_id      uuid REFERENCES public.certificates(id),

  -- Void stamps
  voided_at             timestamptz,
  voided_by             uuid REFERENCES auth.users(id),
  void_reason           text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One corrected successor per certificate, and a cert corrects at most one ancestor
CREATE UNIQUE INDEX idx_certificates_supersedes
  ON public.certificates(supersedes_id) WHERE supersedes_id IS NOT NULL;

CREATE INDEX idx_certificates_account   ON public.certificates(account_id, created_at DESC);
CREATE INDEX idx_certificates_holder    ON public.certificates(holder_id);
CREATE INDEX idx_certificates_status    ON public.certificates(status);
CREATE INDEX idx_certificates_workspace ON public.certificates(agency_workspace_id);
```

Column decisions and rationale:

- No draft status, no draft rows (R20). A `certificates` row exists only once the PDF has been generated, hashed, and uploaded. Drafting happens upstream in the generator (client state; `acord_forms` rows are OPTIONAL provenance via `source_form_id` only, never a write path of generation, R1). This is what makes trigger-based immutability simple: there is no "editable while draft" carve-out, which is exactly the hole System B fell through (its single mutable row served as draft, issued, and history simultaneously; see status drift at src/hooks/useCOIGeneration.ts:285). Draft support ("save and resume a generator session") is a noted future enhancement, to be backed by `acord_forms` rows if ever built.
- `agency_workspace_id` is NOT NULL (R14). It is derived server-side inside `finalize_certificate_issue` from `accounts.agency_workspace_id`, with the sec005 orphan fallback (first workspace by `created_at`) when the legacy account carries NULL (supabase/migrations/20260408100000_sec005_leads_workspace_isolation.sql:34-37 is the precedent). It is NOT frozen: like `account_id` and `holder_id` it is reparentable metadata that merge or workspace tooling may legitimately update; the snapshot preserves the as-issued identities.
- `template_id`/`template_version`/`acord_edition` are typed columns for querying ("every cert issued on the 2016/03 edition") even though the same values are frozen inside `snapshot`. This implements the handoff's edition-drift rule (ACORD_COI_Module_Handoff.md Section 5, form edition drift).
- `document_id ... ON DELETE SET NULL`: a hard delete of the documents row (not the normal path; deletes are soft per src/hooks/useDocumentManager.ts:309-319) must not break the certificate.
- `revision` is frozen at insert: 0 for originals, `parent.revision + 1` for reissues. It feeds the ACORD 25 header revision field (the 2016/03 edition carries certificate number and revision number header fields; map them from the template's extracted `field_inventory`, never invented names, per handoff Section 5 field-ID discipline).
- `storage_bucket` defaults `'coi-certificates'` (R5). The column stays (rather than hardcoding) so a future bucket migration is a data change, not a schema change; the freeze trigger prevents per-row drift.

### 3.2 `certificate_policies` (junction, navigation only)

```sql
CREATE TABLE public.certificate_policies (
  certificate_id       uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  policy_id            uuid NOT NULL REFERENCES public.policies(id) ON DELETE RESTRICT,
  agency_workspace_id  uuid NOT NULL REFERENCES public.agency_workspaces(id),
  line_key             text NOT NULL CHECK (line_key IN
                         ('gl','auto','umbrella','wc','property','other')),
  insurer_letter       char(1) NOT NULL CHECK (insurer_letter IN ('A','B','C','D','E','F')),
  PRIMARY KEY (certificate_id, policy_id, line_key)
);

CREATE INDEX idx_certificate_policies_policy    ON public.certificate_policies(policy_id);
CREATE INDEX idx_certificate_policies_workspace ON public.certificate_policies(agency_workspace_id);
```

Decision: per-line data is NOT duplicated here beyond the two navigation keys (`line_key`, `insurer_letter`). The full per-line freeze (limits, dates, policy number text, ADDL INSD status, waiver) lives only in `snapshot.lines[]`. Rationale: the snapshot must be self-contained so a certificate is fully reconstructable and legally interpretable from one JSONB value even if the `policies` row is later edited, merged, or soft-deleted; duplicating typed line data in the junction would create a second freeze that can drift from the first. The junction answers exactly two queries: "which certificates reference policy X" (renewal-time reissue prompts, policy detail page badges) and "which policies were on certificate Y" without JSONB unnesting.

`line_key` stores the canonical keys directly (R7); the key-to-display-name mapping is published once in `02-master-coi-data-layer.md`.

FK behavior (R4): `policy_id` is explicitly `ON DELETE RESTRICT`, so a hard delete of a referenced policy is blocked; the app's regime is soft deletes anyway (CLAUDE.md invariant 6). See Section 3.8 for the required interaction with the account-merge policy de-dup step. `certificate_id` CASCADE is moot because certificate deletes are blocked by trigger (Section 3.5) but is included for hygiene if the trigger is ever dropped by migration.

### 3.3 `certificate_events` (issuance log / audit)

```sql
CREATE TABLE public.certificate_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id       uuid NOT NULL REFERENCES public.certificates(id) ON DELETE CASCADE,
  agency_workspace_id  uuid NOT NULL REFERENCES public.agency_workspaces(id),
  action               text NOT NULL CHECK (action IN
                         ('generated','previewed','downloaded','emailed',
                          'reissued','voided','document_restored')),
  actor_id             uuid REFERENCES auth.users(id),
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_certificate_events_cert      ON public.certificate_events(certificate_id, created_at DESC);
CREATE INDEX idx_certificate_events_workspace ON public.certificate_events(agency_workspace_id);

-- Fill trigger: every writer may omit agency_workspace_id; it is copied from the parent
-- certificate so the child can never disagree with the parent. Same trigger shape exists
-- for certificate_policies as a backstop (finalize passes it explicitly).
CREATE OR REPLACE FUNCTION public.certificate_child_fill_workspace()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.agency_workspace_id IS NULL THEN
    SELECT c.agency_workspace_id INTO NEW.agency_workspace_id
    FROM public.certificates c WHERE c.id = NEW.certificate_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER certificate_events_fill_workspace
BEFORE INSERT ON public.certificate_events
FOR EACH ROW EXECUTE FUNCTION public.certificate_child_fill_workspace();

CREATE TRIGGER certificate_policies_fill_workspace
BEFORE INSERT ON public.certificate_policies
FOR EACH ROW EXECUTE FUNCTION public.certificate_child_fill_workspace();
```

Taxonomy mapping from System B's `coi_audit_log` CHECK (supabase/migrations/20251011013849_...sql:19): `generated -> generated`, `downloaded -> downloaded`, `emailed -> emailed`, `previewed -> previewed`, `revised -> reissued` (clearer: it marks the OLD cert when a successor is issued), `cancelled -> voided`. Added: `document_restored` for the re-export affordance (Section 6.3). System B's `ip_address`/`user_agent` columns are dropped; anything of that nature goes in `metadata`.

Event semantics:
- `generated`: written by the finalize RPC at issue time. metadata: `{ "certificate_number": ..., "supersedes": <uuid|null> }`.
- `emailed`: written by `send-coi-email` (service role). metadata: `{ "to": ..., "cc": [...], "resend_id": ... }`.
- `reissued`: written on the OLD certificate by the finalize RPC when `supersedes_id` is set. metadata: `{ "superseded_by": <uuid>, "new_certificate_number": ... }`.
- `voided`: written by `void_certificate`. metadata: `{ "reason": ... }`.
- `previewed` / `downloaded`: client-logged via `log_certificate_event` when a staff user opens or downloads the PDF from the issuance log.
- `document_restored`: written by `restore_certificate_document`.

### 3.4 Numbering: counter table + BEFORE INSERT trigger

Decision: sequential per year, format `COI-YYYY-NNNNN` (keeps System B's visual convention, which has zero prod collisions to worry about since `certificates_of_insurance` has 0 rows).

Why sequential, not System B's random (supabase/migrations/20251011003211_...sql:237):
- Random 5 digits caps at 99,999 per year with birthday-collision retry churn growing as volume grows; sequential never retries.
- Sequential numbers give holders, carriers, and auditors an obvious ordering and make the supersede chain legible ("00042 replaced by 00051").
- System B's plausible reason for randomness (unguessable numbers) protected its PUBLIC `certificates` bucket (supabase/migrations/20251011012403_...sql:6). This design has no public artifacts: the `coi-certificates` bucket is private, reads are signed URLs behind staff RLS. Enumeration resistance buys nothing.

```sql
CREATE TABLE public.certificate_number_counters (
  year        integer PRIMARY KEY,
  last_value  integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_certificate_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := EXTRACT(YEAR FROM now())::integer;
  v_seq  integer;
BEGIN
  INSERT INTO public.certificate_number_counters AS c (year, last_value)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO v_seq;
  RETURN 'COI-' || v_year::text || '-' || LPAD(v_seq::text, 5, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_certificate_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_certificate_number() TO service_role;
-- Explicit grant per R22a, matching the _do_account_merge lockdown pattern
-- (supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql:264-265).

CREATE OR REPLACE FUNCTION public.set_certificate_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.certificate_number IS NULL THEN
    NEW.certificate_number := public.next_certificate_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_certificate_number_trigger
BEFORE INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.set_certificate_number();
```

The fill-only-when-NULL guard mirrors System B's `set_coi_number` (supabase/migrations/20251011003211_...sql:269-271) and is load-bearing: the edge function reserves a number FIRST (separate call to `next_certificate_number()` in its own transaction) so the number can be printed into the ACORD 25 certificate-number header field during fill, then passes the reserved number explicitly to the finalize RPC. Consequence: a generation that fails after reservation burns the number and leaves a gap. Accepted: COI numbering has no gapless requirement, and gaps correlate one-to-one with failed generations visible in edge logs. Concurrency: the ON CONFLICT UPDATE takes a row lock on the year row, serializing concurrent issuances; at agency volume this is irrelevant.

### 3.5 Immutability enforcement: trigger freeze AND privilege design (both)

Decision: both mechanisms, because they fail independently. The trigger stops privileged mistakes (a future migration, a service-role script, a well-meaning support query); the privilege design stops the entire class of client-side writes without needing the trigger to enumerate them.

Privilege design (R1):
- Authenticated users: SELECT only. `REVOKE INSERT, UPDATE, DELETE ON public.certificates, public.certificate_policies, public.certificate_events FROM authenticated, anon;`
- All inserts happen via the `generate-certificate` edge function (service role, bypasses RLS) calling `finalize_certificate_issue`. The client NEVER sends pdf bytes and NEVER performs storage uploads, documents inserts, or certificate inserts.
- The only post-issue mutations are: `void_certificate` (SECURITY DEFINER, staff-gated), the send stamps written inside `send-coi-email` (service role), `superseded_by_id`+status stamped by `finalize_certificate_issue` during a reissue, `document_id` repointed by `restore_certificate_document`, and FK reparenting performed by the merge engines (`_do_account_merge`, `_do_additional_insured_merge`), which run as service_role/postgres or SECURITY DEFINER.

Trigger freeze (R4: `account_id`, `holder_id`, and `agency_workspace_id` are deliberately ABSENT from the frozen list):

```sql
CREATE OR REPLACE FUNCTION public.certificates_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'certificates are immutable: delete is not allowed (void instead), id=%', OLD.id;
  END IF;

  -- Frozen columns: any change is an error, regardless of role.
  -- account_id, holder_id, and agency_workspace_id are NOT frozen (R4): they are
  -- reparentable navigation metadata that the FK-introspecting merge engines
  -- (_do_account_merge, _do_additional_insured_merge) must be able to UPDATE.
  -- The as-issued insured and holder identities are preserved inside snapshot.
  -- Client tampering with them is impossible anyway: authenticated has no UPDATE grant.
  IF NEW.certificate_number  IS DISTINCT FROM OLD.certificate_number
  OR NEW.revision            IS DISTINCT FROM OLD.revision
  OR NEW.template_id         IS DISTINCT FROM OLD.template_id
  OR NEW.template_version    IS DISTINCT FROM OLD.template_version
  OR NEW.acord_edition       IS DISTINCT FROM OLD.acord_edition
  OR NEW.source_form_id      IS DISTINCT FROM OLD.source_form_id
  OR NEW.snapshot            IS DISTINCT FROM OLD.snapshot
  OR NEW.snapshot_sha256     IS DISTINCT FROM OLD.snapshot_sha256
  OR NEW.pdf_sha256          IS DISTINCT FROM OLD.pdf_sha256
  OR NEW.storage_bucket      IS DISTINCT FROM OLD.storage_bucket
  OR NEW.storage_path        IS DISTINCT FROM OLD.storage_path
  OR NEW.size_bytes          IS DISTINCT FROM OLD.size_bytes
  OR NEW.issued_by           IS DISTINCT FROM OLD.issued_by
  OR NEW.issued_at           IS DISTINCT FROM OLD.issued_at
  OR NEW.supersedes_id       IS DISTINCT FROM OLD.supersedes_id
  OR NEW.created_at          IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'certificates are immutable: frozen column changed on id=%', OLD.id;
  END IF;

  -- superseded_by_id is write-once
  IF OLD.superseded_by_id IS NOT NULL
     AND NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id THEN
    RAISE EXCEPTION 'superseded_by_id is write-once on id=%', OLD.id;
  END IF;

  -- Legal status transitions only
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'issued' AND NEW.status IN ('sent','voided','superseded')) OR
      (OLD.status = 'sent'   AND NEW.status IN ('voided','superseded'))
    ) THEN
      RAISE EXCEPTION 'illegal certificate status transition % -> % on id=%',
        OLD.status, NEW.status, OLD.id;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER certificates_immutability
BEFORE UPDATE OR DELETE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.certificates_enforce_immutability();
```

Companion append-only triggers:

```sql
CREATE OR REPLACE FUNCTION public.block_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only: % not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER certificate_policies_frozen
BEFORE UPDATE OR DELETE ON public.certificate_policies
FOR EACH ROW EXECUTE FUNCTION public.block_write();

CREATE TRIGGER certificate_events_append_only
BEFORE UPDATE OR DELETE ON public.certificate_events
FOR EACH ROW EXECUTE FUNCTION public.block_write();
```

There is deliberately no escape hatch. If a genuine emergency requires correcting a frozen row, the correction is itself a migration that drops the trigger, mutates, and recreates it, leaving a permanent trace in the repo.

Why not System B's versions-JSONB append pattern for immutability: `append_coi_version` (supabase/migrations/20251011013105_...sql:7-22) appends history into a JSONB array but the row it appends to stays a normal UPDATE-able row; nothing froze the live columns, so "history" and "current truth" could diverge silently. Supersede-chained immutable rows keep every version as a first-class queryable row with its own number, PDF, and events, which is also what certificate holders actually receive in the real world (a corrected cert is a new document, not an edit).

### 3.6 RLS (R14 posture)

```sql
ALTER TABLE public.certificates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_policies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY certificates_select ON public.certificates
  FOR SELECT USING (public.is_staff() AND public.is_agency_member(agency_workspace_id));

CREATE POLICY certificate_policies_select ON public.certificate_policies
  FOR SELECT USING (public.is_staff() AND public.is_agency_member(agency_workspace_id));

CREATE POLICY certificate_events_select ON public.certificate_events
  FOR SELECT USING (public.is_staff() AND public.is_agency_member(agency_workspace_id));

-- No INSERT/UPDATE/DELETE policies on any of the four tables:
-- writes are service-role (bypasses RLS) or SECURITY DEFINER RPCs only.
-- certificate_number_counters has NO select policy either; clients never read it.

GRANT SELECT ON public.certificates, public.certificate_policies,
              public.certificate_events TO authenticated;
REVOKE ALL ON public.certificate_number_counters FROM authenticated, anon;
```

Rationale: this is the uniform module posture (R14), matching the Phase 0 fix for `acord_forms` in `01-disposition-and-roadmap.md` and mirroring the sec005 leads isolation (supabase/migrations/20260408100000_sec005_leads_workspace_isolation.sql). `is_staff()` is the SECURITY DEFINER helper at supabase/migrations/20260410000011_fix_is_staff_function.sql:5-18; `is_agency_member()` is the SECURITY DEFINER helper at supabase/migrations/20251228000000_m0_agency_workspace_foundation.sql:125-140 (returns FALSE on NULL, which is why `agency_workspace_id` is NOT NULL with the orphan fallback, Section 7.4). It deliberately avoids two failure modes: System B's `account_memberships` predicate that blocked all staff writes in practice (Section 1.1), and System A's `auth.uid() IS NOT NULL` free-for-all on `acord_forms` (supabase/migrations/20251218204626_...sql:390-392).

Customer-portal visibility is explicitly out of scope: certificates never appear to `account_memberships` users in v1. If portal visibility is wanted later, the hooks are already in place: an optional member-SELECT storage policy keyed on the account-first path segment (Section 3.7) plus a portal-scoped table policy.

### 3.7 The `coi-certificates` bucket (R5)

The issuance migration creates the bucket and its storage policies:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('coi-certificates', 'coi-certificates', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "coi_certificates_staff_read" ON storage.objects;
CREATE POLICY "coi_certificates_staff_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'coi-certificates' AND public.is_staff());

-- Deliberately NO INSERT policy: uploads happen only via the service role
--   (bypasses RLS) inside generate-certificate.
-- Deliberately NO UPDATE policy for ANY role: objects are immutable, matching
--   the row-level freeze. Nothing can overwrite issued bytes.
-- Deliberately NO DELETE policy: only the service role (compensating cleanup on a
--   failed finalize, Section 7.5) can remove an object.
```

Object key convention: `{account_id}/{certificate_id}/{certificate_number}.pdf`. The account-UUID-first segment is kept so an optional future member-SELECT policy can be keyed on `(storage.foldername(name))[1]` for portal visibility (R5), mirroring the original documents-bucket convention. `contentType: 'application/pdf'`, `upsert: false`.

Because `account_id` on the row is reparentable (Section 3.5) while `storage_path` is frozen, a certificate on a merged account keeps its as-issued account UUID in the path. This is intentional and harmless today (the SELECT policy is staff-wide, not path-derived); the note above about a future member-SELECT policy must account for merged accounts by also consulting `certificates.account_id`.

Signed-URL reads: staff clients call `createSignedUrl(cert.storage_path, 3600)` against this bucket; the SELECT policy authorizes it. `downloadCertificate` in `useCertificates` (Section 9.1) additionally verifies the fetched bytes hash to `certificates.pdf_sha256` before handing the file to the user (R5).

Working-copy and template PDFs for the `/acord-forms` editor are NOT affected: they stay in the `documents` bucket with account-UUID-first keys (owned by `05-acord25-pipeline.md`). Re-privatizing the public `documents` bucket is a separate hardening task outside this module, tracked in `01-disposition-and-roadmap.md`.

### 3.8 Merge-engine interactions (R4)

With `account_id`, `holder_id`, and `agency_workspace_id` unfrozen:

- Account merges: `_do_account_merge`'s FK-introspection loop (supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql:143-206) discovers `certificates.account_id` and reparents it to the survivor. This now succeeds (no freeze exception). The snapshot's `insured` block keeps the as-issued identity, so history is intact.
- Holder merges: 03's `_do_additional_insured_merge` reparents `certificates.holder_id` to the surviving holder the same way. The snapshot's `holder` block keeps the as-issued identity.
- Policy de-dup skip (REQUIRED, R4): `_do_account_merge` soft-deletes duplicate policies inside the merged cluster (dedup CTE and `update public.policies set deleted_at = now()` at 20260629240000:127-141). The issuance migration package ships a small `CREATE OR REPLACE FUNCTION public._do_account_merge(...)` whose de-dup selection excludes any policy referenced by `certificate_policies`:

  ```sql
  -- inside the ranked/v_pol_dedup selection:
  select coalesce(array_agg(id), '{}') into v_pol_dedup
  from ranked
  where rn > 1
    and id NOT IN (select policy_id from public.certificate_policies);
  ```

  Rationale: a policy row cited by an issued certificate must never be the soft-deleted loser of a de-dup group, both because `certificate_policies.policy_id` is `ON DELETE RESTRICT` (a later hard-delete cleanup would abort) and because the junction's navigation value ("which certs reference this policy") dies with the row's liveness. The sequencing of this CREATE OR REPLACE relative to the phases is recorded in `01-disposition-and-roadmap.md`.
- `account_coi_profiles` allowlist: the Master COI data layer's `account_coi_profiles` table (PK = `account_id`, no `id` column) must be added to `_do_account_merge`'s `v_safe_delete` allowlist with survivor-wins semantics, or account merges abort on the unique-collision guard. That patch is owned by `02-master-coi-data-layer.md` (R4) and ships in Phase 3 via 02's migration `20260702091500`, so it is live before this subsystem exists and there is no Phase 3-to-5 risk window. The Phase 5 issuance-migration CREATE OR REPLACE that adds the de-dup skip above must start from the Phase 3 function body (allowlist included) so the later replacement does not regress the earlier patch.

Acceptance tests (R4, added to Section 11's test list): account merge where a loser has issued certificates succeeds and reparents `certificates.account_id`; holder merge with issued certificates succeeds and reparents `holder_id`; unmerge restores the prior FK values; the policy de-dup step never soft-deletes a policy present in `certificate_policies`; an account merge with `account_coi_profiles` rows on both sides succeeds survivor-wins.

---

## 4. The snapshot JSONB (exact schema)

`certificates.snapshot` is the single self-contained freeze. It contains everything needed to (a) legally interpret the cert later and (b) re-render a byte-equivalent PDF from the pinned template. Built exclusively server-side by `generate-certificate` from DB reads; the client contributes only ids, selections, per-line print intent, and free text (Section 7.2).

```jsonc
{
  "snapshot_version": 1,                     // bump on schema change; readers switch on it
  "certificate_number": "COI-2026-00042",
  "revision": 0,

  "form": {
    "form_number": "25",
    "template_id": "<uuid>",                 // acord_templates.id
    "template_version": "2016/03",           // acord_templates.version
    "acord_edition": "ACORD 25 (2016/03)",
    "template_pdf_sha256": "<hex>"           // hash of the blank template used (ACORD25_TEMPLATE_SHA256 pin, 05)
  },

  // The exact map handed to the fill engine. Authoritative render input.
  // Keys are the template's extracted AcroForm field names, never invented.
  // Values are EXACTLY what buildAcord25FieldValues emits (R8):
  //   boolean            for checkbox fields,
  //   'Y' | 'N' | ''     for Y/N text code fields,
  //   formatted string   for everything else.
  // There are NO '/1' or '/Off' export-value strings anywhere in this map.
  "field_values": { "<acord-field-name>": "<string | boolean>" },

  "producer": {
    "name": "Lewis & Lewis Insurance",
    "address": "...", "phone": "...", "email": "..."
  },

  "insured": {
    "account_id": "<uuid>",
    "name": "...", "dba": null,
    "address": { "line1": "...", "city": "...", "state": "..", "zip": "..." }
  },

  // Insurer letter map, A-F, copied verbatim from get_master_coi (R7).
  // Every line below must reference a populated letter.
  "insurers": {
    "A": { "carrier_id": "<uuid|null>", "name": "...", "naic": "12345" },
    "B": { "carrier_id": null, "name": "...", "naic": null }
  },

  // One entry per coverage line printed on the cert. get_master_coi is the source.
  // line_key uses the canonical vocabulary: gl | auto | umbrella | wc | property | other.
  "lines": [
    {
      "line_key": "gl",
      "policy_id": "<uuid>",
      "policy_number": "GL-123456",
      "insurer_letter": "A",
      "effective_date": "2026-01-01",
      "expiration_date": "2027-01-01",
      "limits": { "each_occurrence": 1000000, "general_aggregate": 2000000,
                  "products_completed_ops": 2000000, "personal_adv_injury": 1000000 },

      "addl_insd": "N",                       // literal Y/N as printed
      "addl_insd_intent": true,               // the request's per_line intent (audit)
      "addl_insd_resolved": "requested",      // resolve_holder_endorsements output; closed set 'endorsed' | 'requested' | 'none' owned by 02 Sec 4.7
      "subr_wvd": "N",                        // literal Y/N as printed
      "subr_wvd_intent": false,
      "subr_wvd_resolved": "none",
      "endorsement_basis": null               // basis string from resolve_holder_endorsements when endorsed
    }
  ],

  "holder": {
    "additional_insured_id": "<uuid>",
    "name": "Enterprise Fleet Management",
    "address": { "line1": "...", "city": "...", "state": "..", "zip": "..." }
  },

  "description_of_operations": "...",         // user-entered free text (own field, R18)
  "remarks": null,                            // user-entered free text (own field, R18); overflow is a 422, never an addendum (R16)

  "master_coi": {                             // provenance of the coverage data
    "as_of": "2026-07-02T15:04:05Z",          // when get_master_coi was read
    "source": "master_coi"                    // reserved for future source variants
  }
}
```

Rules encoded at snapshot-build time (validation, all server-side, from handoff Section 5 plus R2/R3/R6/R7/R8/R16):

- Every `lines[].insurer_letter` must resolve to a populated `insurers` entry; distinct carriers get distinct letters. The letter map comes from `get_master_coi` and is the single authority (R7); the request's letters are only a cross-check. Violation: 422, nothing persisted.
- `addl_insd` may be `"Y"` ONLY when `resolve_holder_endorsements` returned `addl_insd_resolved = 'endorsed'` for THIS (line, holder) pair AND the request's `per_line.addl_insd` intent is true (R2, R3). Same rule for `subr_wvd` against `subr_wvd_resolved`. Intent true on a non-endorsed pair: 422. Intent false on an endorsed pair: prints `"N"` (downgrade allowed). Line-level endorsement status alone NEVER produces a Y.
- Y/N fields are literal `"Y"`/`"N"` strings in `field_values` only where the template field is a text code field; checkbox fields are booleans (R8). Checkbox export values are resolved inside the fill engine from the template `field_schema`, never stored in the snapshot.
- Readiness blockers from `get_master_coi` (`no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `policy_expired`, `insurer_overflow`, vocabulary owned by 02 Sec 2.7) have already 422ed before the snapshot is built (R6), so a snapshot can never contain a blank limit, a blank date, an expired policy printed as in-force, or more distinct carriers than the six insurer letters can hold.
- No premium anywhere: the builder asserts no `field_values` key matching the template's premium-related fields is populated and the snapshot schema simply has no premium slot.
- `field_values` and the structured blocks are written from the same in-memory object in one pass, so they cannot disagree at issue time; the structured blocks exist for humans and SQL, `field_values` exists for re-rendering.
- Description/remarks overflow beyond the ACORD 25 field capacity is a pre-generation validation error surfaced by `validateAcord25` ("shorten by N characters"); there is NO addendum page (R16; ACORD 101 is a future enhancement).

Snapshot-replay round-trip test (R8, in Section 11's test list): store a snapshot, reload it, refill the pinned template from `snapshot.field_values` through the ported fill core, extract the field values from the produced PDF, and assert equality with the stored map (checkbox booleans included).

Storage cost: roughly 10 to 30 KB per certificate. Negligible.

---

## 5. Status workflow and reissue/void mechanics

### 5.1 Workflow

```
                 +---------> voided        (terminal)
                 |
issued ----+-----+---------> superseded    (terminal, via reissue)
           |
           +---> sent -------+-----------> voided      (terminal)
                             +-----------> superseded  (terminal, via reissue)
```

- `issued`: PDF exists, row frozen. Downloadable, emailable.
- `sent`: at least one successful email delivery. Re-sending stays `sent` (stamps update, events accumulate).
- `superseded`: a corrected successor exists. Still viewable and downloadable (it is history a holder may physically possess); not emailable; UI shows "Replaced by COI-YYYY-NNNNN".
- `voided`: issued in error. Still viewable and downloadable (audit); not emailable; UI shows the void reason and badges it visibly.

All four statuses are UI-visible and MUST be covered by the single `CERT_PILL` map (Section 9.1, R11): `issued` renders neutral, `sent` renders success, `superseded` renders muted, `voided` renders danger.

Why no `draft`, `pending_review`, `approved` (System B's commented workflow, supabase/migrations/20251011003211_...sql:73): those are states of the WORK, not of the CERTIFICATE. Review/approval belongs in the generator surface before anything is issued; putting pre-issue states on the immutable table would force mutability carve-outs and recreate System B's drift. Per R20 there is no draft state anywhere in v1 and no `useSaveCertificateDraft`/`useCertificateDraft` hooks; if an approval gate or draft support is later required, it gates or feeds the `generate-certificate` call (acord_forms-backed), not this table.

### 5.2 Reissue (corrected certificate)

Never edit an issued cert. Flow:

1. User clicks "Reissue corrected" on a cert with status `issued` or `sent` in the issuance log.
2. Generator opens prefilled from `snapshot` (holder, lines, DOO, remarks) so the user changes only what was wrong. Current `get_master_coi` data is re-read for the coverage lines; the snapshot prefill is a starting selection, not a data bypass. The user re-previews (a fresh `preview_sha256` is computed; R9 applies to reissues identically).
3. Generator calls `generate-certificate` with `supersedes_certificate_id` set.
4. Inside `finalize_certificate_issue` (one transaction): validate the ancestor exists, has status `issued` or `sent`, and has NULL `superseded_by_id`; insert the new row with `supersedes_id = ancestor.id`, `revision = ancestor.revision + 1`; UPDATE the ancestor `SET superseded_by_id = <new id>, status = 'superseded'` (passes the freeze trigger: both changes are on the allowed list); insert `reissued` event on the ancestor and `generated` event on the new cert.

The unique partial index on `supersedes_id` (Section 3.1) makes double-correction impossible even under concurrency.

Voided certs cannot be reissued-from (guard in the RPC): if a voided cert needs a replacement, the user generates a fresh cert normally; there is nothing in a holder's hands to supersede.

### 5.3 Void

```sql
CREATE OR REPLACE FUNCTION public.void_certificate(
  p_certificate_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_workspace uuid;
BEGIN
  SELECT status, agency_workspace_id INTO v_status, v_workspace
    FROM public.certificates WHERE id = p_certificate_id FOR UPDATE;
  IF v_status IS NULL THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_workspace)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'void reason is required';
  END IF;
  IF v_status NOT IN ('issued','sent') THEN
    RAISE EXCEPTION 'cannot void a % certificate', v_status;
  END IF;

  UPDATE public.certificates
     SET status = 'voided', voided_at = now(), voided_by = auth.uid(),
         void_reason = trim(p_reason)
   WHERE id = p_certificate_id;

  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, 'voided', auth.uid(), jsonb_build_object('reason', trim(p_reason)));
END;
$$;
REVOKE ALL ON FUNCTION public.void_certificate(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_certificate(uuid, text) TO authenticated;
```

Voiding semantics: status change plus stamps only. The PDF stays in storage, the documents row stays in the tab (a cert the customer or holder may already have must remain auditable), and the number is never recycled. If the agency wants the documents-tab copy gone after a void, the user soft-deletes that row through the existing tab action; the certificate row is unaffected (Section 6.3).

---

## 6. Documents-tab integration

### 6.1 The pointer contract (row shape from ground truth; bucket per R5)

Executed server-side by `generate-certificate` with the service role:

1. Upload the PDF bytes to the private `coi-certificates` bucket at `{accountId}/{certificateId}/{certificateNumber}.pdf` (Section 3.7). `contentType: 'application/pdf'`, `upsert: false`. Never the public `documents` bucket (Section 1.2) and never the `acord-forms/...` prefix precedent (src/hooks/useAcordForms.ts:322).
2. Insert ONE row into `public.documents` (inside `finalize_certificate_issue`, Section 7.4):

```ts
{
  account_id: accountId,                    // the only fetch filter; this alone surfaces it in the tab
  kind: 'customer_document',                // NOT NULL
  filename: `ACORD 25 - ${holderName} - ${isoDate} - ${certificateNumber}.pdf`,
  name:     `ACORD 25 - ${holderName} - ${isoDate} - ${certificateNumber}.pdf`,  // rendered title
  storage_path: uploadPath,                 // {accountId}/{certificateId}/{certificateNumber}.pdf
  storage_bucket: 'coi-certificates',       // tab resolves doc.storage_bucket FIRST (useDocumentManager.ts:148-173)
  mime_type: 'application/pdf',
  size_bytes: pdfBytes.byteLength,          // tab reads size_bytes, not file_size
  sha256: pdfSha256,                        // column exists per 20250908182341
  file_missing: false,
  uploaded_by: issuingUserId,               // the staff user, not null, drives tab ownership actions
  document_type: 'coi',                     // legal per 20260120200000; matches the certificates auto-routing queue
  policy_id: representativePolicyId ?? null // first gl line's policy, else first line, else null
  // category: omitted (enum has no coi value; badge simply does not render)
  // org_id: NEVER set
  // pii_level: omitted, defaults 'medium'
}
```

3. Never persist `getPublicUrl` output anywhere. On the private `coi-certificates` bucket it is dead by construction; on the public `documents` bucket it is a leak, which is one of the reasons issued certs do not live there.
4. The insert happens inside `finalize_certificate_issue` (same transaction as the certificate row) so the pointer and the certificate can never exist without each other at issue time. The storage upload is the one non-transactional step and is compensated on failure (Section 7.5).
5. After a same-page generation the client invalidates queryKey `['documents']` and calls the certificates refetch; cross-page needs no wiring (fetch-on-mount, src/hooks/useDocumentManager.ts:369-373).

Keep `document_type='coi'`, not `'certificate'`, so the existing certificates auto-routing queue rule matches (supabase/migrations/20251204000003_add_document_classification.sql:253).

Tab behavior notes: staff View/Download work unchanged because `useDocumentManager` signs against `doc.storage_bucket` first (src/hooks/useDocumentManager.ts:148-173) and the `coi-certificates` SELECT policy admits staff. Portal members (account_memberships users) can SEE the pointer row through documents-table RLS but cannot sign the object until the optional member-SELECT storage policy is added; that is consistent with certificates being staff-only in v1 (Section 3.6).

### 6.2 Division of authority

The `documents` row is a convenience pointer for the Documents tab. Immutability, provenance, and the authoritative storage pointer live on `certificates` (`storage_bucket`, `storage_path`, `pdf_sha256`, `size_bytes`). The issuance log NEVER reads through the documents row: its Download and View actions call `supabase.storage.from(cert.storage_bucket).createSignedUrl(cert.storage_path, 3600)` directly, and Download verifies the fetched bytes against `cert.pdf_sha256` before saving (R5).

### 6.3 Behavior when the user deletes (or replaces) the documents row

- Soft delete (the normal tab path, src/hooks/useDocumentManager.ts:299-335): the documents row gets `deleted_at`; the storage object is NOT removed; `certificates.document_id` still points at the soft-deleted row. Certificate downloads keep working (they bypass the row). No automatic resurrection: the user expressed intent to declutter the tab.
- Replace (src/hooks/useDocumentManager.ts:248-297): uploads to a NEW path and repoints the row. Note the replace upload targets the row's bucket; on `coi-certificates` an authenticated replace upload FAILS (no INSERT policy), which is correct: an issued certificate's tab entry is not user-replaceable. The tab surfaces the storage error; the certificate remains internally consistent.
- Hard delete (not reachable from the UI): FK `ON DELETE SET NULL` nulls `document_id`; certificate unaffected.

Re-export affordance: issuance log row action "Restore to Documents", shown when `document_id` is NULL or its row is soft-deleted or was replaced (detected client-side by comparing the joined documents row's `deleted_at`/`storage_path` against the certificate). It calls:

```sql
CREATE OR REPLACE FUNCTION public.restore_certificate_document(
  p_certificate_id uuid
) RETURNS uuid   -- new documents.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert record;
  v_doc_id uuid;
BEGIN
  SELECT * INTO v_cert FROM public.certificates WHERE id = p_certificate_id;
  IF v_cert.id IS NULL THEN RAISE EXCEPTION 'certificate not found'; END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_cert.agency_workspace_id)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  -- Refuse if a live, matching pointer already exists
  IF EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = v_cert.document_id
      AND d.deleted_at IS NULL
      AND d.storage_path = v_cert.storage_path
  ) THEN
    RAISE EXCEPTION 'documents row already present';
  END IF;

  INSERT INTO public.documents
    (account_id, kind, filename, name, storage_path, storage_bucket,
     mime_type, size_bytes, sha256, file_missing, uploaded_by, document_type)
  VALUES
    (v_cert.account_id, 'customer_document',
     (v_cert.snapshot->>'certificate_number') || ' (restored).pdf',
     'ACORD 25 - ' || (v_cert.snapshot->'holder'->>'name') || ' - '
       || v_cert.certificate_number || '.pdf',
     v_cert.storage_path, v_cert.storage_bucket,
     'application/pdf', v_cert.size_bytes, v_cert.pdf_sha256,
     false, auth.uid(), 'coi')
  RETURNING id INTO v_doc_id;

  UPDATE public.certificates SET document_id = v_doc_id WHERE id = p_certificate_id;

  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, 'document_restored', auth.uid(),
          jsonb_build_object('document_id', v_doc_id));

  RETURN v_doc_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_certificate_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_certificate_document(uuid) TO authenticated;
```

No re-upload: the storage object is the immutable original; only a fresh pointer row is minted. The `document_id` repoint passes the freeze trigger because `document_id` is not on the frozen list. (Note the freeze trigger allows `document_id` changes only via this function in practice, since authenticated users have no UPDATE grant.)

Any documents query this module adds must include `.is('deleted_at', null)` explicitly (pre-existing wart: staff see soft-deleted rows through the permissive policy stack).

---

## 7. Where generation executes: the `generate-certificate` edge function

### 7.1 Decision and justification (authoritative per R1)

Decision, settled by R1 as binding on all six documents: server-side edge function `supabase/functions/generate-certificate/index.ts` doing readiness gating + snapshot build + fill + upload + all inserts, with a single service-role-only finalize RPC for the transactional DB tail. This is the ONLY issuance path. The rejected alternative (client-side fill plus client-side inserts) appears in no document; client-side `fillAcordPdf` remains for the live preview ONLY.

Reasons:
1. Snapshot integrity. The snapshot is a legal freeze. If the client computed it, a tampered or merely buggy client could issue a cert whose snapshot disagrees with the database. Server-side, the function re-reads accounts, `get_master_coi`, `resolve_holder_endorsements`, the holder row, and the template row itself, and the client contributes only ids, selections, per-line print intent, free text, and the preview hash.
2. Atomicity. Client-side would chain four failure points (fill, storage upload, documents insert, certificates insert) across a browser session that can close mid-flow, with no cleanup authority. Server-side, everything after upload is one Postgres transaction, and the upload has a compensating delete.
3. Privilege minimization. Because inserts are server-side, authenticated users need zero write grants on the new tables (Section 3.5), and the storage INSERT is done by service role against a bucket with no client INSERT policy at all (Section 3.7), avoiding the broken `useAcordForms.generatePdf` precedent (src/hooks/useAcordForms.ts:322-345).
4. Feasibility is proven: pdf-lib already runs in this repo's Deno functions (supabase/functions/pdf-generation-worker/index.ts:8).

Shared server modules:
- `supabase/functions/_shared/acord25/`: the Deno ports of `buildAcord25FieldValues`, `validateAcord25`, the field map, the `ACORD25_TEMPLATE_SHA256` pin, and the `hashFieldValuesForPreview` helper with its `PREVIEW_HASH_EXCLUDED_FIELDS` constant (both owned by `05-acord25-pipeline.md` Sec 4.10; this document cites them and never redefines them). Owned and specified by `05-acord25-pipeline.md` (R1), guarded by a parity-fixture test shared with the client build.
- `supabase/functions/_shared/acord-fill.ts`: owned by THIS document. A trimmed Deno port of the fill core `fillAcordPdf` (src/lib/acord/pdfFiller.ts:38): text fields, checkboxes with per-field export values resolved from the template `field_schema`, Y/N literals, `updateFieldAppearances(font)` then `flatten()`. Per R16 there is NO addendum-page logic in this port: overflow never reaches the filler because `validateAcord25` hard-blocks it upstream. Header comments in BOTH files pin them to each other; the ACORD 25 round-trip test (fill then re-read fields) plus the parity fixture guard drift. The client-side pdfFiller.ts remains the engine for the interactive `/acord-forms` editor and previews; issuance uses the server port.

Preview stays client-side and free: the generator previews using the client build (`buildAcord25FieldValues` + `fillAcordPdf`) against the template without touching this subsystem (no certificate row exists pre-issuance, so pre-issue previews are not events; `previewed` events are post-issuance views from the log, Section 3.3). The preview build is bound to the issued build via `preview_sha256` (Section 7.3 step 7, R9).

### 7.2 Request/response contract

`POST /functions/v1/generate-certificate` (JWT required; add `[functions.generate-certificate]` with `verify_jwt = true` to supabase/config.toml following the existing entries at :37 onward).

The wire types below live in `src/types/certificates.ts` (Section 9.1) and are imported by 06's `useIssueCertificate` hook, which wraps `supabase.functions.invoke('generate-certificate')` (R1).

```ts
export type CertificateLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';

export interface GenerateCertificateRequest {
  account_id: string;
  holder_id: string;                    // additional_insureds.id
  lines: Array<{
    policy_id: string;
    line_key: CertificateLineKey;
    insurer_letter: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
                                        // cross-check ONLY (R7): the client echoes the letters
                                        // it displayed from get_master_coi; the server re-reads
                                        // get_master_coi and 422s on any mismatch. The server
                                        // NEVER trusts these as an assignment.
    per_line: {
      addl_insd: boolean;               // print intent; downgrade-only (R3)
      subr_wvd: boolean;                // print intent; downgrade-only (R3)
    };
  }>;
  description_of_operations: string;    // its own labeled field in the generator (R18)
  remarks?: string;                     // its own labeled field in the generator (R18)
  preview_sha256: string;               // hash of the client's previewed deterministic build (R9)
  supersedes_certificate_id?: string;
  source_form_id?: string;              // optional acord_forms provenance only (R1)
}

export interface GenerateCertificateResponse {
  certificate_id: string;               // R1 canonical trio
  certificate_number: string;           // R1 canonical trio
  signed_url: string;                   // R1 canonical trio; 3600s, for immediate download/preview
  document_id: string;                  // supplementary: the pointer row, for tab navigation
  warnings: string[];                   // supplementary: near-expiry within 30 days ONLY (R6)
}
```

The client does NOT send limits, dates, carrier names, NAIC, endorsement statuses, field values, or pdf bytes; the function reads those from `get_master_coi` and `resolve_holder_endorsements` (02). Per-line ADDL INSD / SUBR WVD print values are derived server-side per Section 4's rules (R2, R3).

`preview_sha256` (R9): the output of `hashFieldValuesForPreview(fieldValues)` applied to the deterministic `buildAcord25FieldValues` output. The helper and its `PREVIEW_HASH_EXCLUDED_FIELDS` constant are owned and defined by `05-acord25-pipeline.md` Sec 4.10; this document cites them and does not redefine the algorithm or the exclusion list. Per 05's constant, the template's certificate-number, revision-number, and form-date header fields are excluded from the hash (the server assigns or re-dates them at issue). The helper lives in the shared acord25 module with identical client and Deno copies guarded by the parity fixture (05). A mismatch between the client's `preview_sha256` and the server rebuild is a 409 (Section 7.3 step 7).

Error responses:

| Code | Meaning |
|---|---|
| 403 | caller not staff, or not a member of the account's workspace |
| 404 | account / holder / template / supersede target not found |
| 409 | `preview_sha256` mismatch: "data changed since preview, re-preview required" (R9) |
| 422 | structured error list: readiness blockers from get_master_coi (`no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `policy_expired`, `insurer_overflow`; R6), insurer-letter cross-check mismatch (R7), Y-intent on a non-endorsed (line, holder) pair (R3), overflow "shorten by N characters" (R16), template/validation failures, supersede-target state conflicts |
| 502 | storage upload failure after retry |
| 500 | finalize failure after compensating cleanup |

### 7.3 Internal sequence

1. CORS preflight, `requireAuth` (supabase/functions/_shared/auth.ts), then staff check by calling `.rpc('is_staff')` with a client built from the caller's JWT, and workspace membership check against the account's workspace via `.rpc('is_agency_member', ...)`. 403 if either fails.
2. Load and validate inputs with the service-role client: account exists and is not merged away (`merged_into_id` NULL); holder exists in `additional_insureds` and is not merged; each `policy_id` belongs to the account and is not soft-deleted; the current ACORD 25 template row (`form_number='25'`, `is_current=true`) exists and its blank PDF bytes hash to the `ACORD25_TEMPLATE_SHA256` pin; if `supersedes_certificate_id` given, ancestor is `issued`/`sent` with NULL `superseded_by_id`. Any failure: 404 or 422 with a structured error list, nothing persisted.
3. Readiness gate (R6): call `get_master_coi(p_account_id, p_policy_ids)` server-side. If ANY readiness blocker applies to the selected lines (`no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `policy_expired`, `insurer_overflow`; vocabulary defined once in `02-master-coi-data-layer.md` Sec 2.7), return 422 listing the blockers per line. `policy_expired` is a BLOCKER, never a warning. Collect the ONLY date warning: lines expiring within 30 days (returned in `warnings[]`).
4. Letter cross-check (R7): take the insurer-letter map from the same `get_master_coi` read (the single SQL letter authority). Compare against `request.lines[].insurer_letter`; on any mismatch return 422 listing per-line expected vs supplied ("preview is stale, re-open the generator").
5. Endorsement resolution (R2, R3): call `resolve_holder_endorsements(p_account_id, p_holder_id, p_policy_ids)`. For each line derive the printed values: `addl_insd = 'Y'` iff `per_line.addl_insd === true` AND `addl_insd_resolved === 'endorsed'`; if intent is true and resolution is not `endorsed`, return 422 ("holder is not endorsed on <line>"). Identically for `subr_wvd`. Intent false always prints `'N'` (downgrade allowed).
6. Build `field_values` via the Deno port of `buildAcord25FieldValues` (`_shared/acord25/`, 05) from the get_master_coi data, letter map, resolved print values, holder row, and free text; run `validateAcord25`, which includes the overflow hard block (422 "shorten by N characters", R16), letter-resolution and distinct-carrier checks, Y/N literal checks, and the no-premium assertion.
7. Preview binding (R9): compute `hashFieldValuesForPreview(serverFieldValues)` (helper and `PREVIEW_HASH_EXCLUDED_FIELDS` constant owned by 05 Sec 4.10) and compare with `request.preview_sha256`. Mismatch: 409 "data changed since preview, re-preview required", nothing persisted.
8. Reserve identity: `SELECT public.next_certificate_number()` via service role (its own transaction); generate `certificate_id = crypto.randomUUID()` so the storage path can embed it. Inject number and revision into the snapshot and into the number/revision header fields of `field_values` (excluded from the preview hash, along with the form-date header field, by 05 Sec 4.10's `PREVIEW_HASH_EXCLUDED_FIELDS`).
9. Fill via `_shared/acord-fill.ts` against the pinned template bytes; compute `pdf_sha256` (Web Crypto) and `snapshot_sha256` over `JSON.stringify` of the snapshot (the stored string is canonical by construction since it is hashed and stored by the same code path).
10. Upload to the `coi-certificates` bucket at `{account_id}/{certificate_id}/{certificate_number}.pdf`, `upsert:false` (Section 3.7). Retry once on transient failure; then 502, nothing persisted (number burned).
11. Call `finalize_certificate_issue(...)` (Section 7.4). On error: compensating `storage.from('coi-certificates').remove([path])` via service role; if the remove itself fails, log the orphan path with the certificate number (harmless: private bucket, referenced by nothing). Return 500.
12. Create a 3600s signed URL for the response; return 200 with `{certificate_id, certificate_number, signed_url, document_id, warnings}`.

Email is never part of generation; it is a separate explicit user action (Section 8).

### 7.4 `finalize_certificate_issue` (the transactional tail)

```sql
CREATE OR REPLACE FUNCTION public.finalize_certificate_issue(
  p_certificate_id      uuid,           -- pre-generated by the edge fn; embedded in storage_path
  p_account_id          uuid,
  p_holder_id           uuid,
  p_template_id         uuid,
  p_template_version    text,
  p_acord_edition       text,
  p_certificate_number  text,
  p_revision            integer,
  p_snapshot            jsonb,
  p_snapshot_sha256     text,
  p_pdf_sha256          text,
  p_storage_bucket      text,           -- 'coi-certificates'
  p_storage_path        text,
  p_size_bytes          bigint,
  p_issued_by           uuid,
  p_lines               jsonb,          -- [{"policy_id":..,"line_key":..,"insurer_letter":..}]
  p_document_name       text,
  p_document_filename   text,
  p_representative_policy_id uuid,
  p_source_form_id      uuid DEFAULT NULL,
  p_supersedes_id       uuid DEFAULT NULL
) RETURNS TABLE (certificate_id uuid, document_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert_id uuid;
  v_doc_id  uuid;
  v_ancestor record;
  v_workspace uuid;
  v_line jsonb;
BEGIN
  -- Reissue guards + lock
  IF p_supersedes_id IS NOT NULL THEN
    SELECT * INTO v_ancestor FROM public.certificates
     WHERE id = p_supersedes_id FOR UPDATE;
    IF v_ancestor.id IS NULL THEN RAISE EXCEPTION 'supersedes target not found'; END IF;
    IF v_ancestor.status NOT IN ('issued','sent') OR v_ancestor.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'supersedes target is % / already superseded', v_ancestor.status;
    END IF;
  END IF;

  -- Workspace derivation with the sec005 orphan fallback (R14)
  SELECT agency_workspace_id INTO v_workspace FROM public.accounts WHERE id = p_account_id;
  IF v_workspace IS NULL THEN
    SELECT id INTO v_workspace FROM public.agency_workspaces ORDER BY created_at LIMIT 1;
  END IF;

  INSERT INTO public.certificates
    (id, agency_workspace_id, account_id, holder_id, certificate_number, revision,
     template_id, template_version, acord_edition, source_form_id,
     snapshot, snapshot_sha256, pdf_sha256,
     storage_bucket, storage_path, size_bytes,
     status, issued_by, supersedes_id)
  VALUES
    (p_certificate_id, v_workspace, p_account_id, p_holder_id, p_certificate_number, p_revision,
     p_template_id, p_template_version, p_acord_edition, p_source_form_id,
     p_snapshot, p_snapshot_sha256, p_pdf_sha256,
     p_storage_bucket, p_storage_path, p_size_bytes,
     'issued', p_issued_by, p_supersedes_id)
  RETURNING id INTO v_cert_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.certificate_policies
      (certificate_id, policy_id, agency_workspace_id, line_key, insurer_letter)
    VALUES (v_cert_id, (v_line->>'policy_id')::uuid, v_workspace,
            v_line->>'line_key', (v_line->>'insurer_letter')::char(1));
  END LOOP;

  INSERT INTO public.documents
    (account_id, kind, filename, name, storage_path, storage_bucket,
     mime_type, size_bytes, sha256, file_missing, uploaded_by, document_type, policy_id)
  VALUES
    (p_account_id, 'customer_document', p_document_filename, p_document_name,
     p_storage_path, p_storage_bucket, 'application/pdf', p_size_bytes, p_pdf_sha256,
     false, p_issued_by, 'coi', p_representative_policy_id)
  RETURNING id INTO v_doc_id;

  UPDATE public.certificates SET document_id = v_doc_id WHERE id = v_cert_id;

  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (v_cert_id, 'generated', p_issued_by,
          jsonb_build_object('certificate_number', p_certificate_number,
                             'supersedes', p_supersedes_id));

  IF p_supersedes_id IS NOT NULL THEN
    UPDATE public.certificates
       SET superseded_by_id = v_cert_id, status = 'superseded'
     WHERE id = p_supersedes_id;
    INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
    VALUES (p_supersedes_id, 'reissued', p_issued_by,
            jsonb_build_object('superseded_by', v_cert_id,
                               'new_certificate_number', p_certificate_number));
  END IF;

  RETURN QUERY SELECT v_cert_id, v_doc_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_certificate_issue FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_certificate_issue TO service_role;
-- Explicit grant per R22a, matching the _do_account_merge lockdown pattern
-- (supabase/migrations/20260629240000_relgraph_v2_merge_consolidation.sql:264-265).
```

Note the `document_id` UPDATE happens inside the same transaction as the INSERT, before the freeze trigger could matter (the trigger allows `document_id` changes anyway).

### 7.5 Failure matrix

| Failure point | State left behind | Handling |
|---|---|---|
| Auth / staff / workspace check | none | 403 |
| Input validation | none | 404 / 422 with error list |
| get_master_coi readiness blocker | none | 422 per-line blockers (R6) |
| Letter cross-check mismatch | none | 422 expected vs supplied (R7) |
| Y-intent on non-endorsed pair | none | 422 (R3) |
| Build / validateAcord25 (incl. overflow) | none | 422 (R16) |
| preview_sha256 mismatch | none | 409 re-preview required (R9) |
| Number reservation | counter incremented in its own tx | gap in sequence; documented as failed generation |
| PDF fill | none (number burned) | 422 with fill errors |
| Storage upload | none (number burned) | one retry, then 502 |
| finalize RPC | uploaded object only | compensating storage remove from coi-certificates; on remove failure log orphan; 500 |
| after success, client offline | fully consistent | cert visible on next visit; Documents tab fetch-on-mount picks up the row |

---

## 8. Email delivery: reworked `send-coi-email` (single owner: this document, R10)

Modify in place: `supabase/functions/send-coi-email/index.ts`. Its only current caller is dead code (useCOIGeneration.ts:603 per ground truth), so the request contract can change freely. `01-disposition-and-roadmap.md` reduces its send-coi-email section to a pointer at this section.

New request shape (replaces the interface at :17-22):

```ts
interface SendCertificateEmailRequest {
  certificate_id: string;
  to: string;
  cc?: string[];    // optional carbon copies (R10)
  note?: string;    // optional short message inserted into the body, plain text, escaped
}
```

Changes, in order:

1. Access check (closes the TODO at :294-295): after `requireAuth`, verify staff by calling `.rpc('is_staff')` with a JWT-scoped client; then load the `certificates` row by id with the service-role client and verify `.rpc('is_agency_member', { p_agency_id: cert.agency_workspace_id })` for the caller. 403 if either check fails, 404 if no row.
2. Status guard: only `issued` or `sent` may be emailed. `voided`/`superseded`: 409 with a message naming the successor when superseded.
3. Attachment ONLY, from the `coi-certificates` bucket (R5, R10): download the bytes via service role `storage.from(cert.storage_bucket).download(cert.storage_path)`, verify sha256 equals `cert.pdf_sha256`, base64, and send as a Resend attachment (`attachments: [{ filename, content }]`). There is NO signed-URL fallback of any duration: if the download, the hash check, or the attachment fails, the request fails hard with 502 and nothing is stamped. Caller-supplied `certificateUrl` is gone entirely. Filename: `ACORD 25 - {holder} - {certificate_number}.pdf`.
4. Server-derived content: holder name and certificate number come from the certificate row/snapshot, never the caller (the current contract trusts caller-supplied `holderName`/`certificateNumber`, :242-247).
5. Stamping, after a successful Resend call, via service role: `UPDATE public.certificates SET sent_to = <to>, sent_at = now(), status = CASE WHEN status = 'issued' THEN 'sent' ELSE status END WHERE id = <id>` (passes the freeze trigger; `sent_to`/`sent_at`/status transition are on the allowed list), then insert a `certificate_events` row `('emailed', actor, {"to":..., "cc":[...], "resend_id":...})`.
6. Replace the `email_log` insert (:330-343, table has no migration and the insert fails silently) with the `certificate_events` insert above.
7. Keep unchanged: fixed sender `coi@lewisinsurance.ai` (:35-36), requireAuth (:217-222), rate limiting 20/min (:224-234), HTML escaping (:98-109).

PII policy for the email body (per CLAUDE.md "Emails never include full PII" and the AI/PII section): the body contains ONLY the holder name, the insured's business name, the certificate number, the optional staff note, and agency contact info. No coverage limits, no policy numbers, no premiums, no addresses, no dates of birth or license data; all substantive content lives in the attached PDF, which is what the recipient legally needs. Subject: `Certificate of Insurance ${certificate_number} - ${insured_name}`.

Client entry: `SendCertificateDialog` (Section 9) invokes the function and then refetches certificates so the status pill flips to `sent`.

---

## 9. Issuance log UI

### 9.1 Components and exact props

New files:

- `src/types/certificates.ts` (owned by this design; 06 imports it, R11)
  ```ts
  export type CertificateStatus = 'issued' | 'sent' | 'voided' | 'superseded';
  export type CertificateLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';
  export type CertificateEventAction =
    'generated' | 'previewed' | 'downloaded' | 'emailed'
    | 'reissued' | 'voided' | 'document_restored';

  export interface CertificateRecord { /* mirrors table; snapshot typed as CertificateSnapshot */ }
  export interface CertificateSnapshot { /* Section 4 schema, snapshot_version discriminated */ }
  export interface CertificateEvent { /* mirrors certificate_events */ }

  // Row shape returned by the list_certificates reader (below); what the UI consumes.
  export interface CertificateListItem {
    id: string;
    certificate_number: string;
    revision: number;
    status: CertificateStatus;
    holder_id: string;
    holder_name: string;             // projected from snapshot->'holder'->>'name'
    issued_at: string;
    issued_by: string;
    issued_by_name: string | null;   // projected from profiles.full_name
    sent_to: string | null;
    sent_at: string | null;
    supersedes_id: string | null;
    superseded_by_id: string | null;
    superseded_by_number: string | null;
    void_reason: string | null;
    storage_bucket: string;
    storage_path: string;
    pdf_sha256: string;
    size_bytes: number;
    document_id: string | null;      // nullable (ON DELETE SET NULL)
    line_keys: CertificateLineKey[];
  }

  export interface GenerateCertificateRequest { /* Section 7.2 */ }
  export interface GenerateCertificateResponse { /* Section 7.2 */ }
  ```

- `list_certificates` reader (in the issuance migration; R11: the UI consumes the reader, never raw table rows):
  ```sql
  CREATE OR REPLACE FUNCTION public.list_certificates(
    p_account_id uuid,
    p_limit integer DEFAULT NULL
  ) RETURNS SETOF ... -- one column per CertificateListItem field
  LANGUAGE sql
  STABLE
  SECURITY INVOKER      -- table RLS (staff + workspace) applies to the caller
  AS $$
    SELECT c.id, c.certificate_number, c.revision, c.status,
           c.holder_id,
           c.snapshot->'holder'->>'name'          AS holder_name,
           c.issued_at, c.issued_by,
           p.full_name                            AS issued_by_name,
           c.sent_to, c.sent_at,
           c.supersedes_id, c.superseded_by_id,
           s.certificate_number                   AS superseded_by_number,
           c.void_reason,
           c.storage_bucket, c.storage_path, c.pdf_sha256, c.size_bytes,
           c.document_id,
           COALESCE((SELECT array_agg(cp.line_key ORDER BY cp.line_key)
                       FROM public.certificate_policies cp
                      WHERE cp.certificate_id = c.id), '{}') AS line_keys
      FROM public.certificates c
      LEFT JOIN public.profiles p ON p.id = c.issued_by
      LEFT JOIN public.certificates s ON s.id = c.superseded_by_id
     WHERE c.account_id = p_account_id
     ORDER BY c.issued_at DESC
     LIMIT COALESCE(p_limit, 2147483647)
  $$;
  GRANT EXECUTE ON FUNCTION public.list_certificates(uuid, integer) TO authenticated;
  ```
  The reader intentionally excludes `snapshot`: list payloads stay light and `CertificateListItem` carries no snapshot field. Any reissue-prefill flow (`06-ui-surfaces.md` Sec 4.12) first fetches the full `certificates` row by id (including `snapshot`) under the staff SELECT policy (Section 3.6) before opening the generator prefilled.

- `src/hooks/useCertificates.ts`
  ```ts
  export function useCertificates(accountId: string): {
    certificates: CertificateListItem[];      // rpc list_certificates(accountId)
    isLoading: boolean;
    refetch: () => Promise<void>;
    downloadCertificate: (cert: CertificateListItem) => Promise<void>;
        // createSignedUrl(cert.storage_bucket, cert.storage_path, 3600), fetch bytes,
        // verify sha256 === cert.pdf_sha256 (R5; error toast + abort on mismatch),
        // save file; logs 'downloaded'
    previewCertificate: (cert: CertificateListItem) => Promise<void>;
        // signed URL opened in new tab (unverified view path); logs 'previewed'
    voidCertificate: (id: string, reason: string) => Promise<boolean>;   // rpc void_certificate
    restoreDocument: (id: string) => Promise<boolean>;                   // rpc restore_certificate_document; invalidates ['documents']
    fetchEvents: (certificateId: string) => Promise<CertificateEvent[]>; // lazy, on expand
  }
  ```
  React Query keys: `['certificates', accountId]` and `['certificate-events', certificateId]`. Download/preview call `supabase.rpc('log_certificate_event', ...)` fire-and-forget after the signed URL succeeds. The issue action itself is NOT here: 06's `useIssueCertificate` wraps `supabase.functions.invoke('generate-certificate')` (R1) and on success invalidates `['certificates', accountId]` and `['documents']`.

- `src/components/certificates/CertificateIssuanceLog.tsx` (the ONE issuance-log component, R17; 06 deletes its parallel IssuanceLog/RecentCertificatesBlock specs and consumes this)
  ```ts
  interface CertificateIssuanceLogProps {
    accountId: string;
    variant?: 'full' | 'compact';   // default 'full'
    limit?: number;                 // compact default 5
    onReissue?: (certificate: CertificateListItem) => void;  // generator supplies prefill navigation
    className?: string;
  }

  // Exported next to the component (R11, R17): the single status pill map.
  export const CERT_PILL: Record<CertificateStatus, { label: string; tone: 'neutral' | 'success' | 'muted' | 'danger' }> = {
    issued:     { label: 'Issued',     tone: 'neutral' },
    sent:       { label: 'Sent',       tone: 'success' },
    superseded: { label: 'Superseded', tone: 'muted' },
    voided:     { label: 'Voided',     tone: 'danger' },
  };
  ```
  Full variant columns: Certificate number (mono, tabular figures, never truncates), Holder name, Status `StatusPill` via `CERT_PILL` (superseded shows "Replaced by COI-..." subtext from `superseded_by_number`, voided shows reason on hover), Issued (date + `issued_by_name`), Sent (`sent_to` + relative time). Row actions in a three-dot `DropdownMenu` (Calm Command: no second lime on the surface): Download PDF, View, Send by email (disabled for voided/superseded), Reissue corrected (only issued/sent; calls `onReissue`), Void (opens reason dialog; only issued/sent), Restore to Documents (conditional, Section 6.3), View activity (expands an inline `CertificateEventsList`). Compact variant: same rows, no expansion, a text-tertiary "View all certificates" link that navigates to `/certificates?accountId=...` (R19).

- `src/components/certificates/CertificateEventsList.tsx`
  ```ts
  interface CertificateEventsListProps { certificateId: string; }
  ```
  Timeline list of `certificate_events`, newest first: action label, actor, relative time, and salient metadata (`to` for emailed, `reason` for voided, successor number for reissued).

- `src/components/certificates/SendCertificateDialog.tsx`
  ```ts
  interface SendCertificateDialogProps {
    certificate: CertificateListItem;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSent?: () => void;
  }
  ```
  Fields: To (email, prefilled from the holder's directory email when 03 exposes one), optional Cc (multi-value), optional note. Submits to `send-coi-email` (Section 8 contract); on success calls `onSent` and closes.

### 9.2 Placement

1. The `/certificates` surface (H1 "Certificates", generator as primary mode, account picker when no `?accountId`; owned by `06-ui-surfaces.md`, R19): renders `<CertificateIssuanceLog accountId={accountId} variant="full" onReissue={prefillFromSnapshot} />` beneath the generator, matching the archetype's "issuance log beneath" (design-system/surface-map.md, Document Production archetype cited in the handoff Section 3.4).
2. Customer record: the Master COI panel (`src/components/customers/MasterCOISection.tsx`, owned by 02/06) renders `<CertificateIssuanceLog accountId={account.id} variant="compact" limit={5} />` as its bottom block. No new entry in `SECTION_IDS` (src/pages/CustomerDetail.tsx:105) is needed by THIS subsystem; the Master COI design owns that page edit.

No lime primary anywhere in the log; the surface's single lime is the generator's Generate button.

---

## 10. Exact file inventory

Create:

| Path | Contents |
|---|---|
| `supabase/migrations/2026MMDDHHMMSS_certificates_issuance.sql` | Sections 3.1 to 3.8: four tables (with workspace columns + fill triggers), `coi-certificates` bucket + storage policies, numbering functions + trigger, immutability triggers, `finalize_certificate_issue`, `void_certificate`, `restore_certificate_document`, `log_certificate_event`, `list_certificates`, RLS, grants/revokes (incl. explicit service_role grants per R22a), `_do_account_merge` policy de-dup skip (Section 3.8; builds on 02's Phase 3 `v_safe_delete` allowlist patch, migration `20260702091500`, which lands first) |
| `supabase/functions/generate-certificate/index.ts` | Section 7 |
| `supabase/functions/_shared/acord-fill.ts` | Deno port of the fill core (Section 7.1; NO addendum logic, R16) |
| `src/types/certificates.ts` | Sections 7.2 and 9.1 (owned here; 06 imports) |
| `src/hooks/useCertificates.ts` | Section 9.1 |
| `src/components/certificates/CertificateIssuanceLog.tsx` | Section 9.1 (exports `CERT_PILL`) |
| `src/components/certificates/CertificateEventsList.tsx` | Section 9.1 |
| `src/components/certificates/SendCertificateDialog.tsx` | Section 9.1 |

Modify:

| Path | Change |
|---|---|
| `supabase/functions/send-coi-email/index.ts` | Section 8 rework (new request shape incl. `cc`, access check, attachment-only from coi-certificates, hash verification, stamping, events) |
| `supabase/config.toml` | Add `[functions.generate-certificate]` (`verify_jwt = true`), following existing entries (supabase/config.toml:37 onward) |
| `src/integrations/supabase/types.ts` | Regenerate after migration (`supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv`) |

Owned by sibling designs but consuming this subsystem (interface only, listed for the orchestrator): `supabase/functions/_shared/acord25/` (builder/validator/field map/sha pin/preview-hash helper, 05); the `/certificates` surface and `useIssueCertificate` hook (06); the Phase 1 repoint of the four entry points to `/certificates?accountId=...` (src/pages/CustomerDetail.tsx:429, src/pages/PolicyDetail.tsx:210 and :502, src/components/layout/chrome/navConfig.ts:132; 01 and 06, R15); `MasterCOISection.tsx` renders the compact log (02/06); `resolve_holder_endorsements` and `get_master_coi` (02); the `additional_insureds` table and holder-merge engine (03).

`log_certificate_event` (referenced in Sections 3.3 and 9.1), for completeness:

```sql
CREATE OR REPLACE FUNCTION public.log_certificate_event(
  p_certificate_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_workspace uuid;
BEGIN
  SELECT agency_workspace_id INTO v_workspace
    FROM public.certificates WHERE id = p_certificate_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'certificate not found';
  END IF;
  IF NOT (public.is_staff() AND public.is_agency_member(v_workspace)) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_action NOT IN ('downloaded','previewed') THEN
    RAISE EXCEPTION 'client-loggable actions are downloaded/previewed only';
  END IF;
  INSERT INTO public.certificate_events (certificate_id, action, actor_id, metadata)
  VALUES (p_certificate_id, p_action, auth.uid(), COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.log_certificate_event(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_certificate_event(uuid, text, jsonb) TO authenticated;
```

Server-originated actions (`generated`, `emailed`, `reissued`, `voided`, `document_restored`) are inserted directly by the service role or inside the SECURITY DEFINER RPCs and are NOT reachable through this function; that closes System B's open-insert audit hole (Section 1.1).

---

## 11. Implementation sequencing

1. Migration `2026MMDDHHMMSS_certificates_issuance.sql`. Hard dependency: the `additional_insureds` table (03's migration) must exist first for the `holder_id` FK; sequence the migration timestamps accordingly. The `account_coi_profiles` `v_safe_delete` allowlist patch is NOT part of this migration: it ships in Phase 3 via 02's migration `20260702091500`, before this Phase 5 work, so no Phase 3-to-5 risk window exists. This migration's `_do_account_merge` CREATE OR REPLACE adds only the `certificate_policies` RESTRICT policy-de-dup skip (Section 3.8) and must start from the Phase 3 function body so the allowlist patch is preserved; Phase 5 also carries the merge acceptance tests below. `acord_templates`/`acord_forms`/`documents`/`accounts` already exist. Overall phase placement is owned by `01-disposition-and-roadmap.md`.
2. Regenerate Supabase types.
3. `supabase/functions/_shared/acord-fill.ts`, then `generate-certificate`. Hard dependencies: the onboarded ACORD 25 template row and the `_shared/acord25/` ports (05), and `get_master_coi` + `resolve_holder_endorsements` (02). Until those land, the function can be deployed behind a 422 "no current ACORD 25 template" guard, which it needs anyway.
4. `send-coi-email` rework (independent of 3; only depends on 1).
5. Frontend: `src/types/certificates.ts`, `useCertificates`, `CertificateIssuanceLog`, `CertificateEventsList`, `SendCertificateDialog`.
6. Integration by sibling designs: `/certificates` surface wiring and `useIssueCertificate` (06), Master COI panel embed (02/06), entry-point repoint (01/06, R15).
7. Deploy edge functions (per CLAUDE.md, Claude Code deploys edge functions automatically on behalf of the user).

Tests to include (Vitest, matching existing patterns in src/__tests__/):

- Snapshot builder unit tests: letter-map validation, distinct-carrier-distinct-letter, no-premium assertion, Y/N literals for ynText fields and booleans for checkboxes (R8).
- Holder-endorsement gate tests (R2, R3): intent Y on a holder-resolved endorsed line prints Y; intent Y on a line whose only endorsement is scheduled to a DIFFERENT holder returns 422; intent N on an endorsed line prints N (downgrade).
- Readiness gate tests (R6): each of the six blockers (`no_lines`, `policy_core_missing`, `limit_missing`, `insurer_unresolved`, `policy_expired`, `insurer_overflow`) on a selected line returns 422; a line expiring in 29 days returns a warning, not a blocker.
- Letter cross-check test (R7): swapped letters in the request vs get_master_coi returns 422.
- Preview binding test (R9): a Master COI edit between preview and issue changes the server rebuild hash and returns 409; identical builds pass; number/revision/date header fields do not affect the hash.
- Snapshot-replay round-trip (R8): store snapshot, reload, refill the pinned template from `snapshot.field_values` via `_shared/acord-fill.ts`, extract field values, assert equality including checkbox booleans.
- ACORD 25 round-trip once the template exists: fill via `_shared/acord-fill.ts`, re-read fields, assert values (handoff Section 5 verification requirement); plus the parity fixture asserting `_shared/acord-fill.ts` and `src/lib/acord/pdfFiller.ts` produce identical output for the same input, and the shared parity fixture for `_shared/acord25/` vs the client build (05).
- Download integrity test (R5): `downloadCertificate` rejects bytes whose sha256 differs from `pdf_sha256`.
- SQL smoke tests in the migration's comments or a follow-up script: freeze trigger rejects frozen-column updates, rejects deletes, permits the four legal transitions, rejects the rest; freeze trigger PERMITS `account_id`/`holder_id`/`agency_workspace_id` updates (merge path); numbering sequence and rollback behavior; double-supersede blocked by the unique index.
- Merge acceptance tests (R4): account merge where a loser has issued certificates succeeds and reparents `certificates.account_id`; holder merge with issued certificates succeeds and reparents `holder_id`; unmerge restores prior FK values; the policy de-dup step never soft-deletes a policy referenced by `certificate_policies`; account merge with `account_coi_profiles` on both sides succeeds survivor-wins (02's Phase 3 allowlist patch, migration `20260702091500`).

---

## 12. Risks and open edges

1. Deno fill port drift: two fill implementations (client preview vs server issuance). Mitigated by the parity fixture tests and pinned header comments; not eliminated. Consolidation into one shared module consumed by both (a `lib/acord-core` imported via relative path from both sides) is a follow-up, not a v1 requirement.
2. Number gaps: failed generations burn reserved numbers. Accepted and documented; if the agency ever objects, the fix is reserving inside the finalize transaction and printing the number via a second fill pass, at the cost of complexity.
3. Workspace derivation fallback: legacy accounts with NULL `agency_workspace_id` get the first workspace (sec005 orphan pattern). In a single-workspace prod this is exact; if multi-workspace activates, a backfill of `accounts.agency_workspace_id` should precede heavy issuance so the fallback stops firing. The RLS predicate is already strict (R14), so no retrofit scramble is pending.
4. Merge interactions are RESOLVED by design (R4), not punted: `account_id`/`holder_id`/`agency_workspace_id` reparent cleanly through both FK-introspecting merge engines, the policy de-dup skip protects cert-referenced policies, and 02's Phase 3 migration `20260702091500` patches the `account_coi_profiles` allowlist before this subsystem ships. The residual risk is sequencing: the `_do_account_merge` CREATE OR REPLACE must land with or before the first issued certificate; the acceptance tests in Section 11 gate that.
5. Storage-object durability: nothing in the app deletes objects under `coi-certificates` (no authenticated DELETE policy; the only remover is the compensating cleanup on a failed finalize, which targets a not-yet-referenced path). There is no lifecycle policy audit in this design. The `pdf_sha256` plus `snapshot.field_values` make full re-render possible if an object is ever lost (re-export would then be a re-fill from snapshot; that affordance is deliberately out of v1 scope, and `file_missing` integrity checks already exist via `check-document-integrity`, src/hooks/useDocumentManager.ts:337-356).
6. The legacy customer-merge map registers `certificates_of_insurance.account_id` as a reassign target (supabase/migrations/20260622160000_customer_merge_transactional_v1.sql:190); that legacy entry is retired with System B per `01-disposition-and-roadmap.md`. The new `certificates.account_id` needs no map entry: the FK-introspecting merge core discovers and reparents it, and the freeze trigger now permits that (Section 3.5).
7. Preview-hash strictness: any Master COI edit between preview and click forces a re-preview (409). This is intentional friction for a legal document; if it proves too aggressive for benign same-user flows, the mitigation is auto-re-previewing in the generator on 409, never weakening the server check.
