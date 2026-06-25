# lewis-crm MCP adapter

A **thin, authorized MCP layer over the existing Lewis Insurance Supabase** (project
`lrqajzwcmdwahnjyidgv`). It is **not** a new backend — it maps onto the real tables and
reuses the existing rails. Every one of the six Mac Mini Hermes agents reaches the book
of business through this one server.

## What it exposes

| Tool | Does | Real table / rail |
|---|---|---|
| `find_client` | search the book | `accounts` |
| `get_client` | full snapshot (policies, tasks, notes, payments) | `accounts` + spine |
| `list_policies` | client policies / expiry sweep | `policies` |
| `log_contact` | log every call/text/email | `customer_notes` |
| `create_task` / `list_tasks` | cadence + service tasks | `tasks` |
| `list_renewals` | renewal + Auto-Owners pipeline | `renewals`, `ao_renewals` |
| `record_payment` | record a payment (+ receipt) | `premium_payments` |
| `generate_receipt` | branded receipt PDF → private bucket | `documents` + storage |
| `extract_dec_page` | queue a dec page for the existing OCR pipeline | `documents` → `process-document-tasks` |
| `domain_rules` | the binding Lewis rules | — |

## Security model

- Connects with the **service role key** (bypasses RLS by design).
- Authorization is enforced in-app: every tool calls `getEmployee()`, which refuses to act
  unless `LEWIS_EMPLOYEE_EMAIL` maps to a profile with `is_staff = true`. (Per Brian:
  everyone shares every client — the gate is just "active Lewis employee, yes/no".)
- PII is masked by default (phone/email/policy#); deep PII (DOB/SSN/TIN/FEIN) is never returned.
- Receipts/dec pages use the **private** `customer-docs` bucket — never a public bucket.
- The five locked-down rep agents use **only this adapter**, never the broad Supabase MCP.

## Install (on the Mac Mini)

```bash
cd ~/lewis-crm-mcp
bun install
```

Add the shared secrets once (per MACMINI_SETUP step 8), in `~/.hermes/.env`:

```bash
SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # never in git/chat
```

## Register in each Hermes profile

Add the server to every profile's `config.yaml`, varying only the two `LEWIS_*` values.
The profile→staff mapping:

| profile | LEWIS_EMPLOYEE_EMAIL |
|---|---|
| brian | brian@lewisinsurance.com |
| letitia | letitia@lewisinsurance.com |
| landen | landen@lewisinsurance.com |
| jacob | jacob@lewisinsurance.com |
| kelli | kelli@lewisinsurance.com |
| tori | tori@lewisinsurance.com |

```yaml
# ~/.hermes/profiles/<name>/config.yaml  (MCP server block — match your Hermes schema)
mcp_servers:
  lewis-crm:
    command: bun
    args: ["run", "/Users/<operator>/lewis-crm-mcp/src/index.ts"]
    env:
      LEWIS_PROFILE: kelli
      LEWIS_EMPLOYEE_EMAIL: kelli@lewisinsurance.com
      LEWIS_DOC_BUCKET: customer-docs
```

> The exact MCP key (`mcp_servers` vs `mcpServers`) depends on your Hermes version — check
> `hermes mcp --help`. `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` come from `~/.hermes/.env`.

## Smoke test

```bash
LEWIS_EMPLOYEE_EMAIL=brian@lewisinsurance.com bun run src/index.ts
# stderr prints: [lewis-crm] ready — profile "brian" acting as brian@lewisinsurance.com
```

Then from an agent: "find client Smith" → `find_client` → masked results. If the email isn't
active staff, every tool refuses — that's the gate working.

## Prerequisites verified before this adapter shipped

The shared database was hardened first (see `claude/files/SECURITY_REMEDIATION_LOG.md`):
RLS is on for every public table, `is_staff()` checks real staff, and the anon key can no
longer read financial data or write/wipe any table. The adapter is built on that footing.
