import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { KPICards } from "@/components/ao-renewals/analytics/KPICards";
import { PipelineFunnelChart } from "@/components/ao-renewals/analytics/PipelineFunnelChart";
import { PriorityDistributionChart } from "@/components/ao-renewals/analytics/PriorityDistributionChart";
import { MonthlyForecastChart } from "@/components/ao-renewals/analytics/MonthlyForecastChart";
import { AtRiskRenewalsTable } from "@/components/ao-renewals/analytics/AtRiskRenewalsTable";
import { PremiumAnalytics } from "@/components/ao-renewals/analytics/PremiumAnalytics";
import {
  useAOAnalyticsKPIs,
  useAOPipelineData,
  useAOPriorityData,
  useAOMonthlyForecast,
  useAOAtRiskRenewals,
} from "@/hooks/useAOAnalytics";
import { useAORenewals } from "@/hooks/useAORenewals";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export default function AOAnalyticsDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: kpiData, isLoading: kpiLoading } = useAOAnalyticsKPIs();
  const { data: pipelineData, isLoading: pipelineLoading } = useAOPipelineData();
  const { data: priorityData, isLoading: priorityLoading } = useAOPriorityData();
  const { data: forecastData, isLoading: forecastLoading } = useAOMonthlyForecast();
  const { data: atRiskData, isLoading: atRiskLoading } = useAOAtRiskRenewals();
  const { data: renewalsData, isLoading: renewalsLoading } = useAORenewals();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["ao-analytics-kpis"] });
    queryClient.invalidateQueries({ queryKey: ["ao-pipeline-summary"] });
    queryClient.invalidateQueries({ queryKey: ["ao-priority-summary"] });
    queryClient.invalidateQueries({ queryKey: ["ao-monthly-forecast"] });
    queryClient.invalidateQueries({ queryKey: ["ao-at-risk-renewals"] });
    toast({
      title: "Refreshed",
      description: "Analytics data has been updated",
    });
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    toast({
      title: "Export",
      description: "Export functionality coming soon",
    });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/ao-renewals")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Auto-Owners Renewal Analytics</h1>
              <p className="text-muted-foreground">
                Comprehensive insights and metrics for renewal pipeline
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        {kpiData && <KPICards data={kpiData} isLoading={kpiLoading} />}

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PipelineFunnelChart data={pipelineData as any || []} isLoading={pipelineLoading} />
          <PriorityDistributionChart data={priorityData as any || []} isLoading={priorityLoading} />
        </div>

        {/* Monthly Forecast - Full Width */}
        <MonthlyForecastChart data={forecastData as any || []} isLoading={forecastLoading} />

        {/* Premium Analytics */}
        <PremiumAnalytics data={renewalsData || []} isLoading={renewalsLoading} />

        {/* At-Risk Renewals Table */}
        <AtRiskRenewalsTable data={atRiskData as any || []} isLoading={atRiskLoading} />

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
          <div>Last updated: {new Date().toLocaleString()}</div>
          <div>
            Total Renewals: {kpiData?.totalRenewals || 0} | Total Premium:{" "}
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
            }).format(kpiData?.totalPremium || 0)}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
