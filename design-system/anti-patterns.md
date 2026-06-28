# Anti-Patterns

The following are forbidden in Lewis Insurance Agency OS. Any of these in a built screen is a failure and fails the acceptance checklist.

## Curated anti-patterns

- **The rainbow toolbar.** Five or more solid buttons, each in a different brand color, across one row. This is on the customer detail page today (Add Note blue, Add Task orange, Add Payment green, Add Policy purple, Add Document teal, Log Call magenta, Request Review gold). Replace with one lime primary action, grouped secondary actions, and an overflow menu.
- **The vanity metric wall.** Counters that restate the obvious or never change behavior. This is on the Customers list today (Total 1714, Active 1714 at 100 percent, New Leads 0). Replace with a triage strip that routes the user into work.
- **Stacked empty boxes.** A record page that is five empty sections down the scroll (Notes 0, Tasks 0, Payments 0, Documents 0, Communications 0). Collapse into a tabbed workspace with designed empty states.
- **Sparse, inconsistent rows.** A list where one card shows email and phone and the next shows only "updated 6 hours ago." Every row shows the same fields in the same order.
- **Color as the only signal.** Status shown by color with no icon and no label.
- **Bare spinner or bare "No data."** Loading and empty states are always designed.
- **Truncated identifiers.** A client name, policy number, or premium cut off with an ellipsis where a decision depends on it. Wrap or scale.

## Project-specific anti-patterns

- Never reintroduce the navy and orange Tide palette inside the CRM. The CRM standard is Calm Command dark with the lime accent.
- Never distinguish carriers by color (blue for Progressive, red for Auto-Owners). Carriers are name chips. If a screen seems to need a second bright color, the layout is wrong, not the palette.
- Never show a trailer, RV, motorcycle, or boat as a line on an auto policy or auto quote. These belong on separate specialty policies. Surfacing them on the auto record is a coverage-gap error.
- Never let a renewal record show "next action" as a stale or past-dated task. A past-dated next action renders in the danger band as Overdue, never as done.
- Never present "paid in full" from a dec page as confirmed payment. Render it as an unverified flag, for example a neutral chip labeled "PIF (from dec, unverified)."
- Never fabricate a Lewis Insurance logo or any brand asset. Use the real asset. If it is missing, stop and ask.
- Never show SSN, date of birth, or driver license number in clear text in a field, a table, or a document preview or export, even for staff.
- Never use an em dash or en dash in interface copy.
- Keep one accent. The only place multiple hues are allowed is data visualization, using the chart ramp.
