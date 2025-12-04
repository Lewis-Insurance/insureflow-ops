# Pre-Deployment Checklist for lewisinsurance.ai

## Overview
Complete this checklist before starting the Vercel deployment to ensure smooth deployment.

**Estimated Time:** 15-20 minutes to verify everything

---

## 1. GitHub Repository Status

### Verify Latest Code is Pushed
- [ ] Open terminal
- [ ] Navigate to project: `cd /Users/brianlewis/Documents/insurance-function/insureflow-ops`
- [ ] Check status: `git status`
- [ ] Should show: "Your branch is up to date with 'origin/main'"
- [ ] If not, push changes: `git push origin main`

### Verify Repository Access
- [ ] Go to [https://github.com/Lewis-Insurance/insureflow-ops](https://github.com/Lewis-Insurance/insureflow-ops)
- [ ] Confirm you have admin access
- [ ] Verify latest commit shows your recent changes

---

## 2. Supabase Project Status

### Verify Project Access
- [ ] Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
- [ ] Confirm you see project: **lrqajzwcmdwahnjyidgv**
- [ ] Click on project to open dashboard
- [ ] Verify you have admin access

### Collect Required Credentials
- [ ] Navigate to: **Settings** → **API**
- [ ] Copy **Project URL:** `https://lrqajzwcmdwahnjyidgv.supabase.co`
- [ ] Copy **anon public key** (starts with `eyJ...`)
- [ ] Copy **service_role key** (starts with `eyJ...`)
- [ ] Save these in a secure note/password manager

### Verify Database is Accessible
- [ ] In Supabase Dashboard, click **Table Editor**
- [ ] Verify you see tables: `profiles`, `leads`, `accounts`, `quotes`, etc.
- [ ] Click **SQL Editor**
- [ ] Run test query: `SELECT COUNT(*) FROM profiles;`
- [ ] Should return a number (confirms database access)

---

## 3. Environment Variables Collection

### Required Variables (Must Have)
- [ ] **VITE_SUPABASE_URL:** (from step 2.2 above)
- [ ] **VITE_SUPABASE_ANON_KEY:** (from step 2.2 above)
- [ ] **SUPABASE_SERVICE_ROLE_KEY:** (from step 2.2 above)

### Optional Variables (Collect if You Have Services)

#### AI Services
- [ ] **GOOGLE_CLOUD_VISION_API_KEY:** Check Google Cloud Console
- [ ] **AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:** Check Azure Portal
- [ ] **AZURE_DOCUMENT_INTELLIGENCE_KEY:** Check Azure Portal

#### Communication Services
- [ ] **TWILIO_ACCOUNT_SID:** Check Twilio Console
- [ ] **TWILIO_AUTH_TOKEN:** Check Twilio Console
- [ ] **TWILIO_PHONE_NUMBER:** Your Twilio phone number
- [ ] **RESEND_API_KEY:** Check Resend dashboard

#### Document Parsing
- [ ] **PARSEUR_API_KEY:** Check Parseur dashboard
- [ ] **PARSEUR_WEBHOOK_SECRET:** Check Parseur settings

#### Google Drive (if using)
- [ ] **GOOGLE_DRIVE_CLIENT_ID:** Check Google Cloud Console
- [ ] **GOOGLE_DRIVE_CLIENT_SECRET:** Check Google Cloud Console

**Pro Tip:** Create a text file with all these values formatted like:
```
VITE_SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 4. Hostinger Account Status

### Verify Domain Ownership
- [ ] Go to [https://www.hostinger.com](https://www.hostinger.com)
- [ ] Log in to your account
- [ ] Navigate to **Domains**
- [ ] Confirm you see: **lewisinsurance.ai**
- [ ] Click **Manage** next to lewisinsurance.ai
- [ ] Verify domain is active (not expired)

### Check DNS Access
- [ ] In domain management, click **DNS / Name Servers**
- [ ] Verify you can see DNS records
- [ ] Confirm you have edit access
- [ ] Note any existing A records (you'll delete these later)

---

## 5. Local Development Environment

### Verify Node.js & npm
```bash
# Check Node.js version (should be 18+ or 20+)
node --version

# Check npm version (should be 9+ or 10+)
npm --version

# If outdated, update Node.js:
# Mac: brew install node@20
# Windows: Download from nodejs.org
```

- [ ] Node.js version: 18+ or 20+
- [ ] npm version: 9+ or 10+

### Verify Supabase CLI
```bash
# Check if Supabase CLI is installed
supabase --version

# If not installed:
# Mac: brew install supabase/tap/supabase
# Windows: scoop install supabase
# Or: npm install -g supabase
```

- [ ] Supabase CLI installed
- [ ] Version: 1.0+ or higher

### Test Local Build
```bash
# Navigate to project
cd /Users/brianlewis/Documents/insurance-function/insureflow-ops

# Install dependencies
npm install

# Run build to verify no errors
npm run build
```

**Expected Output:**
```
vite v4.x.x building for production...
✓ 1234 modules transformed.
dist/index.html                  x KB
dist/assets/index-xxxxx.js      xx KB
✓ built in xxxxxms
```

- [ ] Build completes without errors
- [ ] `dist/` folder created
- [ ] No TypeScript errors (thanks to @ts-nocheck)

---

## 6. Deployment Files Verification

### Verify New Configuration Files Exist
```bash
cd /Users/brianlewis/Documents/insurance-function/insureflow-ops

# Check Vercel config
ls -la vercel.json

# Check Vercel ignore file
ls -la .vercelignore

# Check environment template
ls -la .env.production.template

# Check deployment guides
ls -la VERCEL_DEPLOYMENT_GUIDE.md
ls -la HOSTINGER_DNS_SETUP.md
ls -la SUPABASE_EDGE_FUNCTIONS_STATUS.md
ls -la PRE_DEPLOYMENT_CHECKLIST.md
```

**All files should exist:**
- [ ] `vercel.json`
- [ ] `.vercelignore`
- [ ] `.env.production.template`
- [ ] `VERCEL_DEPLOYMENT_GUIDE.md`
- [ ] `HOSTINGER_DNS_SETUP.md`
- [ ] `SUPABASE_EDGE_FUNCTIONS_STATUS.md`
- [ ] `PRE_DEPLOYMENT_CHECKLIST.md` (this file)
- [ ] `DEPLOY_MIGRATION.md` (existing)

---

## 7. Database Migration Preparation

### Verify Migration File Exists
```bash
ls -la supabase/migrations/20251204_add_missing_schema_objects.sql
```

- [ ] Migration file exists
- [ ] File size: ~8-10 KB (247 lines)

### Review Migration Contents
```bash
# View first 20 lines
head -20 supabase/migrations/20251204_add_missing_schema_objects.sql

# View total lines
wc -l supabase/migrations/20251204_add_missing_schema_objects.sql
```

**Should contain:**
- [ ] ALTER TABLE statements for profiles and leads
- [ ] CREATE TABLE for lead_auto_drivers
- [ ] CREATE TABLE for lead_auto_vehicles
- [ ] CREATE TABLE for knowledge_base_queries
- [ ] CREATE VIEW statements for knowledge analytics
- [ ] RLS policies for new tables

---

## 8. Create Vercel Account (If Not Already Done)

### Sign Up for Vercel
- [ ] Go to [https://vercel.com/signup](https://vercel.com/signup)
- [ ] Click **"Continue with GitHub"**
- [ ] Authorize Vercel
- [ ] Confirm email if required
- [ ] Free plan is sufficient (no payment needed)

### Verify GitHub Connection
- [ ] In Vercel dashboard, check that GitHub is connected
- [ ] Should show your GitHub username
- [ ] Should list available repositories

---

## 9. Final Pre-Deployment Checks

### Code Quality
- [ ] No uncommitted changes: `git status` shows clean
- [ ] Latest code on GitHub main branch
- [ ] No obvious bugs in recent commits
- [ ] Build passes locally: `npm run build`

### Access & Permissions
- [ ] GitHub: Admin access to `Lewis-Insurance/insureflow-ops`
- [ ] Supabase: Admin access to project `lrqajzwcmdwahnjyidgv`
- [ ] Hostinger: Can edit DNS for lewisinsurance.ai
- [ ] Vercel: Account created and GitHub connected

### Documentation
- [ ] Read through `VERCEL_DEPLOYMENT_GUIDE.md` (skim it)
- [ ] Have `HOSTINGER_DNS_SETUP.md` ready for reference
- [ ] Know where to find API keys and credentials

### Time & Focus
- [ ] Set aside 30-45 minutes uninterrupted
- [ ] Have all credentials ready and accessible
- [ ] Browser open with relevant tabs
- [ ] Terminal ready with project directory

---

## 10. API Keys Validation (Optional but Recommended)

### Test Supabase Connection
```bash
# Test with curl
curl https://lrqajzwcmdwahnjyidgv.supabase.co/rest/v1/profiles \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Should return JSON (even if empty array)
```

- [ ] Supabase API responds
- [ ] No authentication errors

### Test Other APIs (If Available)

**Google Cloud Vision:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://vision.googleapis.com/v1/images:annotate
```

**Twilio:**
```bash
curl -X GET \
  "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN"
```

- [ ] APIs respond correctly
- [ ] Keys are valid and active

---

## Checklist Summary

### Critical (Must Have) ✅
- [ ] GitHub repository access
- [ ] Latest code pushed to main
- [ ] Supabase project access
- [ ] Supabase URL, anon key, service role key
- [ ] Hostinger domain access
- [ ] Vercel account created
- [ ] Local build succeeds
- [ ] Migration SQL file ready
- [ ] All deployment guide files present

### Important (Should Have) ⚠️
- [ ] Google Cloud Vision API key (for OCR)
- [ ] Twilio credentials (for SMS/calls)
- [ ] Email service API key (Resend or Postmark)
- [ ] Azure Document Intelligence credentials

### Optional (Nice to Have) ℹ️
- [ ] Parseur API credentials
- [ ] Google Drive API credentials
- [ ] Monitoring tools (Sentry, etc.)

---

## What to Do Next

### If All Critical Items Are Checked ✅
**You're ready!** Proceed to:
1. Open **VERCEL_DEPLOYMENT_GUIDE.md**
2. Start with **Part 1: Create Vercel Account & Import Project**
3. Follow step-by-step instructions
4. Reference other guides as needed

### If Missing Critical Items ❌
**Stop and gather:**
1. Identify which critical items are missing
2. Collect those credentials/access first
3. Return to this checklist when ready
4. Verify all critical items are checked

### If Missing Optional Items ℹ️
**You can proceed, but:**
- Some features won't work without API keys
- Document analysis won't work without Google/Azure keys
- SMS features won't work without Twilio
- Can add these later in Vercel environment variables

---

## Deployment Timeline

Once you start deployment:

**Phase 1: Vercel Setup (10 min)**
- Create account
- Import repository
- Configure environment variables
- Initial deployment

**Phase 2: Database Migration (5 min)**
- Run SQL migration in Supabase
- Verify tables created
- Regenerate TypeScript types

**Phase 3: DNS Configuration (5 min + 15-30 min propagation)**
- Update Hostinger DNS
- Wait for propagation
- Verify domain resolution

**Phase 4: Edge Functions (10 min)**
- Deploy Supabase functions
- Set function secrets
- Test function execution

**Phase 5: Verification (10 min)**
- Test application functionality
- Check for errors
- Monitor logs

**Total Active Time:** ~40 minutes
**Total with DNS Propagation:** ~60-90 minutes

---

## Emergency Contacts & Resources

**If You Get Stuck:**
1. Check the specific guide (Vercel, DNS, Edge Functions)
2. Look for "Troubleshooting" section
3. Check error messages in logs
4. Screenshot the error and ask me for help

**Resources:**
- Vercel Docs: [vercel.com/docs](https://vercel.com/docs)
- Supabase Docs: [supabase.com/docs](https://supabase.com/docs)
- Hostinger Support: [hostinger.com/support](https://www.hostinger.com/support)

**Me (Claude):**
- Ask if you encounter any errors
- Show me error messages or screenshots
- I can help troubleshoot issues

---

## Final Confidence Check

**Rate Your Readiness:**

- ☑ I have all critical credentials ready
- ☑ I understand the deployment process
- ☑ I have 30-45 minutes uninterrupted
- ☑ I'm ready to follow the guide step-by-step
- ☑ I know where to get help if stuck

**If all checked:** You're ready to deploy! 🚀

**If any unchecked:** Take a few minutes to address those items first.

---

## Let's Deploy!

When ready, open **VERCEL_DEPLOYMENT_GUIDE.md** and start with Part 1.

Good luck! The deployment process is straightforward if you follow the guide step-by-step.
