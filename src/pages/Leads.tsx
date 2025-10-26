import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeadList } from '@/components/crm/LeadList';
import { LeadAnalyticsDashboard } from '@/components/crm/LeadAnalyticsDashboard';
import { LeadCaptureForm } from '@/components/crm/LeadCaptureForm';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { UserPlus, BarChart3, List } from 'lucide-react';

export default function Leads() {
  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-8 w-8" />
          Leads Management
        </h2>
        <p className="text-muted-foreground">
          Manage and track your sales leads through the pipeline
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="list" className="space-y-6">
        <TabsList>
          <TabsTrigger value="list">
            <List className="h-4 w-4 mr-2" />
            Lead List
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="capture">
            <UserPlus className="h-4 w-4 mr-2" />
            Capture Form
          </TabsTrigger>
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

        <TabsContent value="capture">
          <ErrorBoundary level="component">
            <LeadCaptureForm />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
