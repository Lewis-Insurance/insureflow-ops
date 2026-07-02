# Lewis Insurance Agency OS - Visual Design Turnaround

**Aesthetic:** Calm Command
**Responding to:** "Make the whole app match the AO Renewal Command Center."
**Generated:** 2026-06-28 (v2, after a four-specialist review pass)

## The direction in one paragraph

Lewis Insurance Agency OS is an operations console. Its one job is to tell a producer what to do with an account in the next ten seconds. It feels calm, certain, and dense without clutter. Hierarchy comes from weight, spacing, and a single lime accent, not a wall of color. This pack does not invent a look. It extracts the one page you already trust, the AO Renewal Command Center, into tokens and rules so every other page can be built up to it and stop drifting.

## Answering the standard

| The AO page fixed | How the system encodes it |
|---|---|
| Dark, near-black command-center base | `design-tokens.css` surfaces (`--cc-bg` to `--cc-surface-overlay`), dark only |
| Past, present, future at a glance | Record Command archetype in `surface-map.md`, rule 8 |
| One lime primary, everything else quiet | Action hierarchy in `component-rules.md`, rules 3 and 9 |
| Nested tiles grouping read-only data | Cards and nested tiles in `component-rules.md` |
| Quick-set chips (Tomorrow, +3, +7, Next week) | Quick-action chip rows |
| Tabbed workspace (Contact, Documents, Notes) | Tabs, rule 10 |
| Activity feed with relative and absolute time | Activity feed item |
| Uppercase tracked labels, tabular numbers | Type rules, rule 7 |

| Left to me (visual identity) | The decision |
|---|---|
| Exact accent | Lime `#BEF264`, 14.9:1 on the base, dark text on the button 14.9:1 |
| Neutral ramp | Four surfaces, four text tokens, all text AA on the base (primary 17.9:1, muted 6.3:1) |
| Semantic palette | Sage success, gold warning, controlled red danger, muted blue info, all restrained |
| Type | Inter for the interface, Geist Mono for figures and identifiers |
| Radius, spacing, shadow, motion | Compiled scales, 12 to 20px radius, 4pt spacing, snap and glide easings |
| Aesthetic name | Calm Command |
| shadcn mapping | Brand lime is `--primary`; shadcn `--accent` stays the subtle hover surface |

## What the review pass changed (v1 to v2)

Four specialists (design systems, front-end, accessibility, insurance ops) pressure-tested v1. The architecture held. The fixes:

- **Implementation:** added `tailwind.config.ts` and `globals.css`; fixed the Tailwind radius map so shadcn `rounded-lg/md/sm` are not silently overridden; locked the app to dark-only with a stated font-loading step; added a z-index scale.
- **Accessibility:** new `--cc-border-interactive` so input and ghost borders clear 3:1; a lightened danger pill text token so "Overdue" passes 4.5:1; a dark inner focus ring so the lime button's focus is visible; skip link, landmarks, and form-error aria requirements.
- **Design system:** specified the components the layout assumes (overflow menu, dropdown, breadcrumb, status control, tooltip, pagination, avatar, segmented control, side-sheet, file upload, badge counts); reconciled "one primary action" to "one lime fill" so it matches the AO hero's own stack; tokenized the scrim; added a chart ramp for dashboards.
- **Insurance ops:** added the renewal countdown and contact-recency bands, a Migration Queue surface for the Auto-Owners book, a Document Production archetype for COIs and ACORDs, a carrier comparison grid, component-level PII masking, the specialty-lines guardrail, and the "PIF from dec, unverified" treatment.

## One decision for you: the navy and orange reconciliation

Your saved notes describe the CRM's older language as navy `#143A5E` with orange and the "Tide" split-screen sign-in. The AO page you love is dark with a lime accent. This pack standardizes the CRM on the AO page because you said it is the standard. Two things sit outside that:

1. **The sign-in page (the "Tide" split-screen).** Recommend reskinning it to Calm Command (Auth archetype is in the surface map). Quick win, high visibility.
2. **The marketing site (lewisinsurance.com, blue and orange).** A separate public brand surface. Recommend leaving it on its own brand for now.

If you want the CRM to stay navy and orange instead, say so and I will recompile the tokens. Nothing else in the structure changes.

## What is in the pack

- `constitution.md` the law: manifesto, ten rules, non-negotiables
- `visual-direction.md` aesthetic, tone, density, theme, color, type, consequence profile
- `surface-map.md` the page archetypes every screen maps to
- `component-rules.md` every component with states, the action hierarchy, and the domain components
- `design-tokens.css` the only source of color, spacing, radius, shadow, motion, z-index
- `tailwind.theme.ts` and `tailwind.config.ts` the Tailwind and shadcn setup
- `globals.css` base layer, fonts, focus rings
- `acceptance-checklist.md` the gate before any screen is done
- `anti-patterns.md` the specific defects from the current app, forbidden
- `example-prompts.md` worked build prompts per surface
- `builder-prompt.md` the master prompt for a fresh agent session
- `CLAUDE.md`, `.cursorrules`, `AGENTS.md`, `PROJECT-INSTRUCTIONS.md` thin per-tool wrappers that point at the constitution

## Build from here

Put the agent file for your tool at the project root, put `design-system/` at the root, and start from `design-system/builder-prompt.md`. Ready for a goal run. First page to bring up to standard is Customers, then the rest of the CRM in order.
