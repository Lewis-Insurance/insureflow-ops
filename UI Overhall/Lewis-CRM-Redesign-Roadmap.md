# Lewis Insurance Agency OS - Redesign Roadmap

**Standard:** AO Renewal Command Center (Calm Command design system)
**Goal:** bring every page in the CRM up to one consistent standard, in priority order.
**Generated:** 2026-06-28

## How to use this

The whole app gets refit against the Calm Command pack in `visual-forge-handoff-lewis-insurance-os/`. This roadmap says what to fix and in what order. Every page is framed four ways, the way you asked:

- **Serves:** who uses it and the job it does.
- **Why it exists:** the reason it is in the app at all.
- **What must be there:** the content the page cannot do its job without.
- **How:** the archetype from `surface-map.md` and the layout per the system.

Each page also carries a gap rating and an effort estimate.

**Gap rating**
- RED: far from standard, rebuild the page against the system.
- YELLOW: right bones, wrong execution, restructure and reskin.
- GREEN: at or near the standard already.

**Effort** (one code-agent pass): S under a day, M one to two days, L three or more.

**Confidence.** Customers list, Customer detail, and the AO Renewal detail are rated from screenshots. Every other page is rated from the nav and your workflows and marked (est). Confirm those with a screenshot before the page is built. The build itself runs page by page through your screenshot to six-section-critique to build loop. This roadmap sets the order and the spec frame; the per-page handoff is produced when its turn comes.

## Order at a glance

| Wave | What | Why first |
|---|---|---|
| 0 | Global shell + sign-in | The frame every page sits in. Fixing it lifts the whole app at once. |
| 1 | CRM core: Customers, Policies, Renewals, Calls, SMS | The daily surface. Customers is the front door and the worst offender. |
| 2 | Daily drivers: My Dashboard, Migration Queue, Tasks | Where producers start the day. Migration Queue is the book-saving surface. |
| 3 | Lewi AI tools | High value, but used after the core is trusted. |
| 4 | Forms and document production: ACORD, Canopy Import, Import Dec Page, COI | Heavy, transactional, can follow the core. |
| 5 | Back office: Accounting, Marketing, Campaigns, Team, Contacts, Admin | Lower traffic, least urgent. |

---

## Wave 0 - Global shell and sign-in

This is not a page, it is the chrome every page lives in. Do it first so every later page inherits a consistent frame.

**Serves:** everyone, every session.
**Why it exists:** the left rail, top bar, theme, and type are shared by all pages. They are the single biggest lever for "the app feels like one app."
**What must be there:** the real Lewis Insurance logo; the left rail with grouped nav (CRM, Lewi AI, Command Center) using the muted label style and the active-item lime marker; a top bar with search, the AI Assistant entry, notifications, and the user menu; the dark base, Inter, tokens, and `globals.css` applied globally.
**How:** apply `design-tokens.css`, `globals.css`, and `tailwind.config.ts` app-wide. Build the rail and top bar per the Navigation rules. Set `class="dark"` on `<html>`.
**Gap:** YELLOW. The rail already exists and is close. It needs the token pass, the active-state treatment, and the group-header fix. **Effort:** M.

**Sign-in (Auth):** reskin the navy and orange "Tide" split-screen to Calm Command, single centered card, real logo. **Gap:** RED (off-palette). **Effort:** S. High visibility, low cost, good first proof.

---

## Wave 1 - CRM core (in order)

### 1. Customers (Index / List) - RED, M  [seen]

**Serves:** every producer and CSR, many times a day. It is the front door to the book of 1,714 clients.
**Why it exists:** to find a client fast and to see who needs attention now.
**What must be there:** a search and filter row; a triage strip that routes into work; one dense, uniform, scannable list of clients with consistent fields per row; one primary action (Add Customer).
**How:** Index / List archetype. Replace the three vanity cards (Total 1714, Active 1714 at 100 percent, New Leads 0) with a triage strip of at most four tiles: Renewals due this week, Leads pending, Tasks today, Overdue. Convert the loose cards into a uniform table: name, type pill, status pill, premium, last contact, next action, at 44 to 52px rows. Carriers as name chips. Numbers tabular.
**Current-state gap:** vanity counters; inconsistent cards (some show email and phone, most show only "updated 6 hours ago"); no status signal; no path into work. It is a data dump, not a command center.

### 2. Customer detail (Record Command) - RED, L  [seen]

**Serves:** a producer working one account, on the phone or before a call.
**Why it exists:** to show the whole relationship and the next action in one place.
**What must be there:** the past, present, future hero (what happened last, snapshot, what happens next); one primary action plus an overflow, not a row of colored buttons; the policy list with specialty lines separated; a tabbed workspace for notes, documents, communications; the contact log form; payment history.
**How:** Record Command archetype. Hero with Back, breadcrumb, name H1, status pills, status control, and the action stack. Three hero cards. Two columns: command panel left, tabbed workspace right. Collapse the five stacked empty sections into the workspace tabs with designed empty states.
**Current-state gap:** seven rainbow action buttons; a tall stack of empty sections (Notes 0, Tasks 0, Payments 0, Documents 0, Communications 0); no triage frame; AI Assistant panel competes with the record. This is the clearest before-and-after in the app.

### 3. Policies (Index + Record) - YELLOW, M (est)

**Serves:** producers and CSRs checking coverage, limits, terms, renewal dates.
**Why it exists:** the policy is the unit of the business; everything ties back to it.
**What must be there (list):** uniform rows of policy number, named insured, carrier chip, line type, status pill, premium, effective and expiration, renewal countdown.
**What must be there (detail):** a Record Command for the policy with coverage, the dec, documents, endorsements, and the same past, present, future frame.
**How:** Index for the list, Record Command for the policy. Specialty lines labeled, never folded into auto. Money and policy numbers never truncate.
**Gap (est):** likely the same card-and-empty-state issues as Customers. Confirm with a screenshot.

### 4. Renewals (Index) - YELLOW, M (est); AO Renewal detail - GREEN

**Serves:** the retention effort, which is the agency's top priority right now.
**Why it exists:** to work renewals against the clock during the Auto-Owners migration.
**What must be there:** the renewal queue with the countdown band, last-contact recency band, status, and the next action, sorted by urgency.
**How:** Index archetype with the renewal countdown and recency components. The renewal detail is already the standard (the AO Renewal Command Center) and is GREEN; bring the renewal list up to match it.
**Gap:** the detail is the gold standard. The list view needs the countdown and recency treatment. Confirm the list with a screenshot.

### 5. Calls (Index) - YELLOW, S (est)

**Serves:** anyone reviewing or logging phone contact, central to the five-day renewal cadence.
**Why it exists:** call activity is the proof of retention work.
**What must be there:** a dense log of calls with client, direction, outcome, duration, timestamp (absolute and relative), and a link to the record; the contact log form pattern for new entries.
**How:** Index archetype, the activity-feed and contact-log components. Outcomes as restrained pills, never color alone.
**Gap (est):** confirm with a screenshot.

### 6. SMS (Index) - YELLOW, S (est)

**Serves:** producers texting clients (Twilio), part of multi-channel contact.
**Why it exists:** SMS is a primary client channel; it must be logged like calls.
**What must be there:** a threaded conversation list, per-thread message view, send composer, delivery state, and the same recency treatment.
**How:** Index plus a thread detail (Record-like). Segmented control for channel filters. Delivery state with icon and label.
**Gap (est):** confirm with a screenshot.

---

## Wave 2 - Daily drivers

### My Dashboard (Dashboard / Overview) - RED, M (est)

**Serves:** every staff member at the start of the day.
**Why it exists:** to answer "what needs me today" before anything else.
**What must be there:** a triage strip scoped to the signed-in user (renewals inside five business days, overdue follow-ups, tasks due), then two or three modules (renewals this week, recent activity, my tasks), each with a path into the work. Any chart uses the chart ramp.
**How:** Dashboard archetype. No vanity KPI wall.
**Gap (est):** confirm with a screenshot.

### Migration Queue (Index instance) - NEW, M

**Serves:** the producers rewriting the Auto-Owners auto book to Nationwide and Progressive.
**Why it exists:** this is the agency's current emergency. Right now the work is scattered across the Customers list with no way to see "AO auto, not yet rewritten, renewal in six days."
**What must be there:** a triage strip (Not started, In progress, Bound elsewhere, Lapsing this week) and uniform rows: client, current AO policy and expiry, target carrier chip, rewrite status, days to lapse, last contact, next action. Primary action: Start rewrite.
**How:** Index instance with the countdown and recency components. New surface, build it.
**Gap:** does not exist yet. This is the highest-leverage new screen in the plan.

### Tasks (Index) - YELLOW, S (est)

**Serves:** everyone tracking their own commitments.
**Why it exists:** the follow-up system that retention depends on.
**What must be there:** uniform task rows with due date band (overdue in danger), linked record, owner, one primary action (Add Task). A past-due task reads as Overdue.
**How:** Index archetype. Confirm with a screenshot.

---

## Wave 3 - Lewi AI tools (Tool / Workspace)

All of these share one rule: they are where color noise creeps in, so hold the single-accent line hard, and results use the same card and pill language as the rest of the app.

- **AI Hub** - landing for the AI tools. YELLOW, S (est). Serves: discovery of the AI features. What must be there: a clean set of tool entries, not a marketing wall.
- **Quote Comparison** - RED, M (est). Serves: the producer choosing a carrier during migration. Must be a carrier-by-carrier grid, line items aligned, figures tabular, carriers as name chips. This is the highest-value AI tool for the migration.
- **Explore a Policy** - YELLOW, M (est). Serves: reading and questioning a policy document. Document plus extracted-data split (Document Production style).
- **Document Intelligence** - YELLOW, M (est). Serves: parsing dec pages and forms. Document plus extracted-data split; "paid in full" renders as the unverified chip.
- **Renewal Intelligence** - YELLOW, M (est). Serves: prioritizing renewals. Feeds the renewal countdown and triage.
- **Module Builder** - YELLOW, M (est). Internal tool; Tool archetype.
- **Workspace** - YELLOW, S (est). Confirm purpose with a screenshot.

---

## Wave 4 - Forms and document production

- **ACORD Forms** (Document Production) - YELLOW, L (est). Serves: producing ACORD applications and certificates. Source-data selector plus live preview plus issuance log. PII masked in preview and export.
- **COI issuance** (Document Production) - NEW or YELLOW, M. Serves: issuing certificates to holders. Build per the Document Production archetype with the issuance audit trail.
- **Canopy Import** (Form / Wizard) - YELLOW, M (est). Serves: pulling policy data via Canopy Connect. Stepped wizard, designed states.
- **Import Dec Page** (Form / Wizard) - YELLOW, M (est). Serves: ingesting a dec page. "Paid in full" is an unverified flag, not confirmed payment.

---

## Wave 5 - Back office

Lower traffic, least urgent, but they still must match so the app reads as one product.

- **Accounting** (group) - YELLOW, L (est). Serves: Letitia and management. Financial tables at full density, tabular figures, restrained semantics, charts on the chart ramp.
- **Marketing / Campaigns** (group) - YELLOW, M (est). Serves: outreach. Index plus Form archetypes.
- **Team** (group) - YELLOW, S (est). Serves: staff management. Settings/Admin archetype.
- **Contacts** (group) - YELLOW, S (est). Serves: non-client contacts. Index archetype.
- **Admin** (Settings) - YELLOW, M (est). Serves: configuration and integrations. Settings/Admin archetype with connection states.

---

## Per-page audit table

| # | Page | Section | Archetype | Gap | Effort | Wave | Confidence |
|---|---|---|---|---|---|---|---|
| - | Global shell | Chrome | Shell | YELLOW | M | 0 | nav |
| - | Sign-in | Auth | Auth | RED | S | 0 | memory |
| 1 | Customers | CRM | Index | RED | M | 1 | seen |
| 2 | Customer detail | CRM | Record Command | RED | L | 1 | seen |
| 3 | Policies | CRM | Index + Record | YELLOW | M | 1 | est |
| 4 | Renewals list | CRM | Index | YELLOW | M | 1 | est |
| - | AO Renewal detail | CRM | Record Command | GREEN | - | done | seen |
| 5 | Calls | CRM | Index | YELLOW | S | 1 | est |
| 6 | SMS | CRM | Index + thread | YELLOW | S | 1 | est |
| 7 | My Dashboard | Top | Dashboard | RED | M | 2 | est |
| 8 | Migration Queue | New | Index | NEW | M | 2 | new |
| 9 | Tasks | Command Center | Index | YELLOW | S | 2 | est |
| 10 | AI Hub | Lewi AI | Tool | YELLOW | S | 3 | est |
| 11 | Quote Comparison | Lewi AI | Tool (grid) | RED | M | 3 | est |
| 12 | Explore a Policy | Lewi AI | Document Production | YELLOW | M | 3 | est |
| 13 | Document Intelligence | Lewi AI | Document Production | YELLOW | M | 3 | est |
| 14 | Renewal Intelligence | Lewi AI | Tool | YELLOW | M | 3 | est |
| 15 | Module Builder | Lewi AI | Tool | YELLOW | M | 3 | est |
| 16 | Workspace | Lewi AI | Tool | YELLOW | S | 3 | est |
| 17 | ACORD Forms | Forms | Document Production | YELLOW | L | 4 | est |
| 18 | COI issuance | Forms | Document Production | NEW | M | 4 | new |
| 19 | Canopy Import | Top | Form / Wizard | YELLOW | M | 4 | est |
| 20 | Import Dec Page | Top | Form / Wizard | YELLOW | M | 4 | est |
| 21 | Accounting | Accounting | Index + Dashboard | YELLOW | L | 5 | est |
| 22 | Marketing / Campaigns | Marketing | Index + Form | YELLOW | M | 5 | est |
| 23 | Team | Team | Settings | YELLOW | S | 5 | est |
| 24 | Contacts | Contacts | Index | YELLOW | S | 5 | est |
| 25 | Admin | Command Center | Settings | YELLOW | M | 5 | est |

## Next action

Start Wave 0 (the shell) and the sign-in reskin, then Customers. For each page, send me a screenshot, I produce the six-section handoff against this system, the agent builds it, then we check it against `acceptance-checklist.md`. To sharpen the (est) ratings above, screenshots of Policies, Renewals list, My Dashboard, and Quote Comparison would lock the next several waves.
