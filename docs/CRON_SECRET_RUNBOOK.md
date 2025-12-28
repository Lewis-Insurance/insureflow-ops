# Cron Secret Setup Runbook

**Purpose:** Secure pg_cron calls to edge functions with a shared secret.

**Why:** Without this, anyone with the public anon key can call scheduled actions like `process_triggers`, `execute_stages`, etc.

---

## Prerequisites

- [ ] Migration `20251227400000_cron_secret_infrastructure.sql` has been applied
- [ ] Edge functions have been deployed with cron secret verification
- [ ] You have access to Supabase SQL Editor (Dashboard → SQL Editor)

---

## Step 1: Generate a Secure Secret

Generate a 64+ character random secret. Use one of these methods:

**Option A: OpenSSL (recommended)**
```bash
openssl rand -base64 48
```

**Option B: Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**Option C: Python**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Save this secret securely - you'll need it for both Vault and Edge Functions.

---

## Step 2: Add Secret to Supabase Vault

Run this SQL in the Supabase SQL Editor:

```sql
-- Insert the cron secret into Vault
SELECT vault.create_secret(
  'CRON_SECRET',
  'YOUR_GENERATED_SECRET_HERE'  -- Replace with your actual secret
);

-- Verify it was created
SELECT name, created_at FROM vault.secrets WHERE name = 'CRON_SECRET';
```

---

## Step 3: Add Secret to Edge Functions

1. Go to Supabase Dashboard → Settings → Edge Functions → Secrets
2. Add a new secret:
   - **Name:** `CRON_SECRET`
   - **Value:** Same secret you used in Vault

This allows edge functions to verify the incoming `X-Cron-Secret` header.

---

## Step 4: Enable Cron Jobs

Run each of these cron.schedule calls individually in the SQL Editor:

### 4.1 Process automation triggers (every 5 minutes)
```sql
SELECT cron.schedule(
  'automation-process-triggers',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
    headers := internal.get_cron_headers(),
    body := '{"action": "process_triggers"}'::jsonb
  );
  $$
);
```

### 4.2 Execute scheduled stages (every 5 minutes)
```sql
SELECT cron.schedule(
  'automation-execute-stages',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
    headers := internal.get_cron_headers(),
    body := '{"action": "execute_stages"}'::jsonb
  );
  $$
);
```

### 4.3 Check automation goals (every 15 minutes)
```sql
SELECT cron.schedule(
  'automation-check-goals',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
    headers := internal.get_cron_headers(),
    body := '{"action": "check_goals"}'::jsonb
  );
  $$
);
```

### 4.4 Cleanup old executions (daily at 3 AM)
```sql
SELECT cron.schedule(
  'automation-cleanup',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor',
    headers := internal.get_cron_headers(),
    body := '{"action": "cleanup"}'::jsonb
  );
  $$
);
```

### 4.5 Renewal risk batch (daily at 2 AM)
```sql
SELECT cron.schedule(
  'daily-renewal-risk-calculation',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/renewal-risk-batch',
    headers := internal.get_cron_headers(),
    body := '{"days_ahead": 120}'::jsonb
  );
  $$
);
```

---

## Step 5: Verify Setup

### 5.1 Check Cron Jobs Are Scheduled

```sql
SELECT * FROM internal.cron_job_status;
```

### 5.2 Test Secret Header Works

```bash
# Should return 401 (no secret)
curl -X POST \
  'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor' \
  -H 'Content-Type: application/json' \
  -d '{"action": "process_triggers"}'

# Should return 200 (with secret)
curl -X POST \
  'https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/automation-processor' \
  -H 'Content-Type: application/json' \
  -H 'X-Cron-Secret: YOUR_SECRET_HERE' \
  -d '{"action": "process_triggers"}'
```

### 5.3 Check Job Run History

After a few minutes, verify jobs are succeeding:

```sql
SELECT
  jobname,
  status,
  start_time,
  end_time,
  return_message
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

---

## Troubleshooting

### Jobs Failing with 401/403

1. Verify `CRON_SECRET` exists in Vault:
   ```sql
   SELECT name FROM vault.secrets WHERE name = 'CRON_SECRET';
   ```

2. Verify `CRON_SECRET` is set in Edge Function secrets (Dashboard)

3. Check the secret values match exactly (no extra whitespace)

### Jobs Not Running

1. Check job is scheduled:
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE 'automation%';
   ```

2. Check job is active:
   ```sql
   SELECT jobname, active FROM cron.job;
   ```

### Edge Function Errors

Check function logs in Supabase Dashboard → Edge Functions → [function name] → Logs

---

## Rollback

If something goes wrong:

```sql
-- Disable all automation cron jobs
SELECT cron.unschedule('automation-process-triggers');
SELECT cron.unschedule('automation-execute-stages');
SELECT cron.unschedule('automation-check-goals');
SELECT cron.unschedule('automation-cleanup');
SELECT cron.unschedule('daily-renewal-risk-calculation');

-- Remove Vault secret (if needed)
DELETE FROM vault.secrets WHERE name = 'CRON_SECRET';
```

---

## Security Notes

1. **Never commit the secret to git** - this runbook uses placeholders
2. **Rotate the secret periodically** - update both Vault and Edge Function secrets
3. **Monitor job failures** - failed cron jobs may indicate auth issues
4. **Audit access** - only admins should run these SQL commands

---

**Last Updated:** December 27, 2025
