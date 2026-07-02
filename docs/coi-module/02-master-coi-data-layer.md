# Master COI Data Layer: Final Design

Area: Master COI data layer for the ACORD 25 / Additional Insureds / Master COI module.
Repo: /Users/brianlewis/insureflow-ops
Status: FINAL, implementation ready. This document is the reconciled version incorporating all orchestrator resolutions; where an earlier draft disagreed, this version wins.
Resolves: handoff open question 4 (three-state endorsement representation), the concrete mechanics of locked Decisions 2 and 5, and module-wide ownership of four cross-cutting contracts: the holder-scoped endorsement resolver (`resolve_holder_endorsements`), the readiness blocker vocabulary, the insurer letter assignment algorithm, and the canonical line-key enum.

Sibling docs in this module (docs/coi-module/): 01-disposition-and-roadmap.md, 03-additional-insureds-directory.md, 04-issuance-and-snapshots.md, 05-acord25-pipeline.md, 06-ui-surfaces.md.

All file:line citations below were re-verified against source on 2026-07-02. Where this doc and the planning handoff disagree, this doc follows the verified ground truth files (gt-policies-schema.md, gt-record-and-docs.md).

---

## 0. Scope and constraints

This design covers:

1. Canonical read model: `get_master_coi(account_id)` RPC with full JSON contract and per-field provenance. This contract is the module's single read-model contract, published as `src/types/master-coi.ts`; the UI consumes it directly (06-ui-surfaces.md).
2. Write model for the manual-entry policy population.
3. Three-state Additional Insured endorsement status per line, including Auto, Property, and WC waiver of subrogation.
4. Holder-scoped endorsement resolution: `resolve_holder_endorsements`, the single E&O gate consumed by both the UI toggle gate (`useHolderEndorsementStatus`) and the `generate-certificate` edge function (04-issuance-and-snapshots.md).
5. The readiness blocker vocabulary. Defined once here (Section 2.7); 04-issuance-and-snapshots.md and 06-ui-surfaces.md cite it, never redefine it.
6. The insurer letter assignment algorithm. Implemented once, in SQL, inside `get_master_coi` (Section 5.4); the client preview and the issuance server both consume its output.
7. The canonical line-key enum ('gl', 'auto', 'umbrella', 'wc', 'property', 'other') and its published mapping table (Section 2.3).
8. Carrier resolution (insurer A-F names and NAIC), plus the AddPolicyModal write-time fix.
9. Producer block sourcing.
10. Description of operations as a first-class field.
11. Master COI panel data contract (hooks, provenance display, double-check affordance).

Locked decisions honored:

- Decision 2: extend the `policies` model. Everything here is additive to `policies`, its existing child tables, and its existing JSONB blobs. No parallel coverage model.
- Decision 4: issued COIs are immutable snapshots. The snapshot table (`public.certificates`, owned by 04-issuance-and-snapshots.md) belongs to the issuance area; this layer's job is to make `get_master_coi` output snapshot-ready (a single self-contained JSONB document).
- Decision 5: real per-line endorsement status with an explicit `requested` state, never a default-Y checkbox, and holder-scoped resolution so a Y is never printed for a holder who is not actually endorsed.

Binding data facts this design builds on (from gt-policies-schema.md):

- Policy data is bimodal. Extraction-processed policies carry rich `<line>_details` JSONB plus child-table rows; AddPolicyModal-created policies carry only policy_number, free-text carrier, line_of_business, premium, dates, billing fields, status (src/components/customers/AddPolicyModal.tsx:22-32, insert at :379-392).
- `policies.carrier_id` is NULL on every modal-created policy (AddPolicyModal.tsx:379-392 never sets it) and `policies.carrier_naic` (typed, supabase/migrations/20251221160001_workers_comp_details.sql:12-13) has no writer anywhere in the repo.
- GL limits, Auto CSL, WC EL, Umbrella limits live only at JSONB paths (src/types/commercial-gl.ts:255-279, commercial-auto.ts:109-123, workers-comp.ts:66-77, commercial-umbrella.ts:71-102).
- `policy_cgl_additional_insureds` and `policy_umbrella_additional_insureds` have `ai_type` and `waiver_of_subrogation` (20251221190001_commercial_gl_details.sql:96-137; 20251221210001_commercial_umbrella_details.sql:108-137). The CGL table also has `endorsement_form` and per-AI dates (20251221190001:123-127); the umbrella table has neither endorsement_form nor dates. GL `ai_type` CHECK vocabulary: 'ongoing_ops', 'completed_ops', 'both', 'owners_lessees_contractors', 'managers_lessors', 'vendors', 'co_owner', 'designated_person', 'other' (20251221190001:108-112). Umbrella `ai_type` CHECK vocabulary: 'blanket', 'scheduled', 'follow_underlying' (20251221210001:120).
- `policy_bap_interests` (20251221180001_commercial_auto_details.sql:164-191, interest_type CHECK at :177) and `policy_property_interests` (20251221200001_commercial_property_details.sql:189-214, interest_type CHECK at :194) can record `interest_type = 'additional_insured'` but lack ai_type, waiver, primary and noncontributory, and any endorsement reference.
- WC has no waiver home at all (verified across 20251221160001 and 20251221170001).
- `is_agency_member(p_agency_id uuid)` exists (20251228000000_m0_agency_workspace_foundation.sql:125-139, SECURITY DEFINER STABLE, checks an active `agency_workspace_memberships` row). All new module tables carry `agency_workspace_id` with `is_staff() AND is_agency_member(agency_workspace_id)` RLS, matching the sec005 posture (20260408100000_sec005_leads_workspace_isolation.sql: nullable add, backfill via account, oldest-workspace orphan fallback, then NOT NULL).

---

## 1. Architecture at a glance

```
                         READ                                    WRITE
 accounts ---------\
 businesses.dba ----\                                   save_master_coi_fields(policy_id, updates)
 agency_workspaces --\                                    |  path-whitelisted jsonb_set / typed column set
 policies ------------+--> get_master_coi(account_id) <--+  writes coi_field_provenance ledger
  five *_details JSONB|      (SECURITY DEFINER RPC,
  *_field_evidence ---|       staff or service_role,      set_line_ai_endorsement(line, row_id, status, ...)
  coi_field_provenance|       returns one self-contained   |  three-state transitions on the five AI tables
 policy_cgl_additional_insureds        JSONB doc)           |
 policy_umbrella_additional_insureds                      account_coi_profiles (direct client CRUD, staff RLS)
 policy_bap_interests                                       description_of_operations + last_reviewed stamp
 policy_property_interests
 policy_wc_subrogation_waivers (NEW)                      resolve_carrier(raw) -> AddPolicyModal sets
 carriers + cleanup.carrier_alias_map                       carrier_id + carrier_naic at insert time
 canopy_business_operations (prefill only)
 coi_field_registry (NEW, rules-as-data field catalog)
 additional_insureds (directory, 03) ---> resolve_holder_endorsements(account, holder, policy_ids)
                                            |  the Decision 5 E&O gate; called by BOTH the UI
                                            |  (useHolderEndorsementStatus) and generate-certificate
```

One read RPC assembles the whole ACORD 25 picture. One holder-resolution RPC decides ADDL INSD / SUBR WVD per (line, holder). One write RPC handles every editable scalar field through a whitelist. One write RPC handles endorsement-status transitions. One small table holds account-level COI state (description of operations, review stamp). Everything else reuses what exists.

The issuance area (04-issuance-and-snapshots.md) consumes `get_master_coi` output directly: the JSON contract in Section 2.6 is deliberately shaped so the issued-COI snapshot (Decision 4) can be `get_master_coi(...)` output frozen verbatim, plus holder and remarks. The `generate-certificate` edge function calls both `get_master_coi` (readiness enforcement and letter authority) and `resolve_holder_endorsements` (print semantics) server-side at issue time.

---

## 2. Canonical read model: get_master_coi

### 2.1 RPC, not a view

A view cannot do this job:

- Carrier resolution needs the `cleanup.carrier_alias_map` (20260628014122_wave0_model2_carrier_backfill.sql:35-39) and `normalize_entity_name` (20260629190000_import_resolve_account.sql:28-42) fallbacks with precedence logic, per policy.
- Per-field provenance requires merging five `<line>_details` blobs, their `<line>_field_evidence` siblings (flat dotted-path maps, supabase/functions/extract-cgl-policy/index.ts:973-992), the new `coi_field_provenance` ledger, and typed columns, with conflict detection (Section 3.3).
- Insurer letter assignment is a cross-policy computation with ordering rules (Section 5.4).
- Staff gating and a stable JSON contract argue for one SECURITY DEFINER function with explicit REVOKE/GRANT, following the `search_accounts` precedent (20260629250000_relgraph_v2_search_owned_rollup.sql:59-60).

Decision: a single `get_master_coi` plpgsql RPC returning `jsonb`. No materialization; an account has at most tens of policies, so per-call assembly is cheap.

### 2.2 Signature

```sql
create or replace function public.get_master_coi(
  p_account_id uuid,
  p_policy_ids uuid[] default null   -- optional explicit selection override;
                                     -- null = auto-select per line (Section 2.4)
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, cleanup, extensions
as $$ ... $$;

revoke execute on function public.get_master_coi(uuid, uuid[]) from anon, public;
grant  execute on function public.get_master_coi(uuid, uuid[]) to authenticated, service_role;
```

First statement inside the body:

```sql
if auth.role() is distinct from 'service_role' and not public.is_staff() then
  raise exception 'insufficient_privilege' using errcode = '42501';
end if;
```

(`is_staff()` exists: 20250908161228_8e64b233-3483-4d79-b050-259bfcc71145.sql:20.) The service_role branch exists because `generate-certificate` (04-issuance-and-snapshots.md) MUST call `get_master_coi(p_account_id, p_policy_ids)` server-side at issue time: it enforces the readiness blockers (Section 2.7) and re-derives the insurer letters (Section 5.4) from this same implementation, returning 422 on any blocker or on a letter mismatch with what the client displayed.

The `p_policy_ids` override exists so the generation flow (Customer -> policy checkboxes -> Generate) can ask for the exact picture of a user-chosen policy set through the same code path, instead of re-implementing assembly. When provided, only those policies are considered and auto-selection is skipped. `get_master_coi` MUST verify every id in `p_policy_ids` belongs to `p_account_id` (non-deleted) and raise otherwise.

### 2.3 Line classification and the canonical line-key enum

The canonical line-key enum for the whole module is:

```
'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other'
```

Every doc, table CHECK, TS type, and RPC in the module uses these keys. The one published mapping table (all sibling docs cite this table, never restate it). The `certificate_policies` join column is `line_key`, owned by 04's DDL, and the mapping is an identity mapping over the canonical keys; there is no umbrella-to-excess split (excess policies ride the `umbrella` key, with `umbrella_details.policy_type` recording which one the document said):

| Canonical key | certificate_policies.line_key (owned by 04's DDL) | ACORD 25 form row | Display name |
|---|---|---|---|
| `gl` | `gl` | COMMERCIAL GENERAL LIABILITY | General Liability |
| `auto` | `auto` | AUTOMOBILE LIABILITY | Automobile Liability |
| `umbrella` | `umbrella` (excess policies ride this key) | UMBRELLA LIAB / EXCESS LIAB | Umbrella or Excess Liability |
| `wc` | `wc` | WORKERS COMPENSATION AND EMPLOYERS' LIABILITY | Workers Compensation |
| `property` | `property` | OTHER (free row) | Property |
| `other` | `other` | not printed by default | Other |

A policy can feed more than one ACORD 25 row (a BOP feeds GL and Property). So classification returns a set, not a scalar.

```sql
create or replace function public.master_coi_lines(p public.policies)
returns text[]           -- subset of {'gl','auto','umbrella','wc','property'}, or '{other}'
language sql immutable
as $$
  select case
    -- 1) Detail blobs are authoritative: their presence proves the line.
    when array_length(blob_lines, 1) is not null then blob_lines
    -- 2) line_canonical crosswalk labels (20260628014017_wave0_hyg1_lob_crosswalk.sql:77-90)
    when p.line_canonical = 'General Liability'             then array['gl']
    when p.line_canonical = 'Commercial Auto'               then array['auto']
    when p.line_canonical = 'Workers Compensation'          then array['wc']
    when p.line_canonical = 'Commercial Property'           then array['property']
    when p.line_canonical = 'Business Owners Policy (BOP)'  then array['gl','property']
    when p.line_canonical in ('Personal Umbrella')          then array['umbrella']
    -- 3) raw line_of_business fallback, mirroring is_workers_comp_policy
    --    (20251221160001_workers_comp_details.sql:276-286)
    when lower(coalesce(p.line_of_business,'')) like '%work%comp%'          then array['wc']
    when lower(coalesce(p.line_of_business,'')) like '%umbrella%'
      or lower(coalesce(p.line_of_business,'')) like '%excess%'             then array['umbrella']
    when lower(coalesce(p.line_of_business,'')) like '%general%liab%'
      or lower(coalesce(p.line_of_business,'')) = 'gl'                      then array['gl']
    when lower(coalesce(p.line_of_business,'')) like '%commercial%auto%'
      or lower(coalesce(p.line_of_business,'')) like '%business%auto%'      then array['auto']
    when lower(coalesce(p.line_of_business,'')) like '%bop%'
      or lower(coalesce(p.line_of_business,'')) like '%business%owner%'     then array['gl','property']
    when lower(coalesce(p.line_of_business,'')) like '%commercial%prop%'    then array['property']
    else array['other']
  end
  from (select array_remove(array[
         case when p.cgl_details      is not null then 'gl'       end,
         case when p.bap_details      is not null then 'auto'     end,
         case when p.umbrella_details is not null then 'umbrella' end,
         case when p.wc_details       is not null then 'wc'       end,
         case when p.property_details is not null then 'property' end
       ], null) as blob_lines) b;
$$;
```

Notes:

- Blob presence beats labels because the blobs are what the read model actually reads and their existence proves the extraction pipeline classified the document (columns per 20251221160001:8-9, 20251221180001:15, 20251221190001:327-328, 20251221200001:356, 20251221210001:290; all confirmed live in src/integrations/supabase/types.ts:26506-26556).
- `line_canonical` and `line_category` are the sanctioned normalized keys (20260628143427_wave1_model3_lob_fk_and_ref_normalization.sql:35-41). The crosswalk today maps 'Umbrella' to 'Personal Umbrella' (20260628014017:73); commercial umbrellas arrive via `umbrella_details` presence or the raw fallback.
- `'other'` policies (for example 'Commercial (unspecified)', 20260628014017:83) are surfaced in the contract under `lines.other[]` so staff can see them and fix classification; they never silently vanish.

### 2.4 Policy selection per line

For each of the five ACORD lines, candidates are the account's non-deleted policies whose `master_coi_lines` contains that line. Default selection, per line:

1. Prefer `status = 'active'`.
2. Then latest `expiration_date` (nulls last).
3. Then latest `created_at` as a tiebreak.

All candidates are returned (`candidates[]` per line, selected one flagged) so the panel and the generation picker can override without a second RPC. Every candidate entry carries an `expired` boolean so the UI can disable individual expired policies in the picker (Section 2.7). When `p_policy_ids` is passed, only those policies are candidates and every one of them is selected on each line it matches.

### 2.5 Field cell shape and provenance rules

Every scalar the ACORD 25 needs is returned as a cell object, never a bare value. This cell-based contract is canonical for the whole module; 06-ui-surfaces.md consumes it directly (a thin client-side adapter at most, no re-shaping layer with its own vocabulary).

```jsonc
{
  "v": 1000000,                                  // value, null when missing
  "src": "manual",                               // provenance, see below
  "path": "cgl_details.limits.each_occurrence",  // registry write path (Section 3.2); null = not editable here
  "conf": 0.98,                                  // extraction confidence when known, else null
  "updated_at": "2026-07-01T14:22:03Z",          // for ledger-tracked manual writes, else null
  "updated_by": "3f2a...-uuid",                  // for ledger-tracked manual writes, else null
  "flag": null                                   // null | "overwritten_manual" | "mismatch" (Section 3.3)
}
```

`src` vocabulary (closed set, six values; there is no 'legacy' value anywhere in this module):

| src | Meaning | How determined |
|---|---|---|
| `manual` | A human entered it | Either (a) `coi_field_provenance` has an entry for this path AND the recorded value equals the current value at the path (updated_at/updated_by populated from the ledger), or (b) the value is non-null with no extraction attribution: blob `extraction_source = 'manual'` (PolicyManualDetailsModal writes, src/components/policies/PolicyManualDetailsModal.tsx:485-500), a typed column set by AddPolicyModal/EditPolicyModal, or any other unattributed origin (updated_at/updated_by null) |
| `extracted` | Came from the document extraction pipeline | Value non-null AND (owning blob `extraction_source` in ('ai_extracted','azure_di_claude') per src/types/commercial-gl.ts:665, OR the in-blob path appears in `<line>_field_evidence`, whose shape is a flat dotted-path map, extract-cgl-policy/index.ts:973-992) |
| `reference` | Resolved from the `carriers` table (name or NAIC) | carrier resolution, Section 5 |
| `account` | Read from `accounts` (named insured block) | fixed mapping |
| `workspace` | Read from `agency_workspaces` (producer block) | fixed mapping |
| `missing` | No value anywhere | value null after all sources |

The two `manual` sub-cases are distinguishable in the UI by whether `updated_at`/`updated_by` are populated: ledger-tracked writes show who and when; pre-module manual entry shows the plain `manual` chip.

The `path` field is the contract trick that keeps the UI honest: the read model tells the client exactly which key to send back to `save_master_coi_fields`. The panel never maintains its own field-to-path mapping.

`flag` vocabulary: `overwritten_manual` (Section 3.3, an extractor overwrote a ledger-tracked manual value) and `mismatch` (two authoritative sources disagree; emitted today only on the insurer NAIC cell when typed `policies.carrier_naic` and extracted `identity.carrier_naic` are both non-null and differ, paired with the `naic_mismatch` warning).

### 2.6 Full JSON contract

TypeScript mirror goes in `src/types/master-coi.ts` (Section 8.1). This is the single read-model contract for the module. Shape:

```jsonc
{
  "version": 1,
  "generated_at": "2026-07-02T15:04:05Z",
  "account_id": "uuid",

  "named_insured": {
    // accounts base columns: name 20250908032636_...sql:17, address :19-23.
    // dba via accounts.business_id -> businesses.dba (20250908182341_...sql:63);
    // accounts itself has no dba (types.ts:376-423).
    "name":  { "v": "Sorensen & Smith LLC", "src": "account", "path": null },
    "dba":   { "v": null, "src": "missing", "path": null },
    "address_line1": { "v": "123 Main St", "src": "account", "path": null },
    "address_line2": { "v": null, "src": "missing", "path": null },
    "city":  { "v": "Tampa", "src": "account", "path": null },
    "state": { "v": "FL", "src": "account", "path": null },
    "zip":   { "v": "33601", "src": "account", "path": null },
    // Warning-only cross-check against policies.named_insured (typed but rarely written,
    // 20251221160001:21) and <line>_details.identity.named_insured:
    "policy_named_insured_mismatch": false
  },

  "producer": {                             // Section 6
    "name":          { "v": "Lewis & Lewis Insurance", "src": "workspace", "path": null },
    "contact_name":  { "v": "Brian Lewis", "src": "workspace", "path": null },
    "phone":         { "v": "(813) 555-0100", "src": "workspace", "path": null },
    "fax":           { "v": null, "src": "missing", "path": null },
    "email":         { "v": "certs@lewisinsurance.com", "src": "workspace", "path": null },
    "address_line1": { "v": "...", "src": "workspace", "path": null },
    "address_line2": { "v": null, "src": "missing", "path": null },
    "city":  { "v": "...", "src": "workspace", "path": null },
    "state": { "v": "FL", "src": "workspace", "path": null },
    "zip":   { "v": "...", "src": "workspace", "path": null },
    "license_number": { "v": null, "src": "missing", "path": null }
  },

  "insurers": [                             // max 6, letters A..F, Sections 5.2 and 5.4
    {
      "letter": "A",
      "name": { "v": "Progressive American Insurance Co", "src": "extracted", "path": null },
      "naic": { "v": "24252", "src": "extracted", "path": "carrier_naic" },
      "carrier_id": "uuid-or-null",
      "resolution": "alias",                // carrier_id | exact | alias | normalized | unresolved
      "lines": ["gl", "umbrella"],
      "policy_ids": ["uuid", "uuid"]
    }
  ],
  "insurer_overflow": [],                   // same shape minus letter; non-empty is a blocker

  "lines": {
    "gl": {
      "present": true,
      "policy_id": "uuid",
      "insurer_letter": "A",
      "status": "active",
      "expired": false,                     // R6: per-line expired flag; UI disables the line checkbox when true
      "policy_number":   { "v": "GL1234567", "src": "manual", "path": null },   // typed, 20250908032636:69
      "effective_date":  { "v": "2026-01-01", "src": "manual", "path": null },  // typed, :71-72, nullable per types.ts:26527-26528
      "expiration_date": { "v": "2027-01-01", "src": "manual", "path": null },
      "occurrence_or_claims_made": { "v": "occurrence", "src": "extracted",
        "path": "cgl_details.coverage_options.policy_form" },                    // commercial-gl.ts:317
      "aggregate_applies_per": { "v": "policy", "src": "extracted",
        "path": "cgl_details.limits.aggregate_applies_per" },                    // commercial-gl.ts:275
      "limits": {                                                                 // commercial-gl.ts:255-279
        "each_occurrence":               { "v": 1000000, "src": "extracted", "path": "cgl_details.limits.each_occurrence" },
        "damage_to_rented_premises":     { "v": 100000,  "src": "extracted", "path": "cgl_details.limits.damage_to_rented_premises" },
        "medical_expense":               { "v": 5000,    "src": "extracted", "path": "cgl_details.limits.medical_expense" },
        "personal_advertising_injury":   { "v": 1000000, "src": "extracted", "path": "cgl_details.limits.personal_advertising_injury" },
        "general_aggregate":             { "v": 2000000, "src": "extracted", "path": "cgl_details.limits.general_aggregate" },
        "products_completed_ops_aggregate": { "v": 2000000, "src": "extracted", "path": "cgl_details.limits.products_completed_ops_aggregate" }
      },
      "additional_insureds": [             // policy_cgl_additional_insureds rows, Section 4
        {
          "id": "uuid", "name": "Enterprise Fleet Management",
          "additional_insured_id": null,   // FK to directory once linked (03-additional-insureds-directory.md)
          "ai_type": "both", "primary_noncontributory": true, "waiver_of_subrogation": true,
          "endorsement_status": "endorsed",         // none | requested | endorsed
          "endorsement_form": "CG 20 10 04 13",
          "effective_date": "2026-01-01", "expiration_date": null,
          "endorsement_confirmed_at": "2026-01-05T00:00:00Z", "endorsement_confirmed_by": "uuid"
        }
      ],
      "candidates": [
        { "policy_id": "uuid", "policy_number": "GL1234567", "status": "active",
          "expiration_date": "2027-01-01", "expired": false, "selected": true }
      ]
    },

    "auto": {
      "present": true,
      "policy_id": "uuid", "insurer_letter": "B", "status": "active", "expired": false,
      "policy_number": {}, "effective_date": {}, "expiration_date": {},
      "limit_type": { "v": "csl", "src": "extracted", "path": "bap_details.coverage.liability.limit_type" },  // commercial-auto.ts:109-123
      "csl":            { "v": 1000000, "src": "extracted", "path": "bap_details.coverage.liability.csl_limit" },
      "bi_per_person":  { "v": null, "src": "missing", "path": "bap_details.coverage.liability.bodily_injury_per_person" },
      "bi_per_accident":{ "v": null, "src": "missing", "path": "bap_details.coverage.liability.bodily_injury_per_accident" },
      "pd_per_accident":{ "v": null, "src": "missing", "path": "bap_details.coverage.liability.property_damage" },
      // ACORD 25 auto checkboxes, derived read-only from symbols (commercial-auto.ts:109-123 symbols,
      // hired_non_owned at :180-189) plus policy_bap_coverages rows
      // (coverage_type in hired_auto/non_owned_auto, 20251221180001:229-233):
      "checkboxes": {
        "any_auto":        { "v": true,  "src": "extracted", "path": null },
        "owned_autos":     { "v": false, "src": "missing",  "path": null },
        "scheduled_autos": { "v": false, "src": "missing",  "path": null },
        "hired_autos":     { "v": true,  "src": "extracted", "path": null },
        "non_owned_autos": { "v": true,  "src": "extracted", "path": null }
      },
      "additional_insureds": [             // policy_bap_interests where interest_type='additional_insured'
        { "id": "uuid", "name": "...", "additional_insured_id": null,
          "blanket": false,                // Section 4.7.2: auto/property blanket scope column
          "waiver_of_subrogation": false, "primary_noncontributory": false,
          "endorsement_status": "requested", "endorsement_form": null,
          "endorsement_effective_date": null,
          "endorsement_confirmed_at": null, "endorsement_confirmed_by": null }
      ],
      "candidates": []
    },

    "umbrella": {
      "present": true,
      "policy_id": "uuid", "insurer_letter": "A", "status": "active", "expired": false,
      "policy_number": {}, "effective_date": {}, "expiration_date": {},
      "umbrella_or_excess": { "v": "umbrella", "src": "extracted", "path": "umbrella_details.policy_type" },  // commercial-umbrella.ts:385
      "occurrence_or_claims_made": { "v": null, "src": "missing", "path": "umbrella_details.coi_summary.occurrence_or_claims_made" },
      "each_occurrence": { "v": 5000000, "src": "extracted", "path": "umbrella_details.limits.per_occurrence" },  // commercial-umbrella.ts:71-87
      "aggregate":       { "v": 5000000, "src": "extracted", "path": "umbrella_details.limits.aggregate" },
      "ded_or_retention": {
        "kind": { "v": "retention", "src": "extracted", "path": "umbrella_details.coi_summary.ded_or_retention_kind" },
        "amount": { "v": 10000, "src": "extracted", "path": "umbrella_details.retention.amount" }               // commercial-umbrella.ts:93-102
      },
      "additional_insureds": [ /* policy_umbrella_additional_insureds rows, same row shape as gl */ ],
      "candidates": []
    },

    "wc": {
      "present": true,
      "policy_id": "uuid", "insurer_letter": "C", "status": "active", "expired": false,
      "policy_number": {}, "effective_date": {}, "expiration_date": {},
      "per_statute": { "v": true, "src": "extracted", "path": null },   // wc_details.coverage.part_one_wc === 'statutory', workers-comp.ts:76
      "el_each_accident":         { "v": 500000, "src": "extracted", "path": "wc_details.coverage.part_two_employers_liability.each_accident" },       // workers-comp.ts:66-71
      "el_disease_each_employee": { "v": 500000, "src": "extracted", "path": "wc_details.coverage.part_two_employers_liability.disease_each_employee" },
      "el_disease_policy_limit":  { "v": 500000, "src": "extracted", "path": "wc_details.coverage.part_two_employers_liability.disease_policy_limit" },
      "proprietor_excluded": { "v": null, "src": "missing", "path": null },  // derived from policy_wc_officers.is_included (20251221160001:79-93) when rows exist
      "subrogation_waivers": [             // NEW policy_wc_subrogation_waivers rows, Section 4.3
        { "id": "uuid", "waiver_scope": "blanket", "name": null, "additional_insured_id": null,
          "endorsement_status": "endorsed", "endorsement_form": "WC 00 03 13",
          "endorsement_effective_date": "2026-01-01",
          "endorsement_confirmed_at": "...", "endorsement_confirmed_by": "uuid" }
      ],
      "candidates": []
    },

    "property": {
      "present": false,
      "policy_id": null, "insurer_letter": null, "status": null, "expired": false,
      "policy_number": {}, "effective_date": {}, "expiration_date": {},
      // ACORD 25 renders property in the free OTHER row; module-owned coi_summary namespace, Section 3.2
      "label":             { "v": null, "src": "missing", "path": "property_details.coi_summary.label" },
      "limit_amount":      { "v": null, "src": "missing", "path": "property_details.coi_summary.limit_amount" },
      "limit_description": { "v": null, "src": "missing", "path": "property_details.coi_summary.limit_description" },
      "additional_insureds": [ /* policy_property_interests where interest_type='additional_insured'; row shape as auto incl. blanket */ ],
      "candidates": []
    },

    "other": [   // unclassified policies so nothing silently disappears
      { "policy_id": "uuid", "policy_number": "...", "line_of_business": "commercial_policy",
        "line_canonical": "Commercial (unspecified)", "carrier": "...", "status": "active",
        "effective_date": "...", "expiration_date": "..." }
    ]
  },

  "description_of_operations": {           // Section 7
    "v": "Roofing contractor, residential and commercial.",
    "src": "manual",                       // manual | canopy | bap_risk_context | missing (mirrors ops_source)
    "prefill_candidates": [
      { "source": "canopy",   "text": "..." },   // canopy_business_operations.description_of_operations (20251227100000:344)
      { "source": "bap_risk_context", "text": "..." }  // bap_details.risk_context.business_description (commercial-auto.ts:54)
    ]
  },

  "review": {
    "last_reviewed_at": "2026-06-15T12:00:00Z",
    "last_reviewed_by": "uuid",
    "stale": true          // true when any contributing policies.updated_at, AI-table updated_at,
                           // or account_coi_profiles.updated_at is later than last_reviewed_at
  },

  "readiness": {           // Section 2.7; this vocabulary is canonical module-wide
    "ready": false,
    "blockers": [
      { "code": "insurer_unresolved", "line": "auto", "message": "Carrier 'Safe Harbor Insurance Company' does not resolve to an insurer row" },
      { "code": "limit_missing", "line": "gl", "path": "cgl_details.limits.each_occurrence", "message": "GL Each Occurrence limit is empty" },
      { "code": "policy_expired", "line": "wc", "message": "WC policy WC123 expired 2026-05-01" }
    ],
    "warnings": [
      { "code": "naic_missing", "line": "wc", "message": "Insurer C has no NAIC code" },
      { "code": "policy_expiring_soon", "line": "gl", "message": "GL policy expires in 21 days" },
      { "code": "endorsement_requested", "line": "gl", "message": "1 additional insured is requested but not yet endorsed" },
      { "code": "review_stale", "message": "Policy data changed after the last Master COI review" }
    ]
  }
}
```

Contract rules:

- Absent lines still return the full skeleton with `present: false` and `missing` cells, so the panel renders a stable grid.
- Money values are raw numbers, never formatted strings. Dates are ISO `YYYY-MM-DD`. Checkbox-like values are booleans or closed-vocabulary strings in the contract; conversion to ACORD `Y`/`N` literals is the pipeline's job (05-acord25-pipeline.md).
- Premium is deliberately absent from the contract. Nothing in this read model exposes premium, enforcing the never-print-premium rule at the data layer.
- No PII beyond what the ACORD 25 itself carries: no SSN, DOB, DLN, FEIN in the contract. `policies.fein` exists (20251221160001:16-18) and is intentionally NOT included.
- The insurer letters in this contract are THE letters (Section 5.4). The client preview (05-acord25-pipeline.md builder) takes this letter map as input and never recomputes it; `generate-certificate` re-reads `get_master_coi` at issue time so the printed letters come from this same implementation, and 422s if the client-displayed letters (sent as a cross-check) differ.

### 2.7 Readiness computation: the canonical blocker and warning vocabulary

Computed inside `get_master_coi`, rules as data where possible (the registry, Section 3.2, drives the missing-field checks). This section is the ONE definition of the readiness vocabulary; 04-issuance-and-snapshots.md (the `generate-certificate` 422 gate) and 06-ui-surfaces.md (checkbox disabling, amber states) cite it and never redefine it.

Blockers (cert must not generate; `generate-certificate` returns 422 on ANY blocker for the selected lines):

| code | Rule |
|---|---|
| `no_lines` | No policy classified into any of the five lines |
| `policy_core_missing` | A selected line policy lacks policy_number, effective_date, or expiration_date |
| `limit_missing` | A registry path flagged `required_for_ready` is null on a selected line (GL each_occurrence and general_aggregate; Auto csl or complete split set; Umbrella each_occurrence; WC all three EL limits) |
| `insurer_unresolved` | A selected line's carrier resolves to no insurer name at all |
| `policy_expired` | A selected policy's expiration_date is in the past. This is a BLOCKER, never a warning: an ACORD 25 must not print an expired policy as in-force coverage. Each line object also carries the `expired` boolean so the UI disables the line checkbox |
| `insurer_overflow` | More than 6 distinct insurers across selected lines (Section 5.4). Blocker message includes guidance: reduce the selected policy set or issue two certificates |

Warnings (cert can generate, panel shows amber):

| code | Rule |
|---|---|
| `naic_missing` | Insurer row has no NAIC from any source |
| `naic_mismatch` | Typed `policies.carrier_naic` and extracted `identity.carrier_naic` are both non-null and differ (cell flag `mismatch`) |
| `policy_expiring_soon` | A selected policy expires within 30 days. This is the ONLY date warning in the module |
| `endorsement_requested` | Any AI row on a selected line has endorsement_status = 'requested' |
| `manual_overwritten` | Any cell flagged `overwritten_manual` (Section 3.3) |
| `named_insured_mismatch` | policies.named_insured or identity.named_insured disagrees with accounts.name (normalized compare via normalize_entity_name) |
| `ops_missing` | description_of_operations empty |
| `review_stale` | Data changed after last_reviewed_at |
| `unclassified_policies` | lines.other[] non-empty |
| `producer_incomplete` | Producer name or phone missing (Section 6) |

---

## 3. Write model for manual-entry policies

### 3.1 Options considered, recommendation

The manual population (AddPolicyModal-created policies, empty blobs) needs a home for staff-entered limits, NAIC, and flags.

- Option A, write into the same `<line>_details` JSONB paths the extractors use. Uniform read path: `get_master_coi` reads one location per field regardless of origin; provenance distinguishes manual from extracted. Precedent already exists in the repo: PolicyManualDetailsModal writes `wc_details` directly with `extraction_source: 'manual'` (PolicyManualDetailsModal.tsx:485-500), and useCGLExtraction merge-updates `cgl_details` client side (useCGLExtraction.ts:505-520).
- Option B, new typed columns for every ACORD 25 scalar. Roughly 25 new columns on `policies`, a second source of truth for every extraction-rich policy, and a permanent merge problem in the read path (which wins, column or blob?). Rejected.
- Option C, a `coi_overrides` table keyed (policy_id, field). A parallel data model in all but name; violates the spirit of Decision 2, doubles every read, and makes the extractors and the COI module disagree about where truth lives. Rejected.

Decision: Option A. Manual values are written to the exact same JSONB paths (and, for NAIC and named insured, the existing typed columns) the rest of the system reads. Provenance lives in a ledger column, not in a parallel value store. This is the only option where the bimodal population converges to one shape: after a staff member fills in a manual policy's GL limits, that policy is indistinguishable from an extracted one at read time except for its provenance labels.

Two guardrails make Option A safe:

1. All writes go through one RPC with a server-side path whitelist (never raw client `jsonb_set`), so nothing outside the registry can be touched and enum/numeric validation is enforced centrally.
2. A provenance ledger records what was written, by whom, and the value written, so later extractor overwrites are detectable (Section 3.3).

### 3.2 coi_field_registry (rules as data)

A seed-only reference table that is simultaneously: the write whitelist, the validation table, the missing-field checklist, and the panel's field catalog. This follows the handoff's rules-as-data guidance at the data layer.

```sql
create table if not exists public.coi_field_registry (
  path            text primary key,       -- exact write path relative to the policies row
  line_kind       text not null check (line_kind in ('gl','auto','umbrella','wc','property','policy')),
  storage         text not null check (storage in ('jsonb','column')),
  value_type      text not null check (value_type in ('money','text','date','enum','boolean')),
  enum_values     text[],                  -- non-null when value_type = 'enum'
  label           text not null,           -- panel display label
  acord25_box     text,                    -- documentation: which ACORD 25 box this feeds
  required_for_ready boolean not null default false,
  sort_order      int not null default 0
);
alter table public.coi_field_registry enable row level security;
create policy "coi_field_registry_read" on public.coi_field_registry
  for select to authenticated using (true);
-- no insert/update/delete policies: seed via migrations only
```

Seed rows (exact, complete):

| path | line_kind | storage | value_type | enum_values | required_for_ready |
|---|---|---|---|---|---|
| `carrier_naic` | policy | column | text | | false |
| `named_insured` | policy | column | text | | false |
| `dba` | policy | column | text | | false |
| `cgl_details.limits.each_occurrence` | gl | jsonb | money | | true |
| `cgl_details.limits.damage_to_rented_premises` | gl | jsonb | money | | false |
| `cgl_details.limits.medical_expense` | gl | jsonb | money | | false |
| `cgl_details.limits.personal_advertising_injury` | gl | jsonb | money | | false |
| `cgl_details.limits.general_aggregate` | gl | jsonb | money | | true |
| `cgl_details.limits.products_completed_ops_aggregate` | gl | jsonb | money | | false |
| `cgl_details.limits.aggregate_applies_per` | gl | jsonb | enum | {policy,project,location} | false |
| `cgl_details.coverage_options.policy_form` | gl | jsonb | enum | {occurrence,claims_made} | false |
| `bap_details.coverage.liability.limit_type` | auto | jsonb | enum | {csl,split} | false |
| `bap_details.coverage.liability.csl_limit` | auto | jsonb | money | | true |
| `bap_details.coverage.liability.bodily_injury_per_person` | auto | jsonb | money | | false |
| `bap_details.coverage.liability.bodily_injury_per_accident` | auto | jsonb | money | | false |
| `bap_details.coverage.liability.property_damage` | auto | jsonb | money | | false |
| `umbrella_details.policy_type` | umbrella | jsonb | enum | {umbrella,excess} | false |
| `umbrella_details.limits.per_occurrence` | umbrella | jsonb | money | | true |
| `umbrella_details.limits.aggregate` | umbrella | jsonb | money | | false |
| `umbrella_details.retention.amount` | umbrella | jsonb | money | | false |
| `umbrella_details.coi_summary.ded_or_retention_kind` | umbrella | jsonb | enum | {deductible,retention} | false |
| `umbrella_details.coi_summary.occurrence_or_claims_made` | umbrella | jsonb | enum | {occurrence,claims_made} | false |
| `wc_details.coverage.part_two_employers_liability.each_accident` | wc | jsonb | money | | true |
| `wc_details.coverage.part_two_employers_liability.disease_each_employee` | wc | jsonb | money | | true |
| `wc_details.coverage.part_two_employers_liability.disease_policy_limit` | wc | jsonb | money | | true |
| `property_details.coi_summary.label` | property | jsonb | text | | false |
| `property_details.coi_summary.limit_amount` | property | jsonb | money | | false |
| `property_details.coi_summary.limit_description` | property | jsonb | text | | false |

Design points:

- Every jsonb path except the three `coi_summary` groups is an extractor-written path with a verified TS type (citations in Section 2.6). The `coi_summary.*` namespace is new and module-owned: it holds COI-relevant values that have no extractor equivalent (property OTHER-row summary, umbrella deductible-vs-retention checkbox kind, umbrella occur/claims-made). Extractors never write `coi_summary`, so there is zero collision risk. It lives inside the same blob to keep the one-location-per-line rule.
- `required_for_ready` drives the `limit_missing` blocker. Auto is special-cased in the RPC: ready when `csl_limit` present OR all three split limits present, matching `limit_type`.
- `line_kind = 'policy'` paths are typed columns valid on any line; `carrier_naic` (20251221160001:12-13), `named_insured` (:21), `dba` (:24) exist and are unwritten today (gt-policies-schema.md discrepancy 4), so the module adopts them (Section 5.3).
- Adding an ACORD field later (or an ACORD 125/126 field set) is a registry seed migration, not a function rewrite.

### 3.3 coi_field_provenance ledger

One new JSONB column on `policies`:

```sql
alter table public.policies
  add column if not exists coi_field_provenance jsonb not null default '{}'::jsonb;

comment on column public.policies.coi_field_provenance is
  'Master COI manual-write ledger. Keys are coi_field_registry.path. Values: '
  '{"val": <written value>, "updated_by": uuid, "updated_at": iso, "prev": <prior value>}. '
  'Written ONLY by save_master_coi_fields. Extractors must never touch this column.';
```

Provenance resolution for a cell (deterministic, in this order):

1. Ledger entry exists AND `ledger.val` equals current value at path: `src = 'manual'` with updated_at/by from the ledger.
2. Ledger entry exists AND values differ: an extractor re-ran after the manual edit and overwrote it (extract functions update whole blobs, extract-cgl-policy/index.ts:437-445). Cell gets `src = 'extracted'` plus `flag = 'overwritten_manual'`, and readiness emits the `manual_overwritten` warning. The ledger `prev`/`val` gives the panel enough to offer "restore my value".
3. No ledger entry, value non-null, blob extraction_source in ('ai_extracted','azure_di_claude') or path present in `<line>_field_evidence`: `src = 'extracted'`, `conf` from `policies.extraction_confidence` or per-path evidence when available.
4. No ledger entry, value non-null: `src = 'manual'` with null updated_at/updated_by (unattributed human entry: PolicyManualDetailsModal writes, typed columns from AddPolicyModal, historical imports).
5. Value null or absent: `src = 'missing'`.

This is why no `coi_overrides` table is needed: the ledger is metadata about the single value, not a second value.

### 3.4 save_master_coi_fields RPC

```sql
create or replace function public.save_master_coi_fields(
  p_policy_id uuid,
  p_updates   jsonb    -- flat object: {"<registry path>": <value>, ...}; value null clears the field
)
returns jsonb          -- {"policy_id": uuid, "updated": ["path", ...], "rejected": [{"path": "...", "reason": "..."}]}
language plpgsql
volatile
security definer
set search_path = public
as $$ ... $$;

revoke execute on function public.save_master_coi_fields(uuid, jsonb) from anon, public;
grant  execute on function public.save_master_coi_fields(uuid, jsonb) to authenticated;
```

Behavior, exactly:

1. Gate: `is_staff()` or raise 42501. Then verify the policy exists, `deleted_at is null`, and load it `FOR UPDATE` (single-row lock makes the read-modify-write of blobs atomic against concurrent saves).
2. For each key in `p_updates`:
   a. Look up the key in `coi_field_registry`. Unknown key -> rejected `{reason: 'unknown_path'}`. This is the whitelist; nothing else is writable, ever, including extraction metadata, evidence, premium, or arbitrary blob keys.
   b. Validate by `value_type`: money must be numeric and >= 0; enum must be in `enum_values`; date must cast to date; text max length 2000; boolean must be jsonb true/false. Failures -> rejected `{reason: 'invalid_value'}`.
   c. Apply:
      - `storage = 'column'`: `update policies set <ident> = value` (three known columns, addressed via CASE, no dynamic SQL on user input).
      - `storage = 'jsonb'`: split path on '.', first segment is the blob column (one of the five `<line>_details`), remainder is the in-blob path; apply `jsonb_set(coalesce(blob, '{}'::jsonb), rest_of_path, to_jsonb(value), true)` with parent objects created via a small helper that builds missing intermediate objects (jsonb_set does not create missing parents beyond the last key; the helper walks the path and coalesces each level to '{}').
   d. Ledger: `coi_field_provenance = jsonb_set(coi_field_provenance, array[path], jsonb_build_object('val', new_value, 'prev', old_value, 'updated_by', auth.uid(), 'updated_at', now()))`. Clearing a field (null) records `{"val": null, ...}` so a deliberate blank is still `manual`, distinguishable from `missing` only by the ledger; the read model reports src 'manual' with v null.
3. If a jsonb write targeted a blob that was null and the blob now exists for the first time, also set the blob's `extraction_source` sub-key to 'manual' only when creating the blob from scratch (mirrors PolicyManualDetailsModal.tsx:485-500), never when the blob already exists (do not stomp 'azure_di_claude' on extraction-rich policies).
4. Single `UPDATE policies SET ... WHERE id = p_policy_id` per call (all blob mutations accumulated in plpgsql variables first). The existing policies UPDATE triggers fire normally; none of them react to these columns (`auto_sync_policy_to_renewal` reads carrier_id/status/dates only, 20260423000001_fix_policy_triggers_remove_policy_type.sql:26-28).
5. Return the updated/rejected report. The client then invalidates the master-coi query (Section 8.2).

Explicitly NOT writable through this RPC: policy_number, effective_date, expiration_date, status, carrier (these already have an editing surface, EditPolicyModal via CustomerPoliciesSection.tsx:223-232, and changing them has renewal-sync side effects the COI module must not own).

---

## 4. Endorsement status three-state (Decision 5)

### 4.1 Semantics

Per (line, additional insured) row:

| endorsement_status | Meaning | ACORD 25 ADDL INSD rendering |
|---|---|---|
| `none` | Recorded but explicitly not an additional insured (demoted without deleting the row, keeps history), or a non-AI interest row | N (blank) |
| `requested` | Endorsement asked of the carrier, no confirmation artifact yet | N, and the issuance layer must refuse to print Y; panel shows amber "requested" |
| `endorsed` | Endorsement confirmed: form number recorded and/or extracted from the policy document itself | Y, but only for a holder the row resolves to (Section 4.7) |

Absence of a row is also "none". The `none` enum value exists so demotion is an auditable UPDATE, not a DELETE.

Default for new rows on the pure-AI tables (cgl, umbrella) is `requested`: a newly recorded AI is an assertion in progress, never an automatic Y. On the mixed interest tables (bap, property) the column default is `none` because most rows are loss payees and lienholders; the RPC sets `requested` when staff record a new AI. This is the concrete implementation of Decision 5's "never a default-Y checkbox".

Line-level `endorsed` is necessary but NOT sufficient to print Y. The printed ADDL INSD / SUBR WVD values are holder-scoped: `resolve_holder_endorsements` (Section 4.7) decides per (line, holder), and `generate-certificate` prints Y only when the user requested Y AND the holder resolves endorsed (downgrade-only intent; 04-issuance-and-snapshots.md returns 422 on a Y request for a non-endorsed pair).

SUBR WVD is separate from ADDL INSD on the ACORD 25 and stays a per-row boolean (`waiver_of_subrogation`), except WC, which gets its own waiver table (4.3) because WC has no AI concept but waiver of subrogation on WC is a real, endorsable, sometimes holder-specific fact.

### 4.2 DDL: extend the four existing tables

Migration `20260702090000_master_coi_endorsement_status.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 1) GL: policy_cgl_additional_insureds (20251221190001:96-137)
--    already has ai_type, waiver_of_subrogation, endorsement_form, per-AI dates
-- ---------------------------------------------------------------------------
alter table public.policy_cgl_additional_insureds
  add column if not exists endorsement_status text not null default 'requested'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;   -- column only; FK shipped by the directory wire-up, Section 4.6

-- Backfill: rows extracted from the policy document itself, or carrying a form
-- reference, are evidence the endorsement exists.
update public.policy_cgl_additional_insureds
   set endorsement_status = 'endorsed'
 where endorsement_form is not null
    or extraction_status = 'AUTO_APPLIED';

-- ---------------------------------------------------------------------------
-- 2) Umbrella: policy_umbrella_additional_insureds (20251221210001:108-137)
--    has ai_type + waiver but NO endorsement_form and NO dates today
-- ---------------------------------------------------------------------------
alter table public.policy_umbrella_additional_insureds
  add column if not exists endorsement_form text,
  add column if not exists effective_date date,
  add column if not exists expiration_date date,
  add column if not exists endorsement_status text not null default 'requested'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;

-- Backfill grants 'endorsed' ONLY to document-evidenced rows. follow_underlying
-- rows deliberately STAY 'requested': an extractor classification is not an
-- endorsement artifact. They get one-click human confirm via set_line_ai_endorsement
-- (a follow-form provision in the actual policy text satisfies rule 4's evidence test
-- when a human confirms it).
update public.policy_umbrella_additional_insureds
   set endorsement_status = 'endorsed'
 where extraction_status = 'AUTO_APPLIED';

-- ---------------------------------------------------------------------------
-- 3) Auto: policy_bap_interests (20251221180001:164-191)
--    lacks ai_type, waiver, P&NC, endorsement reference entirely
-- ---------------------------------------------------------------------------
alter table public.policy_bap_interests
  add column if not exists waiver_of_subrogation boolean not null default false,
  add column if not exists primary_noncontributory boolean not null default false,
  add column if not exists blanket boolean not null default false,   -- Section 4.7.2 scope mapping
  add column if not exists endorsement_status text not null default 'none'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_form text,
  add column if not exists endorsement_effective_date date,
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;

update public.policy_bap_interests
   set endorsement_status = case when extraction_status = 'AUTO_APPLIED' then 'endorsed' else 'requested' end
 where interest_type = 'additional_insured';

-- Non-AI interest rows must stay 'none' (DO-block guard: ADD CONSTRAINT has no IF NOT EXISTS)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bap_interests_ai_status_scope'
      and conrelid = 'public.policy_bap_interests'::regclass
  ) then
    alter table public.policy_bap_interests
      add constraint bap_interests_ai_status_scope
      check (interest_type = 'additional_insured' or endorsement_status = 'none');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Property: policy_property_interests (20251221200001:189-214), same gap as Auto
-- ---------------------------------------------------------------------------
alter table public.policy_property_interests
  add column if not exists waiver_of_subrogation boolean not null default false,
  add column if not exists primary_noncontributory boolean not null default false,
  add column if not exists blanket boolean not null default false,   -- Section 4.7.2 scope mapping
  add column if not exists endorsement_status text not null default 'none'
    check (endorsement_status in ('none','requested','endorsed')),
  add column if not exists endorsement_form text,
  add column if not exists endorsement_effective_date date,
  add column if not exists endorsement_confirmed_at timestamptz,
  add column if not exists endorsement_confirmed_by uuid references auth.users(id),
  add column if not exists additional_insured_id uuid;

update public.policy_property_interests
   set endorsement_status = case when extraction_status = 'AUTO_APPLIED' then 'endorsed' else 'requested' end
 where interest_type = 'additional_insured';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'property_interests_ai_status_scope'
      and conrelid = 'public.policy_property_interests'::regclass
  ) then
    alter table public.policy_property_interests
      add constraint property_interests_ai_status_scope
      check (interest_type = 'additional_insured' or endorsement_status = 'none');
  end if;
end $$;

create index if not exists idx_cgl_ai_endorsement_status  on public.policy_cgl_additional_insureds(endorsement_status);
create index if not exists idx_umb_ai_endorsement_status  on public.policy_umbrella_additional_insureds(endorsement_status);
create index if not exists idx_bap_int_endorsement_status on public.policy_bap_interests(endorsement_status) where interest_type = 'additional_insured';
create index if not exists idx_prop_int_endorsement_status on public.policy_property_interests(endorsement_status) where interest_type = 'additional_insured';
```

Backfill rationale: extraction rows with `AUTO_APPLIED` status came off the actual policy document (the extractors insert them from the dec/endorsement pages, extract-cgl-policy/index.ts:324-345, extract-umbrella-policy/index.ts:327-346), which is the endorsement evidence itself. Everything else recorded-but-unevidenced becomes `requested`, which is the safe direction for E&O: the module will under-claim, never over-claim. Note the umbrella backfill grants `endorsed` ONLY on `extraction_status = 'AUTO_APPLIED'`; `follow_underlying` rows stay `requested` pending one-click human confirmation, because an extractor's classification of a follow-form provision is not itself an endorsement artifact.

Compatibility: all new columns have defaults, so the existing client insert into `policy_cgl_additional_insureds` (useCGLExtraction.ts:562-575) and the extractor inserts keep working unchanged. Extractor upgrades to set `endorsement_status = 'endorsed'` explicitly on AUTO_APPLIED inserts are a nice-to-have follow-up, not required (rows land as `requested` until reviewed, which is correct-by-default).

### 4.3 New table: policy_wc_subrogation_waivers

WC waiver of subrogation is a real ACORD 25 field (SUBR WVD on the WC line) with no home today (gt-policies-schema.md, SUBR WVD row). It is endorsable blanket (WC 00 03 13) or person-specific, so it needs rows, not a boolean.

```sql
create table if not exists public.policy_wc_subrogation_waivers (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  agency_workspace_id uuid not null references public.agency_workspaces(id),  -- derived server-side, Section 4.4

  waiver_scope text not null default 'specific'
    check (waiver_scope in ('blanket','specific')),
  name text,                -- required when specific; the org/person waived in favor of
  street text, city text, state text, zip text,
  additional_insured_id uuid,   -- directory link; column only, FK shipped by the directory wire-up (Section 4.6)

  endorsement_status text not null default 'requested'
    check (endorsement_status in ('none','requested','endorsed')),
  endorsement_form text,        -- e.g. 'WC 00 03 13'
  endorsement_effective_date date,
  endorsement_confirmed_at timestamptz,
  endorsement_confirmed_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wc_waiver_name_when_specific
    check (waiver_scope = 'blanket' or name is not null)
);

create index if not exists idx_wc_subro_waivers_policy on public.policy_wc_subrogation_waivers(policy_id);
create index if not exists idx_wc_subro_waivers_status on public.policy_wc_subrogation_waivers(endorsement_status);
create index if not exists idx_wc_subro_waivers_workspace on public.policy_wc_subrogation_waivers(agency_workspace_id);

create or replace function public.update_wc_subro_waivers_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trigger_wc_subro_waivers_updated
  before update on public.policy_wc_subrogation_waivers
  for each row execute function public.update_wc_subro_waivers_updated_at();
```

Holder-time resolution for the WC SUBR WVD box is owned by `resolve_holder_endorsements` (Section 4.7): SUBR WVD = Y on the WC row for a given certificate holder iff there exists a row with `endorsement_status = 'endorsed'` and (`waiver_scope = 'blanket'` OR the row matches the holder by `additional_insured_id` or normalized name).

### 4.4 Workspace scoping and RLS for the new table (module posture)

All new module tables carry `agency_workspace_id` with `is_staff() AND is_agency_member(agency_workspace_id)` RLS, matching the Phase 0 posture for acord_forms (01-disposition-and-roadmap.md) and the sec005 pattern (20260408100000_sec005_leads_workspace_isolation.sql). No auth-only or membership-only exceptions.

The workspace id is derived server-side, never trusted from the client. A BEFORE INSERT trigger sets it unconditionally from the policy's account, with the sec005 oldest-workspace fallback for accounts whose `agency_workspace_id` is null:

```sql
create or replace function public.set_wc_subro_waiver_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(
           a.agency_workspace_id,
           (select id from public.agency_workspaces order by created_at limit 1)
         )
    into new.agency_workspace_id
  from public.policies p
  join public.accounts a on a.id = p.account_id
  where p.id = new.policy_id;
  if new.agency_workspace_id is null then
    raise exception 'cannot derive agency_workspace_id for policy %', new.policy_id;
  end if;
  return new;
end $$;

create trigger trg_wc_subro_waiver_workspace
  before insert on public.policy_wc_subrogation_waivers
  for each row execute function public.set_wc_subro_waiver_workspace();

alter table public.policy_wc_subrogation_waivers enable row level security;

create policy "wc_subro_waivers_select" on public.policy_wc_subrogation_waivers
  for select using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );

create policy "wc_subro_waivers_write" on public.policy_wc_subrogation_waivers
  for all using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  ) with check (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );
```

(`is_agency_member` verified at 20251228000000_m0_agency_workspace_foundation.sql:125-139.)

Existing-table RLS hardening: the CGL/BAP/Property/Umbrella child tables keep their existence-only policies (for example 20251221180001:199-217, 20251221190001:343-473) in this design; rewriting them has a blast radius across the extraction hooks and is not required for the module because all endorsement-status transitions go through the staff-gated RPC below. A separate hardening migration (workspace-scoped predicates on those tables) is recommended debt, sequenced after this module ships, and is called out in Risks.

### 4.5 Status-transition RPC

Endorsement status is a legal assertion; transitions must be attributable. One RPC covers all five tables. The CoverageLineDrawer in 06-ui-surfaces.md edits endorsements as a PER-AI-ROW list, each row transitioning through this RPC; there is no line-level status control anywhere.

```sql
create or replace function public.set_line_ai_endorsement(
  p_line   text,     -- 'gl' | 'umbrella' | 'auto' | 'property' | 'wc'
  p_row_id uuid,     -- PK in the line's table
  p_status text,     -- 'none' | 'requested' | 'endorsed'
  p_endorsement_form text default null,
  p_endorsement_effective_date date default null
)
returns jsonb        -- the updated row as jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$ ... $$;

revoke execute on function public.set_line_ai_endorsement(text, uuid, text, text, date) from anon, public;
grant  execute on function public.set_line_ai_endorsement(text, uuid, text, text, date) to authenticated;
```

Behavior:

1. `is_staff()` gate.
2. Dispatch on `p_line` to the table: gl -> policy_cgl_additional_insureds, umbrella -> policy_umbrella_additional_insureds, auto -> policy_bap_interests, property -> policy_property_interests, wc -> policy_wc_subrogation_waivers. Invalid line or status raises.
3. For auto/property, refuse unless the row's `interest_type = 'additional_insured'` (WC exempt, it has no interest_type).
4. Transition rules: setting `endorsed` requires `p_endorsement_form` non-null OR the row already has an `endorsement_form` OR the row's `extraction_status = 'AUTO_APPLIED'` (document-evidenced). Otherwise raise `'endorsed status requires an endorsement form reference'`. This encodes "endorsed means an endorsement actually exists" at the database boundary. This is also the one-click confirm path for umbrella `follow_underlying` rows left at `requested` by the backfill: staff confirm with the underlying form reference or the policy provision citation.
5. On `endorsed`: set `endorsement_confirmed_at = now()`, `endorsement_confirmed_by = auth.uid()`, and the form/date params when provided (auto/property use `endorsement_effective_date`; gl/umbrella use their `effective_date` column). On `requested`/`none`: null out confirmed_at/confirmed_by, keep the form text for history.

Row creation and edits of name/address/ai_type stay on the existing direct-table paths (the pattern useCGLExtraction already uses at :562-575); only the status field is RPC-gated.

### 4.6 Linkage to the Additional Insureds directory

Each of the five tables (policy_cgl_additional_insureds, policy_umbrella_additional_insureds, policy_bap_interests, policy_property_interests, policy_wc_subrogation_waivers) gains `additional_insured_id uuid` as a plain nullable COLUMN in migration `20260702090000` (this doc). No FK constraints ship here.

The Additional Insureds directory (03-additional-insureds-directory.md) owns the `additional_insureds` table and ships ONE wire-up migration, sequenced after both its table-create migration and `20260702090000`, that adds the FK constraints to ALL FIVE tables:

```sql
-- Directory-owned wire-up migration (constraint-add only, idempotency-guarded there):
alter table public.policy_cgl_additional_insureds
  add constraint fk_cgl_ai_directory foreign key (additional_insured_id)
  references public.additional_insureds(id) on delete set null;
-- and identically for policy_umbrella_additional_insureds, policy_bap_interests,
-- policy_property_interests, policy_wc_subrogation_waivers
```

This keeps the two workstreams decoupled: this doc's migration never fails on a missing table, and the directory migration adds referential integrity for all five link columns when it lands (which also makes them visible to the directory's FK-introspection merge engine). `get_master_coi` returns `additional_insured_id` pass-through either way.

### 4.7 resolve_holder_endorsements: the holder-scoped E&O gate

This RPC is the single implementation of the Decision 5 guarantee: never print ADDL INSD Y (or SUBR WVD Y) for a holder who is not actually endorsed. BOTH consumers call it, so the UI gate and the printed Y/N can never disagree:

- 06-ui-surfaces.md: `useHolderEndorsementStatus` (Section 8.2) wraps this RPC to drive the per-line ADDL INSD / SUBR WVD toggles (default ON when holder-resolved endorsed, user may turn OFF, disabled locked-N otherwise, reset on holder change).
- 04-issuance-and-snapshots.md: `generate-certificate` calls it server-side with the request's holder_id and policy ids. Print semantics are downgrade-only: Y prints only when (user requested Y) AND (holder-resolved 'endorsed'); the server returns 422 if the client requests Y on a non-endorsed (line, holder) pair.

The resolved values are text over the closed set `'endorsed' | 'requested' | 'none'`, never booleans. 04-issuance-and-snapshots.md, 05-acord25-pipeline.md, and 06-ui-surfaces.md consume this exact three-state contract: only `'endorsed'` can ever print Y; `'requested'` lets the UI show the amber requested state (endorsement asked of the carrier, not yet confirmed) without unlocking the toggle; `'none'` is a locked N.

`p_holder_id` is a `public.additional_insureds.id` (the directory, 03-additional-insureds-directory.md), the same id that lands in `certificates.holder_id` at issue time.

#### 4.7.1 Signature and skeleton

```sql
create or replace function public.resolve_holder_endorsements(
  p_account_id uuid,
  p_holder_id  uuid,
  p_policy_ids uuid[]
)
returns table (
  line_key           text,      -- canonical: 'gl' | 'auto' | 'umbrella' | 'wc' | 'property'
  addl_insd_resolved text,      -- closed set: 'endorsed' | 'requested' | 'none'
  subr_wvd_resolved  text,      -- closed set: 'endorsed' | 'requested' | 'none'
  basis              jsonb      -- {"addl_insd": {...}, "subr_wvd": {...}}, shape in 4.7.3
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_holder_name text;
  v_holder_ws   uuid;
  v_holder_norm text;
  v_account_ws  uuid;
  v_gl_addl     text := 'none';   -- computed first; umbrella follow_underlying delegates to it
  v_gl_subr     text := 'none';   -- three-state: 'endorsed' | 'requested' | 'none'
begin
  -- Gate: staff users or the service role (generate-certificate).
  if auth.role() is distinct from 'service_role' and not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  -- Holder must exist in the directory.
  select ai.name, ai.agency_workspace_id
    into v_holder_name, v_holder_ws
  from public.additional_insureds ai
  where ai.id = p_holder_id and ai.deleted_at is null;
  if not found then
    raise exception 'holder % not found', p_holder_id;
  end if;
  v_holder_norm := public.normalize_entity_name(v_holder_name);

  -- Tenancy cross-check (defense in depth under SECURITY DEFINER).
  select a.agency_workspace_id into v_account_ws
  from public.accounts a
  where a.id = p_account_id and a.deleted_at is null;
  if not found then
    raise exception 'account % not found', p_account_id;
  end if;
  if v_holder_ws is not null and v_account_ws is not null
     and v_holder_ws <> v_account_ws then
    raise exception 'holder and account belong to different workspaces';
  end if;

  -- Every requested policy must belong to the account.
  if exists (
    select 1 from unnest(p_policy_ids) pid
    left join public.policies p
           on p.id = pid and p.account_id = p_account_id and p.deleted_at is null
    where p.id is null
  ) then
    raise exception 'policy list contains ids not belonging to account %', p_account_id;
  end if;

  -- Per-line resolution follows (4.7.2 mapping + 4.7.3 matching), GL first,
  -- then auto, umbrella (may delegate to GL), wc, property.
  -- Two query tiers per box: the endorsed tier runs first and, on a hit,
  -- resolves 'endorsed'. Only when it is empty does the requested tier run:
  -- it resolves 'requested' when a blanket-scoped or holder-matched row exists
  -- with endorsement_status = 'requested'. No hit in either tier resolves 'none'.
  -- The endorsed tier always wins over the requested tier.
  -- Always returns exactly five rows, one per canonical line key.
  ...
end $$;

revoke execute on function public.resolve_holder_endorsements(uuid, uuid, uuid[]) from anon, public;
grant  execute on function public.resolve_holder_endorsements(uuid, uuid, uuid[]) to authenticated, service_role;
```

The function always returns exactly five rows (gl, auto, umbrella, wc, property), `'none'`/`'none'` with basis `{"kind":"none"}` for lines with no selected policy and no row hitting either tier, so both consumers get a stable shape.

#### 4.7.2 The blanket vs scheduled mapping, per table (normative)

Resolution is two-tiered per box. A box resolves `'endorsed'` for holder H iff a row exists with `endorsement_status = 'endorsed'` AND (the row is blanket-scoped per this table, OR the row holder-matches H per 4.7.3). When no row resolves `'endorsed'`, the box resolves `'requested'` iff a row with the same blanket-or-holder-match scope exists with `endorsement_status = 'requested'`; the endorsed tier always wins over the requested tier. Otherwise the box resolves `'none'`. The mapping below is the module's single definition of "blanket-scoped":

| Table | Blanket when | Scheduled (holder-matched) when |
|---|---|---|
| `policy_cgl_additional_insureds` | `ai_type = 'owners_lessees_contractors'` AND the endorsement form, normalized by `regexp_replace(upper(coalesce(endorsement_form,'')), '[^A-Z0-9]', '', 'g')`, starts with `CG2033` or `CG2038` (the automatic-status endorsement class). The form guard exists because `owners_lessees_contractors` also covers the scheduled CG 20 10 class; without a blanket form number as evidence, the row is treated as scheduled, which under-claims (safe direction) | Every other case: ai_type in ('ongoing_ops','completed_ops','both','managers_lessors','vendors','co_owner','designated_person','other'), and 'owners_lessees_contractors' rows failing the form guard |
| `policy_umbrella_additional_insureds` | `ai_type = 'blanket'` | `ai_type = 'scheduled'`. `ai_type = 'follow_underlying'` is neither: an endorsed follow_underlying row resolves `'endorsed'` for H iff the GL line in the same policy set holder-resolves `'endorsed'` for H (delegation; addl_insd delegates to GL addl_insd, subr_wvd to GL subr_wvd; the requested tier delegates the same way, so the umbrella box reports `'requested'` when the GL result is `'requested'`). If no GL line is in the selected set, follow_underlying never resolves (basis kind `follow_underlying_no_underlying`) |
| `policy_bap_interests` (interest_type = 'additional_insured' only) | `blanket = true` (new boolean column, Section 4.2; the explicit representation of a blanket AI endorsement such as blanket designated-insured wording, since interests rows have no ai_type) | `blanket = false` |
| `policy_property_interests` (interest_type = 'additional_insured' only) | `blanket = true` (same new column) | `blanket = false` |
| `policy_wc_subrogation_waivers` | `waiver_scope = 'blanket'` | `waiver_scope = 'specific'` |

ADDL INSD resolution per line uses AI rows only (`interest_type = 'additional_insured'` on bap/property). WC has no AI concept: `addl_insd_resolved` is always `'none'` on the wc line. SUBR WVD resolution: gl/auto/umbrella/property require the resolving row (in either tier) to also have `waiver_of_subrogation = true`; wc uses `policy_wc_subrogation_waivers` rows directly.

#### 4.7.3 Holder matching and basis

Holder match, evaluated in order (strongest evidence first, and the reported basis picks the strongest matching row):

1. `row.additional_insured_id = p_holder_id` (explicit directory link; matched_by `additional_insured_id`)
2. `public.normalize_entity_name(row.name) = public.normalize_entity_name(holder.name)` (matched_by `normalized_name`; normalize_entity_name handles '&' vs 'and' and punctuation, 20260629190000:28-42)
3. Blanket scope per 4.7.2 (kind `blanket`; no matched_by)

Representative per-line query (GL; auto/property/umbrella/wc are the same pattern with their table, scope predicate, and AI filter). Two tiers run the SAME query, differing only in the `endorsement_status` filter: tier 1 filters `= 'endorsed'` and, on a hit, resolves the box `'endorsed'`; tier 2 runs only when tier 1 is empty, filters `= 'requested'`, and, on a hit, resolves the box `'requested'`. No hit in either tier resolves `'none'`:

```sql
-- Tier 1: endorsement_status = 'endorsed' (wins). Tier 2: identical query with
-- endorsement_status = 'requested', run only when tier 1 returns no row.
select r.id, r.ai_type, r.endorsement_form,
       case
         when r.additional_insured_id = p_holder_id then 'additional_insured_id'
         when public.normalize_entity_name(r.name) = v_holder_norm then 'normalized_name'
         else null
       end as matched_by,
       (r.ai_type = 'owners_lessees_contractors'
        and regexp_replace(upper(coalesce(r.endorsement_form,'')), '[^A-Z0-9]', '', 'g')
            ~ '^(CG2033|CG2038)') as is_blanket
from public.policy_cgl_additional_insureds r
join public.policies p on p.id = r.policy_id
where p.id = any(p_policy_ids)
  and 'gl' = any(public.master_coi_lines(p))
  and r.endorsement_status = 'endorsed'   -- tier 2 substitutes 'requested' here
  and (
        r.additional_insured_id = p_holder_id
     or public.normalize_entity_name(r.name) = v_holder_norm
     or (r.ai_type = 'owners_lessees_contractors'
         and regexp_replace(upper(coalesce(r.endorsement_form,'')), '[^A-Z0-9]', '', 'g')
             ~ '^(CG2033|CG2038)')
      )
order by (matched_by = 'additional_insured_id') desc nulls last,
         (matched_by = 'normalized_name') desc nulls last
limit 1;
```

basis shape (one object per box, both under the returned `basis` jsonb; the row described is the one from the winning tier, i.e. the endorsed-tier row when the box resolved `'endorsed'`, else the requested-tier row when it resolved `'requested'`):

```jsonc
// Example: addl_insd_resolved = 'endorsed', subr_wvd_resolved = 'none'
{
  "addl_insd": {
    "kind": "holder_match",                       // blanket | holder_match | follow_underlying | follow_underlying_no_underlying | none
    "table": "policy_cgl_additional_insureds",
    "row_id": "uuid",
    "matched_by": "normalized_name",              // additional_insured_id | normalized_name | null
    "ai_type": "both",                            // null on tables without ai_type
    "endorsement_form": "CG 20 10 04 13"
  },
  "subr_wvd": { "kind": "none" }
}

// Example: addl_insd_resolved = 'requested' (blanket-scoped row exists with
// endorsement_status = 'requested'; nothing endorsed for this holder)
{
  "addl_insd": {
    "kind": "blanket",
    "table": "policy_cgl_additional_insureds",
    "row_id": "uuid",
    "matched_by": null,
    "ai_type": "owners_lessees_contractors",
    "endorsement_form": "CG 20 33 04 13"
  },
  "subr_wvd": { "kind": "none" }
}
```

The basis is displayed by the UI next to the toggle ("resolved via blanket CG 20 33 row" vs "matches this holder by name", with the amber requested treatment when the box resolved `'requested'`), and it is frozen into the issued snapshot by `generate-certificate` so every printed Y is explainable after the fact.

Sequencing note: this RPC reads `public.additional_insureds`, so its migration (`20260702095000_master_coi_holder_resolution.sql`, Section 9) lands in Phase 4, applied AFTER the directory's table-create migration from 03-additional-insureds-directory.md; its acceptance tests run in Phase 4 as well.

---

## 5. Carrier resolution (insurers A-F)

### 5.1 resolve_carrier function

Reuses the exact matching machinery of the backfill (20260628014122): exact `lower(btrim())` name match (:96-101), then `cleanup.carrier_alias_map` exact raw-text match (:103-109), then `normalize_entity_name` (20260629190000:28-42, handles '&' vs 'and' and punctuation) as a new third tier the backfill did not have.

```sql
create or replace function public.resolve_carrier(p_raw text)
returns table (carrier_id uuid, carrier_name text, naic text, match_type text)
language sql
stable
security definer
set search_path = public, cleanup
as $$
  with input as (select btrim(coalesce(p_raw, '')) as raw)
  select c.id, c.name, c.naic, m.match_type
  from (
    select c0.id, 'exact'::text as match_type, 1 as pri
      from public.carriers c0, input i
     where i.raw <> '' and lower(btrim(c0.name)) = lower(i.raw)
    union all
    select c1.id, 'alias', 2
      from cleanup.carrier_alias_map am
      join public.carriers c1 on lower(btrim(c1.name)) = lower(btrim(am.carrier_name)),
           input i
     where am.raw_text = i.raw
    union all
    select c2.id, 'normalized', 3
      from public.carriers c2, input i
     where i.raw <> ''
       and public.normalize_entity_name(c2.name) = public.normalize_entity_name(i.raw)
  ) m
  join public.carriers c on c.id = m.id
  order by m.pri
  limit 1;
$$;

revoke execute on function public.resolve_carrier(text) from anon, public;
grant  execute on function public.resolve_carrier(text) to authenticated;
```

SECURITY DEFINER is required because `cleanup.carrier_alias_map` has RLS enabled with no policies (20260628014122:40); the postgres-owned function bypasses it, authenticated clients cannot read it directly (which is fine).

### 5.2 Read-time insurer assembly in get_master_coi

Per selected line policy:

1. Resolution key: `policies.carrier_id` when non-null (join `carriers`); else `resolve_carrier(policies.carrier)`; else `unresolved` with key `normalize_entity_name(policies.carrier)`.
2. Insurer display NAME precedence (an ACORD 25 wants the writing company's legal name, not the brand chip):
   a. `<line>_details.identity.carrier_name` (extracted from the actual policy document; identity blocks exist on all five blobs, src/types/commercial-gl.ts:18-30 and siblings) -> src `extracted`
   b. `policies.carrier` free text (NOT NULL, always populated, types.ts:26516) -> src `manual` (unattributed staff entry)
   c. `carriers.name` via resolution -> src `reference`
3. Insurer NAIC precedence:
   a. `policies.carrier_naic` (the adopted manual home, Section 5.3) -> src `manual` (updated_at/updated_by populated when the ledger confirms the write, null otherwise)
   b. `<line>_details.identity.carrier_naic` -> src `extracted`
   c. `carriers.naic` via resolution (20250908032636:56, seeded :354-360) -> src `reference`
   d. else missing.
   The extracted NAIC outranks the reference NAIC by design: dec pages carry the writing company's NAIC (for example Progressive American Insurance Co) while `carriers` rows are brand-level (Progressive), and NAIC codes attach to legal writing companies. When (a) and (b) are both non-null and differ, the NAIC cell gets `flag = 'mismatch'` and readiness emits `naic_mismatch`.
   `mgas.naic` (20251027204345:6) is NEVER used for the insurer table: the MGA is the intermediary, not the insurer, and printing an MGA NAIC on an ACORD 25 insurer row would be wrong.
4. Letter assignment: Section 5.4.

### 5.3 Write-time fixes (recommended: yes to both)

AddPolicyModal writes `carrier_id` going forward: YES. In `AddPolicyModal.tsx`, after building `policyData` (:379-392), call `supabase.rpc('resolve_carrier', { p_raw: formData.carrier.trim() })`; when a row comes back, add `carrier_id` and, if `carrier_naic` is empty and the resolved `naic` is non-null, `carrier_naic` to the insert payload. Failure of the RPC is non-blocking (insert proceeds as today). Free-text `policies.carrier` is never modified, matching the backfill's invariant ('carrier text NEVER overwritten', 20260628014122:15). Datalist selections (:625-638 over useCarriers() from src/hooks/useLookupData.ts:4) will resolve via the exact tier nearly always. Apply the same change to `EditPolicyModal.tsx` when the carrier field changes (same call, same non-blocking posture).

`policies.carrier_naic` adopted: YES. It is the right typed home for a per-policy NAIC: already exists (20251221160001:12-13), currently write-orphaned, and per-policy is the correct granularity (the same brand can write through different legal companies on different policies). It becomes registry path `carrier_naic` (Section 3.2), writable via `save_master_coi_fields`, seedable at insert time by the AddPolicyModal change, and top of the NAIC precedence.

No bulk backfill of `carrier_naic` in this module; the read model's precedence chain makes backfill unnecessary for correctness, and the `naic_missing` warning surfaces the gaps organically.

### 5.4 Insurer letter assignment: the single authority

The letter assignment algorithm is implemented ONCE, in SQL, inside `get_master_coi`. There is no TypeScript letter assigner anywhere in the module: the client preview builder (05-acord25-pipeline.md) takes the letter map from `get_master_coi` output as INPUT, and `generate-certificate` (04-issuance-and-snapshots.md) re-reads `get_master_coi` at issue time so the printed letters come from this same implementation. The issuance request carries the client-displayed letters only as a cross-check; the server returns 422 on any mismatch.

Algorithm (deterministic, normative):

1. Iterate selected lines in the canonical order: `gl`, `auto`, `umbrella`, `wc`, `property`, `other`.
2. Within each line, iterate that line's selected policies ordered by `policy_number` asc (nulls last), then `id` asc (deterministic tiebreak).
3. For each policy, compute the carrier group key:
   - `carrier_id::text` when `policies.carrier_id` is non-null;
   - else `'name:' || normalize_entity_name(display_name)`, where display_name is the Section 5.2 name-precedence winner.
4. NAIC-conflict split: within one normalized-name group (name-keyed groups only), sub-group by the resolved NAIC (Section 5.2 precedence). If the name group contains two or more DISTINCT non-null NAICs, each distinct NAIC is its own letter group (same brand text, different writing companies), and rows with a null NAIC form their own additional sub-group (ambiguity is surfaced by the `naic_missing` warning rather than guessed). If the name group contains at most one distinct non-null NAIC, null-NAIC rows merge into it (presumed the same writing company).
5. Assign letters A..F in first-appearance order over this iteration. Distinct groups always get distinct letters.
6. Seventh-plus distinct groups go to `insurer_overflow` and trip the `insurer_overflow` blocker, whose message carries guidance ("ACORD 25 has six insurer rows; deselect a line or issue two certificates").

A BOP feeding gl and property contributes the same policy under both lines; grouping by carrier key means it still yields one letter (the grouping is over carriers, not policies).

---

## 6. Producer block

Source: `agency_workspaces` has `name, phone, email, address (single TEXT), website` (20251228000000_m0_agency_workspace_foundation.sql:33-56 in the CREATE TABLE, contact fields at :52-56) plus a `settings JSONB` (:40). The legacy generator prints a PRODUCER label with no data (src/lib/pdfGenerator.ts:85-107), confirming nothing richer exists.

Missing ACORD 25 producer fields: contact name, fax, structured address, license number. Decision: store them under a namespaced key in the existing `settings` JSONB rather than new columns; `settings` is the documented home for agency-level configuration (:40-47), the fields are single-tenant-few-write, and no query ever filters on them.

Contract shape (documented in `src/types/master-coi.ts`, written by a small admin settings form owned by 06-ui-surfaces.md):

```jsonc
// agency_workspaces.settings.coi_producer
{
  "producer_name": "Lewis & Lewis Insurance",   // fallback: agency_workspaces.name
  "contact_name": "Brian Lewis",
  "phone": "(813) 555-0100",                    // fallback: agency_workspaces.phone
  "fax": null,
  "email": "certs@lewisinsurance.com",          // fallback: agency_workspaces.email
  "address_line1": "100 Example Ave",           // fallback: agency_workspaces.address verbatim as line1
  "address_line2": null,
  "city": "Tampa", "state": "FL", "zip": "33601",
  "license_number": null
}
```

Workspace selection in `get_master_coi`: `accounts.agency_workspace_id` when set (nullable, types.ts:382); else the caller's `profiles.default_agency_workspace_id` (20251228000000:117-118); else the oldest `agency_workspaces` row (Lewis is operationally single-workspace). Each producer cell reports src `workspace` when found, `missing` otherwise; missing producer name or phone is the `producer_incomplete` readiness warning, not a blocker, because staff can still fix at generation time.

No dedicated write RPC: the admin form updates `agency_workspaces.settings` through the existing workspace-settings surface (RLS on agency_workspaces already restricts to workspace admins/owners).

---

## 7. Description of operations

Nothing COI-purposed exists (gt-policies-schema.md, DESCRIPTION OF OPERATIONS row). Decision: per-account default + per-cert override, with the default owned by this data layer and the override owned by the issued-cert snapshot (04-issuance-and-snapshots.md). The account default belongs in a new one-row-per-account table rather than a column on the crowded `accounts` table, because it travels with two more pieces of account-level COI state (the review stamp, Section 8.3, and default remarks) and keeps `accounts` untouched.

Migration `20260702091000_master_coi_profiles_and_provenance.sql` (also carries Sections 3.2 and 3.3):

```sql
create table if not exists public.account_coi_profiles (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  agency_workspace_id uuid not null references public.agency_workspaces(id),  -- derived server-side

  description_of_operations text,
  ops_source text check (ops_source in ('manual','canopy','bap_risk_context')),
  default_remarks text,             -- optional standing remarks block prefill

  last_reviewed_at timestamptz,     -- Section 8.3
  last_reviewed_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_coi_profiles_workspace
  on public.account_coi_profiles(agency_workspace_id);

-- Server-side workspace derivation, sec005 orphan fallback, client value ignored.
create or replace function public.set_account_coi_profile_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(
           a.agency_workspace_id,
           (select id from public.agency_workspaces order by created_at limit 1)
         )
    into new.agency_workspace_id
  from public.accounts a
  where a.id = new.account_id;
  if new.agency_workspace_id is null then
    raise exception 'cannot derive agency_workspace_id for account %', new.account_id;
  end if;
  return new;
end $$;

create trigger trg_account_coi_profile_workspace
  before insert on public.account_coi_profiles
  for each row execute function public.set_account_coi_profile_workspace();

alter table public.account_coi_profiles enable row level security;

-- Module posture (Section 4.4): workspace-scoped staff access, no exceptions.
create policy "coi_profiles_select" on public.account_coi_profiles
  for select using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );
create policy "coi_profiles_write" on public.account_coi_profiles
  for all using (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  ) with check (
    public.is_staff() and public.is_agency_member(agency_workspace_id)
  );

create trigger trigger_account_coi_profiles_updated
  before update on public.account_coi_profiles
  for each row execute function public.update_wc_subro_waivers_updated_at();  -- reuse the generic setter
```

Client CRUD is direct (no RPC needed; single-column upserts on a staff-gated table). The panel upserts `{account_id, description_of_operations, ops_source: 'manual'}` (never sends agency_workspace_id; the trigger derives it).

Account-merge compatibility: `account_coi_profiles` has PK = account_id and no `id` column, so the live merge engine `_do_account_merge` (20260629240000_relgraph_v2_merge_consolidation.sql:143-206) would abort on a unique collision when both survivor and loser carry a profile. Migration `20260702091500` (Section 9) adds `'account_coi_profiles'` to the engine's `v_safe_delete` allowlist (verified array at 20260629240000:35-40) with survivor-wins semantics: when only the loser has a profile the engine's FK reparent moves it to the survivor; when both have one, the loser's row is deleted and the survivor's profile stands.

Prefill candidates, assembled read-only inside `get_master_coi` (never auto-committed, staff picks one and saves it, which stamps `ops_source`):

1. `canopy`: `canopy_business_operations.description_of_operations` (20251227100000_canopy_2way_sync_schema.sql:344) joined via `canopy_business_operations.policy_id -> canopy_policies.pull_id -> canopy_pulls.account_id` (canopy_policies at 20251226100000_canopy_connect_schema.sql, pull_id FK; canopy_pulls.account_id at :17), newest first, first non-empty.
2. `bap_risk_context`: `bap_details.risk_context.business_description` (src/types/commercial-auto.ts:54) from any of the account's auto policies.

There is deliberately NO tier reading `certificates_of_insurance`: that legacy table has 0 rows in prod and is dropped by the disposition plan (01-disposition-and-roadmap.md), so `get_master_coi` never references it, in SQL or in the `ops_source` vocabulary.

Per-cert override: the generator (06-ui-surfaces.md) collects Description of operations and Remarks as TWO labeled fields, seeded from `description_of_operations` and `default_remarks` respectively, and `generate-certificate` stores whatever the user finalizes inside the issued snapshot. Nothing writes back to the account default unless the user explicitly saves it there.

---

## 8. Master COI panel data contract

### 8.1 Types

Create `src/types/master-coi.ts`: `MasterCOI`, `COICell<T>`, `COIInsurer`, `COILineKey` (the canonical enum, Section 2.3), `COILineGL | COILineAuto | COILineUmbrella | COILineWC | COILineProperty`, `COIAdditionalInsuredRow`, `COIWCSubroWaiverRow`, `COIReadiness` (with the Section 2.7 blocker/warning code unions), `COIProducerSettings`, `AccountCOIProfile`, `HolderEndorsementResolution` (the Section 4.7 row shape), mirroring Sections 2.6 and 4.7 one to one. These types are the module contract: 06-ui-surfaces.md consumes them directly (its MasterCOIView is at most a thin adapter over `MasterCOI`, never a parallel vocabulary), and 04-issuance-and-snapshots.md freezes `MasterCOI` output into the issued snapshot. Issued-certificate types live separately in `src/types/certificates.ts`, owned by 04-issuance-and-snapshots.md.

### 8.2 Hooks (create src/hooks/useMasterCOI.ts)

```ts
export function useMasterCOI(accountId: string | undefined, policyIds?: string[])
// useQuery({ queryKey: ['master-coi', accountId, policyIds ?? null],
//   queryFn: () => supabase.rpc('get_master_coi', { p_account_id: accountId, p_policy_ids: policyIds ?? null }) })

export function useSaveMasterCOIFields()
// useMutation((args: { policyId: string; updates: Record<string, unknown> }) =>
//   supabase.rpc('save_master_coi_fields', { p_policy_id, p_updates }))
// onSuccess: invalidate ['master-coi', accountId] and ['policies'] (CustomerPoliciesSection filters
// usePolicies client side, CustomerPoliciesSection.tsx:43,57; limits are not shown there but blob
// changes must not leave stale caches)

export function useSetEndorsementStatus()
// useMutation((args: { line: 'gl'|'umbrella'|'auto'|'property'|'wc'; rowId: string;
//   status: 'none'|'requested'|'endorsed'; endorsementForm?: string; effectiveDate?: string }) =>
//   supabase.rpc('set_line_ai_endorsement', {...}))
// onSuccess: invalidate ['master-coi', accountId]

export function useHolderEndorsementStatus(
  accountId: string | undefined,
  holderId: string | undefined,
  policyIds: string[]
)
// useQuery({ queryKey: ['holder-endorsements', accountId, holderId, policyIds],
//   enabled: !!accountId && !!holderId && policyIds.length > 0,
//   queryFn: () => supabase.rpc('resolve_holder_endorsements',
//     { p_account_id: accountId, p_holder_id: holderId, p_policy_ids: policyIds }) })
// The generator's ADDL INSD / SUBR WVD toggle gate (06-ui-surfaces.md). Same RPC the
// server calls at issue time, so gate and print can never disagree.

export function useAccountCOIProfile(accountId: string | undefined)
export function useSaveAccountCOIProfile()   // upsert on account_coi_profiles
export function useMarkMasterCOIReviewed()   // supabase.rpc('mark_master_coi_reviewed', { p_account_id })
```

Panel component contract (implementation owned by 06-ui-surfaces.md, restated here so the data contract is unambiguous, per gt-record-and-docs.md plan input (a)): `MasterCOISection({ accountId, accountName }: { accountId: string; accountName?: string })`, rendered as `<section id="master-coi" className="scroll-mt-20 space-y-4">` between the policies section (closes CustomerDetail.tsx:473) and documents (opens :476), with `'master-coi'` added to SECTION_IDS (CustomerDetail.tsx:105). It consumes exactly the hooks above; it performs no direct table reads for coverage data. The panel also hosts the compact variant (limit 5) of `CertificateIssuanceLog`, a component owned by 04-issuance-and-snapshots.md and consumed as-is.

### 8.3 Provenance display and the double-check affordance

Provenance display: each cell renders its `src` as a small labeled chip (text label, never color alone, per design-system/anti-patterns.md): `extracted` (with confidence on hover), `manual` (with who/when when the ledger has them, plain otherwise), `reference`, and `missing` renders as an explicit empty state that is also the edit affordance. Cells with `flag = 'overwritten_manual'` show a warning chip with a restore action that calls `useSaveMasterCOIFields` with the ledger's `val`. Cells with `flag = 'mismatch'` show both conflicting values.

Double-check affordance decision: an account-level reviewed stamp plus a computed gap list, NOT per-field verified booleans. Rationale: per-field verification is ceremony that goes stale the moment an extractor or renewal touches the policy, creating false confidence, and it doubles the write surface. The stamp plus staleness detection gives the same assurance honestly:

- `mark_master_coi_reviewed(p_account_id uuid) returns jsonb`: SECURITY DEFINER, `is_staff()` gated, upserts `account_coi_profiles.last_reviewed_at = now(), last_reviewed_by = auth.uid()`. Grant/revoke like the other RPCs.
- `get_master_coi` computes `review.stale`: true when `max(policies.updated_at, AI tables updated_at, policy_wc_subrogation_waivers.updated_at, account_coi_profiles.updated_at)` across contributing rows exceeds `last_reviewed_at` (or when never reviewed).
- The `readiness` block is the machine double-check: `ready = (blockers is empty)`. `generate-certificate` enforces it server-side (422 on any blocker, Section 2.7) and the UI refuses Generate while `ready` is false; a fresh-or-acknowledged review (`stale = false`, or an explicit confirm) is required before issuing. The preview-to-issue integrity binding (the client's preview hash checked by the server, 409 on drift) is specified in 04-issuance-and-snapshots.md and closes the remaining gap between what the user verified and what gets issued.

---

## 9. Migrations and sequencing

Five migrations, applied in order, all idempotent (`if not exists` / `on conflict do nothing` / DO-block guards around every ADD CONSTRAINT):

| # | File | Contents | Depends on |
|---|---|---|---|
| 1 | `supabase/migrations/20260702090000_master_coi_endorsement_status.sql` | Section 4.2 column adds (incl. `blanket` on bap/property and `additional_insured_id` on all four) + backfills + DO-block-guarded scope CHECKs + indexes; Section 4.3 `policy_wc_subrogation_waivers` (with `agency_workspace_id` + `additional_insured_id`) + triggers; Section 4.4 workspace RLS | nothing new |
| 2 | `supabase/migrations/20260702091000_master_coi_profiles_and_provenance.sql` | `account_coi_profiles` with workspace derivation + RLS (Section 7); `policies.coi_field_provenance` (Section 3.3); `coi_field_registry` + full seed (Section 3.2) | nothing new |
| 3 | `supabase/migrations/20260702091500_master_coi_merge_allowlist.sql` | CREATE OR REPLACE `public._do_account_merge`, body copied verbatim from 20260629240000_relgraph_v2_merge_consolidation.sql, changing ONLY the `v_safe_delete` array (verified at :35-40) to append `'account_coi_profiles'` (survivor-wins). Re-assert the lockdown grants exactly as at 20260629240000:264-265 (REVOKE from public/anon/authenticated, GRANT EXECUTE to postgres and service_role). Ships in Phase 3, in the same phase as the `account_coi_profiles` table it protects (migration 2), so no risk window exists between the table landing and the merge engine knowing about it | 2 |
| 4 | `supabase/migrations/20260702092000_master_coi_rpcs.sql` | `master_coi_lines`, `resolve_carrier`, `get_master_coi`, `save_master_coi_fields`, `set_line_ai_endorsement`, `mark_master_coi_reviewed`; all REVOKE from anon/public + GRANT to authenticated (pattern: 20260629250000:59-60), and `get_master_coi` additionally GRANTed to service_role | 1 and 2 |
| 5 | `supabase/migrations/20260702095000_master_coi_holder_resolution.sql` | `resolve_holder_endorsements` (Section 4.7), REVOKE from anon/public, GRANT to authenticated and service_role. Sequenced in Phase 4, after 03's `additional_insureds` table-create migration, because the RPC reads `public.additional_insureds`; its acceptance tests run in Phase 4 as well. MUST be applied after that table-create migration; renumber the timestamp if the directory migration lands later than this prefix | 1, 4, and the 03 table-create migration |

External sequencing contracts:

- The Additional Insureds directory (03-additional-insureds-directory.md) creates `additional_insureds` and then ships ONE wire-up migration, sequenced after migration 1 above, adding the FK constraints on `additional_insured_id` for ALL FIVE tables (Section 4.6). Constraint-add only; this doc owns the columns, the directory owns the constraints.
- The issuance area (04-issuance-and-snapshots.md) consumes `get_master_coi` (readiness gate, letter authority, snapshot source) and `resolve_holder_endorsements` (print semantics); it must not read the `<line>_details` blobs directly. Its `certificates` table (with `holder_id`), `finalize_certificate_issue`, the `coi-certificates` bucket, and `CertificateIssuanceLog` are owned there.
- The pipeline (05-acord25-pipeline.md) consumes the letter map and line cells from `get_master_coi` as builder input; it performs the closed-vocabulary to `Y`/`N` literal conversion and owns the field map.
- After migrations apply, regenerate types: `supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts` (CLAUDE.md workflow), acknowledging the known pre-existing typecheck drift (CLAUDE.md change log 2026-06-29).

Rollback sketches: migration 1 columns are additive with defaults (drop columns + drop table to reverse); migration 2 is fully additive (drop table/column); migration 3 reverses by re-applying the prior `_do_account_merge` body; migrations 4 and 5 are `drop function` per function.

## 10. Files to create or modify (complete list)

Create:

- `supabase/migrations/20260702090000_master_coi_endorsement_status.sql`
- `supabase/migrations/20260702091000_master_coi_profiles_and_provenance.sql`
- `supabase/migrations/20260702091500_master_coi_merge_allowlist.sql`
- `supabase/migrations/20260702092000_master_coi_rpcs.sql`
- `supabase/migrations/20260702095000_master_coi_holder_resolution.sql`
- `src/types/master-coi.ts`
- `src/hooks/useMasterCOI.ts` (includes `useHolderEndorsementStatus`)

Modify:

- `src/components/customers/AddPolicyModal.tsx`: resolve carrier at insert (Section 5.3); touch points are the insert payload builder (:379-392) only. No zod schema change (carrier stays required free text, :22-32).
- `src/components/customers/EditPolicyModal.tsx`: same resolve-on-save when carrier text changes (optional but recommended, same posture).

Explicitly NOT modified by this area: `CustomerPoliciesSection.tsx` (stays untouched per gt-record-and-docs plan input (a)), `usePolicies.ts` (book-wide fetch not extended), the five extract-* edge functions, `PolicyManualDetailsModal.tsx` (its WC writes remain valid and are absorbed as unattributed `manual` provenance), System B files (retirement is owned by 01-disposition-and-roadmap.md).

## 11. Risks and edge cases

1. Extractor re-runs overwrite manual JSONB values (whole-blob updates, extract-cgl-policy/index.ts:437-445). Mitigated, not prevented: the provenance ledger detects the overwrite (`flag = 'overwritten_manual'`, warning + restore affordance). A write-time merge guard inside the extractors is deliberately out of scope to avoid touching five edge functions in this module.
2. Existence-only RLS remains on the four existing AI/interest tables (20251221190001:343-473 and siblings): any authenticated user can still write name/address rows directly. Status transitions are RPC-gated, which protects the legal assertion, but a follow-up hardening migration (workspace-scoped predicates on those tables, matching Section 4.4) is recommended debt. Flagged, not fixed here, to keep blast radius contained.
3. Brand-level `carriers` rows vs writing-company names: the normalized tier of `resolve_carrier` can map 'Progressive American Insurance Co' to nothing (normalization keeps suffix words, 20260629190000 comment) so some real carriers stay `unresolved` until the alias map grows. The panel surfaces these as blockers; the alias map is the designed growth point (INSERT rows, no code).
4. `p_policy_ids` trust: callers can pass policies from another account; `get_master_coi` and `resolve_holder_endorsements` both verify every id belongs to `p_account_id` and raise otherwise (implemented, Sections 2.2 and 4.7.1).
5. Backfill judgment calls, flagged for Brian's review before applying migration 1: (a) `AUTO_APPLIED -> endorsed` treats document-extracted AI schedules as endorsement evidence; if a stricter posture is wanted (only `endorsement_form is not null` earns `endorsed`), it is a one-line change. (b) Umbrella `follow_underlying` rows stay `requested` and need one-click human confirmation through `set_line_ai_endorsement`; expect a short review queue after backfill. (c) The GL blanket mapping (`owners_lessees_contractors` + CG 20 33 / CG 20 38 form guard, Section 4.7.2) under-claims by design when the form number is missing; extending the blanket form set later is a one-line regex change in `resolve_holder_endorsements`.
6. Multiple active policies on one line (mid-term rewrite overlaps): auto-selection picks latest expiration; the `candidates` array plus `p_policy_ids` override is the escape hatch. No dedup is assumed anywhere, matching DuplicatePolicyDialog's reactive-only reality (AddPolicyModal.tsx:400-409).
7. `jsonb_set` parent creation: plain jsonb_set does not create missing intermediate objects; the RPC must include the walk-and-coalesce helper (Section 3.4 step 2c) or writes to empty blobs silently no-op. Called out so the implementer does not discover it in QA.
8. BOP policies feed two lines from one policy row; insurer letter grouping and readiness must handle the same policy_id appearing under gl and property (Section 5.4's grouping by carrier key already does).
9. Account-merge policy dedup vs issued certificates: `certificate_policies` (owned by 04-issuance-and-snapshots.md) references `policies` with ON DELETE RESTRICT, and the account-merge policy-dedup step must skip policies referenced by it. That handling is documented in 04-issuance-and-snapshots.md and 01-disposition-and-roadmap.md; noted here because migration 3 touches the same merge engine.
10. Holder name drift: `resolve_holder_endorsements` matches by `additional_insured_id` first and normalized name second; if a directory holder is renamed after AI rows were recorded by name only, previously resolving pairs may stop resolving. The directory's link workflow (03-additional-insureds-directory.md) mitigates by backfilling `additional_insured_id` on match confirmation, making the explicit link the durable path.
