# Calm Command - Component Rules (v2)

Every rule references the tokens in `design-tokens.css`. Build components from these, not from memory. Where a value is in px it is the compiled value from the AO Renewal Command Center.

## Action hierarchy (read this first)

The biggest defect in the current app is that every action is styled as an equal, brightly colored button. Calm Command allows exactly one lime fill per surface.

- **Primary:** one per surface. Fill `--cc-accent`, text `--cc-on-accent`, weight 600, radius `cc-md` (12px), padding 10px 16px. Hover raises to `--cc-accent-hover` and adds `shadow-glow`. Pressed is `--cc-accent-deep`. Mark it `.btn-primary` or `[data-primary]` so the dark inner focus ring applies.
- **Secondary save (rank two):** the hero may carry one second confirm action. Fill `--cc-accent-muted` (olive) or ghost. Never lime. This is the only second prominent action allowed.
- **Secondary:** ghost. Transparent fill, 1px `--cc-border-interactive`, text `--cc-text-primary`. Hover fills `--cc-surface-overlay`.
- **Tertiary:** text only. `--cc-text-secondary`, hover `--cc-text-primary`.
- **Destructive:** outline by default. 1px `--cc-danger`, text `--cc-danger`, transparent fill. Solid red fill is reserved for the confirm step only.
- **Icon button:** 32 to 36px square, icon `--cc-text-muted`, hover `--cc-text-primary` on `--cc-surface-overlay`. Must carry an `aria-label`.

Rules:
1. Never give each action its own brand color. A row of differently colored solid buttons is forbidden (see `anti-patterns.md`).
2. One lime fill per surface. Promote one action, demote the rest to secondary or tertiary, push the long tail into an overflow menu.
3. The record hero action stack, top to bottom: primary (lime), optional secondary save (olive or ghost), tertiary, then the status control. Beyond that, overflow.
4. Heights: default 36px, compact 32px, large 44px (hero Save). Radius `cc-md` on all.
5. Focus on every variant: 2px `--cc-focus-ring`, 2px offset. The lime primary adds the dark inner ring from `globals.css`. Focus is never removed.

## Cards and nested tiles

1. Card: fill `--cc-surface`, 1px `--cc-border-subtle`, radius `cc-xl` (20px), padding 20 to 24px, `shadow-card`.
2. Nested tile (a data point inside a card): fill `--cc-surface-raised`, 1px `--cc-border-subtle`, radius `cc-md` (12px), padding 12 to 16px.
3. Card header is a small uppercase tracked label in `--cc-text-muted` (`text-label`). Values are `--cc-text-primary`, larger and heavier than the label.
4. Only the top hero panel may carry the blue glow, applied with `--cc-hero-glow`. No other surface uses it. No card uses the lime glow except a primary button on hover.
5. Interactive cards hover by moving the border to `--cc-border-interactive`. No size jump.

## Status pills and metadata chips

1. Status pill: background at 14 percent alpha of its semantic color, text at the full semantic color, radius `pill`, padding 2px 10px, `text-xs`. Active uses success, Contacted uses info, Pending uses warning, Overdue uses danger.
2. Pill text must hold 4.5:1 against the composited pill background on every surface it appears on. The danger pill is the exception: use `--cc-danger-pill-text` (lightened), not the base danger color, because base danger fails on a 14 percent fill.
3. Pair every status with a word. For critical states add a dot or icon. Color is never the only signal.
4. Status vocabulary is shared app-wide so it never gets improvised per page: Active, Contacted, Pending, Overdue, Quoted, Quote sent, Bound, Declined, Lapsed.
5. Metadata chip (policy type, term, carrier name): fill `--cc-surface-overlay`, text `--cc-text-secondary`, no semantic color. Carriers (Auto-Owners, Nationwide, Progressive) are always name chips, never colored.
6. The dec-page "paid in full" value renders as a neutral chip labeled "PIF (from dec, unverified)", never a success pill.
7. One pill shape across the app. No gradients.

## Quick-action chip rows

1. Quick-set chips (Tomorrow, +3 days, +7 days, Next week): fill `--cc-surface-overlay`, text `--cc-text-secondary`, radius `cc-md`, 32px tall.
2. Selected chip gets a 1px `--cc-accent` border and `--cc-text-primary`. Never fill a chip solid lime.

## Tabs

1. Tab bar sits on `--cc-surface`. Active tab is `--cc-text-primary` with a 2px `--cc-accent` underline. Inactive is `--cc-text-muted`.
2. Use tabs to collapse a long vertical stack into one workspace (Contact, Documents, Notes). This is the fix for stacked empty sections.

## Inputs

1. Field fill `--cc-surface-raised`, 1px `--cc-border-interactive`, radius `cc-md`, height 36 to 40px, text `--cc-text-primary`, placeholder `--cc-text-muted`.
2. Label sits above the field in `--cc-text-secondary` at `text-sm`. Never label by placeholder alone. Icon-only controls carry an `aria-label`.
3. Focus: border to `--cc-accent` plus the 2px ring. Error: border `--cc-danger`, helper text in `--cc-danger` with an icon, plus `aria-invalid="true"` and `aria-describedby` linking the helper text. The message states the fix, not just "Invalid."
4. Date pickers, selects, and date ranges match input height and radius exactly. No native unstyled controls.
5. Sensitive identifiers (SSN, DOB, DLN) render masked by default, for example XXX-XX-1234, in fields, tables, and document previews. A reveal control, if present, is a deliberate per-field action that is logged, never default-on.

## Dropdown, select, and overflow menu

1. Trigger matches input or icon-button height (36px), radius `cc-md`. The overflow trigger is the three-dot icon button.
2. Menu surface `--cc-surface-overlay`, 1px `--cc-border-strong`, radius `cc-lg`, `shadow-lift`, `z-dropdown`.
3. Item text `--cc-text-secondary`, hover fills `--cc-surface-raised`, selected item is `--cc-text-primary` with a 2px `--cc-accent` left marker. Destructive item text `--cc-danger`.

## Breadcrumb

1. Segments in `--cc-text-muted`, hover `--cc-text-secondary`, current page `--cc-text-primary`. Separator is a slash in `--cc-text-faint`.
2. Never truncate the record-name segment.

## Status control

1. The record status selector is a lime-free select styled per the dropdown rule. The current value renders as its matching status pill inside the trigger.

## Tooltip

1. Surface `--cc-surface-overlay`, 1px `--cc-border-strong`, `text-xs` in `--cc-text-primary`, radius `cc-sm`, `z-tooltip`. Open on hover and focus. Never the only way to reach information.

## Pagination

1. Page controls are icon and text buttons per the action hierarchy. Current page is `--cc-text-primary` on `--cc-surface-overlay`; others `--cc-text-muted`. Show total count in tabular figures.

## Avatars

1. Initials avatar in `--cc-surface-overlay`, `--cc-text-secondary`, 28 to 32px circle. Photo avatars keep the same size and radius.
2. Shared accounts use a stacked group with a "+N" overflow chip in the same style.

## Segmented control

1. Track on `--cc-surface-raised`, the selected segment fills `--cc-surface-overlay` with `--cc-text-primary`, others `--cc-text-muted`. Used for small view switches (All, Email, SMS, Phone), not primary navigation.

## Side-sheet / drawer

1. Right-anchored panel on `--cc-surface-overlay` over `--cc-scrim`, `z-modal`, width 420 to 520px, radius `cc-xl` on the inner corners, `shadow-lift`. One primary action. Closes back to the list.

## File upload

1. Drop zone is a dashed 1px `--cc-border-interactive` on `--cc-surface-raised`, radius `cc-lg`, with one sentence and a primary Browse action. Show per-file progress as a skeleton or a thin `--cc-accent` bar. Errors use the input error pattern.

## Badge counts

1. Small count badge on nav items and tabs (for example Overdue 12): `--cc-surface-overlay` fill, `--cc-text-primary` text, tabular figures. Danger counts use the danger pill treatment with a label for screen readers.

## Activity feed item

1. Initials avatar, name in `--cc-text-primary`, contact method as a small inline pill.
2. Show both the absolute date and the relative time (Logged 20 days ago) in `--cc-text-muted`.
3. Newest first. Separate items with `--cc-border-subtle`.

## Contact log form (first-class on every Record Command)

1. One compact row to capture method (call, SMS, email, voicemail), outcome (reached, left message, no answer, callback set), and a next-contact date using the quick-set chips.
2. Submitting advances "last contact" and "what happens next" immediately.
3. Logging a "no answer" inside the five-business-day window keeps the record in the danger band (see renewal countdown).

## Renewal countdown and contact recency

1. Days to renewal renders as a tabular figure with a banded state: 30+ days neutral (`--cc-text-secondary`), inside 10 business days warning (gold), inside 5 business days danger (red) with an icon and the word "Renewal." Color never alone.
2. Last contact renders as both absolute date and relative age. Recency band: contacted inside the cadence window is sage; no contact in the last two business days while inside the five-day window is danger with the label "No contact 3 days."
3. The "What happens next" hero card on a renewal shows the countdown and the next scheduled touch, not a generic task.

## Policy list within a customer

1. A customer's policies render as a uniform list of typed rows: Auto, Home, Specialty (RV, Trailer, Motorcycle, Boat), Umbrella, Commercial. Each row: carrier name chip, status pill, premium (tabular), renewal date.
2. Specialty lines are labeled as such and never folded into the auto policy. A vehicle that belongs on a specialty policy must not appear on an auto quote.

## Carrier comparison grid

1. A carrier-by-carrier grid, columns aligned by line item (limits, deductibles, premium, fees, term). Carriers are name chips in the header. Figures are tabular and never truncate.
2. The expiring carrier (for example Auto-Owners) sits beside the targets (Nationwide, Progressive) for a direct read. One primary action (Save comparison or Send).

## Metric tile

1. A metric tile must drive a decision. Number large and tabular, label in `--cc-text-muted`, and a comparison or a next action beneath it.
2. Do not ship vanity metrics. A count equal to the total, or a static zero with no action, is not a tile.
3. Use semantic color only on the delta, never the whole tile.

## Tables and list rows

1. Default to density: row height 44 to 52px, padding 12 to 16px, 1px `--cc-border-subtle` separators.
2. Every row shows the same fields in the same order. No sparse row beside a full row.
3. Primary column `--cc-text-primary` weight 600, supporting columns `--cc-text-secondary`, metadata `--cc-text-muted`, status as a pill.
4. Row hover `--cc-surface-raised`. Row click opens the record. Keep a per-row overflow for secondary actions; the overflow icon button carries an `aria-label`.

## Empty and loading states

1. Empty state: one sentence that names the next action, plus the one primary button for it. Never a bare icon and "No data."
2. Loading: skeletons shaped like the real content, built from `--cc-skeleton-base` blocks with a slow `--cc-ease-glide` sheen toward `--cc-skeleton-sheen`. Never a bare centered spinner on a primary surface. Reduced-motion shows static blocks.

## Navigation (left rail)

1. Rail on `--cc-surface` with a 1px `--cc-border-subtle` right edge, `z-rail`. Real Lewis Insurance logo at the top, never a placeholder.
2. Active item: `--cc-text-primary` with a 2px `--cc-accent` left marker on `--cc-surface-overlay`. Inactive `--cc-text-muted`, hover `--cc-text-secondary`.
3. Group headers (CRM, Lewi AI, Command Center) use `--cc-text-muted` in the uppercase label style. Do not use `--cc-text-faint` for headers, it is below 3:1 on the rail.
4. AI features may carry one small AI tag: `--cc-info` text on `--cc-surface-overlay`. One style only. Count badges follow the badge rule.
5. Provide a "Skip to content" link and mark the rail as a `nav` landmark and the page body as `main`.

## Modals and confirmations

1. Scrim `--cc-scrim`, `z-overlay`. Dialog on `--cc-surface-overlay`, radius `cc-xl`, `shadow-lift`, `z-modal`.
2. Destructive or state-changing actions always confirm. Name the exact object in the copy. Make the action reversible where possible.

## Toasts

1. Top-right, `--cc-surface-overlay`, 1px border in the semantic color, icon plus one line, `z-toast`, max width 360px. Stack newest on top with 8px gaps. Auto-dismiss at 4s, pause on hover, always dismissible.

## Disabled states

1. Disabled controls use `--cc-disabled-surface` fill, `--cc-disabled-text` text, no border emphasis, `cursor: not-allowed`, no hover, no focus ring. Disabled elements are exempt from contrast minimums by design.

## Charts and data visualization

1. Charts are the one place multiple hues are allowed. Use only `--cc-chart-1` through `--cc-chart-6`, gridlines `--cc-chart-grid`, axes `--cc-chart-axis`, track `--cc-chart-track`.
2. Never use the lime (`--cc-chart-1`) for a non-primary series. Never use raw status pills as series colors. Label series directly; color is not the only key.

## Focus and keyboard (applies everywhere)

1. Every interactive element has a visible focus state and is reachable and operable by keyboard.
2. The default ring is 2px `--cc-focus-ring` with a 2px offset; the lime primary uses the dark inner ring from `globals.css`.
3. Provide a skip link, logical heading order (one H1), and `nav` and `main` landmarks on every page.
