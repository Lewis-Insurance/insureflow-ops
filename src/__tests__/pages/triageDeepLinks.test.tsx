import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/customers/AddPolicyModal', () => ({ AddPolicyModal: () => null }));
vi.mock('@/components/client/ClientSelector', () => ({ ClientSelector: () => null }));
vi.mock('@/hooks/usePolicySearch', () => ({ usePolicySearch: vi.fn() }));
vi.mock('@/hooks/usePolicyTriageCounts', () => ({ usePolicyTriageCounts: vi.fn() }));

vi.mock('@/components/tasks/TaskKanbanBoard', () => ({ TaskKanbanBoard: () => null }));
vi.mock('@/components/tasks/TaskCalendarView', () => ({ TaskCalendarView: () => null }));
vi.mock('@/components/tasks/TaskAnalyticsDashboard', () => ({ TaskAnalyticsDashboard: () => null }));
vi.mock('@/components/tasks/TaskForm', () => ({ TaskForm: () => null }));
vi.mock('@/hooks/useTasks', () => ({ useTasks: vi.fn() }));
vi.mock('@/hooks/useTaskSearch', () => ({ useTaskSearch: vi.fn() }));
vi.mock('@/hooks/useTaskTriageCounts', () => ({ useTaskTriageCounts: vi.fn() }));

vi.mock('@/components/leads/QuickLeadCapture', () => ({ QuickLeadCapture: () => null }));
vi.mock('@/components/leads/PipelineKanban', () => ({ PipelineKanban: () => null }));
vi.mock('@/components/leads/TeamPipelineView', () => ({ TeamPipelineView: () => null }));
vi.mock('@/components/leads/TimelineView', () => ({ TimelineView: () => null }));
vi.mock('@/components/leads/analytics/LeadAnalyticsDashboard', () => ({
  LeadAnalyticsDashboard: () => null,
}));
vi.mock('@/components/leads/ProducerSalesDashboard', () => ({ ProducerSalesDashboard: () => null }));
vi.mock('@/hooks/useLeadSearch', () => ({ useLeadSearch: vi.fn() }));
vi.mock('@/hooks/useLeadTriageCounts', () => ({ useLeadTriageCounts: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

vi.mock('@/components/layout/chrome/chromeActions', () => ({
  useChromeAction: vi.fn(),
}));
vi.mock('@/components/customers/ActionMenu', () => ({ ActionMenu: () => null }));
vi.mock('@/components/customers/AddCustomerModal', () => ({ AddCustomerModal: () => null }));
vi.mock('@/hooks/useUnifiedCustomers', () => ({ useUnifiedCustomers: vi.fn() }));
vi.mock('@/hooks/useCustomerTriageCounts', () => ({ useCustomerTriageCounts: vi.fn() }));
vi.mock('@/hooks/useRecentCustomers', () => ({ useRecentCustomers: vi.fn() }));
vi.mock('@/hooks/useTags', () => ({ useTags: vi.fn() }));

import PoliciesPage from '@/pages/PoliciesPage';
import TasksPage from '@/pages/TasksPage';
import Leads from '@/pages/Leads';
import CustomersPage from '@/pages/CustomersPage';
import { usePolicySearch } from '@/hooks/usePolicySearch';
import { usePolicyTriageCounts } from '@/hooks/usePolicyTriageCounts';
import { useTaskSearch } from '@/hooks/useTaskSearch';
import { useTaskTriageCounts } from '@/hooks/useTaskTriageCounts';
import { useTasks } from '@/hooks/useTasks';
import { useLeadSearch } from '@/hooks/useLeadSearch';
import { useLeadTriageCounts } from '@/hooks/useLeadTriageCounts';
import { useAuth } from '@/hooks/useAuth';
import { useUnifiedCustomers } from '@/hooks/useUnifiedCustomers';
import { useCustomerTriageCounts } from '@/hooks/useCustomerTriageCounts';
import { useRecentCustomers } from '@/hooks/useRecentCustomers';
import { useTags } from '@/hooks/useTags';

const emptyCounts = {
  total: 0,
  expiring_30d: 0,
  lapsed: 0,
  no_renewal_date: 0,
  recently_bound: 0,
};

function stubSearchHook<T extends { fetchPolicies?: unknown; fetchTasks?: unknown; fetchLeads?: unknown; fetchCustomers?: unknown }>(
  hook: { mockReturnValue: (v: T) => void },
  fetchKey: keyof T,
) {
  const fetchFn = vi.fn().mockResolvedValue(undefined);
  hook.mockReturnValue({
    policies: [],
    tasks: [],
    leads: [],
    customers: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    [fetchKey]: fetchFn,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  } as unknown as T);
  return fetchFn;
}

beforeEach(() => {
  vi.mocked(usePolicyTriageCounts).mockReturnValue({
    counts: emptyCounts,
    refetch: vi.fn(),
  } as ReturnType<typeof usePolicyTriageCounts>);

  vi.mocked(useTaskTriageCounts).mockReturnValue({
    counts: {
      open_total: 0,
      overdue: 0,
      due_this_week: 0,
      high_priority: 0,
      completed: 0,
    },
    loading: false,
    refetch: vi.fn(),
  } as ReturnType<typeof useTaskTriageCounts>);

  vi.mocked(useTasks).mockReturnValue({
    createTask: vi.fn(),
  } as unknown as ReturnType<typeof useTasks>);

  vi.mocked(useLeadTriageCounts).mockReturnValue({
    counts: {
      total: 0,
      new: 0,
      hot: 0,
      qualified: 0,
      quoted: 0,
    },
  } as ReturnType<typeof useLeadTriageCounts>);

  vi.mocked(useAuth).mockReturnValue({
    user: { id: 'user-1' },
  } as ReturnType<typeof useAuth>);

  vi.mocked(useCustomerTriageCounts).mockReturnValue({
    counts: {
      total: 0,
      renewals_30d: 0,
      overdue: 0,
      no_active_policy: 0,
      new_30d: 0,
    },
    refetch: vi.fn(),
  } as ReturnType<typeof useCustomerTriageCounts>);

  vi.mocked(useRecentCustomers).mockReturnValue({
    recent: [],
    recordOpen: vi.fn(),
    clear: vi.fn(),
  } as ReturnType<typeof useRecentCustomers>);

  vi.mocked(useTags).mockReturnValue({
    seedDefaultTags: vi.fn(),
  } as unknown as ReturnType<typeof useTags>);
});

describe('triage deep-links from ?cohort=', () => {
  it('PoliciesPage fetches with expiring_30d when cohort is in the URL', async () => {
    const fetchPolicies = stubSearchHook(usePolicySearch, 'fetchPolicies');

    render(
      <MemoryRouter initialEntries={['/policies?cohort=expiring_30d']}>
        <PoliciesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchPolicies).toHaveBeenCalledWith('', 'expiration_asc', 'expiring_30d');
    });
  });

  it('TasksPage defaults to scope=mine when no scope is in the URL', async () => {
    const fetchTasks = stubSearchHook(useTaskSearch, 'fetchTasks');

    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <TasksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledWith('', 'due_asc', undefined, 'mine');
    });
  });

  it('TasksPage fetches with overdue when cohort is in the URL', async () => {
    const fetchTasks = stubSearchHook(useTaskSearch, 'fetchTasks');

    render(
      <MemoryRouter initialEntries={['/tasks?cohort=overdue']}>
        <TasksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledWith('', 'due_asc', 'overdue', 'mine');
    });
  });

  it('TasksPage fetches with overdue and scope=mine when both are in the URL', async () => {
    const fetchTasks = stubSearchHook(useTaskSearch, 'fetchTasks');

    render(
      <MemoryRouter initialEntries={['/tasks?cohort=overdue&scope=mine']}>
        <TasksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledWith('', 'due_asc', 'overdue', 'mine');
    });
  });

  it('TasksPage fetches with scope=unclaimed when scope is in the URL', async () => {
    const fetchTasks = stubSearchHook(useTaskSearch, 'fetchTasks');

    render(
      <MemoryRouter initialEntries={['/tasks?scope=unclaimed']}>
        <TasksPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchTasks).toHaveBeenCalledWith('', 'due_asc', undefined, 'unclaimed');
    });
  });

  it('Leads fetches with new when cohort is in the URL', async () => {
    const fetchLeads = stubSearchHook(useLeadSearch, 'fetchLeads');

    render(
      <MemoryRouter initialEntries={['/leads?cohort=new']}>
        <Leads />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchLeads).toHaveBeenCalledWith('', 'score_desc', 'new', undefined, undefined);
    });
  });

  it('Leads fetches with scope=mine when scope is in the URL', async () => {
    const fetchLeads = stubSearchHook(useLeadSearch, 'fetchLeads');

    render(
      <MemoryRouter initialEntries={['/leads?cohort=new&scope=mine']}>
        <Leads />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchLeads).toHaveBeenCalledWith('', 'score_desc', 'new', undefined, 'mine');
    });
  });

  it('CustomersPage fetches with renewals_30d when cohort is in the URL', async () => {
    const fetchCustomers = stubSearchHook(useUnifiedCustomers, 'fetchCustomers');

    render(
      <MemoryRouter initialEntries={['/customers?cohort=renewals_30d']}>
        <CustomersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(fetchCustomers).toHaveBeenCalledWith('', 'updated_at_desc', 'renewals_30d', undefined);
    });
  });
});
