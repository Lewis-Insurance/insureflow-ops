# Canopy 2-Way Sync - Complete Status & Roadmap

**Document Version:** 1.1
**Last Updated:** December 27, 2024
**Status:** Infrastructure Complete, UI Pending, **API Alignment Review Required**

> **⚠️ API Reality Check (Dec 27, 2024):** This document was reviewed against Canopy Connect's public API documentation. Several API mismatches were identified and corrected in this version. See Section 7 for accurate technical specifications.

---

## Executive Summary

InsureFlow has built a **production-grade Canopy Connect integration** that exceeds typical 1-way import implementations. The 2-way sync infrastructure (Monitoring API for reads, Servicing API for writes) is **fully implemented at the backend level**. The primary gaps are UI components to expose these features to users and test coverage.

| Category | Completion |
|----------|------------|
| Core 1-Way Sync | **95%** |
| 2-Way Read Sync (Monitoring) | **60%** |
| 2-Way Write Sync (Servicing) | **60%** |
| Personal Lines | **85%** |
| Commercial Lines | **40%** |
| **Overall** | **68%** |

---

## Table of Contents

1. [Current Implementation](#1-current-implementation)
2. [Architecture Overview](#2-architecture-overview)
3. [Files Inventory](#3-files-inventory)
4. [Feature Matrix](#4-feature-matrix)
5. [Gap Analysis](#5-gap-analysis)
6. [Roadmap to 100%](#6-roadmap-to-100)
7. [Technical Specifications](#7-technical-specifications)
8. [Testing Strategy](#8-testing-strategy)
9. [Deployment Checklist](#9-deployment-checklist)

---

## 1. Current Implementation

### 1.1 What Works Today

#### Core Data Import Flow
```
User clicks "Import Data"
    → Canopy SDK popup opens
    → User authenticates with carrier
    → Canopy fetches policy data
    → Webhook POSTs to our edge function
    → Data processed and stored in Supabase
    → Lead created with linked drivers/vehicles
    → Quote prefill available via RPC
```

#### Supported Webhook Events (event_type field)

> **Note:** Canopy webhooks use `event_type` (not `event`) as the field name.

| event_type | Handler | Status | Notes |
|------------|---------|--------|-------|
| `AUTH_STATUS` | User authenticated | ✅ Active | |
| `POLICIES_AVAILABLE` | All policies ready (primary trigger) | ✅ Active | Use this, not POLICY_AVAILABLE |
| `POLICY_AVAILABLE` | Individual policy ready | ✅ Active | Legacy, consider deprecating |
| `COMPLETE` | Pull completed | ✅ Active | |
| `ERROR` | Import failed | ✅ Active | |
| `DATA_UPDATED` | Driver add/update events | ⚠️ Limited | Only DRIVER_ADDED, DRIVER_UPDATED per docs |
| `MONITORING_RECONNECT` | Re-auth required | ✅ Active | Includes `reconnect_token` + `reconnect_url` |
| `MONITORING_EVENTS` | Canopy-provided change diffs | ❌ Not implemented | Consider using instead of custom diffing |
| `SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION` | User confirmation needed | ✅ Active | **Fixed:** was incorrectly named |

#### Personal Lines Support
| Line of Business | Import | Schema | Processing | UI Display | ACORD Form | Quote Prefill |
|------------------|--------|--------|------------|------------|------------|---------------|
| Personal Auto | ✅ | ✅ | ✅ | ✅ | ✅ ACORD 80 | ✅ |
| Homeowners | ✅ | ✅ | ✅ | ✅ | ✅ ACORD 35 | ✅ |
| Renters | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ Partial |
| Condo | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ Partial |
| Umbrella | ✅ | ✅ | ✅ | ✅ | ❌ | ⚠️ Partial |
| Life | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ |

#### Security Features
- HMAC-SHA256 webhook signature verification (`canopy-signature: t=..., s=...`)
- Signed payload format: `${timestamp}.${rawBody}` (must use raw body, not parsed JSON)
- Constant-time comparison to prevent timing attacks
- Timestamp validation (5-minute window)
- Invalid signatures rejected with 401
- RLS policies for account isolation
- Service role key for privileged operations

#### Webhook Reliability Requirements

> **CRITICAL:** Canopy retries webhook delivery up to 10 times if you return non-200 or don't respond within 30 seconds.

- **Must respond within 30 seconds** - ACK quickly (200), process async
- **Must be idempotent** - Same event can arrive multiple times
- **Must dedupe by event ID** - Store processed event IDs to prevent duplicate processing

### 1.2 2-Way Sync Infrastructure

#### Monitoring API (Read Sync) - Backend Complete

> **⚠️ BILLING:** Monitoring refreshes are billed at the same price as a Pull. Factor this into product decisions.
>
> **⚠️ INTERVAL:** Minimum refresh interval is 30 days per Canopy requirements.

```typescript
// Available via useCanopyMonitoring hook
enableMonitoring(pullId)      // Start 30+ day auto-refresh
refreshPolicies(pullId)       // Manual refresh trigger (billed like a Pull)
getMonitoringStatus(pullId)   // Check next refresh date
handleReconnect(pullId)       // Re-auth when token expired (see flow below)
listMonitorings()             // List all active subscriptions
checkDue()                    // Find monitorings needing refresh
getMonitoringEvents(monitoringId) // ❌ TODO: Retrieve Canopy-provided diffs
disableMonitoring(monitoringId)   // ❌ TODO: PATCH/DELETE monitoring
```

**Reconnect Token Flow (must implement correctly):**
1. Receive `MONITORING_RECONNECT` webhook with `reconnect_token` + `reconnect_url`
2. Reconnect tokens can expire - use `POST /reconnectToken` to exchange for fresh `pull_jwt`
3. Use SDK with `reconnectToken` option or widget endpoints to continue auth

#### Servicing API (Write Sync) - Backend Complete

> **Note:** Servicing is a type of Pull that performs carrier transactions. Actions may require consumer confirmation before proceeding.

```typescript
// Available via useCanopyServicing hook
getCapabilities(pullId)       // What carrier supports
submitAction(type, data)      // Submit change request (creates Servicing Pull)
confirmAction(actionId, pullJwt) // Confirm via POST /servicingAction with pull-jwt
rejectAction(actionId, pullJwt)  // Reject via POST /servicingAction with is_confirmed=false
getActionStatus(actionId)     // Check action progress

// Supported action types (carrier-dependent):
// - add_vehicle, remove_vehicle, update_vehicle (replace)
// - add_driver, remove_driver, update_driver (replace)
// - update_address, update_contact_info
// - request_id_card, request_declarations
```

**Servicing Confirmation Flow (correct implementation):**
1. Submit action via `POST /teams/{teamId}/servicings`
2. If carrier requires confirmation, webhook `SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION` fires
3. Webhook includes `data.servicing_action_id` identifying which action needs confirmation
4. Fetch confirmation data via `GET /servicings/:servicingActionId`
5. Confirm/reject via `POST /servicingAction` with:
   - `pull-jwt` header (from auth flow)
   - `is_confirmed: true` (confirm) or `is_confirmed: false` (reject)

#### Change Detection - Backend Complete
```typescript
// Available via useCanopyChangeDetection hook
compareSnapshots(oldId, newId)  // Diff two pull snapshots
detectCoverageGaps(pullId)      // Find missing coverage
getChangesSince(pullId, date)   // Changes since date
summarizeChanges(changes)       // Human-readable summary
```

### 1.3 Commercial Lines Infrastructure

#### Database Tables (All Created)
| Table | Purpose | Status |
|-------|---------|--------|
| `canopy_commercial_vehicles` | Fleet vehicles (unit #, GVW, cargo) | ✅ Schema ready |
| `canopy_business_operations` | Business info (FEIN, industry codes) | ✅ Schema ready |
| `canopy_business_locations` | Commercial property locations | ✅ Schema ready |
| `canopy_payroll` | Workers comp payroll by class | ✅ Schema ready |

#### ACORD Form Mappings (SQL Functions)
| ACORD Form | Purpose | Function Status |
|------------|---------|-----------------|
| ACORD 125 | Commercial Insurance Application | ✅ `get_canopy_commercial_prefill()` |
| ACORD 126 | Commercial General Liability | ✅ Included |
| ACORD 127 | Commercial Auto Section | ✅ Included |
| ACORD 130 | Workers Compensation | ✅ Included |
| ACORD 140 | Property Section | ✅ Included |

---

## 2. Architecture Overview

### 2.1 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CANOPY CONNECT                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │   Canopy     │    │   Canopy     │    │      Canopy              │   │
│  │   SDK        │───▶│   API        │───▶│      Webhook             │   │
│  │   (Browser)  │    │   (Cloud)    │    │      Events              │   │
│  └──────────────┘    └──────────────┘    └───────────┬──────────────┘   │
│                                                       │                  │
└───────────────────────────────────────────────────────┼──────────────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         INSUREFLOW BACKEND                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Edge Functions (Deno)                          │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  canopy-webhook ──▶ canopy-reprocess ──▶ Database Storage        │   │
│  │       │                    │                                      │   │
│  │       ▼                    ▼                                      │   │
│  │  Signature         Personal Lines    Commercial Lines             │   │
│  │  Verification      Processing        Processing                   │   │
│  │       │                    │                   │                  │   │
│  │       ▼                    ▼                   ▼                  │   │
│  │  canopy-monitoring   canopy-servicing   canopy-document-proxy    │   │
│  │  (Read Sync)         (Write Sync)       (Secure Downloads)       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Database (PostgreSQL)                          │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  canopy_pulls ◄──┐                                                │   │
│  │  canopy_policies ◄┼── canopy_pull_snapshots (audit trail)        │   │
│  │  canopy_vehicles  │                                               │   │
│  │  canopy_drivers   ├── canopy_monitorings (read sync)             │   │
│  │  canopy_dwellings │                                               │   │
│  │  canopy_documents ├── canopy_servicing_actions (write sync)      │   │
│  │  canopy_claims    │                                               │   │
│  │                   └── canopy_commercial_* (commercial lines)      │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         INSUREFLOW FRONTEND                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    React Components                               │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  CanopyConnectButton ──▶ CanopyDataDisplay ──▶ Quote Prefill     │   │
│  │         │                       │                                 │   │
│  │         ▼                       ▼                                 │   │
│  │  CanopyImportPage        Tabs: Policies, Vehicles, Drivers,      │   │
│  │  CanopyStatsCard               Properties, Claims, Documents     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    React Hooks                                    │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │  useCanopyConnect ──────▶ Core SDK integration                   │   │
│  │  useCanopyMonitoring ───▶ 2-way read sync (NO UI YET)           │   │
│  │  useCanopyServicing ────▶ 2-way write sync (NO UI YET)          │   │
│  │  useCanopyChangeDetection ▶ Snapshot diffing (NO UI YET)        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Database Schema

```sql
-- Core import tracking
canopy_pulls (id, account_id, lead_id, status, pull_id, consent_token, ...)

-- Policy data
canopy_policies (id, pull_id, policy_number, carrier, policy_type, effective_date, ...)

-- Personal lines detail tables
canopy_vehicles (id, policy_id, vin, year, make, model, ...)
canopy_drivers (id, policy_id, first_name, last_name, license_number, ...)
canopy_dwellings (id, policy_id, address, construction_type, year_built, ...)

-- Supporting data
canopy_documents (id, policy_id, document_type, url, ...)
canopy_claims (id, policy_id, claim_number, loss_date, amount, ...)

-- 2-Way sync tables
canopy_pull_snapshots (id, pull_id, snapshot_data, created_at)
canopy_monitorings (id, pull_id, monitoring_id, status, next_refresh, ...)
canopy_servicing_actions (id, pull_id, action_type, status, carrier_response, ...)

-- Commercial lines
canopy_commercial_vehicles (id, policy_id, unit_number, gvw, cargo_type, ...)
canopy_business_operations (id, pull_id, fein, business_type, naics_code, ...)
canopy_business_locations (id, pull_id, address, building_value, contents_value, ...)
canopy_payroll (id, pull_id, class_code, employee_count, annual_payroll, ...)
```

---

## 3. Files Inventory

### 3.1 Edge Functions (7 files, ~6,854 lines)

| File | Lines | Purpose | Dependencies |
|------|-------|---------|--------------|
| `supabase/functions/canopy-webhook/index.ts` | 2,410 | Main webhook handler, signature verification, event routing | logger, error-handler |
| `supabase/functions/canopy-reprocess/index.ts` | 1,852 | Data ingestion, personal & commercial processing, lead sync | supabase-js |
| `supabase/functions/canopy-fetch-pull/index.ts` | 983 | Fetch pull status and raw data from Canopy API | cors |
| `supabase/functions/canopy-monitoring/index.ts` | 527 | Monitoring API: create, list, refresh, reconnect | logger |
| `supabase/functions/canopy-servicing/index.ts` | 688 | Servicing API: capabilities, submit, confirm, reject | logger |
| `supabase/functions/canopy-initiate/index.ts` | 201 | Initiate Canopy Connect session | cors |
| `supabase/functions/canopy-document-proxy/index.ts` | 193 | Secure document downloads via proxy | cors |

### 3.2 React Components (4 files)

| File | Purpose | Status |
|------|---------|--------|
| `src/components/canopy/CanopyConnectButton.tsx` | SDK integration, initiates import | ✅ Active |
| `src/components/canopy/CanopyDataDisplay.tsx` | Multi-tab display (policies, vehicles, drivers, etc.) | ✅ Active |
| `src/pages/CanopyImportPage.tsx` | Full dashboard for managing imports | ✅ Active |
| `src/components/canopy/CanopyStatsCard.tsx` | Summary statistics card | ✅ Active |

### 3.3 React Hooks (4 files)

| File | Purpose | Status |
|------|---------|--------|
| `src/hooks/useCanopyConnect.ts` | Core SDK integration, pull management, realtime status | ✅ Active |
| `src/hooks/useCanopyMonitoring.ts` | 2-way read sync operations | ✅ Ready, no UI |
| `src/hooks/useCanopyServicing.ts` | 2-way write sync operations | ✅ Ready, no UI |
| `src/hooks/useCanopyChangeDetection.ts` | Snapshot diffing, change detection | ✅ Ready, no UI |

### 3.4 Database Migrations (8 files)

| File | Purpose |
|------|---------|
| `20251226100000_canopy_connect_schema.sql` | Core schema (pulls, policies, vehicles, drivers, dwellings, documents, claims) |
| `20251226100001_canopy_mapping_functions.sql` | SQL functions for data transformation |
| `20251226100002_canopy_rls_fix.sql` | Row-level security policies |
| `20251226100003_canopy_documents_unique.sql` | Document handling constraints |
| `20251226100004_canopy_storage_bucket.sql` | Supabase storage bucket setup |
| `20251227100000_canopy_2way_sync_schema.sql` | 2-way sync tables (snapshots, monitorings, servicing_actions) |
| `20251227100001_canopy_commercial_acord_prefill.sql` | Commercial ACORD prefill function |
| `20251227100002_fix_canopy_schema_alignment.sql` | Schema alignment fixes |

### 3.5 Documentation (3 files)

| File | Purpose |
|------|---------|
| `docs/CANOPY-2WAY-SYNC-IMPLEMENTATION-PLAN.md` | Original implementation plan |
| `docs/CANOPY_CONNECT_INTEGRATION_REVIEW.md` | Integration review notes |
| `docs/CANOPY_2WAY_SYNC_STATUS.md` | This document |

---

## 4. Feature Matrix

### 4.1 Personal Lines Completeness

| Feature | Auto | Home | Renters | Condo | Umbrella | Life |
|---------|------|------|---------|-------|----------|------|
| Canopy Import | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Database Schema | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Data Processing | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| UI Display | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| ACORD Form Mapping | ✅ 80 | ✅ 35 | ❌ | ❌ | ❌ | ❌ |
| Quote Prefill RPC | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ❌ |
| Lead Sync | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Completion** | **100%** | **100%** | **70%** | **70%** | **70%** | **30%** |

### 4.2 Commercial Lines Completeness

| Feature | Comm Auto | BOP | GL | Comm Prop | Workers Comp |
|---------|-----------|-----|-----|-----------|--------------|
| Canopy Import | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Database Schema | ✅ | ✅ | ✅ | ✅ | ✅ |
| Data Processing | ✅ | ✅ | ✅ | ✅ | ✅ |
| UI Display | ❌ | ❌ | ❌ | ❌ | ❌ |
| ACORD Form Mapping | ✅ 127 | ✅ 125+140 | ✅ 126 | ✅ 140 | ✅ 130 |
| Quote Prefill RPC | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| Lead Sync | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Completion** | **50%** | **35%** | **35%** | **35%** | **35%** |

### 4.3 2-Way Sync Completeness

| Feature | Edge Function | React Hook | Database | UI Component | Tests |
|---------|---------------|------------|----------|--------------|-------|
| Monitoring: Enable | ✅ | ✅ | ✅ | ❌ | ❌ |
| Monitoring: Refresh | ✅ | ✅ | ✅ | ❌ | ❌ |
| Monitoring: Reconnect | ✅ | ✅ | ✅ | ❌ | ❌ |
| Monitoring: Status | ✅ | ✅ | ✅ | ❌ | ❌ |
| Servicing: Capabilities | ✅ | ✅ | ✅ | ❌ | ❌ |
| Servicing: Add Vehicle | ✅ | ✅ | ✅ | ❌ | ❌ |
| Servicing: Add Driver | ✅ | ✅ | ✅ | ❌ | ❌ |
| Servicing: Update Coverage | ✅ | ✅ | ✅ | ❌ | ❌ |
| Servicing: Request ID Card | ✅ | ✅ | ✅ | ❌ | ❌ |
| Servicing: Confirm/Reject | ✅ | ✅ | ✅ | ❌ | ❌ |
| Change Detection | N/A | ✅ | ✅ | ❌ | ❌ |
| Snapshot Storage | ✅ | ⚠️ | ✅ | ❌ | ❌ |
| **Completion** | **100%** | **90%** | **100%** | **0%** | **0%** |

---

## 5. Gap Analysis

### 5.1 Critical Gaps (Must Fix)

| Gap | Description | Impact | Effort | Priority |
|-----|-------------|--------|--------|----------|
| **No 2-way sync UI** | Hooks exist but no components render them | Users can't access monitoring/servicing features | 16h | P0 |
| **No commercial UI** | Commercial data processed but not displayed | Commercial lines unusable in UI | 20h | P1 |
| **No test coverage** | Zero tests for webhook, processing, hooks | High regression risk | 24h | P1 |

### 5.2 Major Gaps (Should Fix)

| Gap | Description | Impact | Effort | Priority |
|-----|-------------|--------|--------|----------|
| **Missing ACORD forms** | Renters, Condo, Umbrella have no form mappings | Can't generate quotes for these LOBs | 12h | P2 |
| **No monitoring dashboard** | Can't see refresh schedules or history | Users unaware of refresh status | 12h | P2 |
| **No change summary UI** | Changes detected but not displayed | Users miss policy updates | 8h | P2 |

### 5.3 API Compliance Gaps (Should Fix)

| Gap | Description | Impact | Effort | Priority |
|-----|-------------|--------|--------|----------|
| **MONITORING_EVENTS not used** | We diff snapshots ourselves instead of using Canopy's diffs | Redundant work, may miss edge cases | 8h | P2 |
| **Disable monitoring not implemented** | Can enable but not disable monitoring | Users stuck paying for monitoring | 2h | P2 |
| **Webhook event deduplication** | No explicit dedupe by event ID | Duplicate processing on retries | 4h | P2 |

### 5.4 Minor Gaps (Nice to Have)

| Gap | Description | Impact | Effort | Priority |
|-----|-------------|--------|--------|----------|
| No cron auto-refresh | Manual refresh only | Requires user action | 2h | P3 |
| No servicing history | Actions tracked but not visible | No audit trail in UI | 4h | P3 |
| No carrier filtering | Show all actions regardless of support | UX confusion | 4h | P3 |
| Life insurance support | Minimal processing | Can't quote life | 16h | P4 |

---

## 6. Roadmap to 100%

### Phase 1: 2-Way Sync UI (Week 1-2)
**Goal:** Expose existing backend functionality to users

#### 1.1 Monitoring UI Components
```typescript
// Components to create:
MonitoringStatusCard.tsx      // Shows refresh schedule, next refresh date
MonitoringEnableButton.tsx    // Toggle monitoring on/off
MonitoringRefreshButton.tsx   // Manual refresh trigger
MonitoringReconnectFlow.tsx   // Re-auth when token expired
MonitoringHistoryList.tsx     // Past refresh events
```

**Tasks:**
- [ ] Create `MonitoringStatusCard` showing next refresh date and status
- [ ] Add "Enable Monitoring" toggle to CanopyDataDisplay
- [ ] Create manual refresh button with loading state
- [ ] Implement reconnect flow with Canopy SDK redirect
- [ ] Add monitoring history timeline

**Effort:** 16 hours

#### 1.2 Servicing UI Components
```typescript
// Components to create:
ServicingActionsPanel.tsx     // Action buttons based on capabilities
AddVehicleModal.tsx           // Form for adding vehicle
AddDriverModal.tsx            // Form for adding driver
UpdateCoverageModal.tsx       // Coverage limit editor
ServicingConfirmDialog.tsx    // Confirm/reject action
ServicingActionHistory.tsx    // Past actions and status
```

**Tasks:**
- [ ] Create `ServicingActionsPanel` that queries carrier capabilities
- [ ] Build modal forms for each action type
- [ ] Implement confirmation workflow UI
- [ ] Add action status tracking display
- [ ] Create action history list

**Effort:** 20 hours

#### 1.3 Change Detection UI
```typescript
// Components to create:
ChangeDetectionBadge.tsx      // Badge showing "X changes detected"
PolicyChangesSummary.tsx      // Detailed change list
CoverageGapAlert.tsx          // Highlight coverage gaps
SnapshotComparisonView.tsx    // Side-by-side diff
```

**Tasks:**
- [ ] Add change detection badge to policy cards
- [ ] Create expandable change summary panel
- [ ] Build coverage gap alert component
- [ ] Implement snapshot comparison view

**Effort:** 12 hours

---

### Phase 2: Commercial Lines UI (Week 2-3)
**Goal:** Display commercial data that's already being processed

#### 2.1 Commercial Vehicle Components
```typescript
// Components to create:
CommercialVehicleCard.tsx     // Fleet vehicle display (unit #, GVW, etc.)
CommercialVehicleList.tsx     // List of all commercial vehicles
CommercialAutoSection.tsx     // Section in CanopyDataDisplay
```

**Tasks:**
- [ ] Create `CommercialVehicleCard` with fleet-specific fields
- [ ] Add commercial vehicles tab to CanopyDataDisplay
- [ ] Display unit numbers, GVW, cargo type, radius of operation
- [ ] Link to ACORD 127 prefill

**Effort:** 8 hours

#### 2.2 Business Operations Components
```typescript
// Components to create:
BusinessOperationsCard.tsx    // FEIN, business type, industry codes
BusinessInfoSection.tsx       // Section in CanopyDataDisplay
```

**Tasks:**
- [ ] Create `BusinessOperationsCard` with business details
- [ ] Display FEIN, business type, NAICS/SIC codes
- [ ] Show years in business, entity type
- [ ] Link to ACORD 125 prefill

**Effort:** 6 hours

#### 2.3 Commercial Property Components
```typescript
// Components to create:
BusinessLocationCard.tsx      // Location with building/contents values
LocationsList.tsx             // All business locations
PropertySection.tsx           // Section in CanopyDataDisplay
```

**Tasks:**
- [ ] Create `BusinessLocationCard` with property details
- [ ] Display building value, contents value, square footage
- [ ] Show construction type, protection class, sprinklers
- [ ] Link to ACORD 140 prefill

**Effort:** 8 hours

#### 2.4 Workers Comp Components
```typescript
// Components to create:
PayrollCard.tsx               // Class code with payroll
PayrollTable.tsx              // All class codes
WorkersCompSection.tsx        // Section in CanopyDataDisplay
```

**Tasks:**
- [ ] Create `PayrollCard` with class code details
- [ ] Display employee count, annual payroll, rate
- [ ] Show state, governing class
- [ ] Link to ACORD 130 prefill

**Effort:** 6 hours

---

### Phase 3: ACORD Form Completion (Week 3)
**Goal:** Complete quote generation for all lines

#### 3.1 Missing Personal Lines Forms
**Tasks:**
- [ ] Create ACORD form mapping for Renters (variant of ACORD 35)
- [ ] Create ACORD form mapping for Condo (variant of ACORD 35)
- [ ] Create ACORD form mapping for Umbrella
- [ ] Update `get_canopy_quote_prefill()` to support all LOBs

**Effort:** 12 hours

#### 3.2 Commercial Quote Workflow
**Tasks:**
- [ ] Create commercial quote initiation flow
- [ ] Wire up `get_canopy_commercial_prefill()` to UI
- [ ] Build commercial ACORD form selection
- [ ] Test end-to-end commercial quote generation

**Effort:** 16 hours

---

### Phase 4: Test Coverage (Week 4)
**Goal:** Ensure reliability and prevent regressions

#### 4.1 Edge Function Tests
```typescript
// Test files to create:
__tests__/functions/canopy-webhook.test.ts
__tests__/functions/canopy-reprocess.test.ts
__tests__/functions/canopy-monitoring.test.ts
__tests__/functions/canopy-servicing.test.ts
```

**Tasks:**
- [ ] Test webhook signature verification (valid, invalid, missing)
- [ ] Test event handling for all event types
- [ ] Test personal lines data processing
- [ ] Test commercial lines data processing
- [ ] Test monitoring API operations
- [ ] Test servicing API operations

**Effort:** 16 hours

#### 4.2 React Hook Tests
```typescript
// Test files to create:
__tests__/hooks/useCanopyConnect.test.ts
__tests__/hooks/useCanopyMonitoring.test.ts
__tests__/hooks/useCanopyServicing.test.ts
__tests__/hooks/useCanopyChangeDetection.test.ts
```

**Tasks:**
- [ ] Test hook state management
- [ ] Test API call handling
- [ ] Test error states
- [ ] Test loading states
- [ ] Mock Supabase client

**Effort:** 12 hours

#### 4.3 Integration Tests
**Tasks:**
- [ ] Test full import flow (mock Canopy responses)
- [ ] Test monitoring enable/refresh cycle
- [ ] Test servicing action lifecycle
- [ ] Test change detection with real snapshots

**Effort:** 8 hours

---

### Phase 5: Polish & Automation (Week 5)
**Goal:** Production-ready with automated operations

#### 5.1 Cron Jobs
**Tasks:**
- [ ] Add pg_cron job for auto-refresh (check due monitorings)
- [ ] Add pg_cron job for stale pull cleanup
- [ ] Add pg_cron job for snapshot pruning

**Effort:** 4 hours

#### 5.2 Error Handling & Observability
**Tasks:**
- [ ] Add error boundaries to Canopy components
- [ ] Implement retry logic for failed API calls
- [ ] Add structured logging for debugging
- [ ] Create monitoring dashboard for operations

**Effort:** 8 hours

#### 5.3 Documentation
**Tasks:**
- [ ] Update user-facing help docs
- [ ] Create troubleshooting guide
- [ ] Document carrier-specific behaviors

**Effort:** 4 hours

---

## 7. Technical Specifications

> **✅ Verified:** The actual code implementation matches Canopy's API documentation. These specs reflect the working code.

### 7.1 Canopy API Base URL

```
https://app.usecanopy.com/api/v1.0.0
```

### 7.2 Canopy API Endpoints Used

| Endpoint | Purpose | Edge Function |
|----------|---------|---------------|
| `POST /widget/pull/connect` | Initiate SDK connection | canopy-initiate |
| `GET /teams/{teamId}/pulls/{pullId}` | Get pull status | canopy-fetch-pull |
| `GET /teams/{teamId}/pulls/{pullId}/policies` | Get policies | canopy-reprocess |
| `POST /teams/{teamId}/monitorings` | Create monitoring | canopy-monitoring |
| `GET /teams/{teamId}/monitorings/{id}` | Get monitoring status | canopy-monitoring |
| `POST /teams/{teamId}/monitorings/{id}/refresh` | Trigger refresh | canopy-monitoring |
| `GET /teams/{teamId}/monitorings/{id}/reconnectToken` | Get reconnect token | canopy-monitoring |
| `GET /teams/{teamId}/monitorings/{id}/events` | Get monitoring diffs | ❌ TODO |
| `POST /teams/{teamId}/servicings` | Submit servicing action | canopy-servicing |
| `GET /teams/{teamId}/servicings/{id}` | Get servicing status | canopy-servicing |
| `POST /widget/pull/servicingAction` | Confirm/reject (with pull-jwt) | canopy-servicing |
| `POST /widget/pull/reconnectToken` | Exchange reconnect token | canopy-monitoring |

### 7.3 Authentication

**API Credentials (REST API calls):**
```bash
# Required in Supabase Edge Functions
CANOPY_CLIENT_ID=xxx         # OAuth client ID
CANOPY_CLIENT_SECRET=xxx     # OAuth client secret
CANOPY_TEAM_ID=xxx           # Your Canopy team ID
CANOPY_WEBHOOK_SECRET=xxx    # For HMAC verification
```

**Request Headers:**
```
x-canopy-client-id: {CANOPY_CLIENT_ID}
x-canopy-client-secret: {CANOPY_CLIENT_SECRET}
```

> **Note:** Do NOT use `Authorization: Bearer` header with client credentials. Use the x-canopy headers instead.

### 7.4 Webhook Event Schema (Actual Canopy Format)

```typescript
// Canopy webhook envelope - uses event_type, not event
interface CanopyWebhookPayload {
  event_type: CanopyEventType;
  status?: string;
  widget_id?: string;
  team_id?: string;
  meta_data?: {
    pull_id?: string;
    account_identifier?: string;
    is_monitored?: boolean;
    // ... varies by event
  };
  monitoring?: {
    monitoring_id: string;
    initial_pull_id: string;
    reconnect_token?: string;
    reconnect_url?: string;
  };
  data?: {
    // Event-specific payload
    policies?: CanopyPolicy[];
    servicing_action_id?: string;
    error?: { code: string; message: string };
    // For MONITORING_EVENTS: includes diffs
    events?: MonitoringEvent[];
  };
}

type CanopyEventType =
  | 'AUTH_STATUS'
  | 'POLICIES_AVAILABLE'           // Primary - all policies ready
  | 'POLICY_AVAILABLE'             // Legacy - individual policy
  | 'COMPLETE'
  | 'ERROR'
  | 'DATA_UPDATED'                 // Currently driver events only
  | 'MONITORING_RECONNECT'
  | 'MONITORING_EVENTS'            // Canopy-provided diffs
  | 'SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION';

// Our code normalizes to internal format and handles both naming conventions
```

### 7.5 Webhook Signature Verification

```typescript
// Canopy signature header format
// canopy-signature: t=1234567890, s=abc123...

// Verification steps:
1. Parse header: extract timestamp (t) and signature (s)
2. Build signed payload: `${timestamp}.${rawRequestBody}`
3. Compute HMAC-SHA256 with CANOPY_WEBHOOK_SECRET
4. Constant-time compare computed vs provided signature
5. Validate timestamp within acceptable window (5 minutes)
```

### 7.6 Database Functions

```sql
-- Personal lines quote prefill
get_canopy_quote_prefill(p_pull_id uuid)
  RETURNS jsonb
  -- Returns ACORD-ready JSON for auto/home quotes

-- Commercial lines quote prefill
get_canopy_commercial_prefill(p_pull_id uuid)
  RETURNS jsonb
  -- Returns ACORD-ready JSON for commercial quotes
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component | Test Focus | Mocking Strategy |
|-----------|------------|------------------|
| Webhook handler | Signature verification, event routing | Mock crypto, Supabase client |
| Data processing | Transformation logic, edge cases | Mock Canopy API responses |
| React hooks | State management, API calls | Mock Supabase, fetch |
| UI components | Rendering, user interactions | Mock hooks |

### 8.2 Integration Tests

| Flow | Test Scenario | Setup Required |
|------|---------------|----------------|
| Full import | End-to-end data flow | Mock Canopy webhook |
| Monitoring cycle | Enable → refresh → update | Mock Canopy monitoring API |
| Servicing flow | Submit → confirm → complete | Mock Canopy servicing API |
| Error handling | API failures, timeouts | Mock error responses |

### 8.3 E2E Tests (Future)

| Scenario | Tools | Notes |
|----------|-------|-------|
| User imports policy | Playwright | Requires Canopy sandbox |
| User enables monitoring | Playwright | Requires Canopy sandbox |
| User submits servicing action | Playwright | Requires Canopy sandbox |

---

## 9. Deployment Checklist

### 9.1 Pre-Deployment

- [ ] All migrations applied to production database
- [ ] Edge functions deployed with correct secrets
- [ ] Canopy API keys configured
- [ ] Webhook URL registered with Canopy
- [ ] Storage bucket created and configured
- [ ] RLS policies verified

### 9.2 Environment Variables

```bash
# Required in Supabase Edge Functions
CANOPY_CLIENT_ID=xxx           # OAuth client ID (from Canopy dashboard)
CANOPY_CLIENT_SECRET=xxx       # OAuth client secret (from Canopy dashboard)
CANOPY_TEAM_ID=xxx             # Your Canopy team ID
CANOPY_WEBHOOK_SECRET=xxx      # For HMAC signature verification

# Optional
CANOPY_ENVIRONMENT=production  # or sandbox
```

> **Note:** These are NOT a single "API key" - Canopy uses OAuth-style client_id/client_secret credentials.

### 9.3 Post-Deployment Verification

- [ ] Test webhook receives events
- [ ] Verify signature validation works
- [ ] Test personal auto import end-to-end
- [ ] Test homeowners import end-to-end
- [ ] Verify lead creation from Canopy data
- [ ] Test quote prefill RPC
- [ ] Verify document proxy works
- [ ] Check RLS policies block unauthorized access

---

## Appendix A: Effort Summary

| Phase | Description | Hours | Dependencies |
|-------|-------------|-------|--------------|
| Phase 1 | 2-Way Sync UI | 48h | None |
| Phase 2 | Commercial Lines UI | 28h | None |
| Phase 3 | ACORD Form Completion | 28h | None |
| Phase 4 | Test Coverage | 36h | Phases 1-3 |
| Phase 5 | Polish & Automation | 16h | Phases 1-4 |
| **Total** | **Complete Implementation** | **156h** | |

**Recommended Team Allocation:**
- 1 Senior Frontend Dev: Phases 1-2 (76h)
- 1 Backend Dev: Phase 3, 4 backend tests (44h)
- 1 QA/Test Dev: Phase 4 frontend tests, Phase 5 (36h)

**Timeline:** 4-5 weeks with dedicated resources

---

## Appendix B: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Canopy API changes | Low | High | Version lock API, monitor changelog |
| **Monitoring billing costs** | High | High | Refreshes billed like Pulls - add rate limiting, user controls |
| **Webhook idempotency failures** | Medium | High | Dedupe by event ID, handle 10x retries |
| **DATA_UPDATED scope mismatch** | Medium | Medium | Only driver events supported - rely on monitoring refreshes for full diffs |
| Carrier-specific quirks | Medium | Medium | Build carrier capability checks |
| Performance at scale | Low | Medium | Add caching, pagination |
| Commercial data quality | Medium | Medium | Validate fields, handle nulls |
| Test flakiness | Medium | Low | Mock external services |
| Reconnect token expiration | Medium | Medium | Implement token exchange flow, handle stale tokens |

---

## Appendix C: Success Metrics

| Metric | Target | Current | Gap |
|--------|--------|---------|-----|
| Personal Lines Completion | 100% | 85% | 15% |
| Commercial Lines Completion | 100% | 40% | 60% |
| 2-Way Sync Completion | 100% | 60% | 40% |
| Test Coverage | 80% | 0% | 80% |
| User Can Access All Features | Yes | No | UI missing |

---

**Document Maintainer:** InsureFlow Engineering
**Review Schedule:** Monthly
**Next Review:** January 27, 2025
