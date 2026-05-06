import React, { Suspense, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { DashboardSkeleton } from '@/components/ui/skeleton-components';
import { BookOfBusinessTab } from '@/components/dashboard/BookOfBusinessTab';
import { PoliciesQuotesTab } from '@/components/dashboard/PoliciesQuotesTab';
import { AIInsightsCard } from '@/components/dashboard/AIInsightsCard';
import { AIKnowledgeSearch } from '@/components/dashboard/AIKnowledgeSearch';
import { UpcomingTasksCard } from '@/components/dashboard/UpcomingTasksCard';
import { CanopyStatsCard } from '@/components/canopy/CanopyStatsCard';
import { DashboardGlobalSearch } from '@/components/dashboard/DashboardGlobalSearch';

const DashboardContent = React.memo(() => {
  const { profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'book-of-business' | 'policies-quotes'>('book-of-business');

  if (authLoading) {
    return (
      <AppLayout>
        <DashboardSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome back, {profile?.full_name || 'User'}! Here's your business overview.
          </p>
        </div>
      </div>

      {/* Upcoming Tasks and Canopy Stats */}
      <div className="grid gap-6 md:grid-cols-2">
        <ErrorBoundary level="component">
          <UpcomingTasksCard />
        </ErrorBoundary>
        <ErrorBoundary level="component">
          <CanopyStatsCard />
        </ErrorBoundary>
      </div>

      {/* Prominent Global Search */}
      <ErrorBoundary level="component">
        <DashboardGlobalSearch />
      </ErrorBoundary>

      {/* AI Knowledge Search */}
      <ErrorBoundary level="component">
        <AIKnowledgeSearch />
      </ErrorBoundary>
      
      {/* Tab Navigation */}
      <div className="flex space-x-4 border-b border-border">
        <Button
          variant={activeTab === 'book-of-business' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('book-of-business')}
          className="rounded-b-none border-b-2 border-transparent data-[active=true]:border-primary"
          data-active={activeTab === 'book-of-business'}
        >
          Book of Business
        </Button>
        <Button
          variant={activeTab === 'policies-quotes' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('policies-quotes')}
          className="rounded-b-none border-b-2 border-transparent data-[active=true]:border-primary"
          data-active={activeTab === 'policies-quotes'}
        >
          Policies / Quotes
        </Button>
      </div>

      {/* AI Insights */}
      <div className="mt-6">
        <ErrorBoundary level="component">
          <AIInsightsCard />
        </ErrorBoundary>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        <ErrorBoundary level="component">
          {activeTab === 'book-of-business' ? (
            <BookOfBusinessTab />
          ) : (
            <PoliciesQuotesTab />
          )}
        </ErrorBoundary>
      </div>
      </div>
    </AppLayout>
  );
});

DashboardContent.displayName = 'DashboardContent';

export default function Dashboard() {
  return (
    <ErrorBoundary level="page" resetOnPropsChange>
      <Suspense fallback={
        <AppLayout>
          <DashboardSkeleton />
        </AppLayout>
      }>
        <DashboardContent />
      </Suspense>
    </ErrorBoundary>
  );
}