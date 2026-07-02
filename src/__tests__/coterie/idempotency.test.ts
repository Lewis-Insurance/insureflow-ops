import { describe, it, expect, vi } from 'vitest';
import { CoterieAdapter } from '../../../supabase/functions/_shared/coterie/adapter.ts';
import { CoterieClient } from '../../../supabase/functions/_shared/coterie/client.ts';
import {
  classifyWriteResult,
  shouldEmitLifecycleAudit,
} from '../../../supabase/functions/_shared/coterie/quote-service.ts';
import type { CommercialQuoteInput } from '../../../supabase/functions/_shared/carrier-adapter/types.ts';

function makeIntake(overrides: Partial<CommercialQuoteInput> = {}): CommercialQuoteInput {
  return {
    accountId: 'acc-1',
    lines: ['BOP'],
    businessName: 'Acme Coffee Roasters',
    contact: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@acme.test',
      phone: '555-123-4567',
    },
    mailingAddress: { street: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' },
    ...overrides,
  };
}

describe('CoterieAdapter idempotency', () => {
  it('does not re-call the carrier for a duplicate idempotency key', async () => {
    const client = new CoterieClient({ mock: true });
    const spy = vi.spyOn(client, 'createQuote');
    const adapter = new CoterieAdapter({ client });

    const intake = makeIntake({ idempotencyKey: 'key-1' });

    const first = await adapter.createQuote(intake);
    const second = await adapter.createQuote(intake);

    expect(spy).toHaveBeenCalledTimes(1); // second call served from the idempotency store
    expect(second).toEqual(first);
  });

  it('returns a cloned result (not a shared reference) on the cache hit', async () => {
    const adapter = new CoterieAdapter({ client: new CoterieClient({ mock: true }) });
    const intake = makeIntake({ idempotencyKey: 'key-clone' });

    const first = await adapter.createQuote(intake);
    const second = await adapter.createQuote(intake);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('calls the carrier again for a different idempotency key', async () => {
    const client = new CoterieClient({ mock: true });
    const spy = vi.spyOn(client, 'createQuote');
    const adapter = new CoterieAdapter({ client });

    await adapter.createQuote(makeIntake({ idempotencyKey: 'key-a' }));
    await adapter.createQuote(makeIntake({ idempotencyKey: 'key-b' }));

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('shares an injected idempotency store across adapter instances', async () => {
    const store = new Map();
    const clientA = new CoterieClient({ mock: true });
    const clientB = new CoterieClient({ mock: true });
    const spyA = vi.spyOn(clientA, 'createQuote');
    const spyB = vi.spyOn(clientB, 'createQuote');

    const adapterA = new CoterieAdapter({ client: clientA, idempotencyStore: store });
    const adapterB = new CoterieAdapter({ client: clientB, idempotencyStore: store });

    await adapterA.createQuote(makeIntake({ idempotencyKey: 'shared-key' }));
    await adapterB.createQuote(makeIntake({ idempotencyKey: 'shared-key' }));

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(0); // served from the shared store
  });
});

// Persistence-layer concurrency (B2/B3). The DB enforces "one active quote per
// session" + "one gate per entity"; these assert the edge function's decision
// logic: a unique violation resolves by ADOPTING the winner (no duplicate), and
// only the winner that inserted the quote emits the lifecycle audit batch.
describe('Coterie persistence idempotency (no duplicate rows)', () => {
  it('resolves a concurrent quote/gate insert by adoption, not duplication', () => {
    // Winner inserts; concurrent loser sees 23505 and adopts the same row/ids.
    expect(classifyWriteResult({ error: null, data: { id: 'quote-1' } })).toBe('inserted');
    expect(classifyWriteResult({ error: { code: '23505' }, data: null })).toBe('adopt-on-conflict');
  });

  it('only the request that inserted the quote emits the standard audit batch', () => {
    const winnerInsertedQuote = true;
    const loserAdoptedQuote = false;
    expect(shouldEmitLifecycleAudit(winnerInsertedQuote)).toBe(true);
    expect(shouldEmitLifecycleAudit(loserAdoptedQuote)).toBe(false);
  });
});
