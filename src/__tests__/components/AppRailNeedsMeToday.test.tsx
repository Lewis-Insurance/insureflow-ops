import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('@/hooks/useMyNeedsMeToday', () => ({
  useMyNeedsMeToday: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    profile: { full_name: 'Test User', role: 'agent' },
    signOut: vi.fn(),
  })),
}));

vi.mock('@/components/layout/chrome/ChromeContext', () => ({
  useChrome: vi.fn(() => ({
    railCollapsed: false,
    expandedSections: {},
    toggleSection: vi.fn(),
  })),
}));

import { AppRail } from '@/components/layout/chrome/AppRail';
import { useMyNeedsMeToday } from '@/hooks/useMyNeedsMeToday';

beforeEach(() => {
  navigate.mockClear();
  vi.mocked(useMyNeedsMeToday).mockReturnValue({
    counts: { renewals_due: 3, overdue_tasks: 2, new_leads: 1 },
    total: 6,
    loading: false,
    refetch: vi.fn(),
  });
});

describe('AppRail needs me today', () => {
  it('uses useMyNeedsMeToday for personal counts', () => {
    render(
      <MemoryRouter>
        <AppRail />
      </MemoryRouter>,
    );

    expect(useMyNeedsMeToday).toHaveBeenCalled();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('overdue tasks link includes scope=mine', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AppRail />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /Overdue tasks/i }));

    expect(navigate).toHaveBeenCalledWith('/tasks?cohort=overdue&scope=mine');
  });
});
