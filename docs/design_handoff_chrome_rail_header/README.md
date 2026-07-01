# Handoff: InsureFlow Global Chrome — Left Rail + Top Header (Direction B)

## Overview
This is a redesign of the **global chrome** of InsureFlow (Lewis Insurance Agency OS): the **top header bar** and the **left navigation rail**. Nothing else changes. The main content area (dashboards, customer records, queues, etc.) is **out of scope and must be left exactly as it is** — the prototypes show it only as a dimmed "main content · unchanged" placeholder.

The goal of the chrome is to let a producer or CSR know **what to do with an account in the next ten seconds**. Direction B ("Today-first / next action") is the chosen direction:

- The rail opens with a live **"Needs me today"** work queue (renewals due, overdue tasks, new leads, missed calls, quotes to send).
- The header surfaces the record's **next step** and a single **best next action**.
- The full navigation (every existing destination) sits just below the Today queue, organized into collapsible groups.

This README is the source of truth. Two enhancements pulled from the other explored directions are included as **Recommended** (see "Best of A & C"): the **⌘K command palette** (global search) and the **icon-spine + flyout** pattern for the collapsed rail.

---

## About the design files
The files in this bundle are **design references created in HTML** — a prototype showing the intended look and behavior. **They are not production code to copy.** The task is to **recreate this design in InsureFlow's existing codebase**, using its established framework, component library, routing, icon set, and state patterns. If a styling system already exists, map the tokens below onto it rather than hard-coding hex values twice.

- `InsureFlow-Chrome-prototype.html` — self-contained; open it in any browser to see all three explored directions plus the IA map. **Direction B is the second row.**
- `InsureFlow Chrome.dc.html` — the source prototype (authoring format; included for reference only — the `.html` above is the one to view).
- `assets/lewis-logo.png` — the real Lewis Insurance logo (see Assets).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interaction states below are final and exact. Recreate the chrome pixel-faithfully using the codebase's existing primitives. Where the codebase already has a button/menu/tooltip primitive, use it and apply these tokens — don't fork new components unless necessary.

---

## Design language — "Calm Command"
Honor these rules; they are non-negotiable constraints from the brand:

- **Dark only.** Near-black base, surfaces step up in lightness. Borders are low-contrast hairlines, never fills.
- **One accent: lime `#BEF264`.** Use it **only** for (1) the single primary action, (2) the active-nav marker (the "accent spine"), and (3) focus rings. **Never** as decoration, never a second bright color. Status, badges, NEW indicators, and counts are all neutral.
- **Hierarchy from weight and spacing, not color.** No gradients.
- **Typeface: Inter.** Numbers are **tabular** (`font-variant-numeric: tabular-nums`) everywhere.
- **Accent spine:** the active/selected item gets a raised surface (`#1E2430`) plus a **2px lime bar on its left edge**. Exactly **one per list**.
- **Real Lewis logo only.** Do not invent, redraw, or recolor the mark.

---

## Information Architecture (every destination preserved)
The current rail has 25+ flat/expandable items. They are reorganized into **6 groups**; nothing is removed. Icon names are **Material Symbols Outlined** ligatures (swap for the codebase's equivalents).

**TODAY** (3) — surfaced primarily through the live "Needs me today" panel, but also reachable as nav items:
- My Dashboard — `space_dashboard`
- AO Renewals — `cached`
- Tasks — `task_alt`

**CRM** (7) — expanded by default; contains the active item:
- Customers — `group`  *(active in the prototype)*
- Policies — `description`
- Renewals — `autorenew`
- Calls — `call`
- SMS — `sms`
- Leads — `trending_up`
- Contacts — `contacts`

**LEWI AI** (7) — collapsible; the single group label carries the "AI" meaning, so per-item "AI" chips are removed:
- AI Hub — `hub`
- Renewal Intelligence — `insights`
- Quote Comparison — `balance`
- Explore a Policy — `travel_explore`
- Document Intelligence — `document_scanner`
- Module Builder — `widgets`
- Workspace — `grid_view`

**INTAKE** (3) — collapsible:
- Canopy Import — `cloud_upload`
- Import Dec Page — `upload_file`
- ACORD Forms — `assignment`

**BUSINESS** (5) — collapsible:
- Marketing — `campaign`
- Campaigns — `send`
- Accounting — `account_balance`
- Team — `groups`
- Command Center — `monitoring`

**SYSTEM** (2) — footer:
- Admin — `shield`
- User / account (Brian Lewis) — avatar + menu

**Tag policy:** the loud `NEW` and `AI` chips are gone. `NEW` becomes a small **neutral** dot (6px, `rgba(244,246,248,0.4)`) on the item or its collapsed section header; it can be toggled off entirely. `AI` is conveyed by the "Lewi AI" group.

**Pinned (optional, from Direction A):** a user-curated "PINNED" block of favorites may sit between the Today panel and CRM (suggested defaults: My Dashboard, AO Renewals, Tasks, Leads).

---

## Screens / Views

### 1. Left Rail — Full (272 px) — Direction B
**Purpose:** orient the user and tell them what needs them today, with all navigation one click away.

**Layout:** fixed column, `width: 272px`, full viewport height. `background: #0A0D14`; right border `1px solid rgba(255,255,255,0.06)`. `display:flex; flex-direction:column`. Top-to-bottom: Identity → Needs-me-today panel → Nav (scrolls) → Footer (pinned to bottom).

**Components:**

**a) Identity block** — `padding: 14px 12px 10px`, flex row, `gap: 10px`, vertical-centered.
- **Logo chip:** `background:#FFFFFF; border-radius:7px; padding:6px 9px`. Contains `lewis-logo.png` at `height:19px` (width auto). White chip is required — the logo is a color-on-light wordmark.
- **Name/office:** "Lewis Insurance" (Inter 600 / 12.5px / `#F4F6F8`) over "Lake City, FL" (Inter 500 / 11px / `#8B93A1`, `margin-top:2px`).
- **Office switcher:** `unfold_more` icon, 18px, `#6E7686`, trailing. (Multi-office agencies switch here.)

**b) "Needs me today" panel** — the signature of Direction B.
- Container: `margin:2px 10px 6px; background:#11151D; border:1px solid rgba(255,255,255,0.07); border-radius:11px; padding:9px 4px 5px`.
- Header row (`padding:0 9px 7px`): `bolt` icon 16px `#8B93A1` + label **"NEEDS ME TODAY"** (Inter 700 / 10px / uppercase / letter-spacing 0.12em / `#8B93A1`) + flex-spacer + date "Jun 28" (Inter 500 / 10px / `#7C8492`).
- 5 rows. Each: `padding:6px 9px; border-radius:7px; cursor:pointer`, hover `background:rgba(255,255,255,0.045)`; flex row `gap:10px`:
  - leading icon 17px (`font-variation-settings:'wght' 300`) `#8B93A1`
  - label, flex:1, Inter 500 / 12.5px / `#C2C8D2`
  - count, Inter 600 / 13px / `#F4F6F8`, **tabular-nums**
  - Rows & icons: **Renewals due `12`** (`autorenew`), **Overdue tasks `3`** (`task_alt`), **New leads `5`** (`trending_up`), **Missed calls `2`** (`call`), **Quotes to send `4`** (`balance`).
- Behavior: counts are **live** (fetched/polled). Clicking a row routes to that filtered worklist. **No lime in this panel** — urgency reads through number weight/size and grouping.

**c) Navigation** — `flex:1; overflow-y:auto; padding:2px 8px 4px`.
- **Section header (expanded), e.g. CRM:** `padding:8px 6px 5px`, flex row `gap:8px`: label "CRM" (Inter 700 / 10px / uppercase / ls 0.13em / `#8B93A1`) + hairline rule (`flex:1; height:1px; background:rgba(255,255,255,0.05)`) + `expand_more` 17px `#5C6473` (collapses the section).
- **Active item (exactly one in the rail):** `position:relative; background:#1E2430; border-radius:8px; padding:7px 8px`. The **accent spine** is an absolutely-positioned child: `left:0; top:7px; bottom:7px; width:2px; border-radius:2px; background:#BEF264`. Icon 19px (`wght 400`) `#F4F6F8`; label Inter 600 / 13px / `#F4F6F8`. (Customers is active in the prototype.)
- **Inactive item:** `padding:7px 8px; border-radius:8px`, hover `background:rgba(255,255,255,0.05)`; icon 19px (`wght 300`) `#8B93A1`; label Inter 500 / 13px / `#C2C8D2`; `gap:11px`.
- **Collapsed section header:** `padding:9px 8px; border-radius:8px`, hover `background:rgba(255,255,255,0.03)`: label (uppercase, as above) + count chip (Inter 600 / 9.5px / `#7C8492` on `#171C26`, radius 5, `padding:2px 5px`) + optional neutral NEW dot + flex-spacer + `chevron_right` 18px `#5C6473`. Clicking expands in place. Groups collapsed by default in B: Lewi AI, Intake, Business (everything stays reachable).

**d) Footer** — `border-top:1px solid rgba(255,255,255,0.06); padding:6px 8px 8px`.
- User row: avatar 30px circle (`background:#1E2430; border:1px solid rgba(255,255,255,0.10)`, "BL" Inter 600 / 11px / `#F4F6F8`) + name "Brian Lewis" (600 / 12.5px / `#F4F6F8`) / "Admin · Lake City" (500 / 10.5px / `#8B93A1`) + `more_horiz` 18px `#6E7686`.
- **Admin** must remain reachable — as a dedicated footer row above the user, or inside the user menu.

---

### 2. Left Rail — Collapsed (72 px) + flyouts
**Purpose:** reclaim horizontal space while keeping every destination one hover away.

**Layout:** `width:72px`, same background/border; `display:flex; flex-direction:column; align-items:center; padding:12px 0`.

**Components:**
- **Logo mini chip:** white, `border-radius:7px`, `42×30`, logo `height:12px`.
- **Today/home icon button** (44×44, radius 10): `bolt` icon 21px. Carries a **neutral count badge** top-right (the day's total open items): min 16px, `border-radius:8px; background:#1E2430; border:1px solid rgba(255,255,255,0.16)`, text "26" Inter 600 / 9.5px / `#F4F6F8` / tabular. **Badge is never lime.**
- **Item icon buttons** (44×44, radius 10), hover `background:rgba(255,255,255,0.05)`; icon 21px (`wght 300`) `#8B93A1`.
- **Active icon button:** `background:#1E2430`; lime spine on the rail's left edge (2px); icon `wght 400` `#F4F6F8`.
- **Footer:** avatar 30px.
- **Flyout (on hover/focus of any icon):** floating panel to the right (`left ≈ 84px`), `width ≈ 224px; background:#171C26; border:1px solid rgba(255,255,255,0.12); border-radius:11px; box-shadow:0 22px 48px rgba(0,0,0,0.5); padding:7px`. Hovering the **Today** icon flies out the "Needs me today" list; hovering a **group** icon flies out that group's items (active item carries the spine). Each flyout row mirrors the full-rail row styling at slightly smaller scale (12.5px labels).

**Behavior:** collapse is toggled from the header (`menu_open`). Persist collapsed state (e.g. localStorage). Flyouts open ~100–150ms after hover/focus and are keyboard-reachable (icon buttons are focusable; flyout opens on focus).

---

### 3. Top Header — List page context
**Purpose:** give the current list page identity, fast global search, and the one best action.

**Layout:** `height:60px; padding:0 16px; border-bottom:1px solid rgba(255,255,255,0.07); background:#0A0D14`. Flex row, vertically centered, `gap:12px`. Order: collapse toggle → divider → breadcrumb/title → "today" status chip → (flex spacer) → global search → primary action → utility cluster.

**Components:**
- **Collapse toggle:** `menu_open` 20px `#8B93A1`, then a `1px × 22px` divider `rgba(255,255,255,0.10)`.
- **Breadcrumb + title:** eyebrow group "TODAY" (Inter 700 / 9.5px / uppercase / ls 0.12em / `#8B93A1`); below it, title "AO Renewals" (Inter 600 / 16px / `#F4F6F8`) + count chip "28 open" (Inter 600 / 10.5px / `#8B93A1` on `#171C26`, border, radius 6, `padding:3px 6px`, tabular).
- **Today status chip** (B-specific): pill (`border-radius:999px; background:#11151D; border:1px solid rgba(255,255,255,0.08); height:30px; padding:0 11px`): `schedule` icon 15px `#8B93A1` + "12 due this week" (Inter 600 / 11.5px / `#C2C8D2`, tabular).
- **Global search / ⌘K:** field `height:38px; padding:0 12px; background:#11151D; border:1px solid rgba(255,255,255,0.08); border-radius:9px`, `gap:9px`: `search` icon 18px `#8B93A1` + placeholder "Search…" `#8B93A1` + `⌘K` kbd chip (Inter 600 / 10px / `#7C8492` on `#1E2430`, radius 5, `padding:3px 6px`). **Focus state:** border `#BEF264` + `box-shadow:0 0 0 3px rgba(190,242,100,0.16)`. (See ⌘K palette below.)
- **Primary action (lime, single):** "Work next" — `height:34px; padding:0 13px; background:#BEF264; border-radius:8px`, `bolt` icon 18px `#0A0D14` + label Inter 600 / 12.5px / `#0A0D14`. This launches the highest-priority item from the Today queue.
- **Utility cluster** (right, `gap:8px`): **Ask Lewi** (AI assistant) — `auto_awesome` 18px `#8B93A1` icon button (or labeled ghost pill on wider headers); **Notifications** — `notifications` 19px `#8B93A1` with a neutral count badge "3" (top-right, `#1E2430` border, Inter 600 / 9px); **Theme** — `dark_mode` 19px `#8B93A1`; `1px × 24px` divider; **Avatar** — 28px "BL" circle + `expand_more` 17px `#6E7686` (user menu). All icon buttons: 34×34, radius 8, hover `background:rgba(255,255,255,0.04)`.

---

### 4. Top Header — Record page context
**Purpose:** orient within a record, surface the record's **next step**, and offer the best action — without duplicating the record body.

**Layout:** same 60px bar. Order: collapse → divider → breadcrumb → (spacer) → **Next-step pill** → (spacer) → primary action → overflow → divider → utilities.

**Components:**
- **Breadcrumb:** "Customers" (Inter 500 / 13px / `#8B93A1`, link) + `chevron_right` 16px `#4E5664` + record name "Elite RC Productions LLC" (Inter 600 / 14px / `#F4F6F8`). Truncate the record name with ellipsis if needed.
- **Next-step pill** (the Direction-B signature): `height:38px; background:#11151D; border:1px solid rgba(255,255,255,0.10); border-radius:9px; padding:0 6px 0 12px`, `gap:10px`: eyebrow "NEXT STEP" (Inter 700 / 9px / uppercase / ls 0.12em / `#8B93A1`) + `1px × 18px` divider + text "Renewal in 8 days — send quote" (Inter 600 / 12.5px / `#F4F6F8`) + arrow chip (26px square, `background:#1E2430`, radius 6, `arrow_forward` 16px `#C2C8D2`). The text is **derived from the record** (nearest renewal date, open task, missing doc, etc.); clicking performs/opens that step.
- **Primary action (lime, single):** "Log contact" — `history_edu` 18px `#0A0D14` + label Inter 600 / 12.5px / `#0A0D14`, on `#BEF264` (34px, radius 8). (It is fine that the record body also offers Log contact — different surface; if you prefer, make the header primary a different highest-value action.)
- **Overflow:** `more_horiz` 34px ghost (radius 8, border `rgba(255,255,255,0.10)`) — holds Email, Text, status change, etc.
- **Utility cluster:** identical to the list header (Ask Lewi / Notifications / Theme / divider / Avatar).

---

### 5. Global search → ⌘K command palette  *(Recommended, from Direction C)*
**Purpose:** one keystroke to jump anywhere or run any action — the fastest path for power users.

- **Trigger:** clicking the header search field, or `⌘K` / `Ctrl+K` anywhere.
- **Panel:** opens under the field, `width ≈ 440px; background:#171C26; border:1px solid rgba(255,255,255,0.12); border-radius:12px; box-shadow:0 28px 64px rgba(0,0,0,0.62); padding:8px`.
- **Input row:** `search` icon (turns lime `#BEF264` while focused) + typed query (Inter 500 / 13.5px / `#F4F6F8`, lime caret) + `ESC` kbd chip.
- **Grouped results:** section labels (Inter 700 / 9.5px / uppercase / ls 0.13em / `#8B93A1`): **ACTIONS** (e.g. "Log contact for {record}", "New customer", "Start quote comparison"), **JUMP TO** (any destination), **RECENT**.
- **Selected row:** uses the **accent-spine** treatment — raised `#1E2430` + 2px lime spine + a `subdirectory_arrow_left` return glyph at the right.
- **Keyboard:** `↑/↓` move selection, `Enter` runs, `Esc` closes. Semantics: `role="dialog"` with a combobox/listbox; focus trapped; restores focus on close.

---

## Interactions & Behavior
- **Rail collapse:** header `menu_open` toggles 272 px ↔ 72 px. Animate width ~160ms ease. Collapsed = icon-only + hover/focus flyouts. Persist.
- **Section collapse/expand:** chevron rotates; section body animates open. Persist per-section.
- **Active marker:** exactly one accent spine in the rail; it follows the current route. Mirror in the breadcrumb/title.
- **Today queue:** fetch counts on load, refresh on focus/poll; clicking a row → filtered worklist; "Work next" → highest-priority item.
- **Next-step pill:** derived per record; clicking executes/opens the step.
- **Hover:** rows/buttons lighten by `rgba(255,255,255,0.04–0.05)`.
- **Focus:** lime ring (`1px #BEF264` border + `0 0 0 3px rgba(190,242,100,0.16)`) on every focusable control; never remove focus visibility.
- **Notifications:** neutral numeric badge; opens a panel/menu.
- **Theme toggle:** system is dark-only; treat the toggle as a contrast/appearance control or remove if not needed (don't introduce a light theme without sign-off).
- **Transitions:** 120–180ms ease for hover/expand; flyouts/palette 100–150ms. Respect `prefers-reduced-motion`.

## State Management
- `railCollapsed: boolean` (persisted)
- `expandedSections: Set<string>` (persisted)
- `activeRoute: string` → drives the accent spine, breadcrumb, and header title
- `todayCounts: { renewalsDue, overdueTasks, newLeads, missedCalls, quotesToSend }` (fetched/polled)
- `notificationsCount: number` (fetched)
- `paletteOpen: boolean`, `paletteQuery: string`, `paletteResults: Group[]`, `paletteSelectedIndex: number`
- `recordNextStep: { label, dueInDays, actionId }` (derived per record)
- `theme` (dark; optional)

## Accessibility
- **Contrast (AA):** `#8B93A1` on `#0A0D14` ≈ 6:1; `#C2C8D2`/`#F4F6F8` higher; lime text on dark and `#0A0D14` text on lime fills are both very high. Keep `#7C8492` only for ≥12px secondary text; don't go lighter for small text on the base.
- **Semantics:** rail is `<nav aria-label="Primary">`; collapsible groups expose `aria-expanded`; the active item uses `aria-current="page"`.
- **Icon-only (collapsed) buttons:** require `aria-label`; the flyout label doubles as the accessible name/tooltip.
- **Command palette:** `role="dialog"`, combobox + listbox, focus trap, `Esc` to close, focus restore.
- **Badges:** provide text alternatives ("3 unread notifications", "12 renewals due").
- **Keyboard:** full tab order through header and rail; arrow-key navigation within the palette and (optionally) the rail.
- Honor `prefers-reduced-motion`.

## Design Tokens
**Color**
| Token | Hex / value | Use |
|---|---|---|
| base | `#0A0D14` | app background, header, rail |
| surface-1 | `#11151D` | inputs, the Today panel, status pills |
| surface-2 | `#171C26` | chips, flyouts, count-chip bg |
| surface-3 | `#1E2430` | raised/active rows, avatar, kbd chips |
| border-hairline | `rgba(255,255,255,0.06)` | rail/header borders |
| border-line | `rgba(255,255,255,0.08–0.10)` | inputs, dividers, ghost buttons |
| text-primary | `#F4F6F8` | titles, active labels, counts |
| text-secondary | `#C2C8D2` | nav labels, ghost-button labels |
| text-muted | `#8B93A1` | section labels, icons, placeholders |
| text-faint | `#7C8492` | count chips, kbd hints (≥12px) |
| icon-quiet | `#5C6473` / `#6E7686` | chevrons, switcher icons |
| **accent (lime)** | `#BEF264` | primary action · active spine · focus only |
| on-accent | `#0A0D14` | text/icon on lime fills |
| focus-ring | `1px #BEF264` + `0 0 0 3px rgba(190,242,100,0.16)` | all focus |
| new-dot (neutral) | `rgba(244,246,248,0.4)` | NEW indicator |

**Typography** — Inter (400/500/600/700). Tabular numerals everywhere numbers appear.
| Role | Size / weight / spacing |
|---|---|
| Header title | 16px / 600 |
| Record name | 14px / 600 |
| Nav label | 13px / 500 (active 600) |
| Today row label | 12.5px / 500 · count 13px / 600 |
| Section label | 10px / 700 · uppercase · ls 0.13em |
| Eyebrow (header) | 9–9.5px / 700 · uppercase · ls 0.12em |
| Count / kbd chip | 9.5–10.5px / 600 |

**Radius:** rows/buttons 8 · icon buttons 10 · cards/panels 11–12 · chips 5–6 · pills 999.
**Shadow:** cards `0 12px 34px rgba(0,0,0,0.22)` · flyouts `0 22px 48px rgba(0,0,0,0.5)` · palette `0 28px 64px rgba(0,0,0,0.62)`.
**Spacing:** rail 272 / 72 · header 60 · header pad 0 16 · nav row pad 7 8 · icon↔label gap 11 · icon button 44×44.
**Icon font:** Material Symbols Outlined, `opsz 20`, weight 300 (active 400). Swap for the codebase's icon set using the names listed in the IA.

## "Best of A & C" — recommended cross-pollination
The user liked all three directions. B is the base; fold in these proven pieces:
- **From A (already in B):** collapsible grouped sections, optional **Pinned** favorites block, accent-spine active item, and **quieted tags** (NEW = neutral dot; AI folded into the "Lewi AI" group). Keep all of this.
- **From C (recommended):** the **⌘K command palette** as the global-search behavior (§5), and the **icon-spine + flyout** treatment for the collapsed rail (§2). C's full "permanent slim spine + contextual panel" is an alternative power-user layout if you later want maximum density — not required for B.

## Assets
- `assets/lewis-logo.png` — the **real Lewis Insurance logo**, cropped from the live product screenshot. It is a **color wordmark on light**, so it must sit on a **white chip** in the dark chrome (as specified). **Do not** recreate, recolor, or alter the mark. If the codebase already has an official logo asset (ideally an SVG, or a dark/knockout variant), prefer that.
- **Icons:** Material Symbols Outlined in the prototype. Use the codebase's existing icon library; the IA section lists a name per destination to map across.
- **Font:** Inter (already implied by the brand).

## Files in this bundle
- `InsureFlow-Chrome-prototype.html` — open in a browser; **Direction B is the second row**, shown as rail-full, rail-collapsed+flyout, header-list, and header-record. Row 1 = Direction A, Row 3 = Direction C, top = the IA map.
- `InsureFlow Chrome.dc.html` — source prototype (reference only).
- `assets/lewis-logo.png` — logo asset.
- `README.md` — this document.
