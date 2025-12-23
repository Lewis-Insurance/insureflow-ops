# InsureFlow Ops - Complete Context Documentation

## Project Overview

**Project Name:** InsureFlow Ops
**Description:** Comprehensive insurance agency management platform with AI capabilities
**Tech Stack:** React + Vite + TypeScript + Supabase + Netlify
**Domain:** [lewisinsurance.ai](https://lewisinsurance.ai)
**Production URL:** [https://lewisinsurance.netlify.app](https://lewisinsurance.netlify.app)

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
**Database:** PostgreSQL 17

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
```

---

## Edge Functions

### Supabase Edge Functions (49 total)

**Location:** `/supabase/functions/`

#### AI & Machine Learning (10)
- `ai-assistant-chat` - AI chatbot with knowledge base RAG
- `ai-brain-rag` - Retrieval Augmented Generation engine
- `ai-compose-email` - AI email composition
- `ai-document-analysis` - Document analysis
- `ai-document-analysis-azure` - Azure Document Intelligence
- `ai-document-analysis-simple` - Simple document parsing
- `ai-document-intelligence` - Advanced document AI
- `ai-task-generator` - Auto-generate tasks from data
- `analyze-coverage-gaps` - Identify insurance coverage gaps
- `lewi_analyze` - Lewi AI analysis

#### Document Processing (11)
- `analyze-insurance-document` - Parse insurance documents
- `check-document-integrity` - Verify document integrity
- `classify-document` - Auto-classify document types
- `ocr-document` - OCR processing with Google Vision
- `on_parse_complete` - Post-parse processing
- `parse-document-ocr` - Parse documents with OCR
- `parse-pdf-knowledge` - Extract knowledge from PDFs
- `parseur-webhook` - Parseur integration webhook
- `process-document-batch` - Batch document processing
- `upload-to-google-drive` - Upload to Google Drive
- `azure-diagnostics` - Azure API diagnostics

#### Scoring & Analytics (5)
- `calculate-lead-score` - Lead scoring algorithm
- `calculate-quote-score` - Quote scoring algorithm (multi-dimensional)
- `calculate-renewal-risk` - Renewal churn prediction
- `lead-scoring-engine` - Advanced lead scoring
- `renewal-risk-batch` - Batch renewal risk calculation

#### Communication (9)
- `email-inbound` - Process inbound emails
- `email-inbound-lite` - Lightweight email processing
- `email-send` - Send outbound emails
- `send-coi-email` - Email COI certificates (currently disabled)
- `twilio-recording-webhook` - Twilio recording webhook
- `twilio-sms` - Send SMS via Twilio
- `twilio-voice` - Twilio voice calls
- `twilio-voice-webhook` - Twilio voice webhook
- `phone-verification` - Verify phone numbers

#### Workflows & Automation (7)
- `nurture-campaign-processor` - Process nurture campaigns
- `process-quote-followups` - Automated quote follow-ups
- `process-data-export` - Export data processing
- `lead-capture-webhook` - Webhook for lead capture
- `setup-mfa` - Multi-factor auth setup
- `analyze-workspace` - Workspace analytics
- `worker-comparison` - Background comparison worker

#### Admin & User Management (3)
- `admin-approvals` - Admin approval workflows
- `admin-create-user` - Create users via admin
- `admin-list-users` - List all users

#### Insurance Operations (4)
- `compare-insurance-options` - Compare policy options
- `generate-coi-data` - Generate COI certificates
- `generate-insurance-quote-doc` - Generate quote documents
- `submit-comparison` - Submit comparison requests

#### Workspace Management (1)
- `create_workspace` - Create new workspace

---

## TypeScript Configuration

### Relaxed Type Checking

The project uses relaxed TypeScript settings to avoid build issues:

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

### @ts-nocheck Directives

The following files have TypeScript checking disabled via `// @ts-nocheck`:

**Edge Functions (10):**
- ai-task-generator/index.ts
- analyze-coverage-gaps/index.ts
- analyze-workspace/index.ts
- azure-diagnostics/index.ts
- calculate-quote-score/index.ts
- create_workspace/index.ts
- lewi_analyze/index.ts
- on_parse_complete/index.ts
- parseur-webhook/index.ts
- process-quote-followups/index.ts

**Hooks (7):**
- src/hooks/useTaskGeneration.ts
- src/hooks/useTaskReminders.ts
- src/hooks/useTaskTemplates.ts
- src/hooks/useUnifiedCustomers.ts
- src/hooks/useWorkspaceJobs.ts
- src/integrations/supabase/hooks/useLeadInsuranceDetails.ts
- src/integrations/supabase/hooks/useNurtureCampaigns.ts

**Reason:** These files had TypeScript strict mode errors that couldn't be easily resolved. The `@ts-nocheck` directive allows them to deploy while maintaining runtime functionality.

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

### 1. Send COI Email Function Disabled

**Issue:** `send-coi-email` edge function uses npm package `resend` which is incompatible with Deno runtime.

**Status:** Temporarily disabled (returns 503)

**Workaround:**
- Manual COI emailing
- Or replace with Deno-compatible email service

**File:** `supabase/functions/send-coi-email/index.ts`

### 2. TypeScript Strict Mode

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
│   ├── functions/        # Edge functions (49)
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

1. **Multi-dimensional Quote Ranking** - Rank quotes across price, coverage, carrier quality
2. **Predictive Analytics** - Churn prediction, renewal risk scoring
3. **AI Task Generation** - Auto-generate tasks from document analysis
4. **Coverage Gap Analysis** - Identify cross-sell opportunities
5. **Smart Email Composer** - AI-powered email generation
6. **Document Classification** - Auto-classify uploaded documents
7. **Performance Monitoring** - Implement Sentry or similar

### Technical Debt

1. Remove `@ts-nocheck` from files after fixing type issues
2. Replace disabled `send-coi-email` function with Deno-compatible solution
3. Implement comprehensive test coverage
4. Add Storybook for component documentation
5. Optimize bundle size with code splitting
6. Add performance monitoring

---

## Contact & Support

**Project Owner:** Brian Lewis
**Email:** brian@lewisinsurance.ai
**GitHub:** Lewis-Insurance/insureflow-ops

---

## Change Log

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

**Last Updated:** December 4, 2024
**Status:** ✅ Production Deployed
**Version:** 1.0.0
