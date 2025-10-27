import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { LeadAnalyticsDashboard } from "@/components/leads/analytics/LeadAnalyticsDashboard";
import { PipelineKanban } from "@/components/leads/PipelineKanban";
import { ProducerSalesDashboard } from "@/components/leads/ProducerSalesDashboard";
import { QuickLeadCapture } from "@/components/leads/QuickLeadCapture";
import { LeadDetailView } from "@/components/leads/LeadDetailView";
import { LayoutGrid, BarChart3, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Leads() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const { user } = useAuth();

  const openLeadDetail = (leadId: string) => {
    setSelectedLeadId(leadId);
    setDetailViewOpen(true);
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Lead Management</h1>
            <p className="text-muted-foreground">
              Track and manage your sales pipeline
            </p>
          </div>
          <QuickLeadCapture />
        </div>

        <Tabs defaultValue="pipeline" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="pipeline">
              <LayoutGrid className="mr-2 h-4 w-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="producer">
              <Users className="mr-2 h-4 w-4" />
              My Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pipeline" className="mt-6">
            <PipelineKanban />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <LeadAnalyticsDashboard />
          </TabsContent>

          <TabsContent value="producer" className="mt-6">
            <ProducerSalesDashboard
              producerId={user?.id || ""}
              producerName={user?.user_metadata?.full_name || "Your Name"}
            />
          </TabsContent>
        </Tabs>

        <LeadDetailView
          leadId={selectedLeadId}
          open={detailViewOpen}
          onOpenChange={setDetailViewOpen}
        />
      </div>
    </AppLayout>
  );
}
