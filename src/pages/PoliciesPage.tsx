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

export default function PoliciesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [filters, setFilters] = useState<PolicyFilters>({});
  
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
    // Navigate to create policy page when implemented
    toast({
      title: "Coming Soon",
      description: "Policy creation will be available soon",
    });
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
            <Button onClick={handleCreatePolicy}>
              <Plus className="h-4 w-4 mr-2" />
              New Policy
            </Button>
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
      </div>
    </AppLayout>
  );
}