# Lewis Insurance — Integration Map (live-verified)

**Project:** `lrqajzwcmdwahnjyidgv` ("Lewis Insurance App")
**Verified:** 2026-06-25 via Supabase MCP + live row counts (read-only)
**Purpose:** Map the conceptual CRM (clients/policies/quotes/contacts/payments/documents/tasks/staff)
onto the REAL tables so the Mac Mini `lewis-crm` adapter targets the right system of record.

> 533 tables/views exist, but the *active* system of record is small. Live row counts
> (not the schema) decided what's real vs. vestigial.

## Spine: real tables vs. ignore

| Concept | REAL table (live count) | Key columns / notes | Ignore (empty) |
|---|---|---|---|
| Client / book of business | **accounts** (15,989) | `id`, `name`, `email`, `phone`, `type` (household\|commercial_business), `account_status`, `owner_agent_id`, `agency_workspace_id` | customers (0), businesses (0), households (0) |
| Staff / "active employee" gate | **profiles** (8) + **agency_workspace_memberships** (12) | `profiles.is_staff`, `profiles.role`; membership `status='active'`, `agency_workspace_id` | agents (0) |
| Policies | **policies** (2,157) + canopy_policies (22 synced) | `account_id`→accounts, `carrier`, `line_of_business`, `status`, `effective_date`, `expiration_date`, `premium`, `created_by` | extracted_policies (0) |
| Quote / renewal pipeline | **renewals** (825), **ao_renewals** (524), **ao_renewal_quotes** (364) | the Auto-Owners migration workflow is the real pipeline | quotes (3), renewal_quotes (0) |
| Contact log | **customer_notes** (345), **ao_renewal_contact_log** (157), lead_activities (60) | who-logged + body + timestamp | communications (5), communication_history (0) |
| Payments | **premium_payments** (938) | `account_id`, `policy_id`, `amount`, `payment_method_id`, `received_by`, `received_date`, `check_number`, `status` | payments (0), invoices (0) |
| Documents | **documents** (552) | `account_id`, `policy_id`, `kind`, `category`, `storage_bucket`, `storage_path`, `extracted_text`, `pii_level` | document_extractions (0) |
| Tasks | **tasks** (265) | `account_id`, `policy_id`, `quote_id`, `document_id`, `assignee_id`/`assignee_agent_id`, `status`, `priority`, `due_at`, `ai_generated`, `source` | — |

## Spine relationships

```
accounts (id)  [hub; agency_workspace_id = tenant]
  ├─ policies (account_id) ─┬─ documents (policy_id)
  │                         ├─ tasks (policy_id)
  │                         └─ premium_payments (policy_id)
  ├─ renewals / ao_renewals (per policy/account)
  ├─ customer_notes (contact log)
  ├─ documents (account_id)
  ├─ tasks (account_id)
  └─ premium_payments (account_id)
```

## Access model (per Brian: everyone shares all clients)

- Gate = **active Lewis employee, yes/no** — NOT per-rep scoping. `owner_agent_id` exists but is informational.
- "Active staff" = `profiles.is_staff = true` (resolved via `agency_workspace_memberships.status='active'`).
- ⚠️ `is_staff()` SQL helper currently returns `auth.uid() IS NOT NULL` (any logged-in user). Fix pending (see SECURITY log) — the adapter's gate depends on the corrected version.
- Multi-tenant reality: **6 agency_workspaces, 12 memberships**. Before the adapter writes new records, confirm which workspace_id is Lewis's primary (one grouped count at build time).

## Existing rails to REUSE (don't reinvent)

| Job | Call | Auth |
|---|---|---|
| Outbound email | `email-send` (`send-coi-email` for COI) | JWT |
| SMS / text | `send-sms` (`twilio-*`) | JWT / Twilio sig |
| ACORD generation | `acord_generation_jobs` + `pdf-generation-worker` | CRON_SECRET |
| Dec-page intake / OCR | `ocr-document` → `process-document-tasks` → `document_extractions`/`document_insights` | JWT / CRON_SECRET |
| Retention cadence | `run-retention-scoring` + `renewals`/`ao_*` | CRON_SECRET |
| Domain events (n8n) | `automation_event_outbox` + `dispatch-outbox` | service role / CRON_SECRET |
| Notifications/push | `push-notifications` + `push_notification_queue` | JWT / CRON_SECRET |

## The hinge question — answered by the data

**No `brian_*` tables and no iMessage outbox exist anywhere** in this project (verified across migrations,
edge functions, and types). There is nothing to "drive," "replace," or "run alongside." The Mac Mini is a
**clean standalone insurance worker**: it reads/writes the real data tables above via a scoped service-role
adapter, reuses the rails above for heavy lifting, and sends staff chat over Hermes's own Telegram/Photon.
No personal-brain plumbing involved.

## Open items for the adapter build

1. Fix `is_staff()` first (security + the adapter's gate) — see SECURITY_REMEDIATION_LOG.md.
2. Confirm Lewis's primary `agency_workspace_id` (where new accounts/policies get written).
3. Adapter tools target: accounts, policies, premium_payments, customer_notes, tasks, documents (+ renewals/ao_* for pipeline).
