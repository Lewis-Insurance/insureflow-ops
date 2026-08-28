import { render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalCallbackPage from '@/pages/PortalCallbackPage';

const { getSessionMock, onAuthStateChangeMock, rpcMock, navigateMock, unsubscribeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  rpcMock: vi.fn(),
  navigateMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
    rpc: rpcMock,
  },
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

const INVITATION_ID = '00000000-0000-4000-8000-000000000001';
const SESSION = { user: { id: '00000000-0000-4000-8000-000000000002' } } as Session;

function renderCallback(search = `?invitation=${INVITATION_ID}`) {
  return render(
    <MemoryRouter initialEntries={[`/portal/callback${search}`]}>
      <PortalCallbackPage />
    </MemoryRouter>,
  );
}

describe('PortalCallbackPage', () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: unsubscribeMock } } });
    rpcMock.mockResolvedValue({ data: { portal_status: 'active' }, error: null });
  });

  it('waits for an Auth session, accepts the invitation, and navigates to the dashboard', async () => {
    let authChange: ((event: string, session: Session | null) => void) | undefined;
    onAuthStateChangeMock.mockImplementation((callback) => {
      authChange = callback;
      return { data: { subscription: { unsubscribe: unsubscribeMock } } };
    });

    renderCallback();

    await waitFor(() => expect(onAuthStateChangeMock).toHaveBeenCalledOnce());
    expect(rpcMock).not.toHaveBeenCalled();

    authChange?.('SIGNED_IN', SESSION);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('accept_portal_invitation', {
      p_invitation_id: INVITATION_ID,
    }));
    expect(navigateMock).toHaveBeenCalledWith('/portal/dashboard', { replace: true });
  });

  it('accepts immediately when the magic-link session is already available', async () => {
    getSessionMock.mockResolvedValue({ data: { session: SESSION } });

    renderCallback();

    await waitFor(() => expect(rpcMock).toHaveBeenCalledOnce());
    expect(navigateMock).toHaveBeenCalledWith('/portal/dashboard', { replace: true });
  });

  it.each([
    ['missing', ''],
    ['invalid', '?invitation=not-a-uuid'],
  ])('fails closed for a %s invitation id', async (_label, search) => {
    renderCallback(search);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This portal invitation could not be accepted. Please contact your insurance agency.',
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows a generic error and does not navigate when the RPC rejects acceptance', async () => {
    getSessionMock.mockResolvedValue({ data: { session: SESSION } });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'database detail must not leak' } });

    renderCallback();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This portal invitation could not be accepted. Please contact your insurance agency.',
    );
    expect(screen.queryByText('database detail must not leak')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
