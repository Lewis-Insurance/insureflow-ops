# Lewis Insurance OS — The Relationship Graph

**One connected book of clients: every record knows who it's tied to, what it's really called, and whether it's actually one person.**

Author: technical co-pilot · Date: 2026-06-28 · Standard: Calm Command (AO Renewal Command Center)
Source of truth: live Supabase project `lrqajzwcmdwahnjyidgv` + the visual-forge handoff. Backed by three research agents (insurance-AMS/CRM linking models, Postgres alias/fuzzy search, Calm Command design conventions) and a full forensic pass on the production database.

---

## TL;DR — the idea, in one paragraph

You don't have a "linking" feature gap. You have **five half-built linking mechanisms already sitting in the database, none of them wired to the screen you actually use, and no single model that says "this person owns that business."** The world-class move is not to add a sixth. It's to collapse linking, duplicate-merge, and the "goes by" problem into **one identity-and-relationship graph keyed to `accounts`**, surface it on the customer record as a Relationships tab plus a one-line cross-sell roll-up, and let a suggestions pass propose links you confirm in one click. The flagship case — Lance — proves all three problems at once, and most of the fix is **activating infrastructure you've already paid to build.**

---

## 1. The brutal truth about the current state

The book is small and the plumbing is messy. Live, non-deleted book = **1,714 accounts** (1,691 individuals, 23 businesses), 1:1 with **1,714 `insured_profiles`**. Another **~14,277 accounts are soft-deleted** (import/dedup residue). In-force premium in the system: **~$2.48M personal across 2,126 policies, ~$181K commercial across 37 policies** (~$2.66M total; premium completeness is partial — some policies carry $0).

The `customers` table you see in the UI mockups is **empty (0 rows)** — it's abandoned scaffolding with its own search trigger and nobody home. The real record is `accounts` + `insured_profiles`. That alone tells the story: this app was built fast, tables were spun up and abandoned, and **the same concept lives in three or four places.**

Here is the linking infrastructure that **already exists** and is **mostly unused or unsurfaced**:

| Mechanism | State | Verdict |
|---|---|---|
| `accounts.household_id` + `households` (37 rows: tier, `match_signals`, `is_mixed_line`, `address_hash`) + `household_rollup` view | **Works.** Myers household = 3 members, 4 policies, **$9,433 premium**, mixed-line. But only **51 of 1,714 accounts (~3%)** are in a household, and it's **invisible in the Customers UI.** | Keep + activate |
| `accounts.business_id` → `businesses` table | `businesses` is **empty (0 rows)**; `business_id` **never populated** | Dead — retire |
| `commercial_business_accounts` (24 rows) | Holds commercial detail instead of `businesses` | Canonical for commercial detail |
| `accounts.spouse_name` (84 populated), `secondary_entity_name` (0), `trustee_name` | Relationships stored as **free-text strings**, not links | Backfill into the graph |
| `customer_identities` (profile_id, email, phone) | **Empty (0 rows)** | Dead — retire/replace |
| `duplicate_groups` (450), `duplicate_flags` (82), `merge_history` (78), `accounts.merged_into_id` | A real dedup/merge engine that **has run** — 274 groups merged. But **165 groups are still pending with no review UI.** | Surface, don't rebuild |
| `insured_emails` (707) / `insured_phones` (867) / `insured_addresses` (1,180) | Normalized multi-contact already exists | Fuel for suggestions |

**There is no model anywhere for "person owns business."** `business_id` and `contact_id` are populated on **zero** live accounts. The only person↔business signal in the data is a shared phone, a shared address, or a surname — and for your headline client, even those are missing.

### The Lance teardown (your exact example, from the live DB)

Three records, zero connections between them:

- **David L Macdonald** — individual, 2 personal policies (~$157), Auto-Owners + Progressive. **No email and no phone on the account.**
- **Elite Rc Productions Llc** — business, 1 commercial policy ($1,765), Progressive. Email `lance@elitercp.com`.
- **Elite Rc Productions Llc** *(again)* — a **duplicate**, miscategorized as an individual, carrying a personal-auto policy (Auto-Owners, $0).

So in one little corner of the book you have: **no owner link** (David L ↔ Elite RC), **a duplicate** (Elite RC twice, one mistyped), and **the "goes by" failure** — the name "Lance" exists nowhere except the *business* email, so searching "Lance" on his personal record returns nothing, and "MacDonald" vs "McDonald" would miss too. This isn't three features. **It's one missing layer.**

### Why "Lance" returns nothing (root cause, confirmed)

Search runs on `insured_profiles.search_vector`, a tsvector maintained by trigger `set_ip_search_vector()` from `display_name`, `org_name`, `tags`, `status`. **There is no nickname / preferred-name / alias field in the entire schema.** "Lance" is in no indexed column, so FTS returns zero. `pg_trgm` **is installed** but isn't used for customer search, so "MacDonald/McDonald" variants miss as well. (The `unified_customer_search` view referenced in your design handoff **does not exist in the database** — the doc is ahead of reality.)

---

## 2. Three places I'm pushing back — hard

You asked for this. Here's where the obvious version of this request is wrong.

**Pushback 1 — Do NOT build a new "links" table. You already have five. The disease is fragmentation, not absence.** The instinct is to add a relationship feature. If you bolt a sixth mechanism next to `household_id`, `business_id`, `spouse_name`, `commercial_business_accounts`, `customer_identities`, and `duplicate_groups`, you make the mess worse and the next dev (or the next AI agent in your pipeline) spins up a seventh. The world-class plan **canonicalizes onto `accounts.id`, adds exactly one edge table, and retires the dead scaffolding.** Discipline here is the differentiator.

**Pushback 2 — Linking, de-duplication, and "goes by" are the same system. You're asking for one third of it.** The same screenshot that shows the missing Lance→Elite RC link also contains a duplicate Elite RC and a man whose real name lives on a business email. Treat these separately and you'll build three half-tools. Treat them as **one identity graph** — entities, the names they're known by, and the typed edges between them — and de-dupe becomes "an edge that says *these are the same*," ownership becomes "an edge that says *owns*," and alias-search falls out for free. Your 165 pending duplicate groups and your merge history prove the agency already half-believes this. Sell the graph, not the button.

**Pushback 3 — Nickname is not fuzzy search, and the important fix is boring. Don't let anyone sell you AI here.** I verified it against the canonical nickname dataset: **no algorithm and no dictionary will ever derive "Lance" from "David"** (David maps only to Dave/Davey/Day). Phonetic matching (Soundex/Metaphone) is irrelevant — it encodes sound, not preference. The *only* fix for Lance is to **store the alias the first time a producer types it**, then feed it into the search index. That's a column and a trigger change, not a model. The fuzzy layer (McDonald/MacDonald, typos) is a *separate, cheap* `pg_trgm` add you already have the extension for. Anyone who pitches you a clever search algorithm for the Lance problem is solving the wrong half.

*(One pushback on my own research: the textbook answer is a full `party` supertype refactor. On a 1,714-row book that's over-engineering. Recommendation below is the pragmatic edge-table-on-`accounts` version — 90% of the value, 10% of the migration risk.)*

---

## 3. The architecture — build on what exists, kill the sprawl

### 3.1 One edge table (the spine)

Every relationship — ownership, household, spouse, parent/sub, "same person" — becomes a typed, directional edge between two `accounts`. One table. One mental model.

```sql
create table account_relationships (
  id            uuid primary key default gen_random_uuid(),
  from_account  uuid not null references accounts(id) on delete cascade,
  to_account    uuid not null references accounts(id) on delete cascade,
  rel_type      text not null,          -- 'owns','household_member','spouse','parent_company','same_as','related'
  role          text,                   -- free attr: 'Managing Member','Guarantor','Additional Insured'
  ownership_pct numeric,                -- nullable; for 'owns'
  is_primary    boolean default false,  -- the privileged link (primary owner / head of household)
  note          text,
  source        text default 'manual',  -- 'manual' | 'suggested' | 'import' | 'spouse_backfill'
  confidence    numeric,                -- for suggested edges
  created_by    uuid,
  created_at    timestamptz default now(),
  check (from_account <> to_account)
);
-- canonical direction (owner = from, owned = to); read the inverse via a label swap.
create unique index account_rel_unique
  on account_relationships (least(from_account,to_account), greatest(from_account,to_account), rel_type);
create index account_rel_from on account_relationships(from_account);
create index account_rel_to   on account_relationships(to_account);
```

Direction is canonical (`owns` from person → business); the UI shows "Owned by" on the business side by swapping the label at read time. Symmetric types (`spouse`, `same_as`) store one row. `rel_type` stays a small, enforced vocabulary — owns, household_member, spouse, parent_company, same_as, related — not an open free-for-all.

**Reuse `households` for set-grouping, edges for pairwise.** Households already roll up premium and mixed-line correctly; keep them as the "everyone under this roof" container. Edges carry the specific facts ("Lance **owns** Elite RC", "Jane is **spouse** of John"). Backfill the **84 `spouse_name` strings** and the **51 existing `household_id` links** into edges on day one so the graph isn't empty.

### 3.2 Identity & aliases (the "goes by" fix)

```sql
create table account_aliases (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  alias       text not null,
  alias_type  text not null,   -- 'nickname','maiden','dba','former','misspelling','aka'
  source      text default 'staff_entry',
  created_at  timestamptz default now()
);
create unique index account_aliases_uq on account_aliases(account_id, lower(alias), alias_type);

alter table accounts add column goes_by text;     -- drives display: David "Lance" McDonald
```

Then extend the existing `set_ip_search_vector()` trigger to weight in `goes_by` + aliases, and add the trigram layer you already have the extension for:

```sql
-- alias-aware FTS: legal name (A), org (B), goes_by + aliases (B)
-- + pg_trgm GIN index on display_name/org_name/goes_by for MacDonald≈McDonald and typos
create index insured_profiles_trgm on insured_profiles
  using gin ((coalesce(display_name,'')||' '||coalesce(org_name,'')) gin_trgm_ops);
```

Optional `search_accounts(q)` RPC that ranks **exact → prefix → alias hit → trigram** and returns *why* it matched ("goes by Lance"). Seed Lance's alias against David L's account and the reported bug is closed.

### 3.3 De-dup & merge — surface, don't rebuild

The engine exists (`duplicate_groups`, `merge_history`, `merged_into_id`). It just has no face. Add a review queue over the **165 pending groups** and a merge action that writes the existing tables. The duplicate Elite RC gets caught here. A confirmed merge can also drop a `same_as` edge so history is never silently lost.

### 3.4 Suggestions — how linking scales past manual

A nightly edge-function pass proposes edges (never auto-commits) from signals you already store:
- shared `insured_phones.e164` or `insured_addresses` → household / owner candidate
- surname token shared between an individual and a business name → owner candidate
- **business email local-part matches a person's name** (`lance@elitercp.com` → find "Lance") → owner candidate
- `spouse_name` string ≈ an existing account → spouse edge

Producer sees "Suggested links (4)", confirms in one click → writes a `source='suggested'` edge. For your book, raw auto-match is small (3 of 23 businesses link by phone/address), which is exactly why **manual link + alias + suggestions together** is the right answer, not suggestions alone.

---

## 4. The experience (on the Calm Command standard)

Mapped to the design system's named archetypes and component rules — no new visual language, no anti-patterns.

- **Customer detail → "Relationships" tab** (Record Command, in the existing tabbed workspace). Uniform typed rows mirroring the "policy list within a customer" pattern: linked record name · **relationship-type chip** (Owner / Spouse / Household / DBA — a *neutral metadata chip like a carrier name, never colored*) · status pill · premium (tabular) · key date · ghost **View** + overflow. Empty state names the next action: "No linked accounts yet. Link a business or household member."
- **The cross-sell line, in the Snapshot hero card** (not a new section): *"Also owns Elite RC Productions — 1 commercial policy, $1,765"* or *"Household: 3 members · 4 policies · $9,434."* This one line is the entire business case — it turns a $157 personal-auto record into a commercial conversation.
- **"Link account" action** → side-sheet/drawer (420–520px), alias-aware search to find the target, pick relationship type, confirm. **One lime primary**, writes one canonical edge. No rainbow buttons.
- **"Goes by" capture** inline on the header; the record renders as **David "Lance" McDonald** everywhere after.
- **Global search** becomes alias-aware; result rows show the match reason ("goes by Lance", "fuzzy: McDonald").
- **Duplicate review** = an Index/List of pending groups → merge drawer with a naming confirm modal ("Merge Elite RC Productions (2 records)? Reversible.").

Guardrails from the system: PII masked in every surface, counts/tiles gated on **real rows** (relationships and aliases start sparse — degrade gracefully, no vanity counters), accent spine marks the primary/self record only.

---

## 5. The Lance case, after

One search for "Lance" finds **David "Lance" McDonald**. His record shows a Relationships tab: **Owner of → Elite RC Productions LLC** (commercial, Progressive, $1,765), and a Snapshot line surfacing it. The duplicate Elite RC is flagged in the dedup queue and merged in two clicks, its personal-auto policy reassigned. A producer who picks up his file now sees a $157 auto client **and** a $1,765 commercial account under one person — and the agency's whole 23-business commercial book becomes reviewable for the same hidden personal-lines cross-sell.

---

## 6. Rollout — value first

| Phase | Scope | Effort | Payoff |
|---|---|---|---|
| **0 — Close the bug** | `goes_by` + `account_aliases` + extend search trigger + `pg_trgm` index. Seed Lance. | **S (days)** | "Lance" and "MacDonald" work today. High-trust proof. |
| **1 — The graph** | `account_relationships` + Relationships tab + Snapshot roll-up line + Link drawer. Backfill 84 spouse strings + 51 household links. | **M (1–2 wk)** | Owner/household/spouse links live; Lance→Elite RC linked on the call. |
| **2 — Suggestions** | Nightly suggest pass (phone/address/surname/business-email) → one-click confirm. | **M** | Linking scales across the book without manual hunting. |
| **3 — Consolidate** | Dedup review queue over 165 pending groups (existing engine); retire `businesses` + `customer_identities`; make `households` the canonical group; fold `commercial_business_accounts`. | **M–L** | The sprawl is gone; one identity layer. |

## 7. Risks & guardrails

- **Don't add a sixth model.** Everything keys to `accounts.id`. New tables get the same RLS as `accounts`.
- **Merges reversible + logged** (existing `merge_history`); `same_as` edge preserves provenance.
- **Soft-deleted 14k stay out** of search and suggestions.
- **Premium data is partial** — show "—" not "$0" where unknown; never fabricate.
- **Suggestions never auto-commit** — a human confirms every edge.

## 8. Immediate next steps (pick one and I run)

1. **Ship Phase 0 now** — I can write the migration (aliases + goes_by + trigger + trgm index) and the `search_accounts` RPC against `lrqajzwcmdwahnjyidgv`, staging-first, and seed Lance so you can watch the search work.
2. **Goal-handoff for the pipeline** — I package Phases 0–1 as a `/goal` handoff (schema + RLS + the Relationships tab spec against Calm Command) for your Paperclip build loop.
3. **Design-first** — I produce the six-section UI handoff for the Relationships tab + Link drawer + dedup queue, screenshot-to-build, before any schema lands.
