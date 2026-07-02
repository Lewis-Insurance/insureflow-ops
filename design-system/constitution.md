# Calm Command - Aesthetic Constitution

**Project:** Lewis Insurance Agency OS (InsureFlow CRM)
**Standard:** AO Renewal Command Center (the page this system is extracted from)
**Generated:** 2026-06-28 (v2, after specialist review)

## Manifesto

Lewis Insurance Agency OS is an operations console. Its one job is to tell a producer what to do with an account in the next ten seconds. It feels calm, certain, and dense without clutter. Information sits comfortably dense, never sparse and never noisy. Hierarchy comes from weight and spacing and a single lime accent, not from a wall of color. The user should finish a screen feeling in control, not buried. The system refuses rainbow toolbars, vanity counters, and pages that are mostly empty boxes.

## Allowed to feel

- Like an instrument panel a professional trusts at 4:55 on a Friday
- Calm, even when the account is overdue
- Dense but legible: a lot of fact per screen, nothing fighting for attention
- Decisive: the next action is obvious and singular
- Quietly premium, the way good dark software feels
- Oriented in time: what happened, where it stands, what is next
- Consistent page to page, so muscle memory carries across the app

## NOT allowed to feel

- Like a row of rainbow buttons where every action shouts equally
- Like a dashboard of vanity numbers that change nothing
- Like a stack of empty boxes scrolling down the page
- Like a generic SaaS template
- Like a consumer app: no toy gradients, no bounce, no confetti
- Anxious or alarming when nothing is wrong
- Cluttered, with borders and fills and shadows all competing at once
- Improvised, where two pages solve the same problem two different ways

## The ten rules

1. Calm over decoration.
2. Hierarchy from weight and spacing, not color.
3. One accent color, lime. Semantic colors stay restrained.
4. Critical states never rely on color alone. Pair color with an icon and a label.
5. Motion has purpose. Snap or glide, never bounce. Reduced-motion users get instant transitions.
6. Tables and lists default to data density.
7. Numbers use tabular figures.
8. Every record surface answers three questions on sight: what happened last, where it stands now, what to do next.
9. One primary action per surface carries the lime fill. A surface may also show secondary (ghost), tertiary (text), and overflow actions, plus the status control. Never two lime fills on one surface.
10. No bare empty state and no bare spinner. Empty states name the next action. Loading states are designed skeletons.

## The one color exception

Data visualization is the single place where multiple hues are allowed, because there color encodes data. Charts use only the `--cc-chart-*` ramp, never raw status pills, and never the lime for a non-primary series. Everywhere else, rule 3 holds: one accent.

## Non-negotiables for this product

- **Renewal urgency is always visible.** Days to renewal and last-contact recency render as banded, labeled states, never as plain dates. See the renewal countdown component.
- **Carriers are named, not colored.** Auto-Owners, Nationwide, and Progressive are distinguished by name on a neutral chip, never by their own color. This protects rule 3 during the book migration.
- **Specialty lines stay separate.** Trailers, RVs, motorcycles, and boats never appear on an auto policy or auto quote. They belong on separate specialty policies. Surfacing them on the auto record is a coverage-gap error.
- **A past-due next action reads as Overdue,** never as done.
- **"Paid in full" from a dec page is an unverified flag,** never a confirmed-payment state.
- **Money, dates, policy numbers, and client names never truncate** with an ellipsis where a decision depends on them. Wrap or scale down. This includes the carrier comparison grid.
- **PII masking applies in fields, tables, and document previews and exports.** SSN, date of birth, and driver license numbers stay masked, even for staff. A reveal is a deliberate, logged, per-field action, never default-on.
- **Never fabricate a brand asset.** Use the real Lewis Insurance logo. If an asset is missing, stop and ask.
- **No em dashes or en dashes in any interface copy.** Short sentences.
