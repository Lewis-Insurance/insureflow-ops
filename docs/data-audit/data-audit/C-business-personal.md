# Data Audit C — Business vs Personal/Household Classification

**Database:** InsureFlow / Supabase (project `lrqajzwcmdwahnjyidgv`)
**Scope:** Active book = `accounts WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL`
**Run date:** 2026-06-27  |  **Mode:** READ-ONLY (no data modified)
**Auditor angle:** Find accounts that are really COMMERCIAL but typed `household`.

---

## 1. Headline findings

| Metric | Count |
|---|---|
| Active accounts (total) | 1,610 |
| Currently typed `household` | 1,609 |
| Currently typed `commercial_business` | 1 (**demo data** — see below) |
| **Real commercial accounts in the book today** | **effectively 0** |
| Active book after excluding 3 internal/agency accounts | 1,607 |
| Flagged by **name** signal | 77 |
| Flagged by **commercial-line** signal | 48 |
| Flagged by **either** signal (union) | **101** |
| Flagged by **both** signals (highest confidence) | **24** |
| Name ∩ Line overlap | 24 |

**Bottom line:** Of 1,607 real accounts, **~95–100 are genuinely commercial** but mis-typed as `household`. The single existing `commercial_business` record ("Blue Oak Manufacturing, LLC") is **seeded demo data**, not a customer — so the production book has zero correctly-typed commercial accounts. This is a systemic typing problem, not a handful of stragglers.

---

## 2. Methodology + exact SQL

**Base/book definition** (excludes the 3 agency-internal accounts — note: address compare uses `IS DISTINCT FROM` and name compares use `NOT ILIKE`/`<>`; an earlier draft that wrapped these in a single `NOT( ... OR ...)` silently dropped rows and under-counted the book to 1,018 — the corrected base is 1,607):

```sql
WITH book AS (
  SELECT id, name, phone, city, state FROM accounts
  WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL
    AND address_line1 IS DISTINCT FROM '1313 W US HWY 90'
    AND name NOT ILIKE '%Lewis Insurance Daysheets%'
    AND name NOT ILIKE '%Brian Thomas Lewis%'
    AND name <> 'BRIAN LEWIS'
)
```

**Name signal** (business-entity tokens in `accounts.name`):

```sql
name ILIKE '% LLC%' OR name ILIKE '%L.L.C%' OR name ILIKE '% INC%' OR name ILIKE '% CORP%'
 OR name ILIKE '% CO %' OR name ILIKE '% CO' OR name ILIKE '%COMPANY%'
 OR name ILIKE '% PA' OR name ILIKE '%, PA%' OR name ILIKE '%M.D%' OR name ILIKE '%MD PA%'
 OR name ILIKE '%DDS%' OR name ILIKE '%DVM%' OR name ILIKE '%TRUST%' OR name ILIKE '%MINISTR%'
 OR name ILIKE '%CHURCH%' OR name ILIKE '%TEMPLE%' OR name ILIKE '%FARMS%' OR name ILIKE '%FARM%'
 OR name ILIKE '%RANCH%' OR name ILIKE '%LEASING%' OR name ILIKE '%PROPERTIES%' OR name ILIKE '%RENTALS%'
 OR name ILIKE '%HOLDINGS%' OR name ILIKE '%ENTERPRISES%' OR name ILIKE '%SERVICES%'
 OR name ILIKE '%CONSTRUCTION%' OR name ILIKE '%TRUCKING%' OR name ILIKE '%TRANSPORT%'
 OR name ILIKE '%GROUP%' OR name ILIKE '%ASSOCIATES%' OR name ILIKE '%AND SONS%' OR name ILIKE '% & %'
```
> Note: ` & ` is matched **with surrounding spaces** to avoid married-couple names; `% CO %`/`% CO` used instead of bare `CO` to avoid surnames.

**Line signal** (account holds any commercial policy — `policies.line_of_business` is messy/mixed-case, so matching is case-insensitive):

```sql
EXISTS (SELECT 1 FROM policies p WHERE p.account_id=book.id AND (
     p.line_of_business ILIKE 'commercial%' OR p.line_of_business ILIKE '%general liability%'
  OR lower(p.line_of_business)='gl' OR lower(p.line_of_business)='bop'
  OR p.line_of_business ILIKE '%workers%comp%' OR p.line_of_business ILIKE '%inland marine%'
  OR p.line_of_business ILIKE '%professional%'))
```
Commercial line values actually present in the book: `commercial_auto` (22), `General Liability`/`gl`/`Commercial General Liability` (~16), `commercial_policy` (3), `bop` (2), `Workers Compensation`/`workers_comp`/`Workers Comp` (~5), `Commercial Property`/`commercial_property`, `Commercial Inland Marine`, `Property- rental`.

Sizing was produced with a single `flags` CTE and `COUNT(*) FILTER (WHERE ...)`; tiering with `CASE WHEN name_sig AND line_sig THEN 'BOTH' WHEN line_sig THEN 'LINE' ELSE 'NAME' END`.

---

## 3. Reverse check — `commercial_business` that looks personal

Only one `commercial_business` row exists:

| id | name | verdict |
|---|---|---|
| `22222222-2222-4222-8222-222222222222` | Blue Oak Manufacturing, LLC | **Demo/seed data** (`notes`="Sample commercial account; demo data only.", FEIN 12-3456789, city/state blank). Not a real customer. |

No genuine commercial account is mis-typed as personal, because there are essentially no genuine commercial accounts typed correctly at all.

---

## 4. Structured tables — what's defined vs used

| Table | Rows | Status |
|---|---|---|
| `business_types` | 8 | **Well-defined reference table, fully unused.** Values: LLC, S-Corp, Corporation, Partnership, Sole Proprietorship, Non-Profit, Government, Individual (each with description, `is_active=true`). This is the intended lookup for entity structure. |
| `commercial_business_accounts` | 1 | Holds only the Blue Oak **demo** row. Columns are the right home for commercial detail: `legal_name, dba_name, fein, naics_code, years_in_business, employees_count, annual_revenue, primary_contact_id, notes`. |
| `household_accounts` | 1 | 1 demo row; effectively unused. |
| `businesses` | 0 | Empty. |

**Conclusion:** A proper structured destination already exists. When an account is reclassified to `commercial_business`, its firmographic detail (legal name, DBA, FEIN, NAICS, employees, revenue) should be written to **`commercial_business_accounts`**, and entity structure referenced against **`business_types`**. Today that scaffolding is empty and the data lives only as a `household` row + commercial policy.

---

## 5. Recommended reclassification rule + confidence tiers

Reclassify `accounts.type` from `household` → `commercial_business` using tiered confidence. Do **not** auto-flip blindly; review the lower tiers.

- **Tier 1 — AUTO (highest confidence): name signal AND commercial-line signal.** 24 accounts (minus 2 to exclude: the Blue Oak demo and the agency's own "Lewis & Lewis Insurance Agency Inc"). These are unambiguous — an entity-named account that also carries GL/WC/commercial auto/commercial property. **Safe to reclassify directly.**
- **Tier 2 — AUTO/near-auto: commercial-line signal only (personal- or brand-named).** 24 accounts. A `household`-named account holding a commercial policy is a business operating under an owner/brand name (e.g. "BoxDrop Live Oak", "Friendly Hands Cleaning", "Road Runner Tire And Break Express", and sole-proprietors like "Horace Witt" with `commercial_auto`). The commercial policy is strong evidence; reclassify, but capture the legal/DBA name during review.
- **Tier 3 — REVIEW: name signal only (no commercial policy yet).** 53 accounts. Mostly obvious businesses (LLC/Inc trades — electrical, septic, drywall, tree service, restaurants, medical PAs). Reclassify after a quick eyeball; a few are false positives (see §6). Many of these carry only personal-style lines today (e.g. commercial auto booked as `auto`), so absence of a commercial line does not make them personal.

Suggested implementation (NOT executed — auditor is read-only):
1. Set `type='commercial_business'`, `account_type='business'` for reviewed Tier 1/2 (and approved Tier 3).
2. Insert/populate a `commercial_business_accounts` row per reclassified account (at minimum `account_id`, `legal_name`).
3. Map entity suffix → `business_types` (LLC→LLC, Inc/Corp→Corporation, Church/non-profit→Non-Profit, etc.).
4. Add a recurring data-quality check that **any account holding a commercial line must be typed `commercial_business`** (Tier 2 logic) to prevent regression.

---

## 6. False-positive risks (verified)

| Pattern | Risk | Finding in this book |
|---|---|---|
| `%RANCH%` substring | Matches surname "B**RANCH**" | **2 real FPs: "Harry Branch", "Shelia Branch"** (Gainesville). Exclude. |
| `%FARM%` substring | Matches "FARMER" surnames | 0 FP here ("Mc Farms Inc" is a real business). Watch on future loads. |
| Bare `&` in name | Married couples ("Gregory & Susan Sund") | Avoided by requiring `% & %` with spaces — and even so all 7 spaced-`&` matches here are real businesses (B & B Homes, H & J Restaurant, Sorensen & Smith LLC, Hendrix Smith & Kir LLC, Above & Beyond Home Inspection). Bare-`&` count is 8 vs 7 spaced (only 1 extra), low risk. |
| Surname "Carr"/"Co"/"Carrington" | `%CARR%`, bare `CO` | "Carr" probe returned only Carrillo, Carroll, Robinson-Carroll, Carrington — **all personal surnames, correctly NOT flagged** (token not in signal). Bare `CO`/`% CO ` produced 0 spurious matches. |
| `%GROUP%`, `%SERVICES%`, `%TRUST%` generic | Could catch personal trusts / "group" hobbies | 0 `TRUST` matches in book; `SERVICES`/`GROUP` matches were all businesses. Low risk here. |

**Data-quality side-finding (duplicates):** "Sorensen & Smith LLC" exists as **~9 near-duplicate accounts** ("Sorensen & Smith Llc", "Sorensen & Smith, Llc", and **six identical "SORENSEN AND SMITH LLC"** rows in Live Oak). Recommend de-duplication alongside reclassification.

---

## 7. Person-vs-their-business case (do NOT merge)

Confirmed the textbook case via shared phone:

| Phone | Commercial entity | Owner's personal account |
|---|---|---|
| `+13866231125` | **D And H Tractor Works LLC** (Tier 1, holds `gl`) | **Horace Witt** (Tier 2, holds `commercial_auto`) |

**Recommendation:** Keep these as **two SEPARATE accounts** — do not merge. Re-type the entity ("D And H Tractor Works LLC") to `commercial_business`; keep "Horace Witt" as the personal/household account for his personal auto/home, and **relate** them (commercial entity ↔ its owner's personal lines) via `commercial_business_accounts.primary_contact_id` or a relationship link. This preserves both the commercial book and the personal cross-sell relationship. Apply the same "separate but related" rule wherever a personal account and a commercial entity share a phone/address.

---

## 8. Compact example table (25 of 101 candidates)

| Name | Signal | Current → Recommended |
|---|---|---|
| Donald Roberts Masonry Llc | BOTH (name+gl) | household → commercial_business |
| Cannon Cleaning Company LLC | BOTH (name+gl) | household → commercial_business |
| Plumbing Concepts Inc | BOTH (name+GL) | household → commercial_business |
| Seth Heitzman Construction Inc | BOTH (name+GL) | household → commercial_business |
| China House 58 Inc | BOTH (name+GL) | household → commercial_business |
| Garden Maze Inc | BOTH (name+workers_comp) | household → commercial_business |
| Meeks Grain Inc | BOTH (name+commercial_auto) | household → commercial_business |
| Evergreen Baptist Church | BOTH (name+commercial_auto) | household → commercial_business |
| True Life Apostolic Church | BOTH (name+comm GL/property) | household → commercial_business |
| Assured Property Management Llc | BOTH (name+commercial_auto) | household → commercial_business |
| Robey Investments Llc | BOTH (name+commercial_property) | household → commercial_business |
| Local Roots Apothecary LLC | BOTH (name+gl) | household → commercial_business |
| D And H Tractor Works LLC | BOTH (name+gl) | household → commercial_business (relate to Horace Witt) |
| BoxDrop Live Oak | LINE (commercial) | household → commercial_business |
| Friendly Hands Cleaning | LINE (commercial) | household → commercial_business |
| Dale'S Mobile Homes Setup | LINE (commercial) | household → commercial_business |
| Road Runner Tire And Break Express | LINE (commercial) | household → commercial_business |
| Horace Witt | LINE (commercial_auto) | review — likely keep personal + relate to his LLC |
| Country Electric Llc | NAME | household → commercial_business |
| Don'S Septic And Fill Inc | NAME | household → commercial_business |
| Red'S Tree Service Llc | NAME | household → commercial_business |
| Bienvenido Samera, Md Pa | NAME (medical PA) | household → commercial_business |
| Branford Family Medical Center Inc | NAME | household → commercial_business |
| Harry Branch | NAME (%RANCH% FP) | **household → KEEP household (false positive)** |
| Blue Oak Manufacturing, LLC | BOTH | already commercial — **demo data, exclude** |

---

## 9. Full reclassification candidate list (101 accounts)

Signal key: **BOTH** = name+commercial line (Tier 1); **LINE** = commercial policy only (Tier 2); **NAME** = entity-name only (Tier 3). `*` = exclude/handle specially.

### Tier 1 — BOTH (24; exclude Blue Oak demo & Lewis & Lewis agency)
1. Assured Property Management Llc (Mcalpin, FL)
2. B & B Homes New Home Builders Inc
3. Beachville Advent Christian Church
4. Blue Oak Manufacturing, LLC  *(demo data — exclude)*
5. Cannon Cleaning Company LLC
6. China House 58 Inc
7. D And H Tractor Works LLC  *(relate to Horace Witt)*
8. Donald Roberts Masonry Llc
9. Elite Rc Productions Llc (Lake City, FL)
10. Evergreen Baptist Church (Lake City, FL)
11. Ferrell'S Inc (Branford, FL)
12. Garden Maze Inc (Lake City, FL)
13. Levings Forest Products Inc
14. Lewis & Lewis Insurance Agency Inc  *(agency's own / internal — exclude)*
15. Local Roots Apothecary LLC
16. Meeks Grain Inc (Lake City, FL)
17. Pbc Inc (Live Oak, FL)
18. Plumbing Concepts Inc
19. Robey Investments Llc
20. Seth Heitzman Construction Inc
21. Sorensen & Smith Llc (Live Oak, FL)  *(de-dupe — see Tier 3)*
22. Stan Jacobs LLC
23. Topline Home And Aluminum Services
24. True Life Apostolic Church (O Brien, FL)

### Tier 2 — LINE only / personal- or brand-named businesses (24)
25. BoxDrop Live Oak
26. Brandon Burchfield (Branford, FL)
27. Cleveland Dix (Lake City, FL)
28. Dale'S Mobile Homes Setup (Lake City, FL)
29. David Gathings (Dade City, FL)
30. Dionne Latham (Lake City, FL)
31. Friendly Hands Cleaning
32. Garvin Garling (Lake City, FL)
33. Heng Zhang (Lake City, FL)
34. Horace Witt (Lake City, FL)  *(keep personal + relate to D And H Tractor Works LLC)*
35. Howard Peer (Lake City, FL)
36. James Clayton (Lake City, FL)
37. James Ruis (White Springs, FL)
38. Jorge Sanchez (Lake City, FL)
39. Levi Polhill (Lake City, FL)
40. Luke McInnis (O'Brien, FL)
41. Mary L Hygema
42. Melinda Shrum (Lake City, FL)
43. Michelle Nowlen (Lake City, FL)
44. Randall Mccray (Fort White, FL)
45. Road Runner Tire And Break Express
46. Sherman Byrd (Branford, FL)
47. Thomas Starling
48. William Webster (Brandford, FL)

> Tier-2 review note: several of these are likely sole-proprietors whose *personal* lines should stay personal while a related commercial entity is created — apply the Horace Witt pattern (separate but related). Confirm per account before flipping `type`.

### Tier 3 — NAME only (53; review, exclude noted FPs)
49. 3 Sevens Properties Llc
50. Aamp Carpentry Llc
51. Above & Beyond Home Inspection
52. Across The Board Services
53. All Seasons Planning Inc
54. AMERIZAM INC (Lake City, FL)
55. Bienvenido Samera, Md Pa (Branford, FL)
56. Branford Family Medical Center Inc
57. Buffalo Joe'S Inc
58. Cabinet Stuff Inc
59. Cas Solutions Llc
60. Country Electric Llc
61. Custom Trim Works Llc
62. Darrell Townsend Custom Framing Llc
63. Deadline Solutions Inc
64. Don'S Septic And Fill Inc
65. Dredge And Mine Llc
66. Ed Carey Electric Llc
67. Elite Rc Productions Llc  *(dup of Tier-1 #9)*
68. Gateway Development Llc
69. Girard Place Owners Association Inc
70. Gsgc Leasing Llc (Lake City, FL)
71. Gsms Developers Inc
72. H & J Resturant Inc
73. Harry Branch (Gainesville, FL)  *(FALSE POSITIVE — %RANCH%; keep household)*
74. Hendrix Smith & Kir Llc
75. Kings Land Services Llc
76. Lofstrom Builders Llc
77. M&J Plant Solutions Llc
78. Maddox Construction Services Llc
79. Martin Exteriors Inc
80. Mc Farms Inc
81. Montgomery Services Llc
82. New China Town Liveoak Inc
83. Pbc Inc  *(dup of Tier-1 #17)*
84. Prime Shine Exterior Services
85. Quality Seal Services Llc
86. R J H Drywall Corporation
87. Red'S Tree Service Llc
88. Rescue Cutters Inc
89. Shelia Branch  *(FALSE POSITIVE — %RANCH%; keep household)*
90. Shepard Window Services Llc
91. Sorensen & Smith, Llc (Live Oak, FL)  *(duplicate)*
92. SORENSEN AND SMITH LLC (Live Oak, FL)  *(duplicate)*
93. SORENSEN AND SMITH LLC (Live Oak, FL)  *(duplicate)*
94. SORENSEN AND SMITH LLC (Live Oak, FL)  *(duplicate)*
95. SORENSEN AND SMITH LLC (Live Oak, FL)  *(duplicate)*
96. SORENSEN AND SMITH LLC (Live Oak, FL)  *(duplicate)*
97. SORENSEN AND SMITH LLC (Live Oak, FL)  *(duplicate)*
98. Startech Lake City Inc
99. Stillwater Pool Service Llc
100. The Plantations On S Llc
101. William Scott Construction Inc

**De-duplication note:** Entries 21, 91–97 are the same business ("Sorensen & Smith LLC", Live Oak) under ~9 spelling variants including six identical "SORENSEN AND SMITH LLC" rows. Collapse to one commercial account.

**Net real reclassification target:** 101 flagged − ~2 demo/agency (Blue Oak, Lewis & Lewis) − 2 name FPs (Harry/Shelia Branch) − ~8 Sorensen duplicates − 2 internal dups (Elite Rc, Pbc counted in both tiers) ≈ **~87 distinct genuine commercial businesses** to re-type, plus the Horace-Witt-style personal accounts kept-but-related.
