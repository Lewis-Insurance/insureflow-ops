import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InviteToPortalButton } from '@/components/customers/InviteToPortalButton';

const { rpcMock, invokeMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: rpcMock,
    functions: { invoke: invokeMock },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

const HOME_ID = '00000000-0000-4000-8000-000000000001';
const PARENT_ID = '00000000-0000-4000-8000-000000000002';
const SITE_ID = '00000000-0000-4000-8000-000000000003';
const SPOUSE_ID = '00000000-0000-4000-8000-000000000004';
const HOUSEHOLD_ID = '00000000-0000-4000-8000-000000000005';
const SAME_AS_ID = '00000000-0000-4000-8000-000000000006';

const clusterRows = [
  {
    account_id: PARENT_ID,
    name: 'Parent Company',
    node_role: 'parent_company',
    is_business: true,
    default_selected: true,
  },
  {
    account_id: HOME_ID,
    name: 'Invite Site',
    node_role: 'site',
    is_business: true,
    default_selected: true,
  },
  {
    account_id: SITE_ID,
    name: 'Second Site',
    node_role: 'owned_business',
    is_business: true,
    default_selected: true,
  },
  {
    account_id: SPOUSE_ID,
    name: 'Spouse Account',
    node_role: 'spouse',
    is_business: false,
    default_selected: false,
  },
  {
    account_id: HOUSEHOLD_ID,
    name: 'Household Account',
    node_role: 'household',
    is_business: false,
    default_selected: false,
  },
  {
    account_id: SAME_AS_ID,
    name: 'Duplicate Marker',
    node_role: 'same_as',
    is_business: true,
    default_selected: true,
  },
];

function renderInvite() {
  return render(
    <InviteToPortalButton
      accountId={HOME_ID}
      accountName="Invite Site"
      defaultEmail="portal.user@example.test"
      defaultFirstName="Portal"
      defaultLastName="User"
    />,
  );
}

async function openDialog() {
  renderInvite();
  fireEvent.click(screen.getByRole('button', { name: /invite to portal/i }));
  await screen.findByRole('checkbox', { name: /invite site/i });
}

describe('InviteToPortalButton cluster access', () => {
  beforeEach(() => {
    rpcMock.mockResolvedValue({ data: clusterRows, error: null } as never);
    invokeMock.mockResolvedValue({ data: { success: true, message: 'Sent' }, error: null });
  });

  it('loads and groups the cluster with commercial defaults checked', async () => {
    await openDialog();

    expect(rpcMock).toHaveBeenCalledWith('list_portal_invite_cluster', {
      p_account_id: HOME_ID,
    });
    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Sites')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /parent company/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /invite site/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /invite site/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /second site/i })).toBeChecked();
  });

  it('does not default spouse or household accounts and hides same_as rows', async () => {
    await openDialog();

    expect(screen.getByRole('checkbox', { name: /spouse account/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /household account/i })).not.toBeChecked();
    expect(screen.queryByText('Duplicate Marker')).not.toBeInTheDocument();
  });

  it('posts the checked account set and always includes the invite-from account', async () => {
    await openDialog();

    fireEvent.click(screen.getByRole('checkbox', { name: /second site/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /spouse account/i }));
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock).toHaveBeenCalledWith('portal-send-invitation', {
      body: {
        account_id: HOME_ID,
        account_ids: [HOME_ID, PARENT_ID, SPOUSE_ID],
        email: 'portal.user@example.test',
        first_name: 'Portal',
        last_name: 'User',
      },
    });
  });

  it('fails closed when the cluster response omits the invite-from account', async () => {
    rpcMock.mockResolvedValue({
      data: clusterRows.filter((row) => row.account_id !== HOME_ID),
      error: null,
    });
    renderInvite();
    fireEvent.click(screen.getByRole('button', { name: /invite to portal/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invite-from account is missing from the validated account access.',
    );
    const sendButton = screen.getByRole('button', { name: /send invitation/i });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
