# InsureFlow Ops - Complete Context Documentation

## Project Overview

**Project Name:** InsureFlow Ops
**Description:** Comprehensive insurance agency management platform with AI capabilities
**Tech Stack:** React + Vite + TypeScript + Supabase + Netlify
**Domain:** [lewisinsurance.ai](https://lewisinsurance.ai)
**Production URL:** [https://lewisinsurance.netlify.app](https://lewisinsurance.netlify.app)

---

## Design System: Calm Command (binding for all UI)

The in-app CRM follows **Calm Command** — a dark-only operations console extracted from the AO Renewal Command Center. One lime accent (`#BEF264`), hierarchy from weight and spacing, not color. The full system lives in `design-system/`:

- `design-system/constitution.md` — the ten rules and non-negotiables (read first)
- `design-system/surface-map.md` — page archetypes (Record Command, Index/List, Form, etc.)
- `design-system/component-rules.md` — every component, states, action hierarchy
- `design-system/design-tokens.css` — source of color/spacing/radius/shadow/motion/z-index (mirrored into `src/index.css`)
- `design-system/acceptance-checklist.md` — the gate before any screen is done
- `design-system/anti-patterns.md` — forbidden (rainbow toolbar, vanity metric wall, carrier-by-color, etc.)
- `design-system/builder-prompt.md` — drop into a fresh agent session to build a surface

Reusable primitives live in `src/components/cc/`. The app is dark-only (`class="dark"` on `<html>`, ThemeProvider `forcedTheme="dark"`, no theme toggle). Tokens are consumed via Tailwind `cc-*` classes (e.g. `bg-cc-surface`, `text-cc-text-muted`, `rounded-cc-xl`). Non-negotiables: one lime primary per surface, tabular figures, mask SSN/DOB/DLN, carriers are name chips not colors, no em or en dashes in copy.

---

## Deployment Architecture

### Production Environment

**Hosting:** Netlify
**Build System:** Vite (React)
**Deployment Method:** Automatic Git deployments from GitHub
**Domain Registrar:** GoDaddy
**DNS Configuration:**
- A Record: `@` → `75.2.60.5` (Netlify load balancer)
- CNAME: `www` → `lewisinsurance.netlify.app`
- SSL: Auto-provisioned by Netlify (Let's Encrypt)

**Netlify Configuration:**
```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## Database Architecture

### Supabase Configuration

**Project ID:** `lrqajzwcmdwahnjyidgv`
**Project URL:** `https://lrqajzwcmdwahnjyidgv.supabase.co`
**Database:** PostgreSQL (verify with `SELECT version();` in SQL Editor)

### Multi-Tenancy Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     agency_workspaces                            │
│  (The top-level tenant boundary - represents an insurance agency)│
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌───────────────────┐    ┌────────────────────────────┐
│     accounts      │    │ agency_workspace_memberships │
│ (Customers/Clients│    │ (Staff: owner, admin,       │
│  of the agency)   │    │  producer, csr)             │
└────────┬──────────┘    └────────────────────────────┘
         │
         ▼
┌───────────────────────────────────┐
│       account_memberships          │
│ (Optional: customer portal access) │
└───────────────────────────────────┘
```

**Key Rules:**
- `agency_workspace_id` is the primary tenant boundary for RLS
- Staff access data through `agency_workspace_memberships`
- Customer data scoped via `accounts.agency_workspace_id`
- All operational tables (leads, policies, quotes, tasks) belong to an account, which belongs to a workspace

#### Agency Workspaces (Tenant)
- `id` (UUID, primary key)
- `name` (TEXT) - Agency name
- `slug` (TEXT, unique) - URL-friendly identifier
- `settings` (JSONB) - Agency-level configuration
- `subscription_tier` (TEXT) - free, starter, professional, enterprise
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Agency Workspace Memberships (Staff)
- `id` (UUID, primary key)
- `agency_workspace_id` (UUID, references agency_workspaces)
- `user_id` (UUID, references auth.users)
- `role` (TEXT) - owner, admin, producer, csr
- `status` (TEXT) - active, invited, suspended
- RLS: Users can only see memberships for workspaces they belong to

### Core Tables

#### Profiles
- `id` (UUID, references auth.users)
- `email` (TEXT)
- `full_name` (TEXT)
- `role` (TEXT) - customer, agent, admin
- `is_staff` (BOOLEAN) - Staff user flag
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Leads
- `id` (UUID, primary key)
- `first_name`, `last_name` (TEXT)
- `email`, `phone` (TEXT)
- `status` (TEXT) - new, contacted, qualified, quoted, won, lost, nurturing
- `lead_score` (INTEGER 0-100)
- `insurance_types` (TEXT[])
- `contact_count` (INTEGER) - Number of contact attempts
- `email_opens` (INTEGER) - Email engagement tracking
- `email_clicks` (INTEGER) - Email engagement tracking
- `account_id` (UUID, references accounts)
- `assigned_to` (UUID, references auth.users)
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Accounts (Customers)
- `id` (UUID, primary key)
- `agency_workspace_id` (UUID, references agency_workspaces) - **Tenant boundary**
- `name` (TEXT)
- `type` (TEXT) - individual, business
- `account_status` (TEXT) - active, inactive, suspended
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Policies
- `id` (UUID, primary key)
- `account_id` (UUID, references accounts)
- `policy_number` (TEXT, unique)
- `policy_type` (TEXT) - auto, home, commercial, life, health
- `premium` (NUMERIC)
- `status` (TEXT) - active, expired, cancelled, pending
- `effective_date`, `expiration_date` (DATE)
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Quotes
- `id` (UUID, primary key)
- `account_id` (UUID, references accounts)
- `policy_type` (TEXT)
- `premium` (NUMERIC)
- `status` (TEXT) - draft, sent, accepted, declined, expired
- `quote_score` (INTEGER 0-100) - Multi-dimensional ranking score
- `created_at`, `updated_at` (TIMESTAMPTZ)

#### Tasks
- `id` (UUID, primary key)
- `agency_workspace_id` (UUID, references agency_workspaces)
- `entity_type` (TEXT) - lead, account, policy, quote, renewal
- `entity_id` (UUID) - Reference to related entity
- `title` (TEXT)
- `description` (TEXT)
- `status` (TEXT) - pending, in_progress, completed, cancelled
- `priority` (TEXT) - low, medium, high, urgent
- `due_at` (TIMESTAMPTZ)
- `assigned_to` (UUID, references auth.users)
- `completed_at` (TIMESTAMPTZ)
- `source` (TEXT) - manual, ai_generated, system, workflow
- `confidence` (NUMERIC) - AI confidence score (0-1)
- `evidence` (JSONB) - Supporting data for AI-generated tasks
- `ai_generated` (BOOLEAN) - Whether task was AI-generated
- `created_at`, `updated_at` (TIMESTAMPTZ)
- RLS: Users can access tasks in their workspace

#### Communications (Activity Log)
- `id` (UUID, primary key)
- `agency_workspace_id` (UUID, references agency_workspaces)
- `entity_type` (TEXT) - lead, account, policy
- `entity_id` (UUID) - Reference to related entity
- `type` (TEXT) - call, email, sms, note, meeting
- `direction` (TEXT) - inbound, outbound, internal
- `subject` (TEXT)
- `content` (TEXT)
- `status` (TEXT) - pending, sent, delivered, failed
- `external_id` (TEXT) - Twilio SID, email message ID, etc.
- `metadata` (JSONB) - Provider-specific data
- `created_by` (UUID, references auth.users)
- `created_at` (TIMESTAMPTZ)
- RLS: Users can access communications in their workspace

#### Auto Insurance Specific Tables

**lead_auto_drivers:**
- `id` (UUID, primary key)
- `lead_id` (UUID, references leads)
- `first_name`, `last_name` (TEXT)
- `date_of_birth` (DATE)
- `license_number`, `license_state` (TEXT)
- `gender`, `marital_status` (TEXT)
- `relation_to_insured` (TEXT)
- `years_licensed` (INTEGER)
- `accidents_violations` (JSONB)
- RLS: Users can access drivers for their account's leads

**lead_auto_vehicles:**
- `id` (UUID, primary key)
- `lead_id` (UUID, references leads)
- `year` (INTEGER), `make`, `model` (TEXT)
- `vin` (TEXT)
- `ownership` (TEXT) - own, lease, finance
- `primary_use` (TEXT) - commute, pleasure, business
- `annual_mileage` (INTEGER)
- `garage_address` (TEXT)
- `safety_features` (JSONB)
- RLS: Users can access vehicles for their account's leads

#### Knowledge Base

**knowledge_base:**
- `id` (UUID, primary key)
- `title` (TEXT)
- `content` (TEXT)
- `category` (TEXT)
- `embedding` (VECTOR) - For AI semantic search
- `created_at`, `updated_at` (TIMESTAMPTZ)

**knowledge_base_queries:**
- `id` (UUID, primary key)
- `knowledge_id` (UUID, references knowledge_base)
- `user_id` (UUID, references auth.users)
- `query_text` (TEXT)
- `helpful` (BOOLEAN) - User feedback
- `created_at` (TIMESTAMPTZ)

#### CEO Weekly Digest

**ceo_digest_settings:**
- `id` (UUID, primary key)
- `agency_workspace_id` (UUID, references agency_workspaces)
- `enabled` (BOOLEAN) - Enable/disable digest
- `timezone` (TEXT) - e.g., 'America/New_York'
- `send_day_of_week` (INTEGER 0-6) - 0=Sunday, 1=Monday, etc.
- `send_time_local` (TEXT) - e.g., '08:00'
- `recipients` (JSONB) - Array of email addresses
- `include_pii` (BOOLEAN) - Include full names in digest
- `thresholds` (JSONB) - Alert threshold configuration
- RLS: Agency admins/owners only

**ceo_digest_runs:**
- `id` (UUID, primary key)
- `agency_workspace_id` (UUID, references agency_workspaces)
- `period_start`, `period_end` (TIMESTAMPTZ) - Week covered
- `week_label` (TEXT) - e.g., 'Week of Dec 16-22, 2024'
- `recipients` (JSONB) - Recipients for this run
- `facts` (JSONB) - Computed metrics packet
- `ai_output` (JSONB) - AI-generated summary
- `ai_provider`, `ai_model` (TEXT) - AI provider details
- `status` (TEXT) - created, computing, generating, sending, sent, skipped, failed
- `idempotency_key` (TEXT) - Prevents duplicate sends
- `email_result` (JSONB) - Email provider response
- RLS: Agency admins/owners only

#### Analytics Views

**knowledge_usage_stats:**
- Aggregates knowledge base article usage
- Tracks query count, unique users, helpfulness score
- Used by AI analytics dashboard

**knowledge_search_trends:**
- Tracks search patterns over last 30 days
- Shows trending queries

**knowledge_gap_trends:**
- Identifies unanswered queries (knowledge gaps)
- Helps prioritize content creation

**knowledge_category_stats:**
- Category-level performance metrics
- Article count, query volume, helpfulness by category

---

## Row Level Security (RLS) Policies

### Multi-Tenant Architecture

All data tables use RLS to enforce account-level isolation:

```sql
-- Example: Leads table RLS
CREATE POLICY "Users can view leads for their accounts"
  ON leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships am
      WHERE am.account_id = leads.account_id
        AND am.user_id = auth.uid()
    )
  );
```

**Key Tables with RLS:**
- leads
- accounts
- policies
- quotes
- tasks
- communications
- lead_auto_drivers
- lead_auto_vehicles
- knowledge_base_queries

---

## Environment Variables

### Required Environment Variables

**Frontend (Vite):**
```env
VITE_SUPABASE_URL=https://lrqajzwcmdwahnjyidgv.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Netlify Configuration:**
1. Go to Netlify Dashboard → Site settings → Environment variables
2. Add the above variables
3. Select all environments: Production, Preview, Development

**Supabase Edge Functions (Optional Services):**
```env
# AI Services
GOOGLE_CLOUD_VISION_API_KEY=your_google_vision_key
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=your_azure_endpoint
AZURE_DOCUMENT_INTELLIGENCE_KEY=your_azure_key

# Communication
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
RESEND_API_KEY=your_resend_key

# Document Processing
PARSEUR_API_KEY=your_parseur_key
PARSEUR_WEBHOOK_SECRET=your_webhook_secret

# eSignature (Dropbox Sign)
DROPBOX_ACCESS_TOKEN=your_dropbox_sign_api_key
```

---

## Edge Functions

### Supabase Edge Functions

**Location:** `/supabase/functions/`
**Count:** Run `ls -d supabase/functions/*/ | grep -v _shared | wc -l` (currently ~112)

#### Authentication Patterns

| Pattern | Description | Functions |
|---------|-------------|-----------|
| **JWT Required** | Standard user auth via `requireAuth()` | Most user-facing functions |
| **CRON_SECRET** | Header-based auth for scheduled jobs | `weekly-ceo-digest`, `run-retention-scoring`, `run-coverage-gap-detection`, `process-document-tasks`, `nurture-campaign-processor` |
| **Service Role Only** | Internal functions called by other functions | `decrypt-ssn`, `context-indexer` |
| **Public Webhook** | External provider callbacks (verify signature) | `canopy-webhook`, `parseur-webhook`, `esign-webhook`, `twilio-*-webhook` |
| **verify_jwt=false** | Functions with custom auth logic | Webhooks, public endpoints |

#### Key Function Categories

**AI & ML:** `ai-assistant-chat`, `ai-brain-rag`, `ai-document-analysis`, `ai-task-generator`, `lewi_analyze`, `prism-api`

**Document Processing:** `ocr-document`, `parse-document-ocr`, `classify-document`, `check-document-integrity`, `pdf-generation-worker`, ACORD extractors (`extract-*-policy`)

**Scoring/Analytics:** `calculate-lead-score`, `calculate-quote-score`, `calculate-renewal-risk`, `run-retention-scoring`, `run-coverage-gap-detection`

**Communication:** `email-send`, `email-inbound`, `send-sms`, `twilio-voice`, `send-coi-email`, `push-notifications`

**Canopy Integration:** `canopy-initiate`, `canopy-webhook`, `canopy-fetch-pull`, `canopy-monitoring`, `canopy-servicing`, `canopy-reprocess`

**Scheduled Jobs (CRON_SECRET):**
- `weekly-ceo-digest` - Monday 8AM ET
- `run-retention-scoring` - Daily 6AM UTC
- `run-coverage-gap-detection` - Daily 7AM UTC
- `process-document-tasks` - Every 15 min
- `nurture-campaign-processor` - Configurable

**Admin:** `admin-create-user`, `admin-list-users`, `admin-approvals`, `admin-update-password`

**Workspace:** `create_workspace`, `analyze-workspace`

---

## TypeScript Configuration

### Type Checking Settings

```json
// tsconfig.app.json
{
  "compilerOptions": {
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitAny": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

**Note:** Strict mode is disabled project-wide. To compensate:
- Use Zod for runtime validation on API inputs, form data, and external data
- TypeScript still catches most type errors at build time
- All `@ts-nocheck` directives were removed in Dec 2024 remediation

---

## Git & Deployment Workflow

### Repository

**GitHub:** [https://github.com/Lewis-Insurance/insureflow-ops](https://github.com/Lewis-Insurance/insureflow-ops)
**Branch:** `main` (production)

### Automatic Deployment Flow

1. **Code changes** → Push to GitHub main branch
2. **GitHub webhook** → Triggers Netlify build
3. **Netlify builds** → `npm run build` (Vite)
4. **Deploy to CDN** → Global edge network
5. **SSL auto-renew** → Let's Encrypt certificates
6. **Live at** → lewisinsurance.ai

**Deploy Time:** ~2-3 minutes per deployment

### Manual Deployment (if needed)

```bash
# Via Netlify CLI
netlify deploy --prod

# Or trigger from dashboard
# Netlify Dashboard → Deploys → Trigger deploy
```

---

## Database Migrations

### Migration Files Location

`/supabase/migrations/`

### Latest Migration

**File:** `20251204_add_missing_schema_objects.sql`

**What it adds:**
1. **Columns:**
   - `profiles.is_staff` (BOOLEAN)
   - `leads.contact_count` (INTEGER)
   - `leads.email_opens` (INTEGER)
   - `leads.email_clicks` (INTEGER)

2. **Tables:**
   - `lead_auto_drivers` (with RLS)
   - `lead_auto_vehicles` (with RLS)
   - `knowledge_base_queries` (with RLS)

3. **Views:**
   - `knowledge_usage_stats`
   - `knowledge_search_trends`
   - `knowledge_gap_trends`
   - `knowledge_category_stats`

### Deploying Migrations

**Method 1: Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Copy migration SQL file contents
3. Paste and run

**Method 2: Supabase CLI**
```bash
# Link to project
supabase link --project-ref lrqajzwcmdwahnjyidgv

# Push migrations
supabase db push

# Regenerate types after migration
supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts
```

---

## AI Features

### Knowledge Base RAG System

**How it works:**
1. Knowledge articles stored in `knowledge_base` table
2. Each article has vector embedding for semantic search
3. AI Assistant queries knowledge base using RAG
4. Responses cite sources from knowledge base

**Caching Strategy:**
- In-memory cache: Session-based (hot queries)
- LocalStorage: 24 hours, 5MB limit
- IndexedDB: 7 days, 50MB limit (if implemented)

**File:** `src/components/ai/AIAssistantChat.tsx`

### CEO Weekly Digest

**Automated weekly performance reports for agency executives.**

**How it works:**
1. GitHub Action triggers every Monday at 8:00 AM ET
2. Edge function computes deterministic metrics via RPC
3. AI (GPT-4o or Claude) generates executive summary
4. HTML email sent via Resend to configured recipients
5. Run history stored for audit trail

**Key Components:**
- Edge Function: `weekly-ceo-digest`
- RPC Function: `get_weekly_ceo_digest_facts()`
- GitHub Action: `.github/workflows/weekly-ceo-digest.yml`
- Admin UI: `/admin/digest-settings`, `/admin/digest-history`
- Hook: `src/hooks/useCEODigest.ts`

**Metrics Included:**
- Leads: new, contacted, qualified, quoted, won, lost
- Quotes: created, qualified, quoted
- Policies: bound, premium written
- Tasks: overdue count
- Week-over-week deltas with percentage changes
- Configurable alert thresholds

**Security:**
- CRON_SECRET header authentication
- Idempotency keys prevent duplicate sends
- RLS restricts access to agency admins/owners

**Configuration (Supabase Edge Function Secrets):**
```env
CRON_SECRET=your_cron_secret_here
OPENAI_API_KEY=your_openai_key  # or ANTHROPIC_API_KEY
RESEND_API_KEY=your_resend_key
FROM_EMAIL=digest@yourdomain.com  # optional
```

**GitHub Secrets:**
```
CRON_SECRET=must_match_supabase
SUPABASE_URL=https://your-project.supabase.co
AGENCY_WORKSPACE_IDS=uuid1,uuid2,uuid3
```

### Document Analysis

**Supported formats:**
- PDF, DOCX, images (PNG, JPG)
- Insurance documents: policies, dec pages, quotes, COIs

**OCR Services:**
- Google Cloud Vision API
- Azure Document Intelligence

**Process:**
1. Upload document → Supabase Storage
2. Trigger edge function → `ai-document-analysis`
3. Extract text via OCR
4. Parse structured data
5. Store metadata in database

---

## Known Issues & Workarounds

### 1. TypeScript Strict Mode

**Issue:** Build was failing with strict TypeScript checking enabled.

**Solution:** Disabled strict mode in tsconfig.json and added `@ts-nocheck` to problematic files.

**Impact:** No runtime impact, only affects build-time type checking.

### 3. Vercel Deployment Issues

**Issue:** Vercel had team permission issues preventing deployment.

**Solution:** Switched to Netlify for simpler deployment experience.

**Status:** Vercel configuration files remain in repo but are unused.

---

## Performance Optimizations

### Build Optimizations

**Vite Configuration:**
- Code splitting enabled
- Terser minification
- Tree shaking
- Asset optimization

**Dependencies:**
- `terser` installed for production builds
- Lazy loading for routes (if implemented)

### Caching Strategy

**Static Assets:**
- Cache-Control: `public, max-age=31536000, immutable`
- Applies to `/assets/*` directory

**API Responses:**
- React Query caching (default: 5 minutes stale time)
- AI knowledge base cache: 24 hours

---

## Security Considerations

### Row Level Security (RLS)

All sensitive data tables have RLS enabled to ensure users can only access their own data or data for accounts they're members of.

### Authentication

**Provider:** Supabase Auth
**Methods:** Email/password (extendable to OAuth)

**User Roles:**
- `customer` - End customers
- `agent` - Insurance agents
- `admin` - System administrators
- `is_staff` - Staff users (additional flag)

### API Security

- Supabase anon key: Public (safe for frontend)
- Service role key: Server-side only (edge functions)
- CORS configured on edge functions

### AI & PII Handling Policy

**What we send to AI providers (OpenAI, Anthropic):**
- Document text (after PII redaction)
- Policy types and coverage categories
- Premium amounts (aggregated/rounded)
- Task descriptions and titles
- Knowledge base content
- Agent first names (for personalization)

**What we NEVER send to AI providers:**
- Full SSN (only last 4 if needed)
- Full driver license numbers
- Full VIN (only last 6 for verification)
- Credit card / bank account numbers
- Full dates of birth (only year for age calculation)
- Full addresses (only city/state/zip)
- Email addresses of customers
- Phone numbers

**Redaction Implementation:**
- `process-document-tasks` uses `redactPII()` before AI processing
- Patterns: SSN (`\d{3}-\d{2}-\d{4}`), credit cards, license numbers
- Redacted text replaced with `[REDACTED_SSN]`, `[REDACTED_CC]`, etc.

**AI Output Storage:**
- CEO digest AI output stored in `ceo_digest_runs.ai_output`
- Document insights stored in `document_insights`
- Retention period: 90 days for AI outputs
- Audit trail maintained for compliance

### User Roles Hierarchy

```
profiles.role     | is_staff | Access Level
------------------|----------|---------------------------
admin             | true     | Full access + user management
agent/producer    | true     | Account/policy CRUD, reports
csr               | true     | Read + limited writes
customer          | false    | Portal access to own data only
```

**Role precedence:** `role` is authoritative for permissions. `is_staff=true` is required for any staff role and grants access to staff-only UI sections.

---

## Golden Paths (Key Workflows)

### Lead → Quote → Policy Bound

```
1. Lead created (leads table, status='new')
2. Lead contacted (status='contacted', communications logged)
3. Lead qualified (status='qualified', account created)
4. Quote requested (quotes table, status='draft')
5. Quote scored (calculate-quote-score, quote_score set)
6. Quote sent (status='sent', email via email-send)
7. Quote accepted (status='accepted')
8. Policy bound (policies table, status='active')
```

**Key tables:** `leads`, `accounts`, `quotes`, `policies`, `communications`
**Key functions:** `calculate-quote-score`, `email-send`, `lead-scoring-engine`
**Failure modes:** Check Supabase function logs, email provider dashboard

### Document Upload → AI Analysis → Tasks

```
1. Document uploaded (Supabase Storage)
2. Analysis queued (document_analysis_jobs, status='queued')
3. OCR processed (ocr-document or ai-document-analysis-azure)
4. PII redacted (redactPII in process-document-tasks)
5. AI extracts insights (rule-based + optional AI)
6. Tasks suggested (document_insights, status='pending_review')
7. User approves/edits (status='approved', task created in tasks table)
```

**Key tables:** `document_analysis_jobs`, `document_insights`, `tasks`
**Key functions:** `process-document-tasks`, `ai-document-analysis`
**Failure modes:** Check `document_analysis_jobs.error`, OCR provider logs

### Weekly CEO Digest Flow

```
1. GitHub Action triggers Monday 8AM ET
2. Calls weekly-ceo-digest with CRON_SECRET
3. RPC get_weekly_ceo_digest_facts() computes metrics
4. AI generates summary (GPT-4o or Claude)
5. Email sent via SendGrid/Resend
6. Run logged in ceo_digest_runs
```

**Key tables:** `ceo_digest_settings`, `ceo_digest_runs`
**Key function:** `weekly-ceo-digest`
**Failure modes:** Check `ceo_digest_runs.error`, email provider logs

---

## Invariant Rules

These rules MUST be maintained across all code changes:

1. **All customer data must be scoped by `agency_workspace_id`** and enforced by RLS. No direct table access without RLS.

2. **Service role keys only in edge functions.** Never expose in frontend code or client-side.

3. **Emails never include full PII.** Use `include_pii=false` by default in digest settings.

4. **AI outputs are not authoritative.** All AI-suggested tasks require human approval before creation.

5. **Idempotency on scheduled jobs.** All CRON jobs must use idempotency keys to prevent duplicate processing.

6. **Soft deletes only.** Use `deleted_at` timestamp instead of hard deletes for audit trail.

7. **All external webhooks must verify signatures.** Canopy, Parseur, Dropbox Sign, Twilio all require signature verification.

8. **CRON_SECRET required for all scheduled functions.** No public access to batch processing endpoints.

---

## Truth Table (Sources of Truth)

| Area | Source of Truth | Verify Command |
|------|-----------------|----------------|
| Edge function count | Filesystem | `ls -d supabase/functions/*/ \| grep -v _shared \| wc -l` |
| DB schema | Migrations | `supabase db diff` or Supabase Dashboard |
| Scheduled jobs | GitHub Actions | `.github/workflows/*.yml` |
| RLS policies | Migrations | `supabase/migrations/*.sql` |
| TypeScript types | Generated | `supabase gen types typescript` |
| Postgres version | Database | `SELECT version();` in SQL Editor |
| Function secrets | Supabase Dashboard | Settings → Edge Functions → Secrets |

---

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck
```

### Supabase Local Development

```bash
# Start local Supabase
supabase start

# Link to production
supabase link --project-ref lrqajzwcmdwahnjyidgv

# Pull schema from production
supabase db pull

# Generate types
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

### Testing

```bash
# Run tests in watch mode
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage
```

**Test Configuration:**
- Framework: Vitest
- Environment: jsdom
- Setup file: `src/test/setup.ts`
- Config: `vitest.config.ts`

**Test Files:**
- `src/__tests__/lib/validateEnv.test.ts` - Environment validation
- `src/__tests__/lib/errorTracking.test.ts` - Error tracking
- `src/__tests__/acord/validation.test.ts` - ACORD validation

### Testing Deployment

```bash
# Build locally
npm run build

# Test build output
cd dist && python -m http.server 8000

# Deploy to Netlify preview
netlify deploy

# Deploy to production
netlify deploy --prod
```

---

## Error Handling & Observability

### Frontend Error Tracking

**File:** `src/lib/errorTracking.ts`

Production-ready error tracking infrastructure (Sentry-ready):
- `captureException()` - Report errors
- `captureMessage()` - Report messages with severity
- `addBreadcrumb()` - Add context for debugging
- `setUser()` - Set user context
- `handleBoundaryError()` - React error boundary integration

**Usage:**
```typescript
import { captureException, addBreadcrumb } from '@/lib/errorTracking';

// Report an error
captureException(error, { extra: { context: 'payment' } });

// Add breadcrumb for context
addBreadcrumb({ category: 'user-action', message: 'Clicked submit' });
```

### Frontend Logging

**File:** `src/lib/logger.ts`

Environment-aware logging:
- Development: Full console output
- Production: Errors only, with tracking integration

```typescript
import { logger } from '@/lib/logger';

logger.debug('Debug info');    // Dev only
logger.info('User action');    // Dev only, breadcrumb in prod
logger.warn('Warning');        // Always shown, tracked in prod
logger.error('Error', error);  // Always shown, reported in prod
```

### Edge Function Infrastructure

**Shared Utilities:** `supabase/functions/_shared/`

1. **logger.ts** - Structured JSON logging
   ```typescript
   import { createLogger } from '../_shared/logger.ts';
   const logger = createLogger('function-name');
   logger.info('Message', { data });
   logger.logRequest(req);
   logger.logResponse(200);
   ```

2. **error-handler.ts** - Error handling patterns
   ```typescript
   import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';

   if (!input) throw new ValidationError('Input required');

   // In catch block:
   return createErrorResponse(error, corsHeaders);
   ```

   Error Classes:
   - `ValidationError` - 400 Bad Request
   - `AuthenticationError` - 401 Unauthorized
   - `AuthorizationError` - 403 Forbidden
   - `NotFoundError` - 404 Not Found
   - `RateLimitError` - 429 Too Many Requests
   - `ExternalServiceError` - 502 Bad Gateway

### Environment Validation

**File:** `src/lib/validateEnv.ts`

```typescript
import { validateEnv, getEnv } from '@/lib/validateEnv';

// Check all required vars
const { valid, missing } = validateEnv();

// Get with fallback
const url = getEnv('VITE_API_URL', 'http://localhost:3000');

// Get required (throws if missing)
const key = getEnv('VITE_SUPABASE_ANON_KEY');
```

---

## File Structure

```
insureflow-ops/
├── src/
│   ├── components/        # React components
│   │   ├── ai/           # AI Assistant components
│   │   ├── crm/          # CRM components
│   │   ├── leads/        # Lead management
│   │   ├── policies/     # Policy management
│   │   ├── quotes/       # Quote management
│   │   └── ui/           # shadcn/ui components
│   ├── hooks/            # Custom React hooks
│   ├── integrations/     # Third-party integrations
│   │   └── supabase/    # Supabase types & hooks
│   ├── pages/            # Page components
│   └── lib/              # Utility functions
├── supabase/
│   ├── functions/        # Edge functions (~112, run count command)
│   │   └── _shared/      # Shared utilities (auth, logger, cors)
│   └── migrations/       # Database migrations
├── public/               # Static assets
├── .env                  # Local environment variables
├── netlify.toml          # Netlify configuration
├── vercel.json          # Vercel config (unused)
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite build configuration
└── package.json         # Dependencies

```

---

## Key Dependencies

### Production Dependencies

```json
{
  "react": "^18.x",
  "react-router-dom": "^6.x",
  "supabase-js": "^2.x",
  "@tanstack/react-query": "^4.x",
  "shadcn/ui": "Component library",
  "tailwindcss": "^3.x"
}
```

### Dev Dependencies

```json
{
  "vite": "^5.x",
  "typescript": "^5.x",
  "terser": "^5.x",
  "@vitejs/plugin-react": "^4.x"
}
```

---

## Support & Resources

### Documentation

- [Supabase Docs](https://supabase.com/docs)
- [Netlify Docs](https://docs.netlify.com)
- [Vite Docs](https://vitejs.dev)
- [React Query Docs](https://tanstack.com/query)

### Project-Specific Guides

- [VERCEL_DEPLOYMENT_GUIDE.md](VERCEL_DEPLOYMENT_GUIDE.md) - Vercel setup (unused)
- [HOSTINGER_DNS_SETUP.md](HOSTINGER_DNS_SETUP.md) - DNS configuration
- [DEPLOY_MIGRATION.md](DEPLOY_MIGRATION.md) - Database migration guide
- [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md) - Deployment overview

### Troubleshooting

**Build fails:**
1. Check environment variables are set in Netlify
2. Verify `terser` is in package.json
3. Check Netlify build logs for specific errors

**Database connection issues:**
1. Verify VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
2. Check RLS policies allow access
3. Verify user is authenticated

**Edge function errors:**
1. Check Supabase function logs
2. Verify function secrets are set
3. Check for CORS issues

---

## Deployment Checklist

### Initial Setup ✅

- [x] Create Netlify site
- [x] Connect GitHub repository
- [x] Configure build settings (npm run build, dist)
- [x] Add environment variables
- [x] Configure custom domain (lewisinsurance.ai)
- [x] Update DNS in GoDaddy
- [x] Deploy database migrations
- [x] Regenerate TypeScript types
- [x] Test production deployment

### Ongoing Deployments

- [ ] Push code to GitHub main branch
- [ ] Automatic deployment triggers
- [ ] Verify build succeeds in Netlify
- [ ] Test at lewisinsurance.ai
- [ ] Monitor for errors
- [ ] Rollback if needed (Netlify dashboard)

---

## Future Enhancements

### Planned Features

1. ~~**Multi-dimensional Quote Ranking**~~ ✅ Completed Dec 2024
   - Coverage limit adequacy scoring (0-25 pts)
   - Customizable scoring weight profiles per agency/account
   - Below-minimum limit warnings in scoring metadata
2. ~~**Predictive Analytics**~~ ✅ Completed Dec 2024 - Retention/churn prediction, renewal risk scoring
3. ~~**AI Task Generation**~~ ✅ Completed Dec 2024 - Auto-generate tasks from document analysis
4. ~~**Coverage Gap Analysis**~~ ✅ Completed Dec 2024 - Cross-sell opportunity detection
5. **Smart Email Composer** - AI-powered email generation
6. **Document Classification** - Auto-classify uploaded documents
7. ~~**Performance Monitoring**~~ ✅ Sentry integration complete Dec 2024
8. ~~**Canopy 2-Way Sync**~~ ✅ Completed Dec 2024 - Monitoring, Servicing, Commercial Lines
9. **Mobile App (Expo)** - iOS/Android agent app
10. ~~**ACORD Form PDF Generation**~~ ✅ Completed Dec 2024 - Full template-based form system
11. ~~**CEO Weekly Digest**~~ ✅ Completed Dec 2024 - AI-powered executive reports
12. **Producer Leaderboards** - Gamified performance tracking with badges
13. **Carrier Appointment Tracker** - Manage carrier appointments and credentials
14. **Commission Tracking** - Track commissions by policy, producer, carrier
15. **Client Portal Enhancements** - Self-service policy management for customers
16. **Renewal Pipeline Dashboard** - Visual renewal workflow with drag-drop stages

### Technical Debt

1. ~~Remove `@ts-nocheck` from files after fixing type issues~~ ✅ Completed Dec 2024
2. ~~Replace disabled `send-coi-email` function with Deno-compatible solution~~ ✅ Uses Resend REST API
3. ~~Implement comprehensive test coverage~~ ✅ Vitest configured, initial tests added
4. ~~Add Storybook for component documentation~~ ✅ Storybook 8.x configured with UI stories
5. ~~Optimize bundle size with code splitting~~ ✅ Route-based lazy loading + 16 vendor chunks
6. ~~Add performance monitoring~~ ✅ Sentry error tracking with session replay
7. ~~Fix existing ACORD tests to match actual module exports~~ ✅ Completed Dec 2024

---

## Contact & Support

**Project Owner:** Brian Lewis
**Email:** brian@lewisinsurance.ai
**GitHub:** Lewis-Insurance/insureflow-ops

---

## Change Log

### 2026-06-29 (Relationship Graph v2 + Merge consolidation + Importer hardening)
- ✅ **Relationship Graph v2** (PR #13, migrations `20260629210000`–`260000`, applied to prod):
  - **Edge vocabulary**: `affiliated_business` + `dependent` added to the `rel_type` CHECK on `account_relationships` and `account_relationship_suggestions`.
  - **Recursive Hub** `get_account_cluster(account_id)`: bounded, cycle-guarded walk over owns/spouse/household_member/dependent/affiliated_business/parent_company; owner-centered, per-node policy/premium/next-expiration + cluster roll-ups. `ClusterHub` renders it in the Customer Relationships tab (owner center, company cards with sibling nav, household block, cross-sell line). `search_accounts` gained `owned_business_count` (shown in the Link drawer).
  - **Noise-free suggester**: `surname_business` `owns` now requires a co-occurring shared contact (phone/email/address/TIN, read from BOTH normalized `insured_*` and legacy `accounts` columns); added `affiliated_business` (shared owner/contact) + household_member/dependent; one ranked candidate per pair; all human-confirm.
  - **Confirm-gated retype staging**: `retype_candidates` (RLS staff-only) + `generate_retype_candidates` (stages type/policy mismatches from `policies.line_category='commercial'`, never mutates) + `approve/reject_retype_candidate` (only approve writes a type, human-gated, keeps `account_type`/`type`/`insured_profiles.type` consistent).
- ✅ **Single merge engine**: `_do_account_merge(survivor, losers, rule, apply boolean default true)` is now the only merge body (apply=false = pure compute path for `preview_merge`). Legacy 5-arg `merge_accounts` **dropped**. EXECUTE on `_do_account_merge` is postgres/service_role only; `merge_accounts_manual` / `relgraph_merge_duplicate_group` / `preview_merge` are `is_staff()`-gated and reach it as SECURITY DEFINER. Carrier de-dup key normalizes `&`↔`and`.
- ✅ **Importer hardening** (PRs #11/#12): `import_resolve_account` RPC + `normalize_entity_name`; the bulk importer resolves-or-creates instead of blind-inserting (matches businesses by normalized name, individuals by name + shared email/phone, follows `merged_into_id` to the live survivor), tenant-scopes new accounts to the caller's workspace and refuses a null/ambiguous workspace.
- ✅ **Data fixes (prod)**: Sorensen & Smith LLC cluster merged 6→1; Elite Rc Productions Llc + Pbc Inc cross-type dups merged; Milton G Smith person hub created (owns Sorensen & Smith + GSMS + Hendrix).
- **Known debt (NOT addressed, by decision)**: `npm run typecheck` carries ~1156 pre-existing TS errors across ~209 files (code↔generated-types drift; not a deploy gate — Vite build + lint are green). This session added 0 new type errors. Tracked as a separate, dedicated effort.
- Enum reference: `accounts.account_type` is enum `account_type_new` (`individual`/`business`); `accounts.type` is enum `account_type_v2` (`household`/`commercial_business`); `sync_account_types` mirrors them.

### 2026-06-28 (Relationship Graph)
- ✅ **One identity-and-relationship graph keyed to `accounts.id`** (docs/Lewis-CRM-Relationship-Graph-Plan.md). All 4 phases, applied directly to prod.
  - **Phase 0 — "goes by" / alias search**: `accounts.goes_by` + `account_aliases` table; `goes_by` folded into `accounts_search_vector_tg`; `unified_customer_search` + `global_search_v1` made alias + trigram (pg_trgm) aware; new `search_accounts(q)` RPC returns a match reason ("goes by Lance", "fuzzy: McDonald"). Inline "Goes by" capture on the customer header.
  - **Phase 1 — the edge table**: `account_relationships` (typed/directional: owns, spouse, parent_company, same_as, related, household_member) + `get_account_relationships()` RPC. Relationships tab + Link drawer + Snapshot cross-sell line on the customer record. Households stay the set-grouping container (`household_rollup`). Backfilled spouse edges from `spouse_name`.
  - **Phase 2 — suggestions**: `account_relationship_suggestions` staging table (never auto-commit) + `generate_relationship_suggestions()` engine (shared phone/address, surname-business, business-email-name, spouse name). Edge fn `suggest-account-links` (CRON_SECRET) + nightly GitHub Action. One-click confirm promotes to a `source='suggested'` edge.
  - **Phase 3 — dedup + consolidation**: `/duplicates` review queue over pending `duplicate_groups` (`list_duplicate_groups_for_review`), merge via `relgraph_merge_duplicate_group()` which records a `same_as` provenance edge then calls the existing `merge_duplicate_records`. Dropped dead `customer_identities` (0 rows). Kept `businesses` (still read by CompanyManagement/global_search).
  - Key files: `useRelationshipGraph.ts`, `components/relationships/*`, `DuplicatesReviewPage.tsx`, migrations `20260628200000`–`204000`. All new SECURITY DEFINER RPCs revoked from anon/public.

### 2024-12-28 (Predictive Analytics Suite + CEO Digest Schema Fixes)
- ✅ **CEO Digest Schema Fixes**
  - Fixed `quote_status` enum values: `'sent'/'accepted'/'declined'` → `'open'/'won'/'lost'`
  - Fixed `quotes.policy_type` → `quotes.line_of_business`
  - Fixed `policies.created_by` → used `quotes.created_by` for top_agents
  - Fixed `tasks.agency_workspace_id` → join through `tasks.account_id` → `accounts.agency_workspace_id`
  - Migration files: `20251228500000-500003_fix_ceo_digest_*.sql`
  - Workflow: Simplified for CEO master mode (single call aggregates all agencies)

- ✅ **Predictive Analytics: Retention Risk Scoring**
  - Edge function: `run-retention-scoring` with deterministic scoring
  - Database: `retention_model_configs`, `policy_renewal_risk_scores`, `account_churn_risk_scores`
  - Configurable weights: contact recency, claims, payments, tenure, bundle count
  - Risk levels: low, medium, high, critical with explainable top factors
  - Auto-generates retention tasks for high/critical risk policies
  - GitHub Action: Daily at 6 AM UTC
  - Hook: `useRetentionRiskScores.ts` with summary, policy/account scores
  - UI: `RetentionDashboard.tsx` with tabs for policies, accounts, upcoming renewals
  - Tests: `retentionScoring.test.ts` with scoring engine unit tests

- ✅ **AI Task Generation from Documents**
  - Edge function: `process-document-tasks` with queue-based processing
  - Database: `document_analysis_jobs`, `document_insights`
  - PII redaction before AI processing (SSN, credit cards, licenses)
  - Rule-based extraction V1 (claims, renewals, endorsements, COI, quotes)
  - Suggested tasks with confidence scores and evidence
  - Human-in-the-loop approval workflow
  - GitHub Action: Every 15 minutes
  - Hook: `useDocumentInsights.ts` with approval/dismiss mutations
  - UI: `AITaskApprovalPanel.tsx` with edit-before-approve dialog
  - Enhanced tasks table: `source`, `confidence`, `evidence`, `ai_generated` columns

- ✅ **Coverage Gap Analysis**
  - Edge function: `run-coverage-gap-detection` with rule engine
  - Database: `coverage_gap_rules`, `coverage_gap_opportunities`
  - 6 default rules: auto_no_home, home_no_auto, high_liability_no_umbrella, single_policy_bundle, commercial_no_cyber, commercial_no_epli
  - RPC: `get_account_insurance_profile()`, `list_coverage_gap_opportunities()`
  - Opportunity status workflow: new → contacted → quoted → converted/dismissed
  - GitHub Action: Daily at 7 AM UTC
  - Hook: `useCoverageGapOpportunities.ts` with status updates
  - UI: `CoverageGapsDashboard.tsx` with opportunity list and rules config
  - Tests: `coverageGapDetection.test.ts` with rule evaluation unit tests

- ✅ **Shared Analytics Infrastructure**
  - `analytics_job_runs` table for audit trail across all analytics jobs
  - Idempotency keys prevent duplicate processing
  - Job status tracking: created, running, completed, failed
  - Stats and error tracking per run

### 2024-12-27 (CEO Weekly Digest)
- ✅ **CEO Weekly Digest** - Automated executive performance reports
  - Edge function: `weekly-ceo-digest` with AI summarization (GPT-4o/Claude)
  - Database: `ceo_digest_settings`, `ceo_digest_runs` tables with RLS
  - RPC: `get_weekly_ceo_digest_facts()` computes deterministic metrics
  - GitHub Action: Scheduled trigger every Monday 8AM ET
  - Admin UI: Settings page (`/admin/digest-settings`) + History (`/admin/digest-history`)
  - Hook: `useCEODigest.ts` with settings, runs, and trigger mutations
  - Tests: 26 unit tests for utilities and types
  - Security: CRON_SECRET authentication, idempotency keys
  - Email: Resend integration with branded HTML template
  - Key files: `weekly-ceo-digest/index.ts`, `useCEODigest.ts`, `CEODigestSettings.tsx`, `CEODigestHistory.tsx`

### 2024-12-27 (Quote Ranking + Tech Debt + Canopy 2-Way Sync + ACORD Forms)
- ✅ **ACORD Form PDF Generation** (verified complete)
  - `/acord-templates` page: Upload, validate, version ACORD PDF templates
  - `/acord-forms` page: Create, manage, filter forms by account
  - Form editor: Section-based fields, auto-save, account data pull, document import
  - PDF generation via `pdf-generation-worker` edge function + pdf-lib
  - eSignature integration (Dropbox Sign ready)
  - Audit history, completion tracking, validation
  - Key files: `AcordTemplates.tsx`, `FormManagement.tsx`, `AcordFormEdit.tsx`, `pdfFiller.ts`
- ✅ **Quote Ranking Enhancements**
  - Coverage limit adequacy scoring with configurable thresholds
  - Customizable scoring weight profiles (agency/account level)
  - New tables: `coverage_limit_standards`, `scoring_weight_profiles`
  - Updated `calculate-quote-score` edge function with limit parsing
  - New hooks: `useCoverageLimitStandards`, `useScoringWeightProfiles`
  - New UI: `CoverageLimitStandardsEditor`, `ScoringWeightsEditor`
- ✅ **Technical Debt Quick Wins**
  - Sentry error tracking fully integrated (`@sentry/react`)
  - Storybook 8.x with Button, Badge, Card stories
  - Route-based code splitting verified (90+ lazy-loaded pages)
  - Vendor chunking optimized (16 split bundles)
- ✅ **Canopy 2-Way Sync**
  - Monitoring API: Auto-refresh policies every 30 days, reconnect handling
  - Servicing API: Add/remove vehicles, drivers, update coverages, request ID cards
  - Commercial Lines: Fleet vehicles, GL/BOP, Workers Comp, business locations
  - Change Detection: Snapshot diffing, coverage/premium change alerts
  - ACORD Prefill: `get_canopy_commercial_prefill()` function
  - 10 new tables: snapshots, monitorings, servicing_actions, commercial_vehicles, etc.
  - 16 UI components in `src/components/canopy/`

### 2024-12-25 (Comprehensive Remediation)
- ✅ **Phase 0**: Security hardening (XSS fixes with DOMPurify, auth guards)
- ✅ **Phase 1**: Critical security & broken features (webhook auth, COI email)
- ✅ **Phase 2**: Database stability (RLS policies, indexes)
- ✅ **Phase 3**: TypeScript safety (removed all @ts-nocheck)
- ✅ **Phase 4**: Feature completion (form validation with Zod)
- ✅ **Phase 5**: Error handling & observability infrastructure
  - `src/lib/errorTracking.ts` - Sentry-ready error tracking
  - `src/lib/validateEnv.ts` - Environment validation
  - `src/lib/logger.ts` - Environment-aware logging
  - `supabase/functions/_shared/logger.ts` - Edge function logging
  - `supabase/functions/_shared/error-handler.ts` - Error classes & handlers
- ✅ **Phase 6**: Testing & CI pipeline
  - Vitest test framework configured
  - CI pipeline with TypeScript, lint, test, build
  - Initial test coverage for utilities

### 2024-12-04
- ✅ Deployed to Netlify production
- ✅ Configured lewisinsurance.ai custom domain
- ✅ Deployed database migrations (lead_auto_drivers, lead_auto_vehicles, knowledge_base_queries)
- ✅ Regenerated Supabase TypeScript types
- ✅ Added `terser` dependency for production builds
- ✅ Switched from Vercel to Netlify due to permission issues
- ✅ Configured DNS in GoDaddy to point to Netlify
- ✅ Created comprehensive documentation (CLAUDE_CONTEXT.md)

---
Claude code is to deploy all edge functions automatically on behalf of the user 


**Last Updated:** December 28, 2025
**Status:** ✅ Production Deployed
**Version:** 2.3.0


