# PARKED — Wave 3 Household Review Queue (MEDIUM / LOW + same-name)

**Gate:** Wave 3 / HH-10. **25 HIGH households** were auto-linked (different-person, same surname + roof). The **12 below are REVIEW-ONLY** — not linked until a human confirms. Approve a household by linking its members:
```sql
-- members + household id:
SELECT * FROM cleanup.hh_review_queue;        -- the queue
SELECT household_id, account_id FROM cleanup.hh_candidates WHERE household_id = '<id>';
-- approve:
UPDATE accounts SET household_id = '<id>' WHERE id = ANY('{...member ids...}');
UPDATE households SET linked_by='review-approved' WHERE id='<id>';
```

**Source:** `cleanup.hh_review_queue` (live view). Live 2026-06-28.

| Tier | Members | City / ZIP | Signal / why review |
|---|---|---|---|
| HIGH* | Thomas Sealey · Thomas Sealey | Lake City 32025 | **Same exact name** at one address — dedup review judged "two people"; confirm household vs hidden dup |
| MEDIUM | Baeu Tooker · Garrett Warren | Branford 32008 | diff-surname same address: roommates vs name-change? |
| MEDIUM | Elizabeth Carrillo · Margarito Valdez | Lake City 32024 | diff-surname same address |
| MEDIUM | Sean Briggs · Sean Carman | Lake City 32025 | diff-surname same address |
| MEDIUM | Theresa Goodrich · Theresa Russell | Lake City 32025 | diff-surname same address (name change?) |
| MEDIUM | Bienvenido Samera · Sam Samera | Gainesville / Jacksonville | shared email, different cities — family vs shared inbox |
| MEDIUM | **BoxDrop Live Oak · Max Bass** | O'Brien 32071 | **person↔business** (PLAN-A §8) — relate, do NOT household |
| MEDIUM | **Donald Smith · Edna Smith** | Murphy **NC 28906** / Branford FL 32008 | shared email but **cross-state** — likely data error (PLAN-B flag) |
| MEDIUM | **James Dorman · Mary Williams** | Lake City 32025 | shared email — known household FP (PLAN-A §8); confirm |
| MEDIUM | Kevin Stansel · Theron Stansel | Wellborn 32094 | shared email — family vs shared inbox |
| LOW | Deserrai Davis · Myranda Montemurno | Lake City 32024/32025 | phone-only, different ZIP — PLAN-A §8 FP; confirm by call |
| LOW | Kimberly Schneiders · Michael Schneiders | Lake City 32025 | phone-only — likely spouses; confirm by call |

\* The Sealey row is tier HIGH by signal but down-graded to `linked_by='review'` due to the same-name ambiguity.

**Note:** `BoxDrop Live Oak / Max Bass` and any person↔business pair should be **related** (Wave 4 BIZ-7), not household-linked.
