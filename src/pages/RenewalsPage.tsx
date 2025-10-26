import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, AlertTriangle, RefreshCw, Download, Brain } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { RenewalsList } from '@/components/renewals/RenewalsList';
import { RenewalsStats } from '@/components/renewals/RenewalsStats';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRenewals, useRenewalsStats } from '@/hooks/useRenewals';
import { useToast } from '@/hooks/use-toast';

export default function RenewalsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('upcoming');
  
  const { 
    data: upcomingRenewals = [], 
    isLoading: loadingUpcoming, 
    refetch: refetchUpcoming 
  } = useRenewals('upcoming');
  
  const { 
    data: expiredPolicies = [], 
    isLoading: loadingExpired, 
    refetch: refetchExpired 
  } = useRenewals('expired');
  
  const { data: stats, isLoading: statsLoading } = useRenewalsStats();

  const handleRefresh = () => {
    refetchUpcoming();
    refetchExpired();
    toast({
      title: "Refreshed",
      description: "Renewals data has been refreshed",
    });
  };

  const handleExport = () => {
    toast({
      title: "Export Started",
      description: "Renewals report will be available for download shortly",
    });
  };

  const handlePolicySelect = (policyId: string) => {
    navigate(`/policies/${policyId}`);
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Renewals Management</h1>
            <p className="text-muted-foreground">
              Track upcoming renewals and expired policies that need attention
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={() => navigate('/renewals/intelligence')}>
              <Brain className="h-4 w-4 mr-2" />
              AI Intelligence
            </Button>
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingUpcoming || loadingExpired ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <RenewalsStats stats={stats} loading={statsLoading} />

        {/* Renewals Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Upcoming Renewals
              {stats?.upcoming && (
                <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full">
                  {stats.upcoming}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="expired" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Expired Policies
              {stats?.expired && (
                <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-full">
                  {stats.expired}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Policies expiring within the next 30 days
            </div>
            <RenewalsList
              policies={upcomingRenewals}
              type="upcoming"
              loading={loadingUpcoming}
              onPolicySelect={handlePolicySelect}
            />
          </TabsContent>

          <TabsContent value="expired" className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Policies that have already expired and need renewal
            </div>
            <RenewalsList
              policies={expiredPolicies}
              type="expired"
              loading={loadingExpired}
              onPolicySelect={handlePolicySelect}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}