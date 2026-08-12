# InsureFlow — Effective/Expiration Date Import + GEICO Cleanup

**Date:** 2026‑06‑30
**Source file:** `policies_excluding_AO 2.xlsx` (1,658 rows)
**Database:** Supabase `lrqajzwcmdwahnjyidgv` → `public.policies`
**Match method:** by policy number, tolerant of Excel's dropped leading zeros and GEICO suffixes. 0 unmatched, 0 ambiguous.
**Rule:** only blank fields were filled; existing values were never overwritten.

## What changed
- **Effective dates filled:** 769 policies
- **Expiration dates filled:** 767 policies
- 881 sheet rows already matched policies with identical dates (no‑op).
- Premiums: nothing to fill (already populated everywhere the sheet had a value).

## GEICO duplicate cleanup
**Stripped the inaccurate `-1` driver suffix** (kept under the first spouse, dates applied):

| Was | Now | Account | Effective |
|---|---|---|---|
| 6214924273-1 | 6214924273 | Jason Loveland | 2026‑01‑12 |
| 6233591301-1 | 6233591301 | Joseph Carter | 2026‑05‑22 |
| 6230926914-1 | 6230926914 | Philip Glover | 2026‑05‑01 |

**Retired as duplicates** (soft‑deleted; `deleted_at` set; `custom.merged_into` recorded):

| Retired policy | Account | Merged into |
|---|---|---|
| 6214924273-2 | Melissa Loveland | 6214924273 |
| 6233591301-2 | June Carter | 6233591301 |
| 6230926914-2 | Katherine Glover | 6230926914 |
| 6223161990 (name typo "Toddy") | Toddy Wright | 6223-16-19-90 (Todd Wright) |

## Needs your attention

**4 accounts now have 0 live policies** (their only policy was the retired duplicate) — decide whether to archive/merge:
June Carter · Katherine Glover · Melissa Loveland · Toddy Wright

**7 policies still missing an effective date:**

| Policy | Account | Carrier | Reason |
|---|---|---|---|
| 963242902 | Kenneth Scott | Progressive | Sheet had typo eff **2028‑11‑05**; reverted — needs correct date |
| 1009793780 | Wanda Parnell | Auto‑Owners | Sheet had typo eff **2011‑08‑05**; reverted — needs correct date |
| 14334706 | Kevin Morton | Progressive | Not in sheet. Sheet listed `17564640` twice (Morton + Prather); DB has 17564640 under Prather |
| 925508158 | Kori Boyett | Progressive | Sheet had no date |
| 956424599 | Leroy Sherrod | Progressive | Sheet had no date |
| 999416899 | Richard Cordner | Progressive (cancelled) | Sheet had no date |
| 74094378 | Tammie Warren | Progressive | Sheet had no date |

**1 effective‑date conflict (left unchanged):**
`FHO0456597` (James & Julia Croft, Safe Harbor) — DB has **2026‑01‑07**, sheet has **2025‑01‑07**. The sheet's own expiration (2026‑01‑07) implies 2025 is correct, but I did not overwrite the existing value.

**Possible similar duplicate (NOT touched — outside approved GEICO scope):**
`AGM107548-1` and `AGM107548-2` (Tracy Cruce, American Integrity) — same premium and date; may be the same `-1/-2` split pattern.

## Rollback
Pre‑change snapshot of every policy: **`public.bak_policies_20260630`** (2,178 rows: id, policy_number, effective_date, expiration_date, premium, deleted_at, custom, updated_at). Drop it once you're satisfied the import is correct.
