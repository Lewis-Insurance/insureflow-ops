# Mac Mini Bring-Up — Lewis Insurance Agent Platform (START HERE)

This folder (`lewis-crm-mcp/`) is the **complete transfer bundle**. Copy the whole folder to
the office Mac Mini and follow this guide top to bottom. It is the single source of truth for
standing up the box.

## What is already done (do NOT redo)

- **The shared Supabase project is hardened.** RLS is on for every public table, `is_staff()`
  checks real staff, and the anon key can no longer read financial data or write/wipe anything.
  See `docs/SECURITY_REMEDIATION_LOG.md`. The Mini writes into a sound database.
- **The adapter is built and verified** (typecheck clean + live smoke test: staff gate passes,
  non-staff rejected, 1,802 active accounts / 2,155 active policies readable).
- **No new backend.** Everything points at the existing project `lrqajzwcmdwahnjyidgv`. Never
  create a new Supabase project or run `docs/lewis_crm_schema.sql` (reference only).

## What's in this bundle

| Path | What |
|---|---|
| `src/` | the lewis-crm MCP server (TypeScript / Bun) |
| `skills/dec-page-intake/SKILL.md` | the flagship dec-page → policy → receipt flow + domain rules |
| `README.md` | adapter install, tool list, Hermes registration |
| `.env.example` | the env vars the adapter needs |
| `docs/00_BRING_UP.md` | this guide |
| `docs/SECRETS_CHECKLIST.md` | every secret, where it lives (Mini only) |
| `docs/MACMINI_SETUP.md` | the host runbook (keep-awake, Docker, Hermes, 6 profiles, channels, launchd) |
| `docs/INTEGRATION_MAP.md` | which real tables map to clients/policies/payments/etc. |
| `docs/SECURITY_REMEDIATION_LOG.md` | what was changed on the DB and why |
| `docs/HANDOFF.md` | original orientation / context |
| `docs/lewis_crm_schema.sql` | REFERENCE ONLY — conceptual model. **Do not run.** |

## Bring-up order

> Steps reference sections in `docs/MACMINI_SETUP.md` (e.g. "MMS §3").

0. **Transfer** this folder to the Mini at `~/lewis-crm-mcp`.
1. **Host prep** — MMS §1 (never sleep, auto-login, auto-restart).
2. **Base tooling** — MMS §2 (Homebrew, git, uv, jq, Docker) **PLUS the JS runtime the adapter needs:**
   ```bash
   brew install oven-sh/bun/bun   # MMS §2 omits this — the adapter runs on Bun
   bun --version                  # confirm 1.1+
   ```
3. **Hermes install** — MMS §3, then create the 6 profiles — MMS §5.
4. **Shared vault** — MMS §4 (`~/lewis-vault`, git-init).
5. **Secrets** → `~/.hermes/.env` — see `docs/SECRETS_CHECKLIST.md` (SUPABASE_URL + SERVICE_ROLE_KEY).
6. **Install the adapter:**
   ```bash
   cd ~/lewis-crm-mcp && bun install
   ```
7. **Register `lewis-crm` in each of the 6 profiles** — see `README.md`. Vary only `LEWIS_PROFILE`
   and `LEWIS_EMPLOYEE_EMAIL` per the map below.
8. **Lock down the 5 rep agents** — MMS §6 (`disabled_toolsets`, `redact_pii true`). They reach the
   CRM **only** through `lewis-crm` — never the broad Supabase MCP. Brian's agent keeps the full
   toolset + Docker sandbox.
9. **Channels** — MMS §7 (one Telegram bot per person; Photon for iMessage).
10. **Autostart** — MMS §10 (`gateway install` + `gateway start` for all 6; `hermes status` green).
11. **Verify** — MMS §11, then the adapter smoke test:
    ```bash
    cd ~/lewis-crm-mcp
    LEWIS_EMPLOYEE_EMAIL=brian@lewisinsurance.com bun run scripts/smoke.ts
    # expect: {"ok":true,"gate":"passed","is_staff":true,...}
    ```
    Then from a profile's chat: "find client <a known last name>" → masked results. A non-staff
    email must be rejected — that's the gate working.

## Employee → profile → email (the access gate)

The adapter refuses to act unless the email maps to a profile with `is_staff = true` (7 of 8 set).

| profile | person | title | `LEWIS_EMPLOYEE_EMAIL` |
|---|---|---|---|
| brian | Brian Lewis | CEO + orchestrator | brian@lewisinsurance.com |
| letitia | Letitia Lewis | Accountant | letitia@lewisinsurance.com |
| landen | Landen Lewis | Vice President | landen@lewisinsurance.com |
| jacob | Jacob Soucinek | Producer | jacob@lewisinsurance.com |
| kelli | Kelli Lee | Producer | kelli@lewisinsurance.com |
| tori | Tori Hill | CSR | tori@lewisinsurance.com |

> If a real staff member is rejected, confirm their `profiles.is_staff = true` and that their email
> here matches the one on their profile row.

## Guardrails to carry onto the Mini

- Same shared Supabase project. **Never create a new one**; never run the reference schema.
- The **service role key lives only on the Mini** (`~/.hermes/.env`) — never in git, never in chat.
- Reps are locked down and use **only** `lewis-crm`. Only `brian` has the full toolset + Docker.
- Receipts and dec pages go to the **private** `customer-docs` bucket — never a public bucket.
- **AI output is not authoritative** — a human approves before any policy is written or payment recorded.
- This box is **insurance-only**. It never touches Brian's personal agents or jarvis-os automation tables.

## Adapter quick reference

Tools: `find_client`, `get_client`, `list_policies`, `log_contact`, `create_task`, `list_tasks`,
`list_renewals`, `record_payment`, `generate_receipt`, `extract_dec_page`, `domain_rules`.
Dec-page flow + binding domain rules: `skills/dec-page-intake/SKILL.md`.
