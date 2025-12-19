# InsureFlow Client Portal: Final Implementation Handoff

## FILES DELIVERED

### 1. Database Migration (Run in Order)

| File | Purpose |
|------|---------|
| `INSUREFLOW_PORTAL_MIGRATION_SECURE.sql` | Main migration - 17 tables, base functions, RLS |
| `INSUREFLOW_PORTAL_SECURITY_PATCH.sql` | Security fixes - updated helper functions, permission-gated RLS, atomic RPCs |

### 2. Edge Functions

| File | Purpose |
|------|---------|
| `INSUREFLOW_PORTAL_EDGE_FUNCTIONS.ts` | All Edge Functions with proper anon key + JWT pattern |

### 3. TypeScript

| File | Purpose |
|------|---------|
| `portal-final/types/portal.ts` | Schema-aligned types (no extra fields) |
| `portal-final/hooks/portal-hooks.ts` | Corrected hooks with RPC calls |

---

## SECURITY CHECKLIST

### ✅ Fixed Issues

| Issue | Status | Fix Location |
|-------|--------|--------------|
| RLS missing on tables | ✅ | Main migration |
| Household access broken | ✅ | `portal_accessible_account_ids()` in patch |
| Permissions not enforced | ✅ | `portal_has_permission()` in RLS policies |
| Disabled users bypass | ✅ | All helper functions check `portal_status = 'active'` |
| SECURITY DEFINER exploitable | ✅ | Functions derive user from `auth.uid()` |
| Edge Function RLS bypass | ✅ | Use anon key + JWT, not service key |
| `supabaseService.sql` invalid | ✅ | Use `increment_document_download` RPC |
| Types/schema mismatch | ✅ | Types exactly match columns |
| Magic link creates users | ✅ | `shouldCreateUser: false` |
| Household invite assumes primary | ✅ | `invite_household_member` RPC |
| CORS too permissive | ✅ | `PORTAL_ALLOWED_ORIGINS` env var |

### ✅ Schema Features

| Feature | Status |
|---------|--------|
| CITEXT for emails | ✅ |
| IDENTITY instead of SERIAL | ✅ |
| updated_at triggers | ✅ |
| Provenance enforcement (unique current) | ✅ |
| Proper FK relationships | ✅ |
| Multi-agency branding_id | ✅ |
| Emergency location expiration | ✅ |

---

## DEPLOYMENT STEPS

### Step 1: Run Main Migration

```sql
-- In Supabase SQL Editor
-- Run INSUREFLOW_PORTAL_MIGRATION_SECURE.sql
```

### Step 2: Run Security Patch

```sql
-- In Supabase SQL Editor
-- Run INSUREFLOW_PORTAL_SECURITY_PATCH.sql
```

### Step 3: Create Storage Bucket

```sql
-- In Supabase Dashboard > Storage
-- Create bucket: portal-documents
-- Public: FALSE
-- File size limit: 50MB
```

### Step 4: Deploy Edge Functions

```bash
# For each function in INSUREFLOW_PORTAL_EDGE_FUNCTIONS.ts
supabase functions deploy get-document-url
supabase functions deploy get-id-card-image
supabase functions deploy generate-apple-pass
supabase functions deploy check-portal-access
```

### Step 5: Set Environment Variables

```bash
# In Supabase Dashboard > Edge Functions > Secrets
PORTAL_ALLOWED_ORIGINS=https://portal.lewisinsurance.com,https://localhost:3000
```

### Step 6: Verify Setup

```sql
-- Run verification queries from end of SECURITY_PATCH.sql
-- Check RLS is enabled on all portal tables
-- Check function privileges are correct
```

---

## IMPLEMENTATION ORDER

### Phase 0: Wallet (Weeks 1-3)

1. Copy `types/portal.ts` to project
2. Copy `hooks/portal-hooks.ts` to project
3. Build `PortalLogin.tsx` with invite-required flow
4. Build `IDCardView.tsx` and `WalletButtons.tsx`
5. Deploy Edge Functions

### Phase 1: Documents (Weeks 4-7)

1. Build `DocumentCenter.tsx`
2. Build `DisclaimerBanner.tsx` and `DataAsOfBadge.tsx`
3. Integrate carrier deep links

### Phase 2: Service Requests (Weeks 8-11)

1. Build `ServiceRequestForm.tsx`
2. Build `RequestMessages.tsx`
3. Build agent queue (main CRM)

### Phase 3-5: Later Phases

- AI Document Ingestion
- Cross-sell & Referrals
- Mobile & Emergency Mode

---

## CRITICAL REMINDERS

### Never Display Without Provenance

```tsx
// WRONG
<p>Coverage: $100,000/$300,000</p>

// RIGHT
<p>
  Coverage: $100,000/$300,000
  <DataAsOfBadge date={policy.data_as_of} source={policy.source_type} />
</p>
```

### Never Show Billing Data

```tsx
// WRONG - We don't have this
<p>Amount Due: $152.00</p>

// RIGHT - Deep link to carrier
<Button onClick={() => window.open(carrier.bill_pay_url)}>
  Pay Bill at {carrier.carrier_name}
</Button>
```

### Always Use RPCs for Writes

```tsx
// WRONG - Direct insert bypasses server-side checks
await supabase.from('portal_service_requests').insert({...});

// RIGHT - RPC handles permissions, creates task
await supabase.rpc('create_my_service_request', {...});
```

### Always Use Signed URLs for Files

```tsx
// WRONG - Direct storage URL
const url = supabase.storage.from('portal-documents').getPublicUrl(path);

// RIGHT - Edge Function with access check
const { data } = await supabase.functions.invoke('get-document-url', {
  body: { documentId }
});
```

---

## SUCCESS METRICS

| Metric | Target |
|--------|--------|
| Wallet Adds | >40% of mobile users |
| Document Self-Service | >50% of doc requests |
| Service Request SLA | <24 hours avg |
| Client Adoption | >40% of active accounts |
| Login Friction | <5% failure rate |

---

*Version: 4.0 (Final Security-Hardened)*
*Ready for Claude Code Implementation*
