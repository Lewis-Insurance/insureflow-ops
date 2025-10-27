import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeadMetrics } from "@/hooks/useLeadAnalytics";
import { TrendingUp, Users, Target, DollarSign } from "lucide-react";
import { ConversionFunnelChart } from "./ConversionFunnelChart";
import { LeadTrendsChart } from "./LeadTrendsChart";
import { ScoreDistributionChart } from "./ScoreDistributionChart";
import { SourcePerformanceChart } from "./SourcePerformanceChart";
import { VelocityMetricsCard } from "./VelocityMetricsCard";
import { ProducerLeaderboard } from "./ProducerLeaderboard";
import { InsuranceTypePerformance } from "./InsuranceTypePerformance";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const LeadAnalyticsDashboard = ({ filters }: { filters?: any }) => {
  const { data: metrics, isLoading } = useLeadMetrics();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total_leads}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.new_leads} new
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.conversion_rate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.won_leads} won / {metrics.total_leads} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.average_score.toFixed(0)}/100</div>
            <p className="text-xs text-muted-foreground">
              Quality indicator
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.total_pipeline_value.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Active pipeline
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Analytics */}
      <Tabs defaultValue="funnel" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="funnel">Funnel</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
        </TabsList>

        <TabsContent value="funnel" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ConversionFunnelChart />
            <ScoreDistributionChart />
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <LeadTrendsChart />
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <SourcePerformanceChart />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-1">
            <ProducerLeaderboard />
            <InsuranceTypePerformance />
          </div>
        </TabsContent>

        <TabsContent value="velocity" className="space-y-4">
          <VelocityMetricsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
};
