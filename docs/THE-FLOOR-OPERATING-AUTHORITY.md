# The Floor — Operating Authority (Standing Directive)

**Authority:** Brian "Speedy" Lewis  
**Effective:** 2026-07-01  
**Status:** Standing, until revoked  
**Supersedes:** Per-gate / per-step sign-off cadence for all work **except** the three lines below.

---

## Mandate

Build and run the whole product — InsureFlow CRM, Slack, email, the Floor spine, per-employee agents — **end to end, autonomously**. Brian reviews **outcomes**, not permissions.

---

## Full authority — proceed without asking

- Build, wire, refactor, test, integrate the Floor across every surface (CRM cockpit, Slack, email, spine, heartbeat, per-employee agents).
- Run the pipeline on dev/staging/internal: migrations, edge deploys, seeds, tests, fixture→live seams. **No sign-off required.**
- Turn features **ON internally** (staff-facing) and run them live for staff.
- Deploy **reversible, non-client-facing infra to PROD** once it passes dev soak + tests. Record in ops docs. No separate signature for reversible prod infra.
- Make product/architecture calls **inside locked ADRs** (`docs/adr/001`–`004`). Don't wait on Brian for reversible decisions. Run roadmap phases back-to-back. Batch Brian-facing items into **one periodic review**.

**If it's reversible, you don't need permission. Do it.**

---

## Stop for one human confirmation — ONLY these three

| # | Line | Rule |
|---|------|------|
| 1 | **Client / carrier reach** | Email, SMS, COI, document, portal — **prepare and QUEUE** only. A **named human** (producer who owns the client: Kelli, Landen, Jacob, Letitia, Tori — **not Brian**) clicks send. Their name on the send is the E&O defense. |
| 2 | **Raw PII** | SSN, DOB, DLN, full account/policy numbers, signed URLs, document contents — **never** on chat, log, or model prompt. Pass by reference only. Non-negotiable. |
| 3 | **Irreversible PROD** | Deleting/dropping prod data, flipping a bucket public, disabling R1–R9 lint, bypassing carrier MFA/CAPTCHA. |

That's the whole list. Everything else, ops owns.

---

## Operating mode

- **Default to action.** Reversible = do it. Client-facing / irreversible = prepare, queue, surface the one confirmation to the right person.
- **Report by showing, not asking:** running status + audit trail; push an **outcome digest**, not permission requests.
- **Escalate only true blockers.** Every action audited and reversible-by-default.

---

## Related docs

- Roadmap: [`THE-FLOOR-UNIFIED-ROADMAP.md`](./THE-FLOOR-UNIFIED-ROADMAP.md)
- G0 baseline (dev-only spine): [`THE-FLOOR-G0-SIGNOFF.md`](./THE-FLOOR-G0-SIGNOFF.md)
- Phase tracker: [`THE-FLOOR-PHASE-0-STATUS.md`](./THE-FLOOR-PHASE-0-STATUS.md) → Phase 1 section
- Locked ADRs: [`docs/adr/`](./adr/)

---

*Standing order. Go.*
