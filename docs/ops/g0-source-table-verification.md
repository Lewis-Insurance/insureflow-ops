# G0 Item #1 — Live source table verification

**Project:** `lrqajzwcmdwahnjyidgv` (Lewis Insurance App)  
**Method:** Read-only schema confirmation against prod-generated types + migration cross-check  
**Recorded:** 2026-07-01 (G0 sign-off, Brian Lewis)  
**Purpose:** Confirm tables/columns required by `resolve_account` RPC and future `hermes` read views exist before Floor dev migrations.

---

## Verdict

**PASS.** All five tables exist in the live prod schema with the columns Floor needs. No schema changes required for Phase 0.

Evidence: `src/integrations/supabase/types.ts` (generated from prod). Cross-checked against `20260701030000_floor_resolve_account_rpc.sql` and `20260701020000_floor_spine_d_policy_in_force_status.sql`.

---

## Table inventory

### `public.accounts`

Required by: `resolve_account` (email, phone, name, agency_workspace_id), `decision_packages.client_ref`, `policy_in_force_status`.

| Column | Present | Used by Floor |
|---|---|---|
| `id` | Yes | FK target |
| `agency_workspace_id` | Yes | Tenant boundary |
| `email` | Yes | Email-exact rung |
| `phone` / `phone_e164` | Yes | Phone rung |
| `name` | Yes | trgm name rung |
| `deleted_at` | Yes | Exclude merged/deleted |

### `public.insured_emails`

Required by: `resolve_account` insured-email rung, `email-inbound-lite` fix.

| Column | Present | Used by Floor |
|---|---|---|
| `id` | Yes | PK |
| `account_id` | Yes | FK to accounts |
| `email` | Yes | Match |
| `is_primary` | Yes | Ordering |

### `public.account_aliases`

Required by: `resolve_account` alias rung.

| Column | Present | Used by Floor |
|---|---|---|
| `id` | Yes | PK |
| `account_id` | Yes | FK |
| `alias` | Yes | Match (local-part) |
| `alias_type` | Yes | Filter |

### `public.policies`

Required by: `policy_in_force_status` view, Play 1 reconciliation.

| Column | Present | Used by Floor |
|---|---|---|
| `id` | Yes | PK |
| `account_id` | Yes | Join |
| `policy_number` | Yes | Display |
| `carrier` | Yes | Reconciliation |
| `line_of_business` | Yes | Reconciliation |
| `status` | Yes | In-force rule |
| `effective_date` / `expiration_date` | Yes | In-force rule |
| `cancelled_at` / `cancellation_reason` | Yes | In-force rule |
| `deleted_at` | Yes | Exclude |
| `premium` | Yes | Display |
| `coverage` / `cgl_details` / `bap_details` / `property_details` | Yes | Limits diff (Tier 3) |

### `public.documents`

Required by: future `hermes.documents_v` read view (Phase 1+).

| Column | Present | Used by Floor |
|---|---|---|
| `id` | Yes | PK |
| `account_id` | Yes | FK |
| `policy_id` | Yes | Optional FK |
| `filename` / `file_path` | Yes | Signed-URL mint |
| `deleted_at` | Yes | Exclude |

---

## Optional live SQL re-run (read-only)

Run in Supabase SQL Editor on prod if you want a second confirmation:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('accounts', 'insured_emails', 'account_aliases', 'policies', 'documents')
  AND column_name IN (
    'id', 'agency_workspace_id', 'email', 'phone', 'phone_e164', 'name', 'deleted_at',
    'account_id', 'alias', 'alias_type', 'is_primary',
    'policy_number', 'carrier', 'line_of_business', 'status',
    'effective_date', 'expiration_date', 'cancelled_at', 'cancellation_reason',
    'premium', 'coverage', 'cgl_details', 'bap_details', 'property_details',
    'filename', 'file_path', 'policy_id'
  )
ORDER BY table_name, ordinal_position;
```

Expected: one row per column listed above.

---

## Sign-off (item #1)

| Field | Value |
|---|---|
| Verified by | Agent (schema cross-check) + Brian G0 approval |
| Date | 2026-07-01 |
| Result | **PASS** |
