# The Floor: Phase 3 — Prod First Light (Slice 11)

**Scope:** Production deployment of Play 4 `id.card.issue` after dev G4 sign-off.  
**Dev G4:** [`THE-FLOOR-PHASE-3-G4-SIGNOFF.md`](./THE-FLOOR-PHASE-3-G4-SIGNOFF.md) (signed 2026-07-01)  
**Prod project:** `lrqajzwcmdwahnjyidgv`  
**Status:** ⏳ **GATED** — do not flip prod allowlist until all gates below are green.

---

## Gate sequence (strict order)

| # | Gate | Owner | Blocks |
|---|------|-------|--------|
| 1 | **G2 legacy-bucket audit** — public/legacy doc buckets; signed-URL-only for card preview | Eng + Brian | Real ID URLs in prod Slack/cockpit |
| 2 | **Fence prod deploy** — `clientSendApprovalGate` on `send-coi-email`, `send-id-card-email`, `email-send`, `send-sms`, `canopy-servicing` email path | Eng | Ungated prod sends |
| 3 | **FU-1 verified on prod** — `canopy-servicing` email delivery requires Fence token | Eng | Carrier bypass |
| 4 | **G1 prod migrations** — Spine A + D + Floor tables/RPCs on `lrqajzwcmdwahnjyidgv` | Brian sign-off | Persistence |
| 5 | **Prod G4 sign-off** — separate one-pager from dev G4; first real Lewis client (not dev test account) | Brian | `FLOOR_PLAY_ALLOWLIST_MODES=id.card.issue=client` on prod |
| 6 | **G3 Slack Pro** — billing before trial ends (~2026-07-25) | Brian | Slack audit trail |
| 7 | **Carrier brief** (Rick/Mark) — automation confirmation before first prod client send | Brian | Adoption / E&O comfort |

---

## Prod environment checklist

### Secrets (prod Supabase → Edge Functions)

| Secret | Value |
|--------|--------|
| `FLOOR_COCKPIT_ENABLED` | `true` |
| `FLOOR_CLIENT_SEND_ENABLED` | `true` |
| `FLOOR_PLAY_ALLOWLIST_MODES` | `id.card.issue=client` (only after prod G4) |
| `FLOOR_RETENTION_SAVE_OWNER_ID` | Kelli prod UUID (when Phase 5 plays ship) |
| `CRON_SECRET` | Match GitHub Actions |
| `RESEND_API_KEY` | Production key (verified delivery) |

### Edge functions to deploy

- `floor-action`
- `floor-release-held-sends`
- `send-id-card-email`
- `floor-run-plays` (Phase 4/5 internal plays — optional for First Light)
- `email-inbound-lite` (if email intake enabled later)

### GitHub Actions (prod)

| Workflow | Schedule | Notes |
|----------|----------|-------|
| `floor-release-held-sends-cron.yml` | Every 2 min | **Required** — no manual curl for client sends |
| Phase 4/5 crons | As needed | Internal plays only |

### Verification (prod soak script — create before G4)

1. Staff CRM button → package &lt; 5s (`intake_latency_ms` in response)
2. Approve → 30s hold → sweeper → Resend delivery + `email_log` row
3. Kill during hold → approval `killed` → sweeper skips → no provider call
4. Policy cancel same day → in-force re-check blocks release
5. Recipient = `account_of_record` only

---

## Explicitly out of scope for prod First Light

- COI client send (`coi.issue=client`) — Phase 4
- Email intake for ID card (subject token) — ADR pending
- Remarket / `remarket.packet.auto` — Phase 5 (ADR 003)
- Prod migrations for predictive analytics beyond Floor spine

---

## Rollback

1. Set `FLOOR_PLAY_ALLOWLIST_MODES=id.card.issue=internal` (or unset)
2. Set `FLOOR_CLIENT_SEND_ENABLED=false`
3. Held sends: sweeper stops releasing; existing `held` rows age out or manual `killed`

---

**Last updated:** 2026-07-02 (Slice 11 planning doc)
