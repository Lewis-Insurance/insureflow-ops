# InsureFlow AI/send fence — follow-up tracker

Source: orchestrated five-unit review of `docs/fence-ai-send-verification-handoff.md` on branch `feat/fence-ungated-ai-send-paths`. Reviewer sign-off dated 2026-06-30 (see the handoff "Reviewer sign-off" section).

**Triage legend**

- **CLOSE-THE-GAP** — real safety; must fix or formally accept (not disclosure-only).
- **DISCLOSURE** — wording already corrected in the handoff/inventory.
- **CONFIRM** — decision/clarification.
- **SEC / ENV** — security or tooling items found during review.

**Deploy posture:** the four-function fence is safe to deploy on Brian's go; none of these block it. `canopy-servicing` (FU-1) must be closed or formally accepted before the client-send surface is represented as "fully fenced."

---

## CLOSE-THE-GAP

### FU-1 — Gate or formally accept `canopy-servicing` carrier-mediated client send · status: OPEN

- **Finding:** `request_id_card` / `request_declarations` POST `{ delivery_method: 'email', email }` to the Canopy servicing API, causing the carrier to email documents to a client — with no `client_send_approval`.
- **Evidence:** `supabase/functions/canopy-servicing/index.ts:384` (payload), `:250` (Canopy POST).
- **Task 0 (decides fix vs. accept):** confirm whether any AI/automation surface can invoke `canopy-servicing`, or only a human-initiated UI action.
- **Option A — fix:** mint + consume a `client_send_approval` (canonical content = action_type + policy id + delivery email) before the Canopy POST, consistent with the other four functions; add reject/accept-once/replay tests.
- **Option B — accept:** commit a dated, logged carrier-mediated exception in `docs/fence-ai-send-inventory.md`, with the Task-0 reachability finding as rationale.
- **Acceptance:** inventory updated; either a gate + tests merged, or an exception rationale committed. **Blocks any "client-send fully fenced" representation.**

### FU-2 — Redact (or flag-gate) `hermes-chat` + `prism-api` model proxies · status: OPEN · ELEVATED (cockpit prerequisite)

- **Finding:** live-proxy paths forward the raw user message / prompt to an external service guarded only by a block-list (`hermes-chat`) or nothing (`prism-api`), not `redactPII`. Default synthetic/off, so no live leak today.
- **Evidence:** `supabase/functions/hermes-chat/index.ts:84` (proxy fetch), `:24` (`isUnsafeMessage` block-list), `:196` (live-mode condition); `supabase/functions/prism-api/index.ts:166` (raw prompt forward).
- **Why elevated:** `hermes-chat` is the cockpit bridge; its live-proxy mode is the next wiring step. Redaction must land before the cockpit is connected to the real Hermes brain.
- **Fix:** run the outbound message/prompt through the shared redactor (`redactPII` / `redactModelBoundaryText`) before the external `fetch` — the block-list only rejects a few categories and does not sanitize labeled values. Or document as a feature-flagged exception with the flag-off default asserted by test.
- **Acceptance:** redaction applied + test (or exception doc + default-off test). **Fold into the cockpit-wiring run.**

### FU-3 — Bring Google Cloud Vision OCR under the model boundary · status: OPEN

- **Finding:** raw document bytes reach Google Vision; `ocr-document` uses a non-boundary `fetch`, and `parse-document-ocr`'s `modelBoundaryFetch` no-ops for the Vision URL.
- **Evidence:** `supabase/functions/ocr-document/index.ts:61`; `supabase/functions/parse-document-ocr/index.ts:83`; `supabase/functions/_shared/modelBoundaryFetch.ts` URL matcher.
- **Fix:** teach `modelBoundaryFetch` to recognize `vision.googleapis.com` (stop the no-op) or wrap/route `ocr-document` through the boundary. Note: OCR inherently receives raw bytes (you cannot redact bytes pre-OCR), so scope this to URL/metadata handling + the approved provider posture, consistent with the §5 OCR exception.
- **Acceptance:** Vision recognized by the boundary (or `ocr-document` wrapped); §5 lists Vision (done).

---

## DISCLOSURE — done

### FU-4 — Handoff/inventory wording corrected · status: DONE (commits `8c6c058`, `2b7f3ec`, `2ea7b37`)

Reflected in `docs/fence-ai-send-verification-handoff.md` / `docs/fence-ai-send-inventory.md`:

- §4 `redactPII` softened to label/format-dependent coverage.
- `ai-document-analysis` residual filename paths (`index.ts:497`, `:347`) noted.
- Test coverage marked representative-not-exhaustive.
- `weekly-ceo-digest` deploy-loop wording reconciled (internal-digest/redaction bundle, not client-send coverage).
- e-sign default `subject`/`message` not in content hash (handoff §2 + §5).
- `canopy-servicing`, `hermes-chat`/`prism-api`, Google Vision added to the inventory.

No deployable-code change; no closed hole reopened.

---

## CONFIRM — resolved

### FU-5 — `email-send` human-path intent · status: RESOLVED (no regression; product decision pending)

- **Finding:** no `email-send` invoker in `src/` now or at pre-fence `21b181a`; the only history hit is the fence test's forbidden-string list (`b77d76d`); `EmailComposerModal` only logs `status:'sent'`. Nothing regressed.
- **Open product decision:** with automations failing closed, there is no working `email-send` path. Choose: (a) build a human email composer + approval-mint wrapper (like SMS/COI/e-sign), (b) re-enable specific automations with server-side approval minting, or (c) leave `email-send` dormant.

---

## SEC / ENV — found during review

### SEC-1 — Rotate GitHub token embedded in git remote · status: OPEN

- The `origin` remote URL stores a GitHub OAuth token (`gho_…`) in plaintext in `.git/config`; exposed to anyone with filesystem/log/screenshare access and printed to a terminal during review.
- **Fix:** revoke/rotate the token; reconfigure `origin` to use a credential helper or SSH; scrub it from any captured logs.

### ENV-1 — Standardize the verify command on npm (bun not available) · status: OPEN (low)

- `bun run test|lint|build` fail with "command not found"; the repo has no bun lockfile or `packageManager` field, and `bun` is not installed in the verify environment.
- **Fix:** use the repo-supported `npm run test:run | lint | build` (already documented in the handoff), or install/configure bun if it is meant to be the standard. Keep one documented verify path so reviewers don't hit this blocker.
