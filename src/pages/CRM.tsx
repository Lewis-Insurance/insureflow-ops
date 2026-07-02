import React, { useState, useCallback, memo, Suspense } from 'react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountSearch } from '@/components/crm/AccountSearch';
import { AccountList } from '@/components/crm/AccountList';
import { AccountForm } from '@/components/crm/AccountForm';
import { SavedViewsManager } from '@/components/crm/SavedViewsManager';
import { BulkActionsBar } from '@/components/crm/BulkActionsBar';
import { GlobalSearch } from '@/components/crm/GlobalSearch';
import { RecentlyAccessed } from '@/components/crm/RecentlyAccessed';
import { LeadList } from '@/components/crm/LeadList';
import { LeadAnalyticsDashboard } from '@/components/crm/LeadAnalyticsDashboard';
import { useCRMData } from '@/hooks/useCRMData';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CRMPageSkeleton } from '@/components/ui/skeleton-components';
import { SectionLabel } from '@/components/cc';
import { logger } from '@/lib/logger';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { SearchResult } from '@/hooks/useGlobalSearch';
import { addToRecentlyAccessed } from '@/components/crm/RecentlyAccessed';
import { cn } from '@/lib/utils';
import type {
  CRMFilters,
  SavedView,
  BulkAction,
  Account,
  CreateAccountData
} from '@/types/crm-enhanced-clean';

// Top-level workspace switch. Accounts and Leads keep the exact same content
// (AccountList / LeadList + analytics) behind a Calm Command segmented control.
type CrmTab = 'accounts' | 'leads';
type LeadTab = 'list' | 'analytics';

const CRM_TABS: { value: CrmTab; label: string }[] = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'leads', label: 'Leads' },
];

const LEAD_TABS: { value: LeadTab; label: string }[] = [
  { value: 'list', label: 'Lead list' },
  { value: 'analytics', label: 'Analytics' },
];

// Main CRM content component
const CRMContent = memo(() => {
  const {
    accounts,
    loading,
    error,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount
  } = useCRMData();

  const { canEdit, canViewAuditLogs } = usePermissions();

  const [filters, setFilters] = useState<CRMFilters>({});
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Account[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [tab, setTab] = useState<CrmTab>('accounts');
  const [leadTab, setLeadTab] = useState<LeadTab>('list');

  // Debounced search handler for better performance
  const debouncedSearch = useDebouncedCallback(
    () => fetchAccounts(filters),
    300,
    [filters]
  );

  // Memoized handlers with proper dependencies
  const handleCreateAccount = useCallback(async (data: CreateAccountData) => {
    setFormLoading(true);
    try {
      await createAccount(data);
      setShowAccountForm(false);
    } finally {
      setFormLoading(false);
    }
  }, [createAccount]);

  const handleEditAccount = useCallback(async (data: any) => {
    if (!editingAccount) return;

    setFormLoading(true);
    try {
      await updateAccount(editingAccount.id, data);
      setEditingAccount(null);
    } finally {
      setFormLoading(false);
    }
  }, [editingAccount, updateAccount]);

  const handleEdit = useCallback((account: Account) => {
    logger.debug('Edit button clicked for account:', account.id);
    setEditingAccount(account);
  }, []);

  const handleDelete = useCallback(async (accountId: string) => {
    await deleteAccount(accountId);
  }, [deleteAccount]);

  const handleViewSave = useCallback(async (view: Omit<SavedView, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    // In a real implementation, this would make an API call
    const newView: SavedView = {
      ...view,
      id: `view-${Date.now()}`,
      created_by: 'current-user-id',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setSavedViews(prev => [...prev, newView]);
  }, []);

  const handleViewSelect = useCallback((view: SavedView) => {
    setFilters(view.filters as CRMFilters);
    fetchAccounts(view.filters as CRMFilters);
  }, [fetchAccounts]);

  const handleViewDelete = useCallback((viewId: string) => {
    setSavedViews(prev => prev.filter(v => v.id !== viewId));
  }, []);

  const handleBulkAction = useCallback(async (action: Omit<BulkAction, 'id' | 'created_at' | 'created_by' | 'status' | 'progress' | 'success_count' | 'error_count' | 'errors'>) => {
    const { action_type, entity_ids, parameters } = action;

    try {
      switch (action_type) {
        case 'add_tags': {
          const tagsStr = parameters?.tags;
          if (!tagsStr) {
            toast({ title: 'Error', description: 'Please enter tags', variant: 'destructive' });
            return;
          }
          const newTags = String(tagsStr).split(',').map(t => t.trim()).filter(Boolean);

          // Tags live on insured_profiles (the field wired to the Customers list and
          // global search), keyed 1:1 to the account via insured_profiles.account_id.
          for (const accountId of entity_ids) {
            const { data: profile } = await supabase
              .from('insured_profiles')
              .select('tags')
              .eq('account_id', accountId)
              .maybeSingle();

            if (!profile) continue;

            const existingTags = profile.tags || [];
            const mergedTags = [...new Set([...existingTags, ...newTags])];

            await supabase
              .from('insured_profiles')
              .update({ tags: mergedTags })
              .eq('account_id', accountId);
          }

          toast({ title: 'Success', description: `Added tags to ${entity_ids.length} accounts` });
          fetchAccounts();
          break;
        }

        case 'create_tasks': {
          const title = parameters?.title;
          if (!title) {
            toast({ title: 'Error', description: 'Please enter a task title', variant: 'destructive' });
            return;
          }

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('Not authenticated');

          const tasks = entity_ids.map(accountId => ({
            title: String(title),
            description: parameters?.description ? String(parameters.description) : null,
            priority: parameters?.priority ? String(parameters.priority) : 'medium',
            status: 'pending',
            account_id: accountId,
            assigned_to: parameters?.assignee_id ? String(parameters.assignee_id) : user.id,
            created_by: user.id,
          }));

          const { error } = await supabase.from('tasks').insert(tasks);
          if (error) throw error;

          toast({ title: 'Success', description: `Created ${entity_ids.length} tasks` });
          break;
        }

        case 'export': {
          const format = parameters?.format || 'csv';

          // Get full account data
          const { data: accountsToExport, error } = await supabase
            .from('accounts')
            .select('*')
            .in('id', entity_ids);

          if (error) throw error;
          if (!accountsToExport?.length) {
            toast({ title: 'Error', description: 'No accounts to export', variant: 'destructive' });
            return;
          }

          if (format === 'csv') {
            // Generate CSV
            const headers = ['Name', 'Type', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Created'];
            const rows = accountsToExport.map(a => [
              a.name || '',
              a.type || '',
              a.email || '',
              a.phone || '',
              a.address_line1 || '',
              a.city || '',
              a.state || '',
              a.zip_code || '',
              a.created_at ? new Date(a.created_at).toLocaleDateString() : ''
            ]);

            const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `accounts_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast({ title: 'Success', description: `Exported ${accountsToExport.length} accounts to CSV` });
          } else {
            toast({ title: 'Info', description: `${format.toUpperCase()} export coming soon. CSV exported instead.` });
          }
          break;
        }

        default:
          toast({ title: 'Error', description: `Unknown action: ${action_type}`, variant: 'destructive' });
      }
    } catch (err) {
      console.error('Bulk action error:', err);
      toast({
        title: 'Bulk action failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive'
      });
    }
  }, [fetchAccounts]);

  const handleAccountSelection = useCallback((account: Account, selected: boolean) => {
    setSelectedAccounts(prev =>
      selected
        ? [...prev, account]
        : prev.filter(a => a.id !== account.id)
    );
  }, []);

  const handleSelectionClear = useCallback(() => {
    setSelectedAccounts([]);
  }, []);

  const handleRefreshAccounts = useCallback(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleGlobalSearchSelect = useCallback((result: SearchResult) => {
    // Navigate to the appropriate detail page based on result type
    if (result.entity_type === 'account') {
      // Navigate to account detail page
      window.location.href = `/crm/accounts/${result.id}`;
    } else if (result.entity_type === 'contact') {
      // For contacts, navigate to their account's detail page if available
      // For now, we'll add the contact to recently accessed
      addToRecentlyAccessed({
        id: result.id,
        name: result.label,
        type: 'contact',
        email: result.email || undefined,
        phone: result.phone || undefined
      });
    } else if (result.entity_type === 'business') {
      // Add business to recently accessed
      addToRecentlyAccessed({
        id: result.id,
        name: result.label,
        type: 'account',
        accountType: 'business',
        email: result.email || undefined,
        phone: result.phone || undefined
      });
    }

    logger.debug('Navigating to:', result.type, result.id);
  }, []);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1200px] space-y-6 p-6">
        {/* Header: title + one lime primary */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight text-cc-text-primary">CRM</h1>
            <p className="mt-1 text-sm text-cc-text-muted">
              Accounts and leads in one place. Search the book, then work the record.
            </p>
          </div>
          {canEdit && (
            <Button
              data-primary
              onClick={() => setShowAccountForm(true)}
              className="gap-2 rounded-cc-md font-semibold transition-shadow duration-base ease-glide hover:shadow-glow"
            >
              <Plus className="h-4 w-4" />
              New account
            </Button>
          )}
        </header>

        {/* Global Search */}
        <ErrorBoundary level="component">
          <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
            <GlobalSearch
              onResultSelect={handleGlobalSearchSelect}
              placeholder="Search customers, insureds, accounts, businesses..."
            />
          </div>
        </ErrorBoundary>

        {/* Recently Accessed */}
        <ErrorBoundary level="component">
          <RecentlyAccessed />
        </ErrorBoundary>

        {/* Top-level tabs as a Calm Command segmented control */}
        <div role="group" aria-label="Switch CRM view" className="inline-flex rounded-cc-md bg-cc-surface-raised p-0.5">
          {CRM_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              aria-pressed={tab === t.value}
              className={cn(
                'rounded-[10px] px-3 py-1.5 text-sm transition-colors duration-fast',
                tab === t.value
                  ? 'bg-cc-surface-overlay text-cc-text-primary'
                  : 'text-cc-text-muted hover:text-cc-text-secondary',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Accounts Tab */}
        {tab === 'accounts' ? (
          <div className="space-y-6">
            {/* Saved Views */}
            <ErrorBoundary level="component">
              <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
                <SavedViewsManager
                  currentFilters={filters}
                  savedViews={savedViews}
                  onViewSelect={handleViewSelect}
                  onViewSave={handleViewSave}
                  onViewDelete={handleViewDelete}
                />
              </div>
            </ErrorBoundary>

            {/* Search and Filters */}
            <ErrorBoundary level="component">
              <div className="rounded-cc-xl border border-cc-border-subtle bg-cc-surface p-5 shadow-card">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-cc-text-primary">Search accounts</h2>
                  <p className="mt-1 text-sm text-cc-text-muted">
                    Find customer accounts by name, phone, email, or other criteria
                  </p>
                </div>
                <AccountSearch
                  filters={filters}
                  onFiltersChange={setFilters}
                  onSearch={debouncedSearch}
                  loading={loading}
                />
              </div>
            </ErrorBoundary>

            {/* Error State */}
            {error && (
              <div className="rounded-cc-xl border border-cc-danger bg-cc-surface p-5 shadow-card">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Error</Badge>
                  <span className="text-sm text-cc-text-secondary">{error}</span>
                </div>
              </div>
            )}

            {/* Bulk Actions Bar */}
            <ErrorBoundary level="component">
              <BulkActionsBar
                selectedAccounts={selectedAccounts}
                onSelectionClear={handleSelectionClear}
                onBulkAction={handleBulkAction}
              />
            </ErrorBoundary>

            {/* Results */}
            <ErrorBoundary level="component">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-cc-text-primary">
                    Accounts <span className="cc-num text-cc-text-muted">({accounts.length})</span>
                  </h2>
                  {accounts.length > 0 && (
                    <SectionLabel>
                      <span className="cc-num">{accounts.length}</span> shown
                    </SectionLabel>
                  )}
                </div>

                <AccountList
                  accounts={accounts}
                  loading={loading}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  selectedAccounts={selectedAccounts}
                  onAccountSelection={handleAccountSelection}
                />
              </div>
            </ErrorBoundary>
          </div>
        ) : (
          /* Leads Tab */
          <div className="space-y-6">
            <div role="group" aria-label="Switch lead view" className="inline-flex rounded-cc-md bg-cc-surface-raised p-0.5">
              {LEAD_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setLeadTab(t.value)}
                  aria-pressed={leadTab === t.value}
                  className={cn(
                    'rounded-[10px] px-3 py-1.5 text-sm transition-colors duration-fast',
                    leadTab === t.value
                      ? 'bg-cc-surface-overlay text-cc-text-primary'
                      : 'text-cc-text-muted hover:text-cc-text-secondary',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {leadTab === 'list' ? (
              <ErrorBoundary level="component">
                <LeadList />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary level="component">
                <LeadAnalyticsDashboard />
              </ErrorBoundary>
            )}
          </div>
        )}

        {/* Account Form Dialog */}
        <ErrorBoundary level="component">
          <AccountForm
            open={showAccountForm || !!editingAccount}
            onOpenChange={(open) => {
              setShowAccountForm(open);
              if (!open) setEditingAccount(null);
            }}
            onSubmit={editingAccount ? (handleEditAccount) : (handleCreateAccount)}
            account={editingAccount}
            loading={formLoading}
          />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
});

CRMContent.displayName = 'CRMContent';

export default function CRM() {
  return (
    <ErrorBoundary level="page" resetOnPropsChange>
      <Suspense fallback={<CRMPageSkeleton />}>
        <CRMContent />
      </Suspense>
    </ErrorBoundary>
  );
}
