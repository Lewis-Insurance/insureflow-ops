# ACORD Form Automation Suite - Implementation Specification v2.0

## Document Purpose
Production-ready technical specification for implementing Sembley-like ACORD form automation in InsureFlow Ops. This document incorporates critical architectural decisions and addresses real-world operational concerns.

---

# CRITICAL ARCHITECTURAL DECISIONS

## 1. PDF Generation Strategy

### Problem
ACORD forms have precise field coordinates. Carriers reject forms where fields are misaligned by even a few pixels. Using jsPDF to generate forms from scratch is high-risk.

### Solution: Fillable PDF Template Overlay
Use **pdf-lib** to overlay data onto official ACORD PDF templates rather than generating from scratch.

```typescript
// Approach: Load official ACORD PDF, fill fields by name
import { PDFDocument } from 'pdf-lib';

async function fillAcordForm(templateUrl: string, fieldValues: Record<string, string>) {
  const templateBytes = await fetch(templateUrl).then(res => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  for (const [fieldName, value] of Object.entries(fieldValues)) {
    const field = form.getTextField(fieldName);
    if (field) field.setText(value);
  }

  return await pdfDoc.save();
}
```

### Implementation Requirements
- Source official fillable ACORD PDFs (purchase from ACORD.org or use carrier-provided versions)
- Map each PDF field name to our internal field schema
- Store templates in Supabase Storage with versioning
- Test output PDFs with actual carrier portals before launch

### Package Choice
```json
{
  "pdf-lib": "^1.17.1"  // Pure JS, works in browser and Edge Functions
}
```

---

## 2. Carrier Submission Reality

### Problem
Most carriers don't have submission APIs. They have portals requiring manual login.

### Solution: "Carrier-Ready Package" (Not Automated Submission)

**V1 Scope**: Generate carrier-ready PDF packages, NOT automated submission.

**What We Build**:
- Generate properly filled ACORD PDFs
- Bundle with supplemental documents (loss runs, COIs, driver MVRs)
- Provide carrier portal quick-links
- Show submission checklists per carrier
- Track submission status manually

**What We DON'T Build (V1)**:
- Direct carrier API integrations
- Automated portal login/submission
- IVANS/ACORD XML transmission

### Carrier Portal Registry
```typescript
interface CarrierPortal {
  carrierId: string;
  name: string;
  submissionUrl: string;
  requiredForms: string[];        // ["125", "126", "140"]
  requiredDocuments: string[];    // ["loss_runs", "driver_mvrs"]
  submissionChecklist: string[];  // Step-by-step instructions
  notes: string;                  // "Requires 5 years loss history"
}
```

---

## 3. Data Enrichment Cost Controls

### Problem
- ATTOM/CoreLogic: $0.10-$2.00 per lookup
- Clearbit: $99-500/month
- No cost controls = runaway spending

### Solution: Tiered Enrichment with Cost Controls

#### Cost Control Mechanisms
1. **Lookup Quotas**: X lookups per user per month (configurable by plan tier)
2. **Confirmation Required**: Show "This lookup costs ~$0.50. Proceed?" before enrichment
3. **Aggressive Caching**: 90-day cache (not 7 days) - property data rarely changes
4. **Manual Entry Fallback**: Always show "Enter manually" option alongside enrichment

#### Enrichment Tiers
```typescript
interface EnrichmentConfig {
  tier: 'basic' | 'standard' | 'premium';
  monthlyQuota: number;
  propertyLookups: boolean;
  businessLookups: boolean;
  vinDecoder: boolean;
  pricePerLookup: number;
}

const ENRICHMENT_TIERS: Record<string, EnrichmentConfig> = {
  basic: {
    tier: 'basic',
    monthlyQuota: 50,
    propertyLookups: true,
    businessLookups: false,
    vinDecoder: true,
    pricePerLookup: 0.25
  },
  standard: {
    tier: 'standard',
    monthlyQuota: 200,
    propertyLookups: true,
    businessLookups: true,
    vinDecoder: true,
    pricePerLookup: 0.50
  },
  premium: {
    tier: 'premium',
    monthlyQuota: 1000,
    propertyLookups: true,
    businessLookups: true,
    vinDecoder: true,
    pricePerLookup: 0.75
  }
};
```

#### Recommended API Providers (Cost-Effective Options)

**Property Data**:
- **Primary**: Zillow API (free tier available, then $0.10/lookup)
- **Fallback**: Melissa Data ($0.05/lookup for basic property)
- **Premium**: ATTOM ($0.50-2.00/lookup for comprehensive)

**Business Data**:
- **Primary**: Apollo.io (generous free tier, then $49/mo)
- **Fallback**: Hunter.io for basic company data (free tier)
- **Premium**: Clearbit ($99+/mo)

**VIN Decoder**:
- **NHTSA vPIC API**: FREE (government API, reliable)

#### Caching Strategy
```sql
-- 90-day cache with source tracking
CREATE TABLE enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key TEXT NOT NULL,
  lookup_type VARCHAR(20) NOT NULL,  -- 'property', 'business', 'vin'
  data JSONB NOT NULL,
  source VARCHAR(50) NOT NULL,       -- 'zillow', 'apollo', 'nhtsa'
  cost_cents INTEGER DEFAULT 0,      -- Track what we paid
  fetched_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days'),
  UNIQUE(lookup_key, lookup_type)
);

CREATE INDEX idx_enrichment_cache_expiry ON enrichment_cache(expires_at);
```

---

# MISSING ELEMENTS (NOW INCLUDED)

## 4. Field Validation Engine

### Problem
ACORD forms have complex dependencies: "If Box 23 is checked, Section 4 is required." This logic wasn't addressed.

### Solution: Validation Rules Schema

```typescript
interface ValidationRule {
  id: string;
  type: 'required' | 'conditional_required' | 'format' | 'range' | 'dependency';
  field: string;
  condition?: {
    dependsOn: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'checked';
    value: any;
  };
  message: string;
  severity: 'error' | 'warning';
}

// Example: If "Operations include subcontractors" is checked, "Subcontractor cost" is required
const exampleRule: ValidationRule = {
  id: 'subcontractor_cost_required',
  type: 'conditional_required',
  field: 'subcontractor_annual_cost',
  condition: {
    dependsOn: 'uses_subcontractors',
    operator: 'equals',
    value: true
  },
  message: 'Subcontractor annual cost is required when subcontractors are used',
  severity: 'error'
};
```

### Database Schema Addition
```sql
-- Add validation rules to acord_templates
ALTER TABLE acord_templates ADD COLUMN validation_rules JSONB DEFAULT '[]';

-- Validation rules structure:
-- [
--   {
--     "id": "rule_1",
--     "type": "conditional_required",
--     "field": "section_4_complete",
--     "condition": { "dependsOn": "box_23", "operator": "checked" },
--     "message": "Section 4 required when Box 23 is checked",
--     "severity": "error"
--   }
-- ]
```

### Validation Engine
```typescript
// src/lib/acordValidation.ts
export function validateAcordForm(
  formNumber: string,
  fieldValues: Record<string, any>,
  validationRules: ValidationRule[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  for (const rule of validationRules) {
    const result = evaluateRule(rule, fieldValues);
    if (!result.valid) {
      if (rule.severity === 'error') {
        errors.push({ field: rule.field, message: rule.message });
      } else {
        warnings.push({ field: rule.field, message: rule.message });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    completionPercentage: calculateCompletion(fieldValues, validationRules)
  };
}
```

---

## 5. Form Versioning Strategy

### Problem
ACORD updates forms periodically. What happens to in-progress submissions using old versions?

### Solution: Version-Locked Submissions

**Principles**:
1. Each submission locks to the template version at creation time
2. Old-version submissions can be completed (never auto-migrate in-progress work)
3. New submissions always use current version
4. Provide optional migration tool for agents who want to upgrade

```sql
-- Templates have versions
CREATE TABLE acord_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number VARCHAR(10) NOT NULL,
  form_name TEXT NOT NULL,
  version VARCHAR(20) NOT NULL,           -- "2016/03", "2023/01"
  is_current BOOLEAN DEFAULT FALSE,       -- Only one current per form_number
  effective_date DATE,
  sunset_date DATE,                       -- When carriers stop accepting
  field_schema JSONB NOT NULL,
  validation_rules JSONB DEFAULT '[]',
  pdf_template_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(form_number, version)
);

-- Submissions lock to a specific template version
CREATE TABLE acord_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  template_id UUID REFERENCES acord_templates(id),  -- Locks to specific version
  -- ... other fields
);

-- Index for finding current templates
CREATE INDEX idx_acord_templates_current ON acord_templates(form_number) WHERE is_current = TRUE;
```

### Version Management UI
- Show badge: "Using ACORD 125 (2016/03) - Newer version available"
- "Upgrade to current version" button (creates new form, preserves old)
- Sunset warnings: "This form version expires in 30 days"

---

## 6. Audit Trail for E&O Protection

### Problem
For E&O (Errors & Omissions) protection, you need to know who entered what data when - especially for submissions that result in claims.

### Solution: Field-Level Change Tracking

```sql
-- Track every field change
CREATE TABLE acord_field_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  change_source VARCHAR(20) NOT NULL,  -- 'manual', 'intake', 'enrichment', 'import'
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_acord_audit_form ON acord_field_audit(acord_form_id);
CREATE INDEX idx_acord_audit_timestamp ON acord_field_audit(changed_at);

-- View: Full audit history for a form
CREATE VIEW acord_form_audit_history AS
SELECT
  af.id as form_id,
  af.form_number,
  afa.field_name,
  afa.old_value,
  afa.new_value,
  p.full_name as changed_by_name,
  afa.changed_at,
  afa.change_source
FROM acord_forms af
JOIN acord_field_audit afa ON af.id = afa.acord_form_id
LEFT JOIN profiles p ON afa.changed_by = p.id
ORDER BY afa.changed_at DESC;
```

### Audit Capture Hook
```typescript
// src/hooks/useAcordFieldAudit.ts
export function useAcordFieldAudit(formId: string) {
  const { mutate: logChange } = useMutation({
    mutationFn: async (change: FieldChange) => {
      await supabase.from('acord_field_audit').insert({
        acord_form_id: formId,
        field_name: change.field,
        old_value: change.oldValue,
        new_value: change.newValue,
        change_source: change.source,
        // changed_by auto-set via RLS
      });
    }
  });

  return { logChange };
}
```

---

## 7. Client Offline/Save Progress

### Problem
Public intakes can be long. Client closes browser, loses everything.

### Solution: Multi-Layer Save Strategy

#### Layer 1: Auto-Save to localStorage (Every 30 Seconds)
```typescript
// src/components/intake/useIntakeAutoSave.ts
export function useIntakeAutoSave(intakeId: string, responses: Record<string, any>) {
  useEffect(() => {
    const interval = setInterval(() => {
      localStorage.setItem(`intake_progress_${intakeId}`, JSON.stringify({
        responses,
        savedAt: new Date().toISOString()
      }));
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [intakeId, responses]);
}

// On page load, offer to restore
export function useIntakeRestore(intakeId: string) {
  const [savedProgress, setSavedProgress] = useState<SavedProgress | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(`intake_progress_${intakeId}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      const savedDate = new Date(parsed.savedAt);
      const hoursSinceSave = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60);

      if (hoursSinceSave < 72) { // 72 hour restoration window
        setSavedProgress(parsed);
      }
    }
  }, [intakeId]);

  return { savedProgress, clearSavedProgress: () => localStorage.removeItem(`intake_progress_${intakeId}`) };
}
```

#### Layer 2: Server-Side Draft Saving
```sql
-- Drafts auto-save to server every 2 minutes (if client has connectivity)
ALTER TABLE intake_submissions ADD COLUMN draft_responses JSONB;
ALTER TABLE intake_submissions ADD COLUMN last_draft_save TIMESTAMP;
```

#### Layer 3: Return-Later Email Link
```typescript
// After initial save, offer "Email me a link to continue later"
async function sendReturnLink(intakeId: string, email: string) {
  const token = generateSecureToken();

  await supabase.from('intake_submissions').update({
    client_email: email,
    access_token: token
  }).eq('id', intakeId);

  await sendEmail({
    to: email,
    subject: 'Continue Your Insurance Application',
    body: `Continue where you left off: ${APP_URL}/intake/${token}`
  });
}
```

---

# ENHANCED FEATURES

## 8. Smart Defaults & Prefill

### Business Lookup by Name
```typescript
// When agent enters business name, offer to lookup
async function lookupBusinessByName(businessName: string) {
  // 1. Check cache first
  const cached = await getCachedEnrichment(businessName, 'business');
  if (cached) return cached;

  // 2. Show confirmation with cost
  const confirmed = await confirmEnrichmentLookup('business', 0.25);
  if (!confirmed) return null;

  // 3. Perform lookup
  const data = await apolloApi.searchCompany(businessName);

  // 4. Cache result
  await cacheEnrichmentResult(businessName, 'business', data);

  return {
    naicsCode: data.naics,
    sicCode: data.sic,
    employeeCount: data.employee_count,
    annualRevenue: data.annual_revenue,
    address: data.address
  };
}
```

### VIN Decoder (FREE - NHTSA API)
```typescript
// Free VIN decoding via government API
async function decodeVin(vin: string) {
  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`
  );
  const data = await response.json();

  return {
    make: findValue(data, 'Make'),
    model: findValue(data, 'Model'),
    year: findValue(data, 'Model Year'),
    vehicleType: findValue(data, 'Vehicle Type'),
    bodyClass: findValue(data, 'Body Class'),
    gvwr: findValue(data, 'GVWR')
  };
}
```

### Property Prefill from Address
```typescript
interface PropertyEnrichment {
  squareFootage: number;
  yearBuilt: number;
  constructionType: string;  // 'frame', 'masonry', 'fire_resistive'
  roofType: string;
  stories: number;
  lastSaleDate: string;
  lastSalePrice: number;
  estimatedValue: number;
}
```

---

## 9. Form Cloning

### Problem
Agents often quote similar businesses. Need one-click copy for new accounts.

### Solution
```typescript
// Clone submission for different account
async function cloneAcordSubmission(
  sourceFormId: string,
  targetAccountId: string,
  fieldsToPreserve: string[]  // e.g., ['business_type', 'coverage_limits']
) {
  const sourceForm = await getAcordForm(sourceFormId);

  // Copy preserved fields, clear account-specific fields
  const clonedValues = {};
  for (const field of fieldsToPreserve) {
    clonedValues[field] = sourceForm.field_values[field];
  }

  // Clear fields that must be re-entered
  const accountSpecificFields = ['insured_name', 'address', 'fein', 'contact_info'];
  // These are NOT copied

  return await createAcordForm({
    account_id: targetAccountId,
    template_id: sourceForm.template_id,
    field_values: clonedValues,
    cloned_from: sourceFormId
  });
}
```

### UI: "Clone for Similar Account"
- Select which sections to copy
- Auto-clear: Insured name, addresses, FEIN, contact info
- Preserve: Coverage limits, classification codes, operations description

---

## 10. Submission Packages

### Problem
Carriers want multiple documents bundled together.

### Solution: Package Builder
```typescript
interface SubmissionPackage {
  id: string;
  account_id: string;
  carrier_id: string;
  name: string;
  documents: PackageDocument[];
  created_at: Date;
  status: 'draft' | 'complete' | 'submitted';
}

interface PackageDocument {
  type: 'acord_form' | 'loss_runs' | 'driver_mvr' | 'certificate' | 'supplemental' | 'other';
  document_id?: string;  // Reference to existing document
  file_url?: string;     // Uploaded file
  required: boolean;
  status: 'missing' | 'uploaded' | 'generated';
}

// Carrier requirements define what's needed
interface CarrierRequirements {
  carrier_id: string;
  line_of_business: string;
  required_documents: {
    type: string;
    description: string;
  }[];
}
```

### Package Builder UI
```
┌─────────────────────────────────────────────────────────────┐
│ Submission Package: ABC Company - Progressive Commercial    │
├─────────────────────────────────────────────────────────────┤
│ Required Documents:                                         │
│ ☑ ACORD 125 - Commercial Application         [Generated]    │
│ ☑ ACORD 126 - General Liability              [Generated]    │
│ ☑ ACORD 140 - Property Section               [Generated]    │
│ ☐ 5-Year Loss Runs                           [Upload]       │
│ ☐ Current Declarations Page                  [Upload]       │
│ ☑ Certificate of Insurance                   [Generated]    │
│                                                             │
│ Optional Documents:                                         │
│ ☐ Building Photos                            [Upload]       │
│ ☐ Safety Program Documentation               [Upload]       │
│                                                             │
│ [Download Complete Package as ZIP]  [Open Carrier Portal]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Comparative View (Year-over-Year)

### Problem
Need to catch coverage changes and ensure nothing was missed from last year.

### Solution: Side-by-Side Comparison
```typescript
interface FormComparison {
  field_name: string;
  field_label: string;
  prior_value: any;
  current_value: any;
  change_type: 'unchanged' | 'increased' | 'decreased' | 'modified' | 'added' | 'removed';
  significance: 'normal' | 'attention' | 'critical';
}

async function compareToLastYear(currentFormId: string): Promise<FormComparison[]> {
  const current = await getAcordForm(currentFormId);
  const prior = await getPriorYearForm(current.account_id, current.form_number);

  if (!prior) return []; // No prior year to compare

  const comparisons: FormComparison[] = [];

  for (const field of Object.keys(current.field_values)) {
    const priorValue = prior.field_values[field];
    const currentValue = current.field_values[field];

    if (priorValue !== currentValue) {
      comparisons.push({
        field_name: field,
        field_label: getFieldLabel(field),
        prior_value: priorValue,
        current_value: currentValue,
        change_type: determineChangeType(priorValue, currentValue),
        significance: determineSignificance(field, priorValue, currentValue)
      });
    }
  }

  return comparisons;
}
```

### UI: Changes Highlighted
```
┌─────────────────────────────────────────────────────────────┐
│ Coverage Comparison: 2024 vs 2025                           │
├─────────────────────────────────────────────────────────────┤
│ Field                    │ 2024          │ 2025            │
├─────────────────────────────────────────────────────────────┤
│ General Liability Limit  │ $1,000,000    │ $2,000,000  ↑   │
│ Property Coverage        │ $500,000      │ $500,000        │
│ Employee Count           │ 25            │ 32          ↑   │
│ ⚠️ Subcontractors Used   │ No            │ Yes         *   │
│ Annual Payroll           │ $1,200,000    │ $1,450,000  ↑   │
└─────────────────────────────────────────────────────────────┘
│ * Requires additional section completion                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 12. Producer Collaboration & Section Tracking

### Problem
Multiple producers may work on the same submission. Need to track who completed what.

### Solution: Section-Level Completion Tracking
```sql
-- Track completion by section
CREATE TABLE acord_form_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL,
  section_name TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'incomplete',  -- incomplete, in_progress, complete, flagged
  assigned_to UUID REFERENCES profiles(id),
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMP,
  notes TEXT,
  UNIQUE(acord_form_id, section_number)
);

-- Example sections for ACORD 125
-- Section 1: Applicant Information
-- Section 2: Contact Information
-- Section 3: Business/Operations
-- Section 4: Coverage Requested
-- Section 5: Prior Insurance
-- Section 6: Loss History
```

### Collaboration UI
```
┌─────────────────────────────────────────────────────────────┐
│ ACORD 125 - Section Status                                  │
├─────────────────────────────────────────────────────────────┤
│ ☑ Section 1: Applicant Info      │ Complete │ John S.       │
│ ☑ Section 2: Contact Info        │ Complete │ John S.       │
│ ◐ Section 3: Business/Operations │ In Progress │ Mary T.    │
│ ☐ Section 4: Coverage Requested  │ Assigned │ Mary T.       │
│ ⚑ Section 5: Prior Insurance     │ Flagged  │ Waiting on client │
│ ☐ Section 6: Loss History        │ Not Started │ Unassigned │
├─────────────────────────────────────────────────────────────┤
│ Overall: 33% Complete │ 2 of 6 sections done               │
└─────────────────────────────────────────────────────────────┘
```

---

# REVISED ARCHITECTURE

## 13. Separate Intake Engine from ACORD Engine

### Principle
Keep intake rendering completely decoupled from ACORD generation.

### Benefits
- Intakes for non-ACORD purposes (claims FNOL, customer surveys, satisfaction surveys)
- Multiple ACORD forms from one intake
- Easier testing of each component
- Intake engine can evolve independently

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    INTAKE ENGINE                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Form Builder │  │ Renderer    │  │ Submissions │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Responses (JSONB)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   MAPPING LAYER                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Field Mappings: Intake Question → ACORD Field(s)    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Mapped Field Values
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ACORD ENGINE                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Validation  │  │ PDF Filler  │  │ Versioning  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. Field Mappings as First-Class Entity

### Problem
Embedding mappings in JSONB makes them hard to query, audit, and debug.

### Solution: Dedicated Mapping Table
```sql
-- First-class field mappings
CREATE TABLE intake_acord_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_template_id UUID REFERENCES intake_templates(id) ON DELETE CASCADE,
  intake_question_id TEXT NOT NULL,      -- Question identifier in intake
  acord_form_number VARCHAR(10) NOT NULL,
  acord_field_name TEXT NOT NULL,        -- Field name in PDF
  transform_type VARCHAR(20) DEFAULT 'direct',  -- direct, format, calculate, lookup
  transform_config JSONB,                -- Transformation parameters
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(intake_template_id, intake_question_id, acord_form_number, acord_field_name)
);

-- Transform types:
-- 'direct': Copy value as-is
-- 'format': Apply formatting (e.g., date format, phone format)
-- 'calculate': Compute value (e.g., total = sum of items)
-- 'lookup': Map value via lookup table (e.g., state code → state name)
-- 'concatenate': Combine multiple intake fields into one ACORD field

CREATE INDEX idx_mappings_intake ON intake_acord_mappings(intake_template_id);
CREATE INDEX idx_mappings_acord ON intake_acord_mappings(acord_form_number);
```

### Queryable Mappings Enable
```sql
-- "What intake questions populate ACORD 125?"
SELECT iq.question_text, iam.acord_field_name
FROM intake_acord_mappings iam
JOIN intake_questions iq ON iq.id = iam.intake_question_id
WHERE iam.acord_form_number = '125';

-- "Is this ACORD field populated by any intake?"
SELECT * FROM intake_acord_mappings
WHERE acord_field_name = 'NAMEDINSURED';

-- "Audit: What changed in mappings this week?"
SELECT * FROM intake_acord_mappings
WHERE created_at > NOW() - INTERVAL '7 days';
```

---

## 15. Queue-Based PDF Generation

### Problem
Generating 5 ACORD forms simultaneously is CPU-intensive. Synchronous generation blocks the UI.

### Solution: Background Processing Queue
```typescript
// Client initiates generation
async function requestFormGeneration(formIds: string[]) {
  const jobId = await supabase.functions.invoke('queue-acord-generation', {
    body: { formIds, userId: currentUser.id }
  });

  return jobId; // Client polls for status or subscribes to realtime
}

// Edge Function: Queue processor
// supabase/functions/queue-acord-generation/index.ts
export async function handler(req: Request) {
  const { formIds, userId } = await req.json();

  // Create job record
  const job = await supabase.from('acord_generation_jobs').insert({
    form_ids: formIds,
    requested_by: userId,
    status: 'queued'
  }).select().single();

  // Process asynchronously (Supabase Edge Functions have 60s timeout)
  // For longer jobs, use a background worker pattern

  for (const formId of formIds) {
    await updateJobStatus(job.id, 'processing', formId);

    const form = await getAcordForm(formId);
    const template = await getTemplate(form.template_id);

    // Generate PDF
    const pdfBytes = await fillAcordPdf(template.pdf_template_url, form.field_values);

    // Upload to storage
    const pdfUrl = await uploadToStorage(pdfBytes, `acord/${formId}.pdf`);

    // Update form record
    await supabase.from('acord_forms').update({ pdf_url: pdfUrl }).eq('id', formId);
  }

  await updateJobStatus(job.id, 'complete');

  // Notify user via realtime or email
  await notifyUser(userId, `Your ${formIds.length} ACORD forms are ready`);
}
```

### Job Status Tracking
```sql
CREATE TABLE acord_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_ids UUID[] NOT NULL,
  requested_by UUID REFERENCES profiles(id),
  status VARCHAR(20) DEFAULT 'queued',  -- queued, processing, complete, failed
  current_form_id UUID,
  progress_percent INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

# COMPLETE DATABASE SCHEMA

```sql
-- ============================================
-- ACORD FORM AUTOMATION - COMPLETE SCHEMA
-- ============================================

-- ACORD Form Templates (versioned, with validation rules)
CREATE TABLE acord_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_number VARCHAR(10) NOT NULL,
  form_name TEXT NOT NULL,
  version VARCHAR(20) NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  effective_date DATE,
  sunset_date DATE,
  field_schema JSONB NOT NULL,
  validation_rules JSONB DEFAULT '[]',
  section_definitions JSONB DEFAULT '[]',
  pdf_template_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(form_number, version)
);

-- Custom Intake Templates
CREATE TABLE intake_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  intake_type VARCHAR(20) DEFAULT 'acord',  -- acord, survey, fnol, general
  questions JSONB NOT NULL,
  settings JSONB DEFAULT '{}',
  branding JSONB DEFAULT '{}',
  is_published BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- First-Class Field Mappings
CREATE TABLE intake_acord_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_template_id UUID REFERENCES intake_templates(id) ON DELETE CASCADE,
  intake_question_id TEXT NOT NULL,
  acord_form_number VARCHAR(10) NOT NULL,
  acord_field_name TEXT NOT NULL,
  transform_type VARCHAR(20) DEFAULT 'direct',
  transform_config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(intake_template_id, intake_question_id, acord_form_number, acord_field_name)
);

-- Intake Submissions (client responses)
CREATE TABLE intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES intake_templates(id),
  account_id UUID REFERENCES accounts(id),
  access_token VARCHAR(64) UNIQUE NOT NULL,
  responses JSONB DEFAULT '{}',
  draft_responses JSONB,
  last_draft_save TIMESTAMP,
  status VARCHAR(20) DEFAULT 'draft',
  client_email TEXT,
  client_name TEXT,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Generated ACORD Forms
CREATE TABLE acord_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  template_id UUID REFERENCES acord_templates(id),
  intake_submission_id UUID REFERENCES intake_submissions(id),
  field_values JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  cloned_from UUID REFERENCES acord_forms(id),
  signature_status VARCHAR(20) DEFAULT 'unsigned',
  signature_request_id TEXT,
  submission_status VARCHAR(20) DEFAULT 'draft',
  submitted_to TEXT,
  submitted_at TIMESTAMP,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Section-Level Completion Tracking
CREATE TABLE acord_form_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL,
  section_name TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'incomplete',
  assigned_to UUID REFERENCES profiles(id),
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMP,
  notes TEXT,
  UNIQUE(acord_form_id, section_number)
);

-- Field-Level Audit Trail (E&O Protection)
CREATE TABLE acord_field_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMP DEFAULT NOW(),
  change_source VARCHAR(20) NOT NULL,
  ip_address INET,
  user_agent TEXT
);

-- Enrichment Cache (90-day TTL)
CREATE TABLE enrichment_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_key TEXT NOT NULL,
  lookup_type VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  source VARCHAR(50) NOT NULL,
  cost_cents INTEGER DEFAULT 0,
  fetched_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '90 days'),
  UNIQUE(lookup_key, lookup_type)
);

-- Enrichment Usage Tracking (for quotas)
CREATE TABLE enrichment_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  lookup_type VARCHAR(20) NOT NULL,
  lookup_key TEXT NOT NULL,
  cost_cents INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- PDF Generation Job Queue
CREATE TABLE acord_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_ids UUID[] NOT NULL,
  requested_by UUID REFERENCES profiles(id),
  status VARCHAR(20) DEFAULT 'queued',
  current_form_id UUID,
  progress_percent INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Carrier Portal Registry
CREATE TABLE carrier_portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name TEXT NOT NULL,
  carrier_code VARCHAR(20),
  submission_url TEXT,
  required_forms TEXT[],
  required_documents TEXT[],
  submission_checklist JSONB,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Submission Packages
CREATE TABLE submission_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  carrier_id UUID REFERENCES carrier_portals(id),
  name TEXT NOT NULL,
  documents JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'draft',
  package_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_acord_templates_current ON acord_templates(form_number) WHERE is_current = TRUE;
CREATE INDEX idx_intake_submissions_token ON intake_submissions(access_token);
CREATE INDEX idx_intake_submissions_account ON intake_submissions(account_id);
CREATE INDEX idx_acord_forms_account ON acord_forms(account_id);
CREATE INDEX idx_acord_forms_template ON acord_forms(template_id);
CREATE INDEX idx_acord_audit_form ON acord_field_audit(acord_form_id);
CREATE INDEX idx_acord_audit_timestamp ON acord_field_audit(changed_at);
CREATE INDEX idx_mappings_intake ON intake_acord_mappings(intake_template_id);
CREATE INDEX idx_mappings_acord ON intake_acord_mappings(acord_form_number);
CREATE INDEX idx_enrichment_cache_expiry ON enrichment_cache(expires_at);
CREATE INDEX idx_enrichment_usage_user ON enrichment_usage(user_id, created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE acord_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE acord_field_audit ENABLE ROW LEVEL SECURITY;

-- Policies (similar to existing patterns in the codebase)
-- ... (implement based on existing RLS patterns)
```

---

# IMPLEMENTATION PHASES (REVISED)

## Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema migration
- [ ] Source and upload fillable ACORD PDF templates (125, 126, 127, 130, 140)
- [ ] Install pdf-lib and create PDF filling utility
- [ ] Create ACORD field schema definitions for each form
- [ ] Basic form library UI (view templates)
- [ ] Test PDF generation against carrier requirements

## Phase 2: Intake Engine (Weeks 3-4)
- [ ] Intake Builder UI (drag-drop)
- [ ] Question type components (text, select, date, file, conditional)
- [ ] Public intake portal route (no auth)
- [ ] Auto-save (localStorage + server draft)
- [ ] Return-later email links
- [ ] Intake submission flow

## Phase 3: Mapping Layer (Weeks 5-6)
- [ ] First-class field mappings table
- [ ] Mapping builder UI
- [ ] Transform types (direct, format, calculate, concatenate)
- [ ] Intake → ACORD generation pipeline
- [ ] Validation engine with conditional rules
- [ ] Field-level audit logging

## Phase 4: Enrichment (Weeks 7-8)
- [ ] VIN decoder (NHTSA - free)
- [ ] Property enrichment (Zillow/Melissa)
- [ ] Business enrichment (Apollo)
- [ ] Cost controls and quota system
- [ ] Cache management
- [ ] Manual entry fallback UI

## Phase 5: Signatures & Packages (Weeks 9-10)
- [ ] HelloSign integration
- [ ] Signature request UI
- [ ] Webhook handler for signature events
- [ ] Carrier portal registry
- [ ] Submission package builder
- [ ] ZIP download for complete packages

## Phase 6: Advanced Features (Weeks 11-12)
- [ ] Form versioning with migration tools
- [ ] Year-over-year comparison view
- [ ] Section-level completion tracking
- [ ] Form cloning
- [ ] Background PDF generation queue
- [ ] Producer collaboration features

---

# FILE STRUCTURE

```
src/
├── components/
│   ├── acord/
│   │   ├── AcordFormLibrary.tsx
│   │   ├── AcordFormViewer.tsx
│   │   ├── AcordFormEditor.tsx
│   │   ├── AcordValidationPanel.tsx
│   │   ├── AcordComparisonView.tsx
│   │   ├── AcordSectionTracker.tsx
│   │   └── fields/
│   │       ├── Acord125Fields.ts
│   │       ├── Acord126Fields.ts
│   │       ├── Acord127Fields.ts
│   │       ├── Acord130Fields.ts
│   │       └── Acord140Fields.ts
│   │
│   ├── intake/
│   │   ├── IntakeBuilder.tsx
│   │   ├── IntakePreview.tsx
│   │   ├── IntakeRenderer.tsx
│   │   ├── IntakeSubmissions.tsx
│   │   ├── IntakeMappingBuilder.tsx
│   │   ├── questions/
│   │   │   ├── TextQuestion.tsx
│   │   │   ├── SelectQuestion.tsx
│   │   │   ├── DateQuestion.tsx
│   │   │   ├── FileUploadQuestion.tsx
│   │   │   └── ConditionalLogic.tsx
│   │   └── hooks/
│   │       ├── useIntakeAutoSave.ts
│   │       └── useIntakeRestore.ts
│   │
│   ├── enrichment/
│   │   ├── PropertyEnrichment.tsx
│   │   ├── BusinessEnrichment.tsx
│   │   ├── VinDecoder.tsx
│   │   ├── EnrichmentQuotaDisplay.tsx
│   │   └── ManualEntryFallback.tsx
│   │
│   ├── signature/
│   │   ├── HelloSignIntegration.tsx
│   │   ├── SignatureRequest.tsx
│   │   └── SignatureStatus.tsx
│   │
│   └── carrier/
│       ├── CarrierPortalRegistry.tsx
│       ├── SubmissionPackageBuilder.tsx
│       └── SubmissionChecklist.tsx
│
├── pages/
│   ├── AcordForms.tsx
│   ├── IntakeBuilder.tsx
│   ├── IntakeTemplates.tsx
│   └── PublicIntake.tsx          # No auth required
│
├── lib/
│   ├── acordPdfFiller.ts         # pdf-lib wrapper
│   ├── acordValidation.ts        # Validation engine
│   ├── acordMapping.ts           # Mapping processor
│   └── enrichmentApi.ts          # API clients
│
├── hooks/
│   ├── useAcordForms.ts
│   ├── useAcordFieldAudit.ts
│   ├── useIntakeTemplates.ts
│   ├── useEnrichment.ts
│   └── useEnrichmentQuota.ts
│
└── types/
    ├── acord.ts
    ├── intake.ts
    └── enrichment.ts

supabase/functions/
├── queue-acord-generation/
├── hellosign-webhook/
├── hellosign-create-request/
├── property-enrichment/
├── business-enrichment/
└── vin-decode/
```

---

# SUCCESS CRITERIA

| Metric | Target | Measurement |
|--------|--------|-------------|
| PDF Carrier Acceptance | 100% | Test with 5 major carriers |
| Intake Completion Rate | >80% | Submissions / Started |
| Auto-Save Recovery | 100% | Lost work incidents = 0 |
| Enrichment Cache Hit Rate | >70% | Cached lookups / Total lookups |
| Form Generation Time | <10s | 95th percentile |
| Validation Accuracy | >95% | Carrier rejections from validation misses |

---

*Document Version: 2.0*
*Updated: December 18, 2025*
*Incorporates: PDF overlay strategy, cost controls, validation engine, audit trail, versioning, collaboration features, architectural separation*
