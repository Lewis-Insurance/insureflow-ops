import { useState } from 'react';
import { ConversionFunnelChart } from './ConversionFunnelChart';
import { SourcePerformanceChart } from './SourcePerformanceChart';
import { LeadTrendsChart } from './LeadTrendsChart';
import { ScoreDistributionChart } from './ScoreDistributionChart';
import { useLeadMetrics, usePipelineVelocity } from '@/hooks/useLeadAnalytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, Clock, Target } from 'lucide-react';
import { subDays } from 'date-fns';

export function LeadAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | undefined>();
  const { data: metrics } = useLeadMetrics(dateRange);
  const { data: velocity } = usePipelineVelocity();

  const quickDateRanges = [
    { label: 'Last 7 days', getValue: () => ({ start: subDays(new Date(), 7).toISOString(), end: new Date().toISOString() }) },
    { label: 'Last 30 days', getValue: () => ({ start: subDays(new Date(), 30).toISOString(), end: new Date().toISOString() }) },
    { label: 'Last 90 days', getValue: () => ({ start: subDays(new Date(), 90).toISOString(), end: new Date().toISOString() }) },
    { label: 'This year', getValue: () => ({ start: new Date(new Date().getFullYear(), 0, 1).toISOString(), end: new Date().toISOString() }) },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Lead Analytics</h2>
          <p className="text-muted-foreground">
            Comprehensive insights into your lead pipeline performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Date Ranges */}
          <div className="flex gap-2">
            {quickDateRanges.map((range) => (
              <Button
                key={range.label}
                variant="outline"
                size="sm"
                onClick={() => setDateRange(range.getValue())}
              >
                {range.label}
              </Button>
            ))}
            {dateRange && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDateRange(undefined)}
              >
                Clear
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.conversion_rate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics?.won_leads} of {metrics?.total_leads} leads won
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Time to Win</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {velocity?.overall || 0} days
            </div>
            <p className="text-xs text-muted-foreground">
              From new lead to closed deal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics?.total_pipeline_value.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Active qualified leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.average_score.toFixed(0)}/100
            </div>
            <p className="text-xs text-muted-foreground">
              Quality indicator
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ConversionFunnelChart dateRange={dateRange} />
        <LeadTrendsChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SourcePerformanceChart dateRange={dateRange} />
        </div>
        <ScoreDistributionChart />
      </div>
    </div>
  );
}
