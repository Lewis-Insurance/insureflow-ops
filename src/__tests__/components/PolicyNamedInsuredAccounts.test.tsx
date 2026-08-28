import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpcMock, linkedAccounts } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  linkedAccounts: { current: [] as Array<{ account_id: string; name: string; created_at: string }> },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const { isStaff } = vi.hoisted(() => ({ isStaff: { current: true } }));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ isStaff: isStaff.current }),
}));

vi.mock('@/components/customers/CustomerSearchSelect', () => ({
  CustomerSearchSelect: ({
    onChange,
    excludedAccountIds,
    agencyWorkspaceId,
    disabled,
  }: {
    onChange: (account: { id: string; name: string; type: string }) => void;
    excludedAccountIds: string[];
    agencyWorkspaceId: string;
    disabled: boolean;
  }) => (
    <button
      type="button"
      data-excluded-ids={excludedAccountIds.join(',')}
      data-workspace-id={agencyWorkspaceId}
      disabled={disabled}
      onClick={() => onChange({ id: 'picked-account', name: 'Picked Company', type: 'commercial_business' })}
    >
      Pick account
    </button>
  ),
}));

import { PolicyNamedInsuredAccounts } from '@/components/policies/PolicyNamedInsuredAccounts';

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PolicyNamedInsuredAccounts
          policyId="policy-1"
          ownerAccount={{ id: 'owner-account', name: 'Owner Company', agency_workspace_id: 'workspace-1' }}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PolicyNamedInsuredAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStaff.current = true;
    linkedAccounts.current = [
      { account_id: 'linked-account', name: 'Linked Company', created_at: '2026-08-28T00:00:00Z' },
    ];
    rpcMock.mockImplementation(async (name: string) => {
      if (name === 'list_policy_named_insureds') {
        return {
          data: linkedAccounts.current,
          error: null,
        };
      }
      return { data: null, error: null };
    });
  });

  it('does not mount or query the staff editor for a nonstaff user', () => {
    isStaff.current = false;
    renderEditor();

    expect(screen.queryByRole('heading', { name: 'Named Insured accounts' })).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('shows Primary without a remove control when the junction is empty', async () => {
    linkedAccounts.current = [];
    renderEditor();

    expect(screen.getByRole('link', { name: 'Owner Company' })).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove Owner Company/i })).not.toBeInTheDocument();
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('list_policy_named_insureds', { p_policy_id: 'policy-1' }));
  });

  it('keeps account selection disabled until exclusions finish loading', () => {
    rpcMock.mockImplementationOnce(() => new Promise(() => undefined));
    renderEditor();

    expect(screen.getByLabelText('Loading Named Insured accounts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick account' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeDisabled();
  });

  it('shows an accessible list error with retry and keeps the picker disabled', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error('Network unavailable') });
    renderEditor();

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick account' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeDisabled();
  });

  it('shows Primary as non-removable and renders a removable junction row', async () => {
    renderEditor();

    expect(screen.getByRole('link', { name: 'Owner Company' })).toHaveAttribute('href', '/customers/owner-account');
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Owner Company' })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Linked Company' })).toHaveAttribute('href', '/customers/linked-account');
    expect(screen.getByRole('button', { name: 'Remove Linked Company' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick account' })).toHaveAttribute('data-workspace-id', 'workspace-1');
    expect(screen.getByRole('button', { name: 'Pick account' })).toHaveAttribute(
      'data-excluded-ids',
      'owner-account,linked-account',
    );
  });

  it('adds the picked account through add_policy_named_insured', async () => {
    const user = userEvent.setup();
    renderEditor();

    await screen.findByRole('link', { name: 'Linked Company' });
    await user.click(screen.getByRole('button', { name: 'Pick account' }));
    await user.click(screen.getByRole('button', { name: 'Add account' }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('add_policy_named_insured', {
        p_policy_id: 'policy-1',
        p_account_id: 'picked-account',
      });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add account' })).toBeDisabled());
  });

  it('confirms CRM and relationship graph are untouched before removing', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole('button', { name: 'Remove Linked Company' }));

    expect(screen.getByText(/does not remove the company from the relationship graph/i)).toBeInTheDocument();
    expect(screen.getByText(/CRM graph is untouched/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove account' }));
    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('remove_policy_named_insured', {
        p_policy_id: 'policy-1',
        p_account_id: 'linked-account',
      });
    });
  });
});
