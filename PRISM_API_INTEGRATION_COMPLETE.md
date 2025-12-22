# Prism API Integration - Complete ✅

## Overview

A complete integration of the Prism AI orchestration API into InsureFlow, allowing all agents and employees to use multi-agent reasoning for complex analysis and strategic planning.

## What's Been Implemented

### ✅ 1. TypeScript Types (`src/types/prism-api.ts`)
- Complete type definitions for Prism API requests/responses
- Database types for run tracking
- Error handling types

### ✅ 2. React Hooks (`src/hooks/usePrismAPI.ts`)
- `usePrismRun()` - Start new Prism analysis
- `usePrismRunStatus()` - Poll run status (auto-refreshes while running)
- `usePrismUsage()` - Get usage statistics
- `usePrismRunHistory()` - View run history
- `useSavePrismRun()` - Save runs to favorites

### ✅ 3. UI Page (`src/pages/PrismAIPage.tsx`)
- **New Analysis Tab**: Input prompt, select mode/depth, start analysis
- **Results Tab**: View run status, cycles completed, final output
- **History Tab**: Table of all previous runs with filters
- **Settings Tab**: API key configuration (placeholder)
- Real-time status updates with polling
- Usage statistics display
- Copy/download output functionality

### ✅ 4. Database Schema (`supabase/migrations/20251221192543_prism_api_integration.sql`)
- `prism_runs` table - Tracks all runs with:
  - User association
  - Prompt, mode, depth
  - Status, cycles, output
  - Usage metrics (tokens, cost)
  - Error tracking
  - Favorites support
- `profiles.prism_api_key` - Per-user API key storage
- RLS policies for data security
- Indexes for performance

### ✅ 5. Edge Function (`supabase/functions/prism-api/index.ts`)
- **POST /run** - Start new analysis
- **GET /run/:id** - Get run status
- **GET /usage** - Get usage statistics
- API key validation (user-specific or system-wide)
- Rate limiting (per hour, daily tokens, daily cost)
- Usage tracking
- Webhook support (optional)

### ✅ 6. Navigation & Routing
- Added route: `/prism-ai`
- Added nav item: "Prism AI" in Command Center group
- Icon: Sparkles

---

## Configuration Required

### 1. Run Database Migration

```bash
supabase migration up
```

This creates:
- `prism_runs` table
- `profiles.prism_api_key` column
- RLS policies

### 2. Deploy Edge Function

```bash
supabase functions deploy prism-api --project-ref lrqajzwcmdwahnjyidgv
```

### 3. Configure API Keys

**Option A: System-Wide Key (Recommended for Start)**
```bash
# Set as Supabase secret
supabase secrets set PRISM_SYSTEM_API_KEY=sk_prism_your_key_here --project-ref lrqajzwcmdwahnjyidgv
```

**Option B: Per-User Keys**
- Users can have API keys stored in `profiles.prism_api_key`
- Admins can set these via the enhanced admin panel
- Or users can set them in their profile settings (if you add that feature)

### 4. Configure Prism Service (If External)

If your Prism API is a separate service, set the URL:

```bash
supabase secrets set PRISM_SERVICE_URL=https://your-prism-service.com --project-ref lrqajzwcmdwahnjyidgv
```

If `PRISM_SERVICE_URL` is not set, the edge function will use a placeholder implementation that you'll need to replace with your actual Prism logic.

---

## Implementation Notes

### Prism Logic Implementation

The edge function currently has a **placeholder** for the actual Prism multi-agent reasoning. You need to:

1. **Either**: Implement the Prism logic directly in `supabase/functions/prism-api/index.ts`
   - Replace the `runPrismAnalysis()` function
   - Implement the multi-agent loop (Architect → Lateral → Logic → Auditor)
   - Handle cycles based on depth (insight=1, synthesis=2, mastery=3)

2. **Or**: Set `PRISM_SERVICE_URL` to point to your existing Prism service
   - The edge function will forward requests to that URL
   - Your Prism service handles the actual reasoning

### API Key Format

API keys must start with `sk_prism_` to be recognized. Examples:
- `sk_prism_abc123...` (user key)
- `sk_prism_system_xyz...` (system key)

### Rate Limits (Default)

- **Per Hour**: 100 requests
- **Daily Tokens**: 1,000,000
- **Daily Cost**: $10.00

These can be customized per user in the `validateAPIKey()` function.

---

## Usage

### For End Users

1. Navigate to **Command Center → Prism AI**
2. Enter a prompt (e.g., "Analyze the pros and cons of implementing microservices")
3. Select mode (Sequential recommended)
4. Select depth (Synthesis = 2 cycles, recommended)
5. Click "Start Analysis"
6. View results in the Results tab
7. Check History tab for past runs

### For Developers

```typescript
import { usePrismRun } from '@/hooks/usePrismAPI';

function MyComponent() {
  const runMutation = usePrismRun();
  
  const handleRun = async () => {
    const result = await runMutation.mutateAsync({
      prompt: 'Your question here',
      mode: 'sequential',
      depth: 'synthesis',
    });
    
    console.log(result.final_output);
  };
}
```

---

## Features

### ✅ Implemented
- Full UI for running analyses
- Real-time status polling
- Run history tracking
- Usage statistics
- Rate limiting
- API key validation
- Error handling
- Copy/download results
- Database persistence

### 🔄 To Implement
- Actual Prism multi-agent reasoning logic (or connect to external service)
- Webhook signature verification (HMAC)
- Admin panel for API key management
- User profile settings for API keys
- Advanced filtering in history
- Export history to CSV
- Run favorites/bookmarks

---

## Testing

1. **Test API Key Validation**:
   ```bash
   curl -X POST https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/prism-api/run \
     -H "Authorization: Bearer sk_prism_test_key" \
     -H "Content-Type: application/json" \
     -d '{"prompt": "Test prompt", "depth": "insight"}'
   ```

2. **Test Run Status**:
   ```bash
   curl https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/prism-api/run/{run_id} \
     -H "Authorization: Bearer sk_prism_test_key"
   ```

3. **Test Usage Stats**:
   ```bash
   curl https://lrqajzwcmdwahnjyidgv.supabase.co/functions/v1/prism-api/usage \
     -H "Authorization: Bearer sk_prism_test_key"
   ```

---

## Questions for You

1. **Prism Implementation**: Do you have the Prism multi-agent reasoning logic already implemented? If so:
   - Is it a separate service/API?
   - Or should I implement it in the edge function?

2. **API Key Management**: How do you want to handle API keys?
   - System-wide key for all users?
   - Per-user keys?
   - Both (system-wide fallback)?

3. **Rate Limits**: Are the default limits (100/hour, 1M tokens/day, $10/day) appropriate?

4. **Webhook Secret**: Do you need webhook signature verification? If so, what secret should be used?

---

## Next Steps

1. ✅ Run the migration
2. ✅ Deploy the edge function
3. ⚠️ **Implement actual Prism logic** (or configure external service URL)
4. ⚠️ **Set API keys** (system-wide or per-user)
5. ✅ Test the integration
6. ✅ Use it!

---

## Files Created

- `src/types/prism-api.ts`
- `src/hooks/usePrismAPI.ts`
- `src/pages/PrismAIPage.tsx`
- `supabase/migrations/20251221192543_prism_api_integration.sql`
- `supabase/functions/prism-api/index.ts`
- Updated: `src/App.tsx` (routing)
- Updated: `src/components/layout/AppLayout.tsx` (navigation)

---

**Status**: ✅ UI and Infrastructure Complete - Ready for Prism Logic Implementation

