import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeads } from "@/hooks/useLeads";
import { TrendingUp, Users, Target, DollarSign } from "lucide-react";
import { useMemo } from "react";

export const LeadAnalyticsDashboard = () => {
  const { data: leads, isLoading } = useLeads();

  const metrics = useMemo(() => {
    if (!leads) return null;

    const total = leads.length;
    const newLeads = leads.filter(l => l.status === 'new').length;
    const contacted = leads.filter(l => l.status === 'contacted').length;
    const qualified = leads.filter(l => l.status === 'qualified').length;
    const quoted = leads.filter(l => l.status === 'quoted').length;
    const won = leads.filter(l => l.status === 'won').length;
    const lost = leads.filter(l => l.status === 'lost').length;

    const conversionRate = total > 0 ? ((won / total) * 100).toFixed(1) : '0';
    const avgScore = total > 0 
      ? (leads.reduce((sum, l) => sum + l.lead_score, 0) / total).toFixed(0)
      : '0';

    const estimatedValue = leads
      .filter(l => l.current_premium)
      .reduce((sum, l) => sum + (l.current_premium || 0), 0);

    return {
      total,
      newLeads,
      contacted,
      qualified,
      quoted,
      won,
      lost,
      conversionRate,
      avgScore,
      estimatedValue,
    };
  }, [leads]);

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
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Leads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.newLeads} new this month
            </p>
          </CardContent>
        </Card>

        {/* Conversion Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics.won} won / {metrics.total} total
            </p>
          </CardContent>
        </Card>

        {/* Average Lead Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.avgScore}/100</div>
            <p className="text-xs text-muted-foreground">
              Quality indicator
            </p>
          </CardContent>
        </Card>

        {/* Pipeline Value */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.estimatedValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated annual premium
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Stages */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { label: 'New', count: metrics.newLeads, color: 'bg-blue-500' },
              { label: 'Contacted', count: metrics.contacted, color: 'bg-yellow-500' },
              { label: 'Qualified', count: metrics.qualified, color: 'bg-purple-500' },
              { label: 'Quoted', count: metrics.quoted, color: 'bg-orange-500' },
              { label: 'Won', count: metrics.won, color: 'bg-green-500' },
              { label: 'Lost', count: metrics.lost, color: 'bg-red-500' },
            ].map((stage) => (
              <div key={stage.label} className="flex items-center">
                <div className="w-24 text-sm font-medium">{stage.label}</div>
                <div className="flex-1 mx-4">
                  <div className="h-8 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stage.color} flex items-center justify-end px-2`}
                      style={{
                        width: `${metrics.total > 0 ? (stage.count / metrics.total) * 100 : 0}%`,
                      }}
                    >
                      {stage.count > 0 && (
                        <span className="text-xs font-semibold text-white">
                          {stage.count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="w-16 text-right text-sm text-muted-foreground">
                  {metrics.total > 0
                    ? ((stage.count / metrics.total) * 100).toFixed(0)
                    : 0}%
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
