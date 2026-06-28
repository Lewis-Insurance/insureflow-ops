# Phase-0 go-live artifacts (ready SQL + invocation, GATED — apply at go-live only)

All code is built + committed on `feature/phase0-engine`. These are the exact commands for the
go-live steps. NONE are applied yet. Order: set secrets/domain/Canopy → deploy → schedule governor →
mint pilot → dry-run → fire.

## 1. Governor cron (REQUIRED — nothing sends without it). Apply AFTER the fixed governor is deployed.
Verified there is no governor cron today. Mirrors the existing `internal.get_cron_headers()` pattern.
Safe to schedule before go-live: the global pause is ON, so each tick exits early (zero send).
```sql
SELECT cron.schedule(
  'phase0-marketing-send-governor',
  '* * * * *',
  $$ SELECT net.http_post(
       url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/marketing-send-governor',
       headers := internal.get_cron_headers(),
       body := '{}'::jsonb
     ); $$
);
-- Unschedule (kill): SELECT cron.unschedule('phase0-marketing-send-governor');
```
For the very first pilot you may instead invoke the governor manually once (under watch) before scheduling.

## 2. Dry-run (zero send). Requires deploy + secrets + Canopy mint done.
```bash
curl -sS -X POST 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/phase0-batch-enqueue' \
  -H "x-batch-secret: $BATCH_TRIGGER_SECRET" -H 'content-type: application/json' \
  -d '{ "mode":"dry_run",
        "campaign_key":"phase0_crosssell_2026q3",
        "from_user_id":"<a real producer profiles.id>",
        "agency_postal_address":"Lewis Insurance, <street>, <city>, FL <zip>" }'
# Review: would_send / blocked_compliance / suppressed / no_invite / frequency_blocked + preview_id.
```

## 3. Fire (enqueues only — still no send until the pause is flipped + governor runs).
```bash
curl -sS -X POST 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/phase0-batch-enqueue' \
  -H "x-batch-secret: $BATCH_TRIGGER_SECRET" -H 'content-type: application/json' \
  -d '{ "mode":"fire", "campaign_key":"phase0_crosssell_2026q3",
        "from_user_id":"<same producer id>",
        "agency_postal_address":"<same address>",
        "arm_token":"<BATCH_ARM_SECRET>", "preview_id":"<from the dry-run>" }'
```

## 4. Go live (the actual send).
```sql
UPDATE public.sender_pause_state SET is_paused=false, marketing_paused=false, resumed_at=now()
WHERE scope_type='global';
-- Kill switch (halt immediately; pending rows wait):
-- UPDATE public.sender_pause_state SET is_paused=true, marketing_paused=true, paused_at=now() WHERE scope_type='global';
```

## 5. Canopy mint pilot (≤250). Requires Canopy creds + CANOPY_API_BASE_URL pinned.
```bash
curl -sS -X POST 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/canopy-batch-initiate' \
  -H "x-batch-secret: $BATCH_TRIGGER_SECRET" -H 'content-type: application/json' \
  -d '{ "segment":"phase0", "max_mint":250 }'
# Validate the POST /widgets field mapping in the response before any larger run.
```

## 6. Postmark webhook config. After deploy + domain:
Point Postmark's Bounce + SpamComplaint (and optionally Open/Click/Delivery) webhook at:
`https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/postmark-webhook?token=<POSTMARK_WEBHOOK_SECRET>`
(or HTTP basic auth with POSTMARK_WEBHOOK_USER/_PASS). Required env: one of those secrets.
