import React, { useState, useMemo, useCallback, memo, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, Building2, TrendingUp } from 'lucide-react';
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
import { memoize } from '@/lib/performance';
import { logger } from '@/lib/logger';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { SearchResult } from '@/hooks/useGlobalSearch';
import { addToRecentlyAccessed } from '@/components/crm/RecentlyAccessed';
import type { 
  CRMFilters, 
  SavedView, 
  BulkAction,
  Account,
  CreateAccountData
} from '@/types/crm-enhanced-clean';

// Memoized stats calculation
const calculateStats = memoize((accounts: any[]) => {
  const isHousehold = (a: any) => {
    const type = a.type?.toLowerCase() || '';
    const accountType = a.account_type?.toLowerCase() || '';
    return accountType === 'individual' || type === 'household' || type === 'individual' || type === 'personal';
  };

  const isBusiness = (a: any) => {
    const type = a.type?.toLowerCase() || '';
    const accountType = a.account_type?.toLowerCase() || '';
    return accountType === 'business' || 
           type === 'business' || 
           type === 'commercial' || 
           type === 'commercial_business' ||
           type === 'corporate';
  };

  return {
    totalAccounts: accounts.length,
    householdAccounts: accounts.filter(isHousehold).length,
    businessAccounts: accounts.filter(isBusiness).length,
  };
});

// Memoized stats cards component
const StatsCards = memo(({ accounts }: { accounts: any[] }) => {
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
  
  const { canEdit, canViewAuditLogs } = usePermissions();

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
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Customer Relationship Management</h2>
            <p className="text-muted-foreground">
              Manage customer accounts, contacts, and relationships with advanced data quality tools
            </p>
          </div>
          <div className="flex items-center space-x-2">
            {canEdit && (
              <Button onClick={() => setShowAccountForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Account
              </Button>
            )}
          </div>
        </div>

        {/* Global Search */}
        <ErrorBoundary level="component">
          <Card>
            <CardContent className="pt-6">
              <GlobalSearch 
                onResultSelect={handleGlobalSearchSelect}
                placeholder="Search customers, insureds, accounts, businesses..."
              />
            </CardContent>
          </Card>
        </ErrorBoundary>

        {/* Recently Accessed */}
        <ErrorBoundary level="component">
          <RecentlyAccessed />
        </ErrorBoundary>

        {/* Main Tabs */}
        <Tabs defaultValue="accounts" className="space-y-6">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
          </TabsList>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="space-y-6">
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
          </TabsContent>

          {/* Leads Tab */}
          <TabsContent value="leads" className="space-y-6">
            <Tabs defaultValue="list" className="space-y-6">
              <TabsList>
                <TabsTrigger value="list">Lead List</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
              </TabsList>

              <TabsContent value="list">
                <ErrorBoundary level="component">
                  <LeadList />
                </ErrorBoundary>
              </TabsContent>

              <TabsContent value="analytics">
                <ErrorBoundary level="component">
                  <LeadAnalyticsDashboard />
                </ErrorBoundary>
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>

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