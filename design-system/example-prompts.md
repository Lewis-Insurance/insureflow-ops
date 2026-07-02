# Calm Command - Example Build Prompts

Worked prompts for commissioning a code agent to build a surface in this system. Each points at `/design-system/`, names the archetype, and ends at the acceptance checklist. Hand the agent the matching agent file (CLAUDE.md, .cursorrules, AGENTS.md, or PROJECT-INSTRUCTIONS.md) first, and have it load `globals.css` and `tailwind.config.ts`.

## Customers (Index / List)

Build the Customers page for Lewis Insurance Agency OS. Read every file in `/design-system/` first and treat the constitution as law. Archetype: Index / List. Replace the current vanity counters (Total, Active, New Leads) with a triage strip of at most four tiles that route into work: Renewals due this week, Leads pending, Tasks today, Overdue. Below it, one dense uniform table where every row shows the same fields in the same order (name, type pill, status pill, premium, last contact, next action) at 44 to 52px row height. One lime primary top-right, Add Customer. Carriers are name chips. Numbers tabular. Verify against `acceptance-checklist.md`.

## Customer detail (Record Command)

Build the customer detail page. Read `/design-system/` first. Archetype: Record Command, the AO Renewal Command Center standard. Hero on top: Back, breadcrumb, customer name as bold uppercase H1, status pills, and on the right the status control plus the action stack (one lime primary, optional olive secondary save, tertiary, overflow). Inside the hero, three cards: What happened last (latest contact), Snapshot (account and policy facts), What happens next (follow-up or task). Below, two columns: left command panel with the main action, the contact log form, and quick-set chips; right workspace with tabs (Contact, Documents, Notes) and an activity feed. Collapse the old stacked sections (Notes, Tasks, Payments, Documents, Communications) into the workspace tabs with designed empty states. The seven colored buttons become one lime primary plus an overflow. Policies render as a uniform typed list with specialty lines labeled separately. Verify against `acceptance-checklist.md`.

## Renewal record (Record Command with the clock)

Build the renewal detail page. Read `/design-system/` first. Archetype: Record Command. Same frame as the customer detail, but the hero "What happens next" card shows the renewal countdown (banded: neutral, gold inside 10 business days, danger inside 5 with an icon and the word Renewal) and the next scheduled touch. Show last-contact recency as a band. The contact log form is first-class; logging a no-answer inside the five-day window holds the record in the danger band. Verify against `acceptance-checklist.md`.

## Migration Queue (Index instance)

Build the Auto-Owners migration queue. Read `/design-system/` first. Archetype: Index / List. Triage strip: Not started, In progress (quote out), Bound elsewhere, Lapsing this week. Uniform rows: client, current AO policy and expiry, target carrier (Nationwide or Progressive as a name chip), rewrite status pill, days to lapse (banded countdown), last contact, next action. One lime primary: Start rewrite. This is the screen that saves the book. Verify against `acceptance-checklist.md`.

## Quote Comparison (Tool / Workspace)

Build the Quote Comparison surface. Read `/design-system/` first. Archetype: Tool / Workspace. Render a carrier-by-carrier grid (Nationwide vs Progressive vs the expiring Auto-Owners), columns aligned by line item (limits, deductibles, premium, fees, term). Carriers are name chips in the header. Figures are tabular and never truncate. One lime primary (Save comparison or Send). Hold the one-accent rule hard. Verify against `acceptance-checklist.md`.

## COI issuance (Document Production)

Build the certificate of insurance issuance surface. Read `/design-system/` first. Archetype: Document Production. Left: source-data selector (policies, certificate holder or additional insured, description of operations). Right: a live COI preview. One lime primary: Issue COI. Beneath, an issuance log of who it went to and when. DOB and DLN, if present, render masked in the preview and are excluded from export unless legally required and confirmed. Verify against `acceptance-checklist.md`.

## Sign-in (Auth)

Build the sign-in page. Read `/design-system/` first. Archetype: Auth. A single centered card on the dark base, no left rail, real Lewis Insurance logo, fields and button at full system spec. This replaces the old navy and orange Tide split-screen. Verify against `acceptance-checklist.md`.

## Add Customer (Form / Wizard)

Build the Add Customer form. Read `/design-system/` first. Archetype: Form / Wizard. One column, grouped sections with the uppercase label style, labels above fields, fields at full input spec. Designed validation with `aria-invalid` and `aria-describedby`. SSN, DOB, DLN masked. Primary action fixed bottom-right. Verify against `acceptance-checklist.md`.
