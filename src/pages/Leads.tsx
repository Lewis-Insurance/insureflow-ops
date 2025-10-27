import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadAnalyticsDashboard } from "@/components/leads/analytics/LeadAnalyticsDashboard";
import { PipelineKanban } from "@/components/leads/PipelineKanban";
import { ProducerSalesDashboard } from "@/components/leads/ProducerSalesDashboard";
import { QuickLeadCapture } from "@/components/leads/QuickLeadCapture";
import { LeadDetailView } from "@/components/leads/LeadDetailView";
import { LeadListView } from "@/components/leads/LeadListView";
import { LeadScoringAdmin } from "@/components/leads/LeadScoringAdmin";
import { LayoutGrid, BarChart3, Users, Search, Filter, List } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLeads } from "@/hooks/useLeads";
import { useDebounce } from "@/hooks/useDebounce";

export default function Leads() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detailViewOpen, setDetailViewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const { user } = useAuth();

  // Debounce search query to avoid too many API calls
  const debouncedSearch = useDebounce(searchQuery, 500);

  // Build filters for the leads query
  const filters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? [statusFilter] : undefined,
  };

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

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads by name, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="quoted">Quoted</SelectItem>
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="nurturing">Nurturing</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              {(searchQuery || statusFilter !== "all") && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="list">
              <List className="mr-2 h-4 w-4" />
              List
            </TabsTrigger>
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

          <TabsContent value="list" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <LeadListView />
              </div>
              <div className="space-y-6">
                <LeadScoringAdmin />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pipeline" className="mt-6">
            <PipelineKanban filters={filters} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <LeadAnalyticsDashboard filters={filters} />
          </TabsContent>

          <TabsContent value="producer" className="mt-6">
            <ProducerSalesDashboard
              producerId={user?.id || ""}
              producerName={user?.user_metadata?.full_name || "Your Name"}
              filters={filters}
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
