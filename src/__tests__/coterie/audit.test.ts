import { describe, it, expect } from 'vitest';
import { CoterieAdapter } from '../../../supabase/functions/_shared/coterie/adapter.ts';
import { CoterieClient } from '../../../supabase/functions/_shared/coterie/client.ts';
import type {
  AuditEvent,
  CommercialQuoteInput,
} from '../../../supabase/functions/_shared/carrier-adapter/types.ts';

function makeIntake(overrides: Partial<CommercialQuoteInput> = {}): CommercialQuoteInput {
  return {
    accountId: 'acc-1',
    lines: ['BOP', 'GL'],
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

describe('CoterieAdapter audit emission', () => {
  it('emits intake_created, quote_created and approval_requested for a quote flow', async () => {
    const events: AuditEvent[] = [];
    const adapter = new CoterieAdapter({
      client: new CoterieClient({ mock: true }),
      actor: 'user-1',
      onAudit: (event) => {
        events.push(event);
      },
    });

    await adapter.createQuote(makeIntake());

    const types = events.map((e) => e.eventType);
    expect(types).toEqual(['intake_created', 'quote_created', 'approval_requested']);
    expect(events.every((e) => e.actor === 'user-1')).toBe(true);
  });

  it('redacts PII out of emitted audit detail', async () => {
    const events: AuditEvent[] = [];
    const adapter = new CoterieAdapter({
      client: new CoterieClient({ mock: true }),
      onAudit: (event) => {
        events.push(event);
      },
    });

    await adapter.createQuote(
      makeIntake({ businessName: 'Contact jane@acme.test about this' }),
    );

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('jane@acme.test');
  });

  it('emits an idempotent-hit event (not the full trio) on a cache hit', async () => {
    const events: AuditEvent[] = [];
    const adapter = new CoterieAdapter({
      client: new CoterieClient({ mock: true }),
      onAudit: (event) => {
        events.push(event);
      },
    });

    const intake = makeIntake({ idempotencyKey: 'audit-key' });
    await adapter.createQuote(intake);
    events.length = 0; // clear the first flow's events

    await adapter.createQuote(intake);
    const types = events.map((e) => e.eventType);
    expect(types).toEqual(['quote_idempotent_hit']);
  });
});
