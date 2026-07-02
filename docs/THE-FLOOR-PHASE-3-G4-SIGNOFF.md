# Phase 3 — G4 First Light Sign-Off

**Date:** 2026-07-01  
**Signed by:** Brian Lewis  
**Scope:** Play 4 `id.card.issue` — first live client send on dev

---

## What G4 unlocks

- `FLOOR_PLAY_ALLOWLIST_MODES=id.card.issue=client` on dev Supabase
- Tier-3 ID card packages address **account email on file** (not internal allowlist)
- Release path validates recipient matches account email + in-force gate + Fence consume
- COI and other plays remain **internal** until individually flipped

## Preconditions met

| Item | Status |
|------|--------|
| Full chain soak (create → approve → hold → release → Fence) | ✅ dev 2026-07-01 |
| FU-1 `canopy-servicing` email path fenced | ✅ |
| In-force re-check at stage + release | ✅ |
| Per-play allowlist mode (`FLOOR_PLAY_ALLOWLIST_MODES`) | ✅ |
| Named human approve (Landen owner) | ✅ |

## Out of scope (still gated)

- **G1** — prod migrations / prod send
- **Resend** — restore dev `RESEND_API_KEY` for provider delivery proof
- **COI client send** — Phase 4 commercial play

---

*Brian sign-off received in chat 2026-07-01: "G4 has my sign off."*
