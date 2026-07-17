import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useUnifiedIntakeSave, type IntakeInput } from '@/hooks/useUnifiedIntakeSave';

/**
 * Regression cover for the Lori Peaden incident (2026-07-17).
 *
 * A second `run()` fired before the first finished reset the hook's shared refs
 * mid-flight, so the in-flight run's policy step read an accountId of null and
 * inserted a policy with account_id = null. That policy belonged to no customer
 * and rendered nowhere, while the document + payment still FK'd to it. Two
 * duplicate customers were created in the process.
 */

const inserts: Record<string, Record<string, unknown>[]> = {};
let seq = 0;

function record(table: string, payload: unknown) {
  const rows = Array.isArray(payload) ? payload : [payload];
  inserts[table] = (inserts[table] || []).concat(rows as Record<string, unknown>[]);
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      // async, so a second run() can interleave here if it is not guarded
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    },
    rpc: vi.fn(async () => ({ data: 'org-1', error: null })),
    from: vi.fn((table: string) => ({
      insert: (payload: unknown) => {
        record(table, payload);
        const id = `${table}-${++seq}`;
        const p: Record<string, unknown> & Promise<unknown> = Promise.resolve({
          error: null,
        }) as never;
        // supports both `await insert(row)` and `insert([row]).select('id').single()`
        (p as unknown as { select: unknown }).select = () => ({
          single: async () => ({ data: { id }, error: null }),
        });
        return p;
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    })),
  },
}));

const baseInput = (): IntakeInput => ({
  mode: 'new',
  existingAccountId: null,
  customerDirty: true,
  customer: {
    name: 'Lori Peaden',
    goes_by: '',
    type: 'household',
    account_status: 'active',
    date_of_birth: '',
    hasPrimaryEntity: false,
    primary_entity_type: '',
    primary_entity_name: '',
    trustee_name: '',
    trust_date: '',
    spouse_name: '',
    spouse_date_of_birth: '',
    hasSecondaryEntity: false,
    secondary_entity_type: '',
    secondary_entity_name: '',
    email: 'loni.peaden@example.com',
    phone: '9042635654',
    phone_secondary: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip_code: '',
  },
  policy: {
    policy_number: '877132025',
    carrier: 'Progressive',
    line_of_business: 'Personal Auto',
    premium: '175.87',
    effective_date: '2026-07-17',
    expiration_date: '2027-01-17',
    billing_frequency: 'semiannual',
    billing_method: 'direct_bill',
    policy_term: 'semiannual',
    status: 'active',
  },
  carrier: null,
  documents: [
    { id: 'doc-local-1', storagePath: 'intake/app.pdf', fileName: 'app.pdf', mimeType: 'application/pdf', size: 1024, kind: 'application' },
  ],
  payment: {
    payment_method_id: 'pm-1',
    amount: '175.87',
    paid_to: 'company',
    payment_date: '2026-07-17',
    day_sheet_date: '2026-07-17',
    check_number: '',
    reference_number: '',
    payer_name: 'Lori Peaden',
    notes: '',
  },
  note: '',
});

beforeEach(() => {
  for (const k of Object.keys(inserts)) delete inserts[k];
  seq = 0;
});

describe('useUnifiedIntakeSave', () => {
  it('saves customer -> policy -> documents -> payment once, all correctly linked', async () => {
    const { result } = renderHook(() => useUnifiedIntakeSave());

    await act(async () => {
      await result.current.run(baseInput());
    });

    expect(inserts.accounts).toHaveLength(1);
    expect(inserts.policies).toHaveLength(1);

    const accountId = 'accounts-1';
    expect(inserts.policies[0].account_id).toBe(accountId);
    expect(inserts.documents[0].account_id).toBe(accountId);
    expect(inserts.documents[0].policy_id).toBe('policies-2');
    expect(inserts.premium_payments[0].account_id).toBe(accountId);
    expect(inserts.premium_payments[0].policy_id).toBe('policies-2');
    expect(result.current.phase).toBe('done');
  });

  it('ignores a concurrent second run and never writes an orphaned policy', async () => {
    const { result } = renderHook(() => useUnifiedIntakeSave());

    // Fire twice in the same tick, exactly as a rapid double-invoke would.
    await act(async () => {
      const a = result.current.run(baseInput());
      const b = result.current.run(baseInput());
      await Promise.all([a, b]);
    });

    // The regression: this used to be 2 customers, and the policy carried a null
    // account_id because the second run reset ctx mid-flight.
    expect(inserts.accounts).toHaveLength(1);
    expect(inserts.policies).toHaveLength(1);
    expect(inserts.policies[0].account_id).toBeTruthy();
    expect(inserts.premium_payments).toHaveLength(1);
  });

  it('never writes a policy whose account_id is null', async () => {
    const { result } = renderHook(() => useUnifiedIntakeSave());

    await act(async () => {
      await result.current.run(baseInput());
    });

    for (const row of inserts.policies || []) {
      expect(row.account_id).not.toBeNull();
      expect(row.account_id).not.toBeUndefined();
    }
  });
});
