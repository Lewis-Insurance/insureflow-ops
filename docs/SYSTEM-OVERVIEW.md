# InsureFlow Ops - Complete System Overview

## Document Purpose
This document provides a comprehensive overview of InsureFlow Ops as it exists today, and the planned enhancements to add Sembley-like ACORD form automation capabilities.

---

# PART 1: CURRENT STATE

## What is InsureFlow Ops?

InsureFlow Ops is a **comprehensive Insurance Agency Management Platform** built with modern web technologies. It serves as a complete agency operating system for property & casualty insurance professionals.

### Target Users
- Insurance agency owners
- Producers/agents
- Customer service representatives
- Agency administrators

### Core Value Proposition
A unified platform that combines CRM, policy management, renewals, AI-powered analytics, and automation - eliminating the need for multiple disconnected tools.

---

## Current Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| Vite | 5.4.19 | Build tool |
| React Router | 6.30.1 | Client-side routing |
| TanStack Query | 5.83.0 | Server state management |
| TanStack Table | 8.21.3 | Data tables |
| Tailwind CSS | 3.4.17 | Styling |
| shadcn/ui + Radix | - | Component library |
| React Hook Form + Zod | - | Form management |

### Backend
| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL database, Auth, Real-time, Edge Functions |
| PostgreSQL 17 | Primary database |
| 49 Edge Functions | Serverless backend logic |

### Integrations (Configured)
- Google Cloud Vision API (OCR)
- Azure Document Intelligence
- Twilio (SMS/Voice)
- Resend (Email)
- Parseur (Document parsing)

---

## Current Feature Set

### 1. CRM & Account Management
**Status: Fully Implemented**

- **Account Types**: Individual, Business, Household
- **Contact Management**: Multiple contacts per account, consent tracking
- **Activity Timeline**: Calls, emails, SMS, meetings, notes
- **Bulk Import/Export**: CSV with validation and duplicate detection
- **Custom Fields**: User-configurable fields per account type

**Key Files:**
- `src/pages/Accounts.tsx`
- `src/pages/AccountDetail.tsx`
- `src/components/crm/`

### 2. Policy Management
**Status: Fully Implemented**

- **Policy Types**: Auto, Home, Commercial, Life, Umbrella, Health, Renters
- **Coverage Tracking**: Limits, deductibles, premiums
- **Carrier Information**: Carrier name, policy numbers
- **Effective/Expiration Dates**: Full lifecycle tracking
- **Claims Association**: Link claims to policies

**Key Files:**
- `src/pages/Policies.tsx`
- `src/components/policies/`

### 3. Lead Management
**Status: Fully Implemented**

- **Lead Pipeline**: Visual pipeline with drag-and-drop stages
- **Lead Scoring**: 0-100 scoring with configurable rules
- **Source Attribution**: Track where leads come from, ROI by source
- **Assignment Strategies**: Round-robin, territory, specialty, performance, workload
- **Auto Insurance Leads**: Driver and vehicle information capture
- **Nurture Campaigns**: Automated follow-up sequences

**Key Files:**
- `src/pages/Leads.tsx`
- `src/components/leads/`
- `src/hooks/useLeads.ts`

### 4. Quote Management
**Status: Fully Implemented**

- **Quote Creation**: Multi-carrier quote comparison
- **Quote Ranking Dashboard**: AI-powered scoring with multiple dimensions
- **Follow-up Tracking**: Track quote status and client responses
- **Quote-to-Policy Conversion**: Seamless conversion workflow

**Key Files:**
- `src/pages/Quotes.tsx`
- `src/components/quotes/`

### 5. Renewal Intelligence
**Status: Fully Implemented**

- **Renewal Pipeline**: Visual renewal tracking
- **Risk Assessment**: Renewal risk scoring and cards
- **Renewal Campaigns**: Automated outreach for renewals
- **AO Renewals**: Agency Owner renewal import wizard
- **Retention Interventions**: Predictive churn prevention

**Key Files:**
- `src/pages/Renewals.tsx`
- `src/components/renewals/`

### 6. AI & Knowledge Management
**Status: Fully Implemented**

- **AI Brain**: AI assistant with knowledge base integration
- **Knowledge Manager**: 6 categories, templates, bulk import
- **Semantic Search**: AI-powered search with confidence scoring
- **Gap Tracking**: Identify unanswered questions for content creation
- **AI Email Composer**: Template-based email generation

**Key Files:**
- `src/components/ai/`
- `src/components/knowledge/`
- `src/pages/KnowledgeManager.tsx`

### 7. Document Intelligence
**Status: Fully Implemented**

- **OCR Processing**: Extract text from images and PDFs
- **Document Classification**: Automatic document type detection
- **Document Analysis**: AI-powered document understanding
- **Storage Integration**: Supabase storage for uploads

**Key Files:**
- `src/components/document-intelligence/`
- `src/pages/DocumentAnalysis.tsx`

### 8. Analytics & Reporting
**Status: Fully Implemented**

- **Producer Dashboard**: Individual agent metrics and KPIs
- **Agency Dashboard**: Agency-wide performance metrics
- **Executive Dashboard**: C-suite level analytics
- **Lead Analytics**: Source ROI, conversion funnels, aging
- **Custom Reports**: Revenue, commissions, renewals by LOB

**Key Files:**
- `src/pages/ProducerDashboard.tsx`
- `src/pages/AgencyDashboard.tsx`
- `src/components/dashboard/`
- `src/components/reports/`

### 9. Insurance Comparison
**Status: Fully Implemented**

- **Side-by-Side Comparison**: Compare multiple quotes
- **Coverage Gap Analysis**: Identify missing coverages
- **Severity Levels**: Prioritize coverage gaps
- **PDF Reports**: Generate comparison reports

**Key Files:**
- `src/components/comparison/`
- `src/pages/InsuranceComparison.tsx`

### 10. Communications Hub
**Status: Fully Implemented**

- **SMS Messaging**: Two-way SMS with consent tracking
- **Email Integration**: Email composition and tracking
- **Call Integration**: Telephony dashboard with call history
- **Unified Timeline**: All communications in one view

**Key Files:**
- `src/components/communications/`
- `src/pages/TelephonyDashboard.tsx`

### 11. Automation & Workflows
**Status: Fully Implemented**

- **Task Management**: Create, assign, template tasks
- **Automation Rules**: Trigger-based automation
- **Lead Assignment**: Configurable assignment strategies
- **Workflow Templates**: Reusable workflow patterns

**Key Files:**
- `src/components/automation/`
- `src/lib/taskAutomation.ts`

### 12. Additional Features
**Status: Fully Implemented**

- **COI Generator**: Certificate of Insurance creation
- **Customization Engine**: User-configurable fields/layouts
- **Issue Tracker**: Bug/issue reporting
- **Admin Panel**: System administration
- **Multi-tenant Architecture**: Row-level security

---

## Current Database Schema (Key Tables)

```sql
-- Core Entities
accounts (id, name, type, status, ...)
contacts (id, account_id, first_name, last_name, email, phone, ...)
policies (id, account_id, policy_number, carrier, type, premium, ...)
claims (id, policy_id, claim_number, status, amount, ...)
quotes (id, account_id, carrier, premium, status, ...)
leads (id, source, status, score, assigned_to, ...)

-- Supporting Entities
tasks (id, account_id, title, due_date, status, ...)
call_sessions (id, contact_id, direction, duration, recording_url, ...)
sms_messages (id, contact_id, direction, body, ...)
activity_events (id, account_id, event_type, metadata, ...)

-- AI & Knowledge
knowledge_base (id, title, content, category, embeddings, ...)
knowledge_gaps (id, question, frequency, ...)

-- Configuration
pipeline_stages (id, name, order, ...)
automation_rules (id, trigger, conditions, actions, ...)
profiles (id, email, role, ...)
```

---

## Current Codebase Structure

```
src/
├── pages/                      # 64 page components (lazy-loaded)
│   ├── Accounts.tsx
│   ├── AccountDetail.tsx
│   ├── Policies.tsx
│   ├── Leads.tsx
│   ├── Quotes.tsx
│   ├── Renewals.tsx
│   ├── ProducerDashboard.tsx
│   └── ... (57 more)
│
├── components/                 # 27 feature modules
│   ├── crm/                   # CRM components
│   ├── leads/                 # Lead pipeline
│   ├── quotes/                # Quote management
│   ├── renewals/              # Renewal tracking
│   ├── policies/              # Policy management
│   ├── ai/                    # AI features
│   ├── dashboard/             # Dashboard widgets
│   ├── automation/            # Workflow automation
│   ├── document-intelligence/ # Document processing
│   ├── knowledge/             # Knowledge base
│   ├── comparison/            # Insurance comparison
│   ├── reports/               # Analytics reports
│   ├── ui/                    # shadcn/ui components
│   └── ... (14 more)
│
├── hooks/                      # 82 custom React hooks
│   ├── useAccounts.ts
│   ├── useLeads.ts
│   ├── usePolicies.ts
│   └── ...
│
├── lib/                        # Utilities
│   ├── pdfGenerator.tsx       # PDF generation (jsPDF)
│   ├── taskAutomation.ts
│   └── ...
│
├── types/                      # TypeScript interfaces
├── integrations/supabase/      # Database client & hooks
├── contexts/                   # React contexts
└── config/                     # Configuration
```

---

## Current Performance Characteristics

- **Bundle Size**: Optimized with code splitting (74 lazy-loaded pages)
- **Caching**: React Query with 5-min staleTime
- **Memoization**: 233 instances of useMemo/useCallback
- **Build Tool**: Vite with Terser minification

---

# PART 2: WHAT WE WANT TO BUILD

## Gap Analysis: What Sembley Has That We Don't

Sembley is a specialized insurance software focused on **ACORD form automation**. Their core value: "One intake, many forms" - clients fill out one form, and it auto-populates multiple ACORD forms.

### Critical Gaps

| Sembley Feature | InsureFlow Status | Priority |
|-----------------|-------------------|----------|
| ACORD form auto-fill | **MISSING** | Critical |
| Single intake → Multiple forms | **MISSING** | Critical |
| Custom intake form builder | **MISSING** | Critical |
| Public client intake portal | **MISSING** | Critical |
| Property data enrichment | **MISSING** | High |
| Business data enrichment | **MISSING** | High |
| eSignature on forms | **MISSING** | High |
| Send to carrier | **MISSING** | High |
| ACORD form detection from PDF | **MISSING** | Medium |

### What We Already Have (Advantages Over Sembley)

| Feature | InsureFlow | Sembley |
|---------|------------|---------|
| Full CRM | Yes | No |
| Policy Management | Yes | No |
| Claims Tracking | Yes | No |
| Lead Pipeline & Scoring | Yes | No |
| AI Quote Ranking | Yes | No |
| Renewal Intelligence | Yes | No |
| Predictive Analytics | Yes | No |
| Communications Hub | Yes | No |
| AI Knowledge Base | Yes | No |
| COI Generator | Yes | No |

---

## Target State: What We're Building

### New Feature: ACORD Form Automation Suite

#### 1. ACORD Form Library & Auto-Fill
**Purpose**: Generate pre-filled ACORD forms from account/intake data

**Forms to Support (Commercial Lines Focus)**:
- ACORD 125 - Commercial Insurance Application
- ACORD 126 - Commercial General Liability Section
- ACORD 127 - Commercial Auto Section
- ACORD 130 - Workers Compensation Application
- ACORD 140 - Property Section

**Capabilities**:
- Store field mappings for each ACORD form
- Auto-populate from account data
- Auto-populate from intake submissions
- Generate PDF output
- Support form versioning

**New Components**:
```
src/components/acord/
├── AcordFormLibrary.tsx          # Browse available forms
├── AcordFormViewer.tsx           # Preview/edit form
├── AcordFormGenerator.tsx        # Generate filled PDF
├── fields/
│   ├── Acord125Fields.ts         # Field definitions
│   ├── Acord126Fields.ts
│   ├── Acord127Fields.ts
│   ├── Acord130Fields.ts
│   └── Acord140Fields.ts
└── types/
    └── acord.ts                  # TypeScript types
```

#### 2. Custom Intake Builder
**Purpose**: Create client-facing forms that map to ACORD fields

**Capabilities**:
- Drag-and-drop form builder
- Question types: text, number, date, select, multi-select, file upload
- Conditional visibility (show question based on prior answers)
- Map questions to ACORD form fields
- Template library for common intake types
- Customizable branding

**New Components**:
```
src/components/intake/
├── IntakeBuilder.tsx             # Drag-drop builder
├── IntakePreview.tsx             # Preview before publish
├── IntakeRenderer.tsx            # Render for clients
├── IntakeSubmissions.tsx         # View submissions
├── EmbedCodeGenerator.tsx        # Generate embed code
├── questions/
│   ├── TextQuestion.tsx
│   ├── NumberQuestion.tsx
│   ├── SelectQuestion.tsx
│   ├── DateQuestion.tsx
│   ├── FileUploadQuestion.tsx
│   └── ConditionalLogic.tsx
└── types/
    └── intake.ts
```

#### 3. Public Intake Portal
**Purpose**: Allow clients to complete intakes without login

**Capabilities**:
- Shareable links (no authentication required)
- Unique access tokens per submission
- Progress saving (return later via email link)
- Mobile-responsive design
- Submission notifications

**New Pages**:
```
src/pages/
├── IntakeBuilder.tsx             # Internal: Build intakes
├── IntakeTemplates.tsx           # Internal: Manage templates
└── PublicIntake.tsx              # Public: Client-facing
```

**Public Route**:
- `/intake/:token` - No auth required

#### 4. Data Enrichment
**Purpose**: Auto-populate forms with property and business data

**Property Enrichment**:
- Square footage
- Year built
- Construction type
- Sale history
- Property valuation

**Business Enrichment**:
- NAICS/SIC codes
- Business address from website
- Company description
- Employee count estimates

**New Components**:
```
src/components/enrichment/
├── PropertyEnrichment.tsx
├── BusinessEnrichment.tsx
└── EnrichmentSettings.tsx

src/hooks/
├── usePropertyEnrichment.ts
└── useBusinessEnrichment.ts
```

**Third-Party APIs**:
- Property: ATTOM Data, CoreLogic, or Zillow API
- Business: Clearbit, Apollo.io, or D&B

#### 5. eSignature Integration (HelloSign)
**Purpose**: Collect signatures on ACORD forms

**Capabilities**:
- Create signature requests
- Place signature fields on PDFs
- Track signature status
- Webhook handling for events
- Signed document storage

**New Components**:
```
src/components/signature/
├── HelloSignIntegration.tsx
├── SignatureRequest.tsx
├── SignatureStatus.tsx
└── SignedDocuments.tsx
```

**New Edge Functions**:
```
supabase/functions/
├── hellosign-create-request/
└── hellosign-webhook/
```

#### 6. Enhanced Document AI
**Purpose**: Detect and extract data from existing ACORD forms

**Capabilities**:
- Identify ACORD form type from uploaded PDF
- Extract field values from existing forms
- Pre-populate new intakes from prior submissions
- Improve OCR accuracy for insurance documents

**Enhancements to**:
- `src/components/document-intelligence/`

---

## New Database Schema

```sql
-- ACORD Form Templates (stores field definitions)
CREATE TABLE acord_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number VARCHAR(10) NOT NULL,      -- "125", "126", etc.
  form_name TEXT NOT NULL,               -- "Commercial Insurance Application"
  version VARCHAR(20),                   -- "2016/03"
  field_schema JSONB NOT NULL,           -- Field definitions with positions
  pdf_template_url TEXT,                 -- Base PDF template
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Custom Intake Templates (user-created forms)
CREATE TABLE intake_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL,              -- Question definitions
  acord_mappings JSONB,                  -- Map questions → ACORD fields
  settings JSONB,                        -- Branding, notifications, etc.
  is_published BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Intake Submissions (client responses)
CREATE TABLE intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES intake_templates(id),
  account_id UUID REFERENCES accounts(id),
  access_token VARCHAR(64) UNIQUE,       -- For public access
  responses JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',    -- draft, submitted, processed
  client_email TEXT,                     -- For return-later link
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generated ACORD Forms
CREATE TABLE acord_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  intake_submission_id UUID REFERENCES intake_submissions(id),
  form_number VARCHAR(10) NOT NULL,
  field_values JSONB NOT NULL,
  pdf_url TEXT,
  signature_status VARCHAR(20) DEFAULT 'unsigned',
  signature_request_id TEXT,             -- HelloSign request ID
  submission_status VARCHAR(20) DEFAULT 'draft',
  submitted_to TEXT,                     -- Carrier name
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enrichment Cache
CREATE TABLE enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key TEXT NOT NULL,              -- Address or domain
  enrichment_type VARCHAR(20) NOT NULL,  -- 'property' or 'business'
  data JSONB NOT NULL,
  source VARCHAR(50),                    -- API provider name
  fetched_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP                   -- Cache expiration
);

-- Add indexes
CREATE INDEX idx_intake_submissions_token ON intake_submissions(access_token);
CREATE INDEX idx_intake_submissions_account ON intake_submissions(account_id);
CREATE INDEX idx_acord_forms_account ON acord_forms(account_id);
CREATE INDEX idx_enrichment_cache_lookup ON enrichment_cache(lookup_key, enrichment_type);
```

---

## User Flows

### Flow 1: Create Intake and Send to Client

```
Agent Action:
1. Navigate to Intake Builder
2. Select "Commercial Lines" template (or create custom)
3. Customize questions as needed
4. Map questions to ACORD fields
5. Save and publish intake
6. Generate shareable link
7. Send link to client via email/SMS

Client Experience:
1. Click link (no login required)
2. Complete intake form (mobile-friendly)
3. Save progress if needed (email link to return)
4. Submit completed intake
5. Receive confirmation
```

### Flow 2: Generate ACORD Forms from Intake

```
Agent Action:
1. View intake submission
2. Review client responses
3. Click "Generate ACORD Forms"
4. Select which forms to generate (125, 126, 127, etc.)
5. System auto-populates from intake + enrichment data
6. Review and edit if needed
7. Generate final PDFs
```

### Flow 3: Sign and Submit to Carrier

```
Agent Action:
1. View generated ACORD form
2. Click "Request Signature"
3. Place signature fields on PDF
4. Send signature request (HelloSign)
5. Client signs electronically
6. Download signed PDF
7. Submit to carrier portal
8. Track submission status
```

### Flow 4: Import Existing ACORD

```
Agent Action:
1. Upload existing ACORD PDF
2. System detects form type
3. System extracts field values via OCR
4. Review extracted data
5. Create new intake pre-filled with data
6. Link to account
```

---

## Integration Points with Existing System

### Leverage Existing Infrastructure

| Existing Asset | New Usage |
|----------------|-----------|
| `useAccounts` hook | Populate ACORD forms from account data |
| `usePolicies` hook | Reference existing policies in forms |
| `pdfGenerator.tsx` | Generate ACORD PDFs |
| Document Intelligence | Enhance for ACORD detection |
| Lead forms | Base patterns for intake builder |
| Communications hub | Send intake links |
| Activity timeline | Log intake/form events |

### New Integrations Required

| Integration | Purpose | API Provider |
|-------------|---------|--------------|
| Property Data | Auto-fill property info | ATTOM, CoreLogic, or Zillow |
| Business Data | Auto-fill company info | Clearbit, Apollo, or D&B |
| eSignature | Sign ACORD forms | HelloSign/Dropbox Sign |

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Database schema creation
- ACORD field mapping definitions
- Basic form library UI
- PDF generation for ACORD 125

### Phase 2: Intake Builder (Weeks 3-4)
- Drag-drop form builder
- Question components
- Public intake portal
- Progress saving

### Phase 3: Data Flow (Weeks 5-6)
- Intake → ACORD mapping engine
- Account data population
- Property enrichment integration
- Business enrichment integration

### Phase 4: Signatures & Submission (Weeks 7-8)
- HelloSign integration
- Signature placement UI
- Webhook handling
- Carrier submission tracking

### Phase 5: Document AI Enhancement (Weeks 9-10)
- ACORD form detection
- Field extraction from existing forms
- Pre-population from uploads

### Phase 6: Polish & Integration (Weeks 11-12)
- UI/UX refinement
- Error handling
- Testing
- Documentation

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Forms generated per day | Track adoption |
| Intake completion rate | >80% |
| Time saved per application | >50% reduction |
| Signature turnaround time | <24 hours |
| Data accuracy | >95% auto-fill accuracy |

---

## Competitive Position After Implementation

| Capability | InsureFlow | Sembley | Traditional AMS |
|------------|------------|---------|-----------------|
| ACORD Auto-Fill | Yes | Yes | No |
| Custom Intakes | Yes | Yes | No |
| Full CRM | Yes | No | Partial |
| Policy Management | Yes | No | Yes |
| Renewal Intelligence | Yes | No | Partial |
| AI Analytics | Yes | No | No |
| Communications Hub | Yes | No | No |
| Predictive Analytics | Yes | No | No |
| **Total Features** | **All** | **Forms Only** | **Partial** |

**Outcome**: InsureFlow becomes a complete agency operating system that combines the best of Sembley's form automation with comprehensive agency management capabilities.

---

## Pricing Consideration

| Sembley Tier | Price | InsureFlow Equivalent |
|--------------|-------|----------------------|
| Standard | $49/user/mo | More features at competitive price |
| Plus | $69/user/mo | Significantly more value |
| Pro | $89/user/mo | Complete platform |

InsureFlow can justify premium pricing by offering everything Sembley has plus full CRM, renewals, AI, and communications.

---

## Open Questions for Consideration

1. **Form Priority**: Start with all 5 commercial forms or one at a time?
2. **Enrichment APIs**: Which specific vendors for property/business data?
3. **Carrier Submission**: Direct API to carriers, or just PDF generation?
4. **White Labeling**: Should intake portal support custom branding?
5. **Pricing Model**: Per-form fees, or included in subscription?

---

*Document Version: 1.0*
*Created: December 18, 2025*
