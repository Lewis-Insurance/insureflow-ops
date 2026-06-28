# PARKED — Wave 4 Business Reclassification Review (Tier-2 / Tier-3)

**Gate:** Wave 4 / BIZ-3. **23 Tier-1** named entities (LLC/Inc/Church + a commercial line) were auto-flipped to `commercial_business`. The **74 below are REVIEW-ONLY.**

To flip an approved account: `UPDATE accounts SET type='commercial_business' WHERE id='<id>';` (the `account_type` legacy column must be set too — `UPDATE accounts SET account_type='business' WHERE id='<id>';` — the `sync_account_types` trigger does **not** resolve `commercial_business`). Then add a `commercial_business_accounts` row. Live views: `v_business_type_violations` (Tier-2), and the Tier-3 query below.

---

## Tier-2 — commercial line under a personal/brand name (27) → sole-prop vs entity (BIZ-3/BIZ-7)
**Brand businesses → likely FLIP:** BoxDrop Live Oak (BOP) · Dale's Mobile Homes Setup (Comm Auto) · Road Runner Tire And Break Express (WC).
**Person + commercial policy → likely RELATE entity, keep person personal (BIZ-7 — Horace Witt pattern):** ANGUS PARKER · Anthony Bowles · Brandon Burchfield · Cleveland Dix · David Gathings · Dionne Latham · Garvin Garling · **Heng Zhang** (also DUP-review) · **Horace Witt** (owns D And H Tractor Works LLC — relate) · Howard Peer · James Clayton · James Ruis · Johnny Copeland · Jorge Sanchez (also a HIGH household) · Levi Polhill · Luke McInnis · Mary L Hygema · **Melinda Shrum** (also DUP-review) · Michelle Nowlen · Randall Mccray · Raymond Goushaw · Sherman Byrd · Thomas Starling · William Webster.

## Tier-3 — named entity, only personal-type policies yet (47) → confirm entity vs owner's personal account
These carry LLC/Inc/Corp names but their active policies are Auto/Dwelling (no commercial line), so they were not auto-flipped. Most are clearly businesses; confirm whether the account *is* the entity (flip) or the owner's personal account (keep + relate).

**Strong flip (clearly the entity):** 3 Sevens Properties Llc · Aamp Carpentry Llc · Across The Board Services · All Seasons Planning Inc · Branford Family Medical Center Inc · Buffalo Joe's Inc · Cabinet Stuff Inc · Cas Solutions Llc · Country Electric Llc · Custom Trim Works Llc · Darrell Townsend Custom Framing Llc · Deadline Solutions Inc · Don's Septic And Fill Inc · Dredge And Mine Llc · Ed Carey Electric Llc · Gateway Development Llc · Girard Place Owners Association Inc · Gsgc Leasing Llc · Gsms Developers Inc · H & J Resturant Inc · Hendrix Smith & Kir Llc · Kings Land Services Llc · Lofstrom Builders Llc · M&J Plant Solutions Llc · Maddox Construction Services Llc · Martin Exteriors Inc · Mc Farms Inc · Montgomery Services Llc · New China Town Liveoak Inc · Prime Shine Exterior Services · Quality Seal Services Llc · R J H Drywall Corporation · Red's Tree Service Llc · Rescue Cutters Inc · Shepard Window Services Llc · Startech Lake City Inc · Stillwater Pool Service Llc · The Plantations On S Llc · William Scott Construction Inc · AMERIZAM INC · Elite Rc Productions Llc · Pbc Inc.

**Sorensen commercial multi-property (RECOMMEND flip — confirmed LLC, 5 distinct buildings):** the **5 `SORENSEN AND SMITH LLC`** rows (117/125/300/308 Mesa, 2312 Vista — each a DP-3 dwelling-fire). PLAN-A/C: these are the LLC's commercial multi-property holding; flip to `commercial_business` (the Ranchera survivor `919d0064` was already flipped in Tier-1).

---

**Guardrail (BIZ-6) is live:** `zz_enforce_commercial_type` on `policies` auto-promotes a `household` account with a **clear business name** (LLC/Inc/Church/…) when a **commercial-line** policy is added — sole-props and the exclusion list are never auto-promoted. Standing DQ: `SELECT * FROM v_business_type_violations;`.
