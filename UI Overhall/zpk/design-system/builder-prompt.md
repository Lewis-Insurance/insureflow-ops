# Calm Command - Builder Prompt

Drop this into a fresh code-agent session to build any surface of Lewis Insurance Agency OS.

---

You are building Lewis Insurance Agency OS (the InsureFlow CRM), in the Calm Command design system. The standard is the AO Renewal Command Center.

Before writing any code, read these files in order and treat them as binding:

1. `design-system/constitution.md` (the law: manifesto, the ten rules, allowed and not-allowed, non-negotiables)
2. `design-system/visual-direction.md` (aesthetic, tone, density, theme, color, type)
3. `design-system/surface-map.md` (pick the archetype for this page)
4. `design-system/component-rules.md` (build components from these rules and tokens)
5. `design-system/design-tokens.css` (the only source of color, spacing, radius, shadow, motion, z-index)
6. `design-system/tailwind.theme.ts` and `design-system/tailwind.config.ts` (the Tailwind and shadcn setup)
7. `design-system/globals.css` (base layer, fonts, focus rings; import after the tokens)
8. `design-system/anti-patterns.md` (never ship any of these)
9. `design-system/acceptance-checklist.md` (the gate before you declare done)

Build setup:

- The app is dark-only. Set `darkMode: "class"`, add `class="dark"` to `<html>`, do not add a theme toggle.
- Apply `design-tokens.css` then `globals.css` globally. Merge `tailwind.config.ts` (it registers `tailwindcss-animate`).
- Load Inter and Geist Mono (via @fontsource or next/font). Do not rely on system fallback.
- Use `cc-*` radii for brand surfaces; leave shadcn `rounded-lg/md/sm` on `--radius`.

Hard rules:

- The constitution is law. If the system does not cover a decision, pause and ask. Do not improvise.
- Do not introduce a color, font, motion, radius, or component that is not in the system. The only place multiple hues are allowed is data visualization, using the `--cc-chart-*` ramp.
- One lime primary per surface. The lime appears only on that action and the focus ring.
- Every record surface leads with past, present, future. Renewal surfaces show the countdown and last-contact recency as banded, labeled states.
- No bare empty states, no bare spinners. Design both.
- Stack is React, TypeScript, Tailwind, shadcn/ui, Supabase. Reuse the existing components and tokens.
- Use the real Lewis Insurance logo. Never fabricate a brand asset. If one is missing, stop and ask.
- Mask SSN, DOB, and DLN in fields, tables, and document previews. Carriers are name chips, not colors. Specialty lines never sit on an auto policy. No em or en dashes in copy. Numbers tabular.
- Pass every item in `acceptance-checklist.md` before declaring done.

Build me {surface} following this system.
