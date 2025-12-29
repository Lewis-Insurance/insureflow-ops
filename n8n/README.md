# InsureFlow n8n Workflow Pack

This directory contains 39 importable n8n workflow JSON files for insurance agency automation.

## Directory Structure

```
n8n/
├── workflows/
│   ├── 00_event_ingress.json      # Central webhook receiver
│   ├── v1/                         # Lead & Quote Lifecycle (13 workflows)
│   │   ├── 01_speed_to_lead.json
│   │   ├── 02_lead_source_capture.json
│   │   ├── 03_lead_deduplication.json
│   │   ├── 04_missing_info_request.json
│   │   ├── 05_compliance_consent.json
│   │   ├── 06_aging_lead_escalation.json
│   │   ├── 07_nurture_sequence_start.json
│   │   ├── 08_quote_need_packet.json
│   │   ├── 09_quote_status_progression.json
│   │   ├── 10_quote_followup_scheduler.json
│   │   ├── 11_quote_expiry_rescue.json
│   │   ├── 12_comparison_doc_generator.json
│   │   └── 13_task_auto_creation.json
│   ├── v2/                         # Policy & Service (13 workflows)
│   │   ├── 01_policy_welcome_onboarding.json
│   │   ├── 02_policy_renewal_approaching.json
│   │   ├── 03_ticket_sla_assignment.json
│   │   ├── 04_ticket_escalation.json
│   │   ├── 05_email_ingest_ticket.json
│   │   ├── 06_sms_ingest_activity.json
│   │   ├── 07_document_classification.json
│   │   ├── 08_coverage_gap_alerts.json
│   │   ├── 09_cross_sell_detection.json
│   │   ├── 10_birthday_anniversary.json
│   │   ├── 11_referral_request.json
│   │   ├── 12_review_request.json
│   │   └── 13_winback_campaign.json
│   └── v3/                         # Operations & Compliance (13 workflows)
│       ├── 01_payment_overdue.json
│       ├── 02_claim_filed_response.json
│       ├── 03_policy_cancellation.json
│       ├── 04_agency_performance_reports.json
│       ├── 05_producer_commission.json
│       ├── 06_carrier_appetite_match.json
│       ├── 07_risk_profile_scoring.json
│       ├── 08_remarket_trigger.json
│       ├── 09_coi_auto_generation.json
│       ├── 10_endorsement_processing.json
│       ├── 11_audit_preparation.json
│       ├── 12_compliance_check.json
│       └── 13_data_quality_cleanup.json
└── README.md
```

## Installation

### Prerequisites

1. n8n instance (self-hosted or cloud)
2. InsureFlow automation platform deployed (see `/docs/AUTOMATION_PLATFORM_RUNBOOK.md`)
3. API key created in `automation_api_keys` table

### Setup Credentials

Before importing workflows, create these credentials in n8n:

1. **InsureFlow API Key** (Header Auth)
   - Header Name: `x-api-key`
   - Header Value: Your API key from `automation_api_keys`

2. **InsureFlow Webhook Secret** (Header Auth)
   - Header Name: `x-insureflow-webhook-secret`
   - Header Value: Your N8N_WEBHOOK_SECRET

### Import Order

1. Import `00_event_ingress.json` first (central router)
2. Import V1 workflows
3. Import V2 workflows
4. Import V3 workflows

> **Note**: The gateway URL (`https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1`) is hardcoded in all workflows. No environment variables needed!

## Workflow Types

### Event-Triggered
These are called by the event ingress workflow when events arrive:
- V1: 01-05, 07-09, 12-13
- V2: 01, 03, 05-07, 09, 11-12
- V3: 02, 03, 06, 07, 09, 10

### Scheduled
These run on a schedule:
- V1: 06 (4h), 10 (6h), 11 (12h)
- V2: 02 (daily), 04 (15m), 08 (daily), 10 (daily), 13 (weekly)
- V3: 01 (daily), 04 (weekly), 05 (monthly), 08 (daily), 11 (monthly), 12 (weekly), 13 (daily)

### Webhook
These receive external webhooks:
- V2: 05 (email ingest), 06 (SMS ingest)

## Customization

Each workflow can be customized:

1. **Templates**: Update template names in gateway calls
2. **Timing**: Adjust delays, schedule intervals
3. **Thresholds**: Modify SLA times, scoring thresholds
4. **Routing**: Add/remove routing rules in switch nodes

## Monitoring

Monitor workflow executions in n8n:
- Settings → Executions
- Filter by workflow name or status
- Review failed executions for debugging

All gateway calls are also logged in `automation_requests` table.

## Support

See `/docs/AUTOMATION_PLATFORM_RUNBOOK.md` for full documentation.
