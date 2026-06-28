# Calm Command - Surface Map

Every page in the app maps to one of these archetypes. Build a new page by picking its archetype and following the layout. This is how the app stops feeling like it was built in phases.

## Record Command (the standard)

The AO Renewal Command Center pattern. Use for any single record: customer, policy, renewal, lead.

- **Layout:** a rounded hero on top. Left side carries Back, a breadcrumb, the record name as a bold uppercase H1, and status pills. Right side carries the status control and the actions, stacked. Inside the hero, three cards in a row: What happened last, Snapshot, What happens next. Below the hero, two columns. Left is the command panel: the main action for this record, quick-set chips, and state tiles. Right is the workspace: tabs (Contact, Documents, Notes), the contact log form, and an activity feed.
- **Action stack (top to bottom):** primary (lime fill), one optional secondary save (olive `--cc-accent-muted` fill or ghost), tertiary (text), then the status control. Everything beyond these moves to an overflow menu. Only the primary is lime.
- **On renewal records:** the hero must show the renewal countdown and the next scheduled touch (see the renewal countdown component), not a generic task.
- **Card padding:** 20 to 24px. **Card radius:** 20px (`--cc-radius-xl`). **Emphasis:** action and context.
- **Build with:** the three-card past, present, future frame; one lime primary; a tabbed workspace to hold history instead of stacking it.

## Index / List

Customers, Policies, Renewals, Leads, Calls, SMS.

- **Layout:** page title with one primary action top-right (Add X). Below it, a triage strip of at most four tiles that route the user into work (Renewals due this week, Leads pending, Tasks today, Overdue). Then a filter row. Then a dense, uniform list or table.
- **Row height:** 44 to 52px. **Emphasis:** data.
- **Build with:** uniform rows, real status pills, and a triage strip that sends the user somewhere. Not a wall of counters.

## Migration Queue (an Index instance)

The Auto-Owners book moving to Nationwide and Progressive. This is the agency's top priority surface. It is the Index archetype, not a new pattern, so muscle memory carries.

- **Layout:** triage strip of Not started, In progress (quote out), Bound elsewhere, Lapsing this week. Uniform rows: client, current AO policy and expiry, target carrier (Nationwide or Progressive, as a neutral name chip), rewrite status pill, days to lapse (banded countdown), last contact, next action. One primary action: Start rewrite.
- **Build with:** the renewal countdown and recency bands. This is the screen that saves the book.

## Dashboard / Overview

My Dashboard.

- **Layout:** a triage strip first (what needs me today), then two or three focused modules (renewals this week, recent activity, my tasks). Each module is a card with a clear heading and a path to the work. Charts, where used, follow the `--cc-chart-*` ramp.
- **Emphasis:** action, then context.
- **Build with:** the same triage logic as the index, scoped to the signed-in user. No vanity KPI wall.

## Tool / Workspace

Lewi AI suite, Quote Comparison, Explore a Policy, Document Intelligence, Module Builder.

- **Layout:** a focused work surface. Controls or input on the left or top, result on the right or below. One primary action. Results use the same card and pill language as the rest of the app.
- **Quote Comparison specifically:** a carrier-by-carrier grid (for example Nationwide vs Progressive vs the expiring Auto-Owners), line items aligned (limits, deductibles, premium, fees). Figures are tabular and never truncate. Carriers are name chips, not colors.
- **Emphasis:** action and result.
- **Build with:** restraint. These surfaces are where color noise creeps in. Hold the one-accent rule hard.

## Document Production

COI issuance, ACORD generation, ID cards, evidence of property.

- **Layout:** source-data selector on the left (policies, certificate holder or additional insured, description of operations), a live document preview on the right, one primary action (Issue COI, Generate ACORD), and an issuance log beneath that records who it went to and when.
- **PII:** ACORD apps surface DOB and DLN. They render masked in the preview and are excluded from exports unless the document legally requires the full value and the user confirms.
- **Emphasis:** input and result, with an audit trail.

## Form / Wizard

Add Customer, New Quote, New Policy, Canopy Import, Import Dec Page.

- **Layout:** one column, grouped sections using the uppercase label style, fields at full system spec. Long forms become steps with a progress marker. The primary action is fixed bottom-right of the step.
- **Emphasis:** chrome and input.
- **Build with:** labels above fields, designed validation, no native controls.

## Settings / Admin

Agency settings, user and team management, integrations (Auto-Owners, Canopy, Twilio).

- **Layout:** a left sub-navigation with sectioned forms on the right, reusing the Form archetype rules. Integration cards show a connected or disconnected state with an icon and a label, never color alone.
- **Emphasis:** chrome and input.

## Auth (sign-in)

- **Layout:** a single centered card on the dark base, no left rail. Real Lewis Insurance logo. Reuse the Form archetype field and button specs. This is where the old navy and orange "Tide" split-screen gets reskinned to Calm Command.

## Detail Drawer / Side-sheet

Quick edit or quick view without leaving a list.

- **Layout:** a right-anchored panel on `--cc-surface-overlay` over a `--cc-scrim`, one primary action, closes back to the list. Use it to log a contact or edit a row in place. Width about 420 to 520px.

## Critical Alert (always available)

The triggers that matter for this agency:

- A renewal lapses within five business days with no contact logged. Action: Log contact.
- An Auto-Owners policy is expiring with no replacement bound. Action: Start rewrite.
- A quote was sent but not bound with a renewal approaching. Action: Follow up on quote.
- A specialty policy is orphaned by an auto rewrite. Action: Quote specialty policy.

Each uses danger color plus an icon plus a label, never color alone, placed in the hero or as a banner with the single corrective action inline.

## Empty State (always available)

- One sentence that names the next action, one primary button. Never a bare icon and "No data."
