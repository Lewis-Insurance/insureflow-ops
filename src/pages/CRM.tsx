import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Building2, TrendingUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { AccountSearch } from '@/components/crm/AccountSearch';
import { AccountList } from '@/components/crm/AccountList';
import { AccountForm } from '@/components/crm/AccountForm';
import { useCRMData } from '@/hooks/useCRMData';
import type { CRMFilters, Account } from '@/types/crm';

export default function CRM() {
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

  const handleSearch = () => {
    fetchAccounts(filters);
  };

  const handleCreateAccount = async (data: any) => {
    setFormLoading(true);
    try {
      await createAccount(data);
      setShowAccountForm(false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEditAccount = async (data: any) => {
    if (!editingAccount) return;
    
    setFormLoading(true);
    try {
      await updateAccount(editingAccount.id, data);
      setEditingAccount(null);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
  };

  const handleDelete = async (accountId: string) => {
    await deleteAccount(accountId);
  };

  // Calculate stats
  const totalAccounts = accounts.length;
  const householdAccounts = accounts.filter(a => a.type === 'household').length;
  const businessAccounts = accounts.filter(a => a.type === 'business').length;

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Customer Relationship Management</h2>
            <p className="text-muted-foreground">
              Manage customer accounts, contacts, and relationships
            </p>
          </div>
          <Button onClick={() => setShowAccountForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Account
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalAccounts}</div>
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
              <div className="text-2xl font-bold">{householdAccounts}</div>
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
              <div className="text-2xl font-bold">{businessAccounts}</div>
              <p className="text-xs text-muted-foreground">
                Commercial accounts
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
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
              onSearch={handleSearch}
              loading={loading}
            />
          </CardContent>
        </Card>

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

        {/* Results */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">
              Accounts ({totalAccounts})
            </h3>
            {totalAccounts > 0 && (
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span>Showing {accounts.length} of {totalAccounts} accounts</span>
              </div>
            )}
          </div>

          <AccountList
            accounts={accounts}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>

        {/* Account Form Dialog */}
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
      </div>
    </AppLayout>
  );
}