import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, RefreshCw } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PolicySearch } from '@/components/policies/PolicySearch';
import { PolicyList } from '@/components/policies/PolicyList';
import { PolicyStats } from '@/components/policies/PolicyStats';
import { Button } from '@/components/ui/button';
import { usePolicies, usePolicyStats, type PolicyFilters, type PolicyWithAccount } from '@/hooks/usePolicies';
import { useToast } from '@/hooks/use-toast';
import { AddPolicyModal } from '@/components/customers/AddPolicyModal';
import { ClientSelector } from '@/components/client/ClientSelector';

export default function PoliciesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [filters, setFilters] = useState<PolicyFilters>({});
  const [addPolicyOpen, setAddPolicyOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  
  const { data: policies = [], isLoading, refetch } = usePolicies(filters);
  const { data: stats, isLoading: statsLoading } = usePolicyStats();

  const handleFiltersChange = (newFilters: PolicyFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({});
  };

  const handlePolicySelect = (policy: PolicyWithAccount) => {
    navigate(`/policies/${policy.id}`);
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshed",
      description: "Policy data has been refreshed",
    });
  };

  const handleExport = () => {
    // Implement CSV export functionality
    toast({
      title: "Export Started",
      description: "Policy data export will be available for download shortly",
    });
  };

  const handleCreatePolicy = () => {
    setAddPolicyOpen(true);
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
            <p className="text-muted-foreground">
              Search and manage insurance policies across all carriers and lines of business
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={handleCreatePolicy} disabled={!selectedClient?.id}>
              <Plus className="h-4 w-4 mr-2" />
              New Policy
            </Button>
          </div>
        </div>

        {/* Create Policy (select client first) */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-[520px]">
            <ClientSelector
              selectedClient={selectedClient}
              onSelect={setSelectedClient}
              placeholder="Select a client to create a policy..."
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {selectedClient?.id ? 'Client selected' : 'Select a client to enable policy creation'}
          </div>
        </div>

        {/* Search and Filters */}
        <PolicySearch
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onClearFilters={handleClearFilters}
        />

        {/* Stats Overview */}
        <PolicyStats stats={stats} loading={statsLoading} />

        {/* Policy List */}
        <PolicyList
          policies={policies}
          loading={isLoading}
          onPolicySelect={handlePolicySelect}
        />

        <AddPolicyModal
          open={addPolicyOpen}
          onOpenChange={setAddPolicyOpen}
          accountId={selectedClient?.id || ''}
          onSuccess={() => {
            toast({ title: 'Policy created', description: 'Policy added successfully' });
            refetch();
          }}
        />
      </div>
    </AppLayout>
  );
}