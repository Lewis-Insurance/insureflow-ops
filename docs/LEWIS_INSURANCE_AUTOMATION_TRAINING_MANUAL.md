# Lewis Insurance Automation Platform
## Comprehensive Employee Training Manual

---

**Document Version:** 1.0
**Effective Date:** December 29, 2024
**Prepared For:** Lewis Insurance Agency Staff
**Contact:** brian@lewisinsurance.ai

---

# Table of Contents

1. [Executive Overview](#part-1-executive-overview)
2. [Module 1: Lead & Quote Automation](#part-2-module-1---lead--quote-automation)
3. [Module 2: Policy & Service Automation](#part-3-module-2---policy--service-automation)
4. [Module 3: Operations & Compliance](#part-4-module-3---operations--compliance)
5. [Quick Reference Guide](#part-5-quick-reference-guide)
6. [FAQ & Troubleshooting](#part-6-faq--troubleshooting)

---

# Part 1: Executive Overview

## Welcome to InsureFlow Automation

Lewis Insurance has implemented InsureFlow, a comprehensive automation platform designed specifically for independent insurance agencies. This system automates routine tasks, ensures consistent follow-up, and helps our team deliver exceptional service to every client.

### What Does InsureFlow Do?

InsureFlow monitors your daily work and automatically handles repetitive tasks that previously required manual attention:

- **Instant lead response** - New leads receive SMS, email, and a callback task within 5 minutes
- **Quote follow-up** - Systematic follow-up at 1, 3, and 7 days after sending quotes
- **Renewal management** - Automated notices at 90, 60, 30, 14, and 7 days before renewal
- **Service ticket routing** - Incoming emails and texts automatically create service tickets
- **Compliance monitoring** - Weekly checks on licenses, CE requirements, and E&O coverage
- **Performance reporting** - Automatic weekly reports delivered to management

### How It Works

```
                    ┌─────────────────────────────────────┐
                    │         YOUR DAILY WORK             │
                    │  (Leads, Policies, Service, etc.)   │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │      INSUREFLOW AUTOMATION          │
                    │  • Monitors events in real-time     │
                    │  • Triggers appropriate workflows   │
                    │  • Creates tasks, sends messages    │
                    │  • Logs everything for compliance   │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │         AUTOMATED ACTIONS           │
                    │  • Emails & SMS to clients          │
                    │  • Tasks assigned to your queue     │
                    │  • Status updates in the system     │
                    │  • Reports & notifications          │
                    └─────────────────────────────────────┘
```

### Key Benefits for Our Agency

| Benefit | What It Means for You |
|---------|----------------------|
| **Faster Response** | Leads contacted within 5 minutes, not hours |
| **Nothing Falls Through Cracks** | Every lead, quote, and renewal gets proper follow-up |
| **Consistent Service** | Every client gets the same high-quality experience |
| **More Selling Time** | Less time on admin tasks, more time closing deals |
| **Compliance Protection** | Automatic license and CE monitoring |
| **Better Insights** | Weekly performance reports without manual tracking |

### What Changes for You Day-to-Day

**You Will Notice:**
- Tasks appearing in your queue automatically (call this lead, follow up on this quote)
- Clients mentioning they received our emails/texts (they're automated but personalized)
- Fewer "missed" opportunities - the system catches what we might forget

**You Still Need To:**
- Complete the tasks the system creates
- Have actual conversations with clients (automation handles the outreach, you close the deal)
- Review and approve certain actions (high-risk underwriting, retention offers)
- Update client records when you learn new information

**You No Longer Need To:**
- Manually send welcome emails to new policyholders
- Remember to follow up on sent quotes
- Track renewal dates in spreadsheets
- Manually create tickets from emails
- Calculate when to send birthday messages

---

> **Insurance Expert Tip:** Think of InsureFlow as your highly efficient assistant who never forgets, never takes vacation, and works 24/7. But remember - automation handles the routine, YOU handle the relationships.

---

# Part 2: Module 1 - Lead & Quote Automation

*13 workflows that manage the complete sales pipeline from first contact through quote acceptance*

---

## 1.1 Speed-to-Lead Response

**Purpose:** Contact new leads within 5 minutes to maximize conversion

### Why This Matters

Industry research shows that leads contacted within 5 minutes are **21 times more likely to convert** than leads contacted after 30 minutes. This workflow ensures we never miss that critical window.

### What Happens Automatically

When a new lead enters the system:

1. **Immediate SMS** (if phone provided)
   - Template: `speed_to_lead_sms`
   - Message: Personalized greeting acknowledging their inquiry

2. **Immediate Email** (if email provided)
   - Template: `speed_to_lead_email`
   - Content: Thank you for reaching out, we'll call shortly

3. **Urgent Task Created**
   - Assigned to: Lead owner or round-robin assignment
   - Priority: **URGENT**
   - Due: **5 minutes from lead creation**
   - Title: "Speed-to-Lead: Call [Name] NOW"

### Thresholds & Timing

| Action | Timing | Condition |
|--------|--------|-----------|
| SMS Sent | Immediate | Phone number exists |
| Email Sent | Immediate | Email address exists |
| Call Task | 5-minute deadline | Always created |

### Your Responsibility

- **Complete the call task within the 5-minute window**
- If you can't reach them, update the lead status to "Contacted - Left VM"
- Log your conversation notes in the lead record

> **Insurance Expert Tip:** When that urgent task pops up, drop what you're doing. That 5-minute call can be worth thousands in commission. The lead is literally on our website right now thinking about insurance.

---

## 1.2 Lead Source Detection

**Purpose:** Track where our leads come from to measure marketing ROI

### Why This Matters

Knowing which marketing channels produce our best leads helps us allocate budget effectively. A lead from Google Ads costs money - we need to know if those leads convert.

### What Happens Automatically

The system captures the lead's origin:

1. **UTM Parameter Detection**
   - Captures: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
   - Example: Google Ads campaign tracking

2. **Referrer Detection** (fallback)
   - Recognizes: Google, Facebook, LinkedIn, Yelp, direct traffic
   - Parses the HTTP referrer URL

3. **Source Saved to Lead Record**
   - Field: `lead_source`
   - Used in: Reports, analytics, producer attribution

### Source Attribution Hierarchy

| Priority | Source Type | Example |
|----------|-------------|---------|
| 1st | UTM Parameters | utm_source=google |
| 2nd | Referrer URL | Referrer contains "facebook.com" |
| 3rd | Default | "Direct" |

### Your Responsibility

- None - this is fully automatic
- You can view lead source in the lead detail screen
- Useful for conversation: "I see you found us through Google..."

> **Insurance Expert Tip:** When working leads, glance at the source. Google leads are often price-shopping. Facebook leads may be warmer but less informed. Adjust your approach accordingly.

---

## 1.3 Lead Deduplication Check

**Purpose:** Prevent duplicate lead records and wasted effort

### Why This Matters

The same prospect might submit forms multiple times or come through different marketing channels. Without deduplication, we could have three producers calling the same person.

### What Happens Automatically

When a new lead is created:

1. **Duplicate Check Runs**
   - Matches on: Email OR Phone OR Name combination
   - Compares against all existing leads and accounts

2. **If Duplicate Found:**
   - Task Created: "Review Duplicate Lead"
   - Priority: Medium
   - Due: 60 minutes
   - Description: Shows potential match details

3. **If No Duplicate:**
   - Lead proceeds normally through other workflows

### Duplicate Detection Rules

| Match Type | Confidence | Action |
|------------|------------|--------|
| Same Email | High | Create review task |
| Same Phone | High | Create review task |
| Same First + Last Name | Medium | Create review task |
| Partial Match | Low | No action |

### Your Responsibility

When you receive a "Review Duplicate Lead" task:

1. Open both lead records
2. Determine if they're the same person
3. If duplicate: Merge records (keep the more complete one)
4. If not duplicate: Mark task complete, note why (e.g., "Same name, different address - husband/wife")

> **Insurance Expert Tip:** Don't just merge blindly! "John Smith" at two different addresses could be a father and son - both valid prospects. Duplicates from the same household might be an opportunity for a multi-policy discount conversation.

---

## 1.4 Missing Information Request

**Purpose:** Automatically request critical information we need to quote

### Why This Matters

We can't provide accurate quotes without complete information. Rather than waiting for a producer to notice missing data, the system proactively requests it.

### What Happens Automatically

System checks for required fields:
- Email address
- Phone number
- First and Last name
- Insurance type(s) requested

If any are missing:

1. **Email Request** (if email exists)
   - Template: `missing_info_request`
   - Lists specific missing fields

2. **SMS Request** (if phone exists, no email)
   - Template: `missing_info_sms`
   - Brief message requesting they complete their information

### Required Fields by Insurance Type

| Insurance Type | Required Fields |
|----------------|-----------------|
| Auto | Date of birth, driver's license state |
| Home | Property address, year built |
| Commercial | Business name, industry type |
| Life | Date of birth |

### Your Responsibility

- Check if the prospect responded to the automated request
- If no response within 24 hours, make a personal phone call
- Update the lead record with information gathered

> **Insurance Expert Tip:** Missing phone number is a red flag - they may not be serious. Missing email is more common for older clients. Adjust your expectations and approach based on what's missing.

---

## 1.5 Compliance Consent Check

**Purpose:** Ensure TCPA compliance before outbound contact

### Why This Matters

Calling or texting someone without proper consent can result in **$500-$1,500 fines PER VIOLATION**. This workflow protects Lewis Insurance from regulatory penalties.

### What Happens Automatically

For each new lead:

1. **Consent Verification**
   - Records: IP address, timestamp, lead source, user agent
   - Evaluates: Did they opt-in via form? Is this number on DNC list?

2. **If Compliant:**
   - Lead approved for outbound contact
   - Green flag in system

3. **If Non-Compliant or Questionable:**
   - Task Created: "Compliance Review Required"
   - Priority: **HIGH**
   - Due: 30 minutes
   - Lead blocked from automated outreach until resolved

### Consent Types

| Consent Type | Risk Level | Automated Contact? |
|--------------|------------|-------------------|
| Form Submission with Checkbox | Low | Yes |
| Inbound Call Request | Low | Yes |
| Third-Party Lead | Medium | Review Required |
| No Clear Consent | High | Blocked |

### Your Responsibility

When you receive a "Compliance Review Required" task:

1. Review how the lead was obtained
2. Check if there's documented consent
3. If compliant: Mark approved, note the consent source
4. If not compliant: Do NOT contact via phone/SMS - email only is safer

> **Insurance Expert Tip:** When in doubt, don't text or call. Email is much safer from a TCPA perspective. One TCPA lawsuit can cost more than a year's worth of new business. Always err on the side of caution.

---

## 1.6 Aging Lead Escalation

**Purpose:** Ensure no lead goes 48+ hours without attention

### Why This Matters

Leads that sit too long go cold. This workflow catches leads that are "stuck" in early stages and escalates them to management.

### When It Runs

- **Schedule:** Every 4 hours (6 times per day)
- **Checks:** All leads with status "New" or "Contacted" that are 48+ hours old

### What Happens Automatically

1. **Batch Query Runs**
   - Finds all qualifying stale leads

2. **For Each Stale Lead:**
   - Either: Reassigned to another producer
   - Or: Manager notified with list of aging leads

3. **Manager Notification**
   - Summary: "X leads are aging beyond 48 hours"
   - Details: Lead names, sources, assigned producers

### Escalation Criteria

| Lead Status | Age Threshold | Action |
|-------------|---------------|--------|
| New | > 48 hours | Escalate |
| Contacted | > 48 hours | Escalate |
| Qualified | Any age | Not escalated (different workflow) |
| Nurturing | Any age | Not escalated (intentional) |

### Your Responsibility

- Prevent escalations by working your leads promptly
- If you can't work a lead, update the status appropriately
- If you receive a reassigned lead, treat it as urgent

> **Insurance Expert Tip:** The 48-hour rule exists because lead conversion drops dramatically after 2 days. If you're seeing your leads get escalated, you need to adjust your workflow. Either work faster or move leads to "Nurturing" if they're not ready.

---

## 1.7 Nurture Sequence Start

**Purpose:** Enroll unready leads in automated drip campaigns

### Why This Matters

Not every lead is ready to buy today. Nurture sequences keep Lewis Insurance top-of-mind until the prospect is ready, without requiring manual follow-up.

### What Happens Automatically

When a lead's status changes to "Nurturing":

1. **Sequence Determination**
   - Based on insurance type requested
   - Each type has different timing and content

2. **Campaign Enrollment**
   - Lead added to appropriate email sequence
   - Personalized with first name, specific insurance needs

### Nurture Sequence Timing by Product

| Insurance Type | Email Frequency | Total Duration |
|----------------|-----------------|----------------|
| Auto | Every 1 day | 7 emails |
| Home | Every 1 day | 7 emails |
| Commercial | Every 2 days | 8 emails |
| Life | Every 3 days | 10 emails |

### Why Different Timing?

- **Auto/Home:** Quick decision cycle, frequent contact
- **Commercial:** Business owner needs time to review with partners
- **Life:** Major life decision, requires more consideration time

### Your Responsibility

- Move leads to "Nurturing" status when they're not ready to buy
- Monitor for replies to nurture emails
- When a nurtured lead engages, move them back to "Qualified"

> **Insurance Expert Tip:** Don't give up on nurtured leads! Check back on your nurturing pipeline monthly. Life circumstances change - the person who wasn't ready in January might be desperate for coverage in March.

---

## 1.8 Quote Need Packet Send

**Purpose:** Send required document checklists to prospects by insurance type

### Why This Matters

Each insurance type requires different documentation for accurate quoting. Sending the right checklist upfront speeds the process and qualifies serious buyers.

### What Happens Automatically

When a quote is initiated:

1. **Line of Business Detection**
   - Determines: Auto, Home, Commercial, or Life

2. **Appropriate Packet Sent**
   - Email with checklist of required documents
   - Upload portal link for easy submission

### Required Documents by Insurance Type

| Type | Required Documents |
|------|-------------------|
| **Auto** | Driver's license, Current dec page, Vehicle registration |
| **Home** | Current dec page, Property photos, Mortgage statement |
| **Commercial** | Current policies, Loss runs (5 years), Financial statements, Business license |
| **Life** | Medical history questionnaire, Beneficiary information |

### Your Responsibility

- Follow up if documents aren't received within 48 hours
- Review uploaded documents for completeness
- Request additional documents if needed for specific situations

> **Insurance Expert Tip:** The document request is a qualifying filter. Prospects who quickly provide documents are serious buyers. Those who disappear after the request were probably just price-shopping. Prioritize your time accordingly.

---

## 1.9 Quote Status Progression

**Purpose:** Automatically progress quotes through the pipeline

### Why This Matters

When you send a quote, the system needs to update its status from "Draft" to "Sent" and trigger appropriate follow-up activities.

### What Happens Automatically

When a quote is delivered to the customer:

1. **Status Update**
   - Changes from "Draft" to "Sent"
   - Timestamps the delivery

2. **Customer Notification**
   - Email confirming quote was sent
   - Includes how to reach us with questions

3. **Follow-up Task Created**
   - Assigned to: Quote creator
   - Priority: HIGH
   - Due: 24 hours
   - Title: "Follow Up on Quote for [Customer Name]"

### Quote Pipeline Stages

```
Draft → Sent → Reviewed → Accepted/Declined/Expired
```

### Your Responsibility

- Complete the 24-hour follow-up task
- Update quote status based on customer response
- Log any questions or objections for future reference

> **Insurance Expert Tip:** The day-1 follow-up is crucial. Most objections surface here. Call with a specific question: "Did you have a chance to review the quote? Any questions about the liability coverage?" This opens dialogue naturally.

---

## 1.10 Quote Follow-up Scheduler

**Purpose:** Ensure systematic follow-up at optimal intervals

### Why This Matters

Most insurance sales require multiple touches. This workflow ensures we follow up at 1, 3, and 7 days without requiring you to manage a calendar.

### When It Runs

- **Schedule:** Every 6 hours
- **Checks:** All quotes in "Sent" status

### What Happens Automatically

For quotes at each interval:

| Days Since Sent | Action | Template |
|-----------------|--------|----------|
| 1 day | Schedule follow-up | `quote_followup_day1` |
| 3 days | Schedule follow-up | `quote_followup_day3` |
| 7 days | Schedule follow-up | `quote_followup_day7` |

**Skips quotes where:**
- Producer has logged activity in the last 24 hours
- Quote is no longer in "Sent" status

### Your Responsibility

- When follow-up tasks appear, make the contact
- Log your activity to prevent duplicate automation
- Update quote status when you get a definitive answer

> **Insurance Expert Tip:** Each follow-up should add value, not just "checking in." Day 1: Answer questions. Day 3: Share a relevant tip or offer to compare coverage. Day 7: Create urgency around quote expiration.

---

## 1.11 Quote Expiry Rescue

**Purpose:** Make last-ditch efforts to save expiring quotes

### Why This Matters

Quotes typically expire in 30 days. This workflow triggers aggressive outreach as expiration approaches, attempting to rescue deals that might otherwise be lost.

### When It Runs

- **Schedule:** Every 12 hours
- **Checks:** Quotes expiring in 7 days and 3 days

### What Happens Automatically

**7 Days Before Expiry:**
- Email reminder sent
- Task created (Priority: HIGH)
- No SMS (less aggressive)

**3 Days Before Expiry:**
- Email reminder sent (urgent tone)
- SMS alert sent
- Task created (Priority: URGENT)

### Expiry Rescue Communications

| Days to Expiry | Email | SMS | Task Priority |
|----------------|-------|-----|---------------|
| 7 days | Yes | No | High |
| 3 days | Yes | Yes | Urgent |

### Your Responsibility

- Treat 3-day expiry tasks as top priority
- Offer to extend the quote if needed (request manager approval)
- If customer is unresponsive, try a different contact method

> **Insurance Expert Tip:** The 3-day window is your last chance. Be direct: "Your quote expires Friday. After that, I'll need to re-rate and the price may change. Can we finalize this today?" Urgency often closes deals.

---

## 1.12 Comparison Document Generator

**Purpose:** Automatically create quote-vs-current-policy comparisons

### Why This Matters

Customers need to see the value in switching. A side-by-side comparison makes the decision easier and highlights savings and coverage differences.

### What Happens Automatically

When a comparison is requested:

1. **Document Generation**
   - Creates PDF comparison
   - Includes: Premium comparison, coverage comparison, deductibles, carrier ratings
   - Applies Lewis Insurance branding

2. **If Generation Succeeds:**
   - Email sent to customer with PDF attached

3. **If Generation Fails:**
   - Task created: "Manually Create Comparison"
   - Priority: Medium

### Comparison Document Contents

| Section | Information |
|---------|-------------|
| Premium Comparison | Current vs. Quoted premium, savings highlighted |
| Coverage Comparison | Limits side-by-side, differences highlighted |
| Deductible Comparison | Current vs. Quoted deductibles |
| Carrier Information | Financial strength ratings, AM Best ratings |
| Agent Recommendation | Why we recommend this option |

### Your Responsibility

- Review generated comparisons for accuracy
- Add personal notes or call out specific benefits
- Use comparison as sales tool during follow-up calls

> **Insurance Expert Tip:** Never just email the comparison. Call to walk through it. "I sent over a comparison document. Can I have 5 minutes to explain the key differences?" Personal explanation doubles conversion rates.

---

## 1.13 Task Auto-Creation

**Purpose:** Automatically generate appropriate tasks from business events

### Why This Matters

Rather than manually creating tasks, the system generates them based on what's happening. This ensures nothing is forgotten and priorities are set correctly.

### What Happens Automatically

| Event | Task Created | Priority | Due Time |
|-------|--------------|----------|----------|
| New Lead | "New Lead: Initial Contact" | High | 30 minutes |
| Quote Sent | "Quote Follow-up Call" | High | 24 hours |
| Document Uploaded (unclassified) | "Classify Document" | Low | 8 hours |
| Policy Activated | "Welcome Call - New Policy" | Medium | 48 hours |
| Urgent Ticket | "[Ticket Subject]" | Urgent | 60 minutes |

### Task Priority Levels

| Priority | Response Expectation |
|----------|---------------------|
| **Urgent** | Drop everything, handle now |
| **High** | Handle within hours |
| **Medium** | Handle within 1-2 business days |
| **Low** | Handle when time permits |

### Your Responsibility

- Work your task queue in priority order
- Mark tasks complete when done
- If a task is no longer needed, mark it appropriately (don't just ignore it)

> **Insurance Expert Tip:** Start each day by reviewing your task queue. Handle urgent/high first. Batch low-priority tasks for end-of-day. Your task queue is your roadmap to success - trust it.

---

# Part 3: Module 2 - Policy & Service Automation

*13 workflows that manage the policy lifecycle and customer service*

---

## 2.1 Policy Welcome & Onboarding

**Purpose:** Deliver exceptional first impression to new policyholders

### Why This Matters

The onboarding experience sets the tone for the entire customer relationship. A great welcome reduces buyer's remorse and establishes trust.

### What Happens Automatically

When a new policy is activated:

1. **Welcome Email Sent**
   - Template: `policy_welcome_{line_of_business}`
   - Includes: Policy details, agent contact info, what to expect

2. **Welcome Call Task Created**
   - Assigned to: Account owner
   - Priority: Medium
   - Due: 48 hours
   - Title: "Welcome Call - New Policy"

3. **Onboarding Nurture Sequence Started**
   - Delay: 7 days (allow customer to review welcome materials)
   - Content: Tips for using coverage, claims process, app download

### Your Responsibility

- Complete the welcome call within 48 hours
- Cover key points: How to file claims, how to reach us, payment schedule
- Answer any questions about their new coverage

> **Insurance Expert Tip:** The welcome call is NOT a sales call. It's a service call. Build rapport now, and cross-sell opportunities will come naturally later. Ask about their experience with the application process - feedback helps us improve.

---

## 2.2 Renewal Approaching

**Purpose:** Proactively manage renewals to maximize retention

### Why This Matters

Renewal is when we're most likely to lose customers. Proactive outreach shows we care and gives us opportunity to address concerns before they shop elsewhere.

### When It Runs

- **Schedule:** Daily
- **Checks:** All policies with approaching renewal dates

### Renewal Timeline

| Days Before Renewal | Action | Priority |
|---------------------|--------|----------|
| 90 days | Create review task | Standard |
| 60 days | Send renewal notice email | Standard |
| 30 days | Send reminder email + SMS | Elevated |
| 14 days | Escalate to high priority | High |
| 7 days | Urgent outreach | Urgent |

### Your Responsibility

- Complete renewal review tasks
- Discuss any premium changes with customers
- Offer remarketing if significant price increase
- Document customer's renewal decision

> **Insurance Expert Tip:** The 60-day notice is your best retention opportunity. If there's a rate increase, get ahead of it. Call to explain why and discuss options. Customers who feel informed stay; customers who feel surprised leave.

---

## 2.3 Service Ticket SLA & Assignment

**Purpose:** Automatically route service requests with appropriate deadlines

### Why This Matters

Different issues require different response times. A certificate request shouldn't wait as long as a general question. This workflow ensures proper prioritization and routing.

### What Happens Automatically

When a service ticket is created:

1. **SLA Calculation**
   - Based on priority level and category
   - Sets response and resolution deadlines

2. **Auto-Assignment**
   - Routes to appropriate team member
   - Uses round-robin within category specialists

### SLA Standards

| Priority | Response SLA | Resolution SLA |
|----------|--------------|----------------|
| Urgent | 1 hour | 4 hours |
| High | 4 hours | 24 hours |
| Medium | 8 hours | 48 hours |
| Low | 24 hours | 72 hours |

**Category Adjustments:**
- Claims & Certificates: SLA reduced by 50% (faster)
- Cancellations: SLA reduced by 25% (faster)

### Your Responsibility

- Acknowledge tickets within response SLA
- Resolve tickets within resolution SLA
- Escalate to manager if you can't meet SLA

> **Insurance Expert Tip:** Acknowledgment counts! Even if you can't resolve immediately, responding "I received your request and will have an answer by [time]" satisfies the response SLA and sets customer expectations.

---

## 2.4 Ticket Escalation

**Purpose:** Catch SLA breaches before they become customer complaints

### When It Runs

- **Schedule:** Every 15 minutes
- **Checks:** All open tickets for SLA compliance

### Escalation Process

| Threshold | Action | Notification |
|-----------|--------|--------------|
| 80% of response SLA | Warning | Assignee notified |
| 100% of response SLA | Breach | Manager notified |
| 75% of resolution SLA | Warning | Assignee notified |
| 100% of resolution SLA | Breach | Manager notified |
| 4+ hours, no response (urgent/high) | Immediate | Team notified |

### Your Responsibility

- Respond to warning notifications immediately
- If you can't meet SLA, escalate proactively
- Don't let tickets sit - update status even if just to acknowledge

> **Insurance Expert Tip:** Warnings at 80% are your safety net. When you get one, stop and handle that ticket immediately. It takes 60 seconds to acknowledge; it takes hours to repair a damaged relationship after a missed SLA.

---

## 2.5 Email Ingest

**Purpose:** Automatically create service tickets from incoming emails

### Why This Matters

Customers shouldn't have to navigate our systems to get help. When they email us, we should automatically track their request.

### What Happens Automatically

When an email arrives at our service address:

1. **Email Parsed**
   - Extracts: Subject, body, sender, attachments

2. **Auto-Categorization**
   - Keyword detection determines category

3. **Ticket Created**
   - Includes full email content
   - Attachments linked to ticket
   - Priority assigned based on content

### Auto-Categorization Rules

| Keywords Detected | Category | Priority |
|-------------------|----------|----------|
| "claim", "accident" | Claims | High |
| "cancel" | Cancellation | High |
| "bill", "payment", "invoice" | Billing | Medium |
| "certificate", "COI" | Certificate | High |
| "change", "endorsement", "add driver" | Endorsement | Medium |
| "urgent", "ASAP", "emergency" | (Override) | Urgent |

### Your Responsibility

- Verify auto-categorization is correct
- Respond to customer (ticket tracks email thread)
- Update ticket status as you work

> **Insurance Expert Tip:** The auto-categorization is smart but not perfect. Always glance at the email content to confirm the category. "Cancel my auto-pay" shouldn't be in the Cancellation queue!

---

## 2.6 SMS Ingest

**Purpose:** Convert customer text messages into actionable tickets

### Why This Matters

Many customers prefer texting. We need to capture these requests just like emails.

### What Happens Automatically

When a text message is received:

1. **Message Analyzed**
   - Determines if it's a request or just acknowledgment

2. **Service Request → Ticket Created**
   - Keywords: "help", "need", "question", "claim", "certificate"

3. **Acknowledgment → Activity Logged**
   - Keywords: "ok", "thanks", "yes", "no"
   - No ticket needed, but interaction recorded

### SMS Routing

| Message Type | Action |
|--------------|--------|
| "I need help with my claim" | Create ticket (Claims, High) |
| "Can you send me an ID card" | Create ticket (Document Request) |
| "Need a certificate ASAP" | Create ticket (Certificate, High) |
| "Ok thanks" | Log activity only |
| "Yes" | Log activity only |

### Your Responsibility

- Check SMS-originated tickets for context
- Often need to call for details (texts are usually brief)
- Respond via their preferred channel (text back when appropriate)

> **Insurance Expert Tip:** SMS tickets often lack context. Don't try to solve everything via text. Call and say "Got your text about the certificate - let me get the details." Voice is faster for complex requests.

---

## 2.7 Document Classification

**Purpose:** Automatically identify and route uploaded documents

### Why This Matters

Customers upload all kinds of documents. Auto-classification ensures they get to the right place without manual sorting.

### What Happens Automatically

When a document is uploaded:

1. **AI Classification**
   - Identifies document type

2. **Type-Specific Processing**

| Document Type | Automatic Action |
|---------------|------------------|
| Dec Page | Extract coverage info, link to policy |
| Loss Runs | Extract claims history, calculate loss ratio |
| Driver's License | Extract driver info, verify expiration |
| Policy Document | Extract endorsements, link to policy |
| Unknown | Create task for manual classification |

### Your Responsibility

- Review extracted information for accuracy
- Handle "Unknown" classification tasks
- Follow up on concerning items (expired license, high loss ratio)

> **Insurance Expert Tip:** Pay special attention to loss runs. High loss ratios (>60%) are a red flag. If you see one, proactively discuss risk management with the customer before renewal.

---

## 2.8 Coverage Gap Alerts

**Purpose:** Identify cross-sell opportunities and coverage inadequacies

### When It Runs

- **Schedule:** Daily
- **Checks:** All active policies for gap conditions

### Gap Conditions Detected

| Gap Type | Condition | Alert |
|----------|-----------|-------|
| Low Liability | < $300,000 limit | Recommend increase |
| Missing Umbrella | Assets > $500k, no umbrella | Cross-sell opportunity |
| Missing Flood | Property in flood zone | Risk disclosure |
| Outdated Home Value | Not updated in 3+ years | Reassessment needed |
| Home Business | Home office detected | Commercial gap |

### Your Responsibility

- Review gap alerts in your book of business
- Reach out to customers with identified gaps
- Document conversations about coverage recommendations

> **Insurance Expert Tip:** Gap alerts are compliance protection AND revenue opportunity. If you identified a gap and the customer declined, document it. If they later have a loss, that documentation protects the agency.

---

## 2.9 Cross-Sell Detection

**Purpose:** Recommend additional products based on current coverage

### What Happens Automatically

When a new policy is activated:

| Customer Has | Recommend | Timing |
|--------------|-----------|--------|
| Auto | Home, Umbrella, Life | 30/60/90 days |
| Home | Auto, Umbrella, Flood, Life | 30/60/90 days |
| Life | Disability, Long-term Care | 60/90 days |
| Commercial Auto | Property, GL, Workers Comp | 30/60/90 days |
| Commercial Property | Auto, GL, Cyber, Umbrella | 30/60/90 days |

### Why Staggered Timing?

- **30 days:** Initial settling period over, ready for discussion
- **60 days:** Follow-up on initial conversation
- **90 days:** Final opportunity before next renewal

### Your Responsibility

- Review cross-sell opportunities in your queue
- Have natural conversations about additional coverage
- Track wins and losses for future reference

> **Insurance Expert Tip:** Don't cold-pitch cross-sells. Use life events as triggers. "Now that you have the house, have you thought about an umbrella policy? With property ownership, your liability exposure increases."

---

## 2.10 Birthday & Anniversary Reminders

**Purpose:** Maintain relationships through personal milestones

### When It Runs

- **Schedule:** Daily at 8 AM
- **Checks:** Birthdays and anniversaries for that day

### Automated Touches

| Occasion | Action | Timing |
|----------|--------|--------|
| Birthday | Send greeting email | On birthday |
| Policy Anniversary | Create "Thank You" task | 7 days before |
| Customer Anniversary (1 yr) | Send appreciation email | On date |
| Customer Anniversary (5 yr) | Send appreciation email | On date |
| Customer Anniversary (10 yr) | Send appreciation email | On date |

### Your Responsibility

- Complete policy anniversary thank-you calls
- Add personal touch when possible
- Note any life changes mentioned (cross-sell opportunities)

> **Insurance Expert Tip:** Anniversary calls are gold mines for referrals. "Happy policy anniversary! How has the past year been? Oh, your daughter just got her license? Let me make sure she's covered properly."

---

## 2.11 Referral Request

**Purpose:** Systematically request referrals from satisfied customers

### Qualification Criteria

Before requesting a referral, the system verifies:
- Policy active for 30+ days
- No claims filed in last 6 months
- Good payment history
- Haven't been asked for referral in 90 days

### What Happens Automatically

Qualified customers receive:
- Referral request email at optimal timing (around day 45)
- Line-of-business specific template

### Your Responsibility

- Follow up on referral leads immediately
- Thank customers who refer
- Track referral sources for bonus/recognition

> **Insurance Expert Tip:** The system identifies WHEN to ask for referrals. Your job is to ask PERSONALLY too. The automated email is the reminder; your phone call closes the deal. "Who do you know that could use our help?"

---

## 2.12 Review Request

**Purpose:** Generate online reviews to improve agency reputation

### What Happens Automatically

At 60 days after policy activation:
- Review request email sent
- Links to Google Reviews and Yelp
- Template: `review_request_happy_customer`

### Why 60 Days?

- Customer has experienced service
- Initial onboarding complete
- Still remembers positive experience

### Your Responsibility

- If customer had exceptional experience, ask personally
- Respond to reviews (positive and negative)
- Thank customers who leave reviews

> **Insurance Expert Tip:** If a customer compliments you, that's your cue. "I'm so glad we could help! Would you mind sharing that on Google? Reviews really help other families find good insurance." Strike while the gratitude is fresh.

---

## 2.13 Win-Back Campaign

**Purpose:** Re-engage lapsed customers and declined quotes

### When It Runs

- **Schedule:** Weekly
- **Identifies:** Lapsed policies, declined quotes, cold leads

### Win-Back Segments

| Segment | Days Since Loss | Campaign |
|---------|-----------------|----------|
| Recently Lapsed | 30 days | "We miss you" |
| Moderate | 90 days | Special offer |
| Aged | 180 days | Reintroduction |
| Anniversary | 365 days | Anniversary reach-out |

### Exclusions

- Cancelled for fraud
- Cancelled for non-payment (different campaign)
- Competitive loss with confirmed new carrier

### Your Responsibility

- Respond to win-back inquiries promptly
- Have conversation about what changed
- Offer competitive re-quote if appropriate

> **Insurance Expert Tip:** Win-back customers often left for price. Ask what they're paying now. Market conditions change - we might be competitive again. Also, they've experienced another carrier's service - ours might compare favorably!

---

# Part 4: Module 3 - Operations & Compliance

*13 workflows that handle back-office operations, compliance, and reporting*

---

## 3.1 Payment Overdue Notification

**Purpose:** Progressive collections outreach for overdue payments

### When It Runs

- **Schedule:** Daily
- **Checks:** All overdue payments

### Escalation Timeline

| Days Overdue | Action | Method |
|--------------|--------|--------|
| 1 day | Gentle reminder | Email |
| 7 days | Urgent warning | Email + SMS |
| 14 days | Account manager task | Internal |
| 30 days | Final notice, escalate | Email + Task |

### Your Responsibility

- Follow up on 14-day tasks personally
- Document payment arrangements
- Escalate to manager before cancellation

> **Insurance Expert Tip:** Day 7 is your intervention point. Call before the 14-day task. Many people simply forgot to update their card after it expired. A friendly call often resolves it immediately.

---

## 3.2 Claim Filed Response

**Purpose:** Immediate acknowledgment when claims are filed

### What Happens Automatically

When a claim is filed:

1. **Acknowledgment Email**
   - Confirms receipt
   - Explains next steps
   - Provides claims team contact

2. **Urgent Task Created**
   - Due: 4 hours
   - Title: "Contact customer about [Claim Type] claim"

3. **Claims Team Notification**
   - Internal alert with claim details

### Your Responsibility

- Complete the 4-hour contact task
- Express empathy and explain process
- Set expectations for timeline

> **Insurance Expert Tip:** Claims are stressful for customers. Lead with empathy: "I'm sorry this happened. Let me explain exactly what to expect and how we'll take care of you." Your attitude during claims determines loyalty.

---

## 3.3 Policy Cancellation Processing

**Purpose:** Attempt retention before processing cancellations

### What Happens Automatically

1. **Reason Analysis**
   - System evaluates cancellation reason
   - Determines retention eligibility

2. **Retention-Eligible Reasons:**
   - Price/premium increase → High priority retention
   - Service issues → Urgent priority retention
   - Moving → Medium priority (may need different coverage)

3. **Non-Retention Reasons:**
   - Non-payment (past attempts)
   - Fraud
   - Underwriting decline
   - Asset sold

4. **Win-Back Scheduled**
   - 30 days after cancellation
   - Appropriate campaign based on reason

### Your Responsibility

- Complete retention tasks promptly
- Have genuine conversations about concerns
- Document retention attempts for compliance

> **Insurance Expert Tip:** "Why are you leaving?" is your most important question. Listen fully. Sometimes the stated reason isn't the real reason. Address the real issue, and you can often save the account.

---

## 3.4 Agency Performance Reports

**Purpose:** Weekly KPI reports for agency management

### When It Runs

- **Schedule:** Every Monday morning
- **Period:** Previous 7 days

### Metrics Included

| Metric | What It Measures |
|--------|------------------|
| New Leads | Top-of-funnel activity |
| Lead Conversion Rate | Sales efficiency |
| Quotes Sent | Sales activity volume |
| Policies Written | Closing performance |
| Premium Written | Revenue generation |
| Retention Rate | Customer loyalty |
| Avg Response Time | Service quality |
| NPS Score | Customer satisfaction |
| Tasks Completed | Team productivity |
| Tickets Resolved | Support efficiency |

### Report Distribution

- Sent to: Agency principals
- Format: PDF with charts
- Includes: Week-over-week comparison, producer breakdown

### Your Responsibility

- None for producers - this is management information
- Principals should review and act on insights

> **Insurance Expert Tip:** For principals: Don't just read the numbers - look for trends. A dropping conversion rate might mean lead quality is declining. A rising response time might mean you need additional staff.

---

## 3.5 Producer Commission Tracking

**Purpose:** Accurate, timely commission statements

### When It Runs

- **Schedule:** Monthly (first of month)
- **Calculates:** Previous month's commissions

### Commission Types

| Type | Calculation |
|------|-------------|
| New Business | Per-policy commission on new sales |
| Renewal | Commission on renewed policies |
| Performance Bonus | Bonus for exceeding targets |

### Distribution

- Producers receive: Personal detailed statement
- Principals receive: Summary of all producer commissions

### Your Responsibility

- Review your statement for accuracy
- Report discrepancies within 5 business days
- Track your progress toward bonus thresholds

> **Insurance Expert Tip:** Your commission statement is your scorecard. Review it monthly. Know where you stand on bonuses. A few extra sales at month-end could push you into a higher tier.

---

## 3.6 Carrier Appetite Match

**Purpose:** Match leads with carriers most likely to write the risk

### What Happens Automatically

When lead data is enriched:

1. **Risk Factor Extraction**
   - State, ZIP code
   - Industry code
   - Years in business
   - Revenue, employees

2. **Carrier Matching**
   - Queries appetite database
   - Returns top 5 matching carriers

3. **If Matches Found:**
   - Recommendations saved to lead
   - Producer notified

4. **If No Matches:**
   - Task created: "Manual Market Review"
   - Risk may need specialty market

### Your Responsibility

- Review carrier recommendations
- Prioritize quoting with recommended carriers
- Develop relationships with specialty markets for hard-to-place risks

> **Insurance Expert Tip:** Trust the appetite match for standard risks. For tough risks (new businesses, unique industries), call your underwriters directly. Relationships matter for exceptions.

---

## 3.7 Risk Profile Scoring

**Purpose:** Identify high-risk customers requiring underwriting attention

### What Happens Automatically

Risk score calculated from:
- Claims history
- Payment history
- Coverage adequacy
- Years as customer
- Multi-policy status
- Risk characteristics

### Score Actions

| Score | Rating | Action |
|-------|--------|--------|
| 0-70 | Acceptable | No action |
| 71-100 | High Risk | Review task created |

### Your Responsibility

- Complete high-risk review tasks
- Consider remarket or non-renewal options
- Discuss risk management with customer

> **Insurance Expert Tip:** High-risk doesn't always mean "get rid of them." It means "manage carefully." A customer with claims might need better coverage, risk management advice, or just honest conversation about their situation.

---

## 3.8 Remarket Trigger

**Purpose:** Identify accounts that should be shopped to other carriers

### When It Runs

- **Schedule:** Daily
- **Identifies:** Remarket candidates

### Remarket Triggers

| Trigger | Condition | Action |
|---------|-----------|--------|
| Premium Increase | ≥15% at renewal | Remarket opportunity |
| Carrier Non-Renewal | Notice received | Urgent remarket |
| Coverage Reduction | Carrier reducing coverage | Remarket opportunity |
| Customer Request | Asked for price shop | Remarket opportunity |
| Risk Improvement | 3+ years claim-free | May qualify for better rates |

### Your Responsibility

- Prioritize carrier non-renewals (time-sensitive)
- Present remarket options to customers
- Compare coverage, not just price

> **Insurance Expert Tip:** Remarketing isn't just about price. Sometimes the customer's risk profile has improved and they qualify for better carriers. Frame it as "your good record has earned you better options."

---

## 3.9 COI Auto-Generation

**Purpose:** Instant Certificate of Insurance generation

### What Happens Automatically

When COI is requested:

1. **PDF Generated**
   - Policy information
   - Certificate holder details
   - Special endorsements (Additional Insured, Waiver, etc.)

2. **If Successful:**
   - Email sent to recipient
   - COI attached as PDF

3. **If Failed:**
   - Task created: "Manual COI Generation"
   - Priority: High

### COI Options

| Option | Description |
|--------|-------------|
| Additional Insured | Certificate holder added as insured |
| Waiver of Subrogation | Carrier waives right to sue certificate holder |
| Primary, Non-Contributory | This policy pays first |

### Your Responsibility

- Verify COI details before sending
- Handle manual generation tasks promptly
- Certificates are often time-sensitive for contracts

> **Insurance Expert Tip:** COIs are often urgent. Contractors lose jobs over late certificates. When you see a COI task, treat it as priority. Five minutes of your time can save a customer a major contract.

---

## 3.10 Endorsement Processing

**Purpose:** Route policy change requests intelligently

### What Happens Automatically

| Endorsement Type | Auto-Process? | Approval Needed? |
|------------------|---------------|------------------|
| Add Driver | No | Yes - underwriting |
| Remove Driver | Yes | No |
| Add Vehicle | No | Yes - underwriting |
| Remove Vehicle | Yes | No |
| Coverage Increase | No | Yes - underwriting |
| Coverage Decrease | Yes | No |
| Address Change | Yes | No |
| Additional Insured | Yes | No |

### Your Responsibility

- Complete endorsement tasks requiring approval
- Verify customer understands coverage changes
- Process urgent endorsements same-day

> **Insurance Expert Tip:** Adding drivers is critical. Get full information including driving history. A customer adding their teen with a recent ticket will affect premium significantly - better to discuss before processing.

---

## 3.11 Audit Preparation

**Purpose:** Prepare for Workers Comp and GL audits

### When It Runs

- **Schedule:** Monthly
- **Looks Ahead:** 3 months

### Audit Timeline

| Months Before Audit | Action |
|---------------------|--------|
| 3 months | Notify account manager |
| 2 months | Request financials from customer |
| 1 month | Prepare internal documents |

### Required Documents

- Payroll records
- Financial statements
- Employee roster

### Your Responsibility

- Complete audit preparation tasks
- Help customers understand what's needed
- Coach customers on minimizing audit surprises

> **Insurance Expert Tip:** Audit surprises hurt customer relationships. If their payroll grew significantly, the audit premium can be huge. Discuss mid-year to set expectations. Suggesting quarterly reporting can prevent shock at audit.

---

## 3.12 Compliance Check

**Purpose:** Monitor licenses, CE requirements, and E&O coverage

### When It Runs

- **Schedule:** Weekly
- **Checks:** All compliance requirements

### Compliance Monitored

| Item | Warning Period | Action |
|------|----------------|--------|
| Producer Licenses | 60 days before expiry | Renewal task |
| CE Requirements | 90 days before due | Completion task |
| Agency E&O | 60 days before expiry | Renewal task |
| Carrier Appointments | Active status | Reactivation task |
| Document Retention | 7-year rule | Archive task |

### Your Responsibility

- Complete your personal compliance tasks
- Maintain valid licenses
- Complete CE requirements on time

> **Insurance Expert Tip:** Don't wait for the warning. Track your license expiration and CE requirements proactively. Letting a license lapse - even briefly - can jeopardize your career and create E&O exposure for the agency.

---

## 3.13 Data Quality Cleanup

**Purpose:** Maintain database accuracy and cleanliness

### When It Runs

- **Schedule:** Daily (off-hours)
- **Performs:** 8 quality checks

### Automated Cleanup

| Issue | Action |
|-------|--------|
| Invalid phone format | Auto-fix (standardize) |
| Stale leads (180 days) | Auto-archive |
| Expired quotes (30+ days) | Auto-close |
| Missing email | Flag for review |
| Missing phone | Flag for review |
| Duplicate accounts | Flag for review |
| Orphaned policies | Flag for review |

### Your Responsibility

- Review flagged data quality issues
- Clean up your own records proactively
- Report systematic issues to management

> **Insurance Expert Tip:** Clean data = accurate reporting = better decisions. When you're in a record, take 30 seconds to verify the information is current. It saves hours of cleanup later.

---

# Part 5: Quick Reference Guide

## Workflow Trigger Summary

### Event-Triggered Workflows
*Automatically triggered when events occur*

| Event | Workflows Triggered |
|-------|-------------------|
| **Lead Created** | Speed-to-Lead, Source Detection, Deduplication, Missing Info, Compliance |
| **Lead Status → Nurturing** | Nurture Sequence Start |
| **Quote Initiated** | Quote Need Packet |
| **Quote Sent** | Status Progression, Comparison Generator, Task Auto-Creation |
| **Policy Activated** | Welcome/Onboarding, Cross-Sell, Referral Request, Review Request |
| **Document Uploaded** | Document Classification |
| **Ticket Created** | SLA Assignment, Endorsement Processing |
| **Claim Filed** | Claim Response |
| **Payment Overdue** | Payment Notifications |

### Scheduled Workflows
*Run automatically on schedule*

| Workflow | Schedule | Time |
|----------|----------|------|
| Aging Lead Escalation | Every 4 hours | Continuous |
| Quote Follow-up Scheduler | Every 6 hours | Continuous |
| Quote Expiry Rescue | Every 12 hours | Continuous |
| Ticket Escalation | Every 15 minutes | Continuous |
| Renewal Approaching | Daily | Morning |
| Coverage Gap Alerts | Daily | Morning |
| Birthday/Anniversary | Daily | 8 AM |
| Payment Overdue | Daily | Morning |
| Remarket Trigger | Daily | Morning |
| Data Quality Cleanup | Daily | Off-hours |
| Win-Back Campaign | Weekly | Monday |
| Compliance Check | Weekly | Monday |
| Agency Performance Reports | Weekly | Monday |
| Audit Preparation | Monthly | 1st |
| Producer Commission | Monthly | 1st |

---

## SLA Reference Chart

### Service Ticket SLAs

| Priority | Response | Resolution |
|----------|----------|------------|
| **Urgent** | 1 hour | 4 hours |
| **High** | 4 hours | 24 hours |
| **Medium** | 8 hours | 48 hours |
| **Low** | 24 hours | 72 hours |

*Category adjustments: Claims & Certificates = 50% faster, Cancellations = 25% faster*

### Task Response Expectations

| Priority | Expected Response |
|----------|------------------|
| **Urgent** | Immediately |
| **High** | Within hours |
| **Medium** | Within 1-2 business days |
| **Low** | When time permits |

---

## Escalation Thresholds

| Metric | Warning | Breach |
|--------|---------|--------|
| Response SLA | 80% of time | 100% of time |
| Resolution SLA | 75% of time | 100% of time |
| Lead Age | 48 hours | Escalated |
| Payment Overdue | 7 days | 14 days |
| Quote Expiry | 7 days | 3 days |
| Renewal Approaching | 60 days | 14 days |

---

## Key Time Windows

| Action | Window | Why |
|--------|--------|-----|
| Speed-to-Lead Call | 5 minutes | 21x conversion boost |
| Quote Follow-up | 24 hours | While interest is high |
| Lead Escalation | 48 hours | Before lead goes cold |
| Renewal Start | 90 days | Time for remarketing |
| Win-Back Attempt | 30 days | Before memory fades |
| Referral Request | 45 days | Optimal satisfaction point |
| Review Request | 60 days | Service experienced |

---

# Part 6: FAQ & Troubleshooting

## Common Questions

### "Why did this task appear in my queue?"

Tasks are created automatically based on events. Check the task description for details about what triggered it. Common triggers:
- New lead → Initial contact task
- Quote sent → Follow-up task
- Document uploaded → Classification task
- SLA warning → Handle ticket task

### "A customer said they got an email I didn't send"

That's automation at work! Customers receive automated messages for:
- Speed-to-lead acknowledgment
- Quote delivery confirmation
- Renewal reminders
- Birthday greetings
- Payment reminders

These are sent on your behalf and include your contact information.

### "How do I stop automation for a specific customer?"

Contact your manager. Customers can be excluded from automation campaigns while maintaining their policies. This might be appropriate for:
- VIP clients who prefer personal contact only
- Customers who complained about email frequency
- Special circumstances requiring manual handling

### "The system created a duplicate task"

Tasks use idempotency keys to prevent duplicates, but timing edge cases can occur. Simply complete one and mark the other as "Not Needed." Report if you see a pattern.

### "I need to take action but there's no task"

You don't have to wait for automation! The system handles routine follow-up, but you can always reach out proactively. Update the record with your activity so automation knows to skip that touchpoint.

### "How do I know what the automation already sent?"

Check the activity timeline on the lead, quote, or policy record. All automated communications are logged with timestamps.

---

## When Automation Fails

### Symptoms of Problems

- Tasks not appearing when expected
- Customers not receiving emails
- SLA breaches without warning
- Duplicate communications

### What to Do

1. **Check the record's activity timeline** - Is automation logging actions?
2. **Check your spam/junk folder** - Are test emails landing there?
3. **Report to management** - Describe what you expected vs. what happened
4. **Document workarounds** - Note manual actions taken

### Who to Contact

| Issue | Contact |
|-------|---------|
| Tasks not appearing | brian@lewisinsurance.ai |
| Customer not receiving emails | brian@lewisinsurance.ai |
| Incorrect automation behavior | brian@lewisinsurance.ai |
| System completely down | brian@lewisinsurance.ai |

---

## Emergency: How to Pause Automations

If automation is causing problems, management can pause it:

**Pause all automations:**
- Contact: brian@lewisinsurance.ai
- Action: System-wide automation pause

**Pause specific customer:**
- Contact: brian@lewisinsurance.ai
- Action: Customer-level exclusion

**Important:** Pausing automation means manual handling of all affected processes. Use only when necessary.

---

## Best Practices

### Do:
- Complete tasks in priority order
- Log your activity in the system
- Update customer records with current information
- Report automation issues promptly
- Use automation insights to personalize conversations

### Don't:
- Ignore tasks (they represent customer needs)
- Fight the automation (work with it)
- Skip the personal touch (automation handles routine, you handle relationships)
- Assume automation covers everything (use judgment)
- Delete records to "clean up" (archive instead)

---

## Glossary

| Term | Definition |
|------|------------|
| **Automation Gateway** | Central system that processes all automation actions |
| **Idempotency** | Ensures actions only happen once, preventing duplicates |
| **LOB** | Line of Business (Auto, Home, Commercial, Life) |
| **Nurture Sequence** | Automated email series for not-yet-ready leads |
| **SLA** | Service Level Agreement (response/resolution time commitments) |
| **Win-Back** | Campaign to re-engage lapsed customers |
| **Cross-Sell** | Selling additional products to existing customers |
| **COI** | Certificate of Insurance |
| **Dec Page** | Declarations page showing policy coverage summary |
| **Loss Runs** | Claims history report from carriers |
| **Remarket** | Shopping a customer's coverage to find better options |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | December 29, 2024 | Lewis Insurance | Initial release |

---

**Questions about this manual?**
Contact: brian@lewisinsurance.ai

**Lewis Insurance**
*Your trusted insurance partner*

---

*This manual is confidential and intended for Lewis Insurance staff only. Do not distribute externally.*
