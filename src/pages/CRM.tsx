import React, { useState, useMemo, useCallback, memo, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Building2, TrendingUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountSearch } from '@/components/crm/AccountSearch';
import { AccountList } from '@/components/crm/AccountList';
import { AccountForm } from '@/components/crm/AccountForm';
import { SavedViewsManager } from '@/components/crm/SavedViewsManager';
import { BulkActionsBar } from '@/components/crm/BulkActionsBar';
import { DuplicateDetection } from '@/components/crm/DuplicateDetection';
import { CSVImport } from '@/components/crm/CSVImport';
import { SecurityStatus } from '@/components/crm/SecurityStatus';
import { useCRMData } from '@/hooks/useCRMData';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { CRMPageSkeleton } from '@/components/ui/skeleton-components';
import { memoize } from '@/lib/performance';
import type { 
  CRMFilters, 
  Account, 
  SavedView, 
  BulkAction,
  CreateAccountData,
  UpdateAccountData
} from '@/types/crm-enhanced';

// Memoized stats calculation
const calculateStats = memoize((accounts: Account[]) => ({
  totalAccounts: accounts.length,
  householdAccounts: accounts.filter(a => a.type === 'household').length,
  businessAccounts: accounts.filter(a => a.type === 'business').length,
}));

// Memoized stats cards component
const StatsCards = memo(({ accounts }: { accounts: Account[] }) => {
  const stats = useMemo(() => calculateStats(accounts), [accounts]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalAccounts}</div>
          <p className="text-xs text-muted-foreground">
            Active customer accounts
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Households</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.householdAccounts}</div>
          <p className="text-xs text-muted-foreground">
            Personal/family accounts
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Businesses</CardTitle>
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.businessAccounts}</div>
          <p className="text-xs text-muted-foreground">
            Commercial accounts
          </p>
        </CardContent>
      </Card>
    </div>
  );
});

StatsCards.displayName = 'StatsCards';

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

  const [filters, setFilters] = useState<CRMFilters>({});
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<Account[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

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

  const handleEditAccount = useCallback(async (data: UpdateAccountData) => {
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
    // TODO: Implement bulk action processing via edge function or RPC
    if (import.meta.env.DEV) {
      console.warn('Bulk action in development mode:', action);
    }
  }, []);

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

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Customer Relationship Management</h2>
            <p className="text-muted-foreground">
              Manage customer accounts, contacts, and relationships with advanced data quality tools
            </p>
          </div>
          <Button onClick={() => setShowAccountForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Account
          </Button>
        </div>

        {/* Stats Cards */}
        <ErrorBoundary level="component">
          <StatsCards accounts={accounts} />
        </ErrorBoundary>

        {/* Saved Views */}
        <ErrorBoundary level="component">
          <Card>
            <CardContent className="pt-6">
              <SavedViewsManager
                currentFilters={filters}
                savedViews={savedViews}
                onViewSelect={handleViewSelect}
                onViewSave={handleViewSave}
                onViewDelete={handleViewDelete}
              />
            </CardContent>
          </Card>
        </ErrorBoundary>

        {/* Data Quality Tools */}
        <div className="grid gap-6 md:grid-cols-3">
          <ErrorBoundary level="component">
            <DuplicateDetection onMergeComplete={handleRefreshAccounts} />
          </ErrorBoundary>
          <ErrorBoundary level="component">
            <CSVImport onImportComplete={handleRefreshAccounts} />
          </ErrorBoundary>
          <ErrorBoundary level="component">
            <SecurityStatus />
          </ErrorBoundary>
        </div>

        {/* Search and Filters */}
        <ErrorBoundary level="component">
          <Card>
            <CardHeader>
              <CardTitle>Search Accounts</CardTitle>
              <CardDescription>
                Find customer accounts by name, phone, email, or other criteria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountSearch
                filters={filters}
                onFiltersChange={setFilters}
                onSearch={debouncedSearch}
                loading={loading}
              />
            </CardContent>
          </Card>
        </ErrorBoundary>

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Badge variant="destructive">Error</Badge>
                <span className="text-sm">{error}</span>
              </div>
            </CardContent>
          </Card>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">
                Accounts ({accounts.length})
              </h3>
              {accounts.length > 0 && (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>Showing {accounts.length} accounts</span>
                </div>
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

        {/* Account Form Dialog */}
        <ErrorBoundary level="component">
          <AccountForm
            open={showAccountForm || !!editingAccount}
            onOpenChange={(open) => {
              setShowAccountForm(open);
              if (!open) setEditingAccount(null);
            }}
            onSubmit={editingAccount ? handleEditAccount : handleCreateAccount}
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