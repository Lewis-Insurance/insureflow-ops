# Renewals Module Overhaul — Implementation Gameplan

**Scope:** Main renewals system only. The Auto-Owners "AO Renewals" subsystem (`ao_renewals`, `useAORenewals.ts`, `AORenewalsPage.tsx`, `AORenewalEdit.tsx`, `components/ao-renewals/*`, `AORenewalDocuments.tsx`) is **100% out of scope and untouched.**

**Stack:** React + Vite + TypeScript + Supabase + shadcn/ui. Design law: `UI Overhall/zpk/design-system/` ("Calm Command" constitution).

---

## 1. Review of your gameplan

Your instincts are right. Here's the point-by-point, with one important correction.

**"The detail page shows way too much; simplify to essentials + one hero Update Renewal widget."**
Endorsed and located. Today `RenewalEditPage.tsx` (~734 lines) renders a header, a 3-card info row (Status / Premium / Risk), a 3-card detail row (Policy Details / Dates / Contact Activity), up to 6 conditional outcome cards, and a 5-tab workspace (Overview / Contacts / Quotes / Documents / Notes). Everything you named to cut — quick actions, contact activity, activity timeline, risk factors, risk score, engagement / satisfaction / sentiment scores — lives in the info cards and `RenewalOverview.tsx`. All confirmed cuttable. Final layout per your direction: **three regions only** (Top Bar, Hero Update Renewal widget, Policy Info panel).

**"Updating the renewal should update the policy on the customer's page; add dec-page/application upload to the hero."**
This needs a correction to the premise. The current "Complete Renewal" flow (`useCompleteRenewal`) **already writes** policy number, premium, effective date, expiration date, and status to the `policies` row, and the customer page refetches — so those fields *do* sync today. The real gaps are narrower and specific:

- **Policy term is collected then dropped** — the modal lets you pick 6/12-month and uses it to compute the expiration, but never saves it to `policies.policy_term`, so the stored term goes stale.
- **Terminal / "moved" outcomes don't write through** — marking a renewal *moved* records the new carrier/premium/term only on the renewal row; the policy keeps its old data and is just flagged cancelled.
- **Renewal documents are invisible to the policy/customer view** — dec pages/applications uploaded in the renewal flow go to a separate `renewal_documents` table; the customer and policy pages read a different `documents` table. They never see each other.
- **Only the "set status → Renewed" path writes through** — status/priority changes and any in-progress edits never reach the policy.

The plan turns the hero into a single **Save that writes through on every edit** (in-progress, renewed, and terminal/moved) and makes uploaded docs visible on the policy/customer view.

**"Simplify the all-renewals list page."**
Endorsed. Collapse the three view modes (Policies / Workflow / Pipeline), the stats wall, and the five filters into one dense, uniform list with a banded renewal countdown and status pills.

**"Bug: effective dates default to the day after."**
Confirmed and root-caused. `RenewalCompletionModal.tsx` lines 83-88 deliberately add `+1` day (`addDaysLocalDate(extractLocalDate(currentExpirationDate), 1)`). It's a compute bug, not a timezone issue — the date utility (`src/lib/date/localDate.ts`) is correct (noon-anchored). One-line fix; details in Phase 4.

---

## 2. Current state (verified against code + live DB)

**Data model.**
- `renewals` table: `policy_id` FK, `policy_number`, `current_premium`, `renewal_premium`, `renewal_date`, `expiration_date`, `status`, `priority`, `moved_*` / reason fields, risk fields. **No `effective_date` column. No `policy_term` column.** `moved_term` CHECK = `('6_month','annual',NULL)`.
- `policies` table: `policy_number`, `premium`, `effective_date`, `expiration_date`, `status`, `carrier_id`, `billing_frequency`, and **`policy_term` TEXT CHECK IN ('semiannual','annual')**. So **6-month → `'semiannual'`, 12-month → `'annual'`.**
- Sync trigger `auto_sync_policy_to_renewal`: one-way **policy → renewal** only, and only for an open renewal (`status IN ('upcoming','in_progress') AND renewal_date = NEW.expiration_date`) within ~90 days of expiration. It does **not** mirror `policy_term`, and it stops touching a renewal once it's `renewed` or once expiration is pushed out (this is the `current_premium` drift mechanism). There is **no reverse trigger.**

**Edit paths today (`useRenewalWorkflow.ts`).**
- `useUpdateRenewalStatus` / `useUpdateRenewal` → write the renewal row only (status, priority). Never `policies`.
- `useCompleteRenewal` → writes `policies {policy_number, premium, effective_date, expiration_date, status:'active'}` + `renewals {status:'renewed', renewal_premium}`. **Drops `policy_term`.** Opens only when status is set to `renewed`.
- `useTerminateRenewal` → writes renewal outcome fields + `policies.status` **only**.

**Field-by-field relay (what reaches the policy / customer page today):**

| Field | Edited where | → renewals | → policies | On customer page |
|---|---|---|---|---|
| status | Status dropdown | Yes | only via complete (`active`) / terminate (status) | policy status only |
| priority | Priority dropdown | Yes | No | No |
| premium | Completion modal | Yes | Completion: **Yes**. Terminal/moved: **No** | via completion only |
| policy_number | Completion modal | Yes (mirrored back) | Completion: **Yes**. Terminal: **No** | via completion only |
| effective_date | Completion modal | n/a (no column) | Completion: **Yes**. Terminal: **No** | via completion only |
| expiration_date | Completion modal | Yes (mirrored) | Completion: **Yes**. Terminal: **No** | via completion only |
| **policy_term** | Completion modal | No | **No (dropped)** | No |
| **documents (dec/app)** | Documents tab | `renewal_documents` | No | **No (separate table)** |
| notes | Notes tab | `renewal_notes` | No | No |

**Verified gaps:**

- **HIGH-1** — terminal/"moved" outcomes don't propagate premium/dates/carrier/number to the policy (status only).
- **HIGH-2** — renewal documents invisible on the policy/customer page (disjoint tables).
- **MED-1** — `policy_term` collected at completion but discarded → `policies.policy_term` goes stale.
- **MED-2** — `renewals.current_premium` drifts after completion (trigger stops mirroring once expiration is pushed out).
- **MED-3** — customer-page policy edits (`EditPolicyModal` / status toggle) don't flow back to the renewal.
- **LOW-1** — `renewal_notes` and customer `notes` are separate tables.

---

## 3. Target: the 3-region detail screen

```
┌─────────────────────────────────────────────────────────────────────┐
│  REGION 1 — TOP BAR                                                   │
│  ‹ Back   Renewals / Policy #...    [carrier chip][line][term chip]   │
│  POLICY #12345  (H1)        ⏱ Renews in 4 days  •  [Status pill]      │
│                                   View account ·  View policy ·  ⋯    │
├──────────────────────────────────────┬──────────────────────────────┤
│  REGION 2 — HERO: UPDATE RENEWAL      │  REGION 3 — POLICY INFO       │
│  (always-on inline editor)            │  (read-only)                  │
│   Status         [ Quoted ▾ ]         │   Account / named insured →   │
│   Policy number  [____________]       │   Carrier (name chip)         │
│   Premium        [$ _________]        │   Line of business            │
│   Policy term    [ 6 / 12 months ▾]   │   Billing frequency           │
│   Effective date [ 06/03/2026 ]       │   Last saved: premium, dates, │
│   Expiration     [ 06/03/2027 ] auto  │   term (to compare against    │
│   ⬆ Upload dec page / application     │   what you're editing)        │
│   [ existing docs list ]              │                               │
│            [ Save renewal ] (lime)    │                               │
└──────────────────────────────────────┴──────────────────────────────┘
```

One lime primary on the surface (hero **Save**). Countdown is a banded, labeled state (constitution requirement), never a plain date. Carriers are name chips, never colored. Numbers use tabular figures.

---

## 4. Phased implementation plan

### Files-touched map

**Create**
- `src/components/renewals/UpdateRenewalWidget.tsx` — the always-on hero editor (replaces `RenewalCompletionModal`).
- `src/components/renewals/RenewalTopBar.tsx` — Region 1.
- `src/components/renewals/RenewalPolicyInfoPanel.tsx` — Region 3.
- `src/components/renewals/RenewalCountdownBadge.tsx` — shared banded/labeled countdown (used by detail + list).
- `src/lib/renewals/renewalTerm.ts` — pure helpers: `deriveExpiration(effective, term)`, term value/label mapping, Zod schema.
- `supabase/migrations/<ts>_renewals_writethrough.sql` — see Phase 6.

**Modify**
- `src/pages/RenewalEditPage.tsx` — rebuild into 3 regions; delete the info-card wall, outcome cards, and tabs.
- `src/hooks/useRenewalWorkflow.ts` — unify save (write `policy_term`, fix drift), propagate terminal/moved to policy, dual-write document uploads, soft-delete renewal docs.
- `src/pages/RenewalsPage.tsx` — simplify to a single Index-archetype list.
- `src/components/renewals/RenewalCompletionModal.tsx` — apply the effective-date fix first, then retire once the widget lands.

**Delete (detail screen only; grep importers first — must not touch AO)**
- `src/components/renewals/RenewalOverview.tsx`; on the list: `RenewalsStats.tsx`, `RenewalPipeline.tsx` usage, the Policies/Pipeline view modes, and `BulkActionsBar` (unless multi-select is wanted).

> Confirm exact route paths during implementation (e.g., the renewal detail is `/renewals/:id/edit`; customer detail is `/customer/:id`). Use the app router as source of truth.

### Phase 1 — Detail page rebuilt into 3 regions

Replace `RenewalEditPage.tsx`. Keep `useRenewal(id)`, rebuild loading skeleton + not-found empty state to design-system language, keep `AppLayout`.

- **Region 1 — Top Bar (`RenewalTopBar.tsx`):** back arrow (ghost icon, → `/renewals`); breadcrumb that never truncates the record name; H1 = policy identity (bold uppercase); a metadata row of **name chips** (carrier, line of business, term); the **renewal countdown badge** (banded) + **status pill**. Right side carries only secondary/ghost nav (View account, View policy, overflow) — **no lime here** (the lime belongs to the hero Save). Remove the dead "Recalculate Risk Score" item.
- **Region 1b — `RenewalCountdownBadge.tsx`:** pure component using `differenceFromTodayInLocalDays` from `localDate.ts`. Bands: 30+ days neutral; ≤10 business days gold + clock icon; ≤5 business days danger + alert icon + the word "Renewal"; past due → danger + "Overdue". Replaces the legacy off-palette `getExpirationBadge` day-count colors.
- **Region 2 — Hero (`UpdateRenewalWidget.tsx`):** Phase 2.
- **Region 3 — Policy Info panel (`RenewalPolicyInfoPanel.tsx`):** one read-only card of nested tiles with durable policy facts (account/named insured link, carrier name chip, line of business, billing frequency) plus the **last-saved** premium/dates/term so the user can compare against what they're editing. No actions (keeps single-lime clean). PII masked.

**Deleted vs. relocated.** Delete the Status/Premium/Risk card row, the Risk card, the Contact Activity card, all 6 conditional outcome cards, the entire Tabs block, and `RenewalOverview.tsx`. Relocate identity fields into the Top Bar + Policy panel; relocate editable fields into the hero.

**Priority dropdown:** the 3-region spec doesn't list it. Recommendation: drop it from the detail screen (if wanted, it belongs on the list as a triage filter). *Open decision.*

**Quotes / Notes / Documents tabs:**
- **Documents → fold in.** Upload (dec page + application) lives in the hero; a compact read-back list of existing renewal docs renders beneath it. The standalone tab is removed; logic is absorbed and upgraded (Phase 3).
- **Notes → cut from the screen.** Completion/termination already auto-append a renewal note for the audit trail; the table/hooks remain, just not surfaced.
- **Quotes → cut from the screen.** Quote comparison is its own workspace, not part of the per-renewal update job. Data/hooks untouched. *Open decision: keep a single "View quotes" link in the overflow?*

### Phase 2 — Hero "Update Renewal" widget (always-on inline form)

`UpdateRenewalWidget.tsx` — card on `--cc-surface`, header label "UPDATE RENEWAL". Inputs use the label-above spec. Replaces `RenewalCompletionModal` entirely (no modal, always visible).

Fields:
1. **Status** — lime-free select per the status-control rule; current value renders as its status pill in the trigger. Choosing a terminal status (`cancelled`/`lapsed`/`non_renewed`/`lost`/`moved`) reveals an **inline** reason/termination sub-section (plus carrier/premium/term for `moved`) instead of opening a modal.
2. **Policy number** — text, seeded from `renewal.policy_number`.
3. **Premium** — numeric with `$` affix; show prior premium + % delta as muted helper text.
4. **Policy term** — select labeled "6 months" / "12 months" with values `'semiannual'` / `'annual'`. **Seed from the linked `policies.policy_term`** (the real source; renewals has no term column), default `'annual'`.
5. **Effective date** — date input; **default = the prior expiration date exactly** (bug fix folded in).
6. **Expiration date (auto-derived)** — via `deriveExpiration(effective, term)` using noon-anchored utilities (`annual` = +1 year, `semiannual` = +6 months). Shown prominently; editable for off-cycle corrections; auto-fills on every effective/term change.
7. **Document upload** — dashed drop zone (design-system file-upload spec) reusing `useUploadRenewalDocument` (now dual-writing — Phase 3), with a type select limited to `dec_page` / `application` and the existing filename auto-detect.

**Validation (Zod, in `renewalTerm.ts`):** policy_number non-empty; premium > 0; policy_term enum; effective/expiration valid; expiration > effective; terminal sub-fields conditionally required. Inline errors per the input-error pattern (`aria-invalid`, `aria-describedby`, message states the fix).

**Save (single lime primary):** one "Save renewal" button (44px hero height, lime). Disabled until dirty + valid. Calls the unified `useSaveRenewal` (Phase 3). Optimistic update of `['renewal', id]` with rollback; on settle invalidate `['renewal', id]`, `['renewals']`, `['policy', policyId]`, `['policies']`, `['documents']`. Success toast top-right.

### Phase 3 — Write-through / data relay

`src/hooks/useRenewalWorkflow.ts`.

**3a. Unified save (`useCompleteRenewal` → `useSaveRenewal`).** Write `policy_term` to `policies` alongside number/premium/dates (fixes MED-1). Accept the chosen status; relay number/premium/dates/term on any save, but set `policies.status='active'` only on the `renewed` path (*open decision #2*). Write `renewals.current_premium`, `expiration_date`/`renewal_date` directly in the same operation so the row stays consistent without depending on the narrow one-way trigger (fixes MED-2). Keep best-effort `run-retention-scoring` + auto-note. Add `['documents']` to invalidations.

**3b. Terminal/moved propagation (`useTerminateRenewal`) — HIGH-1.** For `moved`: also write the policy's `premium`, `policy_term`, and (if name→`carrier_id` resolves) `carrier_id` from the moved data; map `moved_term` (`'6_month'|'annual'`) → `policies.policy_term` (`'semiannual'|'annual'`). For `cancelled`/`lapsed`/`non_renewed`/`lost`: set mapped `policies.status` and optionally `expiration_date = terminationDate`. Keep `['documents']`/`['policy']`/`['policies']` invalidations.

**3c. Document dual-write — HIGH-2 (recommended).** After the existing `renewal_documents` insert, also insert a `documents` row pointing at the **same** storage object (bucket `documents`, same path), with `account_id`, `policy_id`, `filename`, `name`, `storage_path`, `storage_bucket`, `file_path`, `mime_type`, `file_size` **and** `size_bytes` (both columns exist), `document_type` (`dec_page`/`application`), `kind='customer_document'`, `uploaded_by`, `file_missing=false`. Best-effort try/catch + log so a `documents` failure doesn't strand the renewal upload. Result: the dec page/application appears on the customer/policy view immediately after `['documents']` invalidation.

**3d. Soft-delete compliance.** Renewal doc delete currently hard-deletes and removes the storage object (violates the soft-delete invariant). Switch to `perform_soft_delete` (sets `deleted_at`), retain the storage object, and soft-delete the matching `documents` row. Requires adding `deleted_at` to `renewal_documents` (Phase 6).

**Architectural choices — recommendations:**
- **(a) Term value domain:** normalize the widget to the existing `'semiannual'|'annual'` CHECK. **No migration, no risk.** (Rejected: widening the CHECK to `'6_month'|'12_month'` adds dual vocabulary and divergence risk.)
- **(b) Term storage:** seed from and persist to `policies.policy_term` (single source of truth). Do **not** add a `renewals.policy_term` column.
- **(c) Doc visibility:** dual-write to `documents` with `policy_id` on upload (immediate visibility, single file, minimal surface). Future consolidation (back the renewal docs UI directly with `documents`, retiring `renewal_documents`) noted as a follow-up.

### Phase 4 — Effective-date off-by-one fix

`RenewalCompletionModal.tsx` lines 83-88 — replace the `+1` default:

```ts
// before: const nextDay = addDaysLocalDate(extractLocalDate(currentExpirationDate), 1);
//         newEffectiveDate = formatDateForDisplay(nextDay);
// after:
newEffectiveDate = formatDateForDisplay(extractLocalDate(currentExpirationDate));
```

The expiration derivation below it (+1 year / +6 months) is correct and stays. The new hero widget inherits the corrected default (seeds effective = prior expiration, no `+1`). Apply to the modal first so the bug is gone immediately; retire the modal once the widget replaces it. Verified: this is the only renewal-effective-date occurrence (`TerminalStatusModal` seeds termination from expiration with no `+1`; `RenewalsList` is display-only).

### Phase 5 — List page simplification (`/renewals`)

Map `RenewalsPage.tsx` to the design-system **Index/List** archetype.

- **Cut:** the three view modes + Tabs switcher, the 4-tile stats wall (off-palette colors), the Upcoming/Expired sub-tabs, the Kanban pipeline, the five filter dropdowns, the custom `RenewalCard` with raw day-count colors + Risk column, `BulkActionsBar`, the on-mount auto-sync side effect.
- **Header:** title + one lime primary — recommend a meaningful **"Sync from policies"** (wrap `useSyncPoliciesToRenewals`, on demand, not silent on mount).
- **Triage strip:** ≤4 tiles that *route into filtered work* (e.g. "≤5 business days", "≤10 business days", "In progress", "Overdue/lapsing") — not vanity counters.
- **Filter row:** a search box (customer or policy number) + a single status segmented control.
- **The list:** one dense uniform table, 44-52px rows, identical columns in the same order — Customer (primary) · Policy # (mono) · Carrier (name chip) · Line · Premium (tabular) · **Renewal countdown** (banded badge) · Status pill. Row click → detail. No Risk column.
- **Empty/loading:** design-system empty-state (one sentence + the primary action) and shaped skeletons.

### Phase 6 — Migrations

Apply via Supabase MCP `apply_migration` and add the file under `supabase/migrations/`. Idempotent.

1. **Term domain — no change.** Adopt the existing `'semiannual'|'annual'` CHECK (deliberate; documented).
2. **Add soft-delete to `renewal_documents`** (required for 3d): `ALTER TABLE public.renewal_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;` + a partial index `WHERE deleted_at IS NULL`; update `useRenewalDocuments` to filter `is('deleted_at', null)`.
3. **No reverse trigger.** Relay stays explicit in the hook (deterministic, avoids recursion with the existing policy→renewal trigger). No `renewals.policy_term` column. No `documents.renewal_id` (relay via `policy_id`/`account_id`) unless back-reference is later wanted.

Regenerate `src/integrations/supabase/types.ts` after the migration. No edge-function changes required (`run-retention-scoring` stays best-effort).

### Phase 7 — Sequencing, risk, testing

**Sequencing (each step shippable):** (1) Phase 4 one-line fix → (2) Phase 6 migration → (3) Phase 3 hooks → (4) `RenewalCountdownBadge` → (5) hero widget → (6) detail rebuild → (7) list simplification → (8) delete orphaned components after confirming no importers.

**Risks:**
- *Trigger interplay (highest):* update the renewal status out of the trigger's WHERE first (or update policy then renewal deterministically); test a same-day re-save for no duplicate/resurrected renewal.
- *Dual-write divergence:* best-effort + log; set both `file_size` and `size_bytes`.
- *Premature `policies.status='active'`* on in-progress saves — default: only on `renewed`.
- *Component deletion:* grep importers first; AO uses a separate `AORenewalDocuments.tsx`, so renewal-doc changes won't hit AO.

**Verification:** `npm run typecheck` + `npm run build` after Phase 3 and Phase 6; Vitest for `renewalTerm.ts` (`deriveExpiration` annual/semiannual + month-end + leap-year edges; term mapping; Zod rules; regression test that the effective default equals the prior expiration). Manual acceptance flow: open a renewal → confirm 3 regions only → edit premium/number/term/effective → expiration auto-derives, no off-by-one → Save → confirm customer + policy pages reflect it → upload dec page → visible on customer/policy → set status Moved with new premium/term → policy reflects it → re-save (idempotent, no drift) → soft-delete a doc (storage retained, `deleted_at` set) → list shows single dense list with banded countdown.

**Invariants preserved:** RLS scoping; soft deletes only; AI outputs non-authoritative (`run-retention-scoring` best-effort, never gates the save); no service-role in frontend; single lime per surface; no em/en dashes in new copy.

---

## 5. Open decisions (need your call)

1. **Priority field** on the detail screen — drop entirely (recommended) or relocate to the list as a triage filter?
2. **In-progress status saves** — relay edited premium/dates/term to the policy on any save (recommended), but set `policies.status='active'` only on `renewed`?
3. **Quotes access** from the detail screen — fully cut (recommended) or keep one "View quotes" link in the overflow?
4. **List primary action** — lime "Sync from policies" (recommended), or keep AI Intelligence / Export visible / in overflow?
5. **"Moved" → policy carrier** — resolve carrier name → `carrier_id` now (full relay), or relay premium+term now and carrier as a fast follow?
6. **Document model** — dual-write now (recommended) with a later consolidation onto `documents` (retiring `renewal_documents`)?
7. **MED-3** (customer-page edits flowing back into the open renewal) — leave one-directional this pass, or include?

---

## Critical files

- `src/pages/RenewalEditPage.tsx`
- `src/hooks/useRenewalWorkflow.ts`
- `src/components/renewals/RenewalCompletionModal.tsx`
- `src/pages/RenewalsPage.tsx`
- `src/components/customers/CustomerPoliciesSection.tsx`
- `UI Overhall/zpk/design-system/` (constitution — law)
