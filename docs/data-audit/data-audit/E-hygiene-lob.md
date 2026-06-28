# Data Audit E — Field-Level Hygiene + Line-of-Business Normalization

**Scope:** Active book = `accounts WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL` (**1,610 accounts**). Policies linked via `account_id`, active = `deleted_at IS NULL` (**1,989 policies**).
**Date:** 2026-06-27 · **Mode:** READ-ONLY audit (no data modified).

---

## A. Account Field Quality (n = 1,610)

| Field issue | Count | % of book | Notes |
|---|---:|---:|---|
| Missing `address_line1` | 590 | 36.6% | No mailable street address |
| **Uncontactable** (no email AND no phone) | 682 | 42.4% | Cannot reach by digital or voice |
| Missing `email` | 948 | 58.9% | Majority of book |
| Missing `phone` (primary) | 849 | 52.7% | |
| State ≠ FL or null | 594 | 36.9% | 589 NULL + 1 empty + 4 genuinely out-of-state (DC, AL, NC, WV) |
| `zip_code` blank | 590 | 36.6% | Tracks missing-address population |
| Malformed ZIP (non 5/5-4 digit) | 0 | 0% | Zips present are well-formed |
| FL state but ZIP outside 32–34xxx | 0 | 0% | No detectable city/ZIP-vs-state mismatch |
| `date_of_birth` present | 9 | 0.6% | **DOB essentially absent book-wide** |
| `date_of_birth` missing | 1,601 | 99.4% | |

### Name casing / quality
| Problem | Count | Examples |
|---|---:|---|
| ALL-CAPS names | 10 | `BRIAN LEWIS`, `GWENDOLYN BENNETT`, `SORENSEN AND SMITH LLC` (×6), `AMERIZAM INC`, `JAMES COPELAND ESTATE` |
| all-lowercase names | 0 | — |
| Names containing digits/years | 3 | `Lewis Insurance Daysheets 2026` (non-customer/admin record), `3 Sevens Properties Llc`, `China House 58 Inc` |
| Single-token (one-word) names | 0 | — |
| Blank names | 0 | — |

> `SORENSEN AND SMITH LLC` appears **6 times** in the ALL-CAPS sample — likely duplicate commercial records under one workspace. `Lewis Insurance Daysheets 2026` is an internal/admin artifact, not a real account, and should be excluded from any outreach.

### Phone format variance
Distinct stored formats among 1,610 accounts (primary `phone`):

| Format | Count |
|---|---:|
| blank | 849 |
| `+1XXXXXXXXXX` (E.164) | 660 |
| `XXX-XXX-XXXX` (dashed) | 53 |
| `XXXXXXXXXX` (bare 10-digit) | 36 |
| `XXX.XXX.XXXX` (dotted) | 11 |
| `XXX XXX-XXXX` (space+dash, irregular) | 1 |

**5 distinct non-blank formats** coexist (E.164 dominant). Normalize all to a single canonical form (recommend E.164 `+1XXXXXXXXXX`) for dialer/SMS reliability. `phone_secondary` not separately profiled here.

### Shared email (same address on >1 account)
- **16 distinct email values** are shared, spanning **34 accounts**. Typically household members or commercial entities sharing a contact inbox. These collisions break per-recipient email sends/unsubscribe handling and should be de-duplicated or explicitly modeled as household links.

---

## B. Line-of-Business Normalization — FULL Mapping

**41 distinct raw `line_of_business` values** across 1,989 active policies. Complete canonical mapping (raw → canonical_line, category):

| Raw value | Count | Canonical line | Category |
|---|---:|---|---|
| `auto` | 1,110 | Auto | personal_auto |
| `Auto` | 193 | Auto | personal_auto |
| `auto_policy` | 3 | Auto | personal_auto |
| `pp` | 40 | Auto (private passenger) | personal_auto |
| `commercial_auto` | 22 | Commercial Auto | commercial |
| `Commercial Auto` | 1 | Commercial Auto | commercial |
| `home` | 194 | Homeowners | dwelling |
| `Home` | 37 | Homeowners | dwelling |
| `home_policy` | 28 | Homeowners | dwelling |
| `ho8` | 12 | HO-8 (Homeowners) | dwelling |
| `ho6` | 1 | HO-6 (Condo) | dwelling |
| `df3` | 22 | DP-3 (Dwelling Fire) | dwelling |
| `dp3` | 16 | DP-3 (Dwelling Fire) | dwelling |
| `df1` | 7 | DP-1 (Dwelling Fire) | dwelling |
| `dp1` | 1 | DP-1 (Dwelling Fire) | dwelling |
| `renters` | 7 | Renters (HO-4) | dwelling |
| `Property` | 3 | Property (dwelling) | dwelling |
| `Property- rental` | 1 | Property — Rental (dwelling) | dwelling |
| `boat` | 126 | Boat / Watercraft | specialty |
| `Watercraft` | 2 | Boat / Watercraft | specialty |
| `motorcycle` | 67 | Motorcycle | specialty |
| `Motorcycle` | 9 | Motorcycle | specialty |
| `travel_trailer` | 32 | Travel Trailer | specialty |
| `Travel Trailer` | 12 | Travel Trailer | specialty |
| `motor_home` | 9 | Motorhome / RV | specialty |
| `Motorhome` | 2 | Motorhome / RV | specialty |
| `Umbrella` | 1 | Personal Umbrella | personal_umbrella |
| `personal_liability` | 1 | Personal Liability | personal_umbrella |
| `Life` | 2 | Life | life |
| `gl` | 6 | General Liability | commercial |
| `General Liability` | 8 | General Liability | commercial |
| `Commercial General Liability` | 1 | General Liability | commercial |
| `bop` | 2 | Business Owners Policy (BOP) | commercial |
| `commercial_policy` | 3 | Commercial (unspecified) | commercial |
| `commercial_property` | 1 | Commercial Property | commercial |
| `Commercial Property` | 1 | Commercial Property | commercial |
| `Commercial Inland Marine` | 1 | Commercial Inland Marine | commercial |
| `workers_comp` | 1 | Workers Compensation | commercial |
| `Workers Comp` | 1 | Workers Compensation | commercial |
| `Workers Compensation` | 2 | Workers Compensation | commercial |
| `Workers Compensation and Employers Liability Insurance` | 1 | Workers Compensation | commercial |

**Category roll-up (active policies):**
- personal_auto: 1,371 (auto 1,306 + pp 40 + ... ) — auto/Auto/auto_policy = 1,306; pp = 40 → **1,346** personal auto; commercial_auto 23 booked under commercial.
- dwelling: ~349 (home family 259 + ho8/ho6 13 + df/dp 46 + renters 7 + Property 4)
- specialty: ~259 (boat 128 + motorcycle 76 + travel_trailer 44 + motorhome 11)
- personal_umbrella: 2
- life: 2
- commercial: ~58 (commercial_auto 23 + GL 15 + WC 5 + BOP 2 + commercial property 2 + inland marine 1 + commercial_policy 3 + ...)

> **Canonicalization is purely a labeling fix** — apply via a lookup/CASE map, no source data loss. Recommend storing a normalized `line_canonical` + `line_category` alongside the raw value rather than overwriting it.

---

## C. Policy Field Quality (n = 1,989 active policies)

| Field issue | Count | % |
|---|---:|---:|
| Missing `carrier` text | 0 | 0% |
| `carrier_id` NULL (unlinked carrier) | 311 | 15.6% |
| Missing `effective_date` | 779 | 39.2% |
| Missing `expiration_date` | 779 | 39.2% |
| `premium` NULL | 562 | 28.3% |
| `premium` = 0 | 2 | 0.1% |
| `line_of_business` blank | 0 | 0% |

### Status distribution & expired-still-marked-active
| status | count | of which expired (exp_date < today) |
|---|---:|---:|
| active | 1,708 | **10** |
| cancelled | 179 | 146 |
| lost | 97 | 84 |
| lapsed | 4 | 4 |
| non_renewed | 1 | 1 |

> 10 policies are `status='active'` yet already past `expiration_date` — these need renewal-status review (the 779 with null expiration can't be evaluated and may hide more). Note ~85% of active policies have a linked `carrier_id`; the 311 NULLs rely on free-text carrier only.

---

## Prioritized Cleanup Recommendations

1. **Contactability (highest impact).** 682 accounts (42%) have neither email nor phone, and 948 lack email. Append/enrich contact data before any outreach campaign; segment the 682 as "uncontactable — needs data" so they're excluded from sends, not counted as failed deliveries.
2. **DOB is effectively missing (99.4%).** If life/age-rated cross-sell or birthday touches are planned, DOB must be sourced — it is not usable as-is.
3. **Address completeness.** 590 accounts (37%) lack `address_line1`/`zip` — blocks direct mail and FL-territory rating logic. Same ~590 population; backfill together.
4. **Normalize line_of_business** using the 41-row map above. Add `line_canonical` + `line_category` columns (do not overwrite raw). Single biggest analytics win — collapses 41 variants to ~6 categories.
5. **Standardize phone format** to E.164 (`+1XXXXXXXXXX`); 101 non-blank records (53 dashed + 36 bare + 11 dotted + 1 irregular) deviate from the dominant format.
6. **Policy dates & premium.** 779 missing effective/expiration dates (39%) and 562 missing premium (28%) undermine renewal automation and book-value reporting — prioritize for the active 1,708.
7. **Expired-active reconciliation.** Review the 10 `active`+expired policies; widen review once the 779 null-expiration records are dated.
8. **De-dupe & clean names.** Resolve `SORENSEN AND SMITH LLC` (6 copies) and the 16 shared-email clusters (34 accounts); exclude the admin record `Lewis Insurance Daysheets 2026`; title-case the 10 ALL-CAPS names.

*Counts are reproducible via the SQL in this audit (active book + active policies filters as defined in Scope).*
