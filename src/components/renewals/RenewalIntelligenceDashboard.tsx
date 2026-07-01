import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  useAtRiskRenewals, 
  useRenewalIntelligenceSummary,
  useBulkCalculateRisk 
} from '@/hooks/useRenewalIntelligence';
import { 
  AlertTriangle, 
  TrendingUp, 
  Calendar, 
  RefreshCw,
  ThumbsUp,
  Users
} from 'lucide-react';
import RenewalRiskCard from './RenewalRiskCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function RenewalIntelligenceDashboard() {
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  
  const { data: atRiskRenewals, isLoading: renewalsLoading } = useAtRiskRenewals();
  const { data: summary, isLoading: summaryLoading } = useRenewalIntelligenceSummary();
  const bulkCalculate = useBulkCalculateRisk();

  const filteredRenewals = atRiskRenewals?.filter(renewal => 
    selectedRiskLevel === 'all' || renewal.risk_level === selectedRiskLevel
  );

  const handleRecalculateAll = async () => {
    await bulkCalculate.mutateAsync();
  };

  if (summaryLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Renewals</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_renewals || 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.renewals_next_30_days || 0} due in 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary?.critical_risk || 0}</div>
            <p className="text-xs text-muted-foreground">
              Requires immediate attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Risk Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.avg_risk_score || 0}</div>
            <p className="text-xs text-muted-foreground">
              Out of 100
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.active_campaigns || 0}</div>
            <p className="text-xs text-muted-foreground">
              Running now
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Risk Distribution</CardTitle>
              <CardDescription>Breakdown of renewals by risk level</CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRecalculateAll}
              disabled={bulkCalculate.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${bulkCalculate.isPending ? 'animate-spin' : ''}`} />
              Recalculate All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              variant={selectedRiskLevel === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedRiskLevel('all')}
            >
              All ({summary?.total_renewals || 0})
            </Button>
            <Button
              variant={selectedRiskLevel === 'critical' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedRiskLevel('critical')}
            >
              Critical ({summary?.critical_risk || 0})
            </Button>
            <Button
              variant={selectedRiskLevel === 'high' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedRiskLevel('high')}
            >
              High ({summary?.high_risk || 0})
            </Button>
            <Button
              variant={selectedRiskLevel === 'medium' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedRiskLevel('medium')}
            >
              Medium ({summary?.medium_risk || 0})
            </Button>
            <Button
              variant={selectedRiskLevel === 'low' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedRiskLevel('low')}
            >
              Low ({summary?.low_risk || 0})
            </Button>
          </div>

          {/* Progress bar visualization */}
          {summary && summary.total_renewals > 0 && (
            <div className="w-full h-8 bg-cc-surface-raised rounded-lg overflow-hidden flex">
              {summary.critical_risk > 0 && (
                <div
                  className="bg-destructive flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(summary.critical_risk / summary.total_renewals * 100)}%` }}
                >
                  {summary.critical_risk}
                </div>
              )}
              {summary.high_risk > 0 && (
                <div
                  className="bg-warning flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(summary.high_risk / summary.total_renewals * 100)}%` }}
                >
                  {summary.high_risk}
                </div>
              )}
              {summary.medium_risk > 0 && (
                <div
                  className="bg-warning flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(summary.medium_risk / summary.total_renewals * 100)}%` }}
                >
                  {summary.medium_risk}
                </div>
              )}
              {summary.low_risk > 0 && (
                <div
                  className="bg-success flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${(summary.low_risk / summary.total_renewals * 100)}%` }}
                >
                  {summary.low_risk}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* At-Risk Renewals List */}
      <Card>
        <CardHeader>
          <CardTitle>At-Risk Renewals</CardTitle>
          <CardDescription>
            Renewals requiring attention ({filteredRenewals?.length || 0} showing)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renewalsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 w-full" />
              ))}
            </div>
          ) : filteredRenewals && filteredRenewals.length > 0 ? (
            <div className="space-y-4">
              {filteredRenewals.map(renewal => (
                <RenewalRiskCard key={renewal.id} renewal={renewal} />
              ))}
            </div>
          ) : (
            <Alert>
              <ThumbsUp className="h-4 w-4" />
              <AlertDescription>
                No at-risk renewals found{selectedRiskLevel !== 'all' ? ` for ${selectedRiskLevel} risk level` : ''}. Great job!
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
