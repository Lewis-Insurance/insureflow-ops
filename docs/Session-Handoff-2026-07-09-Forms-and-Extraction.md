# Session Handoff — 2026-07-09 — Form Consolidation + Extraction Ship

**For the next session.** This tells you HOW to work in this repo and captures the exact state of the
document-extraction and customer/policy-creation surfaces. The user (Landen) will tell you WHAT to work
on next; this doc is your ground truth for the current state so you don't re-derive it.

---

## 0. HOW TO WORK (read this first)

**Orchestrator mode.** Read [`ORCHESTRATOR.md`](../ORCHESTRATOR.md) and [`CLAUDE.md`](../CLAUDE.md) every
session. You direct the work: decompose → delegate to subagents (Explore for recon, general-purpose for
builds) → review every returned diff yourself to a world-class bar → integrate. No unreviewed work.

**Who Landen is (binding).**
- Non-technical. Explain in plain English, no jargon. Recommend a path; don't enumerate exhaustive options.
- **Work ONE concrete step at a time.** Do NOT hand him big multi-part plans — he has explicitly said that
  makes the model "get lost in the sauce." Understand scope first, do one step, verify, stop, report.
- Keep sessions tightly scoped; confirm scope before implementing when there's a real judgment call.

**Repo guardrails (from the winpc/workflow-hardening work, now on main):**
- Branch off fresh `main` → PR flow. See [`NEW-PC-SETUP-WINDOWS.md`](../NEW-PC-SETUP-WINDOWS.md).
- **Do NOT hand-edit `package-lock.json`** — a `.githooks/pre-commit` hook blocks a lockfile-only commit
  (escape hatch `ALLOW_LOCKFILE_ONLY=1`). `core.hooksPath` is `.githooks`.
- `.gitattributes` normalizes line endings to LF. The "CRLF will be replaced by LF" warnings on commit are
  expected/harmless.
- **ACORD parity test** (`src/__tests__/acord/acord25/parity.test.ts`) requires `src/lib/acord/acord25/*`
  and `supabase/functions/_shared/acord25/*` to stay identical. If you touch ACORD-25 logic, mirror both
  sides or CI fails.
- **CI runs the full test suite** (`npm run test:run`) before build. Keep it green (currently ~885 passed,
  2 skipped). A change that loosens the redaction fence must deliberately update
  `src/fence/modelBoundaryRedaction.test.ts` and `src/fence/dateRedactionContext.test.ts`.

**Verification reality.** You CANNOT click through the live app from a headless session — the customer/
policy modals sit behind Supabase staff auth. Verify by: `npm run build`, `npm run test:run`, and
line-by-line diff review. State that honestly; final proof of user-facing behavior is Landen trying it.

**Merging & deploy.**
- Auto-merge is NOT enabled on the repo. Watch CI, then `gh pr merge <n> --merge`. Branch protection gates
  on **Build & Test** (required). **Cursor Bugbot is NOT required** — `mergeStateStatus: UNSTABLE` means
  "mergeable, waiting on a non-required check"; you can merge at UNSTABLE. `BLOCKED` = a required check is
  pending/failing (wait) or a review is required.
- **Merging to `main` deploys the FRONTEND** via Netlify (`lewisinsurance.netlify.app`). **Edge functions
  deploy SEPARATELY** to Supabase. CLAUDE.md: "Claude code is to deploy all edge functions automatically."
  The `supabase` CLI is NOT installed on this machine; use the Supabase MCP `deploy_edge_function`
  (bundle the entrypoint + `shape.ts` + the transitive `_shared/*.ts` closure, named
  `functions/<fn>/index.ts` + `functions/_shared/*.ts`, `verify_jwt: true`). A `get_edge_function` result is
  huge (60-100KB) — it saves to a file; grep it, don't read it into context, or delegate to a subagent.

**Memory.** A persistent memory lives at the user's `.claude/.../memory/`. Relevant entries:
`one-step-at-a-time`, `communication-plain-english`, `scope-and-handoffs`, `extraction-pipeline-landscape`.

---

## 1. WHAT WAS DONE THIS SESSION

Three things shipped to production. Everything below is merged to `main` and live.

### 1a. One canonical Add Customer + Add Policy form (PR #82, merged)
- Extracted the policy form into **`src/components/customers/PolicyFormFields.tsx`** — the single source of
  truth. Exports: `PolicyFormData`, `initialPolicyFormData`, `policySchema`, `applyPolicyFieldChange`
  (auto-calcs expiration date, timezone-safe), `mapExtractedToPolicyForm` (parser prefill + needsConfirmation),
  `buildPolicyInsert` (the `policies` insert payload), and the controlled `PolicyFormFields` component.
- **`AddPolicyModal.tsx`** now renders the shared piece (no behavior change).
- **`AddCustomerModal.tsx`** "Also add a policy" section now uses the identical shared form: canonical Line-of-
  Business combobox, Billing Method, full status set, auto-calc expiration, carrier matching, and
  `generateTasks('policy_issued', ...)`. Enabling the toggle now validates via `policySchema` (fixed a
  blank-date save regression).
- Removed the **Lead Source** section from Add Customer.
- **`src/pages/CRM.tsx`** "New account" now opens the canonical `AddCustomerModal`; `AccountForm` there is
  now **edit-only** (`AccountForm` is still the account EDIT form here and in `AccountDetail.tsx` — do not
  delete it).

### 1b. Commercial extraction overhaul (PR #81, merged + already live)
- Merged `claude/policy-document-parsing-b604eb` (~6,000 lines). It reworks the 5 commercial per-line
  extractors: async background processing (`EdgeRuntime.waitUntil`), Anthropic tool-use structured output
  with `shape.ts` schemas, `claude-sonnet-5`, carrier resolution, and a **date-aware redaction fence**.
- **The 5 functions were already deployed to prod before the merge.** Verified all five run the reviewed
  code (fence byte/functionally identical). No redeploy was needed. The merge synced source into `main`.

### 1c. Retired the dead cover-send branch
- Deleted `commercial/phase-1b-cover-send` (old PR #74, unwanted). Recoverable from GitHub if ever needed.

### Branch survey conclusion
The ~42 "unmerged" branches were mostly **squash-merge noise — already live**. Only the extraction branch
was genuinely stranded-and-valuable (now shipped). Two stale leftovers (`hardening/storage-6a` signed-URL
security; `feature/phase0-engine` marketing) are better rebuilt fresh than merged — NOT done, low priority.

---

## 2. DECISIONS MADE

- **Consolidation scope = "just the Add buttons."** Make every Add-Customer and Add-Policy button open the
  same modal. Explicitly LEAVE the other record-creation flows (Convert Lead, bulk CSV import, renewal
  "moved to new carrier", ACORD prospect-mint) as their own distinct actions — they are not "Add" buttons.
- **Shared component, not copy-paste**, so future edits to the policy form propagate to both surfaces.
- **Ship the extraction overhaul** after an independent review confirmed the fence change is safe (dates only;
  SSN/VIN/policy#/account# redaction unchanged) and CI/full-suite green. Verified prod already running it.
- **Redaction fence tradeoff accepted (narrow):** the date-aware fence lets policy dates reach the model while
  still hiding birthdates; a young person's DOB (<~13 yrs) adjacent to policy wording with no DOB label could
  survive. Deliberate, narrow, commercial-P&C context. Default for unlabeled dates remains redact.
- **Do not blind-merge the ~35 already-live / stale branches.**

---

## 3. CURRENT REPO & GIT STATUS

- Branch checked out locally: **`main`**, working tree **clean**, in sync with `origin/main` (0 ahead / 0 behind).
- `origin/main` tip: **`e8f29ae0`** (Merge PR #81). Recent line: #83 phone-format → #82 forms+guardrails → #81 extraction.
- No open work-in-progress branches from this session; PR #82 and #81 are merged. PR #74 closed (branch deleted).
- Netlify auto-deploys `main`. Supabase edge functions `extract-{cgl,bap,wc,property,umbrella}-policy` are
  live with the new code (cgl v112, others v104).
- **Not done (needs a human in GitHub settings):** make **"Build & Test" a REQUIRED status check** in branch
  protection so a red CI blocks the merge button. Carried over from the 2026-07-08 guardrails work.

---

## 4. DOCUMENT EXTRACTION — FULL STATE

There are **three** extraction code paths. Know which is which before changing anything.

### 4a. The drag-drop "Add Customer / Add Policy" path  ← THE LIKELY NEXT TARGET
- Backend: **`supabase/functions/ai-document-analysis-azure/index.ts`** (Azure Document Intelligence OCR +
  **Azure OpenAI**, greedy `JSON.parse`, hardcoded `confidence_score`). This is the WEAKER path and was NOT
  touched by the overhaul.
- Frontend: dropzone lives INSIDE `AddCustomerModal.tsx` (`dec-pages/…`) and `AddPolicyModal.tsx`
  (`applications/…`). On drop → upload to Storage bucket `documents` → invoke `ai-document-analysis-azure`
  → returns `{analysis|data|extracted_data: {...}, confidence_score}` → prefill form.
- Known weaknesses (the improvement surface):
  - Does NOT use the carrier→NAIC `resolve_carrier` RPC (carrier comes through as raw text via
    `mapCarrier` in `src/lib/policyParserMap.ts`).
  - Backend `confidence_score` is **never read** by the frontend; no per-field confidence/provenance.
  - Add Customer silently overwrites fields (no needsConfirmation on the customer side); address parsing
    (`parseFullAddress`) is brittle regex.
  - Different, weaker model path than the commercial extractors below.

### 4b. The 9 per-line extractors (`supabase/functions/extract-*-policy`)
- Enrich an EXISTING policy (`policies.*_details` + child tables); they do NOT create a policy.
- **5 commercial ones overhauled + live** (cgl/bap/wc/property/umbrella): date-aware fence,
  `_shared/carrierResolve.ts` (reuses `resolve_carrier` RPC), `shape.ts` structured output (cgl inline),
  async, `claude-sonnet-5`.
- **4 NOT overhauled**: `extract-{crime,cyber,eo,inland-marine}-policy` (still older greedy-parse style).
- Invoked from React hooks (`useCGLExtraction`, `useBAPExtraction`, …) with `{document_id, policy_id}`.

### 4c. The newer schema-validated stack
- `src/services/extraction/*`, edge fns `acord-document-extractor`, `acord-document-extractor-v2`,
  `acord-extraction-pipeline`. Strict JSON + validation engine + review queue. Parallel to 4b; reconcile
  before building on either.

### The PII redaction fence (security-critical; test-enforced)
- `supabase/functions/_shared/floorSafety.ts` — now **date-aware** (`shouldRedactDate`): birthdate wording →
  redact; policy wording → keep; unlabeled date → redact by default. Uses reversible tokenization
  (private-use-area placeholders) so kept policy dates aren't chewed by later patterns, plus
  `nullifyRedactedTokens()` so the model can't launder `[REDACTED_*]` back into the CRM.
  SSN / VIN / policy# / account# / email / phone redaction is UNCHANGED.
- `supabase/functions/_shared/modelBoundaryFetch.ts` — redacts at the model boundary; "never echo header
  value in errors" guard intact; added a 45s AbortController timeout.
- Locked by `src/fence/modelBoundaryRedaction.test.ts` (asserts DOB/VIN/policy# destroyed) and
  `src/fence/dateRedactionContext.test.ts` (locks the date-context behavior). Any fence change MUST keep
  these green (update deliberately, never gut).
- A second, broader private copy of `redactPII` lives in `process-document-tasks/index.ts` — keep in sync.

### The ACORD-25 taxonomy (extraction target / generator contract)
- Generator field map: `supabase/functions/_shared/acord25/fieldMap.ts` (mirrored to
  `src/lib/acord/acord25/fieldMap.ts` — parity-test guarded). Fed by a "Master COI" model
  (`_shared/acord25/fromMasterCoi.ts`, `master_coi_lines` RPC), consumed by `generate-certificate`.
- Handoff describing the desired ingest end-state: **`ACORD_25_Extraction_Handoff.md`** (in the user's
  Downloads; the input mirror of `ACORD_COI_Module_Handoff.md`). Its priorities: enforce structured output,
  fix redaction ordering (largely DONE for commercial via 4b), carrier→NAIC (DONE via `resolve_carrier`),
  insurer-letter integrity, blanket-endorsement detection, per-field confidence + review gate.

---

## 5. CUSTOMER / POLICY PAGES + ADD FLOWS — FULL STATE

### Add a CUSTOMER — one canonical modal now
- Component: **`src/components/customers/AddCustomerModal.tsx`** (creates an `accounts` row; can optionally
  also create a policy via the embedded shared form). Resolves workspace via `get_user_org_id`.
- Opened from (all the same modal): Customers page button + header "New customer" + Cmd-K (all via the
  `new-customer` chrome action, handled in `src/pages/CustomersPage.tsx`), **and now** the CRM/Contacts page
  "New account" button (`src/pages/CRM.tsx`).
- NOT consolidated (distinct actions, by decision): `ConvertLeadModal` (lead→customer+policy, own forms +
  `useLeadConversion`), bulk CSV import (`bulkImportProcessor.ts` via `import_resolve_account` RPC),
  `FormManagement.tsx` "New Prospect" (mints a `type='prospect'` account as a side effect of ACORD-form
  creation). Dead writers still in code: `useUnifiedCustomers.createCustomer`, `useCustomers.createCustomer`,
  `create_account_with_membership` RPC (no callers).

### Add a POLICY — one canonical modal now
- Component: **`src/components/customers/AddPolicyModal.tsx`** (creates a `policies` row for a given
  `accountId`; drag-drop prefill; duplicate-policy compare/merge dialog; `generateTasks('policy_issued')`).
- Opened from (all the same component): Policies page "New policy" (`src/pages/PoliciesPage.tsx`), Customer
  detail dropdown (`src/pages/CustomerDetail.tsx`), the Customer Policies section header "+" and empty-state
  (`src/components/customers/CustomerPoliciesSection.tsx`), and the "Also add a policy" section inside
  `AddCustomerModal` (shared `PolicyFormFields`).
- NOT consolidated (distinct, by decision): `ConvertLeadModal` (own inline policy insert), bulk import
  (`bulkImportProcessor.ts`), renewal "mark moved" → `renewal_mark_moved` RPC (server-side
  `INSERT INTO policies`).

### Key shared helpers
- **`src/components/customers/PolicyFormFields.tsx`** — the shared policy form (see 1a). Change the policy
  form HERE and both surfaces update.
- `src/lib/policyParserMap.ts` — `mapCarrier`, `mapLineOfBusiness` (fuzzy match to canonical lookups).
- `src/lib/policyDates.ts` — `calcExpirationDate`, `parsePolicyTerm`.
- `resolve_carrier(text)` RPC — `supabase/migrations/20260702172000_master_coi_rpcs.sql` (carrier→NAIC).

---

## 6. KNOWN DEBT / OPEN ITEMS (candidate next steps — Landen chooses)

1. **Drag-drop "Add Customer/Policy" extraction** still uses the weaker `ai-document-analysis-azure` path
   (see 4a). The original target Landen pointed at; would benefit from the same treatment the commercial
   extractors got (carrier resolution, confidence/provenance surfaced, structured output, needsConfirmation
   on Add Customer). **Most likely next task.**
2. **Extraction jobs can mark `completed` on partial data** — child-table insert errors are logged but not
   promoted to job failure (pre-existing, all commercial extractors). Consider failing the job on child
   insert error. WC experience-mods is now DELETE-then-INSERT so a failed insert there can lose rows.
3. **Make "Build & Test" a required status check** in GitHub branch protection (human/GitHub-settings task).
4. Stale-but-real leftovers, better rebuilt than merged: `hardening/storage-6a` (getPublicUrl → signed URLs
   security), and salvage-worthy piece of `feature/phase0-engine` (postmark bounce/complaint webhook).
5. The 4 non-overhauled extractors (`crime/cyber/eo/inland-marine`) still use the older greedy-parse style.

---

## 7. QUICK FILE MAP

| Area | Path |
|---|---|
| Shared policy form (single source of truth) | `src/components/customers/PolicyFormFields.tsx` |
| Add Customer modal | `src/components/customers/AddCustomerModal.tsx` |
| Add Policy modal | `src/components/customers/AddPolicyModal.tsx` |
| CRM page (New account → canonical modal) | `src/pages/CRM.tsx` |
| Account EDIT form (keep) | `src/components/crm/AccountForm.tsx` |
| Drag-drop backend (weak path, next target) | `supabase/functions/ai-document-analysis-azure/index.ts` |
| Commercial extractors (overhauled, live) | `supabase/functions/extract-{cgl,bap,wc,property,umbrella}-policy/` |
| PII redaction fence (date-aware) | `supabase/functions/_shared/floorSafety.ts` |
| Model boundary | `supabase/functions/_shared/modelBoundaryFetch.ts` |
| Carrier→NAIC resolver | `supabase/functions/_shared/carrierResolve.ts` + `resolve_carrier` RPC |
| Fence tests (must stay green) | `src/fence/modelBoundaryRedaction.test.ts`, `src/fence/dateRedactionContext.test.ts` |
| ACORD parity guard | `src/__tests__/acord/acord25/parity.test.ts` |
| ACORD-25 field map (mirror both sides) | `src/lib/acord/acord25/fieldMap.ts` ↔ `supabase/functions/_shared/acord25/fieldMap.ts` |
| Ingest handoff (desired end-state) | `ACORD_25_Extraction_Handoff.md` (user Downloads) |
| Prior extraction handoff | `docs/Commercial-Extraction-Session-Handoff-2026-07-08.md` |

---

*Written 2026-07-09 after shipping PRs #82 (forms consolidation + guardrails) and #81 (commercial extraction
overhaul). Repo on `main` @ `e8f29ae0`, clean, in sync with origin.*
