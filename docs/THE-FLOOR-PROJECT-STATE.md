# The Floor — Project State & Context

> **What this file is.** A single source of truth for the build of "The Floor," the AI-run insurance office for Lewis Insurance. Read it at the start of any new session to pick up with full context. It captures the concept, the architecture, the binding rules, current build status, open blockers, and what "done" looks like. When something here changes, update this file so it stays the authoritative state.

> **Last updated:** June 2026. Owner: Brian "Speedy" Lewis.

---

## 1. What The Floor is

The Floor (also called the Lewis Insurance Agent Platform) is an AI-run office where six humans and six AI agents work as peers. Each human has their own agent. The agents do the labor; the humans hold judgment and the client relationship. **Nothing reaches a client without a named human's approval.**

The core inversion: agents do the running around, humans make the calls. The unit of work is the **client thread**, not the task. Work flows as finished decisions, not to-do items.

It runs on a dedicated office Mac Mini. Agents are Hermes Agent (Nous Research, v0.17.0+). Humans reach their agents through Slack (and Telegram is also wired as a channel).

### The seven mechanisms

1. **Client-thread primitive.** Work is organized around the client, not scattered tasks.
2. **The heartbeat.** A proactive book scan that surfaces renewals, rate jumps, non-pays, and missed audits before anyone asks.
3. **Do-the-work-first handoffs.** When work is passed to another agent, the receiving agent completes the legwork and presents a finished DECISION, not a task.
4. **Compounding office memory.** Playbooks accumulate in an Obsidian vault so the office gets smarter over time.
5. **Track work, never people.** No per-person stats or scoreboards. This protects adoption (see Kelli).
6. **Approval-before-send + audit trail.** Every client-facing action is gated and logged. This is the E&O defense.
7. **Peer second-opinion layer.** Catches new-producer mistakes before they ship.

Plus: a **morning tray** (batched decisions delivered once, not all-day pings) and **overnight prep** (work readied while the office is closed).

---

## 2. The three pieces

The office is three connected systems. Internally these are technical components; to staff they are described in plain terms (see the employee guide).

| Piece | What it is | Staff-facing name |
|---|---|---|
| System of record | The Supabase project where all client/policy/document data lives. Mature platform, ~128 Edge Functions. | **Insure Flow CRM** |
| Channel layer | Where humans talk to their agent and approve decisions. | **Slack** |
| The workers | Per-human Hermes agents that do the legwork and bring decisions. | **Your assistant / Hermes** |

**Naming note.** The Supabase project's technical name is **"Lewis Insurance App"** (ref `lrqajzwcmdwahnjyidgv`). Brian also brands the CRM/product layer **"Insure Flow CRM"** for staff-facing and product contexts. Both names point to the same system of record. Do not call it "jarvis-os" (see correction below).

---

## 3. People

| Person | Role | Notes |
|---|---|---|
| Brian "Speedy" Lewis | Owner / CEO / orchestrator | Runs the office. His agent is the orchestrator. |
| Letitia Lewis | Wife. Accountant / co-manager | Full system access. |
| Landen Lewis | Son. VP / manager. Succession heir | Vault curator. Working toward FL 2-20 license. |
| Kelli Lee | Producer. 22-year veteran | **The adoption hinge.** Treats the team as family. Her comfort with this determines rollout success. Track-work-not-people exists largely for her. |
| Jacob Soucinek | Producer. Commercial | Started 6/16/2026. |
| Tori Hill | CSR | New. |

Lewis Insurance: independent agency, Lake City FL, since 1981. "Since 1981" is a core trust signal across all output.

---

## 4. Architecture

### 4.1 CRITICAL CORRECTION — jarvis-os is NOT part of The Floor

**jarvis-os is Brian's separate, private Hermes agent project, on its own machine and database, unrelated to Lewis Insurance. It is NOT part of The Floor and must never be designed into it. The Floor is standalone.**

An earlier version of the build docs wrongly modeled a two-platform shared-database contract between The Floor and jarvis-os. That was corrected. The Floor's system of record is the Lewis Insurance App Supabase, standalone. There is no second platform sharing it. Do not reintroduce jarvis-os, a `jarvis` schema, or any cross-platform views.

This correction is applied and committed in the repo (commit `21f42f7`): the two-platform model, the `jarvis` schema, and cross-platform shared views were removed and replaced with a standalone design. `git grep jarvis` returns nothing.

### 4.2 Three-ring memory

| Ring | Store | Holds |
|---|---|---|
| Ring 0 | Supabase ("Lewis Insurance App" / Insure Flow CRM), `lrqajzwcmdwahnjyidgv`, Postgres 17, us-east-1 | System of record. Authoritative client/policy/document data. |
| Ring 1 | Git-versioned Obsidian vault `/lewis-vault` | Office playbooks. No PII. Landen curates. Candidate → canonical flow. |
| Ring 2 | Honcho | Per-agent personal/working memory. |

### 4.3 Standalone data contract

New Floor tables live in a `hermes` schema. The Floor reads existing app data through read-only views in that schema: `hermes.clients_v`, `hermes.policies_v`, `hermes.documents_v`, `hermes.carriers_v`, `hermes.commissions_v`. One least-privilege role, `hermes_app`, governs access. No cross-platform anything.

### 4.4 Key config / IDs

| Item | Value |
|---|---|
| Supabase project ref | `lrqajzwcmdwahnjyidgv` |
| Workspace ID | `f1f07037-3032-45f8-93ca-72c0f47e4fbb` |
| Dev branch (all write testing) | `klnygbbmognbslgobmzc` |
| Prod-write guard | `LEWIS_ALLOW_PROD_WRITES=true` (stays) |
| Webhooks adapter port | 8644 |
| Auth gate | matching email + `is_staff=true` + `status='active'` + active workspace membership |
| Repo (on Mac Mini) | `/Users/rocky/lewis-the-floor` |
| Slack team ID | `T0BDCRYKY7P` |

---

## 5. Binding domain rules (compliance lint R1–R9)

These are enforced as deterministic CODE, never model judgment. The agent runs every quote/action through this lint before a human ever sees it.

| # | Rule |
|---|---|
| R1 | Nationwide auto requires a SmartRide audit. |
| R2 | Trailers, RVs, motorcycles, fifth-wheels go on a separate specialty policy. Never flagged as auto gaps. |
| R3 | Auto-Owners "paid in full" on a dec page is marketing text, never a paid flag. |
| R4 | Bundle = Progressive Auto + any Florida HO carrier (not Progressive's own bundle metric). |
| R5 | Florida property is closed-market runoff. Excluded from active-line totals and from strategic-failure framing. |
| R6 | All staff see all clients. No per-rep client scoping. |
| R7 | No client send without a named human's approval. |
| R8 | No carrier-portal MFA or CAPTCHA circumvention. |
| R9 | PII passed by reference, never inside prompts. |

---

## 6. Carrier integration policy

**Sanctioned-first.** Use Canopy Connect, real carrier APIs, and Amwins/TUMI integrations. Carrier portals are human-in-the-loop only. Never circumvent MFA or CAPTCHA. Confirm any allowed automation in writing with territory managers: **Rick Crowley** (Nationwide Commercial/Specialty FL) and **Mark** (North FL).

---

## 7. Build status

### Done
- **Standalone correction** applied and committed (`21f42f7`). Tests: 27 passed, 1 skipped. Guardrails synced (9).
- **Phase 0 scaffolding built:**
  - 0.1 Storage remediation scaffold: signed-URL mint, 120s TTL, public-URL rejection. Bucket flip itself is BLOCKED pending approval.
  - 0.2 Data contract scaffold: read-only orientation, prod-write guard, degraded-mode queue. `hermes` schema + read-view migrations are staged, not applied. `0004_hermes_read_views.sql` is blocked pending confirmed live source tables.
  - 0.3 Controls: kill switch, budget hard-stops, circuit breaker.
  - 0.4 Compliance lint R1–R9 + 9 guardrail notes + sync checker.
- **Channel layer proven:** `ChannelAdapter` interface + `TelegramAdapter` renders a decision card with ✅ Approve / ✏️ Edit / 🛑 Kill inline buttons and a document as a signed-URL button (no bucket path leaked). `SlackAdapter` stub renders against the same interface.

### In progress (parallel)
Slack and the next roadmap phase are building at the same time, on **separate branches**, each with its own acceptance gate. They meet only at the fixture-to-live swap.

- **Slack workstream:** builds and tests against FIXTURE decision packages now, independent of the live-schema work. Adds `slack_user_id` to `hermes.agents`, the SlackAdapter, the manifest, and card code.
- **Schema workstream:** confirm live source table/column names, then fill `0004_hermes_read_views.sql` so the `hermes` read views read real `clients` / `policies` / `documents`. Finalizes `hermes_app` grants.

**Join point:** the fixture-to-live swap is a one-line source change at the very end (decision package comes from live views instead of the fixture). It needs both branches green. The no-PII failure-path tests (signed-URL mint failure, missing doc ref, partial thread; both Telegram and Slack) must be green so the live flip is low-drama.

---

## 8. Phase 0 blockers (current)

1. **Bucket flip.** Do NOT flip buckets private until the existing Lewis Insurance App / portal (lewisinsurance.ai) signed-URL readiness is proven and Brian approves. Internal dependency; Brian owns both sides.
2. **Confirm live source tables/columns** in the Lewis Insurance App Supabase before filling `0004_hermes_read_views.sql`. Read-only lookup. This is the key next step and also finalizes `hermes_app` grants.
3. **PITR.** Confirm point-in-time recovery is enabled (paid feature, not default), then record proof in `docs/ops/pitr-check.md`.
4. ~~jarvis-os DB role scope~~ — REMOVED. Replaced by creating the `hermes_app` least-privilege role.
5. **No live migrations or storage changes** applied until the above are cleared and approved.

---

## 9. Slack state

### Model decisions
- **One Slack app, "Lewis Floor."** Six agent identities via a Slack-user → agent binding (`slack_user_id` on `hermes.agents`, matched by email).
- **DM-per-agent is the work surface.** Channels are for visibility only.
- Per-agent card identity via username/icon (e.g. "Kelli's Agent"), never colliding with the human's name.
- **Socket Mode** (no public URL; ideal for the Mac Mini). Deploy under launchd, single instance.

### Channels
- Keep `#all-lewis-insurance`.
- `#floor` (private): orchestrator escalations and sweeper output.
- `#migration` (private): Auto-Owners → Nationwide/Progressive live count. Archive at zero.
- `#wins` (optional): outcomes only, NOT a scoreboard.
- Delete `#new-channel`. No per-client or per-carrier channels.
- Default-join channels: `#all-lewis-insurance` + `#floor` only.

### Open Slack items
- **Invite @Lewis Floor to `#floor`, `#migration`, `#wins`.** This only works AFTER the Floor app is built and installed. It does not exist in the workspace yet (the sidebar bot is Slack's built-in Slackbot, not the Floor app). Post-install checklist item.
- **Turn OFF Slack AI features** (Huddle notes, thread/channel summaries) in admin before any real client content flows. Repeatedly flagged; confirm it's done.
- **Billing.** Workspace is on a free trial through ~July 25. Decide on Pro (~$522/yr for 6 seats, $7.25/user/mo annual) before the trial ends. Free tier = 90-day history loss, but the audit trail lives in Supabase so no record is lost. Business+ is not needed given the architecture.

### Capability vs authority (resolved)
Maximize CAPABILITY everywhere (let the Floor app manage the workspace and channels, build an App Home dashboard tab, slash commands/shortcuts, two-way DM Q&A, aggressive earned-autonomy ramp). Gate AUTHORITY only on irreversible, client-facing, or regulated actions. Rule: **maximize everything reversible, gate everything irreversible.** The three lines that stay are authority structure, not capability limits: approve-before-send, PII off the chat surface, track-work-not-people.

---

## 10. Deliverables produced

A full build-handoff package was produced and downloaded (zip: `lewis-the-floor.zip`). Contents:
- `START-HERE.md` — unified system prompt for Claude Code: read the tree, produce `ROADMAP.md` + `CLAUDE.md`, STOP for sign-off, then build.
- `docs/00`–`docs/10` — vision/architecture, build roadmap, standalone data contract, storage security, agent roster/3-ring memory, handoff protocol, heartbeat/tray/sweeper, compliance lint, approval gates/earned autonomy, Obsidian vault, carrier policy.
- `docs/ARCHITECTURE-CORRECTION-001.md` — the authoritative jarvis-os removal.
- `docs/11-slack-channel.md` — full Slack buildout with code + SQL.
- `slack/manifest.yaml` + `slack/.env.example` — ready-to-install Slack app (team `T0BDCRYKY7P` prefilled).
- `agents/` — six soul/body/deed profiles (Brian, Letitia, Landen, Kelli, Jacob, Tori) + shared covenant + template. (Also `agent-profiles.zip`.)
- **Employee explainer:** `Lewis-Insurance-AI-Office-Team-Guide.md` — plain-language source for a NotebookLM video for staff.

---

## 11. Phase 1 — definition of done

**Authoritative sequencing:** `docs/THE-FLOOR-UNIFIED-ROADMAP.md`.

Phase 1 is **The Invisible Win**: internal, reversible decision cards on Slack and the cockpit. No send path exists anywhere. Plays 1 (carrier-download reconciliation) and 3 (suspense sweep) land here. Approve / Edit / Kill work and log FeedbackEvents. An internal card lands in under 5s under the correct human's name.

The **Landen to Kelli remarket** is **not** Phase 1. It lands in **unified roadmap Phase 5 (No Handoff)**. See ADR 003 (`docs/adr/003-floor-remarket-phase-placement.md`). When that runs end to end on live data through a card, Kelli-owned, with a candidate playbook written to `/lewis-vault/candidates`, Phase 5 remarket DoD is met.

---

## 12. How to work with Brian

- Direct, deliverables-first. Skip intros, recaps, and post-ambles. Lead with the answer or the artifact.
- Production-ready outputs, complete code, exact values and paths. No options menus; pick the best approach and execute.
- In Brian's own written voice: short sentences, contractions, no em or en dashes, no AI-sounding phrases. Sign-off: `Thanks, / Brian Lewis / Lewis Insurance / (386) 755-0050`.
- Always use the email-voice skill when writing or rewriting any email for Brian.
- Correct scope drift immediately and precisely. Don't carry forward wrong assumptions.

---

## 13. Handoff architecture (decided)

> Full spec: `docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md`. That doc is the baseline. This is the summary.

**The model.** One channel-agnostic INTAKE bus. Email, Slack-forward, CRM "Hand to bot" button, later voice, all normalize to a WorkRequest. Email is intake only, never the control surface. The CONTROL surface is a Slack card (Approve / Edit / Kill) with state, audit, and a real server-side undo hold. The bot never acts on the email body. Best handoff is eventually no handoff: a nightly book-scan heartbeat pushes finished cards before anyone asks. Reactive ships first to earn trust; proactive is the same pipeline with a cron trigger.

**Skills vs plays.** Model DECIDES (which play, fills fields), code EXECUTES (routes, gates, sends). Skills AUTHOR judgment in markdown. Plays EXECUTE as versioned, tested, PR-gated TypeScript. A markdown skill never sends.

**Primitives (grounded in the real schema).**
- **WorkRequest** — new work-lifecycle table; extends the automation platform, links back to `automation_requests`/`automation_event_outbox`. Adds play_id, source, sender_identity, client_ref, resolution_confidence, owner_id, decision_package_id (none exist today).
- **DecisionPackage / DecisionCard** — one typed schema, rendered once in Slack/Telegram/voice. Fields carry `locked`; the diff carries a red/yellow/green verdict.
- **Play** — versioned TS, Zod `required_inputs`, `capability_scope` (`can_send: false`, structural), golden fixtures gate CI. Emits a DecisionPackage, never sends.
- **ApprovalGate** — `stage_client_send()`, the ONLY path to the mail provider. Reads an approval row written by a different path. Recipient = account-of-record or approved holder, never a body-supplied "to:". A Postgres `UNIQUE(work_request_id)` row IS the invariant. No crypto tokens on one Mac Mini. Wraps the existing `send-coi-email` signature exactly.
- **Intake bus + MailSkillRouter** — deterministic, keys off sender metadata + SPF/DKIM/DMARC verdict + `inbound_allowlist` + `classify-document` output. Never the free body.
- **resolve-account** — new. Ladder: email-exact → `account_aliases` → reverse email-domain → pg_trgm fuzzy (`search_accounts`) → phone. Forwarded-envelope aware. Below the confidence bar the card forces a human pick, never auto-proceeds. Fixes the `ensureProfileByEmail` bug (blindly creates duplicate profiles today).
- **FeedbackEvent** — log every approve/edit/kill from day one. Raw material for the Phase 3 compile-from-corrections pipeline.

**Earned-autonomy ladder.** Tier 1 full-auto (log/status/snapshot) | Tier 2 auto+notify+undo (internal tasks, stale-cert alerts, renewal assembly) | Tier 3 one-tap approve (issue COI/ACORD 25, ID cards, endorsement REQUEST) | Tier 4 draft-only (quotes, remarkets, any coverage ADVICE = licensed act). Earned per play, per human, from clean approvals. Any policy/coverage/status change since last snapshot demotes to one-tap. A licensed human always owns coverage confirmation, binding, cancellation, advice. Every tier change logged for E&O.

**Guardrails as code.** R7 chokepoint (no send without a named human's approval row). R9 `redactPII` before any model call, PII rehydrated only inside the chokepoint post-approval (no PII vault needed for ACORD 25). Prompt-injection: routing off metadata not body; no extracted field becomes an instruction; SPF/DKIM/DMARC pass is a precondition to allowlist match. Coverage diff is core: diff demanded AI/WOS/limits vs actual policy forms, flag red; Edit LOCKS AI/WOS/limits (policy-derived, the #1 agency E&O mistake). Track delivery (sent != delivered; `failed_delivery`/bounced). Name the authorized rep of record on the cert.

**V1 = the spine + the first plays (COI is NOT first).** Mapping the whole agency day showed it's mostly phone, follow-up, and data entry, and Lewis is ~98% personal lines, so COI (a commercial transaction, under 2% of accounts) drops to Phase 4. Build the shared spine once: the WorkRequest/DecisionPackage/FeedbackEvent contract, the `stage_client_send()` chokepoint (closes R7 for ALL client-facing sends, not just certs), `resolve-account`, carrier-download reconciliation into a live `policy_in_force_status` view, `redactPII` before any model call, and the Slack DecisionCard with a held undo. Then ship the first plays in order: (1) carrier-download reconciliation (the in-force spine everything safe reads); (2) activity logging (transcribe/summarize into the AMS, auto-file low-risk) — BLOCKED on FL §934.03 two-party consent + `redactPII` on transcripts; (3) suspense/follow-up sweep (severity-ranked nudges to a named owner); (4) ID card / proof-of-insurance one-tap, the first client-facing send, gated on a live in-force+limits diff. Safety rule baked in: every Tier 3 send issues only behind an in-force+limits diff; "unchanged template" is never the check. Internal and invisible first, one safe client-facing send last. Full ranked backlog + phased roadmap in `docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md`. First client-facing owner (ID cards) is service (Tori/Landen); the Landen→Kelli remarket DoD lands in Phase 3; Kelli's clout on the red-flag remarket in Phase 4.

**The metric.** Time from a client's request to a correct, approved, delivered document, at zero handoff cost, with zero wrong-client and zero over-granted certs.
