// ============================================================================
// CANOPY IMPORT PAGE
// ============================================================================
// Dedicated page for importing insurance data via Canopy Connect
// Supports both creating new leads and attaching to existing accounts
// ============================================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CanopyConnectButton } from '@/components/canopy/CanopyConnectButton';
import { useCanopyPolicies, CanopyPullResult } from '@/hooks/useCanopyConnect';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Shield,
  UserPlus,
  Building,
  Search,
  Car,
  Home,
  Umbrella,
  FileText,
  CheckCircle,
  ArrowRight,
  Clock,
  AlertCircle,
} from 'lucide-react';

type ImportMode = 'create_lead' | 'attach_account';

interface AccountSearchResult {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export default function CanopyImportPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ImportMode>('create_lead');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountSearch, setAccountSearch] = useState('');
  const [completedPullId, setCompletedPullId] = useState<string | null>(null);

  // Search for accounts
  const { data: accounts, isLoading: isSearching } = useQuery({
    queryKey: ['accounts-search', accountSearch],
    queryFn: async () => {
      if (!accountSearch || accountSearch.length < 2) return [];

      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, type, created_at')
        .ilike('name', `%${accountSearch}%`)
        .limit(10);

      if (error) throw error;
      return data as AccountSearchResult[];
    },
    enabled: mode === 'attach_account' && accountSearch.length >= 2,
  });

  // Get recent imports
  const { data: recentImports } = useQuery({
    queryKey: ['canopy-recent-imports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canopy_pulls')
        .select(`
          id,
          canopy_pull_id,
          status,
          policy_count,
          carrier_count,
          created_at,
          completed_at,
          lead_id,
          account_id,
          error_message
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
  });

  // Get policies for completed pull
  const { policies: importedPolicies, isLoading: isPoliciesLoading } = useCanopyPolicies(completedPullId);

  const handleImportComplete = (result: CanopyPullResult) => {
    setCompletedPullId(result.pullId);

    // If a new lead was created, offer to navigate to it
    if (result.leadId) {
      // You could show a toast or modal here
    }
  };

  const handleViewLead = (leadId: string) => {
    navigate(`/leads/${leadId}`);
  };

  const handleViewAccount = (accountId: string) => {
    navigate(`/customers/${accountId}`);
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Import Insurance Data</h1>
          <p className="text-muted-foreground">
            Import verified insurance data from 400+ carriers using Canopy Connect
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Import Card */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Start New Import</CardTitle>
              <CardDescription>
                Choose how you want to use the imported insurance data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mode Selection */}
              <RadioGroup
                value={mode}
                onValueChange={(v) => {
                  setMode(v as ImportMode);
                  setSelectedAccountId(null);
                }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label
                    htmlFor="mode-create"
                    className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      mode === 'create_lead'
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/20'
                    }`}
                  >
                    <RadioGroupItem value="create_lead" id="mode-create" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <UserPlus className="w-4 h-4" />
                        <span className="font-medium">Create New Lead</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Import data and automatically create a new qualified lead in the CRM
                      </p>
                    </div>
                  </label>

                  <label
                    htmlFor="mode-attach"
                    className={`flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      mode === 'attach_account'
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/20'
                    }`}
                  >
                    <RadioGroupItem value="attach_account" id="mode-attach" className="mt-1" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Building className="w-4 h-4" />
                        <span className="font-medium">Attach to Account</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Link imported data to an existing customer account for renewals
                      </p>
                    </div>
                  </label>
                </div>
              </RadioGroup>

              {/* Account Search (if attach mode) */}
              {mode === 'attach_account' && (
                <div className="space-y-4">
                  <Separator />
                  <div className="space-y-2">
                    <Label>Search for Account</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Type to search accounts..."
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Search Results */}
                  {accounts && accounts.length > 0 && (
                    <ScrollArea className="h-48 rounded-md border">
                      <div className="p-2 space-y-1">
                        {accounts.map((account) => (
                          <button
                            key={account.id}
                            onClick={() => setSelectedAccountId(account.id)}
                            className={`w-full flex items-center justify-between p-3 rounded-md text-left transition-colors ${
                              selectedAccountId === account.id
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted'
                            }`}
                          >
                            <div>
                              <p className="font-medium">{account.name}</p>
                              <p className={`text-sm ${selectedAccountId === account.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                                {account.type} · Created {new Date(account.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            {selectedAccountId === account.id && (
                              <CheckCircle className="w-5 h-5" />
                            )}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  )}

                  {isSearching && (
                    <p className="text-sm text-muted-foreground">Searching...</p>
                  )}

                  {accountSearch.length >= 2 && accounts?.length === 0 && !isSearching && (
                    <p className="text-sm text-muted-foreground">No accounts found</p>
                  )}
                </div>
              )}

              <Separator />

              {/* Import Button */}
              <div className="flex flex-col items-center gap-4 py-4">
                <CanopyConnectButton
                  mode={mode}
                  accountId={mode === 'attach_account' ? selectedAccountId || undefined : undefined}
                  onComplete={handleImportComplete}
                  size="lg"
                  className="w-full md:w-auto"
                  disabled={mode === 'attach_account' && !selectedAccountId}
                />
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  You&apos;ll be redirected to securely connect with the customer&apos;s insurance carrier.
                  No login credentials are stored by Lewis Insurance.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Imported Data Preview */}
          {completedPullId && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Import Complete
                </CardTitle>
                <CardDescription>
                  Here&apos;s what was imported from the customer&apos;s insurance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isPoliciesLoading ? (
                  <p className="text-muted-foreground">Loading imported data...</p>
                ) : importedPolicies.length > 0 ? (
                  <div className="space-y-4">
                    {importedPolicies.map((policy: any) => (
                      <div key={policy.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {policy.policy_type === 'auto' && <Car className="w-4 h-4" />}
                            {policy.policy_type === 'home' && <Home className="w-4 h-4" />}
                            {policy.policy_type === 'umbrella' && <Umbrella className="w-4 h-4" />}
                            <span className="font-medium capitalize">{policy.policy_type} Insurance</span>
                          </div>
                          <Badge variant={policy.status === 'active' ? 'default' : 'secondary'}>
                            {policy.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Carrier</p>
                            <p className="font-medium">{policy.carrier_name}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Premium</p>
                            <p className="font-medium">
                              ${policy.premium_amount?.toLocaleString()}/{policy.premium_frequency || 'year'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Expiration</p>
                            <p className="font-medium">
                              {policy.expiration_date
                                ? new Date(policy.expiration_date).toLocaleDateString()
                                : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Details</p>
                            <p className="font-medium">
                              {policy.canopy_vehicles?.length || 0} vehicles,{' '}
                              {policy.canopy_drivers?.length || 0} drivers
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No policies found in this import</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">
                    1
                  </span>
                  <div>
                    <p className="font-medium">Customer Connects</p>
                    <p className="text-sm text-muted-foreground">
                      Securely log into their insurance carrier portal
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">
                    2
                  </span>
                  <div>
                    <p className="font-medium">Data Extracted</p>
                    <p className="text-sm text-muted-foreground">
                      Policy, vehicle, driver, and coverage info is pulled
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-sm">
                    3
                  </span>
                  <div>
                    <p className="font-medium">Ready for Quoting</p>
                    <p className="text-sm text-muted-foreground">
                      Pre-filled data enables instant comparison quotes
                    </p>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>

          {/* Recent Imports */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Imports</CardTitle>
            </CardHeader>
            <CardContent>
              {recentImports && recentImports.length > 0 ? (
                <div className="space-y-3">
                  {recentImports.map((pull) => (
                    <div
                      key={pull.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {pull.status === 'complete' && (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        {pull.status === 'error' && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        {!['complete', 'error'].includes(pull.status) && (
                          <Clock className="w-4 h-4 text-yellow-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {pull.policy_count || 0} policies
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(pull.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {pull.lead_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewLead(pull.lead_id!)}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                      {pull.account_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewAccount(pull.account_id!)}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No recent imports</p>
              )}
            </CardContent>
          </Card>

          {/* Supported Carriers */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">400+ Carriers Supported</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {['State Farm', 'Geico', 'Progressive', 'Allstate', 'Liberty Mutual', 'USAA', 'Farmers', 'Nationwide', '+392 more'].map((carrier) => (
                  <Badge key={carrier} variant="secondary" className="text-xs">
                    {carrier}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
