// src/components/leads/ProducerWorkloadDashboard.tsx

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccountProducerWorkloads } from '@/hooks/useAssignmentRules';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TrendingUp, Users, DollarSign, CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ProducerWorkloadDashboardProps {
  accountId: string;
}

export function ProducerWorkloadDashboard({ accountId }: ProducerWorkloadDashboardProps) {
  const { data: workloads, isLoading, error } = useAccountProducerWorkloads(accountId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load workload data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!workloads || workloads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Producer Data Yet</h3>
          <p className="text-muted-foreground">
            Workload stats will appear once leads are assigned to producers
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate totals
  const totalActiveLeads = workloads.reduce((sum, w) => sum + w.active_leads_count, 0);
  const totalPipelineValue = workloads.reduce((sum, w) => sum + (w.total_pipeline_value || 0), 0);
  const avgLeadsPerProducer = totalActiveLeads / workloads.length;

  // Find max for progress bars
  const maxLeads = Math.max(...workloads.map(w => w.active_leads_count));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Active Leads</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActiveLeads}</div>
            <p className="text-xs text-muted-foreground">
              {avgLeadsPerProducer.toFixed(1)} avg per producer
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
              ${totalPipelineValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated total premium
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Producers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{workloads.length}</div>
            <p className="text-xs text-muted-foreground">
              With assigned leads
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Producer List */}
      <Card>
        <CardHeader>
          <CardTitle>Producer Workloads</CardTitle>
          <CardDescription>
            Current lead distribution across your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {workloads
              .sort((a, b) => b.active_leads_count - a.active_leads_count)
              .map((workload) => (
                <div key={workload.producer_id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          Producer {workload.producer_id.substring(0, 8)}...
                        </span>
                        {workload.active_leads_count === 0 && (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{workload.active_leads_count} active leads</span>
                        {workload.total_pipeline_value > 0 && (
                          <span>${workload.total_pipeline_value.toLocaleString()} pipeline</span>
                        )}
                        {workload.quoted_this_week > 0 && (
                          <span>{workload.quoted_this_week} quoted this week</span>
                        )}
                        {workload.won_this_month > 0 && (
                          <span>{workload.won_this_month} won this month</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{workload.active_leads_count}</div>
                      <div className="text-xs text-muted-foreground">leads</div>
                    </div>
                  </div>
                  <Progress
                    value={maxLeads > 0 ? (workload.active_leads_count / maxLeads) * 100 : 0}
                    className="h-2"
                  />
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Performance Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">This Week's Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {workloads
                .filter(w => w.quoted_this_week > 0)
                .sort((a, b) => b.quoted_this_week - a.quoted_this_week)
                .slice(0, 5)
                .map((workload) => (
                  <div key={workload.producer_id} className="flex items-center justify-between">
                    <span className="text-sm">
                      Producer {workload.producer_id.substring(0, 8)}...
                    </span>
                    <span className="text-sm font-medium">{workload.quoted_this_week}</span>
                  </div>
                ))}
              {workloads.filter(w => w.quoted_this_week > 0).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No quotes generated this week
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">This Month's Wins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {workloads
                .filter(w => w.won_this_month > 0)
                .sort((a, b) => b.won_this_month - a.won_this_month)
                .slice(0, 5)
                .map((workload) => (
                  <div key={workload.producer_id} className="flex items-center justify-between">
                    <span className="text-sm">
                      Producer {workload.producer_id.substring(0, 8)}...
                    </span>
                    <span className="text-sm font-medium">{workload.won_this_month}</span>
                  </div>
                ))}
              {workloads.filter(w => w.won_this_month > 0).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No wins recorded this month
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
