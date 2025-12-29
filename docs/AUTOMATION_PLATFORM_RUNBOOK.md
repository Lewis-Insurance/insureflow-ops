# InsureFlow Automation Platform - Production Runbook

## Overview

The InsureFlow Automation Platform provides event-driven automation for insurance agency operations. It consists of:

1. **Event Outbox**: Durable event queue with retry logic
2. **Dispatch Outbox**: Edge function that delivers events to n8n
3. **Automation Gateway**: Single write doorway for n8n → Supabase
4. **n8n Workflows**: 39 importable workflow JSON files across 3 packs

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Supabase DB   │────▶│ Event Outbox    │────▶│ dispatch-outbox │
│   (Triggers)    │     │ (Table)         │     │ (Edge Function) │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Supabase DB    │◀────│ automation-     │◀────│    n8n          │
│  (Updates)      │     │ gateway         │     │  (Workflows)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Non-Negotiable Principles

1. **Production Only**: All automations have kill switches
2. **No Service Role in n8n**: n8n uses scoped API keys only
3. **All Writes via Gateway**: n8n never writes directly to DB
4. **Idempotency Everywhere**: Every operation has idempotency keys
5. **Tenant Isolation**: All data scoped by `agency_workspace_id`
6. **Full Observability**: All requests logged to `automation_requests`

---

## Deployment

### 1. Deploy Database Migration

```bash
cd /Users/brianlewis/insureflow-ops
npx supabase db push
```

Migration file: `supabase/migrations/20251228600000_automation_platform_foundation.sql`

### 2. Deploy Edge Functions

```bash
# Deploy dispatcher
npx supabase functions deploy dispatch-outbox --no-verify-jwt

# Deploy gateway
npx supabase functions deploy automation-gateway --no-verify-jwt
```

### 3. Set Environment Variables

In Supabase Dashboard → Edge Functions → Secrets:

```
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/insureflow/event
N8N_WEBHOOK_SECRET=your-secure-secret-here
```

### 4. Create API Key for n8n

```sql
-- Generate a key (do this once, save the output!)
INSERT INTO automation_api_keys (
    name,
    description,
    key_hash,
    key_prefix,
    scopes,
    created_by
) VALUES (
    'n8n-production',
    'Production API key for n8n automations',
    crypt('your-secure-api-key-here', gen_salt('bf')),
    'n8nprod_',
    '["*"]',  -- All scopes
    auth.uid()
);
```

### 5. Import n8n Workflows

1. Log into your n8n instance
2. Go to Settings → Import from File
3. Import `n8n/workflows/00_event_ingress.json` first
4. Import all V1, V2, V3 workflows from `n8n/workflows/v*/`
5. Configure credentials:
   - **InsureFlow API Key**: Header Auth with your API key
   - **InsureFlow Webhook Secret**: Header Auth for incoming events

### 6. Enable Cron for Dispatcher

In Supabase Dashboard → Database → Extensions, enable `pg_cron`:

```sql
-- Run dispatcher every minute
SELECT cron.schedule(
    'dispatch-outbox',
    '* * * * *',
    $$
    SELECT net.http_post(
        url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/dispatch-outbox',
        headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
    );
    $$
);
```

---

## Monitoring

### Check Event Outbox Status

```sql
-- Pending events
SELECT event_type, COUNT(*), MIN(created_at) as oldest
FROM automation_event_outbox
WHERE status IN ('pending', 'failed')
GROUP BY event_type
ORDER BY oldest;

-- Dead events (need replay)
SELECT * FROM automation_event_outbox
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;

-- Delivery stats (last 24h)
SELECT status, COUNT(*)
FROM automation_event_outbox
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

### Check Gateway Requests

```sql
-- Recent requests
SELECT action, status, duration_ms, created_at
FROM automation_requests
ORDER BY created_at DESC
LIMIT 50;

-- Error rate by action
SELECT action,
       COUNT(*) FILTER (WHERE status = 'ok') as success,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as error_pct
FROM automation_requests
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY action
ORDER BY failed DESC;
```

### Check Platform Health

```sql
-- Is automation enabled?
SELECT enabled, features FROM automation_platform_settings LIMIT 1;
```

---

## Kill Switches

### Disable All Automations

```sql
UPDATE automation_platform_settings SET enabled = false;
```

### Disable Specific Feature

```sql
UPDATE automation_platform_settings
SET features = jsonb_set(features, '{lead_automations}', 'false');
```

### Cancel Pending Events for Event Type

```sql
SELECT cancel_outbox_events(
    p_event_type := 'lead.created',
    p_reason := 'Pausing lead automations for maintenance'
);
```

### Cancel All Pending Events for Workspace

```sql
SELECT cancel_outbox_events(
    p_workspace_id := 'workspace-uuid-here',
    p_reason := 'Workspace requested automation pause'
);
```

---

## Troubleshooting

### Events Not Being Delivered

1. Check if automations are enabled:
   ```sql
   SELECT enabled FROM automation_platform_settings;
   ```

2. Check for stuck events:
   ```sql
   SELECT * FROM automation_event_outbox
   WHERE status = 'pending'
   AND next_attempt_at < NOW() - INTERVAL '5 minutes';
   ```

3. Check dispatcher function logs in Supabase Dashboard

4. Verify N8N_WEBHOOK_URL is correct

### Gateway Returning Errors

1. Check request logs:
   ```sql
   SELECT * FROM automation_requests
   WHERE status = 'failed'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

2. Verify API key is valid and not expired:
   ```sql
   SELECT name, enabled, expires_at, last_used_at
   FROM automation_api_keys
   WHERE enabled = true;
   ```

3. Check action is in key's scopes

### Replaying Dead Events

```sql
-- Replay all dead events
SELECT replay_dead_events(p_limit := 100);

-- Replay dead events for specific type
SELECT replay_dead_events(p_event_type := 'quote.sent', p_limit := 50);

-- Replay dead events for specific workspace
SELECT replay_dead_events(p_workspace_id := 'uuid-here', p_limit := 50);
```

---

## Workflow Inventory

### V1 Pack (Lead & Quote Lifecycle)

| # | Workflow | Trigger | Description |
|---|----------|---------|-------------|
| 1 | Speed-to-Lead | lead.created | SMS, email, call task within 5 min |
| 2 | Lead Source Capture | lead.created | Capture UTM params, referrer |
| 3 | Lead Deduplication | lead.created | Check for duplicate contacts |
| 4 | Missing Info Request | lead.created | Request missing email/phone |
| 5 | Compliance Consent | lead.created | TCPA compliance check |
| 6 | Aging Lead Escalation | Schedule (4h) | Escalate leads > 48h inactive |
| 7 | Nurture Sequence | lead.status_changed | Start drip campaigns |
| 8 | Quote Need Packet | quote.created | Send application requirements |
| 9 | Quote Status Progression | quote.sent | Progress pipeline stage |
| 10 | Quote Followup Scheduler | Schedule (6h) | Schedule follow-up tasks |
| 11 | Quote Expiry Rescue | Schedule (12h) | Outreach before quote expires |
| 12 | Comparison Doc Generator | quote.sent | Generate comparison PDFs |
| 13 | Task Auto-Creation | * | Create tasks from events |

### V2 Pack (Policy & Service)

| # | Workflow | Trigger | Description |
|---|----------|---------|-------------|
| 1 | Policy Welcome | policy.activated | Welcome package, onboarding |
| 2 | Renewal Approaching | Schedule (daily) | 90/60/30/14/7 day notices |
| 3 | Ticket SLA/Assignment | ticket.created | Calculate SLA, auto-assign |
| 4 | Ticket Escalation | Schedule (15m) | SLA breach monitoring |
| 5 | Email Ingest | Webhook | Create tickets from email |
| 6 | SMS Ingest | Webhook | Create tickets/log activity |
| 7 | Document Classification | document.uploaded | Route by doc type |
| 8 | Coverage Gap Alerts | Schedule (daily) | Identify coverage gaps |
| 9 | Cross-Sell Detection | policy.activated | Identify opportunities |
| 10 | Birthday/Anniversary | Schedule (daily) | Send greetings |
| 11 | Referral Request | policy.activated | Schedule referral asks |
| 12 | Review Request | policy.activated | Schedule review requests |
| 13 | Win-Back Campaign | Schedule (weekly) | Re-engage lost customers |

### V3 Pack (Operations & Compliance)

| # | Workflow | Trigger | Description |
|---|----------|---------|-------------|
| 1 | Payment Overdue | Schedule (daily) | Payment reminders |
| 2 | Claim Filed Response | claim.filed | Acknowledgment, task |
| 3 | Policy Cancellation | policy.cancelled | Retention attempts |
| 4 | Agency Performance | Schedule (weekly) | Weekly reports |
| 5 | Producer Commission | Schedule (monthly) | Commission calculation |
| 6 | Carrier Appetite Match | lead.created | Match carriers to risk |
| 7 | Risk Profile Scoring | policy.* | Score risk profile |
| 8 | Remarket Trigger | Schedule (daily) | Identify remarket candidates |
| 9 | COI Auto-Generation | policy.* | Generate COIs |
| 10 | Endorsement Processing | ticket.created | Route endorsements |
| 11 | Audit Preparation | Schedule (monthly) | Prep for WC/GL audits |
| 12 | Compliance Check | Schedule (weekly) | License, CE, E&O checks |
| 13 | Data Quality Cleanup | Schedule (daily) | Fix data issues |

---

## Support

- **Documentation**: `/docs/AUTOMATION_PLATFORM_RUNBOOK.md`
- **Migration**: `/supabase/migrations/20251228600000_automation_platform_foundation.sql`
- **Edge Functions**: `/supabase/functions/dispatch-outbox/`, `/supabase/functions/automation-gateway/`
- **n8n Workflows**: `/n8n/workflows/`

---

**Last Updated**: December 28, 2024
**Version**: 1.0.0
