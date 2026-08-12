# 🚀 Prism API Deployment Steps

Follow these steps in order to deploy the Prism API integration.

---

## Step 1: Deploy the Edge Function

Run this command in your terminal:

```bash
supabase functions deploy prism-api --project-ref lrqajzwcmdwahnjyidgv
```

**Expected output:**
```
Deploying prism-api...
Deployed prism-api (1.2s)
```

**If you get an error about Supabase CLI not being installed:**
```bash
# Install Supabase CLI (if not already installed)
# On macOS:
brew install supabase/tap/supabase

# Or using npm:
npm install -g supabase

# Then login:
supabase login
```

---

## Step 2: Set System-Wide API Key Secret

Set your Prism API key as a Supabase secret:

```bash
supabase secrets set PRISM_SYSTEM_API_KEY=sk_prism_your_actual_key_here --project-ref lrqajzwcmdwahnjyidgv
```

**Replace `sk_prism_your_actual_key_here` with your actual Prism API key.**

**Example:**
```bash
supabase secrets set PRISM_SYSTEM_API_KEY=sk_prism_abc123xyz789 --project-ref lrqajzwcmdwahnjyidgv
```

**Expected output:**
```
Secret PRISM_SYSTEM_API_KEY set successfully
```

---

## Step 3: Set External Prism Service URL

Since you're using Option A (external Prism service), set the service URL:

```bash
supabase secrets set PRISM_SERVICE_URL=https://your-prism-service.com --project-ref lrqajzwcmdwahnjyidgv
```

**Replace `https://your-prism-service.com` with your actual Prism service URL.**

**Example:**
```bash
supabase secrets set PRISM_SERVICE_URL=https://api.prism-ai.com/v1 --project-ref lrqajzwcmdwahnjyidgv
```

**Expected output:**
```
Secret PRISM_SERVICE_URL set successfully
```

---

## Step 4: Verify Secrets Are Set

Verify that your secrets are configured:

```bash
supabase secrets list --project-ref lrqajzwcmdwahnjyidgv
```

You should see:
- `PRISM_SYSTEM_API_KEY` (value will be hidden)
- `PRISM_SERVICE_URL` (value will be shown)

---

## Step 5: Test the Deployment

### Test via UI
1. Navigate to `/prism-ai` in your application
2. Enter a prompt and click "Start Analysis"
3. Check if it works!

### Test via API
```bash
curl -X POST https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/prism-api/run \
  -H "Authorization: Bearer sk_prism_your_actual_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test prompt",
    "mode": "sequential",
    "depth": "insight"
  }'
```

---

## Optional: Webhook Secret (If Needed)

If you want webhook signature verification:

```bash
supabase secrets set PRISM_WEBHOOK_SECRET=your_webhook_secret_here --project-ref lrqajzwcmdwahnjyidgv
```

---

## Troubleshooting

### Error: "command not found: supabase"
Install the Supabase CLI:
```bash
brew install supabase/tap/supabase
# or
npm install -g supabase
```

### Error: "Not authenticated"
Login to Supabase:
```bash
supabase login
```

### Error: "Permission denied"
Make sure you're using the correct project ref and have admin access.

### Edge function not working?
Check the logs:
```bash
supabase functions logs prism-api --project-ref lrqajzwcmdwahnjyidgv
```

---

## Quick Reference: All Commands

```bash
# 1. Deploy function
supabase functions deploy prism-api --project-ref lrqajzwcmdwahnjyidgv

# 2. Set API key
supabase secrets set PRISM_SYSTEM_API_KEY=sk_prism_... --project-ref lrqajzwcmdwahnjyidgv

# 3. Set service URL
supabase secrets set PRISM_SERVICE_URL=https://... --project-ref lrqajzwcmdwahnjyidgv

# 4. Verify
supabase secrets list --project-ref lrqajzwcmdwahnjyidgv

# 5. Check logs (if needed)
supabase functions logs prism-api --project-ref lrqajzwcmdwahnjyidgv
```

---

## ✅ Completion Checklist

- [ ] Edge function deployed successfully
- [ ] `PRISM_SYSTEM_API_KEY` secret set
- [ ] `PRISM_SERVICE_URL` secret set
- [ ] Tested via UI or API
- [ ] Everything working!

---

**Once you've completed these steps, the Prism API integration will be fully operational!** 🎉

