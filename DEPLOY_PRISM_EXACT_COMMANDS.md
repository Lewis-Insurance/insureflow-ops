# 🚀 Prism API Deployment - Exact Commands

Use these **exact commands** with your Prism API credentials:

---

## Step 1: Deploy the Edge Function

```bash
supabase functions deploy prism-api --project-ref lrqajzwcmdwahnjyidgv
```

---

## Step 2: Set System-Wide API Key

```bash
supabase secrets set PRISM_SYSTEM_API_KEY=YOUR_PRISM_SYSTEM_API_KEY --project-ref lrqajzwcmdwahnjyidgv
```

---

## Step 3: Set External Prism Service URL

```bash
supabase secrets set PRISM_SERVICE_URL=https://ahnnwwxhchdwwigaixdm.supabase.co/functions/v1/prism-api --project-ref lrqajzwcmdwahnjyidgv
```

---

## Step 4: Verify Secrets

```bash
supabase secrets list --project-ref lrqajzwcmdwahnjyidgv
```

You should see:
- ✅ `PRISM_SYSTEM_API_KEY` (value hidden)
- ✅ `PRISM_SERVICE_URL` = `https://ahnnwwxhchdwwigaixdm.supabase.co/functions/v1/prism-api`

---

## Step 5: Test It!

### Test via UI
1. Go to `/prism-ai` in your app
2. Enter a prompt
3. Click "Start Analysis"
4. Should work! 🎉

### Test via API
```bash
curl -X POST https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/prism-api/run \
  -H "Authorization: Bearer YOUR_PRISM_SYSTEM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Test prompt",
    "mode": "sequential",
    "depth": "insight"
  }'
```

---

## ✅ All Commands in One Block

Copy and paste these one by one:

```bash
# 1. Deploy function
supabase functions deploy prism-api --project-ref lrqajzwcmdwahnjyidgv

# 2. Set API key
supabase secrets set PRISM_SYSTEM_API_KEY=YOUR_PRISM_SYSTEM_API_KEY --project-ref lrqajzwcmdwahnjyidgv

# 3. Set service URL
supabase secrets set PRISM_SERVICE_URL=https://ahnnwwxhchdwwigaixdm.supabase.co/functions/v1/prism-api --project-ref lrqajzwcmdwahnjyidgv

# 4. Verify
supabase secrets list --project-ref lrqajzwcmdwahnjyidgv
```

---

## 🔧 What I Updated

I updated the edge function to **forward the API key** to your external Prism service. The function now:
1. Validates the API key from the request
2. Forwards the request to your Prism service at `ahnnwwxhchdwwigaixdm.supabase.co`
3. Includes the API key in the Authorization header when forwarding

This ensures your external Prism service receives authenticated requests.

---

## 🎯 Next Steps

1. Run the commands above
2. Test at `/prism-ai` in your app
3. Everything should work! 🚀

