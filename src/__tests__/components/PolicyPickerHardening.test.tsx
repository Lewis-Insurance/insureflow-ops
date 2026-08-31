import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Named Insured migration (#164) put public.policies and public.policy_named_insureds
 * into mutually recursive RLS, so every direct `.from('policies')` read failed. The pickers
 * that swallowed the error rendered "No policies found", which read to the office as an empty
 * book rather than an outage. These tests pin the two behaviours that hid it:
 *
 *  1. the picker asks list_account_policies (SECURITY DEFINER, and it also returns the
 *     policies the account is a Named Insured on), not the owner-only table read;
 *  2. a failed load never renders as an empty result.
 */

const { rpcMock, fromMock, toastMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

import { RecordPaymentForm } from '@/components/payments/RecordPaymentForm';

/** Minimal thenable PostgREST builder: every filter returns itself. */
function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of [
    'select', 'eq', 'is', 'in', 'not', 'or', 'order', 'limit', 'gte', 'lte', 'neq',
  ]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const ACCOUNT_ID = '5fb4fc1a-c423-4af9-9f1d-46fadeae7b9a';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// Radix Select drives its trigger with Pointer Events APIs that jsdom does not implement.
beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture = vi.fn(() => false);
  proto.setPointerCapture = vi.fn();
  proto.releasePointerCapture = vi.fn();
  proto.scrollIntoView = vi.fn();
  // The shared setup stubs ResizeObserver as a plain function; floating-ui (used by the
  // Select popover) calls it with `new`, so it has to be constructible here.
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as Record<string, unknown>).ResizeObserver = TestResizeObserver;
  (window as unknown as Record<string, unknown>).ResizeObserver = TestResizeObserver;
});

beforeEach(() => {
  vi.clearAllMocks();
  // Payment methods load is incidental to these tests.
  fromMock.mockImplementation(() => builder({ data: [], error: null }));
});

describe('Record Payment policy picker', () => {
  it('loads policies through list_account_policies, not a direct policies read', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    render(<RecordPaymentForm accountId={ACCOUNT_ID} customerName="Mary Turner" />);

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('list_account_policies', { p_account_id: ACCOUNT_ID });
    });
    // The owner-only table read is what the recursion broke; it must be gone.
    expect(fromMock).not.toHaveBeenCalledWith('policies');
  });

  it('offers a Named Insured policy owned by another account, labelled with its owner', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 'p-own', account_id: ACCOUNT_ID, membership: 'owner',
          owner_account_id: ACCOUNT_ID, owner_account_name: 'Mary Turner',
          policy_number: 'AAA-1', carrier_name: 'Progressive',
        },
        {
          id: 'p-shared', account_id: 'other-account', membership: 'named_insured',
          owner_account_id: 'other-account', owner_account_name: 'Brett D Mcfarland',
          policy_number: 'BBB-2', carrier_name: 'Auto-Owners',
        },
      ],
      error: null,
    });

    render(<RecordPaymentForm accountId={ACCOUNT_ID} customerName="Mary Turner" />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox', { name: /policy/i }));

    expect(await screen.findByText('AAA-1 - Progressive')).toBeInTheDocument();
    // Staff must be able to tell whose policy they are applying the payment to.
    expect(
      await screen.findByText('BBB-2 - Auto-Owners (shared - Brett D Mcfarland)'),
    ).toBeInTheDocument();
  });

  it('reports a failed load instead of showing an empty book', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'infinite recursion detected in policy for relation "policies"' },
    });

    render(<RecordPaymentForm accountId={ACCOUNT_ID} customerName="Mary Turner" />);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not load policies',
          variant: 'destructive',
        }),
      );
    });

    await userEvent.click(screen.getByRole('combobox', { name: /policy/i }));
    expect(await screen.findByText('Could not load policies')).toBeInTheDocument();
    expect(screen.queryByText('No policies found')).not.toBeInTheDocument();
  });

  it('still says "No policies found" when the customer genuinely has none', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    render(<RecordPaymentForm accountId={ACCOUNT_ID} customerName="Mary Turner" />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('combobox', { name: /policy/i }));

    expect(await screen.findByText('No policies found')).toBeInTheDocument();
    expect(screen.queryByText('Could not load policies')).not.toBeInTheDocument();
  });
});
