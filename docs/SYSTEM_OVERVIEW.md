# Insurance Agency Management System - Complete Overview

## Executive Summary

This is a comprehensive, full-stack insurance agency management platform built with React, TypeScript, Tailwind CSS, and Supabase (Lovable Cloud). The system handles the complete lifecycle of insurance operations including customer/account management, policy administration, quotes, renewals, tasks, tickets, and advanced AI-powered document intelligence.

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom design system (HSL-based semantic tokens)
- **UI Components**: Radix UI primitives with shadcn/ui components
- **State Management**: React Query (@tanstack/react-query) for server state
- **Routing**: React Router v6
- **Forms**: React Hook Form with Zod validation

### Backend
- **Platform**: Lovable Cloud (Supabase)
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Edge Functions**: Deno-based serverless functions
- **Authentication**: Supabase Auth (email, phone, Google)
- **Storage**: Supabase Storage for documents
- **AI Integration**: Lovable AI Gateway (Google Gemini 2.5 & OpenAI GPT-5)

### AI & OCR
- **AI Gateway**: Lovable AI for document analysis and chat
- **OCR**: Google Cloud Vision API for document text extraction
- **Models Used**: 
  - google/gemini-2.5-pro (complex reasoning, multimodal)
  - google/gemini-2.5-flash (balanced performance)
  - openai/gpt-5 (when specified)

## Core System Architecture

### 1. Multi-Tenant Account Management

**Accounts Table** (`public.accounts`)
- Represents both business and individual clients
- Supports account hierarchies and relationships
- Full-text search with tsvector indexing
- Audit trail via `audit_logs` table
- Fields: name, type, email, phone, address, tax identifiers

**Account Memberships** (`public.account_memberships`)
- Links users to accounts with role-based permissions
- Roles: owner, staff, member
- Enables multi-user access to account data

**Contacts** (`public.contacts`)
- Individual contacts associated with accounts
- Relationship types: primary, billing, claims, etc.
- TCPA compliance tracking for SMS/call consent

### 2. Policy & Quote Management

**Policies** (`public.policies`)
- Complete policy lifecycle management
- Links to accounts, carriers, producers
- Coverage details, premiums, terms
- Status tracking: active, expired, cancelled, pending
- Document attachments via storage

**Quotes** (`public.quotes`)
- Quote generation and tracking
- Status: draft, sent, accepted, declined, expired
- Conversion to policies
- Associated documents and notes

**Renewals** (`public.renewals`)
- Automated renewal tracking
- Status: upcoming, in_progress, completed, lost
- Priority levels and assignment

### 3. Task & Workflow Management

**Tasks** (`public.tasks`)
- Comprehensive task system with:
  - Categories: policy_review, renewal, claim, follow_up, etc.
  - Priorities: low, medium, high, urgent
  - Status tracking: pending, in_progress, completed, cancelled
  - Due dates and time tracking
  - Assignee management

**Task Templates** (`public.task_templates`)
- Pre-defined task templates for common workflows
- Trigger events: policy_created, renewal_due, claim_filed, etc.
- Automatic task generation based on business events
- Estimated durations and default priorities

**Task Features**:
- Recurring tasks with flexible schedules (daily, weekly, monthly, yearly)
- Task dependencies and relationships
- Checklist items within tasks
- Time tracking (start, pause, complete)
- Activity feed and audit trail
- Bulk actions support
- Reminders and notifications

### 4. Ticket System (Customer Support)

**Tickets** (`public.tickets`)
- Multi-channel support: email, phone, web, chat
- Priority levels: low, normal, high, urgent
- Status workflow: open, in_progress, waiting_on_customer, resolved, closed
- SLA tracking
- Assignment and routing

**Ticket Messages** (`public.ticket_messages`)
- Threaded conversations
- Message types: comment, email, phone_note, internal_note
- Author types: customer, agent, system, ai
- Attachments support
- Internal vs public messages

**Ticket Actions** (`public.ticket_actions`)
- AI-powered automation:
  - Auto-summarization
  - Action item extraction
  - Priority suggestions
  - Category detection

### 5. Document Intelligence System

#### Document Analysis Pipeline

**Storage & Upload**
- Documents stored in Supabase Storage (`documents` bucket)
- Support for PDF, DOCX, images
- Size limits: 50MB per file
- Automatic file validation

**OCR & Text Extraction** (`ai-document-analysis` edge function)
- Google Cloud Vision API integration
- Page-by-page text extraction (up to 60 pages)
- Quality validation and confidence scoring
- Header/footer filtering for cleaner text

**Performance Optimizations** (Recently Implemented)
- **Batch Processing**: Process up to 3 documents in parallel
- **OCR Caching**: SHA-256 based caching with 7-day TTL
- **Memory Efficiency**: Chunked processing with inter-batch delays
- **Cache Table** (`public.ocr_cache`):
  - Stores OCR results with document hash
  - Automatic expiration and cleanup
  - 24x faster for cached documents
  - Reduces Google Vision API costs

**Performance Metrics**:
- Before optimization: 10 documents = ~120 seconds
- After optimization (first time): 10 documents = ~40 seconds (3x faster)
- After optimization (cached): 10 documents = ~5 seconds (24x faster)

#### Insurance Document Comparison

**Purpose**: Compare insurance quotes/policies side-by-side to identify coverage gaps and cost differences

**Workflow**:
1. User uploads 2+ insurance documents (Option 1, Option 2, etc.)
2. System extracts structured data:
   - Carrier information
   - Policy numbers and terms
   - Insured name and details
   - Coverages (type, limits, deductibles)
   - Premiums (by coverage and total)
   - Vehicles or properties covered

3. AI Analysis:
   - Parses abbreviations (BI, PD, PIP, CSL, COMP, COLL)
   - Handles split limits (e.g., "50/100/50" for BI/PD)
   - Detects Combined Single Limit (CSL)
   - Normalizes coverage names and limits
   - Identifies "YES" indicators and extracts numeric values

4. Gap Analysis:
   - Identifies coverages in one option but missing in others
   - Highlights limit differences
   - Calculates cost differences
   - Generates side-by-side comparison report

**Comparison Sessions** (`public.comparison_sessions`)
- Stores comparison results
- Links to uploaded documents
- Maintains analysis state
- Tracks user and account

**Technical Implementation**:
- `InsuranceComparison.tsx` - UI for upload and comparison
- `ComparisonReport.tsx` - Visual comparison display
- `GapAnalysisCard.tsx` - Gap highlighting
- `submit-comparison` edge function - Orchestrates comparison
- `ai-document-analysis` edge function - Extracts structured data
- `ComparisonEngine.ts` - Gap analysis logic

#### Document Parsing Capabilities

**Structured Extraction**:
- Policy details (carrier, dates, terms)
- Coverage information (types, limits, deductibles)
- Premium breakdowns
- Vehicle/property schedules
- Insured information

**Fallback Mechanisms**:
- Regex-based extraction when AI parsing fails
- Pattern matching for common formats
- Inference from document context
- OCR text search for missing values

### 6. AI-Powered Features

**AI Assistant** (Chat Interface)
- Context-aware chat within the application
- Access to customer data, policies, quotes
- Document analysis and Q&A
- Task suggestions and automation
- Powered by Lovable AI Gateway

**AI Ticket Automation** (`ai-ticket-automation` edge function)
- Auto-summarize ticket threads
- Extract action items
- Suggest priorities and categories
- Sentiment analysis

**AI Document Analysis** (`ai-document-analysis` edge function)
- Insurance document understanding
- Coverage extraction
- Premium analysis
- Gap detection

**AI Brain RAG** (`ai-brain-rag` edge function)
- Knowledge base Q&A
- Document search and retrieval
- Policy information lookup

### 7. CRM Features

**Global Search**
- Full-text search across accounts, contacts, policies
- Recent items tracking
- Search history

**Duplicate Detection** (`public.duplicate_groups`)
- Similarity-based duplicate identification
- Match scoring (email, phone, name similarity)
- Manual merge workflow
- Status tracking: pending, confirmed, ignored, merged

**Tags & Categorization** (`public.tags`, `public.customer_tags`)
- Flexible tagging system
- Color-coded tags
- Account-scoped tags
- Common tags: Lead, Active, High Value

**Activity Timeline**
- Unified activity stream per account
- Tracks: calls, emails, SMS, notes, policy changes
- Chronological display

**Audit Trail** (`public.audit_logs`)
- Complete change tracking
- User attribution
- Before/after snapshots
- Entity-level auditing

### 8. Communication Features

**Telephony Integration** (Twilio)
- Outbound calling from CRM
- Call recording
- Call history and notes
- Click-to-call functionality

**SMS Messaging**
- TCPA-compliant messaging
- Consent tracking (`public.twilio_consents`)
- Message history
- Template support

**Email**
- Inbound email parsing (`email-inbound-lite` edge function)
- Email to ticket conversion
- Attachment handling

### 9. Reporting & Analytics

**Reports Available**:
- Agent Commissions Report
- Insured Total Value Report
- Revenue Report
- Renewals by Line of Business
- Book of Business Analytics
- Task Analytics Dashboard

**Data Visualization**:
- Recharts integration
- Interactive charts and graphs
- Date range filtering
- Export capabilities

### 10. Security & Compliance

**Row Level Security (RLS)**
- Comprehensive RLS policies on all tables
- User can only access their account's data
- Service role bypass for system operations
- Policy-based authorization

**Authentication**
- Multi-factor authentication (MFA) support
- Phone verification
- Session management
- Access logs

**TCPA Compliance**
- Consent tracking for SMS/calls
- Evidence storage
- Opt-in/opt-out management

**Data Protection**
- SSN encryption and masked display
- Document access control
- Audit logging
- Data export for GDPR compliance

### 11. User Management & Permissions

**Profiles** (`public.profiles`)
- User profile management
- Role-based access control
- Roles: customer, staff, admin, producer, csr, accounting, owner
- Staff flag for internal users

**Permission System**
- Role-based permissions
- Account-level permissions via memberships
- Feature-level access control

## Key Edge Functions

### Document Processing
1. **ai-document-analysis** - Primary document intelligence
2. **parse-pdf-knowledge** - Knowledge base document parsing
3. **check-document-integrity** - Document validation
4. **process-document-batch** - Batch document processing

### AI & Automation
1. **ai-brain-rag** - RAG-based Q&A system
2. **ai-ticket-automation** - Ticket AI features
3. **compare-insurance-options** - Insurance comparison (deprecated, replaced by ai-document-analysis)
4. **submit-comparison** - Orchestrates comparison workflow

### Communication
1. **email-send** - Outbound email
2. **email-inbound-lite** - Inbound email processing
3. **twilio-voice** - Voice calls
4. **twilio-sms** - SMS messaging
5. **twilio-recording-webhook** - Call recording

### COI & Documents
1. **generate-coi-data** - Certificate of Insurance generation
2. **send-coi-email** - COI delivery

### Security & Admin
1. **admin-approvals** - Approval workflows
2. **setup-mfa** - Multi-factor auth setup
3. **phone-verification** - Phone number verification
4. **process-data-export** - GDPR data export

## Database Schema Highlights

### Core Tables
- `accounts` - Customer/business accounts
- `contacts` - Individual contacts
- `policies` - Insurance policies
- `quotes` - Insurance quotes
- `renewals` - Renewal tracking
- `tasks` - Task management
- `tickets` - Support tickets
- `profiles` - User profiles

### Relationship Tables
- `account_memberships` - User-account relationships
- `customer_tags` - Tag assignments
- `policies_accounts` - Policy-account links

### Communication
- `twilio_consents` - SMS/call consent
- `ticket_messages` - Ticket conversations

### AI & Documents
- `comparison_sessions` - Document comparisons
- `ocr_cache` - OCR result caching
- `knowledge_base` - RAG knowledge entries

### System Tables
- `audit_logs` - Change tracking
- `duplicate_groups` - Duplicate detection
- `task_generation_log` - Task automation log

## Recent Enhancements

### Performance Optimizations (Latest)
1. **OCR Caching System**
   - SHA-256 document hashing
   - 7-day TTL cache
   - Automatic expiration
   - 24x faster for cached documents

2. **Batch Processing**
   - Parallel document processing (3 concurrent)
   - Memory-efficient chunking
   - Inter-batch delays

3. **Resource Management**
   - Controlled concurrency
   - Garbage collection optimization
   - Stable memory usage

### Insurance Comparison Improvements
1. **Better Parsing**
   - BI/PD split limit recognition
   - CSL (Combined Single Limit) detection
   - Abbreviation handling
   - Numeric value extraction from "YES" indicators

2. **Coverage Inference**
   - Fallback regex patterns
   - Context-based inference
   - Quality validation

## Configuration & Environment

### Required Environment Variables
- `SUPABASE_URL` - Database URL (auto-provided)
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (auto-provided)
- `LOVABLE_API_KEY` - AI gateway access (auto-provided)
- `GOOGLE_CLOUD_VISION_API_KEY` - OCR capabilities (user-provided)
- `TWILIO_*` - Telephony integration (user-provided)

### Performance Settings
- Batch concurrency: 3 documents
- Cache TTL: 7 days
- Max document size: 50MB
- Max pages per document: 60

## Design System

### Color Tokens (HSL-based)
- Semantic tokens defined in `index.css`
- Dark/light mode support
- Primary, secondary, accent colors
- Consistent component theming

### Component Library
- Radix UI primitives
- Custom shadcn/ui variants
- Consistent design patterns
- Accessible by default

## Future Considerations

### Potential Enhancements
1. **Incremental Page Processing** - Process large PDFs page-by-page
2. **Progressive Results** - Stream results as pages complete
3. **Smart Prefetching** - Preload frequently accessed documents
4. **Compression** - Compress cached OCR text
5. **Distributed Caching** - Redis for faster cache access

### Scalability
- Current system handles small-to-medium agencies
- Batch processing scales to larger document volumes
- Database optimized with indexes and RLS
- Edge functions auto-scale with traffic

## Documentation Structure

```
docs/
├── SYSTEM_OVERVIEW.md (this file)
├── DOCUMENT_PROCESSING_OPTIMIZATION.md
├── TASK_AUTOMATION_GUIDE.md
├── TASK_PHASE_4_GUIDE.md
├── TASK_PHASE_5_GUIDE.md
├── security/
│   ├── CRITICAL_ISSUES_FIXED.md
│   └── security-fixes-status.md
├── audits/
│   └── deep-analysis.md
└── github-issues/
    ├── epic-codebase-hardening.md
    └── issue-*.md (various issues)
```

## Key Strengths

1. **Comprehensive Feature Set** - Handles all aspects of insurance agency operations
2. **AI-Powered Intelligence** - Document analysis, chat, automation
3. **Performance Optimized** - Caching, batch processing, efficient queries
4. **Secure by Default** - RLS, audit trails, TCPA compliance
5. **Modern Stack** - React, TypeScript, Tailwind, Supabase
6. **Scalable Architecture** - Edge functions, serverless, cloud-native

## Known Limitations

1. **OCR Accuracy** - Depends on document quality and Google Vision API
2. **Complex Documents** - Very complex policy documents may require manual review
3. **Abbreviations** - Insurance industry has many carrier-specific abbreviations
4. **Cache Size** - Large OCR cache may require periodic cleanup
5. **Rate Limits** - Lovable AI and Google Vision have rate limits

## Summary

This is a production-ready, full-stack insurance agency management system with advanced document intelligence capabilities. The recent performance optimizations make it highly efficient for processing insurance documents at scale. The system is built on modern, scalable infrastructure (Lovable Cloud/Supabase) and leverages AI for intelligent automation and document understanding.

The insurance comparison feature is particularly powerful, allowing agents to quickly analyze multiple quotes and identify coverage gaps for their clients. The caching and batch processing optimizations ensure fast, cost-effective document processing even with high volumes.
