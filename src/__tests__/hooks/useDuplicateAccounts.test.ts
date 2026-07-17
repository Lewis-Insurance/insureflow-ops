import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useDuplicateAccounts } from '@/hooks/useDuplicateAccounts';

const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const match = {
  account_id: 'a1',
  name: 'Lori Peaden',
  email: null,
  phone: null,
  city: null,
  state: null,
  account_status: 'active',
  active_policy_count: 1,
  match_basis: 'name',
};

beforeEach(() => rpc.mockReset());

describe('useDuplicateAccounts', () => {
  it('checks a personal client on the NAME ALONE (no email/phone) and returns matches', async () => {
    // Regression for the reported gap: the old rule early-returned for a
    // household name with no email/phone, so a name-only duplicate never surfaced.
    rpc.mockResolvedValue({ data: [match], error: null });
    const { result } = renderHook(() => useDuplicateAccounts());

    let found: unknown[] = [];
    await act(async () => {
      found = await result.current.check({ name: 'Lori Peaden', type: 'household' });
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('find_duplicate_accounts');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_name: 'Lori Peaden', p_type: 'household' });
    expect(found).toHaveLength(1);
    expect(result.current.matches).toHaveLength(1);
  });

  it('checks a commercial client on the name alone too', async () => {
    rpc.mockResolvedValue({ data: [match], error: null });
    const { result } = renderHook(() => useDuplicateAccounts());

    await act(async () => {
      await result.current.check({ name: 'Peaden Roofing LLC', type: 'commercial_business' });
    });

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not query on an empty name', async () => {
    const { result } = renderHook(() => useDuplicateAccounts());

    let found: unknown[] = [];
    await act(async () => {
      found = await result.current.check({ name: '   ', type: 'household' });
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(found).toEqual([]);
  });
});
