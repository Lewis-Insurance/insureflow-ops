# HANDOFF — Lewis Insurance Agent Platform (read this first)

You are picking up a build that started in a chat window without live database
access. You have what that session lacked: a working Supabase MCP connection to
the real project. Your job is to use it to turn a designed-but-unverified plan
into a verified, real integration. Read this whole file before touching anything.

**Working with: Brian Lewis ("Speedy"), owner/CEO of Lewis Insurance.** Direct,
production-ready outputs, complete code, no filler, no option menus — pick the
practical path and execute, but see the guardrails: this one is human-gated.

---

## The mission

Build an internal AI office platform for Lewis Insurance: six Hermes Agent
instances (Nous Research, self-hosted) running on a Mac Mini, reachable by staff
over iMessage and Telegram, backed by the agency's Supabase project. Brian's
agent is the CEO/orchestrator; the other five are per-employee sub-agents. The
platform automates retention cadence, document intake (dec page -> CRM -> receipt),
quoting prep, and a CEO daily brief.

The original plan assumed a greenfield Supabase project and a fresh CRM schema.
**That assumption is dead.** See the next section.

---

## CRITICAL CONTEXT — this is jarvis-os, NOT greenfield

The Supabase project `lrqajzwcmdwahnjyidgv` ("Lewis Insurance App", Postgres 17,
us-east-1, ACTIVE_HEALTHY) is a large, mature, multi-tenant production platform —
internally referenced as **jarvis-os**. Partial table inventory already shows:

- **Tenancy/identity:** `agency_workspaces`, `agency_workspace_memberships`,
  `accounts`, `account_memberships`, `customers`, `customer_identities`,
  `businesses`, `agents`, `client_portal_users`
- **Existing agent/automation brain:** `brian_imessage_outbox`, `brian_send_log`,
  `brian_quiet_hours`, `brian_action_items`, `ai_actions`, `ai_conversations`,
  `ai_messages`, `ai_modules`, `automation_workflows`, `automation_rules`,
  `automation_executions`, `automation_event_outbox`, `automation_api_keys`,
  `assignment_rules`, `ceo_digest_runs`, `ceo_digest_settings`
- **Auto-Owners migration workflow:** `ao_renewals`, `ao_renewal_quotes`,
  `ao_renewal_contact_log`, `ao_renewal_follow_ups`, `ao_renewal_notes`,
  `ao_moved_carriers`
- **Canopy ingestion:** `canopy_policies`, `canopy_pulls`, `canopy_drivers`,
  `canopy_vehicles`, `canopy_dwellings`, `canopy_claims`, `canopy_documents` (+~20 more)
- **ACORD + carriers + COIs:** `acord_forms`, `acord_form_drafts`,
  `acord_generation_jobs`, `carriers`, `carrier_portals`,
  `certificates_of_insurance`, `coi_templates`
- **Comparison engine, coverage-gap analysis, commissions, banking, comms,
  document processing:** `comparison_*`, `coverage_gap_*`, `commission_*`,
  `bank_statements`, `communications`/`communication_history`,
  `document_extractions`/`document_analysis`/`document_processing_queue`

(The full inventory was cut off mid-paste at `events`/`export_history`. Pull the
complete list yourself — step 1 of the orientation pass.)

**Implications, binding:**
1. **Do NOT create a new CRM schema. Do NOT run `lewis_crm_schema.sql`.** It
   would duplicate or collide with jarvis-os. It is reference material only — the
   conceptual data model the agents need — to be *mapped onto* the existing tables.
2. The `lewis-crm` MCP server is a **thin adapter over existing jarvis-os tables
   and existing rails**, not a new backend. Where jarvis-os already has a
   mechanism (e.g. write outbound iMessage via `brian_imessage_outbox`, emit
   events via `automation_event_outbox`, generate ACORDs via `acord_generation_jobs`),
   the agent layer calls into it rather than inventing a parallel one.
3. The platform we designed is a **front end + agent layer on top of jarvis-os**,
   which is a far stronger starting point than greenfield. Most of what was
   proposed already exists here in some form.

---

## THE HINGE QUESTION — answer before writing the adapter

The schema cannot answer this; Brian must:

> The `brian_*`, `ai_*`, and `automation_*` tables look like an agent/automation
> brain already running on jarvis-os. **Does Hermes REPLACE it, DRIVE it (call its
> rails), or RUN ALONGSIDE it?**

This decision determines the entire shape of `lewis-crm`. Ask Brian early; do not
guess. If it drives/runs-alongside, the adapter wraps existing tables. If it
replaces, confirm what is legacy before routing around it.

---

## The architecture already agreed (don't re-litigate)

- **Host:** one Mac Mini, always-on, Docker. Full runbook in `MACMINI_SETUP.md`.
- **Agents (6 Hermes profiles):**

  | Profile | Person | Title | Access (RLS) |
  |---|---|---|---|
  | brian | Brian Lewis | CEO + orchestrator | everything + runs the board |
  | letitia | Letitia Lewis | Accountant | everything |
  | landen | Landen Lewis | Vice President | everything |
  | jacob | Jacob Soucinek | Producer | own book |
  | kelli | Kelli Lee | Producer | own book |
  | tori | Tori Hill | CSR (hired 2026-06-24) | own book |

  Brian's agent IS the CEO/orchestrator (no separate profile). The five
  sub-agents are locked down (no terminal/code); the document pipeline runs
  server-side as `lewis-crm` MCP tools so even a locked-down agent can trigger it.
- **Three-ring memory:**
  - Ring 0 = jarvis-os (this Supabase project) — authoritative system of record.
  - Ring 1 = a shared, git-versioned Obsidian vault on the Mini — durable office
    knowledge, auditable.
  - Ring 2 = per-agent Hermes memory + Honcho peer — personal/working layer.
- **Four triggers:** conversation (iMessage/Telegram), cron (retention cadence),
  webhook (Supabase Edge Function -> Hermes webhook adapter on :8644),
  document (dec-page intake).
- **Flagship pipeline:** upload dec page -> `vision_analyze`/extract -> reconcile
  to the policies/customers tables -> human approval -> write -> generate branded
  receipt PDF, delivered back over the agent's channel. Runs as server-side MCP
  tools (`extract_dec_page`, `generate_receipt`), not in any rep's chat.
- **Channels:** iMessage works via Photon (`hermes photon login`, v0.17.0+);
  Telegram one bot per person. Brian confirmed both work on his personal agent.
- **Domain rules to encode (from Brian, binding):** trailers/RVs/motorcycles/
  fifth-wheels always go on separate specialty policies, never flagged as auto
  gaps; Auto-Owners "paid in full" on a dec page is a marketing prompt, not
  payment confirmation; always audit SmartRide on Nationwide; a bundle = Progressive
  Auto + any Florida HO carrier. Florida property is closed-market runoff, not a
  failure. Email voice: no em/en dashes, short sentences, contractions, sign-off
  "Thanks, / Brian Lewis / Lewis Insurance / (386) 755-0050".

---

## ORIENTATION PASS — do this FIRST, reads and advisors ONLY

Produce a current, accurate picture before proposing anything. No writes.

1. `list_tables` (all schemas) — the complete inventory, not the partial paste.
2. `list_migrations` — how the schema is versioned.
3. `get_advisors type=security` — RLS gaps, exposed PII, and the public storage
   buckets (`documents`, `portal-documents`, `workspace-documents`, `certificates`,
   `acord-forms` are public — verify whether they hold filled customer docs; that
   is an E&O exposure if so).
4. `get_advisors type=performance` — missing indexes, slow-query flags.
5. `list_edge_functions` — what jarvis-os already automates server-side.
6. Columns + foreign keys for the spine tables (read only):
   `customers`, `accounts`, `businesses`, `agents`, `contacts`,
   `communications`, `communication_history`, `customer_notes`,
   `ao_renewals`, `ao_renewal_quotes`, `ao_renewal_contact_log`,
   `canopy_policies`, `canopy_pulls`, `documents`, `document_extractions`,
   `commission_payments`, `claims`, `certificates_of_insurance`,
   `brian_imessage_outbox`, `brian_action_items`, `ceo_digest_runs`,
   `ceo_digest_settings`, `automation_event_outbox`, `automation_workflows`,
   `ai_actions`, `assignment_rules`.

**Deliverable from the pass:** an *integration map* — which existing tables serve
as clients, policies, quotes, the contact log, payments, documents, and tasks;
how they relate; and which existing rails the agent layer should call into.

---

## HARD GUARDRAILS — non-negotiable

- This is **production**, ACTIVE_HEALTHY, with **real client PII** and direct
  **E&O exposure**. Treat it accordingly.
- Your MCP has `execute_sql (read/write)` and `apply_migration`. **Orientation,
  discovery, and planning are reads and advisors ONLY.** No writes, no DDL, no
  migrations against production.
- Any schema change goes to a **dev branch** (`create_branch`), is verified there,
  and **Brian merges it.** Never alter production directly.
- **Never pull raw PII** (SSN, DOB, full policy numbers, full DLN) into the
  conversation. Work in record IDs and structured fields. Enable PII redaction in
  any agent config.
- This is **not an autonomous run.** Surface findings and proposed changes;
  Brian approves each one. When in doubt, stop and ask — once, with the specific
  decision, not a trickle of partial questions.
- Do not let the locked-down rep agents use this broad Supabase MCP. They go
  through the scoped `lewis-crm` adapter only.

---

## Files in this handoff

- **HANDOFF.md** (this) — read first.
- **MACMINI_SETUP.md** — host runbook (keep-awake, Docker, Hermes install, the 6
  profiles, channels, launchd autostart, webhook listener). Valid as-is; use it
  when standing up the Mini.
- **lewis_crm_schema.sql** — REFERENCE ONLY. The conceptual data model the agents
  need (clients/policies/quotes/contacts/payments/documents/tasks/audit) with the
  authorization matrix and RLS patterns. **Do NOT run it.** Map these concepts
  onto the real jarvis-os tables.

---

## First deliverables, in order

1. Run the orientation pass; produce the integration map + advisors report
   (findings and *proposed* fixes, not applied).
2. Get Brian's answer to the hinge question.
3. Write the `lewis-crm` MCP server as an adapter over verified real tables and
   existing rails, with per-employee (role-based) scoping. Register it in each of
   the six Hermes profiles' `config.yaml`.
4. Then the `dec-page-intake` skill on top of it.

Start with deliverable 1. Reads only. Report back before changing anything.
