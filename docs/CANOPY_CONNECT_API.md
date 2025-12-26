# Canopy Connect API - Complete Integration Guide

## Overview

**Canopy Connect** is "Plaid for Insurance" - a consumer-permissioned data platform that extracts verified policy data from 400+ insurance carriers. This integration enables:

- One-click insurance data import from any carrier
- Pre-filled quote forms with verified data
- Instant lead qualification from real policy data
- Cross-sell/upsell detection from coverage gaps
- Two-way communication (read AND write to policies)

**Official Documentation**: [https://docs.usecanopy.com/](https://docs.usecanopy.com/)

---

## API Authentication

### Credentials Required

1. **Client ID** (`x-canopy-client-id`)
2. **Client Secret** (`x-canopy-client-secret`)
3. **Team ID** (used in URL path)
4. **Webhook Secret** (for signature verification)

### Where to Find Credentials

1. Log into [Canopy Connect Dashboard](https://app.usecanopy.com)
2. Click profile icon (top right) → **Settings**
3. Click **API Keys** in left sidebar
4. Toggle between **Sandbox** and **Production** environments
5. Click "Add a Production API Key" or "Add a Sandbox API Key"
6. **IMPORTANT**: Copy the Client Secret immediately - it's only shown once!

### Authentication Headers

```http
Accept: application/json
Content-Type: application/json
x-canopy-client-id: YOUR_CLIENT_ID
x-canopy-client-secret: YOUR_CLIENT_SECRET
```

**CRITICAL**: Do NOT use Basic Authentication. Canopy uses header-based authentication exclusively.

---

## API Base URL

```
https://app.usecanopy.com/api/v1.0.0/teams/{teamId}
```

All API endpoints require the `teamId` in the URL path.

---

## Core API Endpoints

### Pulls API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/pulls` | List all pulls for your team |
| `GET` | `/pulls/{pullId}` | Get complete data for a specific pull |
| `PATCH` | `/pulls/{pullId}` | Update pull metadata |

### Documents API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/pulls/{pullId}/documents/{documentId}/pdf` | Download document PDF |

### Enrichment API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/enrichment/propertyData` | Get property/building data |
| `GET` | `/enrichment/driverLicense` | Look up driver's license |
| `GET` | `/enrichment/drivingRecordIq` | Get driving record insights |
| `GET` | `/enrichment/household` | Get household data |

### Carriers API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/carriers` | List all supported carriers |
| `GET` | `/carriers/{carrierId}` | Get carrier details + servicing actions |

### Monitoring API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/monitorings` | List all monitoring subscriptions |
| `POST` | `/monitorings` | Create monitoring subscription |
| `GET` | `/monitorings/{monitoringId}` | Get monitoring status |
| `DELETE` | `/monitorings/{monitoringId}` | Cancel monitoring |
| `POST` | `/monitorings/{monitoringId}/refresh` | Force refresh monitoring |

### Webhooks API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/webhooks` | List registered webhooks |
| `POST` | `/webhooks` | Register new webhook |
| `PATCH` | `/webhooks/{webhookId}` | Update webhook |
| `DELETE` | `/webhooks/{webhookId}` | Delete webhook |

---

## Fetching Pull Data

### Request

```bash
curl -X GET "https://app.usecanopy.com/api/v1.0.0/teams/{teamId}/pulls/{pullId}" \
  -H "Accept: application/json" \
  -H "x-canopy-client-id: YOUR_CLIENT_ID" \
  -H "x-canopy-client-secret: YOUR_CLIENT_SECRET"
```

### Response Schema

**IMPORTANT**: The API response wraps all data in a `pull` object:

```json
{
  "success": true,
  "pull": {
    "pull_id": "string",
    "team_id": "string",
    "widget_id": "string",
    "status": "SUCCESS | FAILURE | PENDING",
    "created_at": "ISO8601 datetime",
    "completed_at": "ISO8601 datetime",

    "first_name": "string",
    "middle_name": "string",
    "last_name": "string",
    "account_email": "string",
    "mobile_phone": "string",
    "home_phone": "string",
    "work_phone": "string",

    "insurance_provider_name": "string",
    "meta_data": {},

    "policies": [
      {
        "policy_id": "string",
        "carrier_policy_number": "string",
        "policy_type": "auto | home | renters | condo | umbrella | life",
        "carrier_name": "string",
        "carrier_friendly_name": "string",
        "effective_date": "YYYY-MM-DD",
        "expiry_date": "YYYY-MM-DD",
        "renewal_date": "YYYY-MM-DD",
        "total_premium_cents": 123456,
        "payment_frequency": "semi-annual | annual | quarterly | monthly",
        "status": "ACTIVE | CANCELLED | EXPIRED",
        "deductible_cents": 50000,
        "named_insureds": [...],
        "vehicles": [...],
        "dwellings": [...],
        "claims": [...]
      }
    ],

    "drivers": [...]
  }
}
```

**Key Field Differences from Documentation vs Reality**:
- Use `responseData.pull.policies` to access policies (data is nested under `pull`)
- Premium is in **cents**: `total_premium_cents` (divide by 100 for dollars)
- Expiration date field is `expiry_date` or `renewal_date`, not `expiration_date`
- Policy number is `carrier_policy_number`, not `policy_number`
- Carrier is a string `carrier_name`, not a nested object
- Status values are uppercase: `ACTIVE`, not `active`
- Drivers are at the **pull level** AND inside vehicles (not at policy level)

---

## Data Schemas

### Vehicle Schema

**IMPORTANT**: Coverages are returned as an **array of objects**, not a flat object.

```json
{
  "vehicle_id": "string",
  "vin": "string",
  "year": 2024,
  "make": "string",
  "model": "string",
  "series": "string",
  "type": "sedan | suv | truck | van",
  "uses": ["COMMUTE", "PLEASURE", "BUSINESS"],
  "annual_mileage": 12000,
  "ownership_type": "OWNED | LEASED | FINANCED",
  "garaging_address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "full_address": "string"
  },
  "lienholder": {
    "name": "string",
    "address": {}
  },
  "drivers": [...],
  "coverages": [
    {
      "name": "BODILY_INJURY_LIABILITY",
      "per_person_limit_cents": 10000000,
      "per_incident_limit_cents": 30000000
    },
    {
      "name": "PROPERTY_DAMAGE_LIABILITY",
      "per_incident_limit_cents": 10000000
    },
    {
      "name": "COLLISION",
      "deductible_cents": 50000
    },
    {
      "name": "COMPREHENSIVE",
      "deductible_cents": 25000
    },
    {
      "name": "UNINSURED_MOTORISTS",
      "per_person_limit_cents": 10000000,
      "per_incident_limit_cents": 30000000
    },
    {
      "name": "UNDERINSURED_MOTORISTS",
      "per_person_limit_cents": 10000000,
      "per_incident_limit_cents": 30000000
    },
    {
      "name": "MEDICAL_PAYMENTS",
      "per_person_limit_cents": 500000
    },
    {
      "name": "RENTAL_REIMBURSEMENT",
      "per_day_limit_cents": 3000,
      "max_days": 30
    },
    {
      "name": "EMERGENCY_ROAD_SERVICE",
      "per_incident_limit_cents": 10000
    }
  ]
}
```

**Coverage Parsing Example**:
```typescript
// Convert array to map for easy access
const coverageMap: Record<string, any> = {};
for (const cov of vehicle.coverages || []) {
  coverageMap[cov.name] = cov;
}

// Access specific coverage (amounts in cents, divide by 100)
const bodilyInjury = coverageMap['BODILY_INJURY_LIABILITY']?.per_person_limit_cents / 100;
const collisionDeductible = coverageMap['COLLISION']?.deductible_cents / 100;
```

### Driver Schema

**IMPORTANT**:
- Date of birth is returned as `date_of_birth_str` in "MM/DD/YYYY" format (not ISO)
- License info is in `drivers_license` object (not `license`)
- Drivers appear at **pull level** AND inside each vehicle

```json
{
  "driver_id": "string",
  "first_name": "string",
  "last_name": "string",
  "middle_name": "string",
  "suffix": "Jr | Sr | III",
  "date_of_birth_str": "01/15/1985",
  "gender": "MALE | FEMALE | OTHER",
  "marital_status": "SINGLE | MARRIED | DIVORCED | WIDOWED",
  "relation_to_insured": "SELF | SPOUSE | CHILD | PARENT | OTHER",
  "is_primary": true,
  "is_excluded": false,
  "sr22_required": false,
  "occupation": "string",
  "education": "string",
  "years_licensed": 15,
  "drivers_license": {
    "number": "string",
    "state": "CA",
    "status": "VALID | SUSPENDED | REVOKED | EXPIRED",
    "issue_date": "YYYY-MM-DD",
    "expiration_date": "YYYY-MM-DD",
    "class": "string"
  },
  "violations": [...],
  "accidents": [...]
}
```

**Date Parsing Example**:
```typescript
// Parse date_of_birth_str from "MM/DD/YYYY" to ISO format
let dateOfBirth = driver.date_of_birth;
if (!dateOfBirth && driver.date_of_birth_str) {
  const parts = driver.date_of_birth_str.split('/');
  if (parts.length === 3) {
    // Convert MM/DD/YYYY to YYYY-MM-DD
    dateOfBirth = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
}
```

### Dwelling Schema

```json
{
  "dwelling_id": "string",
  "address": {
    "street": "string",
    "street2": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "county": "string"
  },
  "property_type": "single_family | condo | townhouse | mobile_home | apartment",
  "occupancy_type": "owner_occupied | tenant | vacant | seasonal",
  "ownership": "owned | rented",
  "year_built": 1995,
  "year_purchased": 2020,
  "purchase_price": 350000,
  "estimated_value": 450000,
  "square_footage": 2500,
  "living_square_footage": 2200,
  "lot_size": 8000,
  "stories": 2,
  "bedrooms": 4,
  "bathrooms": 2.5,
  "construction_type": "frame | masonry | steel",
  "exterior_type": "brick | vinyl | wood | stucco",
  "roof_type": "shingle | tile | metal | flat",
  "roof_year": 2018,
  "roof_condition": "good | fair | poor",
  "foundation_type": "slab | basement | crawl_space",
  "heating_type": "forced_air | radiant | heat_pump",
  "heating_fuel": "gas | electric | oil",
  "cooling_type": "central | window | none",
  "electrical_type": "circuit_breaker | fuse",
  "electrical_amps": 200,
  "plumbing_type": "copper | pvc | galvanized",
  "water_heater_type": "tank | tankless",
  "coverages": {
    "dwelling": 400000,
    "other_structures": 40000,
    "personal_property": 200000,
    "loss_of_use": 80000,
    "liability": 300000,
    "medical_payments": 5000,
    "deductible": 1000,
    "wind_hail_deductible": 2500,
    "hurricane_deductible": 10000,
    "flood": true,
    "flood_coverage": 250000,
    "earthquake": false,
    "water_backup": true,
    "water_backup_coverage": 10000,
    "identity_theft": true,
    "ordinance_law": true,
    "replacement_cost": true
  },
  "features": {
    "swimming_pool": true,
    "swimming_pool_type": "in-ground | above-ground",
    "swimming_pool_fenced": true,
    "hot_tub": false,
    "trampoline": false,
    "dogs": true,
    "dog_breed": "labrador",
    "wood_stove": false,
    "fireplace": true,
    "security_system": true,
    "security_system_type": "monitored",
    "fire_alarm": true,
    "fire_alarm_type": "monitored",
    "sprinkler_system": false,
    "deadbolt_locks": true,
    "smoke_detectors": true,
    "co_detectors": true,
    "gated_community": false,
    "home_business": false,
    "daycare": false
  },
  "distance_to_fire_station": 2.5,
  "distance_to_coast": 50,
  "fire_protection_class": "3",
  "flood_zone": "X"
}
```

### Claims Schema

```json
{
  "claim_id": "string",
  "claim_number": "string",
  "claim_date": "YYYY-MM-DD",
  "report_date": "YYYY-MM-DD",
  "close_date": "YYYY-MM-DD",
  "claim_type": "collision | comprehensive | liability | property | theft",
  "claim_category": "auto | home | umbrella",
  "loss_type": "string",
  "status": "open | closed | pending | denied",
  "amount_claimed": 15000,
  "amount_paid": 12500,
  "amount_reserved": 2500,
  "deductible_applied": 500,
  "description": "string",
  "at_fault": true,
  "subrogation": false,
  "catastrophe": false,
  "catastrophe_number": "string",
  "claimant_name": "string",
  "claimant_type": "insured | third_party"
}
```

---

## Webhook Events

### Event Types

**IMPORTANT**: The completion event is `SUCCESS`, not `COMPLETE`. Handle both for safety.

| Event | Description | When Triggered |
|-------|-------------|----------------|
| `AUTH_STATUS` | Authentication state changed | User logs into carrier portal |
| `IDENTITY_VERIFICATION` | MFA/identity verification in progress | User completing carrier MFA |
| `GETTING_CONSUMERS` | Retrieving consumer list | After authentication |
| `PULLING_DATA` | Data extraction in progress | While scraping carrier portal |
| `POLICY_AVAILABLE` | Single policy data ready | Each policy as it's extracted |
| `POLICIES_AVAILABLE` | All policies ready | Once per pull when all policies extracted |
| `SUCCESS` | **Pull fully complete** | All data extracted successfully |
| `COMPLETE` | Alternative completion event | Some flows use this instead |
| `ERROR` | Pull encountered an error | Authentication failure, timeout, etc. |
| `FAILURE` | Pull failed | Alternative error event |
| `DATA_UPDATED` | Data modified on existing pull | Driver/vehicle added or updated |
| `MONITORING_RECONNECT` | Monitoring needs user re-auth | User's carrier session expired |
| `MONITORING_EVENTS` | Changes detected in monitored policy | Policy renewal, coverage change, etc. |

### Webhook Payload Structure

```json
{
  "widget_id": "string",
  "team_id": "string",
  "pull_id": "string",
  "event": "SUCCESS",
  "status": "SUCCESS | FAILURE | PENDING",
  "meta_data": {},
  "account_identifier": "string",
  "is_monitored": false,
  "monitoring": {
    "initial_pull_id": "string",
    "monitoring_id": "string"
  },
  "data": {}
}
```

**Event Handling Example**:
```typescript
switch (payload.event || payload.event_type) {
  case 'SUCCESS':
  case 'COMPLETE':
    // Pull is complete - fetch full data from API
    await fetchCompleteData(payload.pull_id);
    break;
  case 'ERROR':
  case 'FAILURE':
    // Handle error
    break;
  case 'IDENTITY_VERIFICATION':
  case 'GETTING_CONSUMERS':
  case 'PULLING_DATA':
    // Status updates - no action needed
    break;
}
```

### CRITICAL: Webhook Data is Minimal

**IMPORTANT**: Webhooks contain minimal data - primarily just the `pull_id`. You MUST fetch the complete data via the API:

```bash
# After receiving webhook, fetch complete data:
GET /teams/{teamId}/pulls/{pullId}
```

### Webhook Signature Verification

The `canopy-signature` header format:
```
canopy-signature: t=1234567890,s=abc123def456...
```

**Verification Steps:**

1. Parse header: split by `,` then by `=`
2. Extract timestamp (`t`) and signature (`s`)
3. Build signed payload: `{timestamp}.{json_body}`
4. Compute HMAC-SHA256 using webhook secret
5. Compare signatures using constant-time comparison
6. Validate timestamp is within acceptable window (e.g., 5 minutes)

```typescript
async function verifyCanopySignature(
  body: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const parts = signatureHeader.split(',');
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const signature = parts.find(p => p.startsWith('s='))?.slice(2);

  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${body}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === expectedSignature;
}
```

---

## Two-Way Communication: Servicing API

Canopy Connect supports **writing** data to insurance policies through the Servicing API.

### Available Servicing Actions

| Action | Description |
|--------|-------------|
| Add Vehicle | Add a new vehicle to auto policy |
| Replace Vehicle | Swap one vehicle for another |
| Add Driver | Add a new driver to auto policy |
| Remove Driver | Remove a driver from policy |
| Update Lienholder | Change vehicle lienholder/mortgagee |
| Update Coverage | Modify coverage limits or deductibles |
| Update Contact Info | Change email, phone, address |
| Update Mortgagee | Change homeowners mortgagee clause |

### How Servicing Works

1. **Check Carrier Support**: Use `GET /carriers/{carrierId}` to see which `servicingActions` are available
2. **Create Servicing Request**: Submit desired changes via API
3. **Consumer Approval**: Canopy sends secure link to policyholder
4. **Consumer Authenticates**: Policyholder logs into carrier portal
5. **Changes Applied**: Canopy executes the changes
6. **Webhook Notification**: Receive `SERVICING_WAITING_FOR_CONSUMER_CONFIRMATION` events

### Pricing

Servicing actions have per-transaction pricing. Contact Canopy Connect for pricing details.

---

## Enrichment Features

### Property Data Enrichment (FREE with pulls)

Automatically included with home/property policies:
- Square footage, bedrooms, bathrooms
- Year built, construction type
- Roof details, foundation type
- Heating/cooling systems
- Property valuations

### Driver License Lookup (Additional fee)

```bash
GET /enrichment/driverLicense?first_name=John&last_name=Doe&state=CA
```

Returns:
- Driver's license number
- License state
- License status

### Driving Record Intelligence (Additional fee)

```bash
GET /enrichment/drivingRecordIq?license_number=D1234567&state=CA
```

Returns:
- Major/minor violations indicator
- Risk assessment
- Recommended carriers

---

## Monitoring (Ongoing Policy Tracking)

Monitor policies for changes over time:

### Create Monitoring

```bash
POST /monitorings
{
  "pull_id": "original_pull_id",
  "refresh_frequency": "monthly"
}
```

### Monitoring Events

When changes are detected, you receive `MONITORING_EVENTS` webhook:

```json
{
  "event_type": "MONITORING_EVENTS",
  "pull_id": "new_refresh_pull_id",
  "monitoring": {
    "initial_pull_id": "original_pull_id",
    "monitoring_id": "monitoring_id"
  },
  "data": {
    "events": [
      {
        "type": "POLICY_RENEWED",
        "policy_id": "string",
        "details": {}
      },
      {
        "type": "PREMIUM_CHANGED",
        "old_value": 1200,
        "new_value": 1350
      }
    ]
  }
}
```

---

## Environment Variables

Add these to your Supabase Edge Function secrets:

```env
# Required
CANOPY_CLIENT_ID=your_client_id
CANOPY_CLIENT_SECRET=your_client_secret
CANOPY_TEAM_ID=your_team_id
CANOPY_WEBHOOK_SECRET=your_webhook_secret

# Optional
CANOPY_API_BASE_URL=https://app.usecanopy.com/api/v1.0.0
```

---

## Implementation Checklist

### Phase 1: Basic Integration
- [ ] Obtain API credentials from Canopy dashboard
- [ ] Configure environment variables
- [ ] Implement webhook endpoint
- [ ] Implement webhook signature verification
- [ ] Implement API data fetch on COMPLETE event
- [ ] Store data in canopy_* tables
- [ ] Create lead from imported data

### Phase 2: Enhanced Features
- [ ] Implement POLICY_AVAILABLE handling for real-time updates
- [ ] Add document download functionality
- [ ] Display Canopy data in lead detail page
- [ ] Pre-fill quote forms from Canopy data

### Phase 3: Advanced Features
- [ ] Implement Servicing API for policy changes
- [ ] Set up Monitoring for policy tracking
- [ ] Integrate Enrichment APIs
- [ ] Build renewal detection from monitoring

---

## Error Handling

### Common Error Codes

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | Invalid credentials | Check client ID/secret |
| 403 | Forbidden | Check team ID, permissions |
| 404 | Pull not found | Verify pull_id exists |
| 429 | Rate limited | Implement backoff |
| 500 | Server error | Retry with exponential backoff |

### Webhook Error Events

```json
{
  "event_type": "ERROR",
  "pull_id": "string",
  "data": {
    "error": {
      "code": "AUTHENTICATION_FAILED",
      "message": "Invalid carrier credentials"
    }
  }
}
```

Error codes:
- `AUTHENTICATION_FAILED` - User credentials invalid
- `MFA_TIMEOUT` - User didn't complete MFA
- `CARRIER_UNAVAILABLE` - Carrier portal down
- `ACCOUNT_LOCKED` - Carrier locked user account
- `SESSION_EXPIRED` - Carrier session timed out

---

## Market Coverage

| Line of Business | Coverage |
|------------------|----------|
| Personal Auto | 96% of market |
| Homeowners | 91% of market |
| Commercial Multi-Peril | 61% of market |
| **Total Carriers** | 300+ |

---

## Security & Compliance

- **SOC 2 Type 2 Certified**
- **256-bit AES encryption** at rest
- **TLS 1.3+** in transit
- Consumer-permissioned data only
- No credential storage (OAuth-based carrier connections)

---

## Support & Resources

- **Documentation**: https://docs.usecanopy.com/
- **API Reference**: https://docs.usecanopy.com/reference/getting-started
- **Dashboard**: https://app.usecanopy.com
- **Support**: Contact your Canopy Connect representative

---

## Gotchas & Common Issues

### 1. Response Wrapper
**Problem**: Data is nested under `pull` object
**Solution**: Use `responseData.pull.policies` not `responseData.policies`

### 2. Premium in Cents
**Problem**: `total_premium_cents` is in cents, not dollars
**Solution**: Divide by 100: `premium = total_premium_cents / 100`

### 3. Date Format Mismatch
**Problem**: `date_of_birth_str` is "MM/DD/YYYY", not ISO format
**Solution**: Parse and convert: `YYYY-MM-DD` format

### 4. Coverages as Array
**Problem**: Vehicle coverages are an array, not flat object
**Solution**: Convert to map by `name` field for lookup

### 5. SUCCESS vs COMPLETE
**Problem**: Canopy sends `SUCCESS`, documentation says `COMPLETE`
**Solution**: Handle both event types in switch statement

### 6. Drivers Location
**Problem**: Drivers appear at pull level AND inside vehicles
**Solution**: Process both `pull.drivers` and `vehicle.drivers`

### 7. License Object Name
**Problem**: License is in `drivers_license`, not `license`
**Solution**: Check `driver.drivers_license` for license info

### 8. Field Name Differences
| Documentation | Actual Field |
|--------------|--------------|
| `expiration_date` | `expiry_date` or `renewal_date` |
| `policy_number` | `carrier_policy_number` |
| `premium.amount` | `total_premium_cents` |
| `carrier.name` | `carrier_name` |
| `trim` | `series` |
| `usage` | `uses` (array) |
| `ownership` | `ownership_type` |
| `garage_address` | `garaging_address` |

---

## Changelog

| Date | Change |
|------|--------|
| 2024-12-26 | **Major update**: Fixed response schema to match actual API structure |
| 2024-12-26 | Added: Gotchas section with common integration issues |
| 2024-12-26 | Fixed: Vehicle coverages documented as array (not flat object) |
| 2024-12-26 | Fixed: Driver schema with `date_of_birth_str` and `drivers_license` |
| 2024-12-26 | Fixed: Webhook events - SUCCESS is primary completion event |
| 2024-12-26 | Added: Code examples for parsing dates and coverages |
| 2024-12-26 | Initial documentation created |

