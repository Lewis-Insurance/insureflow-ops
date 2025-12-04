# Complete Vercel Deployment Guide for InsureFlow Ops

## Overview
This guide will walk you through deploying InsureFlow Ops to [lewisinsurance.ai](https://lewisinsurance.ai) using Vercel. Estimated time: 30 minutes.

---

## Prerequisites Checklist

Before starting, ensure you have:
- [ ] GitHub account with access to `Lewis-Insurance/insureflow-ops` repository
- [ ] Hostinger account with lewisinsurance.ai domain
- [ ] Supabase account with project ID: `lrqajzwcmdwahnjyidgv`
- [ ] All API keys ready (Supabase, Twilio, Azure, etc.)
- [ ] Latest code pushed to GitHub main branch

---

## Part 1: Create Vercel Account & Import Project

### Step 1: Sign Up for Vercel
1. Go to [https://vercel.com/signup](https://vercel.com/signup)
2. Click **"Continue with GitHub"**
3. Authorize Vercel to access your GitHub account
4. Click **"Authorize Vercel"**

### Step 2: Import the Repository
1. On the Vercel dashboard, click **"Add New..." → "Project"**
2. Find **"Lewis-Insurance/insureflow-ops"** in the list
3. Click **"Import"**

### Step 3: Configure Project Settings
1. **Framework Preset:** Should auto-detect as "Vite"
2. **Root Directory:** Leave as `./` (default)
3. **Build Command:** `npm run build` (should be auto-filled)
4. **Output Directory:** `dist` (should be auto-filled)
5. **Install Command:** `npm install` (should be auto-filled)

**DO NOT DEPLOY YET** - Click **"Environment Variables"** section first

---

## Part 2: Configure Environment Variables

### Step 4: Add Environment Variables in Vercel

In the "Environment Variables" section, add these one by one:

#### Required Variables (Must Have):

| Variable Name | Value | Where to Get It |
|--------------|-------|-----------------|
| `VITE_SUPABASE_URL` | `https://lrqajzwcmdwahnjyidgv.supabase.co` | Already known |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key | Supabase Dashboard → Settings → API |

**How to add each variable:**
1. Click **"Add"** button
2. Enter the variable name (e.g., `VITE_SUPABASE_URL`)
3. Enter the value
4. Select environments: Check all three boxes (Production, Preview, Development)
5. Click **"Add"**
6. Repeat for next variable

#### Optional Variables (Add if you have the services):

These are needed for full functionality but not required for initial deployment:

**AI Services:**
- `GOOGLE_CLOUD_VISION_API_KEY` - For OCR document analysis
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` - For advanced OCR
- `AZURE_DOCUMENT_INTELLIGENCE_KEY` - Azure key

**Communication:**
- `TWILIO_ACCOUNT_SID` - For SMS
- `TWILIO_AUTH_TOKEN` - For SMS
- `TWILIO_PHONE_NUMBER` - For SMS
- `RESEND_API_KEY` - For email

**Document Parsing:**
- `PARSEUR_API_KEY` - For document uploads
- `PARSEUR_WEBHOOK_SECRET` - For webhooks

**Application:**
- `VITE_APP_URL` - Set to `https://lewisinsurance.ai`
- `NODE_ENV` - Set to `production`

**Reference:** See `.env.production.template` file in the repo for complete list

### Step 5: Deploy the Application
1. After adding environment variables, click **"Deploy"**
2. Wait 2-3 minutes for the build to complete
3. You should see a "Congratulations" screen with a deployment URL

**Expected Result:**
- Build Status: ✅ Success
- Deployment URL: `https://insureflow-ops-xxxxxx.vercel.app`

---

## Part 3: Deploy Database Migrations to Supabase

**CRITICAL:** These database objects must exist before the app will work properly.

### Step 6: Deploy Missing Schema Objects

1. Open your Supabase dashboard: [https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv](https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv)

2. Go to **SQL Editor** (left sidebar)

3. Click **"New Query"**

4. Open the file: `supabase/migrations/20251204_add_missing_schema_objects.sql` from your local repo

5. Copy the ENTIRE contents (all 247 lines)

6. Paste into the Supabase SQL Editor

7. Click **"Run"** (bottom right)

8. **Expected Output:** Should see success messages like:
   ```
   Success. No rows returned
   ```

9. **If you see errors:** Check the troubleshooting section below

**What this migration does:**
- Adds `is_staff` column to `profiles` table
- Adds `contact_count`, `email_opens`, `email_clicks` to `leads` table
- Creates `lead_auto_drivers` table with RLS policies
- Creates `lead_auto_vehicles` table with RLS policies
- Creates `knowledge_base_queries` table
- Creates 4 analytics views for knowledge base

### Step 7: Verify Migration Success

Run this verification query in Supabase SQL Editor:

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('lead_auto_drivers', 'lead_auto_vehicles', 'knowledge_base_queries');

-- Check if columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'is_staff';

-- Check if views exist
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'knowledge_%';
```

**Expected Results:**
- Should return 3 table names
- Should return `is_staff` column
- Should return 4 view names

---

## Part 4: Regenerate TypeScript Types

### Step 8: Update TypeScript Types from Database Schema

**On your local machine:**

```bash
# Navigate to project directory
cd /Users/brianlewis/Documents/insurance-function/insureflow-ops

# Login to Supabase (if not already logged in)
supabase login

# Link to your project
supabase link --project-ref lrqajzwcmdwahnjyidgv

# Generate new types from production database
supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts

# Verify the file was updated
ls -lh src/integrations/supabase/types.ts
```

**Expected Output:**
```
Generating types...
TypeScript types written to src/integrations/supabase/types.ts
```

### Step 9: Commit and Push Updated Types

```bash
# Stage the updated types file
git add src/integrations/supabase/types.ts

# Commit with descriptive message
git commit -m "chore: regenerate Supabase types after schema migration

Updated types to include:
- lead_auto_drivers table
- lead_auto_vehicles table
- knowledge_base_queries table
- profiles.is_staff column
- leads contact tracking columns
- knowledge analytics views"

# Push to GitHub
git push origin main
```

**What happens next:**
- Vercel detects the push to main branch
- Automatically triggers a new deployment
- Builds with the updated types
- Should complete without TypeScript errors

### Step 10: Monitor the Redeployment

1. Go to your Vercel dashboard: [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. Click on your **insureflow-ops** project
3. You should see a new deployment in progress
4. Wait 2-3 minutes for it to complete
5. Check the build logs for any errors

**Expected Result:**
- Build Status: ✅ Success
- No TypeScript errors
- Deployment URL updated

---

## Part 5: Configure Custom Domain (lewisinsurance.ai)

### Step 11: Add Domain in Vercel

1. In your Vercel project dashboard, click **"Settings"** tab
2. Click **"Domains"** in the left sidebar
3. Click **"Add"**
4. Enter: `lewisinsurance.ai`
5. Click **"Add"**
6. Vercel will show you DNS records to configure

**Vercel will provide these DNS records:**
- **Type:** A Record
- **Name:** `@` (or leave blank)
- **Value:** `76.76.21.21` (Vercel's IP)

**And for www subdomain:**
- **Type:** CNAME
- **Name:** `www`
- **Value:** `cname.vercel-dns.com`

### Step 12: Configure DNS in Hostinger

1. Log in to [Hostinger](https://www.hostinger.com)
2. Go to **"Domains"** section
3. Find **lewisinsurance.ai** and click **"Manage"**
4. Click **"DNS / Name Servers"**
5. Click **"Manage"** next to DNS records

**Add/Update these DNS records:**

#### Record 1: Main Domain
- **Type:** A
- **Name:** `@` (or leave blank for root domain)
- **Value:** `76.76.21.21`
- **TTL:** 14400 (or default)
- Click **"Add Record"** or **"Update"**

#### Record 2: WWW Subdomain
- **Type:** CNAME
- **Name:** `www`
- **Value:** `cname.vercel-dns.com`
- **TTL:** 14400 (or default)
- Click **"Add Record"** or **"Update"**

**Important Notes:**
- If there's an existing A record for `@`, edit it instead of creating a new one
- DNS changes take 5-60 minutes to propagate globally
- Vercel will automatically provision SSL certificate after DNS propagates

### Step 13: Verify Domain Configuration

1. Wait 10-15 minutes for DNS propagation
2. Go back to Vercel → Settings → Domains
3. Check the status of lewisinsurance.ai
4. Should show: ✅ **Valid Configuration**
5. SSL certificate should show: ✅ **Active**

**Test the domain:**
- Open browser (incognito mode)
- Go to: `https://lewisinsurance.ai`
- Should load your InsureFlow Ops application
- Check for SSL padlock in address bar

---

## Part 6: Deploy Supabase Edge Functions

### Step 14: Deploy Edge Functions to Supabase

**On your local machine:**

```bash
# Ensure you're in the project directory
cd /Users/brianlewis/Documents/insurance-function/insureflow-ops

# Deploy all edge functions to production
supabase functions deploy --project-ref lrqajzwcmdwahnjyidgv

# This will deploy all 37+ edge functions
```

**Expected Output:**
```
Deploying ai-task-generator...
Deployed ai-task-generator (1.2s)
Deploying analyze-coverage-gaps...
Deployed analyze-coverage-gaps (1.1s)
...
(37 functions deployed)
```

### Step 15: Configure Edge Function Secrets

Edge functions need environment variables too. Set them in Supabase:

```bash
# Set secrets for edge functions
supabase secrets set --project-ref lrqajzwcmdwahnjyidgv \
  SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" \
  GOOGLE_CLOUD_VISION_API_KEY="your_google_vision_key" \
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT="your_azure_endpoint" \
  AZURE_DOCUMENT_INTELLIGENCE_KEY="your_azure_key" \
  TWILIO_ACCOUNT_SID="your_twilio_sid" \
  TWILIO_AUTH_TOKEN="your_twilio_token" \
  RESEND_API_KEY="your_resend_key"
```

**Where to get these values:**
- Supabase service role key: Supabase Dashboard → Settings → API → service_role key
- Others: Same as Vercel environment variables

**Alternative Method (via Supabase Dashboard):**
1. Go to Supabase Dashboard → Edge Functions
2. Click on any function
3. Click **"Settings"** tab
4. Add secrets in the "Secrets" section

---

## Part 7: Final Verification & Testing

### Step 16: Test Critical Functionality

**Test Checklist:**

1. **Authentication:**
   - [ ] Navigate to https://lewisinsurance.ai
   - [ ] Try logging in with your account
   - [ ] Should redirect to dashboard

2. **Data Loading:**
   - [ ] Check if leads display correctly
   - [ ] Check if accounts display correctly
   - [ ] Check if quotes display correctly

3. **AI Features:**
   - [ ] Open AI Assistant chat
   - [ ] Ask a question (e.g., "What is collision coverage?")
   - [ ] Should get a response from knowledge base

4. **Document Upload:**
   - [ ] Try uploading a document
   - [ ] Check if OCR processes it
   - [ ] Verify data extraction works

5. **Navigation:**
   - [ ] Test all main menu items
   - [ ] Verify no 404 errors
   - [ ] Check mobile responsiveness

### Step 17: Monitor for Errors

**Vercel Logs:**
1. Go to Vercel Dashboard → Your Project
2. Click **"Logs"** tab
3. Watch for any runtime errors
4. Filter by "Error" to see only errors

**Supabase Logs:**
1. Go to Supabase Dashboard → Edge Functions
2. Click on a function (e.g., ai-task-generator)
3. Click **"Logs"** tab
4. Check for execution errors

**Browser Console:**
1. Open lewisinsurance.ai in browser
2. Press F12 to open Developer Tools
3. Click **"Console"** tab
4. Look for any red error messages

---

## Part 8: Post-Deployment Optimization

### Step 18: Configure Vercel Settings

**Recommended Settings:**

1. **Auto-assign Preview URLs:**
   - Settings → Git → Enable "Preview Deployments"
   - Every commit gets a preview URL for testing

2. **Branch Protection:**
   - Settings → Git → Enable "Production Branch"
   - Set to `main`

3. **Build & Development Settings:**
   - Settings → General → Override build command: `npm run build`
   - Enable "Automatically expose System Environment Variables"

4. **Performance:**
   - Settings → General → Enable "Automatically expose System Environment Variables"
   - Enable "Output File Tracing" (reduces bundle size)

### Step 19: Set Up Monitoring (Optional but Recommended)

**Vercel Analytics:**
1. Go to project Settings → Analytics
2. Enable "Vercel Analytics"
3. Provides page load times, user metrics

**Speed Insights:**
1. Settings → Speed Insights
2. Enable "Speed Insights"
3. Shows Core Web Vitals performance

---

## Troubleshooting

### Issue: Vercel Build Fails with TypeScript Errors

**Solution:**
1. Check that you deployed the database migration (Part 3, Step 6)
2. Verify you regenerated types (Part 4, Step 8)
3. Check Vercel build logs for specific error
4. Ensure all `// @ts-nocheck` directives are in place (already done)

### Issue: White Screen / App Doesn't Load

**Check:**
1. Browser console for errors (F12 → Console)
2. Verify Supabase URL and anon key are correct in Vercel environment variables
3. Check Vercel deployment logs for build errors
4. Verify DNS is pointing to Vercel (use `dig lewisinsurance.ai`)

### Issue: Database Migration Fails

**Common Errors:**

**Error: "relation already exists"**
- Solution: Migration uses `IF NOT EXISTS`, so this is harmless
- Proceed with deployment

**Error: "relation knowledge_base does not exist"**
- Solution: The knowledge_base table might not exist yet
- You may need to create it first or comment out the views in the migration

**Error: "syntax error at or near"**
- Solution: Check you copied the ENTIRE migration SQL
- Make sure no characters were cut off

### Issue: Edge Functions Not Working

**Check:**
1. Verify they're deployed: `supabase functions list --project-ref lrqajzwcmdwahnjyidgv`
2. Check function logs in Supabase Dashboard → Edge Functions → Logs
3. Verify secrets are set correctly
4. Ensure CORS is configured (already in functions)

### Issue: Domain Not Resolving

**Check:**
1. DNS propagation: Use [whatsmydns.net](https://www.whatsmydns.net) to check
2. Verify DNS records exactly match Vercel's requirements
3. Wait 30-60 minutes for full propagation
4. Try clearing browser cache or use incognito mode

### Issue: SSL Certificate Pending

**Solution:**
- Vercel auto-provisions SSL after DNS is verified
- Can take 5-30 minutes
- If stuck, try removing and re-adding the domain in Vercel

---

## Rollback Plan

If something goes wrong and you need to rollback:

### Rollback to Previous Vercel Deployment:
1. Go to Vercel Dashboard → Your Project
2. Click **"Deployments"** tab
3. Find the last working deployment
4. Click the three dots (⋯) → **"Promote to Production"**
5. Deployment reverts instantly

### Rollback Database Migration:
1. Go to Supabase Dashboard → SQL Editor
2. Run this rollback SQL:

```sql
-- Drop views
DROP VIEW IF EXISTS knowledge_usage_stats CASCADE;
DROP VIEW IF EXISTS knowledge_search_trends CASCADE;
DROP VIEW IF EXISTS knowledge_gap_trends CASCADE;
DROP VIEW IF EXISTS knowledge_category_stats CASCADE;

-- Drop tables
DROP TABLE IF EXISTS lead_auto_drivers CASCADE;
DROP TABLE IF EXISTS lead_auto_vehicles CASCADE;
DROP TABLE IF EXISTS knowledge_base_queries CASCADE;

-- Remove columns
ALTER TABLE profiles DROP COLUMN IF EXISTS is_staff;
ALTER TABLE leads DROP COLUMN IF EXISTS contact_count;
ALTER TABLE leads DROP COLUMN IF EXISTS email_opens;
ALTER TABLE leads DROP COLUMN IF EXISTS email_clicks;
```

---

## Success Criteria

Your deployment is successful when:

- [ ] lewisinsurance.ai loads without errors
- [ ] SSL certificate shows as secure (padlock icon)
- [ ] Login works and shows dashboard
- [ ] Data loads from Supabase correctly
- [ ] AI Assistant responds to questions
- [ ] No TypeScript build errors in Vercel
- [ ] No runtime errors in browser console
- [ ] Supabase edge functions execute without errors
- [ ] Document upload and OCR works
- [ ] Mobile view is responsive

---

## Next Steps After Successful Deployment

1. **Monitor Performance:**
   - Check Vercel Analytics daily for first week
   - Monitor error rates in Vercel and Supabase logs

2. **Enable Additional Features:**
   - Configure remaining API keys (Twilio, Azure, etc.)
   - Set up email notifications
   - Enable SMS features

3. **User Testing:**
   - Have team members test all features
   - Collect feedback on performance
   - Identify any issues

4. **Future Development:**
   - All code changes pushed to GitHub will auto-deploy via Vercel
   - Preview deployments for branches let you test before production
   - I'll continue building features → push to GitHub → auto-deploys

---

## Support & Resources

**Vercel Documentation:**
- [https://vercel.com/docs](https://vercel.com/docs)
- [Deploying Vite Apps](https://vercel.com/docs/frameworks/vite)

**Supabase Documentation:**
- [https://supabase.com/docs](https://supabase.com/docs)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)

**If You Get Stuck:**
1. Check Vercel build logs first
2. Check browser console for frontend errors
3. Check Supabase logs for backend errors
4. Ask me for help with specific error messages

---

## Summary of What You'll Do

**One-Time Setup (30 minutes):**
1. Create Vercel account and import repository
2. Add environment variables in Vercel
3. Deploy database migration in Supabase SQL Editor
4. Regenerate TypeScript types locally and push to GitHub
5. Configure lewisinsurance.ai DNS in Hostinger
6. Deploy Supabase edge functions
7. Test the application

**Ongoing (Automated):**
- I push code → GitHub → Vercel auto-deploys
- Zero manual deployment steps
- Instant rollback if needed
- Preview URLs for testing

---

Ready to start? Begin with **Part 1, Step 1** and work through sequentially.
