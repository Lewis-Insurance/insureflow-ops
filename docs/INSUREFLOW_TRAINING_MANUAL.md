# InsureFlow Automation Platform
# Complete Training Manual

**Version 2.3.0 | Go-Live Edition**
**Lewis Insurance Agency**
**Effective Date: December 28, 2025**

---

## Table of Contents

1. [Welcome to InsureFlow](#1-welcome-to-insureflow)
2. [Getting Started](#2-getting-started)
3. [Dashboard Overview](#3-dashboard-overview)
4. [Lead Management](#4-lead-management)
5. [Customer & Account Management](#5-customer--account-management)
6. [Policy Management](#6-policy-management)
7. [Quote Management](#7-quote-management)
8. [Renewal Management](#8-renewal-management)
9. [Document Intelligence](#9-document-intelligence)
10. [ACORD Form Automation](#10-acord-form-automation)
11. [Task Management](#11-task-management)
12. [Communications Center](#12-communications-center)
13. [Canopy Integration](#13-canopy-integration)
14. [AI Assistant (LEWI)](#14-ai-assistant-lewi)
15. [Predictive Analytics & Retention](#15-predictive-analytics--retention)
16. [Coverage Gap Analysis](#16-coverage-gap-analysis)
17. [Client Portal](#17-client-portal)
18. [CEO Weekly Digest](#18-ceo-weekly-digest)
19. [Reports & Analytics](#19-reports--analytics)
20. [Administrator Functions](#20-administrator-functions)
21. [Insurance Workflows](#21-insurance-workflows)
22. [Quick Reference Guide](#22-quick-reference-guide)
23. [Troubleshooting](#23-troubleshooting)
24. [Glossary](#24-glossary)

---

# 1. Welcome to InsureFlow

## 1.1 What is InsureFlow?

InsureFlow is a comprehensive insurance agency management platform designed to streamline every aspect of your daily operations. From lead capture to policy binding, document processing to client service, InsureFlow provides the tools you need to deliver exceptional insurance services.

## 1.2 Key Capabilities

| Capability | Description |
|------------|-------------|
| **Lead-to-Policy Automation** | Complete workflow from lead capture through policy issuance |
| **AI-Powered Document Processing** | Intelligent extraction and analysis of insurance documents |
| **Predictive Analytics** | Churn prediction, retention scoring, and coverage gap detection |
| **ACORD Form Automation** | Template-based form generation with e-signature integration |
| **Real-Time Policy Sync** | Two-way Canopy integration for carrier connectivity |
| **Client Self-Service Portal** | Customer access to policies, ID cards, and service requests |
| **Executive Reporting** | Automated weekly CEO digest with AI-generated insights |

## 1.3 Your Role in InsureFlow

InsureFlow supports different user roles with appropriate access levels:

| Role | Access Level | Primary Functions |
|------|--------------|-------------------|
| **Producer/Agent** | Standard | Lead management, quotes, policies, customer service |
| **CSR** | Limited | Customer inquiries, service requests, document collection |
| **Admin** | Full | User management, system configuration, all features |
| **Owner** | Full + Executive | All admin functions plus executive reporting |

---

# 2. Getting Started

## 2.1 Logging In

1. Navigate to **https://lewisinsurance.ai**
2. Enter your email address
3. Enter your password
4. Click **Sign In**

**First-time users:** You will receive an email invitation with a link to set your password.

## 2.2 Navigation Overview

The InsureFlow interface consists of three main areas:

```
+------------------+----------------------------------------+
|                  |                                        |
|   Left Sidebar   |         Main Content Area              |
|   (Navigation)   |                                        |
|                  |                                        |
|   - Dashboard    |   Your current page content            |
|   - Leads        |   displays here                        |
|   - Customers    |                                        |
|   - Policies     |                                        |
|   - etc.         |                                        |
|                  |                                        |
+------------------+----------------------------------------+
```

### Main Navigation Groups

| Group | Pages | Purpose |
|-------|-------|---------|
| **My Dashboard** | Dashboard | Your daily command center |
| **AO Renewals** | AO Renewals | Advanced outsourced renewal management |
| **Leads** | Lead list, analytics | Sales pipeline management |
| **Canopy Import** | Import page | Policy sync from carriers |
| **LEWI AI** | AI Hub, Module Builder, Document Intelligence | AI-powered tools |
| **ACORD Forms** | Templates, Forms, Intake, COI Generator | Form automation |
| **Marketing** | Automations, Templates | Campaign management |
| **CRM** | Customers, Policies, Renewals, Calls, SMS | Core operations |
| **Contacts** | Carriers, MGAs | Partner directory |
| **Command Center** | Analytics, Retention, Knowledge Base | Executive tools |
| **Settings** | Profile, Admin | Configuration |

## 2.3 First Day Checklist

- [ ] Log in successfully
- [ ] Review your dashboard
- [ ] Check your assigned tasks
- [ ] Explore the lead pipeline
- [ ] Review any pending renewals
- [ ] Familiarize yourself with the AI Assistant

---

# 3. Dashboard Overview

## 3.1 Producer Dashboard

Your dashboard is your daily command center, organized into three tabs:

### Workspace Tab
- **Today's Tasks**: Tasks due today with priority indicators
- **Canopy Stats**: Policy sync status and recent imports
- **Quick Actions**: Common tasks with one-click access

### Sales Tab
- **Pipeline Summary**: Lead counts by stage
- **Quote Activity**: Recent quotes and their status
- **Revenue Metrics**: Production numbers for the period

### Activity Tab
- **Recent Communications**: Latest calls, emails, SMS
- **Document Uploads**: Recently processed documents
- **System Notifications**: Alerts and reminders

## 3.2 Key Dashboard Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **New Leads Today** | Leads entering the pipeline | Track daily |
| **Quotes Pending** | Quotes awaiting response | Follow up within 48hrs |
| **Renewals Due** | Policies expiring soon | Contact 60 days prior |
| **Overdue Tasks** | Past-due action items | Zero is the goal |
| **At-Risk Accounts** | Customers flagged for churn | Immediate attention |

## 3.3 Customizing Your Dashboard

1. Click the **gear icon** in the top-right of any widget
2. Select **Configure**
3. Adjust display options and date ranges
4. Click **Save**

---

# 4. Lead Management

## 4.1 Understanding the Lead Pipeline

Leads progress through defined stages in your sales pipeline:

```
NEW ─→ CONTACTED ─→ QUALIFIED ─→ QUOTED ─→ WON
                                          │
                                          └→ LOST
                                          │
                                          └→ NURTURING
```

| Status | Description | Action Required |
|--------|-------------|-----------------|
| **New** | Fresh lead, not yet contacted | Contact within 24 hours |
| **Contacted** | Initial contact made | Qualify the opportunity |
| **Qualified** | Confirmed insurance need | Gather info for quote |
| **Quoted** | Quote delivered to prospect | Follow up for decision |
| **Won** | Customer purchased | Create policy |
| **Lost** | Did not purchase | Document reason, consider nurture |
| **Nurturing** | Not ready now, future potential | Periodic check-in |

## 4.2 Lead Scoring

Every lead receives an automatic score from 0-100 based on:

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| **Contact Completeness** | 20% | Quality of contact information |
| **Insurance Needs** | 25% | Clarity of coverage requirements |
| **Premium Potential** | 20% | Estimated annual premium |
| **Timeline Urgency** | 15% | How soon they need coverage |
| **Engagement** | 20% | Response rates, email opens/clicks |

**Score Interpretation:**
- **80-100**: Hot lead - prioritize immediately
- **60-79**: Warm lead - strong potential
- **40-59**: Moderate - needs nurturing
- **Below 40**: Cool lead - long-term prospect

## 4.3 Creating a New Lead

### Quick Lead Capture (Recommended)
1. Click the **+ New Lead** button (top of Leads page)
2. Enter minimum required fields:
   - First Name, Last Name
   - Phone or Email
   - Insurance Type(s) needed
3. Click **Create Lead**

### Full Lead Entry
1. Navigate to **Leads** → **+ New Lead (Full)**
2. Complete all sections:
   - Contact Information
   - Insurance Needs
   - Current Coverage (if known)
   - Notes and Source
3. Click **Save Lead**

## 4.4 Working a Lead

### Step 1: Review Lead Details
1. Click on the lead in the list
2. Review the detail panel showing:
   - Contact information
   - Insurance needs
   - Lead score breakdown
   - Activity timeline

### Step 2: Make Initial Contact
1. Click **Log Call** or **Send Email**
2. Document the conversation
3. Update lead status to **Contacted**
4. Schedule a follow-up task

### Step 3: Qualify the Lead
Ask qualifying questions:
- What coverage do they currently have?
- When does current coverage expire?
- What's their timeline for making a decision?
- What's most important to them in coverage?

Update status to **Qualified** when you've confirmed:
- Legitimate insurance need
- Authority to make purchasing decision
- Budget alignment

### Step 4: Gather Quoting Information

**For Auto Insurance:**
- Driver information (DOB, license number, driving history)
- Vehicle details (VIN, year/make/model, usage)
- Current coverage and claims history

**For Home Insurance:**
- Property address and details
- Construction type, year built, square footage
- Coverage history and claims

**For Commercial:**
- Business type and operations
- Revenue and employee count
- Current coverage and claims history

## 4.5 Lead Views

InsureFlow offers multiple ways to view your leads:

| View | Best For | Access |
|------|----------|--------|
| **List View** | Detailed data, filtering | Default view |
| **Kanban Board** | Pipeline visualization | Click "Kanban" tab |
| **Timeline** | Activity history | Click "Timeline" tab |
| **Analytics** | Performance metrics | Click "Analytics" tab |

## 4.6 Auto Insurance Lead Details

For auto insurance leads, capture detailed driver and vehicle information:

**Adding Drivers:**
1. Open lead detail
2. Click **Drivers** tab
3. Click **+ Add Driver**
4. Enter:
   - Name, DOB, License info
   - Relation to insured
   - Years licensed
   - Accidents/violations (last 5 years)

**Adding Vehicles:**
1. Click **Vehicles** tab
2. Click **+ Add Vehicle**
3. Enter:
   - VIN (auto-populates make/model/year)
   - Ownership type (own/lease/finance)
   - Primary use
   - Annual mileage
   - Garaging address

---

# 5. Customer & Account Management

## 5.1 Account Types

InsureFlow supports two primary account types:

| Type | Description | Use Case |
|------|-------------|----------|
| **Individual/Household** | Personal lines customers | Home, auto, personal umbrella |
| **Business** | Commercial accounts | GL, BOP, WC, commercial auto |

## 5.2 Creating a Customer Account

### From a Converted Lead
1. On the lead detail page, click **Convert to Customer**
2. Review and confirm account details
3. Choose account type (Individual or Business)
4. Click **Create Account**

### Direct Account Creation
1. Navigate to **Customers** → **+ New Customer**
2. Select account type
3. Complete required fields:
   - Account name
   - Primary contact
   - Contact information
4. Click **Save**

## 5.3 Customer Detail Page

The customer detail page provides a comprehensive view:

### Overview Tab
- Account summary
- Active policies overview
- Recent activity
- Key contacts

### Policies Tab
- All policies (active and historical)
- Premium summary
- Coverage details
- Renewal dates

### Quotes Tab
- Pending quotes
- Quote history
- Comparison tools

### Documents Tab
- Uploaded documents
- AI-extracted data
- Document categories

### Tasks Tab
- Account-related tasks
- Automated reminders
- Service requests

### Communications Tab
- Call log
- Email history
- SMS conversations
- Notes

### Household/Contacts Tab
- Related individuals
- Role assignments
- Contact preferences

## 5.4 Account Actions

| Action | Purpose | How To |
|--------|---------|--------|
| **Add Policy** | Link new policy to account | Click "+ Add Policy" |
| **Create Quote** | Start new quote | Click "+ New Quote" |
| **Log Activity** | Record interaction | Click "Log Call/Email" |
| **Upload Document** | Add supporting docs | Click "Upload" |
| **Invite to Portal** | Grant portal access | Click "Invite to Portal" |
| **Run Coverage Analysis** | Find gaps | Click "Analyze Coverage" |

## 5.5 Duplicate Detection

InsureFlow automatically identifies potential duplicate accounts:

1. Navigate to **CRM** → **Duplicate Detection**
2. Review flagged duplicates
3. Compare records side-by-side
4. Choose to **Merge** or **Mark Not Duplicate**

**Merge Process:**
1. Select the primary (surviving) record
2. Review data from both records
3. Choose which values to keep
4. Click **Merge Records**

---

# 6. Policy Management

## 6.1 Policy Lifecycle

```
PENDING ─→ ACTIVE ─→ RENEWAL PERIOD ─→ RENEWED/EXPIRED/CANCELLED
```

| Status | Description |
|--------|-------------|
| **Pending** | Application submitted, awaiting binding |
| **Active** | Coverage in force |
| **Expired** | Term ended without renewal |
| **Cancelled** | Terminated before expiration |
| **Renewed** | Continued for new term |

## 6.2 Policy Types

| Type | Common Coverages | Key Data Points |
|------|-----------------|-----------------|
| **Auto** | Liability, Collision, Comprehensive | Vehicles, Drivers, VINs |
| **Home** | Dwelling, Personal Property, Liability | Address, Construction, Square Feet |
| **Commercial** | GL, Property, Products | Operations, Revenue, Locations |
| **Life** | Term, Whole, Universal | Face Amount, Beneficiaries |
| **Health** | Medical, Dental, Vision | Plan Type, Deductibles |

## 6.3 Creating a Policy

### Manual Entry
1. Navigate to **Policies** → **+ Add Policy**
2. Select the account
3. Choose policy type
4. Enter policy details:
   - Policy number
   - Carrier
   - Effective and expiration dates
   - Premium
   - Coverage details
5. Click **Save Policy**

### From Accepted Quote
1. On the quote detail page, click **Bind Policy**
2. Confirm policy number and dates
3. Verify coverage matches quote
4. Click **Create Policy**

### From Canopy Import
1. Navigate to **Canopy Import**
2. Click **Connect Account**
3. Customer authorizes carrier access
4. Policies auto-import with full details

## 6.4 Policy Detail Page

### Policy Information
- Policy number, carrier, type
- Effective and expiration dates
- Status and premium
- Agent assignment

### Coverage Details
- Coverage types and limits
- Deductibles
- Endorsements

### Documents
- Policy documents
- Dec pages
- Endorsements
- Claims documentation

### Claims History
- Claim numbers and dates
- Claim types and amounts
- Status tracking

### Activity Log
- Policy changes
- Communications
- Service requests

## 6.5 Policy Tasks

InsureFlow automatically generates policy-related tasks:

| Task Type | Trigger | Timing |
|-----------|---------|--------|
| **Renewal Review** | Approaching expiration | 90 days prior |
| **Renewal Contact** | Review complete | 60 days prior |
| **Final Follow-up** | No response | 30 days prior |
| **Payment Reminder** | Payment due | 7 days prior |
| **Annual Review** | Policy anniversary | 30 days after |

---

# 7. Quote Management

## 7.1 Creating a Quote

### AI-Assisted Quote (Recommended)
1. Navigate to **Quotes** → **+ New Quote**
2. Select the customer account
3. Click **Use AI Assistant**
4. Upload relevant documents (dec pages, applications)
5. AI extracts coverage details
6. Review and adjust as needed
7. Click **Generate Quote**

### Manual Quote Entry
1. Navigate to **Quotes** → **+ New Quote**
2. Select customer and policy type
3. Enter carrier and coverage details:
   - Coverage types
   - Limits and deductibles
   - Premium
   - Effective dates
4. Click **Save Quote**

## 7.2 Quote Scoring

Every quote receives an automatic score (0-100) based on:

| Dimension | Points | What It Measures |
|-----------|--------|------------------|
| **Price Score** | 0-25 | Premium competitiveness |
| **Coverage Completeness** | 0-25 | Comprehensiveness of coverage |
| **Carrier Rating** | 0-20 | Carrier A.M. Best rating |
| **Deductible Score** | 0-15 | Appropriateness of deductibles |
| **Value Score** | 0-15 | Overall value proposition |

**Coverage Limit Adequacy Checks:**
- System compares limits against configured minimums
- Warnings appear for below-minimum coverages
- Critical coverage gaps are flagged in red

## 7.3 Quote Comparison

To compare multiple quotes:

1. Navigate to the customer's **Quotes** tab
2. Select 2-4 quotes to compare
3. Click **Compare Selected**
4. Review side-by-side comparison:
   - Coverage differences
   - Premium comparison
   - Score breakdown
   - AI recommendations

## 7.4 Sending a Quote

1. Open the quote detail page
2. Click **Send to Customer**
3. Choose delivery method:
   - Email (default)
   - Download PDF
   - Portal link
4. Customize the message if needed
5. Click **Send**
6. Quote status updates to "Sent"

## 7.5 Quote Follow-Up

InsureFlow tracks quote status and generates follow-up tasks:

| Status | Next Action | Timing |
|--------|-------------|--------|
| **Sent** | Initial follow-up | 3 days after send |
| **No Response** | Second follow-up | 7 days after send |
| **Under Review** | Check-in call | 5 days after acknowledged |
| **Aging** | Final follow-up | 21 days, at risk of expiring |

## 7.6 Converting Quote to Policy

When the customer accepts:

1. Open the quote detail page
2. Update status to **Accepted**
3. Click **Bind Policy**
4. Enter policy number from carrier
5. Confirm effective date
6. Click **Create Policy**

---

# 8. Renewal Management

## 8.1 Renewal Pipeline

The renewal process follows a structured workflow:

```
90 Days Out    60 Days Out    30 Days Out    Expiration
     │              │              │              │
   Review        Contact        Follow-up      Decision
   Needed        Customer       if Needed      Point
```

## 8.2 Accessing Renewals

1. Navigate to **CRM** → **Renewals**
2. View renewals by timeframe:
   - **Upcoming** (next 90 days)
   - **This Month**
   - **Overdue** (past expiration)

## 8.3 Renewal Workflow

### Step 1: Review (90 Days Prior)
1. Open the renewal in the queue
2. Review current coverage and premium
3. Check for life changes:
   - New vehicles or drivers
   - Property changes
   - Coverage gaps
4. Note any changes needed

### Step 2: Contact Customer (60 Days Prior)
1. Reach out to review coverage
2. Discuss any changes
3. Present renewal options:
   - Renew as-is
   - Adjust coverage
   - Shop for alternatives
4. Log the conversation

### Step 3: Process Decision
- **If Renewing**: Confirm with carrier, update policy
- **If Re-shopping**: Create quotes from other carriers
- **If Cancelling**: Document reason, consider retention offer

## 8.4 Renewal Risk Scoring

InsureFlow automatically scores renewal risk:

| Risk Level | Score | Action |
|------------|-------|--------|
| **Low** | 0-32 | Standard renewal process |
| **Medium** | 33-65 | Proactive outreach recommended |
| **High** | 66-85 | Retention intervention needed |
| **Critical** | 86-100 | Immediate attention required |

**Risk Factors Considered:**
- Days since last contact
- Claims history
- Payment history
- Policy tenure
- Number of policies (bundling)
- Premium changes

## 8.5 AO Renewals (Advanced Outsourced)

For high-volume renewal processing:

1. Navigate to **AO Renewals**
2. View assigned renewals in your queue
3. Use batch actions for efficiency:
   - Bulk status updates
   - Mass email sends
   - Task assignment
4. Track progress in analytics dashboard

---

# 9. Document Intelligence

## 9.1 Document Upload & Analysis

InsureFlow's AI-powered document intelligence extracts and analyzes insurance documents automatically.

### Uploading Documents

1. Navigate to **LEWI AI** → **Document Intelligence**
2. Click **Upload** or drag-and-drop files
3. Supported formats:
   - PDF (preferred)
   - Images (PNG, JPG)
   - Word documents (DOCX)

### What Happens After Upload

1. **OCR Processing**: Text extracted from document
2. **Classification**: Document type identified (policy, quote, application, COI)
3. **Data Extraction**: Key fields pulled automatically
4. **PII Redaction**: Sensitive data masked before AI processing
5. **Task Generation**: Suggested follow-up actions created

## 9.2 Document Types Recognized

| Document Type | Data Extracted |
|---------------|----------------|
| **Declaration Page** | Carrier, policy number, coverages, premium, dates |
| **Application** | Insured info, coverage requests, risk details |
| **Quote** | Premium, coverages, carrier, effective date |
| **Certificate of Insurance (COI)** | Certificate holder, coverages, limits |
| **Claims Document** | Claim number, date of loss, description |
| **Loss Run** | Claims history, dates, amounts |
| **Endorsement** | Changes to coverage, effective date |

## 9.3 Document Analysis Results

After processing, you'll see:

1. **Extracted Data**: Fields with values pulled from document
2. **Confidence Scores**: How certain the AI is about each extraction
3. **Evidence Highlights**: Click to see where in the document data came from
4. **Suggested Actions**: Tasks the AI recommends based on content

### Reviewing Extraction Results
1. Click on any extracted field
2. View source location in document
3. Correct any errors
4. Approve or reject extraction

## 9.4 AI Task Generation

Based on document analysis, InsureFlow suggests tasks:

| Document Content | Suggested Task |
|------------------|----------------|
| Upcoming expiration | "Schedule renewal review" |
| Coverage gap identified | "Discuss additional coverage" |
| Claim mentioned | "Follow up on claim status" |
| New vehicle listed | "Update policy with new vehicle" |
| Address change | "Verify and update address" |

**Approving Suggested Tasks:**
1. Review AI-suggested task
2. Edit if needed (description, assignee, due date)
3. Click **Approve** to create the task
4. Or click **Dismiss** if not needed

## 9.5 Document Q&A

Ask questions about uploaded documents:

1. Open a document in Document Intelligence
2. Click **Ask AI**
3. Type your question, e.g.:
   - "What are the liability limits?"
   - "When does this policy expire?"
   - "Are there any exclusions for flood damage?"
4. AI responds with answer and source citation

## 9.6 Extraction Review Queue

For documents requiring manual review:

1. Navigate to **ACORD Forms** → **Extraction Review**
2. View documents flagged for review
3. Correct any extraction errors
4. Approve and save corrections

---

# 10. ACORD Form Automation

## 10.1 What is ACORD Form Automation?

ACORD (Association for Cooperative Operations Research and Development) forms are standardized insurance documents. InsureFlow automates the creation and filling of these forms.

## 10.2 Available ACORD Forms

| Form Number | Name | Use Case |
|-------------|------|----------|
| ACORD 25 | Certificate of Liability Insurance | COI requests |
| ACORD 35 | Cancellation Request | Policy cancellation |
| ACORD 80 | Homeowners Application | New home business |
| ACORD 125 | Commercial Insurance Application | Commercial accounts |
| ACORD 126 | Commercial General Liability Section | GL coverage |
| ACORD 130 | Workers Compensation Application | WC coverage |
| ACORD 140 | Property Section | Commercial property |

## 10.3 ACORD Templates

### Viewing Templates
1. Navigate to **ACORD Forms** → **ACORD Templates**
2. Browse available templates by type
3. View field inventory and section structure

### Template Versioning
- Templates track version history
- Previous versions remain accessible
- Updates don't affect completed forms

## 10.4 Creating an ACORD Form

### Method 1: From Customer Account
1. Open customer detail page
2. Click **+ Create ACORD Form**
3. Select form type
4. Form pre-populates with customer data
5. Complete remaining fields
6. Save and generate PDF

### Method 2: Direct Creation
1. Navigate to **ACORD Forms** → **Forms**
2. Click **+ New Form**
3. Select template
4. Select customer account
5. Form pulls account data automatically
6. Complete and generate

## 10.5 Form Editor

The form editor organizes fields into sections:

### Section Navigation
- Click section tabs to navigate
- Completion percentage shown per section
- Required fields marked with asterisk

### Field Types
| Type | Description |
|------|-------------|
| **Text** | Free-form text entry |
| **Date** | Date picker |
| **Checkbox** | Yes/No selection |
| **Select** | Dropdown options |
| **Signature** | Signature field |

### Auto-Save
- Forms auto-save every 30 seconds
- Manual save with **Save** button
- Exit without losing work

## 10.6 Generating PDFs

1. Complete all required fields
2. Click **Generate PDF**
3. PDF created using your entries
4. Download or send directly

## 10.7 E-Signature Integration

InsureFlow integrates with Dropbox Sign for electronic signatures:

1. Complete the ACORD form
2. Click **Send for Signature**
3. Add signers (name, email, role)
4. Position signature fields on document
5. Set expiration (optional)
6. Click **Send**

**Tracking Signatures:**
- View status: Sent, Viewed, Signed
- Receive notifications on signing
- Download signed document when complete

## 10.8 COI Generator

For Certificate of Insurance requests:

1. Navigate to **ACORD Forms** → **COI Generator**
2. Select the policy
3. Enter certificate holder information
4. Specify coverage requirements
5. Generate and send

## 10.9 Intake Forms

Create custom intake forms for customers to complete:

### Building an Intake Form
1. Navigate to **ACORD Forms** → **Intake Templates**
2. Click **+ New Template**
3. Drag-and-drop question types:
   - Text fields
   - Multiple choice
   - Date pickers
   - File uploads
   - Signature capture
4. Configure conditional logic
5. Save template

### Sending Intake Forms
1. Open customer account
2. Click **Send Intake Form**
3. Select template
4. Customer receives link to complete
5. Responses sync to account automatically

---

# 11. Task Management

## 11.1 Task Overview

Tasks keep your work organized and ensure nothing falls through the cracks.

### Task Properties
| Property | Description |
|----------|-------------|
| **Title** | Brief description of the task |
| **Description** | Detailed instructions |
| **Status** | Pending, In Progress, Completed, Cancelled |
| **Priority** | Low, Medium, High, Urgent |
| **Due Date** | When it should be completed |
| **Assigned To** | Team member responsible |
| **Entity** | Related lead, account, policy, or quote |

## 11.2 Viewing Tasks

Navigate to **Command Center** → **Tasks** to access:

### My Tasks (Default)
- Tasks assigned to you
- Filtered by status
- Sorted by due date

### Kanban Board
- Visual pipeline view
- Drag-and-drop to change status
- Grouped by status columns

### Calendar View
- Tasks on calendar by due date
- Click date to see day's tasks
- Create tasks directly on calendar

### Analytics
- Completion rates
- Overdue trends
- Team performance

## 11.3 Creating Tasks

### Quick Add
1. Use the task bar at the top of any page
2. Enter task title
3. Press Enter to create

### Full Task Form
1. Click **+ New Task**
2. Complete all fields:
   - Title and description
   - Priority and due date
   - Assign to team member
   - Link to entity (optional)
3. Click **Save**

### From AI Suggestions
1. When AI suggests a task (from document analysis)
2. Review the suggestion
3. Edit if needed
4. Click **Approve** to create

## 11.4 Working with Tasks

### Updating Status
1. Open task detail
2. Click status dropdown
3. Select new status

Or in Kanban view:
1. Drag task card
2. Drop in new status column

### Task Actions
| Action | How To |
|--------|--------|
| **Add Comment** | Click "Add Comment" on task detail |
| **Attach Document** | Click "Attach" and select file |
| **Reassign** | Change "Assigned To" field |
| **Reschedule** | Update due date |
| **Mark Complete** | Set status to "Completed" |

## 11.5 Task Templates

Save time with reusable task templates:

### Creating a Template
1. Navigate to **Command Center** → **Task Templates**
2. Click **+ New Template**
3. Define template:
   - Title pattern
   - Default description
   - Default priority
   - Typical timeline
4. Save template

### Using a Template
1. Click **+ New Task from Template**
2. Select template
3. Customize as needed
4. Create task

## 11.6 AI-Generated Tasks

InsureFlow automatically generates tasks based on:

| Trigger | Generated Task |
|---------|----------------|
| **New Lead** | "Contact new lead within 24 hours" |
| **Quote Sent** | "Follow up on quote in 3 days" |
| **Policy Expiring** | "Review renewal 90 days prior" |
| **Document Analyzed** | Based on document content |
| **At-Risk Customer** | "Retention outreach for [customer]" |
| **Coverage Gap Found** | "Discuss [coverage type] with [customer]" |

---

# 12. Communications Center

## 12.1 Communication Types

InsureFlow tracks all customer communications:

| Type | Description | Logged How |
|------|-------------|------------|
| **Call** | Phone conversations | Click "Log Call" |
| **Email** | Email correspondence | Auto-logged or manual |
| **SMS** | Text messages | Through SMS page |
| **Note** | Internal notes | Click "Add Note" |
| **Meeting** | In-person or virtual meetings | Click "Log Meeting" |

## 12.2 Logging a Call

1. Open customer/lead detail
2. Click **Log Call**
3. Enter call details:
   - Duration
   - Direction (inbound/outbound)
   - Subject
   - Summary/notes
4. Click **Save**

## 12.3 Sending Email

### From Customer Detail
1. Open customer detail
2. Click **Send Email**
3. Compose message:
   - Subject line
   - Email body (supports formatting)
   - Attachments (optional)
4. Click **Send**

### AI-Assisted Email
1. Click **Compose with AI**
2. Describe what you want to communicate
3. AI generates draft
4. Review and edit
5. Send

## 12.4 SMS Messaging

1. Navigate to **CRM** → **SMS**
2. Select customer or enter phone number
3. Type message (160 char limit for single SMS)
4. Click **Send**

**SMS Best Practices:**
- Keep messages brief and professional
- Include your name and agency
- Respect opt-out requests
- Don't send sensitive information via SMS

## 12.5 Call Center Features

Navigate to **CRM** → **Calls** for:

- Call history and logs
- Click-to-call functionality
- Call recordings (if enabled)
- Call outcome tracking

## 12.6 Communication Timeline

Every customer and lead has a communication timeline showing all interactions in chronological order. Access it via the **Communications** tab on the detail page.

---

# 13. Canopy Integration

## 13.1 What is Canopy?

Canopy Connect allows InsureFlow to read and write policy data directly from insurance carriers, eliminating manual data entry.

## 13.2 Connecting Customer Accounts

1. Navigate to **Canopy Import**
2. Click **+ Connect New Account**
3. Select the customer account
4. Choose carrier(s) to connect
5. Customer receives link to authorize
6. Once authorized, policies import automatically

## 13.3 What Imports from Canopy

| Data Type | Details |
|-----------|---------|
| **Policy Information** | Number, type, carrier, dates |
| **Coverages** | Limits, deductibles, coverage types |
| **Vehicles** | VIN, year/make/model, usage |
| **Drivers** | Name, DOB, license info |
| **Property** | Address, construction details |
| **Premium** | Current and previous |
| **Claims** | History and status |

## 13.4 Policy Monitoring

Canopy monitoring automatically detects changes:

1. Policies refresh every 30 days
2. Changes flagged in dashboard
3. Alerts for:
   - Coverage changes
   - Premium increases/decreases
   - Carrier changes
   - Cancellations

**Setting Up Monitoring:**
1. Open customer detail
2. Click **Enable Monitoring**
3. Select policies to monitor
4. Monitoring begins automatically

## 13.5 Servicing Actions (2-Way Sync)

Write back to carriers through Canopy:

| Action | What It Does |
|--------|--------------|
| **Add Vehicle** | Add new vehicle to auto policy |
| **Remove Vehicle** | Remove vehicle from policy |
| **Add Driver** | Add new driver |
| **Remove Driver** | Remove driver |
| **Update Coverage** | Change coverage limits |
| **Request ID Card** | Get new insurance ID cards |
| **Request Dec Page** | Get current declarations |

### Performing a Servicing Action
1. Open policy detail
2. Click **Servicing Actions**
3. Select action type
4. Enter required information
5. Submit request
6. Track status in activity log

## 13.6 Commercial Lines Support

Canopy supports commercial policies including:

- **Fleet Vehicles**: Commercial auto fleet management
- **General Liability**: GL and BOP policies
- **Workers Compensation**: WC policies
- **Business Locations**: Multiple location tracking

---

# 14. AI Assistant (LEWI)

## 14.1 What is LEWI?

LEWI (Lewis Insurance AI) is your intelligent assistant, available throughout InsureFlow to help with:

- Answering questions about policies
- Extracting data from documents
- Generating emails and communications
- Finding information across your accounts
- Providing recommendations

## 14.2 Accessing LEWI

- **Floating Button**: Blue AI button in bottom-right corner
- **AI Hub**: Navigate to **LEWI AI** → **AI Hub**
- **Context Menus**: "Ask AI" options throughout the app

## 14.3 Conversation Examples

**Policy Questions:**
```
You: "What are the liability limits on John Smith's auto policy?"
LEWI: "John Smith's auto policy #PA-123456 has the following
      liability limits: $100,000/$300,000 bodily injury and
      $50,000 property damage."
```

**Document Analysis:**
```
You: [Upload dec page]
LEWI: "I've analyzed the declaration page. Here's what I found:
      - Carrier: Acme Insurance
      - Policy Number: HO-789012
      - Coverage A (Dwelling): $350,000
      - Coverage B (Other Structures): $35,000
      - Coverage C (Personal Property): $175,000
      - Premium: $1,850/year"
```

**Email Assistance:**
```
You: "Help me write a renewal follow-up email for Jane Doe"
LEWI: "Here's a draft renewal follow-up for Jane Doe:

      Subject: Your Homeowners Policy Renewal - Action Needed

      Dear Jane,

      I wanted to follow up on your upcoming homeowners policy
      renewal. Your current policy expires on [date] and I want
      to ensure you have uninterrupted coverage..."
```

## 14.4 Knowledge Base

LEWI draws from InsureFlow's knowledge base for insurance-specific answers:

- Coverage explanations
- Claims procedures
- Regulatory requirements
- Product information
- FAQs

### Adding to Knowledge Base
1. Navigate to **Command Center** → **Knowledge Manager**
2. Click **+ New Entry**
3. Enter:
   - Title
   - Content (markdown supported)
   - Category
   - Tags
4. Save entry

## 14.5 AI Module Builder

Create custom AI modules for specific workflows:

1. Navigate to **LEWI AI** → **Module Builder**
2. Click **+ New Module**
3. Configure:
   - Name and description
   - Input fields
   - AI instructions (prompt)
   - Output format
4. Test the module
5. Publish for team use

---

# 15. Predictive Analytics & Retention

## 15.1 Overview

InsureFlow's predictive analytics help you identify and retain at-risk customers before they leave.

## 15.2 Accessing Retention Dashboard

Navigate to **Command Center** → **Retention**

### Key Metrics Display
| Metric | Description |
|--------|-------------|
| **Churn Rate** | % of policies lost in period |
| **At-Risk Count** | Customers above churn threshold |
| **Risk Value** | Premium at stake |
| **Retention Rate** | % of customers retained |

## 15.3 Understanding Risk Scores

Every customer receives a risk score (0-100):

| Score | Risk Level | Action |
|-------|------------|--------|
| **0-32** | Low | Normal service |
| **33-65** | Medium | Proactive touch-point |
| **66-85** | High | Retention intervention |
| **86-100** | Critical | Immediate escalation |

### Risk Factors
LEWI analyzes these factors to calculate risk:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Contact Recency** | 25% | Days since last contact |
| **Claims History** | 20% | Recent claims filed |
| **Payment Reliability** | 20% | Payment history |
| **Tenure** | 15% | Length of relationship |
| **Bundle Count** | 10% | Number of policies |
| **Premium Changes** | 10% | Recent rate changes |

## 15.4 Working the At-Risk List

1. Review at-risk customers on dashboard
2. Click customer to see full risk profile
3. View **Top Risk Factors** for this customer
4. Schedule retention intervention
5. Document outcome

### Intervention Types
| Type | When to Use |
|------|-------------|
| **Proactive Call** | Medium risk, need to reconnect |
| **Coverage Review** | Premium increased, may need adjustment |
| **Loyalty Offer** | Long-term customer considering leaving |
| **Rate Freeze** | Price-sensitive customer |
| **Personal Visit** | High-value, critical risk |
| **Special Discount** | Competitive offer in market |

## 15.5 Recording Intervention Outcomes

After attempting retention:

1. Open the intervention record
2. Click **Record Outcome**
3. Select result:
   - **Successful**: Customer retained
   - **Partial**: Retained some policies
   - **Unsuccessful**: Customer left
4. Add notes about what worked/didn't
5. Save for future learning

## 15.6 Predictive Analytics Page

Navigate to **Command Center** → **Predictive Analytics** for deeper analysis:

- Churn probability distribution
- Risk trend over time
- Intervention effectiveness
- Customer lifetime value predictions

---

# 16. Coverage Gap Analysis

## 16.1 What is Coverage Gap Analysis?

Coverage gap analysis identifies cross-sell opportunities by finding missing coverages based on the customer's profile.

## 16.2 How It Works

InsureFlow applies rules to detect gaps:

| Rule | Gap Detected |
|------|--------------|
| Auto without Home | Homeowner drives but no home policy |
| Home without Auto | Owns home but no auto policy |
| High Liability without Umbrella | >$300K liability, no umbrella |
| Single Policy | Only one policy (bundling opportunity) |
| Commercial without Cyber | Business without cyber coverage |
| Commercial without EPLI | Business without employment practices coverage |

## 16.3 Running Coverage Gap Analysis

### For Single Customer
1. Open customer detail page
2. Click **Analyze Coverage**
3. View identified gaps
4. Create follow-up tasks

### Batch Analysis
1. Navigate to **Command Center** → **Coverage Gap Analysis**
2. Analysis runs automatically on all accounts
3. View opportunities sorted by potential revenue

## 16.4 Working Coverage Opportunities

Each opportunity tracks through a workflow:

```
NEW ─→ CONTACTED ─→ QUOTED ─→ CONVERTED
                             │
                             └→ DISMISSED
```

### Updating Opportunity Status
1. Open the opportunity
2. Log contact attempt
3. Update status as you progress
4. If converted, link to new policy
5. If dismissed, document reason

## 16.5 Coverage Gap Dashboard Metrics

| Metric | Description |
|--------|-------------|
| **Total Opportunities** | All identified gaps |
| **Open Opportunities** | Not yet contacted |
| **Potential Revenue** | Estimated premium from gaps |
| **Conversion Rate** | % of gaps converted to sales |

---

# 17. Client Portal

## 17.1 What is the Client Portal?

The client portal provides self-service access for your customers to:

- View their policies
- Download ID cards
- Request service changes
- Upload documents
- Submit service requests

## 17.2 Inviting Customers to Portal

1. Open customer detail page
2. Click **Invite to Portal**
3. Verify email address
4. Click **Send Invitation**
5. Customer receives email with access link

## 17.3 Portal Features (Customer View)

### Dashboard
- Active policies overview
- Upcoming renewals
- Recent activity

### Policies
- View policy details
- Coverage summaries
- Premium information
- Download documents

### ID Cards
- View digital ID cards
- Download as PDF
- Add to Apple Wallet (coming soon)

### Documents
- View uploaded documents
- Upload new documents
- Track document status

### Service Requests
- Submit new requests
- Track request status
- Communicate with agency

## 17.4 Document Collection Portal

For collecting required documents from customers:

1. Create document collection packet
2. Specify required documents
3. Generate portal link
4. Send to customer
5. Customer uploads documents
6. Track completion status

---

# 18. CEO Weekly Digest

## 18.1 What is the CEO Digest?

An automated weekly report delivered every Monday morning with:

- Key performance metrics
- Week-over-week comparisons
- AI-generated insights
- Critical alerts

## 18.2 Configuring the Digest

Navigate to **Settings** → **Admin** → **Digest Settings**

### Schedule Settings
| Setting | Options |
|---------|---------|
| **Day** | Sunday through Saturday |
| **Time** | Select hour in your timezone |
| **Timezone** | US timezones supported |

### Recipients
- Add email addresses for report delivery
- Multiple recipients supported

### Alert Thresholds
Configure when to trigger alerts:

| Threshold | Default | Description |
|-----------|---------|-------------|
| **Leads Drop** | 20% | Alert if leads down this much |
| **Quotes Drop** | 20% | Alert if quotes down this much |
| **Overdue Tasks** | 10 | Alert if this many overdue |
| **Aging Quotes** | 14 days | Flag quotes older than this |

## 18.3 Digest Contents

Each digest includes:

### KPIs Section
- New leads this week vs. last week
- Quotes created and sent
- Policies bound
- Premium written
- Tasks completed vs. overdue

### Alerts Section
- Critical items needing attention
- Threshold violations
- System issues

### AI Insights
- Summary of week's activity
- Recommended focus areas
- Team performance highlights

## 18.4 Viewing Digest History

Navigate to **Settings** → **Admin** → **Digest History**

- View past digests
- Check delivery status
- Review AI-generated content
- Download previous reports

## 18.5 Triggering Manual Digest

For testing or ad-hoc reports:

1. Go to Digest Settings
2. Click **Send Test Digest**
3. Digest generates and sends immediately

---

# 19. Reports & Analytics

## 19.1 Analytics Dashboard

Navigate to **Command Center** → **Analytics**

### Revenue Trends
- Monthly revenue over time
- Configurable timeframe (3m, 6m, 12m, 24m)
- Growth rate tracking

### Policy Volume
- New policies per month
- By line of business
- Comparison to prior periods

### Customer Growth
- New customers over time
- Retention by cohort
- Acquisition trends

## 19.2 Lead Analytics

Navigate to **Leads** → **Analytics**

### Conversion Funnel
- Stage-by-stage breakdown
- Drop-off rates
- Conversion percentages

### Source Performance
- Leads by source
- Conversion rate by source
- Revenue by source

### Producer Performance
- Leads per producer
- Conversion rates
- Response times
- Revenue attribution

## 19.3 Financial Reports

Navigate to **Command Center** → **Financial**

- Revenue by line of business
- Commission tracking
- Premium volume
- Retention value

## 19.4 Creating Custom Reports

1. Navigate to **Command Center** → **Reports**
2. Click **+ New Report**
3. Select report type:
   - Lead Report
   - Policy Report
   - Revenue Report
   - Activity Report
4. Configure filters and columns
5. Save or download

---

# 20. Administrator Functions

## 20.1 User Management

Navigate to **Settings** → **Admin**

### Adding New Users
1. Click **+ Add User**
2. Enter:
   - Email address
   - Full name
   - Role (Producer, CSR, Admin)
3. Click **Send Invitation**
4. User receives email to set password

### Editing Users
1. Click on user name
2. Modify role or permissions
3. Save changes

### Deactivating Users
1. Click on user name
2. Click **Deactivate**
3. Confirm action
4. User loses access immediately

## 20.2 Workspace Settings

Configure agency-level settings:

| Setting | Description |
|---------|-------------|
| **Agency Name** | Your agency name |
| **Branding** | Logo and colors |
| **Default Settings** | Task priorities, follow-up timing |
| **Email Templates** | Default email content |

## 20.3 Integration Settings

Manage external integrations:

- **Canopy**: API credentials
- **Email**: Sending domain
- **SMS**: Twilio configuration
- **eSignature**: Dropbox Sign API

## 20.4 Data Management

### Import Data
- Bulk lead import (CSV)
- Policy import
- Customer import

### Export Data
- Export to CSV/Excel
- Scheduled exports
- API access

## 20.5 Audit Logs

View system activity:

1. Navigate to **Admin** → **Audit Logs**
2. Filter by:
   - User
   - Action type
   - Date range
   - Entity type
3. Review detailed activity

---

# 21. Insurance Workflows

## 21.1 New Business Workflow

```
Step 1: Lead Capture
  └─→ Receive lead (web form, referral, call)
  └─→ Enter in InsureFlow
  └─→ Lead auto-scored

Step 2: Initial Contact
  └─→ Contact within 24 hours
  └─→ Log communication
  └─→ Update status to "Contacted"

Step 3: Qualification
  └─→ Identify insurance needs
  └─→ Confirm decision timeline
  └─→ Gather basic info
  └─→ Update status to "Qualified"

Step 4: Information Gathering
  └─→ Collect detailed info for quote
  └─→ Upload documents for AI extraction
  └─→ Review extracted data

Step 5: Quoting
  └─→ Create quotes in system
  └─→ Compare options (scoring)
  └─→ Select best options for customer

Step 6: Quote Presentation
  └─→ Present to customer
  └─→ Send quote via email/portal
  └─→ Update status to "Quoted"

Step 7: Follow-Up
  └─→ Follow up per schedule
  └─→ Address questions
  └─→ Overcome objections

Step 8: Close
  └─→ Customer accepts → Bind policy
  └─→ Customer declines → Document reason
  └─→ Create policy record
```

## 21.2 Renewal Workflow

```
Day 90 Before Expiration: Review
  └─→ Task auto-generated
  └─→ Review current coverage
  └─→ Check for life changes
  └─→ Note any adjustments needed

Day 60: Customer Contact
  └─→ Contact customer for review
  └─→ Discuss changes/options
  └─→ Get renewal direction

Day 30: Process
  └─→ If renewing: Confirm with carrier
  └─→ If shopping: Create alternate quotes
  └─→ If cancelling: Offer retention

Day 0-7: Finalize
  └─→ Ensure coverage bound
  └─→ Update policy in system
  └─→ Send confirmation
```

## 21.3 Service Request Workflow

```
Step 1: Request Received
  └─→ Via phone, email, portal, or walk-in
  └─→ Create task for request
  └─→ Acknowledge receipt

Step 2: Process Request
  └─→ Gather necessary information
  └─→ Contact carrier if needed
  └─→ Make changes in system

Step 3: Confirm & Document
  └─→ Confirm change with customer
  └─→ Update records
  └─→ Log communication
  └─→ Close task
```

## 21.4 Claims Assistance Workflow

```
Step 1: Initial Report
  └─→ Customer reports claim
  └─→ Gather initial details
  └─→ Log in communications
  └─→ Create task for follow-up

Step 2: Carrier Report
  └─→ Report to carrier
  └─→ Obtain claim number
  └─→ Document in system

Step 3: Customer Support
  └─→ Provide claim number
  └─→ Explain process
  └─→ Schedule follow-up

Step 4: Follow Through
  └─→ Check claim status
  └─→ Assist with questions
  └─→ Advocate if needed
  └─→ Close when resolved
```

## 21.5 COI Request Workflow

```
Step 1: Request Received
  └─→ Identify policy for COI
  └─→ Get certificate holder info
  └─→ Note any special requirements

Step 2: Generate COI
  └─→ Use COI Generator
  └─→ Select policy
  └─→ Enter holder details
  └─→ Generate document

Step 3: Deliver
  └─→ Send to requesting party
  └─→ Send copy to customer
  └─→ Log in communications
```

## 21.6 Document Collection Workflow

```
Step 1: Identify Needs
  └─→ Determine required documents
  └─→ Create collection packet

Step 2: Request Documents
  └─→ Send portal link to customer
  └─→ Specify what's needed

Step 3: Track Progress
  └─→ Monitor upload status
  └─→ Send reminders as needed

Step 4: Process Documents
  └─→ Run AI analysis
  └─→ Extract relevant data
  └─→ Approve or request replacements
```

---

# 22. Quick Reference Guide

## 22.1 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Global search |
| `Ctrl/Cmd + N` | New lead |
| `Ctrl/Cmd + T` | New task |
| `Escape` | Close modal/panel |

## 22.2 Status Quick Reference

### Lead Statuses
| Status | Color | Meaning |
|--------|-------|---------|
| New | Blue | Not yet contacted |
| Contacted | Yellow | Initial contact made |
| Qualified | Purple | Confirmed interest |
| Quoted | Orange | Quote delivered |
| Won | Green | Became customer |
| Lost | Red | Did not purchase |
| Nurturing | Gray | Future potential |

### Policy Statuses
| Status | Color | Meaning |
|--------|-------|---------|
| Pending | Yellow | Awaiting binding |
| Active | Green | Coverage in force |
| Expired | Red | Term ended |
| Cancelled | Red | Terminated early |

### Task Statuses
| Status | Color | Meaning |
|--------|-------|---------|
| Pending | Gray | Not started |
| In Progress | Blue | Being worked |
| Completed | Green | Done |
| Cancelled | Red | No longer needed |

## 22.3 Common Actions Cheat Sheet

| I want to... | Go to... | Click... |
|--------------|----------|----------|
| Add a new lead | Leads | + New Lead |
| Log a call | Customer/Lead detail | Log Call |
| Send an email | Customer detail | Send Email |
| Create a quote | Quotes | + New Quote |
| Upload a document | Customer detail, Documents tab | Upload |
| Create a task | Tasks or any detail page | + New Task |
| Generate COI | ACORD Forms | COI Generator |
| Check renewals | CRM | Renewals |
| Run coverage analysis | Customer detail | Analyze Coverage |
| Invite to portal | Customer detail | Invite to Portal |

## 22.4 Navigation Quick Reference

| Page | URL Path | Purpose |
|------|----------|---------|
| Dashboard | /dashboard | Daily command center |
| Leads | /leads | Sales pipeline |
| Customers | /customers | Account management |
| Policies | /policies | Policy management |
| Quotes | /quotes/new | Quote creation |
| Renewals | /renewals | Renewal management |
| Tasks | /tasks | Task management |
| AI Hub | /ai-hub | AI assistant |
| ACORD Forms | /acord-forms | Form management |
| Retention | /retention | Churn prevention |
| Analytics | /analytics | Reports |

---

# 23. Troubleshooting

## 23.1 Common Issues

### Can't Log In
1. Verify email address is correct
2. Check caps lock
3. Try "Forgot Password"
4. Contact admin if persists

### Page Won't Load
1. Refresh the page (Ctrl/Cmd + R)
2. Clear browser cache
3. Try a different browser
4. Check internet connection

### Data Not Showing
1. Check your filters
2. Verify date range
3. Ensure you have access
4. Refresh the page

### Document Upload Failed
1. Check file size (max 10MB)
2. Verify file format (PDF, JPG, PNG, DOCX)
3. Try a different browser
4. Contact support if persists

### Canopy Not Syncing
1. Check customer authorization status
2. Verify carrier is supported
3. Try refreshing connection
4. Check monitoring status

### Email Not Sending
1. Verify recipient email
2. Check spam/junk folder
3. Ensure email limit not reached
4. Contact admin

## 23.2 Getting Help

### In-App Resources
- Click **?** icon for contextual help
- Use AI Assistant: "Help me with [topic]"

### Support Channels
- **Email**: support@lewisinsurance.ai
- **Report Issue**: Click Profile → Report Issue
- **Knowledge Base**: Command Center → Knowledge Manager

## 23.3 Error Messages

| Error | Meaning | Solution |
|-------|---------|----------|
| "Session expired" | Login timed out | Log in again |
| "Permission denied" | Insufficient access | Contact admin |
| "Record not found" | Data doesn't exist | Verify ID/search |
| "Upload failed" | File issue | Check size/format |
| "Network error" | Connection lost | Check internet |

---

# 24. Glossary

## Insurance Terms

| Term | Definition |
|------|------------|
| **ACORD** | Association for Cooperative Operations Research and Development - standardized insurance forms |
| **Binder** | Temporary insurance coverage while policy is being prepared |
| **COI** | Certificate of Insurance - proof of coverage |
| **Dec Page** | Declarations page - summary of policy coverage |
| **Endorsement** | Amendment to an insurance policy |
| **Loss Run** | Claims history report from carrier |
| **Premium** | Amount paid for insurance coverage |
| **Quote** | Proposed price for coverage |
| **Renewal** | Continuation of policy for another term |
| **Underwriting** | Process of evaluating risk |

## InsureFlow Terms

| Term | Definition |
|------|------------|
| **Account** | Customer record in InsureFlow |
| **Entity** | Any record (lead, account, policy, quote) |
| **Extraction** | AI-powered data pull from documents |
| **LEWI** | Lewis Insurance AI assistant |
| **Pipeline** | Sales stages from lead to customer |
| **Risk Score** | Calculated likelihood of customer churn |
| **Workspace** | Your agency environment in InsureFlow |

## Technical Terms

| Term | Definition |
|------|------------|
| **API** | Application Programming Interface - system connection |
| **Canopy** | Third-party policy sync service |
| **Dashboard** | Overview page with key metrics |
| **OCR** | Optical Character Recognition - text from images |
| **Portal** | Customer self-service website |
| **RAG** | Retrieval-Augmented Generation - AI technique |
| **RLS** | Row Level Security - data access control |

---

# Appendix A: System Requirements

## Browser Support
- Chrome (recommended, latest 2 versions)
- Safari (latest 2 versions)
- Firefox (latest 2 versions)
- Edge (latest 2 versions)

## Mobile Support
- iOS Safari
- Android Chrome

## Internet Connection
- Minimum 5 Mbps recommended
- Stable connection required for document upload

---

# Appendix B: Contact Information

**Technical Support**
- Email: support@lewisinsurance.ai
- Response Time: Within 4 business hours

**Training Requests**
- Email: training@lewisinsurance.ai

**Feature Requests**
- Submit via: Profile → Report Issue → Feature Request

---

# Appendix C: Version History

| Version | Date | Highlights |
|---------|------|------------|
| 2.3.0 | Dec 28, 2025 | Predictive analytics, CEO digest enhancements |
| 2.2.0 | Dec 27, 2025 | ACORD automation, Canopy 2-way sync |
| 2.1.0 | Dec 25, 2025 | Security hardening, error tracking |
| 2.0.0 | Dec 4, 2025 | Production launch |

---

**Document prepared by Lewis Insurance Agency**
**For internal use only**
**Questions? Contact your manager or support@lewisinsurance.ai**
