# eSignature Integration - Dropbox Sign

## Overview

InsureFlow integrates with Dropbox Sign (formerly HelloSign) to provide electronic signature capabilities for insurance documents, ACORD forms, and other legal documents. This enables clients to sign documents remotely without printing, scanning, or mailing.

**Status:** Implemented (December 2024)
**Provider:** Dropbox Sign (HelloSign API v3)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│  esign-create-request │────▶│  Dropbox Sign   │
│ (React + Modal) │     │   (Edge Function)     │     │      API        │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
                                  │                          │
                                  ▼                          │
                        ┌──────────────────┐                 │
                        │ signature_requests│                 │
                        │    (Supabase)    │◀────────────────┘
                        └──────────────────┘        (webhook)
                                  ▲
                                  │
                        ┌──────────────────┐
                        │  esign-webhook   │
                        │ (Edge Function)  │
                        └──────────────────┘
```

---

## Components

### Edge Functions

#### 1. esign-create-request
**Location:** `supabase/functions/esign-create-request/index.ts`

Creates signature requests via Dropbox Sign API:
- Uploads documents via URL
- Configures signers with email/name
- Sets signature field positions
- Stores request in database
- Returns signing URLs

**Endpoint:** `POST /functions/v1/esign-create-request`

**Request Body:**
```typescript
{
  document_url: string;      // URL to PDF document
  document_name: string;     // Display name
  signers: Array<{
    email: string;
    name: string;
    role: string;           // 'applicant', 'agent', etc.
    order?: number;
  }>;
  form_number?: string;      // ACORD form number (e.g., '125')
  acord_form_id?: string;    // UUID of ACORD form record
  message?: string;          // Custom message to signers
  expires_in_days?: number;  // Default: 14
  signature_fields?: Array<SignatureField>;  // Optional field positions
}
```

**Response:**
```typescript
{
  success: true;
  data: {
    id: string;                    // Database record ID
    external_request_id: string;   // Dropbox Sign request ID
    status: 'sent';
    signing_url: string;           // URL for embedded signing
    signers: Array<{
      email: string;
      name: string;
      status: string;
    }>;
    expires_at: string;
  }
}
```

#### 2. esign-webhook
**Location:** `supabase/functions/esign-webhook/index.ts`

Receives webhook events from Dropbox Sign:
- Signature viewed, signed, declined
- Request completed, expired, cancelled
- Updates database status
- Stores signed document URL

**Endpoint:** `POST /functions/v1/esign-webhook`

**Webhook URL (configure in Dropbox Sign):**
```
https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/esign-webhook
```

**Handled Events:**
- `signature_request_sent` - Request sent to signers
- `signature_request_viewed` - Signer opened the document
- `signature_request_signed` - Individual signer completed
- `signature_request_all_signed` - All signers completed
- `signature_request_declined` - Signer declined
- `signature_request_expired` - Request expired
- `signature_request_canceled` - Request cancelled
- `signature_request_downloadable` - Signed PDF ready

---

### Frontend Components

#### SignatureRequestModal
**Location:** `src/components/signatures/SignatureRequestModal.tsx`

Modal dialog for sending documents for signature:
- Configure signers (name, email, role)
- Custom message to signers
- Expiration settings (7-90 days)
- Auto-detects required signers from ACORD form config
- Validates email addresses
- Calls edge function on submit

**Usage:**
```tsx
import { SignatureRequestModal } from '@/components/signatures';

<SignatureRequestModal
  open={isOpen}
  onOpenChange={setIsOpen}
  documentUrl="https://storage.example.com/document.pdf"
  documentName="ACORD 125 - Commercial Application"
  formNumber="125"
  acordFormId="uuid-here"
  defaultSigners={[
    { role: 'applicant', name: 'John Smith', email: 'john@example.com' }
  ]}
  onSuccess={(requestId) => {
    console.log('Request created:', requestId);
  }}
/>
```

#### SignatureStatusTracker
**Location:** `src/components/signatures/SignatureStatusTracker.tsx`

Displays signature request status with real-time updates:
- Progress bar showing % complete
- Individual signer status (pending, viewed, signed)
- Actions: resend reminder, cancel request
- Download signed document when complete
- Auto-updates via Supabase realtime subscriptions

**Usage:**
```tsx
import { SignatureStatusTracker } from '@/components/signatures';

// Track all requests for an ACORD form
<SignatureStatusTracker acordFormId="uuid-here" />

// Track a specific request
<SignatureStatusTracker requestId="uuid-here" />
```

---

### Hook

#### useSignature
**Location:** `src/hooks/useSignature.ts`

React hook for signature operations:

```typescript
const {
  // Configuration helpers
  getConfig,          // Get signature config for form number
  getAnchors,         // Get signature field anchors
  getRequiredRoles,   // Get required signer roles

  // Request operations
  createRequest,      // Create new signature request
  cancelRequest,      // Cancel pending request
  resendRequest,      // Resend to a signer
  getRequest,         // Get single request
  getRequestsForForm, // Get all requests for a form

  // State
  isLoading,
  error,
} = useSignature();

// Create a signature request
const result = await createRequest({
  acordFormId: 'uuid',
  formNumber: '125',
  documentUrl: 'https://...',
  documentName: 'ACORD 125',
  signers: [
    { role: 'applicant', name: 'John', email: 'john@example.com', order: 1 }
  ],
  message: 'Please sign this application',
  expirationDays: 14,
});
```

---

## Database Schema

### signature_requests table
**Location:** `supabase/migrations/20251218210000_acord_signatures_tracking.sql`

```sql
CREATE TABLE signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acord_form_id UUID REFERENCES acord_forms(id),
  form_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  signers JSONB NOT NULL DEFAULT '[]',
  anchors JSONB DEFAULT '[]',
  message TEXT,
  external_request_id TEXT,         -- Dropbox Sign request ID
  external_provider TEXT,           -- 'dropbox_sign'
  document_url TEXT,
  signed_document_url TEXT,         -- Populated after completion
  expires_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Status values:
-- 'draft', 'pending', 'sent', 'partial', 'completed', 'declined', 'expired', 'cancelled'
```

### esign_settings table
**Location:** `supabase/migrations/20251222000003_system_configuration_tables.sql`

Global eSignature provider configuration:
```sql
CREATE TABLE esign_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT DEFAULT 'hellosign',  -- 'hellosign', 'docusign', 'pandadoc'
  hellosign_api_key_set BOOLEAN DEFAULT false,
  hellosign_client_id TEXT,
  default_reminder_days INTEGER DEFAULT 3,
  default_expiration_days INTEGER DEFAULT 30,
  is_configured BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Signature Anchor Configuration

### ACORD Form Signature Positions
**Location:** `src/lib/acord/signatureAnchors.ts`

Pre-configured signature field positions for ACORD forms:

| Form | Signers Required | Fields |
|------|-----------------|--------|
| ACORD 125 | Applicant + Agent | Signature + Date for each |
| ACORD 126 | Applicant only | Signature + Date |
| ACORD 127 | Applicant only | Signature + Date |
| ACORD 130 | Applicant + Agent | Signature + Printed Name + Date |
| ACORD 140 | Applicant only | Signature + Date |

**SignerRole types:**
- `applicant` - Primary applicant
- `co_applicant` - Secondary applicant
- `agent` - Insurance agent/broker
- `producer` - Producer (same as agent)
- `authorized_representative` - Company representative
- `witness` - Witness signature

---

## Configuration

### Required Secrets

Add to Supabase Edge Functions secrets:

```bash
# Dropbox Sign API key (get from Dropbox Sign dashboard)
DROPBOX_ACCESS_TOKEN=your_api_key_here
```

### Dropbox Sign Dashboard Setup

1. **Create API App:**
   - Go to [Dropbox Sign Developer Portal](https://app.hellosign.com/api/dashboard)
   - Create new API application
   - Copy API key

2. **Configure Webhook:**
   - Go to API Settings → Webhooks
   - Add webhook URL: `https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/esign-webhook`
   - Select all events

3. **Test Mode:**
   - Enable test mode for development
   - Test signatures don't count against quota

### Frontend Settings

Configure in `ESignatureSettings.tsx` component (Admin panel):
- Select provider (Dropbox Sign, DocuSign, PandaDoc)
- Enter Client ID for embedded signing
- Set default reminder/expiration days

---

## Usage Flow

### 1. Send Document for Signature

```tsx
// In a form detail page
import { SignatureRequestModal } from '@/components/signatures';
import { useState } from 'react';

function FormDetailPage({ formId, formNumber, documentUrl }) {
  const [showSignModal, setShowSignModal] = useState(false);

  return (
    <>
      <Button onClick={() => setShowSignModal(true)}>
        <Send className="mr-2 h-4 w-4" />
        Send for Signature
      </Button>

      <SignatureRequestModal
        open={showSignModal}
        onOpenChange={setShowSignModal}
        documentUrl={documentUrl}
        documentName={`ACORD ${formNumber}`}
        formNumber={formNumber}
        acordFormId={formId}
        onSuccess={(id) => {
          toast({ title: 'Sent for signature' });
          setShowSignModal(false);
        }}
      />
    </>
  );
}
```

### 2. Track Signature Status

```tsx
// Show status on form detail page
import { SignatureStatusTracker } from '@/components/signatures';

function FormDetailPage({ formId }) {
  return (
    <div>
      <h2>Signature Requests</h2>
      <SignatureStatusTracker acordFormId={formId} />
    </div>
  );
}
```

### 3. Handle Completion (Webhook)

When all signers complete:
1. Webhook updates `status` to `'completed'`
2. `signed_document_url` populated with download URL
3. SignatureStatusTracker shows "Completed" badge
4. User can download signed PDF

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `DROPBOX_ACCESS_TOKEN not configured` | Missing API key | Add secret to Supabase |
| `eSignature provider not configured` | No esign_settings record | Configure in admin panel |
| `Invalid email address` | Bad signer email | Validate before submitting |
| `File not accessible` | Document URL unreachable | Ensure URL is public or signed |

### Webhook Failures

If webhooks fail:
1. Check Supabase function logs
2. Verify webhook URL in Dropbox Sign dashboard
3. Check signature verification (HMAC)
4. Ensure `signature_requests` record exists

---

## Security

### Authentication
- Edge functions require Bearer token authentication
- `requireAuth()` middleware validates JWT

### Webhook Verification
- HMAC signature verification (optional but recommended)
- Uses API key to verify webhook authenticity

### Data Protection
- Signed documents stored in Dropbox Sign (temporary)
- Download and store in Supabase Storage for long-term retention
- RLS policies protect signature_requests table

---

## Testing

### Test Mode

Dropbox Sign test mode:
- No real signatures sent
- Documents marked as test
- No quota usage

Enable via environment:
```typescript
const isTestMode = Deno.env.get('ENVIRONMENT') !== 'production';
formData.append('test_mode', isTestMode ? '1' : '0');
```

### Manual Testing

1. Create signature request via modal
2. Check Dropbox Sign dashboard for request
3. Sign document (use test email)
4. Verify webhook updates database
5. Download signed document

---

## Future Enhancements

- [ ] DocuSign integration (alternative provider)
- [ ] PandaDoc integration (alternative provider)
- [ ] Embedded signing (sign in-app without email)
- [ ] Bulk signature requests
- [ ] Template-based signatures
- [ ] Automatic signed document storage in Supabase
- [ ] Email notifications for signature events
- [ ] Signature audit trail export

---

## Related Files

**Edge Functions:**
- `supabase/functions/esign-create-request/index.ts`
- `supabase/functions/esign-webhook/index.ts`

**Components:**
- `src/components/signatures/SignatureRequestModal.tsx`
- `src/components/signatures/SignatureStatusTracker.tsx`
- `src/components/signatures/index.ts`

**Hooks:**
- `src/hooks/useSignature.ts`

**Configuration:**
- `src/lib/acord/signatureAnchors.ts`
- `src/components/admin/ESignatureSettings.tsx`

**Database:**
- `supabase/migrations/20251218210000_acord_signatures_tracking.sql`
- `supabase/migrations/20251222000003_system_configuration_tables.sql`

---

**Last Updated:** December 27, 2024
**Status:** Implemented and Deployed
