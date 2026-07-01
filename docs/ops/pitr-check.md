# PITR confirmation record

**Purpose.** Proof that Point-in-Time Recovery is enabled on the Lewis Insurance App Supabase project before Floor dev-branch write testing.

**Owner:** Brian Lewis  
**Template version:** July 2026

---

## Project

| Field | Value |
|---|---|
| Supabase project ref | `lrqajzwcmdwahnjyidgv` |
| Project name | Lewis Insurance App |
| Region | us-east-1 |

---

## Confirmation

| Field | Value |
|---|---|
| Date checked | 2026-06-29 |
| PITR enabled | [x] Yes  [ ] No |
| Plan tier supports PITR | Pro (Brian confirmed) |
| Recovery window (days) | Per Supabase plan (Brian confirmed enabled 6/29) |

**Status for G0 item #2:** PITR verified 2026-06-29. Brian re-confirmed at G0 sign-off 2026-07-01. Paste dashboard screenshot below when available.

---

## Evidence

**Screenshot or dashboard note:**

```
Brian Lewis verified PITR enabled 2026-06-29.
G0 re-confirmed 2026-07-01 per docs/THE-FLOOR-G0-SIGNOFF.md.

Dashboard path: Project Settings > Database > Point in Time Recovery

[Paste screenshot filename or link here when filed]



```

**Additional notes:**

```
G0 APPROVED / GREENLIT — Brian Lewis, 2026-07-01
Floor Phase 0 dev-branch work only per THE-FLOOR-G0-SIGNOFF.md
```

---

## Sign-off

| Field | Value |
|---|---|
| Confirmed by | Brian Lewis |
| Role | Owner |
| Signature / initials | BL |
| Date | 2026-07-01 |

---

## Follow-up if PITR is not enabled

1. Upgrade Supabase plan or enable PITR add-on per Supabase billing docs.
2. Re-run this checklist after enablement.
3. Do not proceed with Floor dev-branch migrations until PITR is confirmed and this form is complete.

**Related:** [`docs/THE-FLOOR-G0-SIGNOFF.md`](../THE-FLOOR-G0-SIGNOFF.md) | project-state section 8.3
