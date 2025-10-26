import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeadList } from '@/components/crm/LeadList';
import { LeadAnalyticsDashboard } from '@/components/crm/LeadAnalyticsDashboard';
import { LeadCaptureForm } from '@/components/crm/LeadCaptureForm';
import { PipelineKanban } from '@/components/crm/PipelineKanban';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { UserPlus, BarChart3, List, Workflow } from 'lucide-react';

export default function Leads() {
  return (
    <AppLayout>
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
      <Tabs defaultValue="pipeline" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pipeline">
            <Workflow className="h-4 w-4 mr-2" />
            Pipeline
          </TabsTrigger>
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

        <TabsContent value="pipeline">
          <ErrorBoundary level="component">
            <PipelineKanban />
          </ErrorBoundary>
        </TabsContent>

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
    </AppLayout>
  );
}
