# ADR 003: Landen to Kelli remarket in Phase 5, not Phase 1

**Status:** Accepted  
**Date:** July 2026  
**Deciders:** Brian Lewis, Floor architecture review

## Context

`docs/THE-FLOOR-PROJECT-STATE.md` section 11 named the Landen to Kelli remarket as Phase 1 definition of done. The handoff architecture (`docs/THE-FLOOR-HANDOFF-ARCHITECTURE.md` section 7 Phase 3, section 8 Adoption) already moved it to the proactive phase.

The remarket is a Tier 4 licensed act (coverage advice). It needs resolve-account, in-force status, coverage diff, and the compile-from-corrections pipeline underneath it. Kelli is the adoption hinge. Her comfort with The Floor decides rollout success.

Shipping her highest-stakes workflow first inverts the risk gradient. Internal, invisible, zero-client-risk plays must earn trust before proactive advice.

## Decision

Defer the Landen to Kelli remarket to **Phase 5 (No Handoff)** in `docs/THE-FLOOR-UNIFIED-ROADMAP.md`. Do not pull it into Phase 1.

Phase 1 ships internal cards only: carrier-download reconciliation (Play 1) and suspense sweep (Play 3). No send path exists in Phase 1.

Phase 5 acceptance: the remarket runs end to end on live data through a card, Kelli-owned, writing a candidate playbook to `/lewis-vault/candidates`.

Update `docs/THE-FLOOR-PROJECT-STATE.md` section 11 to point here and to the unified roadmap.

## Consequences

**Positive.** Safe rollout order: internal wins, then a low-risk client send (ID cards in Phase 3), then proactive and advice. Kelli sees trust built before her hardest workflow lands.

**Negative.** project-state section 11 no longer matches the original "Phase 1 = remarket" framing. Docs must stay reconciled so there is one answer.

**Neutral.** The remarket play design is unchanged. Only sequencing moves.

**Follow-up.** Phase 5 also ships nightly heartbeat, auto remarket packets, retention lists, and the compile-from-corrections pipeline. The remarket DoD depends on all of that spine being live.
