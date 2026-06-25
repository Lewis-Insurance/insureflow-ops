---
name: dec-page-intake
description: Turn an uploaded declarations page into a reconciled policy record and a branded receipt, with a human approval gate. USE WHEN a dec page, declarations page, or new/renewed policy document arrives for a client.
---

# Dec-Page Intake

The flagship office pipeline. It runs through the `lewis-crm` MCP tools, so even a
locked-down rep agent can trigger the whole flow. **AI output is never authoritative —
a human approves before anything is written to a policy or a payment is recorded.**

## Flow

1. **Upload** the dec page to the private `customer-docs` bucket (path `<account_id>/dec-pages/<file>`).
2. **`find_client`** to confirm the account. If it's a brand-new client, flag for manual account creation first.
3. **`extract_dec_page`** with the `storage_path`, `account_id`, and (if known) `vehicles[]`.
   - This queues the page through the existing OCR pipeline (`ocr-document → process-document-tasks → document_insights`).
   - It returns `domain_warnings` and `requires_human_approval: true`. It does **not** write a policy.
4. **Review** the extracted fields against the dec page. Apply the domain rules below.
5. **Human approves.** Only then create/update the policy record (via the CRM, or a future `propose_policy` write tool with explicit confirmation).
6. **Payment is separate.** If the customer actually paid, use **`record_payment`** — never infer payment from the dec page.
7. **`generate_receipt`** for any real payment. The PDF lands in the private bucket and is filed as a `documents` row.
8. **`log_contact`** to record the interaction.

## Binding domain rules (enforced by `domain_rules` + `extract_dec_page`)

- **Specialty units** (trailers, RVs, motorcycles, fifth-wheels) always go on **separate specialty policies**. Never flag them as an auto coverage gap.
- **Auto-Owners "paid in full"** on a dec page is a **marketing prompt, not payment**. Never set `paid_in_full` or record a payment from a dec-page line.
- **Nationwide auto** → always **audit SmartRide**.
- **Bundle** = **Progressive Auto + any Florida HO carrier**.
- **Florida property** is a **closed-market runoff**, not a failure. Limited FL HO options are normal.

## Email voice (for any follow-up the agent drafts)

No em or en dashes. Short sentences. Contractions. Sign off:

```
Thanks,
Brian Lewis
Lewis Insurance
(386) 755-0050
```

## Guardrails

- Reads return IDs + masked PII. Pull raw contact info only for a specific action.
- Receipts and dec pages live in the **private** `customer-docs` bucket — never a public bucket.
- Nothing about this box touches Brian's personal agents or jarvis-os automation tables — it works the insurance data only.
