# Data Audit A — Duplicate Accounts (Lewis Insurance / InsureFlow)

**Auditor angle:** Duplicate accounts = the same person/entity represented by 2+ active account rows. Spouses / different-person-same-address are treated as **households**, NOT duplicates, and are excluded from dup tiers (called out as false-positive risks).
**Scope:** Active book = `accounts WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL` = **1,610 accounts**, **2,164 active policies**.
**Date:** 2026-06-27. **Mode:** READ-ONLY (no data modified).

---

## 1. Methodology & normalization

- **Name key (`nkey`)** = `regexp_replace(lower(trim(name)),'[^a-z0-9]','','g')` — lowercase, strip all non-alphanumerics. Collapses "Charles Amick"/"Charles  Amick", punctuation, etc. (Note: does NOT collapse "Jr"/middle initials — handled separately.)
- **Phone** = digits only (`regexp_replace(phone,'\D','','g')`). Stored format is `+1XXXXXXXXXX`; we compare on the 10/11-digit string and require length >= 10.
- **Address** = `lower(trim(address_line1))` exact; plus a **normalized address** variant that strips punctuation and common street-suffix tokens (st/rd/dr/ln/pl/ter/ct/ave/cir/gln/blvd/cr/etc.) and spaces, to catch "Summer Breeze Pl" vs "Summerbreeze Place".
- **Email** = `lower(trim(email))`.
- **Internal-account exclusion (NULL-safe)** — must use `coalesce(col,'') NOT ILIKE …`, because the naive `NOT (a OR b)` form evaluates to NULL when address/phone is NULL and silently drops ~65 clusters. Excluded: `address_line1 ILIKE '%1313 W US HWY 90%'`, `phone='3863628300'`, `name ILIKE '%lewis insurance%'`, `name ILIKE '%daysheet%'`, `name ILIKE 'brian%lewis%'`.
- **Shared property-manager contact** excluded from email/phone-only matching: `jessicamurphy@circleoflifecommunities.com`, phone `13866889318`.

A "cluster" = a set of 2+ active accounts sharing the same `nkey`. **83 exact-name clusters / 176 accounts** exist in the active book.

---

## 2. Existing dedup scaffolding — what's in it

| Table | Rows | Contents / verdict |
|---|---|---|
| `duplicate_groups` | 362 | All `entity_type='accounts'`, all `status='pending'` (NONE reviewed), all pairs (group size = 2), avg `match_score` 0.969, created 2026-06-22, `rule_id` NULL. **340 pairs have both accounts in the active book; 22 reference deleted/out-of-book accounts.** These are unreviewed fuzzy candidate pairs. |
| `duplicate_flags` | 0 | Empty — no manual flags. |
| `merge_history` | 0 | Empty — **no merges have ever been executed.** Columns: `survivor_id`, `merged_ids[]`, `merge_data jsonb`, `merged_by`. |

**Reuse verdict:** `duplicate_groups` is a useful *candidate* list but contains **no decisions** (all pending, no reviewer, no rule). It is also **noisier than reality**: of the 340 in-book pairs, 220 share my exact `nkey`, **120 do not** (looser fuzzy matches), and **24 have a different surname token** (household/shared-contact false positives — see §6). The scaffolding's first pair is even the internal BRIAN LEWIS account. **Recommendation: do not auto-merge from `duplicate_groups`. Use it as input, intersect with the tiers below, and write decisions into `duplicate_flags` / `merge_history` (currently empty) after human review.**

---

## 3. Sizing per tier (exact-name clusters, internal excluded)

| Tier | Definition | Clusters | Confidence |
|---|---|---|---|
| **T1 EXACT DUP** | same `nkey` + two rows share an **identical populated address OR phone** (no conflict) | **21** (22 with suffix-normalized address) | Highest |
| **T2 STRONG DUP** | same `nkey` + same email, or same single zip, with one populated + one complementary/empty contact row (no conflicting addr/phone) | **58** | High |
| **T3 POSSIBLE DUP** | same `nkey` but **conflicting addresses** (2 properties or a move) | **4** | Medium (review) |
| **Total** | | **83** | |
| **Identical-policy dups** | two same-name accounts each carrying a policy with the **same carrier + line + effective_date** | **4 pairs** | Very high (subset of above) |

Cross-checks: name-only-no-contact clusters = 0 (every cluster has at least one usable identifier and at least one policy). All 83 clusters contain >= 1 active policy. The scaffolding's 340 in-book pairs ≈ these 83 clusters expanded to pairs (clusters of size 3+ generate multiple pairs) PLUS the 120 fuzzy + 24 household extras.

---

## 4. T1 EXACT-DUP clusters (highest confidence — 21)

`*` = address is a pure formatting variant (same place, different abbreviation) — strongest possible signal.

| Name | Rows | Why | Address(es) |
|---|---|---|---|
| Donald Harris | 3 | shared addr | 1108 sw bluff dr |
| Terry Wilber | 3 | shared addr | 442 sw morning glory dr |
| Thomas Allen | 3 | shared addr | 603 nw winfield st / 914 nw indian shore dr |
| Heng Zhang | 3 | shared phone | 3 different addresses (review — could be family) |
| Aundra Weston | 2 | shared addr | 408 ne fronie st |
| Carey Handley | 2 | shared addr | 4851 sw 139th pl |
| Charles Amick* | 2 | shared phone | 214 sw copperhead lane / …ln |
| Helen Lee | 2 | shared addr | 682 ne saint clair st |
| Howard Smith | 2 | shared addr | 122 sw loblolly pl |
| Jennafer Hochmuth | 2 | shared addr | 382 sw silver palm dr |
| John Hughes | 2 | shared addr | 1688 sw paloma ct |
| Michael Barrs | 2 | shared addr | 142 sw sarah ct (two phones) |
| Molly Frazier* | 2 | shared phone | 367 sw story pl / story place |
| Nelson Lucier | 2 | shared addr | 536 sw heathridge dr |
| Nick Reid | 2 | shared addr | 26838 41st rd |
| Ross Meyers | 2 | shared addr | 110 se elm loop |
| Teresa Dellinger* | 2 | shared phone | 809 sw summer breeze pl / summerbreeze place |
| Tracy Cruce | 2 | shared addr | 19816 nw county road 235 (identical-policy dup) |
| Wade Heitzman | 2 | shared addr | 507 sw hamlet cir |
| Ziad Darwiche | 2 | shared addr | 521 sw starlight ct |
| James Lawrence | 2 | shared phone | 4044 ford st / 9907 132nd st (review — diff addr) |

> Watch within T1: "shared phone, different address" (Heng Zhang, James Lawrence) is weaker than "shared address" — a shared landline/cell can mean family members. Treat shared-address rows as auto-merge candidates; shared-phone-only as review.

## 5. T3 / formatting-variant clusters (same name, address differs — review)

Many of these are actually **strong dups hidden by address formatting** (recommend merge), a few are **genuine multi-property** (keep separate):

| Name | Rows | Addresses | Read |
|---|---|---|---|
| Sorensen & Smith / SORENSEN AND SMITH LLC* | 6 + 2 | "181 rachera st nw" vs "181 ranchera st nw" (typo) **plus** 117/125/300/308 mesa, 2312 vista, 181 ranchera | Mixed: the "rachera/ranchera" pair = dup; the 6-address LLC = commercial multi-property, KEEP separate (also the 2 identical-policy DF3 rows likely = separate buildings). |
| Michael Millikin* | 2 | "2023 sw state rd 47" / "state road 47" | DUP |
| Charles Amick* | 2 | "copperhead lane" / "ln" | DUP |
| Molly Frazier* | 2 | "story pl" / "story place" | DUP |
| Teresa Dellinger* | 2 | "summer breeze pl" / "summerbreeze place" | DUP |
| Gary Howard* | 2 | "599 nw 93rd ln" / "613 nw 93rd lane" | Likely DUP (same street, # differs by 14 — verify) — also identical-policy (Progressive auto) |
| Melinda Shrum* | 2 | "1811 county rd 242a" / "1811 sw cr 242a" | DUP |
| Cindi Brennan | 4 | 3 distinct addresses across 32024/25/55 | Review — possible moves over time |
| Paul Bryan | 2 | 1079 sandy point rd (33827) / 1731 sw koonville (32024) | Possible 2 properties or move |
| Derek Aultman | 2 | 213 sw scarlett (32025) / 5264 149th rd (32060) | Possible 2 properties |
| Kevin Fletcher | 2 | 25684 cr 49 (32071) / 8504 262nd ter (32008) | Possible 2 properties |

## 6. Identical-policy duplicates (same carrier + line + effective_date)

| Account | Carrier | Line | Effective date | Read |
|---|---|---|---|---|
| Tracy Cruce | American Integrity | PP | 2025-12-30 | True dup (also T1 same address) — **merge** |
| Gary Howard | Progressive | auto | (null eff) | Likely dup — verify (null date weakens) |
| SORENSEN AND SMITH LLC | American Integrity | DF3 | 2025-10-24 | Commercial multi-property — likely **separate** buildings, not a merge |
| SORENSEN AND SMITH LLC | American Integrity | DF3 | 2026-05-12 | Same as above |

---

## 7. Survivor-selection rule (recommended)

Apply this cascade per cluster; first decisive criterion wins:

1. **Most active policies** (`policies.deleted_at IS NULL`) — the row carrying the book of business. Decides **32 / 83** clusters.
2. **Most complete contact** (count of populated email + phone + address_line1). Decides a further **40 / 83**.
3. **Most recently updated** (`updated_at` MAX — fully populated, 176/176 rows). Breaks the remaining **11 / 83** ties.
4. On merge: keep survivor's identity but **union** all non-null contact fields and **re-parent all active policies** from the losing rows; capture losers in `merge_history.merged_ids` with `survivor_id` and a `merge_data` snapshot.

This ordering protects revenue (never drop the policy-bearing row), then data quality, then recency.

---

## 8. False-positive risks (DO NOT auto-merge)

1. **Households (different given AND surname, same address/phone/email)** — these are spouses/housemates, a separate concept. Confirmed in scaffolding: `Carlene Rhodes`+`Ronald Myers`, `Ronald Rhodes`+`Ronald Myers` (blended 3-person household at 148 SW Cherry Blossom Way), `Deserrai Davis`+`Myranda Montemurno`, `Mary Williams`+`James Dorman`, `Tony Anderson`+`Teresa Mack`. (24 such different-surname pairs in `duplicate_groups`.)
2. **Father/son "Jr" suffix at same address** — `Dewey Moore`/`Dewey Moore Jr`, `John Holloway`/`John Holloway Jr`. Near-identical names but **two real people**; `nkey` would merge them. KEEP separate — flag for manual confirm only.
3. **Name-order/name-swap ambiguity** — `Thomas Howard`/`Howard Thomas`, `William Thomas`/`Thomas Williams`. Could be a data-entry first/last swap (dup) OR two distinct people. Manual review required.
4. **Person ↔ their business entity** sharing one phone/email — `Max Bass`/`BoxDrop Live Oak`, `Horace Witt`/`D And H Tractor Works LLC`. Often legitimately separate (personal lines vs commercial). Do not merge on shared phone alone.
5. **Commercial multi-property accounts** — `SORENSEN AND SMITH LLC` (6 addresses). Same name + multiple addresses is expected, not duplication.
6. **Shared property-manager / agency contact** — phone `13866889318`, email `jessicamurphy@circleoflifecommunities.com`, and the internal agency cluster (1313 W US HWY 90 / 3863628300 / "Lewis Insurance Daysheets" / "BRIAN LEWIS"). Never treat shared phone/email **alone** as a duplicate signal.
7. **Address formatting variants cut both ways** — they cause *missed* dups (false negatives) when exact-matching addresses; recommend the suffix-normalized address key in production matching.

---

## 9. Recommended next actions

1. **Auto-merge-eligible (after spot check):** ~17 of 21 T1 clusters with a *shared address* and no Jr/household/swap flag. Highest ROI, lowest risk.
2. **Queue for human review:** all 58 T2, the 4 T3, all shared-phone-only T1, and every pair flagged in §8 (Jr, name-swap, person/business, multi-property).
3. **Operationalize:** add a `rule_id` taxonomy to `duplicate_groups`, write confirmed decisions to `duplicate_flags`, and record executed merges in `merge_history` (both currently empty). Re-run detection with the suffix-normalized address key to recover false-negative dups.

---

### Appendix — key SQL (exact-name tiering, NULL-safe internal exclusion)

```sql
WITH book AS (
  SELECT id,
    regexp_replace(lower(trim(coalesce(name,''))), '[^a-z0-9]', '', 'g') AS nkey,
    lower(trim(coalesce(address_line1,''))) AS addr1,
    coalesce(zip_code,'') AS zip,
    regexp_replace(coalesce(phone,''), '\D', '', 'g') AS phone_d,
    lower(trim(coalesce(email,''))) AS em
  FROM accounts
  WHERE agency_workspace_id='f1f07037-3032-45f8-93ca-72c0f47e4fbb' AND deleted_at IS NULL
    AND name IS NOT NULL AND trim(name) <> ''
    AND coalesce(address_line1,'') NOT ILIKE '%1313 W US HWY 90%'
    AND coalesce(phone,'') <> '3863628300'
    AND coalesce(name,'') NOT ILIKE '%lewis insurance%'
    AND coalesce(name,'') NOT ILIKE '%daysheet%'
    AND coalesce(name,'') NOT ILIKE 'brian%lewis%'
),
flagged AS (
  SELECT b.*,
    COUNT(*) FILTER (WHERE addr1<>'')                          OVER (PARTITION BY nkey, NULLIF(addr1,''))    AS addr_dups,
    COUNT(*) FILTER (WHERE length(phone_d)>=10)                OVER (PARTITION BY nkey, NULLIF(phone_d,''))  AS phone_dups,
    COUNT(*) FILTER (WHERE em<>'')                             OVER (PARTITION BY nkey, NULLIF(em,''))       AS email_dups
  FROM book b
),
grp AS (
  SELECT nkey, COUNT(*) cnt,
    COUNT(DISTINCT NULLIF(addr1,'')) d_addr,
    COUNT(DISTINCT NULLIF(zip,''))   d_zip,
    COUNT(DISTINCT NULLIF(phone_d,'')) FILTER (WHERE length(phone_d)>=10) d_phone,
    COUNT(DISTINCT NULLIF(em,''))    d_email,
    MAX(addr_dups) addr_agree, MAX(phone_dups) phone_agree, MAX(email_dups) email_agree
  FROM flagged GROUP BY nkey HAVING COUNT(*) > 1
)
SELECT
  COUNT(*) FILTER (WHERE addr_agree>=2 OR phone_agree>=2)                                   AS t1_exact,
  COUNT(*) FILTER (WHERE NOT (addr_agree>=2 OR phone_agree>=2)
                   AND (email_agree>=2 OR d_zip=1) AND d_addr<=1 AND d_phone<=1)             AS t2_strong,
  COUNT(*) FILTER (WHERE d_addr>1 OR d_phone>1 OR d_email>1)                                AS t3_possible,
  COUNT(*)                                                                                  AS total
FROM grp;
-- -> t1≈21, t2≈58, t3≈4, total 83
```

Identical-policy detection:
```sql
... book b1 JOIN book b2 ON b1.nkey=b2.nkey AND b1.id<b2.id
    JOIN policies p1 ON p1.account_id=b1.id AND p1.deleted_at IS NULL
    JOIN policies p2 ON p2.account_id=b2.id AND p2.deleted_at IS NULL
      AND lower(trim(p2.carrier))=lower(trim(p1.carrier))
      AND lower(trim(p2.line_of_business))=lower(trim(p1.line_of_business))
      AND p2.effective_date IS NOT DISTINCT FROM p1.effective_date
      AND coalesce(trim(p1.carrier),'')<>'';   -- -> 4 pairs
```
