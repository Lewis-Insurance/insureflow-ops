import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockUseLeads = vi.fn();
const mockUseMoveLeadToStage = vi.fn();
const mockUseLeadMetrics = vi.fn();

vi.mock('@/hooks/useLeads', () => ({
  useLeads: (...args: unknown[]) => mockUseLeads(...args),
  useMoveLeadToStage: () => mockUseMoveLeadToStage(),
}));

vi.mock('@/hooks/useLeadAnalytics', () => ({
  useLeadMetrics: (...args: unknown[]) => mockUseLeadMetrics(...args),
}));

vi.mock('@/components/leads/LeadDetailView', () => ({
  LeadDetailView: () => null,
}));

import { PipelineKanban } from '@/components/leads/PipelineKanban';

function createLead(id: number) {
  return {
    id: `lead-${id}`,
    first_name: `Lead`,
    last_name: `${id}`,
    email: `lead${id}@example.com`,
    phone: '5555550100',
    status: 'new',
    lead_score: 75,
    insurance_types: ['auto'],
    created_at: '2026-01-15T00:00:00.000Z',
    current_premium: 1200,
  };
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    React.createElement(QueryClientProvider, { client: queryClient }, ui)
  );
}

describe('PipelineKanban', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseMoveLeadToStage.mockReturnValue({
      mutate: vi.fn(),
    });

    mockUseLeadMetrics.mockReturnValue({
      data: {
        total_leads: 500,
        new_leads: 200,
        contacted_leads: 100,
        qualified_leads: 80,
        quoted_leads: 60,
        won_leads: 40,
        lost_leads: 20,
        nurturing_leads: 100,
        conversion_rate: 8,
        average_score: 68,
        total_pipeline_value: 180000,
      },
      isLoading: false,
    });
  });

  it('renders Total Pipeline from leadsResponse.total, not paginated data length', async () => {
    const leads = Array.from({ length: 25 }, (_, index) => createLead(index + 1));

    mockUseLeads.mockReturnValue({
      data: {
        data: leads,
        total: 500,
        page: 1,
        pageSize: 25,
        totalPages: 20,
      },
      isLoading: false,
    });

    renderWithQueryClient(<PipelineKanban />);

    await waitFor(() => {
      expect(screen.getByText('Total Pipeline')).toBeInTheDocument();
    });

    const totalPipelineCard = screen.getByText('Total Pipeline').closest('.rounded-lg');
    expect(totalPipelineCard).not.toBeNull();
    expect(within(totalPipelineCard as HTMLElement).getByText('500')).toBeInTheDocument();
    expect(within(totalPipelineCard as HTMLElement).queryByText('25')).not.toBeInTheDocument();
  });
});
