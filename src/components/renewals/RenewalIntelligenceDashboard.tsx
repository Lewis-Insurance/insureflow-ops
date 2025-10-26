import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useRenewalsWithRisk, 
  useHighRiskRenewals, 
  useRenewalRiskAnalytics,
  useActiveRenewalCampaigns,
  useCalculateRenewalRisk,
  useBatchCalculateRenewalRisk
} from '@/hooks/useRenewalRisk';
import { 
  AlertTriangle, 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  RefreshCw,
  Phone,
  Mail,
  MessageSquare,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';

const RenewalIntelligenceDashboard = () => {
  const [selectedRenewal, setSelectedRenewal] = useState<string | null>(null);

  const { data: allRenewals, isLoading: loadingAll } = useRenewalsWithRisk();
  const { data: highRiskRenewals, isLoading: loadingHighRisk } = useHighRiskRenewals();
  const { data: analytics, isLoading: loadingAnalytics } = useRenewalRiskAnalytics();
  const { data: activeCampaigns, isLoading: loadingCampaigns } = useActiveRenewalCampaigns();

  const calculateRisk = useCalculateRenewalRisk();
  const batchCalculate = useBatchCalculateRenewalRisk();

  const handleCalculateRisk = async (renewalId: string) => {
    try {
      await calculateRisk.mutateAsync(renewalId);
      toast.success('Risk score calculated successfully');
    } catch (error) {
      toast.error('Failed to calculate risk score');
      console.error(error);
    }
  };

  const handleBatchCalculate = async () => {
    try {
      const result = await batchCalculate.mutateAsync(120);
      toast.success(`Processed ${result.results.successful} renewals successfully`);
      if (result.results.failed > 0) {
        toast.warning(`${result.results.failed} renewals failed to process`);
      }
    } catch (error) {
      toast.error('Batch calculation failed');
      console.error(error);
    }
  };

  const getRiskBadge = (riskLevel: string | null) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      critical: { variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
      high: { variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
      medium: { variant: 'default', icon: <TrendingUp className="h-3 w-3" /> },
      low: { variant: 'secondary', icon: <CheckCircle className="h-3 w-3" /> }
    };

    const config = variants[riskLevel || 'low'];
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {riskLevel?.toUpperCase() || 'LOW'}
      </Badge>
    );
  };

  const getDaysToRenewal = (renewalDate: string) => {
    return differenceInDays(new Date(renewalDate), new Date());
  };

  if (loadingAll || loadingAnalytics) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Renewal Intelligence</h1>
          <p className="text-muted-foreground">Proactive renewal management with AI-powered risk scoring</p>
        </div>
        <Button
          onClick={handleBatchCalculate}
          disabled={batchCalculate.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${batchCalculate.isPending ? 'animate-spin' : ''}`} />
          Recalculate All Risk Scores
        </Button>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Renewals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Next 120 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {analytics?.at_risk_count || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              High/Critical risk level
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Premium at Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${(analytics?.at_risk_premium || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Potential churn value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Avg Risk Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.avg_risk_score || 0}</div>
            <p className="text-xs text-muted-foreground">Out of 100</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Distribution</CardTitle>
          <CardDescription>Breakdown of renewals by risk level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-destructive">
                {analytics?.by_level.critical || 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Critical</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-orange-600">
                {analytics?.by_level.high || 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">High</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-yellow-600">
                {analytics?.by_level.medium || 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Medium</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-3xl font-bold text-green-600">
                {analytics?.by_level.low || 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Low</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="high-risk" className="space-y-4">
        <TabsList>
          <TabsTrigger value="high-risk">High Risk Renewals</TabsTrigger>
          <TabsTrigger value="all-renewals">All Renewals</TabsTrigger>
          <TabsTrigger value="campaigns">Active Campaigns</TabsTrigger>
        </TabsList>

        {/* High Risk Renewals Tab */}
        <TabsContent value="high-risk" className="space-y-4">
          {loadingHighRisk ? (
            <div>Loading high-risk renewals...</div>
          ) : highRiskRenewals && highRiskRenewals.length > 0 ? (
            <div className="space-y-4">
              {highRiskRenewals.map((renewal) => (
                <Card key={renewal.id} className="border-l-4 border-l-destructive">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">
                          {renewal.account?.name || 'Unknown Account'}
                        </CardTitle>
                        <CardDescription>
                          {renewal.policy_type} • {renewal.carrier || 'No carrier'}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRiskBadge(renewal.risk_level)}
                        <Badge variant="outline">Score: {renewal.risk_score}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Key Info */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Renewal Date</div>
                        <div className="font-medium flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(renewal.renewal_date), 'MMM dd, yyyy')}
                          <span className="text-muted-foreground ml-1">
                            ({getDaysToRenewal(renewal.renewal_date)} days)
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Premium</div>
                        <div className="font-medium flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />
                          {renewal.renewal_premium?.toLocaleString() || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Assigned To</div>
                        <div className="font-medium">
                          {renewal.assigned?.full_name || 'Unassigned'}
                        </div>
                      </div>
                    </div>

                    {/* Risk Factors */}
                    {renewal.risk_factors && renewal.risk_factors.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="font-medium mb-2">Risk Factors:</div>
                          <ul className="list-disc list-inside space-y-1">
                            {renewal.risk_factors.map((factor, idx) => (
                              <li key={idx} className="text-sm">
                                {factor.details} 
                                <Badge variant="outline" className="ml-2">
                                  +{factor.points} pts
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2">
                      <Button size="sm" variant="default" className="gap-2">
                        <Phone className="h-4 w-4" />
                        Call Now
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Mail className="h-4 w-4" />
                        Send Email
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Send SMS
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCalculateRisk(renewal.id)}
                        disabled={calculateRisk.isPending}
                        className="gap-2 ml-auto"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Recalculate
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
                  <p className="text-muted-foreground">No high-risk renewals found</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* All Renewals Tab */}
        <TabsContent value="all-renewals" className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="space-y-3">
                {allRenewals?.slice(0, 20).map((renewal) => (
                  <div
                    key={renewal.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{renewal.account?.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {renewal.policy_type} • Renews {format(new Date(renewal.renewal_date), 'MMM dd, yyyy')}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-medium">
                          ${renewal.renewal_premium?.toLocaleString() || 'N/A'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {getDaysToRenewal(renewal.renewal_date)} days
                        </div>
                      </div>
                      {getRiskBadge(renewal.risk_level)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          {loadingCampaigns ? (
            <div>Loading campaigns...</div>
          ) : activeCampaigns && activeCampaigns.length > 0 ? (
            <div className="space-y-4">
              {activeCampaigns.map((campaign: any) => (
                <Card key={campaign.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {campaign.renewal?.account?.name || 'Unknown'}
                        </CardTitle>
                        <CardDescription>
                          {campaign.campaign_type.replace('_', ' ').toUpperCase()} Campaign
                        </CardDescription>
                      </div>
                      <Badge>{campaign.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between text-sm">
                        <span>Progress</span>
                        <span className="font-medium">
                          {campaign.completed_touchpoints} / {campaign.total_touchpoints} touchpoints
                        </span>
                      </div>
                      <div className="w-full bg-secondary h-2 rounded-full">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{
                            width: `${(campaign.completed_touchpoints / campaign.total_touchpoints) * 100}%`
                          }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Started</div>
                          <div className="font-medium">
                            {format(new Date(campaign.start_date), 'MMM dd, yyyy')}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Days to Renewal</div>
                          <div className="font-medium">{campaign.days_before_renewal}</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <div className="text-center">
                  <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No active campaigns</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RenewalIntelligenceDashboard;
