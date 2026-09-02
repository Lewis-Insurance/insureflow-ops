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
//   4. "Only change status" marks the renewal Moved without inserting a policy,
//      for the case where the replacement policy is already on the customer.
//   5. A policy number that already exists routes to that same status-only
//      write instead of a dead-end error, and Cancel there writes nothing.
//
// The customer picker and the lookups are stubbed so the test exercises the
// modal's own save/retry logic rather than Radix popovers or network calls.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  /** Rows the policies table actually accepted. */
  policyInserts: [] as Record<string, unknown>[],
  /** Every attempt, including the ones the database rejected. */
  policyInsertAttempts: 0,
  /** Set to make the next policies insert fail (duplicate policy number). */
  insertError: null as { code?: string; message: string } | null,
  toast: vi.fn(),
  /**
   * The carrier directory the picker reads. 'Progressive' is an exact name, so
   * typing it links carrier_id without any extra clicks; that link is what lets
   * a certificate resolve the insurer NAIC from `carriers`.
   */
  carriers: [{ id: 'car-1', name: 'Progressive', naic: '24260' }] as Array<{
    id: string;
    name: string;
    naic: string | null;
  }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => ({
      select: () => ({
        order: () =>
          Promise.resolve({
            data: table === 'carriers' ? mocks.carriers : [],
            error: null,
          }),
      }),
      insert: (rows: Record<string, unknown>[]) => ({
        select: () => ({
          single: () => {
            if (table !== 'policies') {
              return Promise.resolve({ data: { id: 'row-1', ...rows[0] }, error: null });
            }
            mocks.policyInsertAttempts += 1;
            if (mocks.insertError) {
              const error = mocks.insertError;
              mocks.insertError = null;
              return Promise.resolve({ data: null, error });
            }
            mocks.policyInserts.push(rows[0]);
            return Promise.resolve({ data: { id: 'policy-1', ...rows[0] }, error: null });
          },
        }),
      }),
    })),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

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
import {
  AddPolicyModal,
  type AddPolicyAfterSaveContext,
  type AddPolicySecondaryActionContext,
} from '@/components/customers/AddPolicyModal';
import { validateAoMovedStatusOnly } from '@/components/renewals/aoMovedPolicy';

const SUBMIT_LABEL = 'Add Policy and Mark Moved';
const STATUS_ONLY_LABEL = 'Only change status';

function renderModal(props: Partial<React.ComponentProps<typeof AddPolicyModal>> = {}) {
  const onOpenChange = vi.fn();
  const onAfterSave = vi.fn<(context: AddPolicyAfterSaveContext) => Promise<void>>().mockResolvedValue(undefined);
  const onSecondaryAction = vi
    .fn<(context: AddPolicySecondaryActionContext) => Promise<void>>()
    .mockResolvedValue(undefined);

  // The carrier picker reads and writes the carrier directory through react
  // query, so the modal needs a client. Retries off so a mock miss fails fast.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
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
        secondaryActionLabel={STATUS_ONLY_LABEL}
        onSecondaryAction={onSecondaryAction}
        validateSecondaryAction={validateAoMovedStatusOnly}
        {...props}
      />
    </MemoryRouter>
    </QueryClientProvider>,
  );

  return { onOpenChange, onAfterSave, onSecondaryAction };
}

/** The duplicate popup and the form both carry an "Only change status" button. */
function alreadyOnFileDialog() {
  return screen.getByRole('dialog', { name: /already on file/i });
}

function fillRequiredPolicyFields({ premium }: { premium: string }) {
  fireEvent.change(screen.getByLabelText('Policy Number *'), { target: { value: 'POL-9001' } });
  fireEvent.change(screen.getByLabelText('Carrier *'), { target: { value: 'Progressive' } });
  fireEvent.change(screen.getByLabelText('Premium Amount'), { target: { value: premium } });
}

describe('AddPolicyModal, AO Moved path', () => {
  beforeEach(() => {
    mocks.policyInserts.length = 0;
    mocks.policyInsertAttempts = 0;
    mocks.insertError = null;
    mocks.toast.mockClear();
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
    // Wait for the carrier picker to link the typed name to its directory row.
    await screen.findByText(/from the carrier directory/i);
    fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

    await waitFor(() => expect(onAfterSave).toHaveBeenCalledTimes(1));

    expect(mocks.policyInserts).toHaveLength(1);
    expect(mocks.policyInserts[0]).toMatchObject({
      account_id: 'acct-1',
      policy_number: 'POL-9001',
      carrier: 'Progressive',
      line_of_business: 'Personal Auto',
      // The carrier name matches the directory exactly, so the policy links to
      // that carriers row. Without carrier_id a certificate has no carrier
      // record to take a NAIC from, and the ACORD 25 NAIC box prints blank.
      carrier_id: 'car-1',
      // NAIC is never snapshotted onto the policy: policies.carrier_naic
      // outranks carriers.naic forever, so a copy taken here would ignore a
      // later correction on the Carriers page.
      carrier_naic: null,
    });

    const context = onAfterSave.mock.calls[0][0];
    expect(context.accountId).toBe('acct-1');
    expect(context.policyId).toBe('policy-1');
    expect(context.form.premium).toBe('1200');
  });

  it('retries with the values captured at the failure, not the edited form', async () => {
    const onAfterSave = vi
      .fn<(context: AddPolicyAfterSaveContext) => Promise<void>>()
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

// The replacement policy is often already on the CRM customer. In that case the
// CSR only needs the AO renewal moved over, and adding a policy would create a
// duplicate.
describe('AddPolicyModal, AO Only change status', () => {
  beforeEach(() => {
    mocks.policyInserts.length = 0;
    mocks.policyInsertAttempts = 0;
    mocks.insertError = null;
    mocks.toast.mockClear();
  });

  it('marks the renewal moved without touching the policies table', async () => {
    const { onOpenChange, onSecondaryAction, onAfterSave } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    // Only what the write-back needs: the carrier moved to (plus term/premium).
    fireEvent.change(screen.getByLabelText('Carrier *'), { target: { value: 'Progressive' } });
    fireEvent.change(screen.getByLabelText('Premium Amount'), { target: { value: '1200' } });

    fireEvent.click(screen.getByRole('button', { name: STATUS_ONLY_LABEL }));

    await waitFor(() => expect(onSecondaryAction).toHaveBeenCalledTimes(1));
    expect(onSecondaryAction.mock.calls[0][0]).toMatchObject({ accountId: 'acct-1' });
    expect(onSecondaryAction.mock.calls[0][0].form.carrier).toBe('Progressive');
    expect(onSecondaryAction.mock.calls[0][0].form.premium).toBe('1200');

    // The whole point: no insert was even attempted, and no policy save ran.
    expect(mocks.policyInsertAttempts).toBe(0);
    expect(mocks.policyInserts).toHaveLength(0);
    expect(onAfterSave).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('does not skip the policy form validation it still needs: a customer', async () => {
    const { onSecondaryAction } = renderModal();

    fireEvent.change(screen.getByLabelText('Carrier *'), { target: { value: 'Progressive' } });
    fireEvent.click(screen.getByRole('button', { name: STATUS_ONLY_LABEL }));

    expect(await screen.findByTestId('customer-error')).toBeInTheDocument();
    expect(onSecondaryAction).not.toHaveBeenCalled();
    expect(mocks.policyInsertAttempts).toBe(0);
  });

  it('will not write a moved renewal with no carrier on it', async () => {
    const { onSecondaryAction } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    fireEvent.click(screen.getByRole('button', { name: STATUS_ONLY_LABEL }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/carrier/i) }),
      ),
    );
    expect(onSecondaryAction).not.toHaveBeenCalled();
    expect(mocks.policyInsertAttempts).toBe(0);
  });

  it('does not need a policy number, because it is not creating a policy', async () => {
    const { onSecondaryAction } = renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    fireEvent.change(screen.getByLabelText('Carrier *'), { target: { value: 'Progressive' } });
    fireEvent.click(screen.getByRole('button', { name: STATUS_ONLY_LABEL }));

    await waitFor(() => expect(onSecondaryAction).toHaveBeenCalledTimes(1));
    expect(onSecondaryAction.mock.calls[0][0].form.policy_number).toBe('');
  });
});

// Adding a policy number that is already on file is exactly the situation the
// status-only path exists for, so the error routes straight to it.
describe('AddPolicyModal, AO duplicate policy number', () => {
  beforeEach(() => {
    mocks.policyInserts.length = 0;
    mocks.policyInsertAttempts = 0;
    mocks.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    mocks.toast.mockClear();
  });

  async function submitDuplicate() {
    const handles = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'pick customer' }));
    fillRequiredPolicyFields({ premium: '1200' });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT_LABEL }));
    // Second popup, not a dead-end toast.
    await screen.findByText('This policy is already on file');
    return handles;
  }

  it('offers the status-only write instead of a raw unique constraint error', async () => {
    const { onSecondaryAction, onOpenChange } = await submitDuplicate();

    expect(mocks.policyInsertAttempts).toBe(1);
    expect(mocks.policyInserts).toHaveLength(0);

    fireEvent.click(within(alreadyOnFileDialog()).getByRole('button', { name: STATUS_ONLY_LABEL }));

    await waitFor(() => expect(onSecondaryAction).toHaveBeenCalledTimes(1));
    expect(onSecondaryAction.mock.calls[0][0]).toMatchObject({ accountId: 'acct-1' });
    expect(onSecondaryAction.mock.calls[0][0].form.policy_number).toBe('POL-9001');
    // No retry of the insert: still exactly the one rejected attempt.
    expect(mocks.policyInsertAttempts).toBe(1);
    expect(mocks.policyInserts).toHaveLength(0);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('cancel on the second popup writes nothing and leaves the form editable', async () => {
    const { onSecondaryAction, onAfterSave, onOpenChange } = await submitDuplicate();

    fireEvent.click(within(alreadyOnFileDialog()).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByText('This policy is already on file')).not.toBeInTheDocument(),
    );
    expect(onSecondaryAction).not.toHaveBeenCalled();
    expect(onAfterSave).not.toHaveBeenCalled();
    expect(mocks.policyInserts).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Still on the form, so the CSR can fix the number and try again.
    expect(await screen.findByRole('button', { name: SUBMIT_LABEL })).toBeInTheDocument();
  });
});
