# The Floor: Unified Roadmap

**Purpose.** The single build plan that finishes The Floor for Lewis Insurance — Spine + Hermes agents in the CRM cockpit + Slack + email — by collapsing all surfaces onto one spine, then turning on plays.

**Strategic north star:** [`docs/THE-FLOOR-VISION-AND-DIRECTION.md`](./THE-FLOOR-VISION-AND-DIRECTION.md) — vision, moats, adoption, play catalog detail, bold proposals. **This roadmap is the operational plan; the vision doc is the direction.** When they disagree on sequencing, **this doc wins** for build order; when they disagree on *why*, the vision doc wins.

**Owner:** Brian "Speedy" Lewis  
**Status:** active — aligned to vision doc 2026-07-01  
**Dev branch:** `klnygbbmognbslgobmzc`  
**Build branch:** `feat/floor-v1-spine`

**Supersedes** scattered phase notes. Consistent with [`docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md`](./THE-FLOOR-HANDOFF-ARCHITECTURE.md) (contracts) and [`docs/THE-FLOOR-PROJECT-STATE.md`](./THE-FLOOR-PROJECT-STATE.md) (living state). Locked ADRs in [`docs/adr/`](./adr/) — do not reopen without Brian.

### How to use this doc

1. Read **§1 Executive thesis** and **§2 Central reframe** once.
2. **§4 Decisions locked** is settled — raise forks with Brian, don't silently rebuild.
3. Build by **§8 Phases**. Know which phase you're in. Never pull a send path forward.
4. Real files/tables only. Unbuilt = **NEW** or **PROPOSED**.

---

## 1. Executive thesis

At full maturity, **judgment is the only scarce input** at Lewis Insurance. Six humans, six named Hermes agents. Every piece of work arrives as a **finished decision** under the right name, never as a to-do.

The product is not AI. The product is **the name on every send**, delivered at machine speed:

- **R7** makes it structurally impossible for paper to leave without a named human's approval row.
- The **in-force gate** makes it structurally impossible to certify coverage that died this morning.

The office **compounds**: every Edit and Kill becomes training data for versioned plays gated by golden fixtures; playbooks accrue in the vault; the **E&O defense file assembles itself** as a byproduct of the only path a send can take.

**One metric (north star):** time from client request to a **correct, approved, delivered** document — zero handoff cost, zero wrong-client.

**Finished in one sentence:** Any client request (email, phone, text, or heartbeat before they ask) becomes a card in the owner's tray in seconds; one tap sends under their name with a 30s undo. *"Insuring the community since 1981,"* at machine speed.

---

## 2. The central reframe

Three surfaces are not three systems. They are **three intake points and three renderers of ONE spine.**

```
intake (email / slack-forward / crm button / voice / heartbeat / sms)
  -> WorkRequest
  -> resolveAccount
  -> Play
  -> DecisionPackage
  -> stageClientSend (30s undo hold)
  -> Fence
  -> send
  -> FeedbackEvent
```

**Governing experience rule:** Within ten seconds, a human knows what their agent finished and whether to sign it. The Kelli Tuesday-morning story (handoff §2) is the acceptance test.

**Email, voice, and heartbeat are intake — never control.** An email can start work; only a card can approve it. Metadata-only routing; no body-supplied `to:` override.

**Parity without duplicated cognition.** One endpoint (`floor-action`), one `public.decision_packages` row, two renderers (Slack + cockpit). Neither surface computes risk or tier; they display what the play wrote.

Finishing The Floor = one persisted package row + one approval row, then plays. **The cockpit must never become a third approval track** (Decision b).

---

## 3. Vision stack (three horizons)

| Horizon | Phases | What changes |
|---|---|---|
| **First Light** | 0–3 (now) | Prove the spine: internal cards → send seam → first client send (ID cards). **Build status: Phases 0–2 done on dev; Phase 3 slices 1–4 shipped; G4 unsigned.** |
| **The office that starts first** | 4–5 | Safe book fills out; nightly heartbeat inverts work direction; morning tray; compile-from-corrections; remarket lands (ADR 003). Invisible tax collapses. |
| **The institution** | 6 | Commercial COI, holder registry, FNOL, red-flag remarket, earned-autonomy ramp, shared floor. Industry latent liability → Lewis-only service. |

Horizon 1 **proves** the rails. Horizons 2–3 add breadth and proactivity on proven rails — not parallel systems.

---

## 4. Experience pillars (one spine, three faces)

| Surface | Role | Status |
|---|---|---|
| **Slack** | Ambient work surface. DM-per-agent; channels = visibility only. App Home = tray. Cards = Approve/Edit/Kill + signed-URL doc buttons. | **Live on dev** against `public.decision_packages` (Phase 1). 6/6 DMs on dev soak. |
| **CRM cockpit** | Depth beside the client record. Same package row; `hermes-chat` bridge (ADR 004); verbs → `floor-action`. | Approve/Edit/Kill **wired**; refuses unpersisted practice packages. **Gaps (PROPOSED):** card inbox, hold countdown, per-agent identity ("Landen's Agent"), flag still OFF by default. |
| **Email / voice / SMS** | Intake adapters only. Normalize → WorkRequest. | Email router partially wired; voice/SMS **PROPOSED** Phase 4+. |

### Morning tray (PROPOSED — Phase 5)

Overnight heartbeat packages land `awaiting_approval`. At open, each agent posts **one tray DM**, ordered: (1) time-critical client-facing, (2) Tier-3 one-taps, (3) Tier-2 done with undo, (4) FYI reads. **Only two interrupt pings:** `failed_delivery` on client send; in-force demotion on an opened card.

### Six agents (persona targets)

| Person | Agent posture |
|---|---|
| **Brian** | Orchestrator, **never client approver**. Outcome digests + audit trail. PROPOSED: weekly Floor digest on CEO-digest rail. |
| **Letitia** | Same spine, money lens. Tray leads non-pay detections (Phase 4). |
| **Landen** | **Play 4 owner** (Brian 2026-07-01). Vault curator; 2-20 path. PROPOSED: expanded "why" panel on cards (lint + in-force diff as license study). |
| **Kelli** | **Adoption hinge.** "Kelli's Agent" — junior who did legwork, never grades her. Summaries = labor performed, not scores. |
| **Jacob** | New producer. Shared floor (Phase 6) built for him. PROPOSED: mirror Tier-3 cards to `#floor` until Phase 6 (OA-eligible; Brian batch review). |
| **Tori** | Binding deferred (5/6). PROPOSED: cockpit-first shadow week, then smallest tray (suspense nudges only). |

---

## 5. Current state snapshot (2026-07-01)

Ground truth. Update phase status docs when this drifts.

### Completed on dev

| Phase | Evidence |
|---|---|
| **0 Runway** | G0 signed; Spine A + D on dev; `floor-action`, `hermes-chat`; ADRs 001–004; [`THE-FLOOR-PHASE-0-STATUS.md`](./THE-FLOOR-PHASE-0-STATUS.md) |
| **1 Invisible Win** | Slack renders `public.decision_packages`; FeedbackEvents; internal plays; 6/6 DMs soak; [`THE-FLOOR-PHASE-1-STATUS.md`](./THE-FLOOR-PHASE-1-STATUS.md) |
| **2 Send Seam** | `stageClientSend` → hold → Fence mint → release; internal allowlist; [`THE-FLOOR-PHASE-2-SIGNOFF.md`](./THE-FLOOR-PHASE-2-SIGNOFF.md) |
| **3 (partial)** | Play 4 `id.card.issue`, asset pipeline, `send-id-card-email`, CRM intake; soak green through Fence; G4 unsigned; [`THE-FLOOR-PHASE-3-STATUS.md`](./THE-FLOOR-PHASE-3-STATUS.md) |

### Still open (honest gaps)

| Gap | Phase / gate | Notes |
|---|---|---|
| **FU-1** `canopy-servicing` ungated carrier send | Before G4 | Named Phase 2; **still open** — close before G4 conversation |
| Legacy prod send paths without Fence | Pull-forward pre-G1 | G0 sign-off flag |
| Dev `RESEND_API_KEY` placeholder | Ops | Provider step `failed_delivery` in soak |
| Tori 5/6 binding | Phase 1 spirit | Placeholder seed blocks 6/6 claim |
| G4 unsigned | Phase 3 | First live client ID card send |
| G1 prod migrations | Post dev soak | Prod dark |
| Cockpit card inbox / tray UX | PROPOSED | Chat drawer only today |
| R1–R5 lint on CRM-built cards | Phase 4+ | Mac Mini has full lint; CRM has R7 + R9 only |
| In-force **staleness ceiling** | PROPOSED | Brian fork — block Tier-3 if reconciliation stale |
| Live same-day cancellation block test | Phase 3 | Pass path dev-soaked; live test pending |

### Slack (`lewis-the-floor`)

- Socket Mode live on dev; canonical rows; stale-guard + dedupe.
- `/floor` App Home overflow **fixed** (3001-char limit).
- `hermes.decision_packages` → **delivery projection only** (Decision b); canonical = `public.*`.

### Repos

- **`insureflow-ops`:** CRM, spine (`src/floor/spine/`), edge functions (`floor-action`, `hermes-chat`, `send-id-card-email`, `floor-release-held-sends`, …).
- **`lewis-the-floor`:** Mac Mini Hermes runtime + Slack app (launchd).

---

## 6. Decisions (locked)

Do not re-litigate. See ADRs for detail.

| ID | Decision |
|---|---|
| **(a)** | **Two-layer R7:** Floor orchestration + Fence one-time consume at provider edge. `releaseHeldClientSend` sole producer of `floor_action:` markers. |
| **(b)** | **`public.*` canonical.** `hermes.*` = Slack delivery projection. One approval row or audit is meaningless. |
| **(c)** | **Landen→Kelli remarket = Phase 5**, not Phase 1. Kelli is adoption hinge; invert risk gradient. |
| **(d)** | **`hermes-chat` is the bridge.** Retire empty `hermes-proxy`. |

---

## 7. Conventions (fixed defaults)

Import from `src/floor/spine/constants.ts` — do not duplicate.

| Constant | Value | Meaning |
|---|---|---|
| `RESOLVE_ACCOUNT_AUTO_THRESHOLD` | **0.9** | At/above: auto-proceed. Below: force human identity pick. |
| `CLIENT_SEND_UNDO_HOLD_SECONDS` | **30** | Every Tier-3 send holds before provider. Kill cancels. |

**Play ID convention:** dotted IDs (`coi.issue`, `id.card.issue`). New plays in §9 use **PROPOSED** labels until shipped.

**Capability rule:** Every play emits a `DecisionPackage`; `capability_scope.can_send` is structurally false at the play layer — only the chokepoint sends.

---

## 8. The phases (0–6)

### Phase 0: Runway — ✅ complete on dev

**Goal.** Everything true before real cards or sends. Dev only; prod dark.

**Done:** G0, migrations, types, flags, ADRs, `floor-action`, `resolve_account`, FU-2 redaction, PITR proof. See Phase 0 status doc.

---

### Phase 1: The Invisible Win — ✅ complete on dev

**Goal.** Real internal cards on Slack + cockpit. **Zero send path.**

**Done:** Fixture→live seam (Slack + cockpit Approve/Edit/Kill); FeedbackEvents; Play 1 + Play 3; per-name delivery. Tori binding still deferred.

**DoD (remaining spirit item):** Seed Tori → 6/6 binding.

---

### Phase 2: The Send Seam — ✅ complete on dev

**Goal.** R7 path real; **internal allowlist only.**

**Done:** `stageClientSend` → hold → `releaseHeldClientSend` → Fence → provider; soak proven. **Exception:** FU-1 `canopy-servicing` **not yet** under Fence — **must close before G4.**

---

### Phase 3: First Light — 🟡 in progress (dev soak green, G4 open)

**Goal.** First **real client** send on lowest-risk personal-lines play: **ID card / proof-of-insurance.**

**Owner:** **Landen** (Brian 2026-07-01). All `id.card.issue` WorkRequests use Landen's `owner_id`.

**Shipped (slices 1–4):**

- ID card asset pipeline (`resolveIdCardAsset`, `portal_id_cards` populate)
- Play 4 module + in-force gate
- `send-id-card-email` (fenced surface)
- CRM intake via `floor-action` `create_internal_package`
- Dev soak: package → Approve → hold → release → Fence consume ✅

**Remaining before G4:**

- [ ] Restore dev `RESEND_API_KEY` (provider step green)
- [ ] **Close FU-1** (`canopy-servicing` under Fence)
- [ ] Live same-day cancellation block test
- [ ] Brian **G4 sign-off** (one page)
- [ ] Per-play allowlist flip: `id.card.issue` → client `account_of_record`
- [ ] G1 when targeting prod

**G2:** Resolved for Phase 3 dev — `portal-documents` private + 900s signed URLs; no bucket flip blocker.

**DoD:**

- [x] ID-card request → card in owner Slack/cockpit (dev allowlist)
- [x] Approve → hold → Fence (dev)
- [ ] Approve sends to **real client email** (G4)
- [ ] Policy cancelled same morning **blocks** send (live test)
- [ ] Zero wrong-recipient sends

---

### Phase 4: The Safe Book

**Goal.** Rest of safe plays + non-email intake. **No new approval track.**

Runs off reconciliation cycle + crons until Phase 5 heartbeat absorbs detectors.

| Play (PROPOSED `play_id`) | Tier | Default owner | Reuses |
|---|---|---|---|
| `nonpay.cancel.watch` — FL statutory day-count clock | 1 detect / 2 card; save gated | Tori | Spine D, Canopy monitoring, renewals |
| `open.item.nudge` — open file / open quote | 2 | Named owner; Kelli default on PL quotes | Play 3 machinery, tasks, quotes |
| `endorsement.request.capture` | 2 capture; 3 client ack; carrier submit **human** | Tori | Intake bus; chokepoint for ack only |
| `license.appointment.watch` | 1 cron | Letitia | Appointment / CE tables |
| `coverage.gap.roundout` | 2 list; outreach draft Tier 4 | Kelli | `run-coverage-gap-detection` (exists) |
| `lienholder.proof.send` *(PROPOSED)* | 3 | Tori | Play 4 shape; **requires Brian:** widen `recipient_basis` beyond account/holder |
| `payment.posting.confirm` *(PROPOSED)* | 2 internal / 3 client reply | Tori (+ Letitia books) | Payments + `policy_in_force_status` |

**Intake (not plays):**

- **CRM Hand-to-bot button** — before recorded call transcription (no FL §934.03 burden on button).
- **Voice** — behind FL §934.03 consent + transcript redaction (Brian gate).
- **SMS intake** *(PROPOSED bold #1)* — `"text us for your ID card"` → WorkRequest → Play 4; delivery via email of record; Phase 4 alongside email ID route decision.

**Lint:** R1–R5 must run where CRM builds cards (R2 trailers/RVs, R4 bundle definition, R5 closed-market FL property). FL day counts = **deterministic code**, not model — counsel confirms counts (Brian item).

**DoD:**

- [ ] Non-pay fires with correct FL clock + gated save
- [ ] Hand-to-bot → WorkRequest → card on Slack + cockpit
- [ ] Licensing/appointment lapse alerts before expiry
- [ ] Coverage gap card respects R1–R5 framing

---

### Phase 5: No Handoff

**Goal.** Proactive office + self-improving plays. **Work done before humans ask.**

| Play (PROPOSED `play_id`) | Tier | Owner | Reuses |
|---|---|---|---|
| `heartbeat.book.scan` | 1 fan-out | n/a | Full pipeline; `source='heartbeat'`; absorbs Phase 4 detectors |
| `remarket.packet.auto` / `.home` | 4 draft-only | Kelli | In-force, coverage diff, renewal risk, ACORD |
| `retention.save.list` | 2 | Kelli | `run-retention-scoring` (exists) |
| `play.patch.compile` | 1 → PR human merges | Landen (vault) | FeedbackEvents, golden fixtures |
| `household.cluster.roundout` *(PROPOSED)* | 2 list / 4 advice | Kelli | `account_relationships`, gap engine |

**Landen→Kelli remarket lands HERE** (ADR 003). R1 on remarket packets (e.g. Nationwide SmartRide flag).

**Morning tray** ships with heartbeat (§4).

**DoD:**

- [ ] Unprompted cards land and get approved
- [ ] Auto remarket packet: producer picks carrier only (Tier 4)
- [ ] Landen→Kelli remarket live through a card
- [ ] One play patch via compile pipeline; fixtures green

---

### Phase 6: Commercial & The Shared Floor

**Goal.** Moonshot surface — moats 4–5, institution layer.

| Play (PROPOSED `play_id`) | Tier | Owner | Reuses |
|---|---|---|---|
| `coi.reissue.commercial` | 3 + in-force diff | Jacob | `send-coi-email`, ACORD 25, coverage diff |
| `holder.cancel.correct` | 3 one card per affected holder | Jacob | Registry, chokepoint, COI history |
| `holder.registry.backfill` *(PROPOSED)* | 1 one-time seed | n/a | Historical `certificates_of_insurance` |
| `fnol.capture` | 2 internal / 3 client ack | Tori / Jacob | Intake bus; **blocked:** claims data model (Brian) |
| `redflag.remarket` | 4 | Kelli | Red coverage diff → cross-sell |

**Shared floor:** `#floor` mirrors pending client-facing sends, risk-colored, weighted to new hires (Jacob, Tori). Peer second opinion — **reviews sends, never people** (mechanism 5).

**Earned-autonomy ramp:** promotion/demotion logged per play per human; tier-change ledger joins E&O trail.

**DoD:**

- [ ] Commercial COI behind passing in-force diff
- [ ] Cancellation → correction card per affected holder only
- [ ] Red-flag cert → remarket card
- [ ] Shared floor catches bad card pre-send
- [ ] Autonomy promotes/demotes with audit log

---

## 9. Moat map (build ↔ status)

| # | Moat | Real when | Today |
|---|---|---|---|
| 1 | In-force gate at issuance | Phase 3 | Built; dev soak pass; G4 unsigned |
| 2 | Self-assembling E&O defense file | Phases 2–3 | Chain through Fence consume; tier log Phase 6 |
| 3 | Compile-from-corrections + vault | Phase 5 | FeedbackEvents on dev; compiler PROPOSED |
| 4 | Certificate-holder registry | Phase 6 | PROPOSED |
| 5 | Shared-floor second opinion | Phase 6 | PROPOSED |
| 6 | Client-thread memory | Phases 1–5 | Identity graph live; thread UX PROPOSED |

---

## 10. Adoption, trust, and rollout

### Three stories (never violate)

| Audience | Say | Never say |
|---|---|---|
| **Staff** | Your assistant runs; you decide. Your name on every send. Track work, not people. | "AI decided," productivity rankings, monitoring |
| **Clients** | Same people, faster. Named human reviewed this. "Since 1981." | "AI-powered," "automated," "chatbot" |
| **Carriers** | Named accountable approver on every touch; logged; verify in force at issuance. Confirm automation in writing with Rick/Mark first. | "Autonomous," portal circumvention (R8) |

### Kelli hinge — architecture answers

| Trust break | Spine answer |
|---|---|
| Wrong doc under her name | R7 × 2 (Floor + Fence); 30s undo; recipient = on-file only; 0.9 pick bar |
| Surveillance | No per-person stats; R6; #wins outcomes only |
| Alert fatigue | Morning tray (Ph 5); Play 3 severity gate today |
| Corrected by machine | Edit → FeedbackEvent → compile learns from her |
| Replacement anxiety | Binding/advice never delegated; red-flag uses her clout; shared floor helps juniors |

### Rollout order (risk gradient)

1. **Phase 1:** All six — internal only, zero client risk.
2. **Landen first on client-facing** (Play 4 owner) — succession heir; family before hinge.
3. **Tori** — internal when bound; cockpit shadow first.
4. **Jacob** — shared floor protection; commercial Phase 6.
5. **Kelli last on client-facing stakes**; remarket Phase 5 by design.

**Brian never approves client-facing** — avoids owner-approval theater.

### First-incident protocol (PROPOSED)

Producer calls client (relationship owner). Brian reviews **the play**, not the person. Failure → golden fixture. Language: **"the play failed,"** never "Kelli approved a bad card."

### Rejected: producer leaderboards

Track-work-not-people is mechanism 5. **Reject** person-ranked leaderboards.

**Substitute (PROPOSED):** `play.health.board` — per-play metrics (approval/edit/kill rates, time-to-approved) feeding compile pipeline. **Never per-person rankings.**

---

## 11. Metrics (PROPOSED — Floor Health panel)

**Aggregated by play + play_version only. Never by person.**

| Gauge | Why |
|---|---|
| Intake-to-card latency p50/p95 | DoD < 5s |
| Card-to-approve latency | Card quality signal |
| Undo/kill rate in hold | Flinch rate; hold earns its 30s |
| In-force blocks | Prevented E&O — count forever |
| Edit rate per play_version | Compile fuel |
| Resolve auto-proceed rate | Identity graph health (bar stays 0.9) |
| Suspense aging burn-down | Invisible tax visible |
| Heartbeat coverage (Ph 5) | % book scanned nightly |

**Anti-metrics (forbidden UI):** per-person approval counts, speed rankings, "Kelli 40 / Tori 12."

**Zero-tolerance metrics:** wrong-client sends, over-granted certs — any nonzero = incident, not trendline.

---

## 12. Critical path

```
G0 ✅ → Spine D + A on dev ✅
  → floor-action + Slack live packages ✅
  → Phase 2 send seam + allowlist ✅
  → Phase 3 Play 4 + send-id-card-email ✅ (dev soak)
  → CLOSE FU-1 + restore RESEND_API_KEY
  → G4 sign-off → first live client ID card
  → G1 prod (when ready)
  → Phase 4 safe book
  → Phase 5 heartbeat + compile + remarket
  → Phase 6 commercial + registry + shared floor
```

| Backbone item | Phase | Status |
|---|---|---|
| Migrations Spine A + D | 0 | ✅ dev |
| Floor action endpoint | 0–1 | ✅ dev |
| Fixture→live seam | 1 | ✅ Slack; cockpit partial UX |
| stageClientSend → Fence | 2 | ✅ dev |
| Play 4 + in-force | 3 | ✅ dev soak |
| FU-1 canopy under Fence | 2 / pre-G4 | ⬜ **OPEN** |
| G4 client allowlist | 3 | ⬜ |

---

## 13. Track unification (single seam)

**One endpoint:** `floor-action`. **One package table:** `public.decision_packages`. **One approval table:** `floor_client_send_approvals`.

Slack = delivery projection over canonical rows. Cockpit = same row beside client record. **Warning stands:** cockpit Approve must call `floor-action`, not a local path.

---

## 14. Brian sign-off gates

| Gate | What | Status |
|---|---|---|
| **G0** | Dev writes, PITR, pg_trgm, hermes_app | ✅ signed 2026-07-01 |
| **G1** | Prod migrations after dev soak | ⏳ open |
| **G2** | Bucket privacy / signed URLs | ✅ resolved for portal path (dev); legacy audit → prod hardening |
| **G3** | Slack Pro billing (~July 25 trial) | ⏳ business gate |
| **G4** | First live client send per play (ID cards first) | ⏳ open |

Operating authority: [`docs/THE-FLOOR-OPERATING-AUTHORITY.md`](./THE-FLOOR-OPERATING-AUTHORITY.md) — reversible work proceeds; only three hard stops (client reach, raw PII, irreversible prod).

---

## 15. Risks and guardrails

### In spine (with status)

| Risk | Mitigation | Status |
|---|---|---|
| Wrong-client send | 0.9 bar; identity ladder; R7 recipient match | Built dev |
| Dead coverage certified | In-force gate build + stage | Built; live cancel test pending |
| Prompt injection | Metadata routing; card-only approve | Designed |
| Hallucinated limits | Locked fields; deterministic diff | Spec + card handler |
| PII to model (R9) | redactPII on bridge (FU-2) | Closed |
| Premature client contact | Ph1 no send; Ph2 allowlist; G4 flip | Enforced |
| Mac Mini failure | Truth in Supabase; Mini = renderer | Structural |

### Open gaps

1. **FU-1** — `canopy-servicing` ungated (**before G4**)
2. **Legacy prod send paths** without Fence token
3. **In-force staleness ceiling** (Brian fork — PROPOSED)
4. **Audit-trail-as-scoreboard drift** — governance: never render per-person aggregates (PROPOSED rule)
5. **Approval habituation** — promotion requires sampled-outcome cleanliness, not streak length (PROPOSED)

---

## 16. Bold proposals backlog (PROPOSED — none shipped)

Ride existing spine only. See vision doc §8 for detail.

| # | Proposal | Earliest slot |
|---|---|---|
| 1 | SMS intake → Play 4 | Phase 4 |
| 2 | E&O Defense File one-click export | Post Phase 3 |
| 3 | Renewal delta cards (prior-term snapshot) | Phase 5 |
| 4 | Landen 2-20 case file digest | Post Phase 5 |
| 5 | Carrier brief (Rick/Mark) before G4 | Pre-G4 comms |

**Rejected:** holder registry as annual marketing touch (approval fatigue risk).

---

## 17. Open questions for Brian (genuine forks)

1. **Third-party recipients?** `lienholder.proof.send` needs new `recipient_basis` — approve or play family blocked.
2. **Never-automate list?** Non-pay warnings, claim outcomes, death/divorce/estate outreach — human-composed forever?
3. **In-force staleness ceiling?** Hard-block Tier-3 when reconciliation stale — what threshold?
4. **Client disclosure posture?** Name the assistant layer publicly or stay silent?
5. **E&O carrier presentation?** Audit trail at renewal for premium vs litigation-only?

---

## 18. Definition of "finished"

The Floor is finished when each employee has a **named Hermes assistant** that, across Slack and the InsureFlow cockpit, receives finished decision cards from **one spine**, and can Approve a client-facing send flowing **Floor → Fence → provider** under their name with undo hold and in-force diff — with email, voice, SMS, and heartbeat all feeding the same WorkRequest pipeline.

**Phases 0–3** deliver end-to-end proof for **ID cards**. **Phases 4–6** add the safe book, proactive office, and institution moats.

**Compounding finish line:** the office improves its own plays from its own corrections; the E&O file writes itself; wrong-client sends and false certs stay at **zero** by architecture, not policy.

---

## References

| Doc | Role |
|---|---|
| [`THE-FLOOR-VISION-AND-DIRECTION.md`](./THE-FLOOR-VISION-AND-DIRECTION.md) | Strategic north star (this roadmap's direction) |
| [`THE-FLOOR-HANDOFF-ARCHITECTURE.md`](./THE-FLOOR-HANDOFF-ARCHITECTURE.md) | Contracts, Spine A–F, plays spec |
| [`THE-FLOOR-PROJECT-STATE.md`](./THE-FLOOR-PROJECT-STATE.md) | People, blockers, session context |
| [`THE-FLOOR-OPERATING-AUTHORITY.md`](./THE-FLOOR-OPERATING-AUTHORITY.md) | Delegation + hard stops |
| [`THE-FLOOR-PHASE-*-STATUS.md`](./) | Phase trackers |
| [`docs/adr/001`–`004`](./adr/) | Locked architecture decisions |
