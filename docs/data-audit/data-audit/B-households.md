# Lewis Insurance — Household Audit (Auditor B: Householding)

**Date:** 2026-06-27
**Scope:** Active book = `accounts WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL` (1,610 accounts). Policies via `policies.account_id` where `deleted_at IS NULL`. READ-ONLY analysis — no data modified.
**Goal:** Group DIFFERENT people who share a household into one household record (e.g. spouses with his boat + her home), so cross-sell can be worked at the household level.

---

## 1. Methodology

**Population.** Of 1,610 active accounts, 1,474 remain after excluding the agency office and rows with no usable ZIP (office traps: ZIP `32055`, address `1313 W US HWY 90`, phone `3863628300`, names `Lewis Insurance Daysheets` / `BRIAN LEWIS` / `Brian Thomas Lewis`). Field coverage on the full book: 1,020 have address+ZIP, 662 email, 761 phone.

**Normalization (all in SQL, no data written):**
- **surname** = last whitespace token of `name`, lower-cased (names are "First Last" or "First M Last", e.g. `John W Glass`).
- **house_no** = first whitespace token of `address_line1`.
- **addr_n** = `address_line1` lower-cased, punctuation stripped, whitespace collapsed (tolerates `Rd.`/`Road`, `Be`/`Holly` typos only where the rest matches exactly).
- **phone_n** = digits only; matched only when ≥10 digits.
- **email_n** = trimmed, lower-cased.

**Signals (an account joins a household if it shares ANY with a member):**
| Code | Signal | Tier |
|------|--------|------|
| A | surname + house_no + ZIP | HIGH |
| B_same | exact addr_n + ZIP, **same** surname | HIGH |
| B_diff | exact addr_n + ZIP, **different** surname | MEDIUM |
| C | shared email | MEDIUM |
| D | shared phone (≥10 digits) | LOW |

**Edge counts (raw, before union):** A=48, addr+ZIP=38 (B_same+B_diff), email=19, phone=27.

**Connected components.** All edges unioned into an undirected edge list, then a recursive min-label propagation assigns each node the lexicographically-smallest member id in its component (label = canonical household key). Implemented as one `WITH RECURSIVE` over `uedges`; `MIN(label::text)` because ids are UUIDs.

**Household tier** = max tier of any edge inside the component: HIGH if any A/B_same; else MEDIUM if any B_diff/C; else LOW (phone-only).

**Lines of business** are dirty (case + synonyms: `auto`/`Auto`/`pp`/`auto_policy`; `home`/`Home`/`ho8`/`dp3`/`df3`/`renters`/`property`; `boat`/`Watercraft`; `travel_trailer`/`motor_home`; `commercial_*`/`gl`/`bop`/`workers`; `life`). Canonicalized into 7 groups: **auto, home, boat, motorcycle, rv, commercial, life** (+`other`). **MIXED-LINE** = members of a household collectively hold ≥2 distinct canonical groups — these are the cross-sell-valuable households.

---

## 2. Exact SQL (core query)

```sql
WITH base AS (
  SELECT id, name,
    LOWER(SPLIT_PART(TRIM(name),' ',GREATEST(1,array_length(string_to_array(TRIM(name),' '),1)))) AS surname,
    LOWER(city) AS city_n, zip_code,
    NULLIF(regexp_replace(regexp_replace(LOWER(TRIM(address_line1)),'[^a-z0-9 ]','','g'),'\s+',' ','g'),'') AS addr_n,
    NULLIF(SPLIT_PART(TRIM(address_line1),' ',1),'') AS house_no,
    regexp_replace(COALESCE(phone,''),'[^0-9]','','g') AS phone_n,
    LOWER(NULLIF(TRIM(email),'')) AS email_n
  FROM accounts
  WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL
    AND COALESCE(zip_code,'')<>'32055'
    AND name NOT IN ('Lewis Insurance Daysheets','BRIAN LEWIS','Brian Thomas Lewis')
    AND COALESCE(regexp_replace(COALESCE(phone,''),'[^0-9]','','g'),'')<>'3863628300'
    AND COALESCE(address_line1,'') NOT ILIKE '%1313 W US HWY 90%'
),
e_a AS (SELECT a.id id1,b.id id2 FROM base a JOIN base b
   ON a.surname=b.surname AND a.house_no=b.house_no AND a.zip_code=b.zip_code AND a.id<b.id
   WHERE a.surname<>'' AND a.house_no IS NOT NULL AND a.zip_code IS NOT NULL),
e_b AS (SELECT a.id id1,b.id id2,(a.surname=b.surname) same_surname FROM base a JOIN base b
   ON a.addr_n=b.addr_n AND a.zip_code=b.zip_code AND a.id<b.id
   WHERE a.addr_n IS NOT NULL AND a.zip_code IS NOT NULL),
e_c AS (SELECT a.id id1,b.id id2 FROM base a JOIN base b ON a.email_n=b.email_n AND a.id<b.id WHERE a.email_n IS NOT NULL),
e_d AS (SELECT a.id id1,b.id id2 FROM base a JOIN base b ON a.phone_n=b.phone_n AND a.id<b.id WHERE LENGTH(a.phone_n)>=10),
edges AS (SELECT id1,id2 FROM e_a UNION SELECT id1,id2 FROM e_b
          UNION SELECT id1,id2 FROM e_c UNION SELECT id1,id2 FROM e_d),
uedges AS (SELECT id1::text src,id2::text dst FROM edges UNION SELECT id2::text,id1::text FROM edges),
prop AS (
  WITH RECURSIVE p AS (
    SELECT src node, src label FROM uedges
    UNION SELECT u.dst,pr.label FROM p pr JOIN uedges u ON u.src=pr.node)
  SELECT node, MIN(label) comp FROM p GROUP BY node)
SELECT comp, COUNT(*) sz FROM prop GROUP BY comp;   -- component sizes
```
Tiering joins `e_*` back to `prop` to label each edge's component, then `bool_or(kind IN ('A','B_same'))` → HIGH, etc. LOB canonicalized with `CASE ... ~ 'regex'` on `lower(line_of_business)`, joined via `policies.account_id`.

---

## 3. Sizing results

**55 multi-account households** formed, grouping **117 accounts** (≈8% of the 1,474-account population). All singletons (1,357 accounts) are unaffected.

**Household-size distribution:**
| Size | Households | Accounts |
|------|-----------|----------|
| 2 | 49 | 98 |
| 3 | 5 | 15 |
| 4 | 1 | 4 |
| (5 incl. via email/phone) | — | see tier table |

*(Address-only components top out at size 4; two larger size-5/7 clusters appear once email/phone edges are added — Barrs and Max Bass below.)*

**By confidence tier:**
| Tier | Households | Accounts | Mixed-line |
|------|-----------|----------|-----------|
| HIGH (A / B_same) | 42 | 89 | 35 |
| MEDIUM (B_diff / email) | 7 | 16 | 6 |
| LOW (phone-only) | 6 | 12 | 3 |
| **Total** | **55** | **117** | **44** |

**44 of 55 households (80%) are MIXED-LINE** — the cross-sell targets (one member has home, another has auto/boat/etc.).

---

## 4. Representative households (all 55 listed; 20 highlighted in chat report)

Format: **Tier | Members (lines) | City ZIP | signals**

### HIGH tier (42) — safe to auto-link

1. **Barrs** — Michael Barrs (auto,boat,motorcycle, 3 accts) + Darlene Barrs (rv) | Lake City 32024 | A,B_same,C,D — MIXED (auto+boat+home+mc+rv)
2. **Frazier (Kelley/Tom)** — Kelley Frazier (auto,home,rv ×3) + Tom Frazier (boat) | Lake City 32025 | A — MIXED
3. **Fletcher** — George Fletcher (home,rv ×2) + Kevin Fletcher (auto,home ×2) | Branford 32008 | A — MIXED
4. **Young** — James Young (auto,motorcycle ×2) + Jonathan Young (auto,boat ×2) | Branford 32008 | A,B_same — MIXED
5. **Wilber** — Terry Wilber (auto,boat,motorcycle ×3 + home) | Lake City 32024 | A,B_same — MIXED
6. **Myers/Rhodes** — Ronald Myers (auto,boat ×2) + Ronald Rhodes (home) + Carlene Rhodes (rv) | Lake City 32024 | A,B_diff,B_same,C,D — MIXED *(spec seed: shared email/phone, diff surname, same address)*
7. **Estelle** — Forest Estelle (auto,home ×2) + Phillip Estelle (auto,home ×2) | White Springs 32096 | A — MIXED
8. **Garrett** — Robert Garrett (auto,boat ×2) + Windi Garrett (home) | Lake City 32024 | A,B_same — MIXED
9. **Frazier (Molly/Paul)** — Molly Frazier (auto + home) + Paul Frazier (boat) | Lake City 32024 | A,B_same,C,D — MIXED
10. **Hanson** — Edwin Hanson (auto,motorcycle ×2) + Joshua Hanson (auto) | Lake City 32024 | A,B_same — MIXED
11. **Howell** — John Howell (auto,boat ×2) + Kimberly Howell (auto) | Branford 32008 | A,B_same — MIXED
12. **Williams (Jimmy/Sherry)** — Jimmy Williams (home,motorcycle ×2) + Sherry Williams (auto) | Lake City 32024 | A,B_same,C — MIXED
13. **Kent** — Cynthia Kent (auto,rv ×2) + Lean Kent (auto) | Lake Butler 32054 | A — MIXED
14. **Hughes** — John Hughes (auto,boat ×2 + home) | Lake City 32025 | A,B_same,C,D — MIXED
15. **Millikin** — Michael Millikin (auto,home ×2 + boat) | Lake City 32025 | A,C — MIXED
16. **Harris** — Donald Harris (auto,home ×2 + motorcycle) | Fort White 32038 | A,B_same,D — MIXED
17. **Floyd** — Jason Floyd (boat) + Mimi Floyd (home) | Lake City 32024 | A,B_same — MIXED *(spec seed example)*
18. **Sanchez** — Jorge Sanchez (commercial) + Lori Sanchez (auto) | Lake City 32024 | A,B_same — MIXED
19. **Oellrich** — George Oellrich (auto) + Robert Oellrich (home) | White Springs 32096 | A,B_same — MIXED
20. **Newsome** — Mary Newsome (home) + Phillip Newsome (auto) | Lake City 32024 | A,B_same — MIXED
21. Amick — Charles Amick (auto + home) | Fort White 32038 | A,D — MIXED
22. Meyers (Ross) — Ross Meyers (auto + home) | Lake City 32025 | A,B_same — MIXED
23. Dellinger — Teresa Dellinger (auto + home) | Lake City 32025 | A,C,D — MIXED
24. Smith (Howard) — Howard Smith (auto + home) | Lake City 32024 | A,B_same — MIXED
25. Lucier — Nelson Lucier (auto + home) | Lake City 32024 | A,B_same,D — MIXED
26. Shrum — Melinda Shrum (auto + commercial) | Lake City 32025 | A — MIXED
27. Heitzman — Wade Heitzman (auto + home) | Lake City 32024 | A,B_same — MIXED
28. Reid — Nick Reid (auto + home) | Branford 32008 | A,B_same,D — MIXED
29. Handley — Carey Handley (auto + home) | Lake Butler 32054 | A,B_same,D — MIXED
30. Morrison — Deborah Morrison (motorcycle) + James Morrison (auto) | Fort White 32038 | A,B_same,C,D — MIXED
31. Hochmuth — Jennafer Hochmuth (auto + home) | Lake City 32024 | A,B_same,D — MIXED
32. Bevington — Kelly Bevington (motorcycle) + Timothy Bevington (boat) | Wellborn 32094 | A,B_same,C,D — MIXED
33. Bryant — Donna Bryant (auto) + Tommy Bryant (home) | Mc Alpin 32062 | A,B_same — MIXED
34. Sund — Greg Sund (home) + "Gregory or Susan Sund" (auto) | Lake City 32024 | A,B_same,D — MIXED
35. Sorensen & Smith LLC + GSGC Leasing LLC — (auto,commercial,home, 5 accts) | Live Oak 32064 | A,B_same,C,D — MIXED **[commercial cluster, see risks]**
36. Bartelli — Jenna Bartelli (auto) + Tina Bartelli (auto) | Lake City 32024 | A,B_same — auto-only
37. Salazar — Carlos Salazar (auto) + Jose Salazar (auto) | Live Oak 32064 | A,B_same — auto-only
38. Brown — Quarnessia Brown (auto) + Terrance Brown (auto) | Lake City 32025 | A — auto-only
39. Cruce — Tracy Cruce + Tracy Cruce (auto) | Lake Butler 32054 | A,B_same — **dup of one person**
40. Darwiche — Ziad Darwiche + Ziad Darwiche (auto) | Lake City 32024 | A,B_same — **dup of one person**
41. Osteen — Audrey Osteen (auto) + James Osteen (auto) | Lake City 32025 | A,B_same — auto-only
42. Glass — Jeremy Glass (auto) + John W Glass (auto) | Lake City 32024 | A — auto-only

### MEDIUM tier (7) — review before linking

43. **Max Bass cluster** — Max Bass (auto,boat,home,motorcycle ×4) + BoxDrop Live Oak (commercial) + True Life Apostolic Church (commercial,home ×2) | O Brien 32071 | C,D — **email/phone link bundles a person with two businesses — split before use**
44. Stansel — Kevin Stansel (auto) + Theron Stansel (auto,motorcycle ×2) | Wellborn 32094 | C — MIXED (shared email, same surname — likely real)
45. Samera — Bienvenido Samera (home) + "Bienvenido Samera Md Pa" (auto) + Sam Samera (auto) | Jacksonville 32608 | C,D — MIXED (person + their PA + relative)
46. Briggs/Carman — Sean Briggs (home) + Sean Carman (auto) | Lake City 32025 | B_diff — same address, diff surname (verify: roommates vs data error)
47. Smith (Donald/Edna) — Donald Smith (auto) + Edna Smith (boat) | shared email | 32008 vs Murphy NC | C — same surname, **but ZIP/state mismatch (Edna's ZIP 32008 with city Murphy NC is a data error)**
48. Goodrich/Russell — Theresa Goodrich (auto) + Theresa Russell (home) | Lake City 32025 | B_diff — same address+first name, diff surname (possible name change / remarriage)
49. Dorman/Williams — James Dorman (auto) + Mary Williams (auto) | Lake City 32025 | C — shared email, diff surname, auto-only — **weak, verify**

### LOW tier (6) — phone-only, human review required

50. Zhang — Heng Zhang ×3 (commercial,home) | Live Oak 32064 | D — **dup of one person/business**
51. Schneiders — Kimberly Schneiders (auto) + Michael Schneiders (motorcycle) | Lake City 32025 | D — MIXED, same surname (likely real, but phone-only)
52. Mack/Anderson — Teresa Mack (home) + Tony Anderson (auto) | Lake City "33909" | D — **diff surname, phone-only, ZIP 33909 looks wrong → likely FALSE POSITIVE**
53. Lawrence — James Lawrence ×2 (home) | Orlando 32811 | D — dup of one person
54. Davis/Montemurno — Deserrai Davis (home) + Myranda Montemurno (home) | Lake City 32025 | D — diff surname, phone-only → verify
55. D&H Tractor Works LLC + Horace Witt — (commercial) | Lake City 32025 | D — business owner ↔ business, phone-only

---

## 5. Recommended canonical key & auto-link policy

- **Canonical household key:** the lexicographically-smallest `account.id` (UUID) in the component — the label produced by the propagation query. Stable, collision-free, and recomputable. Store a display label as `surname + " — " + house_no + " " + ZIP` for HIGH-tier address households; fall back to the seed member's name for email/phone-only clusters.
- **AUTO-LINK (no human review): HIGH tier only** — surname+house#+ZIP (A) or same-surname exact-address (B_same). 42 households / 89 accounts. These are unambiguous (same family, same roof). Exclude the LLC/commercial cluster #35 from auto-link if households are meant to be residential.
- **HUMAN REVIEW: MEDIUM** (7) — diff-surname-same-address can be roommates, name changes, or address typos; shared-email can be a family inbox OR a shared agent/property email. Quick eyeball each.
- **DO NOT auto-link / lowest priority: LOW phone-only** (6) — highest false-positive rate; confirm each by phone/address before merging.

---

## 6. False-positive risks & data-quality flags

1. **Shared property-manager / agent contacts.** The brief flags `jessicamurphy@circleoflifecommunities.com` and phone `13866889318` as cross-account links between unrelated people. The union rule already down-weights phone to LOW; none of the 55 final households hinge solely on the known shared PM contacts (13866889318 appears with surnames=1 across 2 cities — a genuine same-person move, not a PM bundle). **Rule applied:** treat phone/email as joinable but tier them low when surnames AND cities differ.
2. **Person↔business bundling via shared email/phone** (clusters #35 Sorensen&Smith/GSGC, #43 Max Bass+BoxDrop+True Life Church, #55 D&H Tractor+Witt, #50 Zhang). A business and its owner legitimately share contact info but are not a "household" for personal-lines cross-sell. **Recommend: exclude `type='commercial_business'` accounts and obvious LLC/Church/PA names from householding, or tag these as "commercial-linked" not "household."**
3. **Duplicate-person rows masquerading as 2-member households** (#39 Cruce, #40 Darwiche, #50 Zhang, #53 Lawrence, and several "Name ×2/×3" inside HIGH households). These are correctly grouped but are **dedup candidates**, not multi-person households — route to a merge/dedup workflow, not cross-sell.
4. **ZIP/state data errors** create cross-region links: #47 Edna Smith (city Murphy NC carrying FL ZIP 32008), #52 Mack/Anderson (Lake City with ZIP 33909 = Cape Coral). House-number+ZIP matching is generally robust to these, but verify before acting.
5. **Diff-surname same-address (B_diff)** — #46 Briggs/Carman, #48 Goodrich/Russell — could be remarriage/name-change (real household) or two unrelated tenants at the same rental. Human review.

**Net:** 42 HIGH households (89 accounts) are safe to auto-link now; 35 of them are mixed-line and immediately cross-sell-actionable. 13 MEDIUM/LOW households need a human pass, and ~6 "households" are actually duplicate-person or person↔business records that should be diverted to dedup / commercial handling rather than treated as cross-sell households.
