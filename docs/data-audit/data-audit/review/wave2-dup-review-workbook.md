# PARKED — Wave 2 Dup-Review Workbook (T1-phone / T2 / T3)

**Gate:** Wave 2 / DUP-7, DUP-8, DUP-9. The **25 T1 shared-address** clusters + **Sorensen Ranchera 3→1** are the auto-merge set (dry-run-gated, applied after spot-check). Everything below is **REVIEW-ONLY** — no merge runs without a per-cluster human decision.

**Source:** `cleanup.dup_clusters` (regenerated detection on the full post-stamp book). Also mirrored into `public.duplicate_groups` with `rule_id` + `status='review_pending'`.
**Disposition column to fill:** MERGE (→ run `merge_accounts(survivor, losers, rule, <user>, true)`), KEEP-SEPARATE, or HOUSEHOLD (→ Wave 3 link).

To get the member account ids + survivor for any cluster:
```sql
SELECT rule_name, names, member_ids, survivor_id, addresses
FROM cleanup.dup_clusters WHERE nkey = regexp_replace(lower('NAME HERE'),'[^a-z0-9]','','g');
```

---

## T1_SHARED_PHONE — 2 clusters (shared phone, different address → confirm family vs same person)
| Name | Members | Addresses |
|---|---|---|
| Heng Zhang | 3 | 1306 euclid st sw · 517 sw quail heights ter · 618 nw forest meadows ave |
| James Lawrence | 2 | 4044 ford st · 9907 132nd st |

Per PLAN-A: shared phone alone is NOT a merge signal. Likely family members or a move — confirm by call before any merge.

---

## T3_CONFLICT_ADDR — 4 clusters (same name, conflicting addresses → move vs two-properties vs hidden dup)
| Name | Members | Addresses |
|---|---|---|
| Cindi Brennan | 4 | 1018 sw mcfarlane ave · 209 sw ziegler ter · 447 nw lake city ave apt 101 |
| Derek Aultman | 2 | 213 sw scarlett way · 5264 149th rd |
| Kevin Fletcher | 2 | 25684 county road 49 · 8504 262nd terrace |
| Paul Bryan | 2 | 1079 sandy point rd · 1731 sw koonville ave |

Default action = KEEP-SEPARATE unless the reviewer confirms a move (merge, keep newest address) or a hidden formatting dup.

---

## T2_EMAIL_OR_ZIP — 57 clusters (same name + same email or single ZIP, complementary contact)
High-confidence-but-not-auto: most are "one rich row + one stub." Approve in batches after eyeballing the field-union preview (`merge_accounts(..., apply=>false)`).

**Notable flags inside this tier:**
- **Gary Howard** (599 nw 93rd ln / 613 nw 93rd lane) — identical Progressive auto policy, null effective date; addresses differ by 14 house numbers. Likely dup — verify (PLAN-A DUP-6 review).
- **Melinda Shrum** (1811 county rd 242a / 1811 sw cr 242a) — same address, county-rd/cr formatting variant the auto-matcher conservatively skipped. Likely MERGE.
- **Lydia Novakowski** (460 nw indian ridge / 460 nw indian ridge ln) — same address, missing "Ln". Likely MERGE.
- **Max Bass** — check person↔business (BoxDrop Live Oak) before merging (PLAN-A §8).
- **Seth Heitzman** — also a Wave-4 commercial Tier-1 candidate (Seth Heitzman Construction Inc); confirm person vs entity.
- **Landen Lewis** — two same-name accounts in one ZIP; confirm (may be the agency user's own duplicate).

Full list (name · signal · address):
Charles King · Daniel Williams · Darrell Townsend (po box 1544) · David Allbritton · David Boozer · David Deringer · David Gathings · David Rogers · David Thomas · Dean Demorest · Donald Shivers · Douglas Patterson · Florence Hewett · Gail Moore · Garrett Warren · **Gary Howard** · Gerald Brown · Harry Dicks · Helen Remnet · James E Clayton · James Grinstead · Jason Dortch · Jeff Judy · Justin Fales · Kathie Steighner · **Landen Lewis** · Larry Fulford (po box 3401) · Lawrence Shanks · Linda Wells · **Lydia Novakowski** · Mark Holmes · Marselena Hawkins · Matthew Crews · **Max Bass** · **Melinda Shrum** · Michael Christensen · Natasha Harris · Pamela Geiger · Quincy Shindelbower · Samuel Carter · **Seth Heitzman** (po box 3642) · Sheila Dean · Stanley Federico · Theodore Petty · Theodore Stanley · Thomas Acree · Thomas Dorsett · Thomas Pyne · Thomas Raulerson · Timothy Bevington · Velma Carter · Vicki Scott · Vivian Retrossa · Wallace Kitchings · Wanda O'Neal · Warren Johns · William Watson

---

**Counts:** T1_SHARED_PHONE 2 / T2_EMAIL_OR_ZIP 57 / T3_CONFLICT_ADDR 4 = **63 review clusters / 129 accounts**. (Plus the 25 auto T1 + Sorensen.) Tier boundaries are detection's best guess; the reviewer's decision is authoritative.
