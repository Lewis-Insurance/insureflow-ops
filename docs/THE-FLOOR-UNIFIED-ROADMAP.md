# The Floor: Unified Roadmap

**Purpose.** The single plan that finishes The Floor for Lewis Insurance across all three surfaces (Slack, the InsureFlow CRM cockpit, and bot email) by collapsing them onto one spine, then turning on plays.

**Owner:** Brian "Speedy" Lewis
**Status:** proposed unified plan

**Supersedes** the scattered phase notes. This is consistent with `docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md` (the architecture baseline) and `docs/THE-FLOOR-PROJECT-STATE.md` (current state). Where those two disagree on sequencing (the Landen to Kelli remarket, see Decision (c)), this doc wins and points back to them.

### How to use this doc

1. Read section 1 (What The Floor is) and section 2 (The central reframe) once. That's the thesis.
2. Section 4 (Decisions locked) is settled. Don't reopen it. If you think a decision is wrong, raise it with Brian. Don't silently rebuild.
3. Build by phase (section 6). Know which phase you're in. Don't pull later-phase work forward, and never pull a send path forward.
4. Every file, table, and column named here is real and cited. Anything unbuilt says "NEW" or "does not exist yet." Don't invent columns.

---

## 1. What The Floor is

6 humans, 6 per-employee Hermes AI agents, working as peers. The agents do the legwork. The humans hold judgment and the client relationship. The unit of work is the client thread, not the ticket. Work arrives as finished decision cards (Approve / Edit / Kill), never as to-do items.

Two rules dominate everything:

- **R7:** no client send without a named human's approval.
- **R9:** PII passed by reference only, never inside a prompt.

The 6 humans (project-state §3): Brian, Letitia, Landen, Kelli (the adoption hinge), Jacob, Tori (CSR, new).

Two repos:

- `/Users/rocky/insureflow-ops`: the InsureFlow CRM (Supabase, 123 edge functions; verify: `ls -d supabase/functions/*/ | grep -v _shared | wc -l`), the shared spine, and the in-app cockpit.
- `/Users/rocky/lewis-the-floor`: the office Mac Mini repo. The Hermes agent runtime plus the Slack app (Socket Mode, launchd).

---

## 2. The central reframe (the thesis)

The three surfaces are not three systems. They are three intake points and three renderers of ONE spine.

```
intake (email / slack-forward / crm button / voice / heartbeat)
  -> WorkRequest
  -> resolveAccount
  -> Play
  -> DecisionPackage
  -> stageClientSend (undo hold)
  -> send
  -> FeedbackEvent
```

Today each surface reads a different fake source, and Approve does nothing real:

- **Slack** renders a fixture package (`lewis-the-floor/src/fixtures.ts`) and its Approve writes only a hermes-side row (`lewis-the-floor/src/floorRuntime.ts:52-67`, `saveDecision` into `hermes.decision_packages`).
- **The cockpit** shows a synthetic preview (`supabase/functions/hermes-chat/index.ts:62-81`) and its Approve/Edit/Kill buttons have no `onClick` (`src/components/floor/FloorCockpitDrawer.tsx:243-254`).
- **Email** produces no package at all. An inbound just becomes a helpdesk ticket (`supabase/functions/email-inbound-lite/index.ts:129-197`).

Finishing The Floor = collapsing all three onto one persisted `public.decision_packages` row (migration `supabase/migrations/20260701010000_floor_spine_a_contract_tables.sql:86-100`) plus one approval row (`floor_client_send_approvals`, same migration `:133-149`), then turning on plays. The single fixture to live seam is the Approve handler behind one shared Floor action endpoint. Get that one seam right and all three surfaces go live together.

---

## 3. Current state snapshot

Self-contained and grounded. This is what's actually true today.

### 3.1 Slack (in `lewis-the-floor`, largely BUILT, has run live in Socket Mode)

Built:

- "Lewis Floor" manifest + Socket Mode listener (`lewis-the-floor/src/index.ts`, `lewis-the-floor/src/slack/bolt.ts`).
- DecisionCard with Approve/Edit/Kill, a stale-guard, and dedupe (`lewis-the-floor/src/slack/blocks.ts`, `.../controller.ts`, `.../floorRuntime.ts`). The revision stale-guard throws `stale_decision_card` at `floorRuntime.ts:171-177`; dedupe rides `hermes.slack_event_dedupe` (`20260626170000_slack_workspace_operator.sql:96-102`).
- Per-agent `slack_user_id` to agent binding by email, with 5 real IDs seeded (`lewis-the-floor/supabase/seed_slack_bindings.sql`: brian `U0BD0PS8RU7`, letitia `U0BDG8MCTT4`, landen `U0BEAGM2SCQ`, kelli `U0BDCS9P7NH`, jacob `U0BDJ4067HP`). Tori is missing (deferred; `seed_tori_slack_binding.sql` holds a placeholder that refuses to apply until replaced).
- App Home + `/floor` slash command.
- Signed-URL-only doc buttons.
- `#migration` create + membership proposals (`hermes.slack_channel_operations`, `hermes.workspace_membership_proposals`).
- launchd plist (`lewis-the-floor/ops/launchd/com.lewisinsurance.floor.plist`).

Blockers:

- Live `/floor` fails with `invalid_arguments` (`lewis-the-floor/logs/floor.stderr.log`). Root cause is Block Kit: App Home `publishHome` sends text blocks over Slack's 3001-char limit (`bolt-app must be less than 3001 characters [json-pointer:/view/blocks/1/text/text]`), raised from `SlackAdapter.publishHome`. The fix is to chunk or trim the Home blocks, not a scope change.
- The launchd job is not currently loaded.
- TWO parallel decision_package/approval models: `hermes.decision_packages` (`lewis-the-floor/supabase/migrations/20260626170000_slack_workspace_operator.sql:37-59`) vs `public.decision_packages` (`supabase/migrations/20260701010000_floor_spine_a_contract_tables.sql:86-100`).

### 3.2 Bot email (in `insureflow-ops`, spine WRITTEN and unit-tested but DISCONNECTED)

- Inbound email today only becomes a helpdesk ticket (`supabase/functions/email-inbound-lite/index.ts`). The `ensureProfileByEmail` fix (resolve against `accounts.email` and `insured_emails.email` before creating a profile) is confirmed present (`index.ts:36-82`).
- The spine modules are dependency-injected library code with NO live caller: `src/floor/spine/mailSkillRouter.ts`, `resolveAccount.ts`, `stageClientSend.ts`, `plays/carrierReconciliation.ts`, `plays/suspenseSweep.ts`, mirrored to `supabase/functions/_shared/floor/*`.
- No `resolve_account` Postgres RPC (TS ladder only, `resolveAccount.ts:45-106`). `import_resolve_account` exists in the live schema (present in `src/integrations/supabase/types.ts`) to model the new RPC on.
- `automation_work_requests` / `decision_packages` / `feedback_events` / `floor_client_send_approvals` exist in SQL only (`20260701010000_floor_spine_a_contract_tables.sql`); zero code reads or writes them. The only DecisionPackage produced today is a synthetic stub (`supabase/functions/hermes-chat/index.ts:72-78`, plus the types-only `hermes-proxy/contract.ts:160-198`).
- The live R7 send chokepoint today is a SEPARATE "Fence" gate (`supabase/functions/_shared/clientSendApprovalGate.ts`), wired into `email-send`, `send-sms`, `send-coi-email` (`send-coi-email/index.ts:296-303`), and `esign-create-request`. The Floor `stageClientSend` is NOT wired.
- The cert-access TODO is still open (`supabase/functions/send-coi-email/index.ts:306`).
- `redactPII` is missing at the `hermes-chat`/`prism-api` model proxies (FU-2, `docs/fence-ai-send-followups.md`); an ungated `canopy-servicing` carrier send exists (FU-1, `supabase/functions/canopy-servicing/index.ts:250,384`).

### 3.3 CRM cockpit and cross-cutting (in `insureflow-ops`)

- Flag-gated (`VITE_LEWIS_FLOOR_COCKPIT_ENABLED`, default OFF) PRACTICE-ONLY shell. `src/components/layout/AppLayout.tsx:471-475` never passes `initialContext`, so the drawer always uses `defaultContext` (practice mode, `FloorCockpitDrawer.tsx:36-44`). Approve/Edit/Kill (`FloorCockpitDrawer.tsx:243-254`) have NO `onClick`.
- NO per-employee agent identity in the app. The session is hardcoded to `chat:practice-floor-cockpit` (`FloorCockpitDrawer.tsx:37`). The 6 agent profiles and the `hermes.agents` binding live only in docs and the Mac Mini package (`lewis-the-floor/supabase/migrations/20260626170000_slack_workspace_operator.sql:6-35`).
- `hermes-proxy` is contract-only (`supabase/functions/hermes-proxy/contract.ts`, no `index.ts`, not in `supabase/config.toml`). `hermes-chat` is the current bridge: synthetic default, optional live Hermes via `HERMES_API_URL` (`hermes-chat/index.ts:194-197`), gated by `FLOOR_COCKPIT_ENABLED` (`:57,172`), `verify_jwt = true` (`config.toml:70`), R9 block-list `isUnsafeMessage` (`:24-31`).
- Compliance lint: only R7 and R9 are real deterministic code here (`src/floor/spine/stageClientSend.ts`, `src/floor/floorSafety.ts`, `supabase/functions/_shared/floorSafety.ts`). R6 is via RLS. R1 to R5 and R8 are documented-only. The full R1 to R9 lint plus the sync checker lives in the Mac Mini package.
- Migrations are staged only, NOT applied: `20260701010000_floor_spine_a_contract_tables.sql` (Spine A), `20260701020000_floor_spine_d_policy_in_force_status.sql` (Spine D in-force view), plus the Fence `20260630040000_client_send_approvals.sql`. Supabase types are NOT regenerated. No Floor flags in any `.env.example` (verified: none present). Nothing is deployed. Per the current state, the Floor and Fence unit suites pass (7 Floor test files, 418 tests). Untested: `hermes-proxy`, live Hermes, per-user binding, Approve/Edit/Kill effects, wired Fence end to end, RLS.

---

## 4. Decisions (locked)

Four decisions, settled after research and a two-architect consultation. Each is a recommendation plus a one-paragraph rationale. Do not re-litigate.

### (a) Two R7 approval gates: KEEP BOTH, layered

**Recommendation.** Keep both gates and layer them. The Fence (`clientSendApprovalGate.ts`) stays as the last-inch boundary enforcer at the provider edge (content-hash, one-time consume, expiry). It's already live on all four send functions and already accepts `floor_action:` tokens (the regex at `clientSendApprovalGate.ts:55` is `/^(?:sendapproval|floor_action)[:_][A-Za-z0-9_-]{12,}$/`), and its canonical hash strips floor markers before hashing (`approvalMarkerFromPayload` plus the `sortObject` filter, `clientSendApprovalGate.ts:65-118`). The Floor `stageClientSend` / `releaseHeldClientSend` (`src/floor/spine/stageClientSend.ts`) is the orchestration layer above it (recipient-basis, cert-access, external-recipient check, in-force diff, 30s undo hold). `releaseHeldClientSend` becomes the SOLE producer of a valid Fence marker for Floor-originated sends. Concrete integration detail to state explicitly: the Fence today checks `approvedByUserId === userId` against a LIVE session (`clientSendApprovalGate.ts:202,233`), but a Floor release runs service-side about 30s later with no human session, so extend the Fence with a Floor-origin path that validates the marker's `floor_approved_by_human_ref` / `approved_by_human_id` against the `floor_client_send_approvals.approver_id` row instead. Net: no send reaches Resend or Twilio except through the Fence (unchanged), and every Floor send's marker is produced only after a named-human Approve plus the undo hold. Do not build a third mechanism. Also fold FU-1 (`canopy-servicing`) under the Fence during this work.

**Rationale.** The Fence is already deployed, already tested (`src/fence/*.test.ts`), and already boundary-correct: it hashes the exact payload, consumes once, and expires. Ripping it out to make the Floor row the only gate would throw away working safety exactly where the client send happens. The Floor gate solves a different problem (orchestration, undo, in-force, recipient basis) the Fence was never meant to. Two layers, one at orchestration and one at the provider edge, is defense in depth, not duplication, as long as exactly one path (`releaseHeldClientSend`) can mint a Floor marker.

### (b) `hermes.*` vs `public.*` packages and approvals: `public.*` is the system of record

**Recommendation.** `public.*` is canonical. The Spine A migration models the full contract with RLS and an audit child table (`automation_work_request_events`, `20260701010000_...:70-81`). Demote `hermes.decision_packages` to a thin Slack delivery projection holding only Slack-specific state (`slack_channel_id`, `slack_message_ts`, `revision`, `rendered_hash`, already present at `20260626170000_...:54-59,152-155`), keyed by `decision_package_id`. Grant the `hermes_app` role access to the public Floor tables so the Mac Mini reads and writes canonical rows. Keep `hermes.agents` as the single agent-identity/binding table (it holds the seeded `slack_user_id`s, `20260626170000_...:6-35`) and expose it to the CRM via a read view. That read view is also how the cockpit finally gets per-employee identity. A human never approves anything that lives only in `hermes.*`.

**Rationale.** There can be only one row a human's approval attaches to, or the R7 audit means nothing. `public.decision_packages` is designed as that row (typed, RLS'd, FK'd to work requests and accounts). `hermes.decision_packages` was built Slack-first, before Spine A existed, and its `approve()` writes only hermes-side state (`floorRuntime.ts:52-67`), invisible to the CRM and to the Postgres E&O trail. Two writable package tables is the "two parallel models" disease. Making `public.*` canonical and `hermes.*` a delivery projection keeps the working Slack machinery (dedupe, stale-guard, message timestamps) without letting it be a second source of truth.

### (c) Landen to Kelli remarket: defer to the proactive phase (Phase 5), NOT project-state §11's "Phase 1"

**Recommendation.** Follow the newer handoff baseline. The Landen to Kelli remarket lands in Phase 5 (proactive) here, not in project-state §11's "Phase 1." It's a Tier 4 licensed act (coverage advice) that depends on resolve, in-force, coverage diff, and the compile-from-corrections pipeline, and Kelli is the adoption hinge (project-state §3). Betting rollout on her highest-stakes workflow first inverts the risk gradient. Action item: update `docs/THE-FLOOR-PROJECT-STATE.md` §11 to point at this roadmap so there's one answer.

**Rationale.** project-state §11 still names the Landen to Kelli remarket as the Phase 1 definition of done, but the handoff architecture (§7, §8 Adoption) already moved it to its proactive phase and put internal, invisible, zero-client-risk plays first. A remarket is coverage advice, the top of the autonomy ladder (Tier 4, draft-only, handoff §5). It needs the whole spine plus the correction-compile loop underneath it. And it's Kelli's workflow, and Kelli is the person whose comfort decides adoption. Shipping her hardest, highest-stakes flow first is backwards. The safe order is internal wins, then a low-risk client send (ID cards), then proactive and advice.

### (d) Cockpit bridge: consolidate on `hermes-chat`

**Recommendation.** Consolidate on `hermes-chat`. It exists and is deployable (`supabase/functions/hermes-chat/index.ts`, in `config.toml:70`), it's gated by `FLOOR_COCKPIT_ENABLED` (`:57,172`), it has the synthetic to live switch via `HERMES_API_URL` (`:194-197`), and it has the R9 PII guard (`isUnsafeMessage`, `:24-31`). Fold the `hermes-proxy/contract.ts` types into a shared module and retire the empty `hermes-proxy` folder (no `index.ts`, not in `config.toml`). Do not build `hermes-proxy` as a second bridge.

**Rationale.** There are two candidate bridges and only one is real. `hermes-chat` is a working, deploy-shaped edge function with streaming, and the cockpit already calls it (`src/floor/floorChatClient.ts` via `FloorCockpitDrawer`). `hermes-proxy` is a contract file with good types but no runtime and no config entry. Standing it up would recreate what `hermes-chat` already does and give us a second thing to keep in sync, the same disease as (b). Keep the good types, drop the empty shell.

---

## 5. Conventions (fixed defaults)

These carry through every phase. Don't hardcode them anywhere else; import from `src/floor/spine/constants.ts`.

- `RESOLVE_ACCOUNT_AUTO_THRESHOLD = 0.9` (`constants.ts:2`). At or above 0.9, `resolveAccount` auto-proceeds. Below it, the card forces a human identity pick (`resolveAccount.ts:97-100`, `shouldForceIdentityPick`).
- `CLIENT_SEND_UNDO_HOLD_SECONDS = 30` (`constants.ts:3`). Every Floor client send holds 30s before it fires (`stageClientSend.ts:93-101`). Kill during the hold cancels it.

### Phase mapping (this roadmap vs the handoff architecture)

| This roadmap | Handoff architecture | What it is |
|---|---|---|
| Phase 0 Runway | new | Unification prerequisites, dark, dev-only |
| Phase 1 The Invisible Win | new (spine + internal plays from §8) | Collapse the surfaces onto one spine, internal cards only |
| Phase 2 The Send Seam | new (Spine B chokepoint from §8) | The R7 send path made real, internal-locked |
| Phase 3 First Light | new (Play 4 ID cards from §8) | First live client-facing send |
| Phase 4 The Safe Book | Handoff §7 Phase 2 | Rest of the safe plays + non-email intake |
| Phase 5 No Handoff | Handoff §7 Phase 3 | Proactive + self-improving (Landen to Kelli lands here) |
| Phase 6 Commercial & Shared Floor | Handoff §7 Phase 4 | Commercial COI, registry, FNOL, shared floor |

Phases 0 to 3 are the new unification and go-live sequencing. Phases 4 to 6 map onto the handoff roadmap.

---

## 6. The phases

Seven phases, 0 through 6. Each carries the fixed defaults from section 5.

### Phase 0: Runway

**Goal.** Make everything true that must be true before any real card or send is possible. All work on the dev branch `klnygbbmognbslgobmzc` (project-state §4.4). Prod stays dark, zero client risk.

**Backbone / cross-cutting.**

- Brian Phase-0 clearance (gate G0): confirm the live source tables for the read views; confirm PITR is enabled and record proof in `docs/ops/pitr-check.md` (project-state §8.3); approve dev-branch write testing; create the `hermes_app` least-privilege role; confirm `pg_trgm` is installed on prod in the `extensions` schema or queue a `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions` migration (handoff §9.1); decide bucket-privacy timing but do NOT flip (project-state §8.1).
- Apply `20260701020000_floor_spine_d_policy_in_force_status.sql` (Spine D) first, then `20260701010000_floor_spine_a_contract_tables.sql` (Spine A), to dev only.
- Regenerate `src/integrations/supabase/types.ts`.
- Add all Floor flags to `.env.example`: `VITE_LEWIS_FLOOR_COCKPIT_ENABLED`, `FLOOR_COCKPIT_ENABLED`, `FLOOR_HERMES_SYNTHETIC`, `HERMES_API_URL`, `HERMES_API_KEY`, `API_SERVER_KEY`, `HERMES_MODEL_NAME` (all consumed by `hermes-chat/index.ts`).
- Write 4 short ADRs locking decisions (a) through (d).
- Land `redactPII` pre-model on the bridge and close FU-2 (`docs/fence-ai-send-followups.md`).
- Reconcile docs: update project-state §11 (Decision c) and record the decisions in `docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md`.

**Slack.**

- Fix the live `/floor` `invalid_arguments` error (chunk or trim the App Home blocks under Slack's 3001-char limit; `lewis-the-floor/logs/floor.stderr.log`).
- Load the launchd plist (`com.lewisinsurance.floor.plist`); confirm the listener is up.
- Turn OFF Slack AI features in admin (project-state §9). Do NOT install to the real workspace yet. Keep fixtures.

**CRM cockpit.**

- Keep the flag OFF in prod.
- Stand up the single Floor action endpoint (persists live `public.decision_packages`, routes the Approve/Edit/Kill verbs); deploy to dev only.
- Retire the empty `hermes-proxy` stub; confirm `hermes-chat` as the bridge (Decision d).

**Bot email.**

- No behavior change (still the helpdesk ticket).
- Land the `resolve_account` SECURITY DEFINER RPC (modeled on the existing `import_resolve_account`), mirroring `src/floor/spine/resolveAccount.ts`.
- Deploy the `email-inbound-lite` fix plus the resolve and router modules to dev, with NO live caller.

**Definition of Done.**

- [ ] Migrations green on dev (Spine A + D).
- [ ] `src/integrations/supabase/types.ts` regenerated.
- [ ] The in-force view returns correct status on dev.
- [ ] The Floor action endpoint is live on dev.
- [ ] The `resolve_account` RPC exists.
- [ ] `/floor` works and launchd runs.
- [ ] 4 ADRs merged.
- [ ] project-state §11 reconciled.
- [ ] Prod unchanged, all flags OFF.

### Phase 1: The Invisible Win

**Goal.** All six humans receive real, per-name decision cards for INTERNAL, reversible work, on both Slack and the cockpit. No send path exists anywhere. This is the first shippable, optimized for trust at minimal risk.

**Backbone / cross-cutting.**

- Per-employee binding live (read `hermes.agents` via the read view from Decision b).
- `FeedbackEvent` logged on every verb (`public.feedback_events`). This is deliberately early so the compile pipeline can harvest it later.
- Cards driven by live `public.decision_packages`.

**Slack.**

- Swap fixtures for live packages from the action endpoint (the fixture to live seam, Slack half).
- Seed Tori's `slack_user_id` (`seed_tori_slack_binding.sql`) so binding is 6/6.
- App Home shows "my cards." Internal cards only.

**CRM cockpit.**

- Replace the hardcoded `chat:practice-floor-cockpit` (`FloorCockpitDrawer.tsx:37`) with per-user identity from `agency_workspace_memberships`.
- Give Approve/Edit/Kill real `onClick` to the action endpoint (`FloorCockpitDrawer.tsx:243-254`).
- `AppLayout` passes `initialContext` (`AppLayout.tsx:471-475`).
- Flip `hermes-chat` to live mode on dev via `HERMES_API_URL`, only after FU-2 redaction is proven.

**Bot email.**

- Rewire `email-inbound-lite` to resolveAccount-first, then `mailSkillRouter`, then create a `WorkRequest`.
- Out-of-scope inbound still falls through to today's helpdesk ticket, unchanged.
- Produces internal triage cards, never a send.

**Plays.**

- Play 1: carrier-download reconciliation / in-force (Tier 1, real read into `policy_in_force_status`; `src/floor/spine/plays/carrierReconciliation.ts`).
- Play 3: suspense / follow-up sweep (Tier 1 to 2, routes to the named owner; `src/floor/spine/plays/suspenseSweep.ts`).

**Definition of Done.**

- [ ] An internal card lands in under 5s in BOTH Slack and the cockpit, under the correct human's name.
- [ ] Approve/Edit/Kill work and log FeedbackEvents.
- [ ] Email intake creates WorkRequests and resolves identity correctly above and below the 0.9 bar.
- [ ] No code path can reach a provider.

### Phase 2: The Send Seam

**Goal.** Make the R7 send path real end to end, but structurally incapable of reaching a real client (a hard internal-recipient allowlist). This is the risky half of the backbone, client-locked.

**Backbone / cross-cutting.**

- Unify the approval model per Decision (a): `stageClientSend` writes `floor_client_send_approvals` (held); `releaseHeldClientSend` mints a Fence `floor_action:` token after the 30s hold and calls the send function; the Fence consumes it; add the service-role Floor-origin validation path from Decision (a).
- Bring FU-1 (`canopy-servicing`) under the Fence.
- Finish the cert-access TODO (`send-coi-email/index.ts:306`) inside Floor's path, plus a Fence-level check for manual / non-Floor sends.
- Await the `email_log` insert on the Floor send path (the Floor library already awaits its `logEmail` dep at `stageClientSend.ts:119`; make the wired edge path do the same); add delivery-state tracking (`sent` is not `delivered`).
- HARD test-recipient allowlist: Lewis-internal addresses only.

**Slack.**

- Wire Approve to `stageClientSend`.
- Render the held / undo state.
- Kill cancels during the hold.

**CRM cockpit.**

- Same Approve to `stageClientSend` path.
- Show held / undo plus delivery state.

**Bot email.**

- A resolved COI or ID-card-shaped inbound can now produce a Tier-3 DecisionPackage that, on Approve, sends to an internal test recipient only.

**Definition of Done.**

- [ ] An Approve on either surface fires a real send to an internal test address through Floor to Fence to provider, with a 30s undo hold and a working Kill.
- [ ] Every external-looking recipient is blocked.
- [ ] The `email_log` insert is awaited.
- [ ] No second enforcement path exists besides the Fence.

### Phase 3: First Light

**Goal.** The first send that can reach a real client, on the highest-volume and lowest-risk personal-lines play, behind a live in-force diff. Brian-gated.

**Backbone / cross-cutting.**

- Brian "first live client send" sign-off (gate G4).
- Flip the internal allowlist to real recipients, PER PLAY, ID cards first.
- Bucket-privacy flip if doc buttons touch real docs (Brian gate G2).

**Slack + CRM cockpit.**

- ID card / proof-of-insurance one-tap card.
- In-force diff gate (`policy_in_force_status`).
- Owner assignment (Tori or Landen; Brian picks; handoff §9.5).

**Bot email.**

- "Send me my ID card / proof" resolves, runs the in-force check, builds the card, and on Approve sends.

**Definition of Done.**

- [ ] An ID-card request produces a card in under 5s in the owner's Slack and cockpit.
- [ ] Approve sends under their name behind a passing in-force diff.
- [ ] A policy cancelled that morning blocks the send.
- [ ] Zero wrong-recipient sends.

### Phase 4: The Safe Book (maps to Handoff §7 Phase 2)

**Goal.** The rest of the safe plays plus non-email intake.

**Plays.**

- Non-pay / cancellation detection with the Florida statutory day-count clock (detect Tier 1, save gated).
- Open-file / open-quote nudges.
- Endorsement REQUEST capture (submit is human).
- Producer licensing / CE plus carrier-appointment expiry alerts.
- Coverage-gap round-out (`run-coverage-gap-detection` exists).

**Bot email + intake.**

- Voice / telephony (record, transcribe, AMS write-back) plus the CRM "Hand to bot" button. All normalize to `WorkRequest`, rendered identically in Slack and the cockpit.
- Note: Play 2 activity logging is OFF the critical path. Only if FL §934.03 two-party consent plus transcript redaction are cleared (Brian gate; handoff §9.6, §9.7).

**Definition of Done.**

- [ ] Non-pay fires with the correct FL clock and a gated save.
- [ ] A phone call funnels into a WorkRequest via the same intake.
- [ ] A licensing or appointment lapse alerts before expiry.

### Phase 5: No Handoff (maps to Handoff §7 Phase 3)

**Goal.** Proactive and self-improving.

**Plays + backbone.**

- Nightly heartbeat (`source='heartbeat'`, same pipeline plus a cron) pushes finished cards before anyone asks.
- Remarket / renewal packets split by line (auto first, HO lower), Tier 4 draft-only.
- Retention / renewal-risk lists (`run-retention-scoring` exists).
- The compile-from-corrections pipeline: FeedbackEvent to a weekly play-patch PR, golden fixtures gate CI (`src/floor/spine/fixtures/golden.ts`).
- The Landen to Kelli remarket lands HERE, end to end on live data through a card, Kelli-owned, writing a candidate playbook to the vault (`/lewis-vault/candidates`, project-state §4.2). This is the reconciled project-state §11 DoD.

**Definition of Done.**

- [ ] Unprompted cards land and get approved.
- [ ] An auto remarket packet assembles with the producer only picking the carrier.
- [ ] The Landen to Kelli remarket runs live through a card.
- [ ] One play patch ships through the compile pipeline with fixtures green.

### Phase 6: Commercial and The Shared Floor (maps to Handoff §7 Phase 4)

**Goal.** The moonshot surface.

**Plays + backbone.**

- Commercial COI reissue behind the in-force diff.
- Certificate-holder registry plus batch cancellation-correction cards.
- FNOL intake (needs a claims data model built first; Brian scope gate; handoff §9.8).
- Cross-sell red-flag remarket.
- Full earned-autonomy ramp (promotion / demotion logged; handoff §5).
- The shared-floor channel (`#floor` / `#wins`) mirroring every pending client-facing send, risk-colored, weighted to new hires for the second-opinion layer.

**Definition of Done.**

- [ ] A commercial COI reissues behind a passing in-force diff.
- [ ] A test cancellation drafts a correct correction card per affected holder and none for unaffected ones.
- [ ] A red-flag cert yields a remarket card.
- [ ] The shared floor catches a bad card before send.
- [ ] Autonomy promotes and demotes correctly.

---

## 7. Critical path and dependency graph

The backbone is split across phases on purpose. It is not one lump built up front.

| Backbone item | Phase | Why there |
|---|---|---|
| Apply migrations Spine A + D | Phase 0 | Every persisted card, approval, and in-force read needs the tables and the view first. |
| Deploy edge bridge + action endpoint | Phase 0 | The one endpoint all three surfaces call. Nothing routes without it. |
| Per-employee binding | Phase 1 | A card can't land "under a name" until `slack_user_id` and cockpit identity resolve. |
| Wire Approve to internal effects | Phase 1 | The fixture to live seam, safe half (no provider reachable). |
| Unify approval model + wire Approve to stageClientSend to provider | Phase 2 | The risky half. Needs the tables, the endpoint, and the Fence integration first. |

Dependency chain, from Brian's Phase-0 clearance through to the first live send:

```
Brian Phase-0 clearance (G0)
  -> create hermes_app role + confirm pg_trgm + PITR proof
  -> apply Spine D (in-force view) + Spine A (contract tables) on dev
  -> regenerate types + add Floor flags to .env.example
  -> deploy hermes-chat bridge + single Floor action endpoint (dev)
  -> resolve_account RPC + email-inbound-lite rewire (no live caller)
  ===================== Phase 0 done =====================
  -> per-employee binding (hermes.agents read view) + seed Tori (6/6)
  -> fixture->live seam: internal cards on Slack + cockpit onClick
  -> FeedbackEvent on every verb + Play 1 (in-force) + Play 3 (suspense)
  ============ Phase 1 done (no send path exists) ============
  -> unify approval model: stageClientSend writes floor_client_send_approvals
  -> releaseHeldClientSend mints floor_action: marker (service-role path)
  -> Fence consumes marker; FU-1 canopy-servicing folded under the Fence
  -> internal-only allowlist send: Floor -> Fence -> provider
  ============ Phase 2 done (internal-recipient locked) ============
  -> Brian first-live-send sign-off (G4) + allowlist flip per play (ID cards)
  -> in-force diff gate live
  -> FIRST LIVE CLIENT SEND
```

Two quiet blockers to call out now:

1. **resolve-account's fuzzy rung needs `pg_trgm` confirmed.** The trgm name rung (`resolveAccount.ts:80-86`) has no effect until `pg_trgm` is confirmed in the `extensions` schema on prod (handoff §9.1). If it isn't there, ship the `CREATE EXTENSION` migration first.
2. **The `floor_action:` mint path is service-role.** The release sweeper is a cron, not a user JWT, so it has no live session to satisfy the Fence's `approvedByUserId === userId` check (`clientSendApprovalGate.ts:202,233`). Extending approval minting to a Floor-origin path is a discrete Phase 2 task, not a one-liner.

---

## 8. Track unification (the single seam)

All three surfaces call ONE Floor action endpoint. The single fixture to live switch is the Approve handler behind it.

Today: Slack's Approve writes hermes-side only (`floorRuntime.ts:52-67`), the cockpit's Approve has no `onClick` (`FloorCockpitDrawer.tsx:243-254`), and email produces no package. When the endpoint persists `public.decision_packages` and `floor_client_send_approvals`, all three become thin renderers of the same rows.

**Warning: the cockpit must not become a third track.** Its Approve/Edit/Kill wiring is part of the Phase 1 seam, not a separate cockpit build. If someone wires the cockpit to its own approval path, that's the "two parallel models" disease again (Decision b). One endpoint, one package table, one approval table.

---

## 9. Brian sign-off gates

| Gate | What | When | Blocks |
|---|---|---|---|
| G0 | Phase-0 clearance: live source tables, PITR proof, dev-branch writes, `hermes_app` role, `pg_trgm`, bucket timing | Before any dev write | All dev write testing |
| G1 | Prod migration apply (Spine A + D + Fence), after dev soak | After Phase 0 soak | Prod persistence |
| G2 | Bucket-privacy flip, gated on portal signed-URL readiness | Before real doc buttons | Phase 3 doc buttons |
| G3 | Slack install + Pro billing (about $522/yr) before the trial ends (about July 25) + channel invites + AI OFF | Business gate, decoupled from build | Real-workspace Slack |
| G4 | First live client send: allowlist flip per play (ID cards first) | After Phase 2 | Phase 3 First Light |

`LEWIS_ALLOW_PROD_WRITES=true` only after G0 and G1 (project-state §4.4). G3 billing is a business gate decoupled from build progress; the audit trail lives in Supabase, so free-tier 90-day history loss is not data loss (project-state §9).

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Premature client contact | No send path exists in Phase 1; internal allowlist in Phase 2; a one-line Brian-gated flip in Phase 3 (G4); the two-layer R7 (Floor + Fence) always. |
| Two-parallel-models disease | Resolve all 4 decisions as ADRs in Phase 0; `public.*` canonical (Decision b); one action endpoint (the single seam, section 8). |
| Certifying coverage that no longer exists (E&O) | The in-force diff (`policy_in_force_status`) is a structural prerequisite of every Tier-3 send, never an "unchanged template" check (handoff §6, §8). |
| PII to a model (R9) | `redactPII` plus close FU-2 before the live-Hermes flip. The block-list in `hermes-chat` (`:24`) and `floorSafety.ts` is not redaction. |
| Ungated carrier send (FU-1) | `canopy-servicing` swept under the Fence in Phase 2. |
| Wrong-client resolution | The 0.9 bar forces a human pick below threshold (`resolveAccount.ts:97-100`); the `ensureProfileByEmail` fix resolves against the accounts graph before creating a profile (`email-inbound-lite/index.ts:36-82`). |
| Slack trial deadline | Decouple G3 (billing / install) from build. Internal cards and the whole spine build without the real workspace. |

---

## 11. First two weeks (exact ordered action list)

**Week 1.**

1. Brian G0 clearance.
2. Create `hermes_app` on dev.
3. Apply Spine A + D to dev and verify green.
4. Regenerate types + add Floor flags to `.env.example`.
5. Write and merge the 4 ADRs.
6. Build `policy_in_force_status` + Play 1 reconciliation read on dev, with tests.
7. Stand up the single Floor action endpoint (internal cards only, no send) on dev.

**Week 2.**

1. Per-employee binding + seed Tori (6/6) + cockpit per-user identity.
2. Fixture to live seam for internal cards (cockpit `onClick` + Slack live packages; prereq: fix `/floor invalid_arguments` + load launchd).
3. Ship Play 3 internal cards + FeedbackEvent on every verb.
4. Rewire `email-inbound-lite` resolveAccount-first to `mailSkillRouter` to `WorkRequest` (still no send).
5. Land `redactPII` on the bridge (close FU-2).
6. Demo to Brian (internal cards in under 5s on both surfaces, verbs logging, zero send path) and set the G3 date.

---

## 12. Definition of "finished"

The Floor is finished when each logged-in employee has their own named Hermes assistant that, across Slack and the InsureFlow cockpit, receives finished decision cards sourced from one spine, and can Approve a client-facing send that flows Floor to Fence to provider under their name with an undo hold and an in-force diff, with email, voice, and heartbeat all feeding the same WorkRequest pipeline.

Phases 0 through 3 deliver that end to end for ID cards. Phases 4 through 6 add breadth, proactivity, and commercial.
