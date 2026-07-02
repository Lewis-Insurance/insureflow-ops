# Calm Command - Acceptance Checklist (v2)

A screen is not done until every item passes. This is the gate for every build and every review.

## Visual
- [ ] Background is `--cc-bg`. Surfaces step up (surface, raised, overlay), never down.
- [ ] Exactly one lime fill on the surface, on the single primary action. Lime also appears on the focus ring only.
- [ ] Borders are low-contrast lines, not fills. Borders, fills, and shadows do not all compete at once.
- [ ] Only the top hero carries the blue glow (`--cc-hero-glow`), if any.

## Hierarchy
- [ ] One bold H1. On record surfaces it is the record name in uppercase.
- [ ] Section labels use `text-label` (uppercase, tracked, muted). Values are heavier and larger than labels.
- [ ] One lime primary per surface. Secondary, tertiary, status control, and overflow carry the rest.

## Density
- [ ] Lists and tables use 44 to 52px rows with the same fields in the same order per row.
- [ ] No sparse row beside a full row.
- [ ] Record surfaces lead with the past, present, future frame.

## States
- [ ] Empty state names the next action and shows one primary button.
- [ ] Loading uses content-shaped skeletons from the skeleton tokens, not a bare spinner.
- [ ] Error states pair color with an icon and a label, and are programmatically associated.
- [ ] Critical alerts never rely on color alone.

## Anti-patterns absent
- [ ] No rainbow toolbar.
- [ ] No vanity metric wall.
- [ ] No stacked empty sections.
- [ ] No truncated names, policy numbers, or premiums (including the comparison grid).
- [ ] No navy and orange Tide palette. No carrier-by-color.

## Implementation
- [ ] App is dark-only: `darkMode: "class"`, `class="dark"` on `<html>`, no theme toggle.
- [ ] `tailwind.config.ts` consumes `tailwind.theme.ts` and registers `tailwindcss-animate`.
- [ ] Inter and Geist Mono are actually loaded (not silent system fallback).
- [ ] shadcn `rounded-lg/md/sm` stay on `--radius`; brand radii use the `cc-*` keys.
- [ ] All color, spacing, radius, shadow, motion, and z-index come from the tokens. No hardcoded hex, no arbitrary z-index.
- [ ] Numbers use tabular figures.

## Accessibility (WCAG 2.1 AA)
- [ ] Text contrast at or above 4.5 (large and UI at or above 3.0). `--cc-text-faint` is decorative or disabled only, never a label.
- [ ] Interactive borders (inputs, ghost buttons, selects) use `--cc-border-interactive` and clear 3:1 on their surface.
- [ ] The danger status pill uses `--cc-danger-pill-text`.
- [ ] Visible focus on every interactive element. The lime primary uses the dark inner ring so it is never lime-on-lime.
- [ ] Skip-to-content link present; `nav` and `main` landmarks set.
- [ ] Form errors use `aria-invalid` and `aria-describedby`; icon-only controls have an `aria-label`.
- [ ] Reduced-motion path verified. Keyboard fully navigable.

## Domain and brand
- [ ] Renewal surfaces show days-to-renewal and last-contact recency as banded, labeled states, not plain dates.
- [ ] SSN, DOB, and DLN are masked in fields, tables, and document previews and exports.
- [ ] Specialty lines (RV, trailer, motorcycle, boat) are never on an auto policy or quote.
- [ ] Carriers are name chips, not colors.
- [ ] A past-due next action reads as Overdue, never as done.
- [ ] "Paid in full" from a dec page renders as an unverified chip, not confirmed payment.
- [ ] Charts use only the `--cc-chart-*` ramp.
- [ ] Real Lewis Insurance logo. No fabricated assets.
- [ ] No em or en dashes in copy.
