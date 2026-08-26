import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const hookResults = vi.hoisted(() => ({
  quotes: {
    data: [{ id: 'quote-1', status: 'open', created_at: '2026-08-26T12:00:00.000Z' }],
    isLoading: false,
  },
  renewals: { data: [], isLoading: false },
  tasks: { tasks: [], loading: false },
  counts: {
    data: {
      openQuotes: 1501,
      criticalQuotes: 1201,
      upcomingRenewals: 2200,
      urgentRenewals: 1100,
      activeTasks: 3300,
      overdueTasks: 1300,
      escalations: 2304,
    },
  },
}));

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useQuotes', () => ({
  useQuotes: vi.fn(() => hookResults.quotes),
}));

vi.mock('@/hooks/useRenewals', () => ({
  useRenewals: vi.fn(() => hookResults.renewals),
}));

vi.mock('@/hooks/useTasks', () => ({
  useTasks: vi.fn(() => hookResults.tasks),
}));

vi.mock('@/hooks/useCommandCenterCounts', () => ({
  useCommandCenterCounts: vi.fn(() => hookResults.counts),
}));

import CommandCenterPage from '@/pages/CommandCenterPage';

describe('CommandCenterPage exact counts', () => {
  it('renders exact count-hook values instead of the loaded row lengths', () => {
    render(
      <MemoryRouter>
        <CommandCenterPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('2304')).toBeInTheDocument();
    expect(screen.getByText('1501')).toBeInTheDocument();
    expect(screen.getByText('1201 over 24hrs')).toBeInTheDocument();
    expect(screen.getByText('2200')).toBeInTheDocument();
    expect(screen.getByText('1100 urgent (≤7 days)')).toBeInTheDocument();
    expect(screen.getByText('3300')).toBeInTheDocument();
    expect(screen.getByText('1300 overdue')).toBeInTheDocument();
  });
});
