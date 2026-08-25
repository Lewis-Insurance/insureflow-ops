// Contract tests for the AO "Moved" path through the shared Add New Policy modal.
//
// Marking an AO renewal Moved now means: record the replacement policy on a CRM
// customer, and only then write the renewal back. The three rules that matter to
// the CSR and are easy to regress:
//
//   1. Cancel writes nothing. The renewal is not marked Moved.
//   2. The customer is required, because AO renewals are not linked to an account.
//   3. If the policy insert lands but the renewal write-back fails, Retry replays
//      the values captured at the failure, not whatever the form shows later,
//      and it never inserts a second policy.
//
// The customer picker and the lookups are stubbed so the test exercises the
// modal's own save/retry logic rather than Radix popovers or network calls.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ policyInserts: [] as Record<string, unknown>[] }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => ({
      insert: (rows: Record<string, unknown>[]) => {
        if (table === 'policies') mocks.policyInserts.push(rows[0]);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'policy-1', ...rows[0] }, error: null }),
          }),
        };
      },
    })),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useLookupData', () => ({
  useCarriers: () => ({ data: [{ id: 'car-1', name: 'Progressive' }], isLoading: false }),
  useLinesOfBusiness: () => ({ data: [{ id: 'lob-1', name: 'Personal Auto' }], isLoading: false }),
}));

vi.mock('@/lib/taskAutomation', () => ({ generateTasks: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/components/customers/DuplicatePolicyDialog', () => ({ DuplicatePolicyDialog: () => null }));

// Stand-in for the account picker: one button that selects a known customer.
vi.mock('@/components/customers/CustomerSearchSelect', () => ({
  CustomerSearchSelect: ({ value, onChange, error }: any) => (
    <div>
      <button
        type="button"
        onClick={() => onChange({ id: 'acct-1', name: 'Jane Rivera', type: 'household' })}
      >
        pick customer
      </button>
      <span data-testid="selected-customer">{value?.name ?? ''}</span>
      {error && <span data-testid="customer-error">{error}</span>}
    </div>
  ),
}));

// Imported AFTER the mocks are registered.
import { AddPolicyModal, type AddPolicyAfterSaveContext } from '@/components/customers/AddPolicyModal';

const SUBMIT_LABEL = 'Add Policy and Mark Moved';

function renderModal(props: Partial<React.ComponentProps<typeof AddPolicyModal>> = {}) {
  const onOpenChange = vi.fn();
  const onAfterSave = vi.fn<[AddPolicyAfterSaveContext], Promise<void>>().mockResolvedValue(undefined);

  render(
    <MemoryRouter>
      <AddPolicyModal
        open
        onOpenChange={onOpenChange}
        enableCustomerSearch
        customerSearchQuery="Jane Rivera"
        submitLabel={SUBMIT_LABEL}
        initialValues={{ line_of_business: 'Personal Auto', policy_term: 'annual', effective_date: '2026-09-01' }}
        onAfterSave={onAfterSave}
        afterSaveErrorMessage="The policy was saved but the renewal was not marked Moved."
        {...props}
      />
    </MemoryRouter>,
  );

  return { onOpenChange, onAfterSave };
}

function fillRequiredPolicyFields({ premium }: { premium: string }) {
  fireEvent.change(screen.getByLabelText('Policy Number *'), { target: { value: 'POL-9001' } });
  fireEvent.change(screen.getByLabelText('Carrier *'), { target: { value: 'Progressive' } });
  fireEvent.change(screen.getByLabelText('Premium Amount'), { target: { value: premium } });
}

describe('AddPolicyModal, AO Moved path', () => {
  beforeEach(() => {
    mocks.policyInserts.length = 0;
  });

  it('cancel writes nothing and never marks the renewal moved', async () => {
    const { onOpenChange, onAfterSave } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    fillRequiredPolicyFields({ premium: '1200' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onAfterSave).not.toHaveBeenCalled();
    expect(mocks.policyInserts).toHaveLength(0);
  });

  it('requires a customer before it will save anything', async () => {
    const { onAfterSave } = renderModal();

    fillRequiredPolicyFields({ premium: '1200' });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

    expect(await screen.findByTestId('customer-error')).toBeInTheDocument();
    expect(mocks.policyInserts).toHaveLength(0);
    expect(onAfterSave).not.toHaveBeenCalled();
  });

  it('saves the policy to the chosen customer, then marks the renewal moved', async () => {
    const { onAfterSave } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    fillRequiredPolicyFields({ premium: '1200' });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

    await waitFor(() => expect(onAfterSave).toHaveBeenCalledTimes(1));

    expect(mocks.policyInserts).toHaveLength(1);
    expect(mocks.policyInserts[0]).toMatchObject({
      account_id: 'acct-1',
      policy_number: 'POL-9001',
      carrier: 'Progressive',
      line_of_business: 'Personal Auto',
    });

    const context = onAfterSave.mock.calls[0][0];
    expect(context.accountId).toBe('acct-1');
    expect(context.policyId).toBe('policy-1');
    expect(context.form.premium).toBe('1200');
  });

  it('retries with the values captured at the failure, not the edited form', async () => {
    const onAfterSave = vi
      .fn<[AddPolicyAfterSaveContext], Promise<void>>()
      .mockRejectedValueOnce(new Error('renewal update failed'))
      .mockResolvedValueOnce(undefined);

    renderModal({ onAfterSave });

    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    fillRequiredPolicyFields({ premium: '1200' });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

    // The policy landed, the write-back did not: the modal stays open and offers a retry.
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(mocks.policyInserts).toHaveLength(1);

    // The CSR edits the premium while the failure banner is showing.
    fireEvent.change(screen.getByLabelText('Premium Amount'), { target: { value: '9999' } });

    fireEvent.click(retry);

    await waitFor(() => expect(onAfterSave).toHaveBeenCalledTimes(2));
    // Same snapshot both times, and no second policy row.
    expect(onAfterSave.mock.calls[1][0].form.premium).toBe('1200');
    expect(onAfterSave.mock.calls[1][0].policyId).toBe('policy-1');
    expect(mocks.policyInserts).toHaveLength(1);
  });
});
