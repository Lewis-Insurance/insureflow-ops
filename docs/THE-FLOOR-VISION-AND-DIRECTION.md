# The Floor: Vision and Direction

**Prepared:** 2026-07-01  
**Canonical path:** `docs/THE-FLOOR-VISION-AND-DIRECTION.md`  
**Operational plan:** [`docs/THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md) (aligned 2026-07-01)  
**Discipline:** every existence claim below is grounded in the canonical doc stack. Anything unbuilt is labeled PROPOSED. Locked decisions are not reopened; anything that touches one says "would require Brian."

---

## 1. Executive thesis

At full maturity, The Floor makes judgment the only scarce input at Lewis Insurance. Six humans, six named Hermes agents. Every piece of work arrives as a finished decision under the right name, never as a to-do. The product is not AI. The product is the name on every send, delivered at machine speed: R7 makes it structurally impossible for paper to leave the building without a named human's approval row, and the in-force gate makes it structurally impossible to certify coverage that died this morning.

The office compounds. Every Edit and Kill becomes training data for versioned plays gated by golden fixtures. Playbooks accrue in the vault. The E&O defense file assembles itself as a byproduct of the only path a send can take. What a competitor would have to copy is not a model, it is a spine: one pipeline, one approval row, one metric (time from request to a correct, approved, delivered document, zero handoff cost, zero wrong-client).

Finished means: any client request, by email, phone, text, or before they ask via the nightly heartbeat, becomes a card in the owner's tray in seconds. One tap sends it under their name with a 30 second undo. "Insuring the community since 1981," at machine speed.

---

## 2. Vision stack: three horizons

### Horizon 1: First Light (now through Phase 3, the proof)

Where the build actually is (Phase 3 status, 2026-07-01): Phases 0-2 are done on dev with signed one-pagers. The Slack canonical seam shipped in Phase 1 (Slack now renders `public.decision_packages` rows and writes `public.feedback_events`, 6/6 DMs on dev soak). Phase 3 slices 1-4 are shipped: the Play 4 `id.card.issue` module, the ID card asset pipeline, the new fenced `send-id-card-email` surface, CRM intake through `floor-action`. The full chain (CRM button, Tier-3 package, Approve, 30s hold, release, Fence consume) is soak-green on dev; the provider step reads `failed_delivery` only because the dev `RESEND_API_KEY` is a placeholder. G4 is unsigned. Landen owns Play 4.

What this horizon proves: a client request becomes a named, gated, undoable send in seconds, on the highest-volume, lowest-risk paper in a 98 percent personal-lines book. Everything after is breadth and proactivity on rails already proven.

### Horizon 2: The office that starts first (Phases 4-5)

Phase 4 fills the safe book: non-pay and cancellation detection off the carrier download with the Florida statutory day-count clock, open-file and open-quote nudges, endorsement REQUEST capture, licensing and appointment expiry alerts, coverage-gap round-out (the engine already exists in the CRM), voice intake behind the FL sec 934.03 consent gate. Phase 5 inverts the direction of work: the nightly heartbeat pushes finished cards before anyone asks, remarket and renewal packets assemble as Tier 4 drafts, retention lists ride the existing scoring engine, and the compile-from-corrections pipeline turns FeedbackEvents into weekly play patches a human merges. The Landen to Kelli remarket lands here (ADR 003), Kelli-owned, writing a candidate playbook to the vault.

The felt change: the morning tray replaces the inbox. Work is done before the office opens. The invisible tax (logging, chasing, follow-up) measurably collapses, and the office starts improving its own plays from its own corrections.

### Horizon 3: The institution (Phase 6)

Commercial COI behind the same in-force diff. The certificate-holder registry: The Floor remembers every holder it ever told a policy was active, and on cancellation it drafts one correction card per affected holder, none for unaffected ones. FNOL intake once a claims data model exists. The red-flag remarket, where a holder demand the policy cannot back becomes a cross-sell card with Kelli's clout on the follow-up. The full earned-autonomy ramp, promotion and demotion logged per play per human. The shared floor: a channel mirroring every pending client-facing send, risk-colored, weighted to new hires, so any of the six can catch a bad card before it ships.

This is where The Floor stops being tooling and becomes an institution: the industry's worst latent liability converted into a Lewis-only service, peer review at machine speed, autonomy earned and audited, and a book that runs like it is 1981 with six extra sets of hands that never sleep.

---

## 3. Experience pillars: one spine, three faces

The governing pillar: within ten seconds of looking, a human knows what their agent finished and whether to sign it. The Kelli Tuesday-morning story in the handoff architecture section 2 is the acceptance test for the whole experience layer.

**Slack is ambient.** DM-per-agent is the work surface; channels are visibility only. The card is Approve / Edit / Kill with lint lines and signed-URL doc buttons, never a bucket path. App Home is the tray view. This surface is live on dev against canonical rows (Phase 1 status).

**The cockpit is depth.** The same `public.decision_packages` row rendered beside the client record, chat through the `hermes-chat` bridge (ADR 004), verbs wired to `floor-action`. Honest gap: today it is a chat drawer that renders one package at a time. Approve/Edit/Kill are genuinely wired and correctly refuse unpersisted practice packages, but there is no card inbox, no held-undo countdown rendering, no per-agent identity presentation ("Landen's Agent"), and the flag defaults OFF. Roughly half the daily-feel choreography described here is still PROPOSED.

**Email, voice, and heartbeat are intake, never control.** An email can start work. Only a card can approve it. This is principle 2 of the architecture and it never bends, because it is the structural answer to prompt injection: the router keys off metadata and auth verdicts, and no body-supplied "to:" can ever override the on-file recipient.

**Parity without duplicated cognition.** One endpoint (`floor-action`), one package row, two renderers. Neither surface computes risk, diff, or tier; they display what the play wrote. One canonical row means a card cannot be decided twice by design (ADR 002); the Slack-side revision stale-guard enforces this today, and full cross-surface invalidation rides the projection sync. The warning stands: the cockpit must never become a third approval track.

**The morning tray, concretely (PROPOSED choreography; tray blocks exist as code, the scheduler and heartbeat are Phase 5).** Overnight, heartbeat-built packages land as awaiting_approval. At office open, each agent posts one tray DM, ordered: (1) time-critical client-facing items, (2) Tier-3 one-taps ready to sign, (3) Tier-2 work already done with undo windows, (4) FYI reads. Between tray and close, only two things ping: a `failed_delivery` on a client-facing send, and an in-force demotion on a card already opened. Never pings: Tier-1 completions, metrics, anything about a colleague's throughput.

**Six humans, six distinct agents (persona work is PROPOSED except where cited):**

| Person | What their agent should feel like |
|---|---|
| Brian | The orchestrator who is never an approver. Per the Operating Authority his surface is outcome digests and an audit trail, never permission requests. PROPOSED: a weekly Floor outcome digest riding the existing weekly-ceo-digest rail. |
| Letitia | Same spine, money lens. PROPOSED: her tray leads with non-pay detections (Phase 4) and payment discrepancies, as an owner-and-play filter over the same rows, never a separate pipeline. |
| Landen | Play 4 owner (Brian, 2026-07-01) and vault curator, working toward his FL 2-20. Every ID card sends under his name. PROPOSED: his cards render an expanded "why" panel (lint rule cited, in-force diff shown, one plain-language coverage note) so each approval doubles as license study. |
| Kelli | The adoption hinge. Her surface already says "Kelli's Agent." It must always read as a junior assistant who did the legwork, never a system that grades her. PROPOSED: card summaries phrase agent work as labor performed ("pulled the dec page, verified in force, drafted the email"), never as scores or recommendation strength. |
| Jacob | Two weeks in. Cards render lint results inline today; the shared floor (Phase 6) is built for exactly him. PROPOSED: until Phase 6, mirror his Tier-3 cards into #floor by default. Note: this pulls Phase 6 shared-floor scope forward; reversible and internal, so OA-eligible, but it belongs in Brian's periodic review batch. |
| Tori | Binding deferred (placeholder seed refuses to apply until replaced). PROPOSED day one: cockpit-first. She shadows live cards read-only for a week (cockpit needs only workspace membership, no Slack binding), then her binding is seeded and her DM opens with the smallest tray on the floor: suspense nudges only. |

---

## 4. Moat map

The test for each: could a competitor copy it by buying software, or does copying require rebuilding the spine and re-living Lewis's history? Honesty column included; a moat that is a promise is stated as one.

| # | Moat | Becomes real | Status today |
|---|---|---|---|
| 1 | In-force gate at issuance | Phase 3 | Built and dev-soaked on the pass path; live same-day-cancellation block test pending; G4 unsigned |
| 2 | Self-assembling E&O defense file | Phases 2-3 | Chain proven on dev through Fence consume; tier-change log joins in Phase 6 |
| 3 | Compile-from-corrections plus the vault | Phase 5 | FeedbackEvents log on dev (prod is G1-gated); the compiler is a promise |
| 4 | Certificate-holder registry | Phase 6 | Promise only |
| 5 | Shared-floor second opinion | Phase 6 | Promise only |
| 6 | Client-thread compounding memory | Phases 1-5 | Ring 0 and the identity graph live in the CRM; decision-card surfaces shipped on dev; thread UX is a promise |

**1. The in-force gate.** Every Tier-3 send reads `policy_in_force_status` at approval time; "unchanged template" is never the check. A generic AI email tool drafts faster; it cannot decline to certify, because it has no live in-force view and no chokepoint wired to it. Copying this means rebuilding carrier-download reconciliation, the view, and the Fence, in that order. It deletes the textbook E&O loss (certifying dead coverage) on every dev-soak ID card today and on every client ID card the moment G4 signs, and on every COI later.

**2. The E&O defense file.** Every send leaves a chain no one had to remember to write: the decision package, the named approval row with the 30 second hold, the work-request state trail, FeedbackEvents on every verb, the Fence's content-hashed one-time consume, and, once the Phase 6 ramp lands, logged tier changes. Uncopyable because the trail is a byproduct of the only path a send can take, not a compliance module staff must fill in.

**3. Compile-from-corrections plus the vault.** The pipeline is copyable. The corpus is not: corrections from six named humans on Lewis's own book, including Kelli's 22 years, compounding into versioned plays that cannot regress because fixtures gate CI. Every week of operation widens the gap; a later entrant starts at zero corrections. PROPOSED, Brian item (succession planning): treat the play library plus fixture corpus as an appraisable agency asset in Landen's succession.

**4. The holder registry.** Only buildable if every cert already exits through one chokepoint. Competitors' certs leave through personal outboxes and vanish. Honest framing: commercial is under 2 percent of the book, so this is positioning, not volume. It is also the single best story Lewis will ever tell a commercial prospect.

**5. The shared floor.** In a normal agency a second opinion costs an interruption. Here, review is a free projection of rows that already exist, riding R6 and track-work-not-people: it reviews sends, never people. Kelli's judgment protecting Jacob and Tori without a scoreboard.

**6. Client-thread memory.** Three rings over an identity graph that already handles aliases, fuzzy match, and merge survivorship, with the 0.9 floor forcing a human pick below confidence. Forty-five years of book data joined to a live identity graph is accumulated position, not a feature. Zero wrong-client sends is the metric's hardest clause, and this is the only way to buy it.

---

## 5. Play and agent catalog, Phases 4-6

Every play rides the one spine and emits a DecisionPackage, never sends: `capability_scope.can_send` is structurally false. Play IDs follow the shipped dotted convention (`id.card.issue`, `coi.issue` exist); all other IDs, tiers, and owner assignments below are PROPOSED labels on documented plays. Owners are default approval owners, never client scoping (R6: all staff see all clients).

### Phase 4: The Safe Book

| Play | play_id (PROPOSED) | Tier | Owner | Rides / reuses |
|---|---|---|---|---|
| Non-pay / cancellation detection, FL statutory day-count clock | `nonpay.cancel.watch` | 1 detect, 2 card, save gated | Tori | Carrier-download reconciliation cycle (Spine D); Canopy monitoring; renewals system |
| Open-file / open-quote nudges | `open.item.nudge` | 2 | Named file owner; Kelli default on personal-lines quotes | Suspense-sweep machinery; tasks, quotes, renewals |
| Endorsement REQUEST capture, track to confirmation | `endorsement.request.capture` | 2 capture, 3 client acknowledgment; carrier submit stays human (roadmap: "submit is human") | Tori | resolveAccount, intake bus; chokepoint for the acknowledgment only |
| Producer licensing / CE and appointment expiry | `license.appointment.watch` | 1, plain cron | Letitia | The "near-free cron guarding a catastrophic risk" |
| Coverage-gap round-out | `coverage.gap.roundout` | 2 list card; any outreach draft is Tier 4 | Kelli | `run-coverage-gap-detection` (exists) |

Notes held to the docs: the day counts will come from the Florida statute and be encoded as deterministic code alongside the R1-R9 lint, never model judgment (PROPOSED, Brian item: have counsel confirm the exact day counts before build). The Phase 5 heartbeat later absorbs these detectors; in Phase 4 they run off the reconciliation cycle and plain crons. The gap round-out runs the lint before any card renders: R2 never flags trailers or RVs as auto gaps, R4 defines bundle as Progressive Auto plus any Florida HO carrier, R5 keeps closed-market Florida property out of the framing. Voice and the CRM Hand-to-bot button are intake adapters, not plays; recording stays off the critical path until the FL sec 934.03 consent mechanism and transcript redaction clear Brian's gate. PROPOSED ordering: the Hand-to-bot button lands ahead of recorded-call transcription, since it carries no consent burden.

Two PROPOSED Phase 4 additions, both passing the play-selection test:

- **PROPOSED `lienholder.proof.send`** (Tier 3, owner Tori). A mortgagee or lienholder requests evidence of insurance at escrow or loan renewal. Same shape as Play 4, but the recipient is a third party. Likely the highest-volume third-party paper request in a personal-lines book (PROPOSED assumption, verify against service-call volume). Requires widening `SendSpec.recipient_basis` beyond `account_of_record` and `approved_holder`, which is Brian's call because it changes who The Floor may ever address.
- **PROPOSED `payment.posting.confirm`** (Tier 2 internal read, Tier 3 client reply; Tori, with Letitia on the books side). "Did my payment post, am I still covered" resolves against payments records plus `policy_in_force_status` and lands as a one-line card. Targets one of the most common service calls in the building (PROPOSED assumption, verify).

### Phase 5: No Handoff

| Play | play_id (PROPOSED) | Tier | Owner | Rides / reuses |
|---|---|---|---|---|
| Nightly heartbeat book scan | `heartbeat.book.scan` | 1; fans cards to named owners, `source='heartbeat'` | n/a (fan-out) | The whole pipeline plus cron; all Phase 4 detectors |
| Remarket / renewal packets by line (auto first, HO lower) | `remarket.packet.auto`, `remarket.packet.home` | 4 draft-only | Kelli | resolveAccount, in-force view, coverage diff; `calculate-renewal-risk`, renewals system, ACORD generation |
| Retention / save lists | `retention.save.list` | 2 | Kelli | `run-retention-scoring` (exists), rendered as ranked save cards |
| Compile-from-corrections | `play.patch.compile` | 1; output is a PR a human merges, fixtures gate CI | Landen (vault curator) | FeedbackEvent stream, golden fixtures |

R1 rides the remarket packets: any Nationwide auto packet carries the SmartRide audit flag. The Landen to Kelli remarket lands here per ADR 003, writing a candidate playbook to the vault.

**PROPOSED `household.cluster.roundout`** (Tier 2 list, Tier 4 for any advice line; Kelli): extends the gap round-out with the CRM relationship graph (`account_relationships`, `get_account_cluster` exist) so one card shows the whole household and affiliated-business cluster, and one Approve opens one client thread per cluster instead of one per policy.

### Phase 6: Commercial and the Shared Floor

| Play | play_id (PROPOSED) | Tier | Owner | Rides / reuses |
|---|---|---|---|---|
| Commercial COI reissue | `coi.reissue.commercial` | 3, behind the in-force diff | Jacob | Full chokepoint, coverage diff; `send-coi-email` (Fence-wrapped); ACORD 25 schema |
| Holder registry + batch cancellation corrections | `holder.cancel.correct` | 3; one card per affected holder, none for unaffected | Jacob | In-force view, chokepoint; `certificates_of_insurance` |
| FNOL capture | `fnol.capture` | 2 capture (internal), 3 client acknowledgment; carrier submission stays human | Tori personal, Jacob commercial | Intake bus, resolveAccount; blocked on the claims data model (Brian scope gate) |
| Red-flag remarket | `redflag.remarket` | 4 | Kelli (her clout lands on the follow-up) | Coverage diff red verdict on any cert or gap card; remarket machinery |

**PROPOSED `holder.registry.backfill`** (Tier 1): one-time seed of the registry from historical `certificates_of_insurance` rows so the correction play starts with memory instead of amnesia.

### Producer leaderboards: rejected

The CRM future-features list carries "Producer Leaderboards." Reject it for The Floor. Track-work-not-people is one of the seven mechanisms and exists largely to protect Kelli; #wins is explicitly outcomes only, not a scoreboard. FeedbackEvents already log per-human, per-play verbs on dev, and the earned-autonomy tier-change ledger (spec, Phase 6) will record promotion history; both are an E&O trail and a promotion input, never a rendered comparison. The compliant substitute is **PROPOSED `play.health.board`**: per-play, never per-person; approval rate, edit rate, kill rate, time-to-approved, feeding the compile pipeline. It answers "which plays are earning trust" without ranking humans. Reviving a person-ranked leaderboard cuts against a core mechanism and would require Brian.

---

## 6. Adoption and trust

### The three stories

**To staff:** your assistant does the running around; you make the calls. Work arrives finished. Nothing reaches a client without your name, so nothing reaches a client without your judgment. We track the work, never the person. Say "Approve, Edit, or Kill: the card is a recommendation, not an order." Never say "the AI decided," never use productivity or monitoring language, never per-producer stats.

**To clients:** the same people, faster. The named human is visible on the paper; the machinery never is. Say "Insuring the community since 1981" and "a person you know reviewed and signed this." Never say "AI-powered," "automated," "chatbot." Promise fast with a name attached, not instant without one. PROPOSED: a written client disclosure stance and tagline set (for example, "Every answer has a name on it"), passed through Brian's voice; no doc defines client-facing copy today.

**To carriers:** we ask first, and we can prove every send. A named, accountable member of the Lewis team approves every client and carrier touch, and every approval is logged; licensed staff own all coverage decisions, binding, and advice. The standing rule is that any allowed automation gets confirmed in writing with territory managers Rick Crowley and Mark before it is built. We verify in force at the moment of issuance. Never say "autonomous," "unattended," or anything a carrier could read as portal circumvention (R8 forbids it outright).

### The Kelli hinge

The Floor succeeds or fails on one person. Each specific way trust breaks for a 22-year veteran is answered by built, dev-proven architecture (prod apply is G1, first live send is G4, both open Brian gates):

| What breaks trust | What the architecture does about it |
|---|---|
| A wrong document goes out under her name | Nothing sends without her named approval row, enforced twice (Floor orchestration plus Fence one-time consume, ADR 001). 30 second undo with a working Kill. Recipient is always the account of record or an approved holder on file, never a body-supplied address; for ID cards, account of record only. Below 0.9 resolve confidence, the card forces a human pick. |
| The system looks like surveillance | No per-person stats, no scoreboards (mechanism 5). R6: all staff see all clients. #wins is outcomes only. |
| Alert fatigue | The morning tray (delivered with the Phase 5 heartbeat) batches decisions once. Today, Play 3's shipped acceptance gate already enforces severity-ranked, no alert-fatigue firehose. |
| Corrected by a machine in front of peers | The DM is the work surface; channels are visibility only. Her Edit becomes the package and logs a FeedbackEvent from day one; in Phase 5 the compile pipeline turns those edits into play patches. The machine learns from her, never the reverse. |
| Replacement anxiety | Coverage confirmation, binding, cancellation, and advice are never delegated at any tier. Her clout is the payload of the red-flag remarket. The shared floor is weighted to new hires: peer help, not veteran policing. |

### Rollout choreography

Follows the risk gradient, person by person. Phase 1 gave all six internal cards with zero client risk, so the first thing anyone experiences is the system doing their chasing, not touching their clients. Landen goes first on client-facing (Brian named him Play 4 owner): right choice, he is the succession heir, and if First Light stumbles it lands on family, not on the hinge. Tori joins on internal cards when her binding is seeded. Jacob, two weeks in, is exactly who the shared floor protects; his commercial plays wait for Phase 6. Kelli is first on time savings and last on client-facing stakes; her remarket is deliberately Phase 5 because, per roadmap Decision (c), betting rollout on her highest-stakes workflow first inverts the risk gradient. Brian approves nothing client-facing, so the system never reads as owner-approval theater.

### The first incident

Something will still go wrong, and the first incident decides adoption. Shipped, dev-proven defenses: the hold catches the flinch and Kill cancels it; the audit trail reconstructs everything from work-request events through the approval row, the Fence consume, the awaited email_log, and delivery state (sent is not delivered). Demotion will be automatic once the Phase 6 earned-autonomy ramp lands: any policy or coverage change since the last snapshot drops the play back to one-tap. PROPOSED on top of those rails, a written first-incident protocol: the owning producer personally calls the client, because the human owns the relationship; Brian's review targets the play, not the person; the failure becomes a golden fixture so it can never regress; the office language is "the play failed," never "Kelli approved a bad card."

---

## 7. Risks and guardrails

### Mitigations already in the spine (with honest status)

| Risk | Mitigation | Status |
|---|---|---|
| Wrong-client send | 0.9 bar with forced human pick; identity graph ladder; `ensureProfileByEmail` fix confirmed present | Built; dev |
| Certifying dead coverage | In-force gate at build and at stage; reconciliation view | Built; pass path dev-soaked; live cancellation block test pending |
| Prompt injection | Metadata-only routing; no extracted field becomes an instruction; auth verdict precedes allowlist | Designed into router; email intake not yet live-wired |
| Hallucinated limits | Model decides, code executes; AI/WOS/limits fields policy-derived and locked against Edit; deterministic coverage diff | Contract-level; enforced in card handler per spec |
| PII to a model (R9) | `redactPII` before live Hermes upstream (FU-2 closed per G0) | Closed on the bridge |
| Premature client contact | No send path existed in Phase 1; internal allowlist in Phase 2; G4 one-line flip per play | Enforced; G4 unsigned |
| Mac Mini failure | The Mini is a renderer, not the truth: canonical rows, send path, and audit trail live in Supabase; launchd single instance | Structural |

### Open gaps (tracked, not hidden)

1. **FU-1 is still open.** `canopy-servicing` remains an ungated carrier send. Folding it under the Fence is named Phase 2 backbone work and a before-G4 item in the Phase 3 risk register. It should be closed before any G4 conversation.
2. **Legacy prod send paths.** The G0 sign-off itself flags that legacy UI paths can still reach `email-send` / `send-sms` in prod without a Fence token; the Fence prod deploy is a pull-forward candidate ahead of G1.
3. **Dev provider step.** `RESEND_API_KEY` placeholder keeps the last soak step at `failed_delivery`. One ops line.
4. **Tori is 5/6.** Her binding placeholder blocks the "all six humans" claim of Phase 1's DoD spirit.
5. **G3 clock.** Slack trial ends around July 25; billing is a business gate decoupled from build, and the audit trail lives in Supabase either way.
6. **R1-R5 lint placement.** The full R1-R9 lint lives in the Mac Mini package; on the CRM side only R7 and R9 are deterministic code today. Any CRM-produced card that depends on R1-R5 framing needs that lint wired where the card is built.

### Failure modes the docs do not name (PROPOSED analysis)

- **Audit-trail-as-scoreboard drift.** `feedback_events` carries `actor_id` on every verb because E&O defense requires named humans, and nothing prohibits aggregating it into per-person stats, which would quietly break mechanism 5. Mitigation: a governance rule that per-person aggregates are never rendered in any UI; queries stay play-scoped for improvement and incident-scoped for E&O.
- **Stale in-force silently passing the gate.** The view is only as fresh as the carrier download. If reconciliation stalls, the gate keeps passing on old data and degrades into exactly the "unchanged template" check the docs forbid. Mitigation: a staleness ceiling that hard-blocks Tier-3 sends the same as not-in-force.
- **Approval habituation.** Autonomy is earned from clean approvals, but a two-second reflexive Approve is indistinguishable from a real review, so streaks can promote plays on rubber stamps. Dwell-time metrics would be people-tracking; the mitigation must be outcome-side: random sampling of approved packages per play in Brian's outcome digest, with promotion requiring sampled-outcome cleanliness, not streak length alone.

### The dashboard that serves the one metric (PROPOSED: a Floor Health panel, aggregated by play and play_version, never by person)

| Gauge | Definition |
|---|---|
| Intake-to-card latency (p50/p95) | WorkRequest received to card rendered in the owner's Slack and cockpit; the documented DoD is under 5 seconds |
| Card-to-approve latency | The honest test of "finished decision"; rising latency on one play means the card is missing something the human keeps leaving to find |
| Undo/kill rate in the hold | The flinch rate; nonzero proves the hold earns its 30 seconds |
| In-force blocks | Each one is a prevented E&O event; count them, date them, keep them forever |
| Edit rate per play_version | The compile-loop fuel; a falling edit rate after a play patch is proof the pipeline works |
| Resolve auto-proceed rate | A low rate means the identity graph needs cleaning, not a looser bar; the bar stays 0.9 |
| Suspense aging burn-down | The invisible tax made visible and shrinking |
| Heartbeat coverage (Phase 5) | Share of the active book scanned nightly; below 100 percent means silent corners |

Delivery integrity rides alongside: every send resolves to delivered or `failed_delivery`, and `failed_delivery` alerts the owning human (PROPOSED). Wrong-client sends and over-granted certs get no gauge: their number is zero, and any nonzero value is an incident review, not a trendline. Anti-metrics Lewis refuses to build: per-person approval counts, speed rankings, any "Kelli approved 40, Tori approved 12" view. There is a harder reason than culture: the approval row is the E&O defense only if it records judgment. The moment card-to-approve latency becomes a human score, people race it, approval becomes reflex, and the named signature stops meaning review, which guts R7 from the inside.

### Three mornings (the 10x test)

**Kelli's Tuesday, Phase 5 realized (future machinery).** The heartbeat ran the book overnight. Her tray holds six cards, batched once. Three are Tier 1-2, already done: reconciliation confirmations, suspense items filed. One is a Tier-3 endorsement acknowledgment, one tap, 30 second hold, sent under her name. (The day's ID card request went to Landen's tray; Play 4 is his. PROPOSED, Brian decision: broaden the Play 4 approver set by Phase 5.) One is a Tier-4 auto remarket packet, fully assembled, carrier choice left to her because that choice is the licensed act. The last is why she matters: a renewal where the diff flags a limit the client outgrew. She edits two fields, the FeedbackEvent logs her judgment, and she calls a client she has known for years. Twenty-two years of clout land on the one card that needed a human. Tray cleared before 8:30. Handoffs: zero.

**The 6am cancellation, Phase 6 realized (future machinery on a built spine).** The carrier download processes; `policy_in_force_status` (built, dev) flips one commercial policy to not-in-force. The holder registry remembers every holder ever told this policy was active and drafts one correction card per affected holder, none for unaffected ones. Any pending COI reissue on that policy is already structurally dead: the in-force diff runs at approval time, so Approve cannot stage it. By 7:30 the correction cards sit risk-red in the owner's tray. By 8:00 a named producer has approved each one, and the insured got a call before a certificate lie could meet a claim. The industry's worst latent liability, handled before coffee.

**Jacob's near-miss (commercial COI is Phase 6, future).** A holder demand asks 2M each occurrence; the policy backs 1M. The coverage diff reads the actual forms and marks the line short, escalating risk to red. The limit fields render locked; Edit cannot touch them, because changing them means changing the policy. So the card Jacob sees is not a send he can force. It is a red diff and a remarket surface. On the shared floor the pending card mirrors risk-colored, and Kelli drops one line: call them, this is a round-out. Nothing reached the client. The Kill logs a FeedbackEvent that becomes compile fuel, and the anti-metric rule records the miss against the play, never against Jacob. The number one agency E&O mistake, converted into a cross-sell card and a mentoring moment.

---

## 8. Bold proposals (all PROPOSED, none in the docs)

Each rides the existing spine unchanged: one WorkRequest pipeline, one package row, one action endpoint, Floor plus Fence for anything that sends. None creates a new approval track.

**1. SMS intake: "text us for your ID card."** A Twilio inbound webhook normalizes a client text into a WorkRequest and routes it to Play 4, following the Phase 1 email intake pattern (normalize, resolve, route). The rails are closer than they look: `inbound_allowlist` already models `channel='sms'`, the resolve ladder's phone rung makes the sending number the identity key, the 0.9 bar still forces a human pick on ambiguity, and `send-sms` already sits under the Fence. Delivery goes to the email of record via the `send-id-card-email` surface (deployed on dev, Fence consume proven). Note the email ID-card route itself is still an open Phase 3 decision, so the SMS and email ID routes would land together in Phase 4. Why: the one metric starts at the client's request, and in a 98 percent personal-lines book that request starts on a phone. New decisions it forces: an `'sms'` value on the WorkRequest source enum, and, only if replies go back over SMS rather than email of record, an outbound texting consent posture, which is Brian's call. Boundary: intake only, never conversation; coverage questions fall through to a human.

**2. The E&O Defense File as a one-click export.** The handoff says the defense file "assembles itself as a byproduct." Make it a first-class artifact: per client or per incident, deterministic code (no model call) compiles the work-request transition trail, the named approval row, the Fence consume record, the package's persisted risk and diff verdict, every FeedbackEvent, and tier-change history once the Phase 6 ramp lands, into one signed-URL packet. Persisting the stage-time in-force result is the single small new write this needs. Why: sends will go out under producers' names, Landen first on Play 4; handing them the file that defends that name is the cheapest trust purchase available. Slots after Phase 3. Brian decides: who can mint an export, its retention, and how a PII-bearing legal artifact is classed, since R9 governs prompts, chat, and logs, and a legal export is a genuinely new category.

**3. Renewal delta cards.** At each renewal window, the heartbeat diffs the current carrier download against the prior term (premium, limits, forms) and drafts the what-changed letter as a Tier 4 draft attached to the Phase 5 retention lists. New component this needs: a prior-term snapshot store on top of Spine D, since the view holds current-cycle data only. R5 framing is a hard rule (Florida property deltas never framed as strategic failure); wiring that lint check into the CRM-side card path is part of this build. Why: renewal shock is the churn moment; retention scoring says who is at risk, and this hands the producer the artifact to act with. It must stay Tier 4 permanently: a premium explanation is coverage advice, and any future promotion would touch the never-delegated list and would require Brian.

**4. Succession rails: Landen's 2-20 case file.** A weekly, Landen-only digest built from real FeedbackEvents: cards he owned, Edit diffs, Kill reasons, mapped against 2-20 study topics, plus a blind-decision mode that shows him a card pre-decision and then reveals what the licensed human did. Vault candidate playbooks he already curates become the textbook. No other agency can train its heir on its own decision corpus. Slots after Phase 5, which supplies the volume. Needs Brian: this brushes mechanism 5 (track work, never people) and requires an explicitly self-scoped, self-opted-in exception for Landen alone, with no one else's stats ever surfaced.

**5. The carrier brief.** A one-page brief for territory managers Rick Crowley and Mark before the first live client send, so the first thing a carrier hears about The Floor comes from Lewis, in writing, framed as tighter controls than a manual agency: named approver on every send, in-force verified at issuance, sanctioned channels only, written confirmation before any carrier automation. Brian approves the brief's content and timing, and it goes out under a named human, per the carrier-reach hard stop.

**Rejected: the holder registry as an annual marketing touch.** The Phase 6 registry is right; the annual "your certs are current" outreach is wrong three ways. It fails the play-selection test (neither grinds invisible tax nor proves in-force at a moment of need). It optimizes the sub-2-percent commercial slice. And it spends the trust budget: recurring low-stakes sends under producers' names train exactly the approval fatigue R7 cannot survive. The correction card after a real cancellation IS the community positioning. Earn it there.

---

## 9. Open questions for Brian (genuine forks only)

1. **Does The Floor ever address third parties?** `lienholder.proof.send` needs `SendSpec.recipient_basis` widened beyond `account_of_record` and `approved_holder` to a vetted lienholder-of-record. Approve that basis or the play family does not exist. This is the single structural decision gating most third-party paper.
2. **Ratify the never-automate list.** PROPOSED standing client-contact policy: non-pay and cancellation warnings, claim outcomes, and any death, divorce, or estate-triggered outreach stay human-composed forever; the agent assembles facts, the producer writes the words. One-line yes or no before it is written into the play specs.
3. **The staleness ceiling.** When `policy_in_force_status` freshness exceeds a ceiling (reconciliation stall), should Tier-3 sends hard-block exactly like not-in-force, and what is the ceiling? This decides whether the office can pause itself.
4. **Client disclosure posture.** Does Lewis ever name the assistant layer to clients (a short "how we work" note or website line), or stay silent and let speed plus the named signature speak? The docs set tone but never decide disclosure.
5. **The E&O carrier.** When the audit trail matures, present it at the E&O renewal as documented-supervision evidence (possible premium leverage, invites underwriter scrutiny), or hold it strictly as litigation defense?

---

*Grounding note: drafted from the canonical stack listed at top; 40 adversarial-verification findings were applied before delivery, including two material corrections: the Slack fixture-to-live seam is already shipped per Phase 1 status (the roadmap section 3.1 fixture description is the pre-build snapshot), and `canopy-servicing` FU-1 remains an OPEN ungated carrier send that should close before G4.*
