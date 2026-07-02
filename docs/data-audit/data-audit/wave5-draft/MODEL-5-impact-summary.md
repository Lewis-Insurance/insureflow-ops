# Wave 5 · Party Model (Option A) — Impact Summary  ·  **DRAFT / PARKED — NOT APPLIED**

**Decision needed from Brian:** approve adopting the account-centric `insured_*` party layer and re-pointing the 26 `contacts` FKs onto `accounts(id)`, then deprecating `contacts`. Draft SQL: [`MODEL-5-party-model-DRAFT.sql`](MODEL-5-party-model-DRAFT.sql).

## Recommendation: **Option A** (adopt `insured_*`, retire `contacts`)

## Why it's safe to do now (validated live 2026-06-28)
- `contacts` = **0 rows**. Every one of the 23 dependent tables is **empty** except `call_sessions` = 5 (all `contact_id` NULL). `accounts.contact_id` is NULL on all 1,720 active accounts.
- So the re-point is **pure DDL — zero rows move, nothing live breaks** (the outbound stack isn't live yet). The only argument for keeping `contacts` (Option B = "preserve existing comms data") protects **zero rows**.
- `insured_profiles` is already **account-keyed** (`account_id` is its key) — the correct shape for an account-centric CRM, and it natively models multi-valued contact details (`insured_emails/phones/addresses`).

## What changes (26 FKs across 23 tables → `accounts(id)`)
| Subsystem | Tables (FK → contacts) | Delete-rule preserved |
|---|---|---|
| Core / party | `accounts.contact_id`, `businesses.primary_contact_id`, `commercial_business_accounts.primary_contact_id` | NO ACTION |
| SMS / voice | `sms_messages.contact_id`, `call_sessions.contact_id` | NO ACTION |
| Consent | `consent_ledger`, `consent_evidence`, `twilio_consents`, `communication_preferences`, `communication_evidence.to_contact_id`, `contact_send_frequency` | SET NULL / CASCADE (each kept) |
| Portal | `client_portal_users.contact_id`, `portal_invitations.contact_id` | NO ACTION |
| Tickets / reviews | `tickets`, `reviews`, `review_requests`, `nps_responses` | NO ACTION / SET NULL |
| Marketing | `marketing_send_queue.to_contact_id`, `marketing_automation_enrollments`, `marketing_review_requests`, `marketing_survey_sends`, `marketing_survey_fatigue`, `contact_tags` | SET NULL / CASCADE |
| Household | `households.primary_contact_id`, `household_accounts.head/spouse_contact_id` | SET NULL / NO ACTION |

Each FK keeps its delete-rule semantics. Columns keep the `contact_id` name (least app churn); renaming to `account_id` is the cleaner long-term option and can be done in the same pass.

## Why this gates the outbound engine
Canopy/Hermes SMS+voice, `consent_ledger`, `twilio_consents`, portal, `marketing_send_queue`, reviews all answer "who am I contacting and did they consent?" through a `*_contact_id` FK. Until that points at a populated, account-centric party layer, there is **no legal consent record and no recipient identity**. MODEL-5 is the hard gate in front of all proactive outreach — so adopt it **before** those domains are built, so they target `account_id` from day one.

## Blast radius / risk
- **Reversibility:** MEDIUM. The FK swaps are reversible (the draft is one transaction; `ROLLBACK` undoes it). PHASE 1 inserts are reversible (`TRUNCATE insured_*`). **`DROP TABLE contacts` is the only point of no return** — kept as a deferred, separate final step after a release with no readers (the draft only comments-deprecates it).
- **App impact:** the app does not read `contacts` for live data today (0 rows). Code that *references* `contacts`/`*_contact_id` should be pointed at `accounts`/`insured_*` as the outbound stack is built.

## Then proceed (PLAN-D): MODEL-4 finalize household-model deprecations · BIZ-7 person↔business relate via `commercial_business_accounts.primary_contact_id` (now an account FK) · Wave 6 cleanup (drop dead `customer_id` columns + `customers`, archive 14,187 soft-deleted import rows).
