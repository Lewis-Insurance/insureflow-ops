# Canopy Connect 2-Way Sync Implementation Plan

## ✅ IMPLEMENTATION COMPLETE - December 27, 2024

### Summary of Completed Work

| Phase | Description | Status | Files Created/Modified |
|-------|-------------|--------|----------------------|
| 1 | Database Schema | ✅ Complete | `20251227100000_canopy_2way_sync_schema.sql` |
| 2 | Webhook Security | ✅ Complete | `canopy-webhook/index.ts` hardened |
| 3 | Monitoring API | ✅ Complete | `canopy-monitoring/index.ts` |
| 4 | Servicing API | ✅ Complete | `canopy-servicing/index.ts` |
| 5 | Commercial Lines | ✅ Complete | Commercial processing in webhook |
| 6 | React Hooks | ✅ Complete | `useCanopyMonitoring.ts`, `useCanopyServicing.ts` |
| 7 | Change Detection | ✅ Complete | `useCanopyChangeDetection.ts` |
| 8 | ACORD Prefill | ✅ Complete | `20251227100001_canopy_commercial_acord_prefill.sql` |

---

## Executive Summary

This document outlines the complete implementation plan to upgrade InsureFlow's Canopy Connect integration from a basic "read-only pull" system to a **production-grade 2-way sync platform** that:
1. Supports ALL Lines of Business (personal + commercial)
2. Implements TRUE 2-way sync (read + write via Monitoring & Servicing APIs)
3. Exceeds Sembley-style form fill with durable data platform features

---

## Current State Assessment

### What IS Implemented ✅

| Feature | Status | Location |
|---------|--------|----------|
| Webhook signature verification | ✅ Implemented | `canopy-webhook/index.ts:208-265` |
| AUTH_STATUS handling | ✅ Working | `canopy-webhook/index.ts:505-521` |
| POLICY_AVAILABLE handling | ✅ Working | `canopy-webhook/index.ts:523-730` |
| COMPLETE handling | ✅ Working | `canopy-webhook/index.ts:732-1002` |
| ERROR handling | ✅ Working | `canopy-webhook/index.ts:1601-1616` |
| Personal Auto schema | ✅ Complete | vehicles, drivers tables |
| Homeowners schema | ✅ Complete | dwellings table |
| Webhook logging | ✅ Working | canopy_webhook_log table |
| RLS policies | ✅ Basic | Staff-based access |
| Lead creation from pull | ✅ Working | `createLeadFromCanopyPull()` |
| Quote prefill function | ✅ Working | `get_canopy_quote_prefill()` |

### Now Implemented ✅ (December 27, 2024)

| Feature | Status | Location |
|---------|--------|----------|
| `canopy_pull_snapshots` table | ✅ Complete | Migration 20251227100000 |
| `canopy_monitorings` table | ✅ Complete | Migration 20251227100000 |
| `canopy_servicing_actions` table | ✅ Complete | Migration 20251227100000 |
| `canopy_commercial_vehicles` table | ✅ Complete | Migration 20251227100000 |
| `canopy_business_operations` table | ✅ Complete | Migration 20251227100000 |
| `canopy_business_locations` table | ✅ Complete | Migration 20251227100000 |
| `canopy_payroll` table | ✅ Complete | Migration 20251227100000 |
| Monitoring API integration | ✅ Complete | `canopy-monitoring/index.ts` |
| Servicing API integration | ✅ Complete | `canopy-servicing/index.ts` |
| DATA_UPDATED incremental processing | ✅ Complete | `canopy-webhook/index.ts` |
| MONITORING_RECONNECT handling | ✅ Complete | `handleMonitoringReconnect()` |
| SERVICING_WAITING handling | ✅ Complete | `handleServicingWaiting()` |
| Commercial line processing | ✅ Complete | `upsertCommercialVehicle()`, etc. |
| Coverage diff / change detection | ✅ Complete | `useCanopyChangeDetection.ts` |
| Commercial ACORD mappings | ✅ Complete | `get_canopy_commercial_prefill()` |
| Webhook signature hardening | ✅ Complete | 401 rejection + timestamp check |
| Snapshot storage | ✅ Complete | `storeSnapshot()` |
| React hooks for UI | ✅ Complete | `useCanopyMonitoring.ts`, `useCanopyServicing.ts` |

### Additional Completed Work (December 27, 2024)

| Feature | Status | Files Created |
|---------|--------|---------------|
| Unit/integration tests | ✅ Complete | 4 test files, 112 new tests (212 total passing) |
| UI: MonitoringStatusCard | ✅ Complete | `components/canopy/monitoring/MonitoringStatusCard.tsx` |
| UI: MonitoringEnableButton | ✅ Complete | `components/canopy/monitoring/MonitoringEnableButton.tsx` |
| UI: ServicingActionsPanel | ✅ Complete | `components/canopy/servicing/ServicingActionsPanel.tsx` |
| UI: AddVehicleModal | ✅ Complete | `components/canopy/servicing/AddVehicleModal.tsx` |
| UI: PolicyChangesSummary | ✅ Complete | `components/canopy/changes/PolicyChangesSummary.tsx` |
| UI: ChangeDetectionBadge | ✅ Complete | `components/canopy/changes/ChangeDetectionBadge.tsx` |
| ACORD Prefill Service | ✅ Complete | `services/canopy/CanopyAcordPrefillService.ts` |
| ACORD Field Mappings | ✅ Complete | `lib/acord/fieldMappings.ts` |
| ACORD Prefill UI | ✅ Complete | `components/canopy/quotes/CanopyPrefillSelector.tsx` |

### Future Enhancements (Optional)

| Feature | Priority | Notes |
|---------|----------|-------|
| Cron job for auto-refresh | Low | Can use Supabase pg_cron when needed |

---

## Phase 1: Database Schema Enhancements

### 1.1 Pull Snapshots Table (Audit Trail)

```sql
-- Store raw Canopy data for every state transition
CREATE TABLE canopy_pull_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id UUID NOT NULL REFERENCES canopy_pulls(id) ON DELETE CASCADE,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL,
  raw_pull_json JSONB NOT NULL,
  raw_webhook_json JSONB,
  data_hash TEXT,  -- SHA256 for deduplication
  source TEXT CHECK (source IN ('webhook', 'manual_refresh', 'servicing', 'monitoring')),
  policy_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_pull ON canopy_pull_snapshots(pull_id);
CREATE INDEX idx_snapshots_event ON canopy_pull_snapshots(event_type);
CREATE INDEX idx_snapshots_hash ON canopy_pull_snapshots(data_hash);
```

### 1.2 Monitoring Table (2-Way Read Sync)

```sql
-- Track Canopy Monitoring subscriptions
CREATE TABLE canopy_monitorings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canopy_monitoring_id TEXT UNIQUE NOT NULL,
  initial_pull_id UUID REFERENCES canopy_pulls(id),
  latest_pull_id UUID REFERENCES canopy_pulls(id),
  account_id UUID REFERENCES accounts(id),
  lead_id UUID REFERENCES leads(id),

  -- Monitoring config
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'reconnect_required', 'stopped', 'error')),
  refresh_interval_days INTEGER DEFAULT 30,
  next_refresh_date DATE,

  -- Carrier info
  carrier_name TEXT,
  account_identifier TEXT,  -- Carrier account username

  -- Reconnection
  reconnect_token TEXT,
  reconnect_url TEXT,
  reconnect_required_at TIMESTAMPTZ,

  -- Metadata
  last_refresh_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  stopped_at TIMESTAMPTZ
);

CREATE INDEX idx_monitoring_status ON canopy_monitorings(status);
CREATE INDEX idx_monitoring_account ON canopy_monitorings(account_id);
CREATE INDEX idx_monitoring_refresh ON canopy_monitorings(next_refresh_date) WHERE status = 'active';
```

### 1.3 Servicing Actions Table (2-Way Write Sync)

```sql
-- Track Canopy Servicing actions (carrier writes)
CREATE TABLE canopy_servicing_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canopy_servicing_id TEXT UNIQUE,
  pull_id UUID REFERENCES canopy_pulls(id),
  policy_id UUID REFERENCES canopy_policies(id),

  -- Action details
  action_type TEXT NOT NULL,  -- 'add_vehicle', 'update_mortgagee', 'add_driver', etc.
  carrier_id TEXT,
  carrier_name TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'waiting_confirmation', 'confirmed', 'rejected', 'failed', 'cancelled')),

  -- Payload
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  confirmation_data JSONB,  -- Before/after data for user review

  -- User info
  requested_by UUID REFERENCES auth.users(id),
  confirmed_by UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Error handling
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX idx_servicing_status ON canopy_servicing_actions(status);
CREATE INDEX idx_servicing_pull ON canopy_servicing_actions(pull_id);
CREATE INDEX idx_servicing_policy ON canopy_servicing_actions(policy_id);
CREATE INDEX idx_servicing_pending ON canopy_servicing_actions(id) WHERE status = 'waiting_confirmation';
```

### 1.4 Commercial Lines Tables

```sql
-- Commercial Auto Vehicles (Fleet)
CREATE TABLE canopy_commercial_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  unit_number TEXT,
  year INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  vin TEXT,
  vehicle_type TEXT CHECK (vehicle_type IN ('truck', 'van', 'trailer', 'tractor', 'bus', 'other')),
  gvw INTEGER,  -- Gross Vehicle Weight
  radius_of_operation INTEGER,
  cargo_type TEXT,
  driver_id UUID,  -- Assigned driver
  hired_non_owned BOOLEAN DEFAULT FALSE,
  liability_limit NUMERIC(12,2),
  physical_damage_deductible NUMERIC(12,2),
  cargo_limit NUMERIC(12,2),
  coverages JSONB DEFAULT '{}',
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Operations (GL/BOP)
CREATE TABLE canopy_business_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  dba_name TEXT,
  fein TEXT,
  business_type TEXT CHECK (business_type IN ('sole_prop', 'partnership', 'llc', 'corp', 's_corp', 'nonprofit', 'other')),
  legal_entity_type TEXT,
  naics_code TEXT,
  sic_code TEXT,
  class_code TEXT,
  years_in_business INTEGER,
  date_business_started DATE,
  annual_revenue NUMERIC(14,2),
  annual_payroll NUMERIC(14,2),
  employee_count INTEGER,
  full_time_count INTEGER,
  part_time_count INTEGER,
  description_of_operations TEXT,
  products_completed_ops BOOLEAN DEFAULT FALSE,
  uses_subcontractors BOOLEAN DEFAULT FALSE,
  subcontractor_cost NUMERIC(14,2),
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business Locations (Commercial Property)
CREATE TABLE canopy_business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  location_number INTEGER DEFAULT 1,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  county TEXT,

  -- Building details
  occupancy_type TEXT,
  building_ownership TEXT CHECK (building_ownership IN ('owned', 'leased', 'other')),
  construction_type TEXT,
  year_built INTEGER,
  square_footage INTEGER,
  stories INTEGER,
  protection_class TEXT,

  -- Safety features
  sprinklered BOOLEAN DEFAULT FALSE,
  alarm_type TEXT,
  fire_extinguishers BOOLEAN DEFAULT FALSE,

  -- Coverage values
  building_value NUMERIC(14,2),
  contents_value NUMERIC(14,2),
  business_income_value NUMERIC(14,2),
  extra_expense_value NUMERIC(14,2),
  tenant_improvements NUMERIC(14,2),

  -- Deductibles
  property_deductible NUMERIC(12,2),
  wind_hail_deductible NUMERIC(12,2),

  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workers Comp Payroll
CREATE TABLE canopy_payroll (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES canopy_policies(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  class_code TEXT NOT NULL,
  class_description TEXT,
  employee_count INTEGER,
  annual_payroll NUMERIC(14,2) NOT NULL,
  rate NUMERIC(8,4),
  premium NUMERIC(12,2),
  experience_mod NUMERIC(5,3) DEFAULT 1.000,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for commercial tables
CREATE INDEX idx_comm_vehicles_policy ON canopy_commercial_vehicles(policy_id);
CREATE INDEX idx_comm_vehicles_vin ON canopy_commercial_vehicles(vin) WHERE vin IS NOT NULL;
CREATE INDEX idx_business_ops_policy ON canopy_business_operations(policy_id);
CREATE INDEX idx_business_ops_naics ON canopy_business_operations(naics_code);
CREATE INDEX idx_business_loc_policy ON canopy_business_locations(policy_id);
CREATE INDEX idx_business_loc_zip ON canopy_business_locations(zip);
CREATE INDEX idx_payroll_policy ON canopy_payroll(policy_id);
CREATE INDEX idx_payroll_class ON canopy_payroll(class_code);

-- Enable RLS
ALTER TABLE canopy_commercial_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_business_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_monitorings ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_servicing_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canopy_pull_snapshots ENABLE ROW LEVEL SECURITY;
```

---

## Phase 2: Webhook Handler Enhancements

### 2.1 Strict Signature Verification

Current implementation warns but continues on invalid signature. **Change to reject:**

```typescript
// CHANGE FROM:
if (!signatureValid) {
  console.warn('[Canopy Webhook] Signature verification failed, but continuing for debugging');
}

// CHANGE TO:
if (canopyWebhookSecret && signatureHeader && !signatureValid) {
  console.error('[Canopy Webhook] Signature verification FAILED - rejecting');
  return new Response(JSON.stringify({ error: 'Invalid signature' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 2.2 Enhanced Event Handlers

```typescript
// MONITORING_RECONNECT handler
async function handleMonitoringReconnect(supabase: SupabaseClient, payload: any) {
  const { monitoring_id, reconnect_token, reconnect_url, pull_id } = payload;

  await supabase.from('canopy_monitorings').upsert({
    canopy_monitoring_id: monitoring_id,
    status: 'reconnect_required',
    reconnect_token: reconnect_token,
    reconnect_url: reconnect_url,
    reconnect_required_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'canopy_monitoring_id' });

  // Create notification task for user
  await createReconnectNotification(supabase, monitoring_id);
}

// SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION handler
async function handleServicingWaiting(supabase: SupabaseClient, payload: any) {
  const { servicing_id, pull_id, confirmation_data } = payload;

  // Fetch full servicing details from API
  const servicingDetails = await fetchServicingDetails(servicing_id);

  await supabase.from('canopy_servicing_actions').update({
    status: 'waiting_confirmation',
    confirmation_data: servicingDetails.confirmation_data,
    updated_at: new Date().toISOString()
  }).eq('canopy_servicing_id', servicing_id);

  // Create UI notification for user confirmation
  await createServicingConfirmationTask(supabase, servicing_id);
}

// DATA_UPDATED incremental handler
async function handleDataUpdated(supabase: SupabaseClient, payload: any) {
  const updates = payload.data?.updates || [];

  for (const update of updates) {
    switch (update.type) {
      case 'DRIVER_UPDATED':
      case 'DRIVER_ADDED':
        await upsertDriver(supabase, update.policy_id, update.driver);
        break;
      case 'VEHICLE_ADDED':
        await upsertVehicle(supabase, update.policy_id, update.vehicle);
        break;
      // ... other incremental updates
    }
  }

  // Store snapshot for diffing
  await storeSnapshot(supabase, payload.pull_id, 'DATA_UPDATED', payload);
}
```

### 2.3 Snapshot Storage

```typescript
async function storeSnapshot(
  supabase: SupabaseClient,
  pullId: string,
  eventType: string,
  rawPayload: any,
  source: string = 'webhook'
) {
  const hash = await computeHash(JSON.stringify(rawPayload));

  // Check for duplicate (idempotency)
  const { data: existing } = await supabase
    .from('canopy_pull_snapshots')
    .select('id')
    .eq('pull_id', pullId)
    .eq('data_hash', hash)
    .single();

  if (!existing) {
    await supabase.from('canopy_pull_snapshots').insert({
      pull_id: pullId,
      event_type: eventType,
      raw_pull_json: rawPayload.data || rawPayload,
      raw_webhook_json: rawPayload,
      data_hash: hash,
      source: source,
      policy_count: rawPayload.data?.policies?.length || 0
    });
  }
}
```

---

## Phase 3: Monitoring API Integration

### 3.1 New Edge Function: `canopy-monitoring`

```typescript
// supabase/functions/canopy-monitoring/index.ts

// Create monitoring subscription
async function createMonitoring(pullId: string, refreshInterval: number = 30) {
  const response = await fetch(`${CANOPY_API_URL}/monitorings`, {
    method: 'POST',
    headers: canopyHeaders,
    body: JSON.stringify({
      pull_id: pullId,
      refresh_interval: refreshInterval  // days, minimum 30
    })
  });

  const data = await response.json();

  // Store in our DB
  await supabase.from('canopy_monitorings').insert({
    canopy_monitoring_id: data.monitoring_id,
    initial_pull_id: pullId,
    latest_pull_id: pullId,
    refresh_interval_days: refreshInterval,
    status: 'active',
    next_refresh_date: addDays(new Date(), refreshInterval)
  });

  return data;
}

// Refresh monitoring
async function refreshMonitoring(monitoringId: string) {
  const response = await fetch(`${CANOPY_API_URL}/monitorings/${monitoringId}/refresh`, {
    method: 'POST',
    headers: canopyHeaders
  });

  return response.json();
}

// Handle reconnect flow
async function getReconnectUrl(monitoringId: string) {
  const { data: monitoring } = await supabase
    .from('canopy_monitorings')
    .select('reconnect_token')
    .eq('canopy_monitoring_id', monitoringId)
    .single();

  if (!monitoring?.reconnect_token) {
    throw new Error('No reconnect token available');
  }

  // Return URL for SDK to handle reconnect
  return {
    reconnect_url: `https://app.usecanopy.com/reconnect?token=${monitoring.reconnect_token}`
  };
}
```

### 3.2 React Hook: `useCanopyMonitoring`

```typescript
// src/hooks/useCanopyMonitoring.ts

export function useCanopyMonitoring(accountId: string) {
  const supabase = useSupabaseClient();

  // Get monitoring status
  const { data: monitorings } = useQuery({
    queryKey: ['canopy-monitorings', accountId],
    queryFn: async () => {
      const { data } = await supabase
        .from('canopy_monitorings')
        .select('*')
        .eq('account_id', accountId);
      return data;
    }
  });

  // Enable monitoring
  const enableMonitoring = useMutation({
    mutationFn: async (pullId: string) => {
      return supabase.functions.invoke('canopy-monitoring', {
        body: { action: 'create', pull_id: pullId }
      });
    }
  });

  // Trigger refresh
  const refreshNow = useMutation({
    mutationFn: async (monitoringId: string) => {
      return supabase.functions.invoke('canopy-monitoring', {
        body: { action: 'refresh', monitoring_id: monitoringId }
      });
    }
  });

  // Handle reconnect
  const reconnect = useMutation({
    mutationFn: async (monitoringId: string) => {
      const result = await supabase.functions.invoke('canopy-monitoring', {
        body: { action: 'reconnect', monitoring_id: monitoringId }
      });
      // Returns URL to open in popup/redirect
      return result.data.reconnect_url;
    }
  });

  return {
    monitorings,
    enableMonitoring,
    refreshNow,
    reconnect,
    hasReconnectRequired: monitorings?.some(m => m.status === 'reconnect_required')
  };
}
```

---

## Phase 4: Servicing API Integration (2-Way Write)

### 4.1 New Edge Function: `canopy-servicing`

```typescript
// supabase/functions/canopy-servicing/index.ts

// Get supported actions for a carrier
async function getCarrierActions(carrierId: string): Promise<SupportedAction[]> {
  const response = await fetch(`${CANOPY_API_URL}/carriers/${carrierId}`, {
    headers: canopyHeaders
  });
  const data = await response.json();
  return data.supported_actions || [];
}

// Create servicing action
async function createServicingAction(
  pullId: string,
  actionType: string,
  payload: Record<string, any>
) {
  // Create servicing pull
  const response = await fetch(`${CANOPY_API_URL}/servicings`, {
    method: 'POST',
    headers: canopyHeaders,
    body: JSON.stringify({
      pull_id: pullId,
      action_type: actionType,
      ...payload
    })
  });

  const data = await response.json();

  // Store in our DB
  await supabase.from('canopy_servicing_actions').insert({
    canopy_servicing_id: data.servicing_id,
    pull_id: pullId,
    action_type: actionType,
    request_payload: payload,
    status: 'submitted',
    submitted_at: new Date().toISOString()
  });

  return data;
}

// Confirm or reject servicing action
async function confirmServicingAction(
  servicingId: string,
  actionId: string,
  isConfirmed: boolean
) {
  const response = await fetch(
    `${CANOPY_API_URL}/servicings/${servicingId}/actions/${actionId}`,
    {
      method: 'POST',
      headers: canopyHeaders,
      body: JSON.stringify({ is_confirmed: isConfirmed })
    }
  );

  const status = isConfirmed ? 'confirmed' : 'rejected';
  const timestamp = new Date().toISOString();

  await supabase.from('canopy_servicing_actions').update({
    status,
    [isConfirmed ? 'confirmed_at' : 'rejected_at']: timestamp,
    updated_at: timestamp
  }).eq('canopy_servicing_id', servicingId);

  return response.json();
}
```

### 4.2 React Hook: `useCanopyServicing`

```typescript
// src/hooks/useCanopyServicing.ts

export function useCanopyServicing(pullId: string) {
  const supabase = useSupabaseClient();

  // Get available actions for this pull's carrier
  const { data: availableActions } = useQuery({
    queryKey: ['canopy-carrier-actions', pullId],
    queryFn: async () => {
      const result = await supabase.functions.invoke('canopy-servicing', {
        body: { action: 'get_available_actions', pull_id: pullId }
      });
      return result.data;
    }
  });

  // Get pending confirmations
  const { data: pendingConfirmations } = useQuery({
    queryKey: ['canopy-pending-confirmations', pullId],
    queryFn: async () => {
      const { data } = await supabase
        .from('canopy_servicing_actions')
        .select('*')
        .eq('pull_id', pullId)
        .eq('status', 'waiting_confirmation');
      return data;
    }
  });

  // Submit servicing action
  const submitAction = useMutation({
    mutationFn: async ({ actionType, payload }: { actionType: string; payload: any }) => {
      return supabase.functions.invoke('canopy-servicing', {
        body: { action: 'create', pull_id: pullId, action_type: actionType, payload }
      });
    }
  });

  // Confirm/reject action
  const confirmAction = useMutation({
    mutationFn: async ({ servicingId, actionId, confirmed }: {
      servicingId: string;
      actionId: string;
      confirmed: boolean
    }) => {
      return supabase.functions.invoke('canopy-servicing', {
        body: { action: 'confirm', servicing_id: servicingId, action_id: actionId, is_confirmed: confirmed }
      });
    }
  });

  return {
    availableActions,
    pendingConfirmations,
    submitAction,
    confirmAction,
    hasPendingConfirmations: (pendingConfirmations?.length || 0) > 0
  };
}
```

---

## Phase 5: Commercial Lines Processing

### 5.1 Modular Processor Architecture

```
supabase/functions/canopy-reprocess/
├── index.ts                    # Orchestrator
├── processors/
│   ├── personalAuto.ts        # Personal auto processing
│   ├── homeowners.ts          # Homeowners processing
│   ├── renters.ts             # Renters processing
│   ├── condo.ts               # Condo processing
│   ├── umbrella.ts            # Umbrella processing
│   ├── commercialAuto.ts      # Commercial auto/fleet
│   ├── bop.ts                 # Business Owners Policy
│   ├── generalLiability.ts    # GL processing
│   ├── commercialProperty.ts  # Commercial property
│   ├── workersComp.ts         # Workers compensation
│   └── shared/
│       ├── mapping.ts         # Field mapping utilities
│       ├── normalization.ts   # Data normalization
│       ├── upsert.ts          # Idempotent upserts
│       └── diff.ts            # Change detection
└── types.ts                   # TypeScript interfaces
```

### 5.2 Commercial Auto Processor

```typescript
// processors/commercialAuto.ts

export async function processCommercialAutoPolicy(
  supabase: SupabaseClient,
  policyId: string,
  policy: CanopyPolicy
) {
  // Process fleet vehicles
  for (const vehicle of policy.vehicles || []) {
    await upsertCommercialVehicle(supabase, policyId, vehicle);

    // Process assigned drivers
    for (const driver of vehicle.drivers || []) {
      await upsertDriver(supabase, policyId, driver);
    }
  }

  // Process business operations if present
  if (policy.business_info || policy.named_insured_business) {
    await upsertBusinessOperations(supabase, policyId, policy);
  }
}

async function upsertCommercialVehicle(
  supabase: SupabaseClient,
  policyId: string,
  vehicle: any
) {
  const vehicleData = {
    policy_id: policyId,
    unit_number: vehicle.unit_number || vehicle.unit,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    vin: vehicle.vin,
    vehicle_type: mapCommercialVehicleType(vehicle.type || vehicle.body_type),
    gvw: vehicle.gvw || vehicle.gross_vehicle_weight,
    radius_of_operation: vehicle.radius || vehicle.radius_of_operation,
    cargo_type: vehicle.cargo_type,
    hired_non_owned: vehicle.hired_non_owned || false,
    coverages: vehicle.coverages || {},
    raw_data: vehicle,
    updated_at: new Date().toISOString()
  };

  // Upsert by VIN or unit number
  if (vehicle.vin) {
    const { data: existing } = await supabase
      .from('canopy_commercial_vehicles')
      .select('id')
      .eq('policy_id', policyId)
      .eq('vin', vehicle.vin)
      .single();

    if (existing) {
      await supabase.from('canopy_commercial_vehicles')
        .update(vehicleData)
        .eq('id', existing.id);
    } else {
      await supabase.from('canopy_commercial_vehicles').insert(vehicleData);
    }
  } else {
    await supabase.from('canopy_commercial_vehicles').insert(vehicleData);
  }
}
```

### 5.3 Workers Comp Processor

```typescript
// processors/workersComp.ts

export async function processWorkersCompPolicy(
  supabase: SupabaseClient,
  policyId: string,
  policy: CanopyPolicy
) {
  // Process business operations
  await upsertBusinessOperations(supabase, policyId, policy);

  // Process payroll by class code
  for (const payrollItem of policy.payroll || policy.class_codes || []) {
    await upsertPayroll(supabase, policyId, payrollItem);
  }

  // Process locations
  for (const location of policy.locations || []) {
    await upsertBusinessLocation(supabase, policyId, location);
  }
}

async function upsertPayroll(
  supabase: SupabaseClient,
  policyId: string,
  payroll: any
) {
  const payrollData = {
    policy_id: policyId,
    state: payroll.state,
    class_code: payroll.class_code || payroll.code,
    class_description: payroll.description || payroll.class_description,
    employee_count: payroll.employee_count || payroll.employees,
    annual_payroll: payroll.payroll || payroll.annual_payroll,
    rate: payroll.rate,
    premium: payroll.premium,
    experience_mod: payroll.experience_mod || payroll.mod || 1.0,
    raw_data: payroll
  };

  // Upsert by state + class code
  const { data: existing } = await supabase
    .from('canopy_payroll')
    .select('id')
    .eq('policy_id', policyId)
    .eq('state', payroll.state)
    .eq('class_code', payrollData.class_code)
    .single();

  if (existing) {
    await supabase.from('canopy_payroll').update(payrollData).eq('id', existing.id);
  } else {
    await supabase.from('canopy_payroll').insert(payrollData);
  }
}
```

---

## Phase 6: UI Enhancements

### 6.1 Monitoring Status Component

```typescript
// src/components/canopy/CanopyMonitoringStatus.tsx

export function CanopyMonitoringStatus({ accountId }: { accountId: string }) {
  const { monitorings, refreshNow, reconnect, hasReconnectRequired } = useCanopyMonitoring(accountId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Policy Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        {monitorings?.map(monitoring => (
          <div key={monitoring.id} className="flex items-center justify-between p-3 border rounded">
            <div>
              <p className="font-medium">{monitoring.carrier_name}</p>
              <p className="text-sm text-muted-foreground">
                Last refresh: {formatDate(monitoring.last_refresh_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                Next refresh: {formatDate(monitoring.next_refresh_date)}
              </p>
            </div>

            {monitoring.status === 'reconnect_required' ? (
              <Button
                variant="destructive"
                onClick={() => handleReconnect(monitoring.canopy_monitoring_id)}
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Reconnect Required
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => refreshNow.mutate(monitoring.canopy_monitoring_id)}
                disabled={refreshNow.isPending}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Now
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

### 6.2 Servicing Actions Component

```typescript
// src/components/canopy/CanopyServicingActions.tsx

export function CanopyServicingActions({ pullId, policyId }: Props) {
  const { availableActions, pendingConfirmations, submitAction, confirmAction } = useCanopyServicing(pullId);

  return (
    <div className="space-y-4">
      {/* Available Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Settings className="mr-2 h-4 w-4" />
            Policy Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {availableActions?.map(action => (
            <DropdownMenuItem
              key={action.type}
              onClick={() => openActionModal(action)}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Pending Confirmations */}
      {pendingConfirmations?.map(confirmation => (
        <Alert key={confirmation.id} variant="warning">
          <AlertTitle>Action Pending Confirmation</AlertTitle>
          <AlertDescription>
            <div className="mt-2">
              <p><strong>Action:</strong> {confirmation.action_type}</p>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <p className="text-sm font-medium">Before:</p>
                  <pre className="text-xs bg-muted p-2 rounded">
                    {JSON.stringify(confirmation.confirmation_data?.before, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-sm font-medium">After:</p>
                  <pre className="text-xs bg-muted p-2 rounded">
                    {JSON.stringify(confirmation.confirmation_data?.after, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={() => handleConfirm(confirmation, true)}>
                  <Check className="mr-2 h-4 w-4" />
                  Confirm
                </Button>
                <Button variant="outline" onClick={() => handleConfirm(confirmation, false)}>
                  <X className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
```

### 6.3 Commercial Lines Display Cards

```typescript
// src/components/canopy/CommercialVehicleCard.tsx
// src/components/canopy/BusinessOperationsCard.tsx
// src/components/canopy/BusinessLocationCard.tsx
// src/components/canopy/PayrollCard.tsx

// Add to CanopyDataDisplay.tsx tabs
const tabs = [
  { id: 'policies', label: 'Policies', icon: FileText },
  { id: 'vehicles', label: 'Personal Vehicles', icon: Car },
  { id: 'fleet', label: 'Fleet Vehicles', icon: Truck },  // NEW
  { id: 'drivers', label: 'Drivers', icon: User },
  { id: 'properties', label: 'Properties', icon: Home },
  { id: 'locations', label: 'Business Locations', icon: Building },  // NEW
  { id: 'payroll', label: 'Payroll/Class Codes', icon: DollarSign },  // NEW
  { id: 'claims', label: 'Claims', icon: AlertTriangle },
  { id: 'documents', label: 'Documents', icon: FileCheck },
  { id: 'monitoring', label: 'Monitoring', icon: RefreshCw },  // NEW
];
```

---

## Phase 7: Change Detection & Coverage Diff

### 7.1 Diff Engine

```typescript
// src/lib/canopy/diffEngine.ts

export interface PolicyDiff {
  policyId: string;
  changes: FieldChange[];
  addedEntities: { type: string; data: any }[];
  removedEntities: { type: string; id: string }[];
  significance: 'minor' | 'moderate' | 'major';
}

export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'removed' | 'modified';
  significance: 'info' | 'attention' | 'critical';
}

export async function computePolicyDiff(
  supabase: SupabaseClient,
  pullId: string,
  previousPullId: string
): Promise<PolicyDiff[]> {
  // Get snapshots
  const [current, previous] = await Promise.all([
    getSnapshot(supabase, pullId),
    getSnapshot(supabase, previousPullId)
  ]);

  const diffs: PolicyDiff[] = [];

  // Compare policies
  for (const currentPolicy of current.policies) {
    const prevPolicy = previous.policies.find(
      p => p.policy_number === currentPolicy.policy_number
    );

    if (prevPolicy) {
      const changes = comparePolicy(prevPolicy, currentPolicy);
      if (changes.length > 0) {
        diffs.push({
          policyId: currentPolicy.id,
          changes,
          addedEntities: [],
          removedEntities: [],
          significance: calculateSignificance(changes)
        });
      }
    }
  }

  return diffs;
}

// Critical fields that warrant attention
const CRITICAL_FIELDS = [
  'liability_bi', 'liability_pd', 'dwelling_coverage', 'deductible',
  'expiration_date', 'premium_amount', 'status'
];

function calculateSignificance(changes: FieldChange[]): 'minor' | 'moderate' | 'major' {
  if (changes.some(c => CRITICAL_FIELDS.includes(c.field))) {
    return 'major';
  }
  if (changes.length > 5) {
    return 'moderate';
  }
  return 'minor';
}
```

### 7.2 Coverage Recommendations

```typescript
// src/lib/canopy/coverageRecommendations.ts

export interface CoverageGap {
  type: 'under_insured' | 'missing_coverage' | 'cross_sell';
  field: string;
  currentValue: any;
  recommendedValue: any;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export function analyzeCoverageGaps(policy: CanopyPolicy): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  // Auto liability analysis
  if (policy.policy_type === 'auto') {
    const liabilityBI = policy.vehicles?.[0]?.liability_bi || 0;
    if (liabilityBI < 100000) {
      gaps.push({
        type: 'under_insured',
        field: 'liability_bi',
        currentValue: liabilityBI,
        recommendedValue: 100000,
        reason: 'BI limits below $100k leave significant personal asset exposure',
        priority: 'high'
      });
    }
  }

  // Home coverage analysis
  if (policy.policy_type === 'home') {
    const dwelling = policy.dwellings?.[0];
    if (dwelling && !dwelling.flood_coverage) {
      gaps.push({
        type: 'missing_coverage',
        field: 'flood_coverage',
        currentValue: false,
        recommendedValue: true,
        reason: 'Standard homeowners does not cover flood damage',
        priority: 'medium'
      });
    }
  }

  // Cross-sell: No umbrella with auto + home
  // Cross-sell: No life insurance
  // etc.

  return gaps;
}
```

---

## Phase 8: Extended ACORD Prefill

### 8.1 Update `get_canopy_quote_prefill()`

```sql
-- Add commercial outputs to prefill function
CREATE OR REPLACE FUNCTION get_canopy_quote_prefill_v2(p_pull_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'pull_id', cp.id,
    'status', cp.status,

    -- Existing personal lines
    'policies', (...),
    'vehicles', (...),
    'drivers', (...),
    'dwellings', (...),
    'claims_history', (...),

    -- NEW: Commercial data
    'business_operations', (
      SELECT jsonb_agg(jsonb_build_object(
        'business_name', bo.business_name,
        'dba_name', bo.dba_name,
        'fein', bo.fein,
        'business_type', bo.business_type,
        'naics_code', bo.naics_code,
        'sic_code', bo.sic_code,
        'years_in_business', bo.years_in_business,
        'annual_revenue', bo.annual_revenue,
        'employee_count', bo.employee_count,
        'description_of_operations', bo.description_of_operations
      ))
      FROM canopy_business_operations bo
      JOIN canopy_policies pol ON pol.id = bo.policy_id
      WHERE pol.pull_id = cp.id
    ),

    'commercial_vehicles', (
      SELECT jsonb_agg(jsonb_build_object(
        'unit_number', cv.unit_number,
        'year', cv.year,
        'make', cv.make,
        'model', cv.model,
        'vin', cv.vin,
        'vehicle_type', cv.vehicle_type,
        'gvw', cv.gvw,
        'radius_of_operation', cv.radius_of_operation,
        'cargo_type', cv.cargo_type
      ))
      FROM canopy_commercial_vehicles cv
      JOIN canopy_policies pol ON pol.id = cv.policy_id
      WHERE pol.pull_id = cp.id
    ),

    'business_locations', (
      SELECT jsonb_agg(jsonb_build_object(
        'location_number', bl.location_number,
        'address', jsonb_build_object(
          'line1', bl.address_line1,
          'city', bl.city,
          'state', bl.state,
          'zip', bl.zip
        ),
        'building_value', bl.building_value,
        'contents_value', bl.contents_value,
        'construction_type', bl.construction_type,
        'year_built', bl.year_built,
        'square_footage', bl.square_footage,
        'sprinklered', bl.sprinklered
      ))
      FROM canopy_business_locations bl
      JOIN canopy_policies pol ON pol.id = bl.policy_id
      WHERE pol.pull_id = cp.id
    ),

    'payroll', (
      SELECT jsonb_agg(jsonb_build_object(
        'state', py.state,
        'class_code', py.class_code,
        'class_description', py.class_description,
        'employee_count', py.employee_count,
        'annual_payroll', py.annual_payroll,
        'experience_mod', py.experience_mod
      ))
      FROM canopy_payroll py
      JOIN canopy_policies pol ON pol.id = py.policy_id
      WHERE pol.pull_id = cp.id
    )

  ) INTO v_result
  FROM canopy_pulls cp
  WHERE cp.id = p_pull_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Phase 9: Testing & Documentation

### 9.1 Test Plan

```typescript
// __tests__/canopy/webhook.test.ts
describe('Canopy Webhook Handler', () => {
  describe('Signature Verification', () => {
    it('rejects invalid signatures with 401');
    it('accepts valid signatures');
    it('handles missing signature header');
  });

  describe('Event Handlers', () => {
    it('processes AUTH_STATUS correctly');
    it('processes POLICY_AVAILABLE correctly');
    it('processes COMPLETE and creates lead');
    it('handles DATA_UPDATED incrementally');
    it('handles MONITORING_RECONNECT');
    it('handles SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION');
    it('handles ERROR gracefully');
  });

  describe('Idempotency', () => {
    it('handles duplicate webhooks correctly');
    it('processes out-of-order events');
  });
});

// __tests__/canopy/commercial.test.ts
describe('Commercial Lines Processing', () => {
  it('processes commercial auto with fleet vehicles');
  it('processes BOP with GL + property');
  it('processes workers comp with payroll');
  it('maps to ACORD 127 correctly');
  it('maps to ACORD 130 correctly');
});

// __tests__/canopy/monitoring.test.ts
describe('Monitoring Integration', () => {
  it('creates monitoring subscription');
  it('handles refresh');
  it('handles reconnect flow');
});

// __tests__/canopy/servicing.test.ts
describe('Servicing Integration', () => {
  it('gets available actions for carrier');
  it('submits add vehicle action');
  it('handles confirmation flow');
  it('handles rejection');
});
```

### 9.2 Documentation Deliverables

1. **docs/CANOPY-2WAY-SYNC.md** - This document (implementation plan)
2. **docs/CANOPY-LOB-COVERAGE.md** - What's supported per LOB
3. **docs/CANOPY-SECURITY.md** - Signature verification, secrets, PII handling
4. **docs/CANOPY-TROUBLESHOOTING.md** - Common errors, retry strategy

---

## Implementation Timeline

| Phase | Description | Effort | Dependencies |
|-------|-------------|--------|--------------|
| 1 | Database Schema | 8h | None |
| 2 | Webhook Enhancements | 8h | Phase 1 |
| 3 | Monitoring API | 12h | Phase 1, 2 |
| 4 | Servicing API | 16h | Phase 1, 2 |
| 5 | Commercial Processing | 16h | Phase 1, 2 |
| 6 | UI Enhancements | 16h | Phase 3, 4, 5 |
| 7 | Change Detection | 8h | Phase 5 |
| 8 | ACORD Prefill | 8h | Phase 5 |
| 9 | Testing & Docs | 16h | All phases |

**Total Estimated Effort:** 108 hours (~14 developer days)

---

## Definition of Done

- [x] Personal Auto + Home still work end-to-end
- [x] Commercial Auto + BOP/GL + WC have schema, ingestion, and UI
- [x] Webhook signatures are verified and invalid ones rejected
- [x] All event types are properly handled
- [x] Monitoring can be enabled, refreshed, and reconnected
- [x] At least 2 servicing actions functional (Add Vehicle + Request ID Card)
- [x] ACORD exports prefill without missing core fields
- [x] Tests exist for all major flows (212 tests passing)
- [x] Documentation complete

---

**Document Version:** 2.0
**Created:** December 27, 2024
**Updated:** December 27, 2024
**Author:** Claude Code
**Status:** ✅ IMPLEMENTATION COMPLETE
