# Deployment Guide

Complete guide for deploying InsureFlow Ops to production.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Database Migrations](#database-migrations)
- [Build & Deploy](#build--deploy)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Overview

InsureFlow Ops uses a modern deployment stack:

- **Frontend**: Vite + React (deployed to Vercel/Netlify/Hostinger)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Storage**: Supabase Storage
- **Domain**: lewisinsurance.ai (Hostinger)

### Deployment Flow

```
Local Development → GitHub → CI/CD → Production
```

---

## Prerequisites

### Required Accounts

1. **GitHub** - Source control
2. **Supabase** - Backend & database
3. **Vercel/Netlify** - Frontend hosting (or Hostinger)
4. **Hostinger** - Domain management

### Required Tools

```bash
# Node.js 18+
node --version

# Git
git --version

# Supabase CLI (optional, for migrations)
npm install -g supabase

# Vercel CLI (if using Vercel)
npm install -g vercel
```

---

## Environment Configuration

### 1. Create Production Environment File

Create `.env.production` in project root:

```env
# =============================================================================
# Supabase Configuration
# =============================================================================

VITE_SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
VITE_SUPABASE_PROJECT_ID=lrqajzwcmdwahnjyidgv

# =============================================================================
# AI Services
# =============================================================================

# Anthropic Claude
VITE_ANTHROPIC_API_KEY=your_key_here

# OpenAI (for embeddings)
VITE_OPENAI_API_KEY=your_key_here

# Azure Document Intelligence
VITE_AZURE_DOCUMENT_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
VITE_AZURE_DOCUMENT_KEY=your_key_here

# =============================================================================
# Communication Services
# =============================================================================

# Twilio
VITE_TWILIO_ACCOUNT_SID=your_sid_here
VITE_TWILIO_AUTH_TOKEN=your_token_here
VITE_TWILIO_WEBHOOK_SECRET=your_secret_here

# Email (Resend/SendGrid/Postmark)
VITE_EMAIL_API_KEY=your_key_here

# =============================================================================
# Storage & Integrations
# =============================================================================

# Google Drive API
VITE_GOOGLE_CLIENT_ID=your_client_id_here
VITE_GOOGLE_CLIENT_SECRET=your_secret_here

# Parseur (document parsing)
VITE_PARSEUR_API_KEY=your_key_here

# =============================================================================
# Feature Flags
# =============================================================================

VITE_ENABLE_AI_CHAT=true
VITE_ENABLE_PREDICTIVE_ANALYTICS=true
VITE_ENABLE_DOCUMENT_INTELLIGENCE=true
VITE_ENABLE_TELEPHONY=true

# =============================================================================
# Analytics & Monitoring
# =============================================================================

# Optional: Add your analytics services
VITE_SENTRY_DSN=your_dsn_here
VITE_GOOGLE_ANALYTICS_ID=your_id_here
```

### 2. Set Environment Variables in Supabase

Navigate to Supabase Dashboard → Project Settings → Edge Functions

Add all non-VITE variables as secrets:

```bash
# Using Supabase CLI
supabase secrets set ANTHROPIC_API_KEY=your_key_here
supabase secrets set OPENAI_API_KEY=your_key_here
supabase secrets set AZURE_DOCUMENT_KEY=your_key_here
# ... etc
```

### 3. Verify Environment Variables

```typescript
// src/config/validateEnv.ts
export function validateEnv() {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
  ];

  const missing = required.filter(key => !import.meta.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

---

## Database Migrations

### Migration Files Location

All migrations in: `supabase/migrations/`

### Current Migrations (in order)

1. **20251203000001**: Quote Ranking System
2. **20251203000002**: Quote Follow-Up System
3. **20251203000003**: AI Response Feedback
4. **20251203000004**: Knowledge Version History
5. **20251203000005**: Knowledge Analytics
6. **20251203000006**: AI Task Generation
7. **20251203000007**: Coverage Gap Analysis
8. **20251203000008**: Issue Tracking System
9. **20251203000009**: Issue Attachments Bucket
10. **20251203000010**: Predictive Analytics Engine

### Running Migrations

#### Option 1: Supabase Web Dashboard (Recommended for Production)

1. Navigate to: https://supabase.com/dashboard/project/lrqajzwcmdwahnjyidgv/sql/new
2. For each migration file (in order):
   - Open migration file
   - Copy entire SQL content
   - Paste into SQL Editor
   - Click "Run"
   - Verify success

#### Option 2: Supabase CLI

```bash
# Login to Supabase
supabase login

# Link to project
supabase link --project-ref lrqajzwcmdwahnjyidgv

# Run migrations
supabase db push

# Or run specific migration
supabase migration up --db-url "postgresql://postgres:password@db.lrqajzwcmdwahnjyidgv.supabase.co:5432/postgres"
```

### Verify Migrations

```sql
-- Check applied migrations
SELECT * FROM supabase_migrations.schema_migrations
ORDER BY version DESC;

-- Verify tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'customer_predictions',
  'coverage_gap_analysis',
  'issues',
  'task_generation_rules'
);
```

---

## Build & Deploy

### Local Build Test

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Build for production
npm run build

# Preview production build
npm run preview
```

### Deploy to Vercel

#### Automatic Deployment (Recommended)

1. Connect GitHub repository to Vercel
2. Configure build settings:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add environment variables in Vercel dashboard
4. Deploy main branch

#### Manual Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Or with environment file
vercel --prod --env-file .env.production
```

### Deploy to Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

### Deploy to Hostinger

1. Build locally: `npm run build`
2. Upload `dist/` folder contents via FTP/SFTP
3. Point domain to uploaded files
4. Configure `.htaccess` for SPA routing:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## Post-Deployment

### 1. Verify Deployment

**Checklist**:
- [ ] Homepage loads without errors
- [ ] Authentication works (login/logout)
- [ ] API calls to Supabase succeed
- [ ] Static assets load (images, icons)
- [ ] Console shows no errors
- [ ] All routes work (no 404s)

### 2. Run Health Checks

```bash
# Check API connectivity
curl https://lewisinsurance.ai/api/health

# Check Supabase connection
curl https://lrqajzwcmdwahnjyidgv.supabase.co/rest/v1/
```

### 3. Test Critical Paths

1. **Authentication Flow**
   - Sign up new user
   - Login existing user
   - Password reset

2. **Data Operations**
   - Create customer
   - View dashboard
   - Run AI query

3. **AI Features**
   - AI chat response
   - Document upload & analysis
   - Predictive analytics

### 4. Configure Domain (lewisinsurance.ai)

In Hostinger DNS settings:

```
Type    Name    Value                                   TTL
A       @       [Your server IP]                        3600
CNAME   www     lewisinsurance.ai                       3600
TXT     @       v=spf1 include:_spf.hostinger.com ~all  3600
```

### 5. SSL Certificate

- Vercel/Netlify: Automatic SSL via Let's Encrypt
- Hostinger: Enable SSL in control panel

### 6. CDN Configuration (Optional)

For better performance, configure CDN:

```
- Cloudflare
- AWS CloudFront
- Fastly
```

---

## Monitoring

### Application Monitoring

#### 1. Error Tracking (Sentry)

```typescript
// src/lib/sentry.ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});
```

#### 2. Performance Monitoring

```typescript
// Track Core Web Vitals
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

function sendToAnalytics(metric) {
  analytics.track('web_vitals', {
    name: metric.name,
    value: metric.value,
  });
}

getCLS(sendToAnalytics);
getFID(sendToAnalytics);
getFCP(sendToAnalytics);
getLCP(sendToAnalytics);
getTTFB(sendToAnalytics);
```

#### 3. API Monitoring

Monitor Supabase:
- Query performance
- Error rates
- Connection pool usage

In Supabase Dashboard → Database → Performance

### Infrastructure Monitoring

#### Uptime Monitoring

Use services like:
- UptimeRobot
- Pingdom
- StatusCake

```
Monitor endpoints:
- https://lewisinsurance.ai
- https://lewisinsurance.ai/api/health
- https://lrqajzwcmdwahnjyidgv.supabase.co
```

#### Log Aggregation

Configure logs:
- Vercel: Built-in logging
- Supabase: Postgres logs + Edge Function logs
- Custom: Logtail, Papertrail, or Datadog

---

## Troubleshooting

### Common Issues

#### 1. Build Fails

**Error**: `Cannot find module '@/components/...'`

**Solution**: Verify tsconfig paths and Vite alias:

```typescript
// vite.config.ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
}
```

#### 2. Environment Variables Not Loading

**Error**: `undefined is not an object (evaluating 'import.meta.env.VITE_SUPABASE_URL')`

**Solution**:
- Ensure all VITE_ prefixed variables in `.env.production`
- Rebuild: `npm run build`
- Verify variables in hosting platform dashboard

#### 3. Supabase Connection Fails

**Error**: `Failed to fetch` or `Network error`

**Solution**:
- Check CORS settings in Supabase (allow lewisinsurance.ai)
- Verify API keys are correct
- Check RLS policies aren't blocking access

#### 4. Routing Issues (404 on Refresh)

**Error**: 404 when refreshing on `/dashboard`

**Solution**: Configure SPA routing

Vercel (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Netlify (`netlify.toml`):
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

#### 5. Large Bundle Size

**Error**: Warning: Chunk size exceeded

**Solution**: Optimize imports and enable code splitting

```typescript
// Before
import { Button, Card, Dialog, ... } from '@/components/ui';

// After (tree-shaking)
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
```

---

## Rollback Procedure

### Quick Rollback

#### Vercel
```bash
vercel rollback
```

#### Netlify
```bash
netlify rollback
```

#### Manual
```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

### Database Rollback

```sql
-- Revert last migration
BEGIN;
-- [Insert DOWN migration SQL here]
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20251203000010';
COMMIT;
```

---

## CI/CD Setup (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

---

## Performance Benchmarks

### Target Metrics

- **Initial Load**: < 2 seconds
- **Time to Interactive**: < 3 seconds
- **Largest Contentful Paint**: < 2.5 seconds
- **Cumulative Layout Shift**: < 0.1
- **First Input Delay**: < 100ms

### Optimization Checklist

- [x] Code splitting enabled
- [x] Lazy loading routes
- [x] Image optimization
- [x] Minification (Terser)
- [x] Tree shaking
- [x] Gzip compression
- [x] CDN for assets
- [ ] Service Worker (optional)

---

## Security Checklist

- [ ] All API keys in environment variables (not committed)
- [ ] RLS policies enabled on all tables
- [ ] CORS configured correctly
- [ ] HTTPS enforced
- [ ] Content Security Policy configured
- [ ] Rate limiting on API endpoints
- [ ] Input validation on all forms
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (React escaping)

---

## Resources

- **Vercel Docs**: https://vercel.com/docs
- **Netlify Docs**: https://docs.netlify.com/
- **Supabase Docs**: https://supabase.com/docs
- **Vite Docs**: https://vitejs.dev/guide/
- **Hostinger Support**: https://support.hostinger.com/

---

**Last Updated**: December 3, 2024
**Version**: 1.0.0
