import { describe, it, expect } from 'vitest';
import { CoterieClient } from '../../../supabase/functions/_shared/coterie/client.ts';
import {
  mapCoterieQuoteResponseToResult,
  mapIntakeToCoterieQuoteRequest,
} from '../../../supabase/functions/_shared/coterie/mappers.ts';
import type { CommercialQuoteInput } from '../../../supabase/functions/_shared/carrier-adapter/types.ts';

// These tests only run when real Coterie sandbox credentials are present in the
// environment. Phase 1 is credential-free, so this whole block is SKIPPED.
const hasSandboxCreds =
  !!process.env.COTERIE_SECRET_KEY && !!process.env.COTERIE_PUBLISHABLE_KEY;

describe.skipIf(!hasSandboxCreds)('Coterie live sandbox (requires COTERIE_SECRET_KEY)', () => {
  it('creates a real sandbox quote and maps it to a normalized result', async () => {
    const client = new CoterieClient({
      mock: false,
      allowLiveCalls: true,
      publishableKey: process.env.COTERIE_PUBLISHABLE_KEY,
      apiBase:
        process.env.COTERIE_API_BASE ??
        'https://api-sandbox.coterieinsurance.com/v1.6/commercial',
    });

    const intake: CommercialQuoteInput = {
      accountId: 'sandbox-account',
      lines: ['GL'],
      businessName: 'Sandbox Test Co',
      contact: {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        phone: '555-000-0000',
      },
      mailingAddress: { street: '1 Test St', city: 'Austin', state: 'TX', zip: '78701' },
    };

    const raw = await client.createQuote(mapIntakeToCoterieQuoteRequest(intake));
    const result = mapCoterieQuoteResponseToResult(raw);
    expect(['quoted', 'declined', 'error', 'referral']).toContain(result.status);
  });
});
