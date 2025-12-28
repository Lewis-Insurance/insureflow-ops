# Canopy Connect Integration Review

## Executive Summary

This document provides a comprehensive review of the InsureFlow CRM's Canopy Connect integration, analyzing the current implementation, data flows, and gaps for expanding to all Lines of Business.

**Current Status:**
- **Working:** Personal Auto, Homeowners
- **Partial Support:** Renters, Condo, Umbrella (schema exists, needs UI)
- **Not Implemented:** Commercial Auto, BOP, Commercial Property, GL, Workers Comp, Life

**Key Finding:** InsureFlow has built an internal ACORD Form Automation system (Sembley-like functionality) that can consume Canopy data. The `get_canopy_quote_prefill()` function bridges Canopy imports to ACORD form pre-fill.

---

## 1. Current Implementation

### 1.1 Database Schema

**Location:** `supabase/migrations/20251226100000_canopy_connect_schema.sql`

| Table | Description | Status |
|-------|-------------|--------|
| `canopy_pulls` | Tracks import sessions | ✅ Active |
| `canopy_policies` | Policy data from carriers | ✅ Active |
| `canopy_vehicles` | Vehicle details (auto) | ✅ Active |
| `canopy_drivers` | Driver information (auto) | ✅ Active |
| `canopy_dwellings` | Property details (home/renters) | ✅ Active |
| `canopy_documents` | Policy documents/PDFs | ✅ Active |
| `canopy_claims` | Claims history | ✅ Active |
| `canopy_enrichment` | Data enrichment cache | ✅ Active |
| `canopy_webhook_log` | Webhook event logging | ✅ Active |

**Policy Type Mapping** (from `canopy-reprocess/index.ts:150`):
```typescript
const typeMap: Record<string, string> = {
  'auto': 'auto',
  'automobile': 'auto',
  'car': 'auto',
  'home': 'home',
  'homeowners': 'home',
  'renters': 'renters',
  'umbrella': 'umbrella',
  'life': 'life',
  'health': 'health',
};
// Default: 'other'
```

### 1.2 Edge Functions

| Function | Purpose | Status |
|----------|---------|--------|
| `canopy-initiate` | Initiates Canopy Connect session | ✅ Active |
| `canopy-webhook` | Handles Canopy events | ✅ Active |
| `canopy-reprocess` | Comprehensive data processing | ✅ Active (1,853 lines) |
| `canopy-fetch-pull` | Fetches pull status/data | ✅ Active |
| `canopy-document-proxy` | Proxies document downloads | ✅ Active |

**Webhook Event Handling** (`canopy-webhook/index.ts`):
- `AUTH_STATUS` → User authenticated with carrier
- `POLICY_AVAILABLE` → Individual policy data ready
- `COMPLETE` → All policies imported
- `ERROR` → Import failed

### 1.3 React Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CanopyConnectButton` | `src/components/canopy/CanopyConnectButton.tsx` | Initiates import |
| `CanopyDataDisplay` | `src/components/canopy/CanopyDataDisplay.tsx` | Displays imported data (1,030 lines) |
| `CanopyImportPage` | `src/pages/CanopyImportPage.tsx` | Dashboard for imports |

**CanopyDataDisplay Tabs:**
- Policies (all types)
- Vehicles (auto-specific)
- Drivers (auto-specific)
- Properties (home/renters/condo)
- Claims (all types)
- Documents (policy PDFs)

### 1.4 Custom Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `useCanopyConnect` | `src/hooks/useCanopyConnect.ts` | SDK integration, pull initiation |
| `useCanopyPull` | `src/hooks/useCanopyPull.ts` | Real-time status tracking |
| `useCanopyPolicies` | `src/integrations/supabase/hooks/useCanopy.ts` | Policy data queries |

---

## 2. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CANOPY CONNECT FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

  User clicks                    Canopy Connect              Insurance Carrier
  "Import Data"                     Widget                      Portal
      │                               │                           │
      ▼                               │                           │
┌─────────────┐                       │                           │
│CanopyConnect│────initiatePull()────►│                           │
│   Button    │                       │                           │
└─────────────┘                       │                           │
      │                               │                           │
      │  ┌────────────────────────────┘                           │
      │  │                                                        │
      │  ▼                                                        │
      │ ┌─────────────────┐                                       │
      │ │ canopy-initiate │ ◄── Creates canopy_pulls record      │
      │ │  Edge Function  │                                       │
      │ └────────┬────────┘                                       │
      │          │                                                │
      │          │ Returns connect_url                            │
      │          ▼                                                │
      │    ┌──────────┐          ┌──────────┐                    │
      │    │  Popup   │◄────────►│  Canopy  │◄────────────────────│
      │    │  Window  │          │   SDK    │     OAuth Flow     │
      │    └──────────┘          └─────┬────┘                    │
      │                                │                          │
      │                                │ Webhook Events           │
      │                                ▼                          │
      │                    ┌─────────────────┐                    │
      │                    │ canopy-webhook  │                    │
      │                    │  Edge Function  │                    │
      │                    └────────┬────────┘                    │
      │                             │                             │
      │          ┌──────────────────┼──────────────────┐          │
      │          ▼                  ▼                  ▼          │
      │    AUTH_STATUS      POLICY_AVAILABLE       COMPLETE       │
      │          │                  │                  │          │
      │          ▼                  ▼                  ▼          │
      │  ┌───────────────────────────────────────────────────┐   │
      │  │              canopy-reprocess Edge Function        │   │
      │  │                                                    │   │
      │  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
      │  │  │ Policies    │  │ Vehicles    │  │ Dwellings  │ │   │
      │  │  │ Upserted    │  │ Upserted    │  │ Upserted   │ │   │
      │  │  └─────────────┘  └─────────────┘  └────────────┘ │   │
      │  │                                                    │   │
      │  │  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
      │  │  │ Drivers     │  │ Claims      │  │ Documents  │ │   │
      │  │  │ Upserted    │  │ Upserted    │  │ Downloaded │ │   │
      │  │  └─────────────┘  └─────────────┘  └────────────┘ │   │
      │  └───────────────────────────────────────────────────┘   │
      │                             │                             │
      │                             ▼                             │
      │  ┌───────────────────────────────────────────────────┐   │
      │  │                    Supabase DB                     │   │
      │  │                                                    │   │
      │  │   canopy_pulls ──► canopy_policies ──► vehicles   │   │
      │  │                          │                         │   │
      │  │                          ├──► drivers              │   │
      │  │                          ├──► dwellings            │   │
      │  │                          ├──► claims               │   │
      │  │                          └──► documents            │   │
      │  └───────────────────────────────────────────────────┘   │
      │                             │                             │
      │                             ▼                             │
      │  ┌───────────────────────────────────────────────────┐   │
      │  │           map_canopy_to_lead() Function            │   │
      │  │                                                    │   │
      │  │   Creates lead with:                               │   │
      │  │   - Primary driver as contact                      │   │
      │  │   - Insurance types from policies                  │   │
      │  │   - Address from dwelling/vehicle                  │   │
      │  │   - Drivers → lead_auto_drivers                    │   │
      │  │   - Vehicles → lead_auto_vehicles                  │   │
      │  └───────────────────────────────────────────────────┘   │
      │                             │                             │
      │                             ▼                             │
      │  ┌───────────────────────────────────────────────────┐   │
      │  │        get_canopy_quote_prefill() Function         │   │
      │  │                                                    │   │
      │  │   Returns JSONB with:                              │   │
      │  │   - policies[] with coverages                      │   │
      │  │   - vehicles[] with current limits                 │   │
      │  │   - drivers[] with license/violations              │   │
      │  │   - dwellings[] with construction details          │   │
      │  │   - claims_history[]                               │   │
      │  └───────────────────────────────────────────────────┘   │
      │                             │                             │
      │                             ▼                             │
      │  ┌───────────────────────────────────────────────────┐   │
      │  │               ACORD Form Automation                │   │
      │  │                                                    │   │
      │  │   Intake → Mapping → ACORD PDF Generation          │   │
      │  │                                                    │   │
      │  │   Supported Forms:                                 │   │
      │  │   - ACORD 125 (Commercial Application)             │   │
      │  │   - ACORD 126 (GL Section)                         │   │
      │  │   - ACORD 127 (Commercial Auto)                    │   │
      │  │   - ACORD 130 (Workers Comp)                       │   │
      │  │   - ACORD 140 (Property Section)                   │   │
      │  │   - ACORD 35 (Homeowners)                          │   │
      │  │   - ACORD 80 (Personal Auto)                       │   │
      │  │   - ACORD 25/27/28 (Certificates)                  │   │
      │  └───────────────────────────────────────────────────┘   │
      │                                                          │
      ▼                                                          │
┌─────────────────┐                                              │
│CanopyDataDisplay│ ◄── Real-time subscription to canopy_pulls  │
│    Component    │                                              │
└─────────────────┘                                              │
```

---

## 3. Sembley Integration Analysis

### 3.1 What is Sembley?

Sembley is an external ACORD form automation platform that:
- Ingests insurance data (manual or via integrations)
- Auto-populates ACORD forms
- Manages form versioning and carrier requirements
- Provides e-signature integration

### 3.2 InsureFlow's Approach

**InsureFlow has built an internal Sembley-like system** rather than integrating with Sembley directly.

**Internal ACORD Form Automation Suite:**
- **Location:** `src/types/acord.ts`, `src/lib/acord/`, `docs/ACORD-IMPLEMENTATION-SPEC.md`
- **Strategy:** PDF template overlay using `pdf-lib`
- **Forms Defined:** 125, 126, 127, 130, 140, 35, 80, 25, 27, 28

### 3.3 Canopy → ACORD Bridge

The `get_canopy_quote_prefill()` function provides structured data that can be mapped to ACORD fields:

```sql
-- Returns JSONB with all data needed for ACORD form pre-fill
SELECT get_canopy_quote_prefill('pull-uuid');

-- Output structure:
{
  "policies": [...],      -- Maps to coverage sections
  "vehicles": [...],      -- Maps to ACORD 80/127 vehicle schedules
  "drivers": [...],       -- Maps to ACORD 80/127 driver schedules
  "dwellings": [...],     -- Maps to ACORD 35/140 property sections
  "claims_history": [...]  -- Maps to loss history sections
}
```

### 3.4 Integration Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **Integrate with Sembley API** | Less dev work, proven system | Ongoing cost, dependency | Consider for Commercial lines |
| **Extend internal system** | Full control, no external cost | More dev work needed | Recommended for Personal lines |
| **Hybrid approach** | Best of both | Complexity | Best long-term strategy |

---

## 4. Line of Business Coverage Matrix

### 4.1 Personal Lines

| LOB | Canopy Import | DB Schema | UI Display | ACORD Form | Quote Prefill | Status |
|-----|---------------|-----------|------------|------------|---------------|--------|
| Personal Auto | ✅ Full | ✅ canopy_vehicles, canopy_drivers | ✅ VehicleCard, DriverCard | ✅ ACORD 80 | ✅ get_canopy_quote_prefill | **Production Ready** |
| Homeowners | ✅ Full | ✅ canopy_dwellings | ✅ DwellingCard | ✅ ACORD 35 | ✅ get_canopy_quote_prefill | **Production Ready** |
| Renters | ✅ Full | ✅ canopy_dwellings | ✅ DwellingCard | ❌ Not defined | ⚠️ Partial | **Needs ACORD mapping** |
| Condo | ✅ Full | ✅ canopy_dwellings | ✅ DwellingCard | ❌ Not defined | ⚠️ Partial | **Needs ACORD mapping** |
| Umbrella | ✅ Full | ✅ canopy_policies | ✅ PolicyCard | ❌ Not defined | ⚠️ Partial | **Needs ACORD mapping** |
| Life | ⚠️ Partial | ⚠️ canopy_policies only | ⚠️ PolicyCard only | ❌ Not defined | ❌ No | **Low Priority** |

### 4.2 Commercial Lines

| LOB | Canopy Import | DB Schema | UI Display | ACORD Form | Quote Prefill | Status |
|-----|---------------|-----------|------------|------------|---------------|--------|
| Commercial Auto | ❌ No schema | ❌ None | ❌ None | ✅ ACORD 127 defined | ❌ No | **Needs full implementation** |
| BOP | ❌ No schema | ❌ None | ❌ None | ⚠️ Partial (125+126+140) | ❌ No | **Needs full implementation** |
| Commercial Property | ❌ No schema | ❌ None | ❌ None | ✅ ACORD 140 defined | ❌ No | **Needs schema** |
| General Liability | ❌ No schema | ❌ None | ❌ None | ✅ ACORD 126 defined | ❌ No | **Needs schema** |
| Workers Comp | ❌ No schema | ❌ None | ❌ None | ✅ ACORD 130 defined | ❌ No | **Needs schema** |

---

## 5. Gap Analysis

### 5.1 Database Schema Gaps

**Missing Tables for Commercial Lines:**

```sql
-- COMMERCIAL VEHICLES (Fleet data)
CREATE TABLE canopy_commercial_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,
  unit_number TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  vin TEXT,
  vehicle_type TEXT, -- 'truck', 'van', 'trailer', 'tractor'
  gvw INTEGER, -- Gross Vehicle Weight
  radius_of_operation INTEGER,
  cargo_type TEXT,
  driver_id UUID, -- Assigned driver
  hired_non_owned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BUSINESS OPERATIONS (For GL/BOP)
CREATE TABLE canopy_business_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,
  business_name TEXT,
  dba_name TEXT,
  fein TEXT,
  business_type TEXT, -- 'sole_prop', 'llc', 'corp', 'partnership'
  naics_code TEXT,
  sic_code TEXT,
  years_in_business INTEGER,
  annual_revenue NUMERIC,
  employee_count INTEGER,
  description_of_operations TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LOCATIONS (For Commercial Property)
CREATE TABLE canopy_business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,
  location_number INTEGER,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  occupancy_type TEXT,
  building_value NUMERIC,
  contents_value NUMERIC,
  business_income_value NUMERIC,
  construction_type TEXT,
  year_built INTEGER,
  square_footage INTEGER,
  protection_class TEXT,
  sprinklered BOOLEAN DEFAULT FALSE,
  alarm_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAYROLL DATA (For Workers Comp)
CREATE TABLE canopy_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,
  state TEXT,
  class_code TEXT,
  class_description TEXT,
  employee_count INTEGER,
  annual_payroll NUMERIC,
  experience_mod NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 TypeScript Interface Gaps

**Missing Interfaces** (add to `src/types/canopy.ts`):

```typescript
// Commercial Auto
interface CanopyCommercialVehicle {
  id: string;
  policy_id: string;
  unit_number?: string;
  year: number;
  make: string;
  model: string;
  vin?: string;
  vehicle_type: 'truck' | 'van' | 'trailer' | 'tractor' | 'other';
  gvw?: number;
  radius_of_operation?: number;
  cargo_type?: string;
  hired_non_owned: boolean;
}

// Business Operations (GL/BOP)
interface CanopyBusinessOperations {
  id: string;
  policy_id: string;
  business_name: string;
  dba_name?: string;
  fein?: string;
  business_type: 'sole_prop' | 'llc' | 'corp' | 'partnership';
  naics_code?: string;
  sic_code?: string;
  years_in_business?: number;
  annual_revenue?: number;
  employee_count?: number;
  description_of_operations?: string;
}

// Commercial Property
interface CanopyBusinessLocation {
  id: string;
  policy_id: string;
  location_number: number;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
  };
  building_value?: number;
  contents_value?: number;
  construction_type?: string;
  year_built?: number;
  square_footage?: number;
  sprinklered: boolean;
}

// Workers Comp
interface CanopyPayroll {
  id: string;
  policy_id: string;
  state: string;
  class_code: string;
  class_description: string;
  employee_count: number;
  annual_payroll: number;
  experience_mod: number;
}
```

### 5.3 Edge Function Gaps

**`canopy-reprocess/index.ts` Updates Needed:**

```typescript
// Add handlers for commercial policy types
case 'commercial_auto':
  await processCommercialAutoPolicy(policy, supabase);
  break;
case 'commercial_property':
case 'bop':
  await processCommercialPropertyPolicy(policy, supabase);
  break;
case 'general_liability':
  await processGLPolicy(policy, supabase);
  break;
case 'workers_comp':
  await processWorkersCompPolicy(policy, supabase);
  break;
```

### 5.4 UI Component Gaps

**New Cards Needed in `CanopyDataDisplay.tsx`:**

1. **CommercialVehicleCard** - Fleet vehicle display
2. **BusinessOperationsCard** - Business info display
3. **LocationCard** - Commercial property locations
4. **PayrollCard** - Workers comp class codes

---

## 6. Action Plan

### Phase 1: Complete Personal Lines (Priority: High)

| Task | Effort | Files |
|------|--------|-------|
| Add ACORD form mapping for Renters | 4 hours | `src/lib/acord/acordMappings.ts` |
| Add ACORD form mapping for Condo | 4 hours | `src/lib/acord/acordMappings.ts` |
| Add ACORD form mapping for Umbrella | 4 hours | `src/lib/acord/acordMappings.ts` |
| Test end-to-end quote prefill flow | 8 hours | Integration tests |

### Phase 2: Commercial Auto (Priority: High)

| Task | Effort | Files |
|------|--------|-------|
| Create `canopy_commercial_vehicles` table | 2 hours | New migration |
| Add TypeScript interfaces | 1 hour | `src/types/canopy.ts` |
| Update `canopy-reprocess` for commercial auto | 8 hours | Edge function |
| Create CommercialVehicleCard component | 4 hours | New component |
| Add ACORD 127 field mappings | 8 hours | `src/lib/acord/acordMappings.ts` |
| Test with carrier data | 8 hours | Integration tests |

### Phase 3: BOP & General Liability (Priority: Medium)

| Task | Effort | Files |
|------|--------|-------|
| Create `canopy_business_operations` table | 2 hours | New migration |
| Create `canopy_business_locations` table | 2 hours | New migration |
| Add TypeScript interfaces | 2 hours | `src/types/canopy.ts` |
| Update `canopy-reprocess` for GL/BOP | 12 hours | Edge function |
| Create BusinessOperationsCard component | 4 hours | New component |
| Create LocationCard component | 4 hours | New component |
| Add ACORD 125/126/140 field mappings | 16 hours | `src/lib/acord/acordMappings.ts` |

### Phase 4: Workers Comp (Priority: Medium)

| Task | Effort | Files |
|------|--------|-------|
| Create `canopy_payroll` table | 2 hours | New migration |
| Add TypeScript interfaces | 1 hour | `src/types/canopy.ts` |
| Update `canopy-reprocess` for WC | 8 hours | Edge function |
| Create PayrollCard component | 4 hours | New component |
| Add ACORD 130 field mappings | 12 hours | `src/lib/acord/acordMappings.ts` |

### Phase 5: Commercial Property (Priority: Low)

| Task | Effort | Files |
|------|--------|-------|
| Extend `canopy_business_locations` | 4 hours | Migration update |
| Add schedule of values support | 8 hours | New functionality |
| Add ACORD 140 extended mappings | 8 hours | `src/lib/acord/acordMappings.ts` |

### Phase 6: Life Insurance (Priority: Low)

| Task | Effort | Files |
|------|--------|-------|
| Research Canopy life insurance data format | 4 hours | Documentation |
| Create life-specific schema if needed | 4 hours | New migration |
| Evaluate if ACORD forms apply | 2 hours | Analysis |

---

## 7. Implementation Priority

Based on market demand and implementation complexity:

```
Priority 1 (Immediate)
├── Complete Renters mapping (4h)
├── Complete Condo mapping (4h)
└── Complete Umbrella mapping (4h)

Priority 2 (Next Sprint)
├── Commercial Auto full implementation (32h)
└── Integration testing (16h)

Priority 3 (Following Sprint)
├── BOP/GL implementation (40h)
└── Business operations schema (8h)

Priority 4 (Backlog)
├── Workers Comp implementation (32h)
├── Commercial Property extensions (16h)
└── Life insurance research (8h)
```

---

## 8. Code Examples

### 8.1 Adding Commercial Auto Support

**Migration:** `supabase/migrations/20251228_commercial_auto.sql`

```sql
-- Commercial vehicles for fleet policies
CREATE TABLE canopy_commercial_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES canopy_policies(id) ON DELETE CASCADE,
  unit_number TEXT,
  year INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  vin TEXT,
  vehicle_type TEXT DEFAULT 'truck',
  gvw INTEGER,
  radius_of_operation INTEGER,
  cargo_type TEXT,
  driver_id UUID,
  hired_non_owned BOOLEAN DEFAULT FALSE,
  coverages JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE canopy_commercial_vehicles ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Users can view commercial vehicles for their accounts"
  ON canopy_commercial_vehicles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM canopy_policies cp
      JOIN canopy_pulls cpl ON cpl.id = cp.pull_id
      JOIN account_memberships am ON am.account_id = cpl.account_id
      WHERE cp.id = canopy_commercial_vehicles.policy_id
        AND am.user_id = auth.uid()
    )
  );

-- Index
CREATE INDEX idx_commercial_vehicles_policy ON canopy_commercial_vehicles(policy_id);
```

### 8.2 Extending canopy-reprocess

**Add to `supabase/functions/canopy-reprocess/index.ts`:**

```typescript
async function processCommercialAutoPolicy(
  policy: CanopyPolicy,
  supabase: SupabaseClient
): Promise<void> {
  if (!policy.vehicles?.length) return;

  for (const vehicle of policy.vehicles) {
    await supabase.from('canopy_commercial_vehicles').upsert({
      policy_id: policy.db_id,
      unit_number: vehicle.unit_number,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      vin: vehicle.vin,
      vehicle_type: mapVehicleType(vehicle.body_style),
      gvw: vehicle.gvw,
      radius_of_operation: vehicle.radius,
      cargo_type: vehicle.cargo_type,
      coverages: vehicle.coverages || {},
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'policy_id,vin'
    });
  }
}

function mapVehicleType(bodyStyle: string | undefined): string {
  const typeMap: Record<string, string> = {
    'truck': 'truck',
    'van': 'van',
    'trailer': 'trailer',
    'tractor': 'tractor',
    'semi': 'tractor',
    'box truck': 'truck',
    'cargo van': 'van'
  };
  return typeMap[bodyStyle?.toLowerCase() || ''] || 'other';
}
```

### 8.3 ACORD Mapping for Commercial Auto

**Add to `src/lib/acord/acordMappings.ts`:**

```typescript
export const ACORD_127_MAPPINGS: AcordFieldMapping[] = [
  // Named Insured
  { acordField: 'NAMED_INSURED', sourceField: 'business.name' },
  { acordField: 'MAILING_ADDRESS', sourceField: 'business.address' },

  // Vehicle Schedule
  {
    acordField: 'VEH_YEAR_1',
    sourceField: 'vehicles[0].year',
    transform: 'toString'
  },
  { acordField: 'VEH_MAKE_1', sourceField: 'vehicles[0].make' },
  { acordField: 'VEH_MODEL_1', sourceField: 'vehicles[0].model' },
  { acordField: 'VEH_VIN_1', sourceField: 'vehicles[0].vin' },
  { acordField: 'VEH_GVW_1', sourceField: 'vehicles[0].gvw' },
  { acordField: 'VEH_RADIUS_1', sourceField: 'vehicles[0].radius_of_operation' },

  // Coverages
  {
    acordField: 'LIABILITY_BI',
    sourceField: 'coverages.liability_bi',
    transform: 'formatCurrency'
  },
  {
    acordField: 'LIABILITY_PD',
    sourceField: 'coverages.liability_pd',
    transform: 'formatCurrency'
  }
];
```

---

## 9. Testing Recommendations

### 9.1 Integration Tests

```typescript
// __tests__/canopy/commercial-auto.test.ts
describe('Commercial Auto Canopy Import', () => {
  it('should process commercial auto policy with fleet vehicles', async () => {
    const mockPolicy = {
      policy_type: 'commercial_auto',
      vehicles: [
        { year: 2022, make: 'Ford', model: 'F-150', gvw: 7000 },
        { year: 2021, make: 'Chevrolet', model: 'Express', gvw: 9000 }
      ]
    };

    const result = await processCommercialAutoPolicy(mockPolicy, supabase);

    expect(result).toBeDefined();
    const vehicles = await supabase
      .from('canopy_commercial_vehicles')
      .select('*')
      .eq('policy_id', mockPolicy.db_id);
    expect(vehicles.data).toHaveLength(2);
  });

  it('should map commercial auto to ACORD 127', async () => {
    const pullData = await getCanopyQuotePrefill(pullId);
    const acordValues = mapToAcord127(pullData);

    expect(acordValues.VEH_YEAR_1).toBe('2022');
    expect(acordValues.VEH_MAKE_1).toBe('Ford');
  });
});
```

### 9.2 Carrier Testing Matrix

| Carrier | Personal Auto | Home | Commercial Auto | BOP | GL | WC |
|---------|---------------|------|-----------------|-----|----|----|
| Progressive | ✅ Test | ✅ Test | 🔲 To Test | 🔲 | 🔲 | 🔲 |
| State Farm | ✅ Test | ✅ Test | 🔲 To Test | 🔲 | 🔲 | 🔲 |
| Travelers | 🔲 To Test | 🔲 To Test | 🔲 To Test | 🔲 To Test | 🔲 To Test | 🔲 |
| Hartford | 🔲 To Test | 🔲 To Test | 🔲 To Test | 🔲 To Test | 🔲 To Test | 🔲 To Test |

---

## 10. Appendix

### A. File Inventory

**Edge Functions:**
- `supabase/functions/canopy-initiate/index.ts`
- `supabase/functions/canopy-webhook/index.ts`
- `supabase/functions/canopy-reprocess/index.ts` (1,853 lines)
- `supabase/functions/canopy-fetch-pull/index.ts`
- `supabase/functions/canopy-document-proxy/index.ts`

**React Components:**
- `src/components/canopy/CanopyConnectButton.tsx`
- `src/components/canopy/CanopyDataDisplay.tsx` (1,030 lines)
- `src/pages/CanopyImportPage.tsx`

**Hooks:**
- `src/hooks/useCanopyConnect.ts`
- `src/hooks/useCanopyPull.ts`
- `src/integrations/supabase/hooks/useCanopy.ts`

**Database Migrations:**
- `supabase/migrations/20251226100000_canopy_connect_schema.sql`
- `supabase/migrations/20251226100001_canopy_mapping_functions.sql`

**ACORD Types:**
- `src/types/acord.ts`
- `docs/ACORD-IMPLEMENTATION-SPEC.md`

### B. Canopy Connect Link

**Production:** `https://app.usecanopy.com/c/lewis-insurance`

### C. Related Documentation

- [ACORD-IMPLEMENTATION-SPEC.md](docs/ACORD-IMPLEMENTATION-SPEC.md) - ACORD form automation details
- [CLAUDE.md](CLAUDE.md) - Main project documentation
- [Canopy API Docs](https://docs.usecanopy.com) - External Canopy documentation

---

**Document Version:** 1.0
**Created:** December 27, 2024
**Author:** Claude Code
**Status:** Complete
